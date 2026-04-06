import asyncio
import time
import json
import random
import logging
import os
import shutil
import socket
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from ais_logic import AisStreamManager

from config import PORT, UDP_PORT, MOCK_MODE, LOG_LEVEL, DB_PATH, IMAGES_DIR, DATA_DIR, BASE_DIR
from utils.db import db_session
from utils.settings import get_all_settings, set_setting, is_true
from utils.stats import stats_collector
from utils.images import set_image_broadcast_callback
from core.mqtt import init_mqtt, restart_mqtt, restart_mqtt_pub, mqtt_connected
from core.ais_processor import init_ais_processor
from core.tasks import init_tasks, ais_processing_worker, enrichment_worker, cleanup_history_task, purge_job, coverage_24h_reset_job, restart_aisstream
from core.mqtt import mqtt_stats_reporter

from routes.vessel_routes import setup_vessel_routes
from routes.stats_routes import setup_stats_routes
from routes.system_routes import setup_system_routes
from routes.debug_routes import setup_debug_routes

logger = logging.getLogger("NavisCore")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(IMAGES_DIR, exist_ok=True)
app.mount("/images", StaticFiles(directory=IMAGES_DIR), name="images")

connected_clients = set()
ais_queue = asyncio.Queue(maxsize=5000)
udp_server_transport = None
forwarding_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

async def broadcast(data: dict):
    if not connected_clients:
        return
    msg = json.dumps(data)
    to_remove = set()
    for client in list(connected_clients):
        try:
            await client.send_text(msg)
        except Exception:
            to_remove.add(client)
    for client in to_remove:
        if client in connected_clients:
            connected_clients.remove(client)

# Initialize callbacks for modules that need to send WS messages
set_image_broadcast_callback(broadcast)
init_mqtt(broadcast, ais_queue)
init_ais_processor(broadcast)
init_tasks(ais_queue)

async def mock_mode_loop():
    mock_lat, mock_lon = 59.3293, 18.0686
    while True:
        if MOCK_MODE:
            mock_lat += (random.random()-0.5)*0.001; mock_lon += (random.random()-0.5)*0.001
            await broadcast({"mmsi": "265123456", "name": "PYTHON GHOST", "lat": mock_lat, "lon": mock_lon, "sog": 5.2, "cog": random.random()*360, "timestamp": int(datetime.now().timestamp()*1000)})
        await asyncio.sleep(2)

class UDPProtocol(asyncio.DatagramProtocol):
    def __init__(self, initial_settings=None):
        self.settings = initial_settings or {}
        self.stream_manager = AisStreamManager()
        self.stream_manager.on_decode(self.handle_parsed_custom)
        
    def connection_made(self, transport):
        self.transport = transport
        logger.info(f"UDP connection established to {transport.get_extra_info('socket').getsockname()}")

    def handle_parsed_custom(self, d):
        d["source"] = "udp"
        try:
            ais_queue.put_nowait(d)
        except asyncio.QueueFull:
            logger.warning("AIS queue full! UDP message dropped.")

    def datagram_received(self, data, addr):
        logger.debug(f"UDP packet received from {addr}: {len(data)} bytes")

        if MOCK_MODE: 
            logger.debug("MOCK_MODE is ON - dropping UDP packet")
            return
        try:
            msg = data.decode('utf-8', errors='ignore').strip()
        except Exception as e:
            logger.error(f"UDP decode error: {e}")
            return

            
        now_ms = int(datetime.now().timestamp() * 1000)
        lines = msg.splitlines()
        for line in lines:
            line = line.strip()
            if line:
                asyncio.create_task(broadcast({"type": "nmea", "raw": line, "timestamp": now_ms}))
                self.stream_manager.process_sentence(line)
        
        if self.settings.get("forward_enabled") == "true":
            f_ip, f_p = self.settings.get("forward_ip"), self.settings.get("forward_port")
            if f_ip and f_p:
                try: forwarding_socket.sendto(data, (f_ip, int(f_p)))
                except Exception: pass

async def start_udp_listener():
    global udp_server_transport
    loop = asyncio.get_running_loop()
    settings = await get_all_settings()
    port = int(settings.get("udp_port", str(UDP_PORT)))
    
    if udp_server_transport:
        logger.info("Closing existing UDP server transport")
        udp_server_transport.close()
        udp_server_transport = None
        await asyncio.sleep(0.5)
        
    if settings.get("udp_enabled", "true") == "true":
        attempts = 0
        while attempts < 3:
            try:
                transport, _ = await loop.create_datagram_endpoint(
                    lambda: UDPProtocol(settings),
                    local_addr=('0.0.0.0', port),
                    reuse_port=(os.name != 'nt')
                )
                udp_server_transport = transport
                logger.info(f"UDP server started on port {port} (reuse_port=True)")
                break
            except Exception as e:
                attempts += 1
                logger.warning(f"Failed to start UDP listener (attempt {attempts}/3) on port {port}: {e}")
                if attempts < 3:
                    await asyncio.sleep(1.5)
                else:
                    logger.error(f"Permanent failure starting UDP listener on port {port}")


# Helpers for system_routes
def trigger_mqtt_restart():
    restart_mqtt()

def trigger_mqtt_pub_restart():
    restart_mqtt_pub()

def trigger_aisstream_restart():
    asyncio.create_task(restart_aisstream())

def trigger_udp_restart():
    asyncio.create_task(start_udp_listener())

def udp_transport_getter():
    return udp_server_transport

app.include_router(setup_vessel_routes(db_session, get_all_settings, broadcast, IMAGES_DIR))
app.include_router(setup_stats_routes(db_session))
app.include_router(setup_system_routes(
    db_session, get_all_settings, set_setting, broadcast, stats_collector, 
    start_udp_listener, trigger_aisstream_restart, trigger_mqtt_pub_restart, trigger_mqtt_restart,
    DB_PATH, DATA_DIR, IMAGES_DIR, MOCK_MODE, is_true, udp_transport_getter
))
app.include_router(setup_debug_routes(ais_queue, broadcast))



@app.websocket("/ws")
@app.websocket("/")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept(); connected_clients.add(websocket)
    try:
        await websocket.send_text(json.dumps({"type": "status", "message": "Connected"}))
        await websocket.send_text(json.dumps({"type": "mqtt_status", "connected": mqtt_connected}))
        while True: await websocket.receive_text()
    except: 
        if websocket in connected_clients:
            connected_clients.remove(websocket)

@app.on_event("startup")
async def startup_event():
    logger.info(f"NavisCore starting up... MOCK_MODE={MOCK_MODE}, DB_PATH={DB_PATH}, UDP_PORT={UDP_PORT}")
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

    if not os.path.exists(os.path.join(IMAGES_DIR, "0.jpg")) and os.path.exists("/app/backend/static/0.jpg"):
        shutil.copy2("/app/backend/static/0.jpg", os.path.join(IMAGES_DIR, "0.jpg"))
    async with db_session() as db:
        await db.execute('CREATE TABLE IF NOT EXISTS ships (mmsi TEXT PRIMARY KEY, imo TEXT, name TEXT, callsign TEXT, type INTEGER, image_url TEXT, image_fetched_at DATETIME, last_seen DATETIME DEFAULT CURRENT_TIMESTAMP, session_start DATETIME DEFAULT CURRENT_TIMESTAMP)')
        for c in ["ais_channel TEXT", "previous_seen DATETIME", "manual_image BOOLEAN DEFAULT 0", "is_meteo BOOLEAN DEFAULT 0", "is_aton BOOLEAN DEFAULT 0", "is_sar BOOLEAN DEFAULT 0", "is_base_station BOOLEAN DEFAULT 0", "is_vessel BOOLEAN DEFAULT 1", "aton_type INTEGER", "aton_type_text TEXT", "is_emergency BOOLEAN DEFAULT 0", "emergency_type TEXT", "virtual_aton BOOLEAN DEFAULT 0", "is_advanced_binary BOOLEAN DEFAULT 0", "dac INTEGER", "fid INTEGER", "raw_payload TEXT", "heading REAL", "length REAL", "width REAL", "message_count INTEGER DEFAULT 0", "registration_count INTEGER DEFAULT 1", "eta TEXT", "rot REAL", "status_text TEXT", "country_code TEXT", "destination TEXT", "draught REAL", "latitude REAL", "longitude REAL", "sog REAL", "cog REAL", "source TEXT DEFAULT 'local'", "wind_speed REAL", "wind_gust REAL", "wind_direction REAL", "water_level REAL", "air_temp REAL", "air_pressure REAL", "altitude INTEGER", "session_start DATETIME", "mqtt_new_sent BOOLEAN DEFAULT 0", "mqtt_ignore BOOLEAN DEFAULT 0", "mqtt_send_new BOOLEAN DEFAULT 1"]:
            try: await db.execute(f"ALTER TABLE ships ADD COLUMN {c}")
            except Exception: pass
        await db.execute('CREATE TABLE IF NOT EXISTS ship_history (mmsi TEXT, latitude REAL, longitude REAL, timestamp INTEGER)')
        await db.execute("CREATE INDEX IF NOT EXISTS idx_ship_history_mmsi_ts ON ship_history (mmsi, timestamp)")
        await db.execute('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)')
        for k, v in [
            ('history_duration', '60'), ('show_names_on_map', 'true'), ('units', 'nautical'), 
            ('ship_size', '1.0'), ('circle_size', '1.0'), ('trail_size', '2.0'), 
            ('aisstream_enabled', 'false'), ('aisstream_api_key', ''), 
            ('aisstream_sw_lat', '56.5'), ('aisstream_sw_lon', '15.5'), 
            ('aisstream_ne_lat', '60.0'), ('aisstream_ne_lon', '21.0'), 
            ('trail_mode', 'all'), ('show_aisstream_on_map', 'true'), 
            ('sdr_enabled', 'true'), ('udp_enabled', 'true'), ('udp_port', str(UDP_PORT)),
            ('mqtt_pub_enabled', os.getenv("MQTT_PUB_ENABLED", "false").lower()),
            ('mqtt_pub_url', os.getenv("MQTT_PUB_URL", os.getenv("MQTT_BROKER", ""))),
            ('mqtt_pub_topic', os.getenv("MQTT_PUB_TOPIC", os.getenv("MQTT_TOPIC", "naviscore/objects"))),
            ('mqtt_pub_user', os.getenv("MQTT_PUB_USER", os.getenv("MQTT_USER", ""))),
            ('mqtt_pub_pass', os.getenv("MQTT_PUB_PASS", os.getenv("MQTT_PASS", ""))),
            ('mqtt_pub_only_new', os.getenv("MQTT_PUB_ONLY_NEW", "false").lower()),
            ('mqtt_pub_new_topic', os.getenv("MQTT_PUB_NEW_TOPIC", "naviscore/new_detected")),
            ('mqtt_pub_wait_for_name', 'false'),
            ('mqtt_pub_forward_udp', 'true'),
            ('new_vessel_threshold', '5'),
            ('ollama_enabled', 'true'),
            ('ollama_url', 'http://192.168.1.239:11434/api/generate'),
            ('ollama_api_type', 'native'),
            ('ollama_model', 'gemma4-nothink2:latest'),
            ('ollama_prompt', "You are a maritime assistant. Based on this AIS data for a vessel in JSON format, write a short information sentence (max 2 sentences) in English.\n\nInclude details such as:\n- Nationality/Home country based on 'country_adjective' and 'country_code'. Put the country code in parentheses after the country name.\n- Vessel type {ship_type_label} and Status '{status_text}'\n- Name {name} and MMSI {mmsi}\n- Destination {destination}, Speed {sog} and Position {lat}, {lon}\n- When the vessel was last seen. Today's date is {current_date}. Base it on {last_seen_relative}.\n\nRespond only with the information sentence, skip introductions like 'Here is...'.")
        ]:

            await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))
        await db.execute('CREATE TABLE IF NOT EXISTS coverage_sectors (sector_id INTEGER PRIMARY KEY, range_km_24h REAL DEFAULT 0.0, range_km_alltime REAL DEFAULT 0.0, last_updated DATETIME)')
        await db.execute('CREATE TABLE IF NOT EXISTS daily_stats (date TEXT PRIMARY KEY, unique_ships INTEGER DEFAULT 0, new_ships INTEGER DEFAULT 0, total_messages INTEGER DEFAULT 0, max_range_km REAL DEFAULT 0.0)')
        for c in ["new_ships INTEGER DEFAULT 0", "shiptype_json TEXT"]:
            try: await db.execute(f"ALTER TABLE daily_stats ADD COLUMN {c}")
            except Exception: pass
        await db.execute('CREATE TABLE IF NOT EXISTS daily_mmsi (date TEXT, mmsi TEXT, PRIMARY KEY (date, mmsi))')
        await db.execute('CREATE TABLE IF NOT EXISTS hourly_stats (date TEXT, hour INTEGER, message_count INTEGER DEFAULT 0, PRIMARY KEY (date, hour))')
        await db.execute('CREATE TABLE IF NOT EXISTS minute_stats (time_min TEXT PRIMARY KEY, unique_ships INTEGER DEFAULT 0, total_messages INTEGER DEFAULT 0)')
        await db.execute('CREATE TABLE IF NOT EXISTS minute_mmsi (time_min TEXT, mmsi TEXT, PRIMARY KEY (time_min, mmsi))')
        await db.execute('CREATE TABLE IF NOT EXISTS sector_history (sector_id INTEGER, distance_km REAL, timestamp INTEGER)')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_sector_history_ts ON sector_history (timestamp)')
        await db.execute('CREATE TABLE IF NOT EXISTS safety_alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, mmsi TEXT NOT NULL, dest_mmsi TEXT, text TEXT, is_broadcast BOOLEAN DEFAULT 0, msg_type INTEGER, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, dismissed BOOLEAN DEFAULT 0)')
        await db.execute('CREATE TABLE IF NOT EXISTS channel_stats (channel_id TEXT PRIMARY KEY, max_range_km REAL DEFAULT 0.0, last_seen DATETIME DEFAULT CURRENT_TIMESTAMP, mmsi TEXT, name TEXT, ship_type INTEGER, msg_type INTEGER)')
        for col in [("mmsi", "TEXT"), ("name", "TEXT"), ("ship_type", "INTEGER"), ("msg_type", "INTEGER")]:
            try: await db.execute(f"ALTER TABLE channel_stats ADD COLUMN {col[0]} {col[1]}")
            except Exception: pass
            
        await db.execute("UPDATE ships SET is_meteo = 0 WHERE is_meteo = 1 AND type >= 20")
        
        await db.commit()
    
    asyncio.create_task(cleanup_history_task())
    asyncio.create_task(restart_aisstream())
    asyncio.create_task(enrichment_worker())
    asyncio.create_task(mqtt_stats_reporter())
    asyncio.create_task(ais_processing_worker())
    asyncio.create_task(start_udp_listener())
    restart_mqtt()
    restart_mqtt_pub()
    asyncio.create_task(mock_mode_loop())
    asyncio.create_task(purge_job())
    asyncio.create_task(coverage_24h_reset_job())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, log_level=LOG_LEVEL.lower(), access_log=False)
