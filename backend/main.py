import asyncio
import time
import json
import random
import logging
import os
import shutil
import httpx
import aiosqlite
import aiomqtt
import socket
import math
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from ais_logic import AisStreamManager, get_ship_type_name, get_ship_category
from dotenv import load_dotenv

load_dotenv()

# Configuration
PORT = int(os.getenv("PORT", 8080))
UDP_PORT = int(os.getenv("UDP_PORT", 10110))
MOCK_MODE = os.getenv("MOCK_MODE", "false").lower() == "true"
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

logging.basicConfig(level=getattr(logging, LOG_LEVEL))
logger = logging.getLogger("NavisCore")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
IMAGES_DIR = os.path.join(DATA_DIR, "images")
DB_PATH = os.path.join(DATA_DIR, "naviscore.db")

os.makedirs(IMAGES_DIR, exist_ok=True)
app.mount("/images", StaticFiles(directory=IMAGES_DIR), name="images")

# Globals
connected_clients = set()
mqtt_client_task = None
mqtt_connected = False
active_lookups = set()
forwarding_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
udp_server_transport = None
# Tracking local vessels for AisStream deduplication. Key: MMSI, Value: last_seen timestamp
local_vessels = {}
aisstream_task = None

# Enrichment Queue for ship images to avoid rate limiting
enrichment_queue = asyncio.Queue()
queued_mmsis = set()

# Database helper
@asynccontextmanager
async def db_session():
    async with aiosqlite.connect(DB_PATH, timeout=30.0) as db:
        # Attempt to use WAL mode for better concurrency
        try:
            await db.execute('PRAGMA journal_mode=WAL')
        except Exception:
            pass
        await db.execute('PRAGMA busy_timeout=30000')
        yield db

# Settings Helpers
async def cleanup_history_task():
    """Background task to remove history entries older than 24 hours"""
    while True:
        try:
            async with db_session() as db:
                cutoff = int(datetime.now().timestamp() * 1000) - (24 * 3600 * 1000)
                await db.execute('DELETE FROM ship_history WHERE timestamp < ?', (cutoff,))
                await db.commit()
                logger.info("Cleaned up old ship history entries")
        except Exception as e:
            logger.error(f"Error in cleanup_history_task: {e}")
        await asyncio.sleep(3600)

async def get_setting(key: str, default_val: str = "", db: aiosqlite.Connection = None) -> str:
    if db:
        async with db.execute('SELECT value FROM settings WHERE key = ?', (key,)) as cursor:
            row = await cursor.fetchone()
            return row[0] if row else default_val
    async with db_session() as ds:
        async with ds.execute('SELECT value FROM settings WHERE key = ?', (key,)) as cursor:
            row = await cursor.fetchone()
            return row[0] if row else default_val

async def set_setting(key: str, value: str, db: aiosqlite.Connection = None):
    if db:
        await db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', (key, str(value)))
        await db.commit()
        return
    async with db_session() as ds:
        await ds.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', (key, str(value)))
        await ds.commit()

async def get_all_settings(db: aiosqlite.Connection = None):
    # If db is provided, use it, otherwise open a temporary one
    if db:
        return await _get_all_settings_internal(db)
    async with db_session() as ds:
        return await _get_all_settings_internal(ds)

async def _get_all_settings_internal(db: aiosqlite.Connection):
    settings = {}
    async with db.execute('SELECT key, value FROM settings') as cursor:
        async for row in cursor:
            settings[row[0]] = row[1]
    
    # Fill in defaults for missing keys
    defaults = {
        "mqtt_enabled": "false", "mqtt_url": "", "mqtt_topic": "ais", "mqtt_user": "", "mqtt_pass": "",
        "forward_enabled": "false", "forward_ip": "", "forward_port": "",
        "ship_timeout": "60", "origin_lat": "", "origin_lon": "",
        "show_range_rings": "true", "map_style": "light", "base_layer": "standard",
        "range_type": "24h", "history_duration": "60", "show_names_on_map": "true",
        "trail_color": "#ff4444", "trail_opacity": "0.6", "trail_enabled": "true",
        "sdr_ppm": "0", "sdr_gain": "auto", "ship_size": "1.0", "circle_size": "1.0",
        "trail_size": "1.0", "aisstream_enabled": "false", "aisstream_api_key": os.getenv("AISSTREAM_API_KEY", ""),
        "include_aisstream_in_range": "false", "trail_mode": "all", "show_aisstream_on_map": "true",
        "sdr_enabled": "true", "udp_enabled": "true", "udp_port": str(UDP_PORT),
    }
    for k, v in defaults.items():
        if k not in settings:
            settings[k] = v
    return settings

async def broadcast(data: dict):
    if not connected_clients:
        return
    msg = json.dumps(data)
    to_remove = set()
    for client in connected_clients:
        try:
            await client.send_text(msg)
        except Exception:
            to_remove.add(client)
    for client in to_remove:
        connected_clients.remove(client)

def translate_aisstream_message(msg: dict) -> dict:
    try:
        msg_type_str = msg.get("MessageType")
        meta = msg.get("MetaData", {})
        body = msg.get("Message", {}).get(msg_type_str, {})
        mmsi = meta.get("MMSI")
        if not mmsi: return None
        type_map = {
            "PositionReport": 1,
            "ShipStaticData": 5,
            "AidsToNavigationReport": 21,
            "StandardSearchAndRescueAircraftReport": 9,
            "SafetyBroadcastMessage": 14
        }
        internal_data = {
            "mmsi": mmsi,
            "type": type_map.get(msg_type_str, 0),
            "name": meta.get("ShipName", "").strip(),
            "lat": body.get("Latitude"),
            "lon": body.get("Longitude"),
            "speed": body.get("Sog") or body.get("SpeedOverGround"),
            "course": body.get("Cog") or body.get("CourseOverGround"),
            "heading": body.get("TrueHeading"),
            "source": "aisstream"
        }
        if msg_type_str == "AidsToNavigationReport":
            internal_data["is_aton"] = True
        elif msg_type_str == "StandardSearchAndRescueAircraftReport":
            internal_data["is_sar"] = True
        elif msg_type_str == "SafetyBroadcastMessage":
            internal_data["is_safety"] = True
            internal_data["safety_text"] = body.get("Text", "")
            internal_data["is_broadcast_alert"] = True
        return internal_data
    except Exception as e:
        logger.error(f"Error translating AisStream message: {e}")
        return None

async def restart_aisstream():
    global aisstream_task
    if aisstream_task:
        logger.info("Cancelling existing AisStream task...")
        aisstream_task.cancel()
        try: await aisstream_task
        except asyncio.CancelledError: pass
    aisstream_task = asyncio.create_task(aisstream_loop())
    logger.info("New AisStream task started.")

async def aisstream_loop():
    import websockets
    logger.info("AisStream.io background task started.")
    try:
        while True:
            try:
                settings = await get_all_settings()
                enabled = settings.get("aisstream_enabled") == "true"
                api_key = settings.get("aisstream_api_key")
                if not enabled or not api_key:
                    await asyncio.sleep(15)
                    continue
                
                # Get dynamic bounding box
                try:
                    sw_lat = float(settings.get("aisstream_sw_lat", "56.5"))
                    sw_lon = float(settings.get("aisstream_sw_lon", "15.5"))
                    ne_lat = float(settings.get("aisstream_ne_lat", "60.0"))
                    ne_lon = float(settings.get("aisstream_ne_lon", "21.0"))
                except (ValueError, TypeError):
                    sw_lat, sw_lon, ne_lat, ne_lon = 56.5, 15.5, 60.0, 21.0

                url = "wss://stream.aisstream.io/v0/stream"
                logger.info(f"Connecting to AisStream.io with BBox: SW({sw_lat},{sw_lon}) NE({ne_lat},{ne_lon})")
                async with websockets.connect(url, ping_interval=20, ping_timeout=20) as ws:
                    sub_msg = {
                        "APIKey": api_key,
                        "BoundingBoxes": [[[sw_lat, sw_lon], [ne_lat, ne_lon]]],
                        "FiltersShipMMSI": [],
                        "FilterMessageTypes": ["PositionReport", "ShipStaticData", "AidsToNavigationReport", "StandardSearchAndRescueAircraftReport", "SafetyBroadcastMessage"]
                    }
                    await ws.send(json.dumps(sub_msg))
                    logger.info("AisStream.io subscription sent successfully.")
                    async for message in ws:
                        try:
                            msg_json = json.loads(message)
                            translated = translate_aisstream_message(msg_json)
                            if translated:
                                asyncio.create_task(process_ais_data(translated))
                        except Exception as inner_e:
                            logger.error(f"Error processing AisStream message: {inner_e}")
            except Exception as e:
                logger.error(f"AisStream.io loop error: {e}")
                await asyncio.sleep(10)
    except asyncio.CancelledError:
        logger.info("AisStream.io task cancelled.")

def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371.0
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = math.sin(dLat/2) * math.sin(dLat/2) + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon/2) * math.sin(dLon/2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def calculate_bearing(lat1, lon1, lat2, lon2):
    rlat1 = math.radians(lat1)
    rlat2 = math.radians(lat2)
    rdlon = math.radians(lon2 - lon1)
    y = math.sin(rdlon) * math.cos(rlat2)
    x = math.cos(rlat1) * math.sin(rlat2) - math.sin(rlat1) * math.cos(rlat2) * math.cos(rdlon)
    theta = math.atan2(y, x)
    return (math.degrees(theta) + 360) % 360

def get_country_code_from_mmsi(mmsi_str: str) -> str:
    if not mmsi_str or len(mmsi_str) < 3: return None
    mid = mmsi_str[:3]
    mid_map = {
        "201": "al", "202": "ad", "203": "at", "204": "pt", "205": "be", "206": "by", "207": "bg", "208": "va",
        "209": "cy", "210": "cy", "212": "cy", "229": "mt", "215": "mt", "248": "mt", "249": "mt", "256": "mt",
        "211": "de", "218": "de", "213": "ge", "214": "md", "216": "am", "219": "dk", "220": "dk", "231": "fo",
        "224": "es", "225": "es", "226": "fr", "227": "fr", "228": "fr", "230": "fi", "232": "gb", "233": "gb",
        "234": "gb", "235": "gb", "236": "gi", "237": "gr", "239": "gr", "240": "gr", "241": "gr", "238": "hr",
        "242": "ma", "243": "hu", "244": "nl", "245": "nl", "246": "nl", "247": "it", "250": "ie", "251": "is",
        "252": "li", "253": "lu", "254": "mc", "255": "pt", "257": "no", "258": "no", "259": "no", "261": "pl",
        "262": "me", "263": "pt", "264": "ro", "265": "se", "266": "se", "267": "sk", "268": "sm", "269": "ch",
        "270": "cz", "271": "tr", "272": "ua", "273": "ru", "274": "mk", "275": "lv", "276": "ee", "277": "lt",
        "278": "si", "279": "rs", "301": "ai", "303": "us", "304": "ag", "305": "ag", "306": "bq", "307": "aw", 
        "308": "bs", "309": "bs", "311": "bs", "310": "bm", "312": "bz", "314": "bb", "316": "ca", "319": "ky", 
        "321": "cr", "323": "cu", "325": "dm", "327": "do", "329": "gp", "330": "gd", "331": "gl", "332": "gt", 
        "334": "hn", "336": "ht", "338": "us", "366": "us", "367": "us", "368": "us", "369": "us", "339": "jm", 
        "341": "kn", "343": "lc", "345": "mx", "347": "mq", "348": "ms", "350": "ni", "351": "pa", "352": "pa", 
        "353": "pa", "354": "pa", "355": "pa", "356": "pa", "357": "pa", "370": "pa", "371": "pa", "372": "pa", 
        "373": "pa", "358": "pr", "359": "sv", "361": "pm", "362": "tt", "378": "vg", "379": "vi", "401": "af", 
        "405": "bd", "408": "bh", "410": "bt", "412": "cn", "413": "cn", "414": "cn", "416": "cn", "417": "ck", 
        "418": "fj", "419": "pf", "421": "in", "423": "az", "427": "ir", "428": "iq", "431": "jp", "432": "jp", 
        "434": "jp", "436": "jp", "437": "kr", "438": "kp", "440": "mo", "441": "my", "443": "mv", "445": "mu", 
        "447": "mn", "449": "mm", "451": "np", "453": "om", "455": "pk", "457": "ph", "459": "qa", "461": "sa", 
        "463": "sg", "466": "lk", "468": "sy", "470": "tw", "471": "th", "473": "tl", "475": "ae", "477": "vn", 
        "478": "ba", "501": "tf", "503": "au", "508": "bn", "514": "kh", "515": "kh", "536": "mp", "559": "as",
        "601": "za", "603": "ao", "605": "dz", "608": "sh", "609": "bi", "610": "bj", "611": "bw", "613": "cm",
        "616": "km", "617": "cv", "618": "cf", "619": "td", "620": "cg", "621": "dj", "622": "eg", "624": "et",
        "625": "er", "626": "gq", "627": "ga", "629": "gm", "630": "gh", "631": "gn", "632": "gw", "633": "bf",
        "634": "ke", "635": "ls", "636": "lr", "637": "ly", "642": "mg", "644": "mw", "645": "ml", "647": "mr",
        "649": "mu", "650": "mz", "654": "na", "655": "ne", "656": "ng", "657": "rw", "659": "sn", "660": "sc",
        "661": "sl", "662": "so", "663": "sd", "664": "sz", "665": "tz", "666": "tg", "667": "tn", "668": "ug",
        "669": "cd", "670": "zm", "671": "zw", "672": "na", "674": "tz", "675": "et", "676": "so", "677": "tz",
        "678": "st", "679": "ci", "701": "ar", "710": "br", "720": "bo", "725": "cl", "730": "co", "735": "ec", 
        "740": "fk", "745": "gy", "750": "py", "755": "pe", "760": "sr", "765": "uy", "770": "ve"
    }
    return mid_map.get(mid)

async def handle_fallback_image(mmsi: str):
    source_file = os.path.join(IMAGES_DIR, '0.jpg')
    if os.path.exists(source_file):
        try:
            async with db_session() as db:
                await db.execute('UPDATE ships SET image_url = ? WHERE mmsi = ?', ("/images/0.jpg", mmsi))
                await db.commit()
        except Exception as err:
            logger.error(f"[Enrichment] Failed to update fallback for {mmsi}: {err}")

async def try_minglarn_image(mmsi: str) -> bool:
    image_url = f"https://minglarn.se/minglarn/php/ais_images/vessel_info_{mmsi}.jpg"
    local_path = os.path.join(IMAGES_DIR, f"{mmsi}.jpg")
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10.0) as client:
            try:
                res = await client.get(image_url, headers=headers)
            except Exception:
                async with httpx.AsyncClient(follow_redirects=True, verify=False, timeout=10.0) as insecure_client:
                    res = await insecure_client.get(image_url, headers=headers)
            if res.status_code == 200 and res.headers.get('content-type', '').startswith('image/'):
                with open(local_path, "wb") as f: f.write(res.content)
                async with db_session() as db:
                    await db.execute('UPDATE ships SET image_url = ? WHERE mmsi = ?', (f"/images/{mmsi}.jpg", mmsi))
                    await db.commit()
                return True
    except Exception as e: logger.error(f"[Enrichment] Minglarn fetch error for {mmsi}: {e}")
    return False

async def try_marinetraffic_image(mmsi: str) -> bool:
    image_url = f"https://photos.marinetraffic.com/ais/showphoto.aspx?mmsi={mmsi}"
    local_path = os.path.join(IMAGES_DIR, f"{mmsi}.jpg")
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10.0, verify=False) as client:
            res = await client.get(image_url, headers=headers)
            if res.status_code == 200 and res.headers.get('content-type', '').startswith('image/'):
                with open(local_path, "wb") as f: f.write(res.content)
                async with db_session() as db:
                    await db.execute('UPDATE ships SET image_url = ? WHERE mmsi = ?', (f"/images/{mmsi}.jpg", mmsi))
                    await db.commit()
                return True
    except Exception as e: logger.error(f"[Enrichment] MarineTraffic error for {mmsi}: {str(e)}")
    return False

async def enrich_ship_data(mmsi: str):
    if mmsi in active_lookups: return
    active_lookups.add(mmsi)
    try:
        async with db_session() as db:
            async with db.execute('SELECT image_fetched_at, image_url, manual_image FROM ships WHERE mmsi = ?', (mmsi,)) as cursor:
                row = await cursor.fetchone()
                if row and row[2]: active_lookups.remove(mmsi); return
                if row and row[0]:
                    fetch_date = datetime.strptime(row[0], "%Y-%m-%d %H:%M:%S")
                    if row[1] and row[1] != "/images/0.jpg":
                        if (datetime.now() - fetch_date).days < 30: active_lookups.remove(mmsi); return
                    else:
                        if (datetime.now() - fetch_date).days < 1: active_lookups.remove(mmsi); return
            await db.execute('INSERT OR IGNORE INTO ships (mmsi, image_fetched_at, last_seen) VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)', (mmsi,))
            await db.execute('UPDATE ships SET image_fetched_at = CURRENT_TIMESTAMP WHERE mmsi = ?', (mmsi,))
            await db.commit()
        
        async with httpx.AsyncClient() as client:
            res = await client.get(f"https://www.myshiptracking.com/requests/autocomplete.php?type=1&site=1&q={mmsi}", headers={'User-Agent': 'Mozilla/5.0'}, timeout=10.0)
            try:
                data = res.json() if res.status_code == 200 else []
            except Exception:
                data = []
            has_image = False
            if data and isinstance(data, list) and len(data) > 0:
                ship = data[0]
                portrait_id = ship.get("PORTRAIT")
                if portrait_id and portrait_id != '0':
                    img_res = await client.get(f"https://static.myshiptracking.com/images/vessels/small/{portrait_id}.jpg", timeout=10.0)
                    if img_res.status_code == 200:
                        with open(os.path.join(IMAGES_DIR, f"{mmsi}.jpg"), "wb") as f: f.write(img_res.content)
                        async with db_session() as db:
                            await db.execute('UPDATE ships SET image_url = ? WHERE mmsi = ?', (f"/images/{mmsi}.jpg", mmsi))
                            await db.commit()
                        has_image = True
            if not has_image:
                if not await try_minglarn_image(mmsi):
                    await asyncio.sleep(2); await try_marinetraffic_image(mmsi) or await handle_fallback_image(mmsi)
    except Exception as e: logger.error(f"[Enrichment] Error for {mmsi}: {e}")
    finally:
        if mmsi in active_lookups: active_lookups.remove(mmsi)

async def enrichment_worker():
    logger.info("Enrichment worker started.")
    while True:
        try:
            mmsi = await enrichment_queue.get()
            await enrich_ship_data(mmsi)
            if mmsi in queued_mmsis: queued_mmsis.remove(mmsi)
            enrichment_queue.task_done()
            await asyncio.sleep(5.0 + random.random() * 2.0)
        except Exception as e: logger.error(f"Enrichment worker error: {e}"); await asyncio.sleep(5.0)

async def process_ais_data(data: dict):
    mmsi_val = data.get("mmsi")
    if not mmsi_val: return
    mmsi_str = str(mmsi_val)
    lat, lon = data.get("lat"), data.get("lon")
    msg_type = data.get("type", 0)
    ship_name = data.get("shipname") or data.get("name")
    source = data.get("source", "local")

    if source == "aisstream":
        if mmsi_str in local_vessels and time.time() - local_vessels[mmsi_str] < 600: return
    else: local_vessels[mmsi_str] = time.time()

    if data.get("is_safety"):
        safety_msg = {"type": "safety_alert", "mmsi": mmsi_str, "text": data.get("safety_text", ""), "is_broadcast": data.get("is_broadcast_alert", False), "timestamp": int(datetime.now().timestamp() * 1000)}
        for ws in list(connected_clients):
            try: await ws.send_json(safety_msg)
            except Exception: pass
        return

    try:
        async with db_session() as db:
            settings = await get_all_settings(db)
            
            if msg_type in [5, 24] and lat is None:
                if mmsi_str not in queued_mmsis: queued_mmsis.add(mmsi_str); enrichment_queue.put_nowait(mmsi_str)
                async with db.execute('SELECT last_seen FROM ships WHERE mmsi = ?', (mmsi_str,)) as cursor:
                    row = await cursor.fetchone()
                    reset_count = False
                    if row:
                        try:
                            last_seen_dt = datetime.strptime(row[0], "%Y-%m-%d %H:%M:%S")
                            if (datetime.utcnow() - last_seen_dt).total_seconds() > (int(settings.get("ship_timeout", 60)) * 60): reset_count = True
                        except Exception: pass
                await db.execute('INSERT OR IGNORE INTO ships (mmsi, name, callsign, last_seen, message_count) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 0)', (mmsi_str, ship_name, data.get("callsign")))
                update_fields = ["last_seen = CURRENT_TIMESTAMP", ("previous_seen = last_seen, message_count = 1" if reset_count else "message_count = message_count + 1")]
                vals = []
                if ship_name: update_fields.append("name = ?"); vals.append(ship_name)
                if data.get("callsign"): update_fields.append("callsign = ?"); vals.append(data.get("callsign"))
                stype = data.get("ship_type") or data.get("shiptype")
                if stype is not None: update_fields.append("type = ?"); vals.append(stype)
                update_fields.append("source = ?"); vals.append(source)
                if data.get("destination"): update_fields.append("destination = ?"); vals.append(data.get("destination"))
                if data.get("eta"): update_fields.append("eta = ?"); vals.append(data.get("eta"))
                if data.get("imo"): update_fields.append("imo = ?"); vals.append(data.get("imo"))
                vals.append(mmsi_str)
                await db.execute(f'UPDATE ships SET {", ".join(update_fields)} WHERE mmsi = ?', tuple(vals))
                
                # Dimensions
                to_b, to_s, to_p, to_st = data.get("to_bow"), data.get("to_stern"), data.get("to_port"), data.get("to_starboard")
                if to_b is not None and to_s is not None: await db.execute("UPDATE ships SET length = ? WHERE mmsi = ?", (to_b + to_s, mmsi_str))
                if to_p is not None and to_st is not None: await db.execute("UPDATE ships SET width = ? WHERE mmsi = ?", (to_p + to_st, mmsi_str))
                await db.commit()
                return

            if (lat is None or lon is None) and msg_type != 8: return
            
            is_meteo = data.get("is_meteo", False) or msg_type in [4, 8]
            if mmsi_str not in queued_mmsis: queued_mmsis.add(mmsi_str); enrichment_queue.put_nowait(mmsi_str)
        
            ship_data = {
                "mmsi": mmsi_str, "lat": lat, "lon": lon, "sog": data.get("speed") or data.get("sog"), "cog": data.get("course") or data.get("cog"),
                "heading": data.get("heading"), "name": ship_name, "callsign": data.get("callsign"), "shiptype": data.get("ship_type") or data.get("shiptype"),
                "status_text": data.get("status_text") or data.get("status"), "country_code": data.get("country_code") or get_country_code_from_mmsi(mmsi_str),
                "timestamp": int(datetime.now().timestamp() * 1000), "is_meteo": is_meteo, "is_aton": data.get("is_aton", False),
                "is_sar": data.get("is_sar", False), "aton_type": data.get("aton_type"), "aton_type_text": data.get("aton_type_text"),
                "destination": data.get("destination"), "draught": data.get("draught"), "is_emergency": data.get("is_emergency", False),
                "emergency_type": data.get("emergency_type"), "virtual_aton": data.get("virtual_aton", False), "is_advanced_binary": data.get("is_advanced_binary", False),
                "dac": data.get("dac"), "fid": data.get("fid"), "raw_payload": data.get("raw_payload"),
                "source": source, "nmea": data.get("nmea"), "ship_type_text": data.get("ship_type_text"), "ship_category": data.get("ship_category"),
                "wind_speed": data.get("wind_speed"), "wind_gust": data.get("wind_gust"), "wind_direction": data.get("wind_direction"),
                "water_level": data.get("water_level"), "air_temp": data.get("air_temp"), "air_pressure": data.get("air_pressure")
            }

            if ship_data.get("is_advanced_binary") and not ship_data.get("status_text"):
                dac, fid = ship_data.get("dac"), ship_data.get("fid")
                ship_data["status_text"] = f"Advanced Binary (DAC:{dac}, FI:{fid})" if dac is not None and fid is not None else "Advanced Binary Message"

            if ship_data.get("sog") is not None and ship_data["sog"] < 0.1:
                if data.get("nav_status") in [0, 8]: ship_data["status_text"] = "Moored (Stationary)"; ship_data["nav_status"] = 5

            async with db.execute('SELECT last_seen FROM ships WHERE mmsi = ?', (mmsi_str,)) as cursor:
                row = await cursor.fetchone()
                reset_count = False
                if row:
                    try:
                        last_seen_dt = datetime.strptime(row[0], "%Y-%m-%d %H:%M:%S")
                        if (datetime.utcnow() - last_seen_dt).total_seconds() > (int(settings.get("ship_timeout", 60)) * 60):
                            reset_count = True; logger.info(f"Vessel {mmsi_str} re-acquired. Resetting count.")
                    except Exception as e: logger.error(f"Error checking last_seen: {e}")

            is_new_v = row is None
            await db.execute('INSERT OR IGNORE INTO ships (mmsi, name, callsign, last_seen, message_count) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 0)', (mmsi_str, ship_name, data.get("callsign")))
            
            flds, vals = ["last_seen = CURRENT_TIMESTAMP", "message_count = message_count + 1"], []
            for f, k in [("name", "name"), ("callsign", "callsign"), ("type", "shiptype"), ("status_text", "status_text"), ("country_code", "country_code"), ("latitude", "lat"), ("longitude", "lon"), ("sog", "sog"), ("cog", "cog"), ("heading", "heading"), ("source", "source"), ("emergency_type", "emergency_type"), ("wind_speed", "wind_speed"), ("wind_gust", "wind_gust"), ("wind_direction", "wind_direction"), ("water_level", "water_level"), ("air_temp", "air_temp"), ("air_pressure", "air_pressure")]:
                v = ship_data.get(k)
                if v is not None: flds.append(f"{f} = ?"); vals.append(v)
            for f, k in [("is_meteo", "is_meteo"), ("is_emergency", "is_emergency"), ("virtual_aton", "virtual_aton"), ("is_advanced_binary", "is_advanced_binary"), ("dac", "dac"), ("fid", "fid"), ("raw_payload", "raw_payload")]:
                v = ship_data.get(k)
                if v is not None: flds.append(f"{f} = ?"); vals.append(1 if v is True else (0 if v is False else v))
            
            vals.append(mmsi_str)
            await db.execute(f'UPDATE ships SET {", ".join(flds)} WHERE mmsi = ?', tuple(vals))
            
            # History
            now_ms = int(datetime.now().timestamp() * 1000)
            async with db.execute('SELECT latitude, longitude FROM ship_history WHERE mmsi = ? ORDER BY timestamp DESC LIMIT 1', (mmsi_str,)) as cursor:
                hr = await cursor.fetchone()
                if not hr or haversine_distance(hr[0], hr[1], lat, lon) > 0.05:
                    await db.execute('INSERT INTO ship_history (mmsi, latitude, longitude, timestamp) VALUES (?, ?, ?, ?)', (mmsi_str, lat, lon, now_ms))
            
            # Stats
            today, time_min = datetime.utcnow().strftime('%Y-%m-%d'), datetime.utcnow().strftime('%Y-%m-%d %H:%M')
            await db.execute('INSERT INTO daily_stats (date, total_messages) VALUES (?, 1) ON CONFLICT(date) DO UPDATE SET total_messages = total_messages + 1', (today,))
            await db.execute('INSERT INTO hourly_stats (date, hour, message_count) VALUES (?, ?, 1) ON CONFLICT(date, hour) DO UPDATE SET message_count = message_count + 1', (today, datetime.utcnow().hour))
            await db.execute('INSERT INTO minute_stats (time_min, total_messages) VALUES (?, 1) ON CONFLICT(time_min) DO UPDATE SET total_messages = total_messages + 1', (time_min,))
            try:
                await db.execute('INSERT INTO daily_mmsi (date, mmsi) VALUES (?, ?)', (today, mmsi_str))
                sf = ["unique_ships = unique_ships + 1"]
                if is_new_v: sf.append("new_ships = new_ships + 1")
                await db.execute(f'UPDATE daily_stats SET {", ".join(sf)} WHERE date = ?', (today,))
            except Exception: pass
            
            try:
                await db.execute('INSERT INTO minute_mmsi (time_min, mmsi) VALUES (?, ?)', (time_min, mmsi_str))
                await db.execute('UPDATE minute_stats SET unique_ships = unique_ships + 1 WHERE time_min = ?', (time_min,))
            except Exception: pass
            
            # Read back missing data
            async with db.execute('SELECT image_url, name, type, status_text, country_code, length, width, destination, draught, message_count, eta, rot, imo, callsign, previous_seen, manual_image, latitude, longitude, is_meteo, is_emergency, emergency_type, virtual_aton, is_advanced_binary, dac, fid, raw_payload, wind_speed, wind_gust, wind_direction, water_level, air_temp, air_pressure FROM ships WHERE mmsi = ?', (mmsi_str,)) as cursor:
                r = await cursor.fetchone()
                if r:
                    ship_data["imageUrl"] = r[0] or "/images/0.jpg"
                    if not ship_name and r[1]: ship_data["name"] = r[1]
                    if ship_data["shiptype"] is None: ship_data["shiptype"] = r[2]
                    if not ship_data["status_text"]: ship_data["status_text"] = r[3]
                    if not ship_data["country_code"]: ship_data["country_code"] = r[4]
                    ship_data["length"], ship_data["width"] = r[5], r[6]
                    if not ship_data["destination"]: ship_data["destination"] = r[7]
                    if not ship_data["draught"]: ship_data["draught"] = r[8]
                    ship_data["message_count"], ship_data["eta"], ship_data["rot"], ship_data["imo"], ship_data["callsign"] = r[9], r[10], r[11], r[12], r[13]
                    if r[14]:
                        try: ship_data["previous_seen"] = datetime.strptime(r[14], "%Y-%m-%d %H:%M:%S").timestamp() * 1000
                        except Exception: pass
                    ship_data["manual_image"] = bool(r[15])
                    if ship_data.get("lat") is None: ship_data["lat"] = r[16]
                    if ship_data.get("lon") is None: ship_data["lon"] = r[17]
                    if len(r) > 19:
                        if r[18]: ship_data["is_meteo"] = True
                        if r[19]: ship_data["is_emergency"] = True
                        if r[20]: ship_data["emergency_type"] = r[20]
                        if r[21]: ship_data["virtual_aton"] = True
                        if r[22]: ship_data["is_advanced_binary"] = True
                        if r[23] is not None: ship_data["dac"] = r[23]
                        if r[24] is not None: ship_data["fid"] = r[24]
                        if r[25]: ship_data["raw_payload"] = r[25]
                        if len(r) > 26:
                            ship_data["wind_speed"], ship_data["wind_gust"], ship_data["wind_direction"], ship_data["water_level"], ship_data["air_temp"] = r[26], r[27], r[28], r[29], r[30]
                            if len(r) > 31: ship_data["air_pressure"] = r[31]
            
            if not ship_data.get("ship_type_text") and ship_data.get("shiptype") is not None:
                try:
                    c = int(ship_data["shiptype"])
                    ship_data["ship_type_text"], ship_data["ship_category"] = get_ship_type_name(c), get_ship_category(c)
                except Exception: pass
            
            # Range tracking
            origin_lat, origin_lon = settings.get("origin_lat"), settings.get("origin_lon")
            if (source != "aisstream" or settings.get("include_aisstream_in_range") == "true") and \
               origin_lat and origin_lon and not is_meteo and not ship_data.get("is_aton") and \
               not ship_data.get("is_sar") and not mmsi_str.startswith("99"):
                try:
                    dist = haversine_distance(float(origin_lat), float(origin_lon), lat, lon)
                    if ship_data.get("message_count", 0) >= 1 and 1.0 <= dist <= 370.4:
                        bearing = calculate_bearing(float(origin_lat), float(origin_lon), lat, lon)
                        sector = int(bearing // 5) % 72
                        async with db.execute('SELECT range_km_24h, range_km_alltime FROM coverage_sectors WHERE sector_id = ?', (sector,)) as cursor:
                            row = await cursor.fetchone()
                            rng_24h, rng_all = (row[0] if row else 0.0), (row[1] if row else 0.0)
                            updated = False
                            if dist > rng_24h: rng_24h = dist; updated = True
                            if dist > rng_all: rng_all = dist; updated = True
                            if updated or not row:
                                await db.execute('INSERT INTO coverage_sectors (sector_id, range_km_24h, range_km_alltime, last_updated) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(sector_id) DO UPDATE SET range_km_24h = ?, range_km_alltime = ?, last_updated = CURRENT_TIMESTAMP', (sector, rng_24h, rng_all, rng_24h, rng_all))
                                await db.execute('UPDATE daily_stats SET max_range_km = ? WHERE date = ? AND ? > max_range_km', (dist, today, dist))
                                await db.execute('INSERT INTO sector_history (sector_id, distance_km, timestamp) VALUES (?, ?, ?)', (sector, dist, int(datetime.utcnow().timestamp() * 1000)))
                                await broadcast({"type": "coverage_update", "sector_id": sector, "range_km_24h": rng_24h, "range_km_alltime": rng_all})
                except Exception as e: logger.error(f"Range err: {e}")

            await db.commit()
            await broadcast(ship_data)
    except Exception as e:
        logger.error(f"Error for MMSI {mmsi_str}: {e}")

class UDPProtocol(asyncio.DatagramProtocol):
    def connection_made(self, transport):
        self.transport = transport; self.settings = {}
        self.stream_manager = AisStreamManager()
        self.stream_manager.on_decode(self.handle_parsed_custom)
        asyncio.create_task(self.update_settings_loop())
    def handle_parsed_custom(self, d): d["source"] = "local"; asyncio.create_task(process_ais_data(d))
    async def update_settings_loop(self):
        while True: self.settings = await get_all_settings(); await asyncio.sleep(5)
    def datagram_received(self, data, addr):
        if MOCK_MODE: return
        try: msg = data.decode('utf-8', errors='ignore').strip()
        except Exception: return
        now_ms = int(datetime.now().timestamp() * 1000)
        for line in msg.splitlines():
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
    loop, settings = asyncio.get_running_loop(), await get_all_settings()
    port = int(settings.get("udp_port", str(UDP_PORT)))
    if udp_server_transport: udp_server_transport.close()
    if settings.get("udp_enabled", "true") == "true":
        try:
            transport, _ = await loop.create_datagram_endpoint(UDPProtocol, local_addr=('0.0.0.0', port))
            udp_server_transport = transport
            logger.info(f"UDP server started on port {port}")
        except Exception as e: logger.error(f"Failed to start UDP listener: {e}")

async def mqtt_loop():
    global mqtt_connected
    while True:
        s = await get_all_settings()
        if s["mqtt_enabled"] != "true" or not s["mqtt_url"]: mqtt_connected = False; await asyncio.sleep(5); continue
        try:
            p = s["mqtt_url"].replace("mqtt://", "").replace("mqtts://", "").split(":")
            async with aiomqtt.Client(hostname=p[0], port=int(p[1]) if len(p)>1 else 1883, username=s["mqtt_user"] or None, password=s["mqtt_pass"] or None) as c:
                mqtt_connected = True; await broadcast({"type": "mqtt_status", "connected": True})
                await c.subscribe(s["mqtt_topic"])
                async for m in c.messages:
                    try: asyncio.create_task(process_ais_data(json.loads(m.payload.decode())))
                    except Exception: pass
        except Exception as e: logger.error(f"MQTT error: {e}"); mqtt_connected = False; await broadcast({"type": "mqtt_status", "connected": False}); await asyncio.sleep(5)

def restart_mqtt():
    global mqtt_client_task
    if mqtt_client_task: mqtt_client_task.cancel()
    mqtt_client_task = asyncio.create_task(mqtt_loop())

async def mock_mode_loop():
    mock_lat, mock_lon = 59.3293, 18.0686
    while True:
        if MOCK_MODE:
            mock_lat += (random.random()-0.5)*0.001; mock_lon += (random.random()-0.5)*0.001
            await broadcast({"mmsi": "265123456", "name": "PYTHON GHOST", "lat": mock_lat, "lon": mock_lon, "sog": 5.2, "cog": random.random()*360, "timestamp": int(datetime.now().timestamp()*1000)})
        await asyncio.sleep(2)

async def purge_job():
    while True:
        try:
            async with db_session() as db:
                async with db.execute("SELECT mmsi, image_url FROM ships WHERE last_seen < datetime('now', '-30 days')") as cursor:
                    for row in await cursor.fetchall():
                        if row[1]:
                            p = os.path.join(IMAGES_DIR, row[1].split('/')[-1])
                            if os.path.exists(p): os.remove(p)
                await db.execute("DELETE FROM ships WHERE last_seen < datetime('now', '-30 days')")
                await db.execute("DELETE FROM daily_mmsi WHERE date < date('now', '-7 days')")
                await db.execute("DELETE FROM minute_stats WHERE time_min < datetime('now', '-24 hours')")
                await db.execute("DELETE FROM minute_mmsi WHERE time_min < datetime('now', '-24 hours')")
                await db.execute("DELETE FROM sector_history WHERE timestamp < ?", (int((datetime.now() - timedelta(hours=24)).timestamp() * 1000),))
                await db.commit()
        except Exception as e: logger.error(f"[Purge] Error: {e}")
        await asyncio.sleep(86400)

async def coverage_24h_reset_job():
    while True:
        try:
            async with db_session() as db:
                await db.execute("UPDATE coverage_sectors SET range_km_24h = 0.0 WHERE last_updated < datetime('now', '-24 hours')")
                await db.commit()
        except Exception: pass
        await asyncio.sleep(3600)

@app.on_event("startup")
async def startup_event():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    if not os.path.exists(os.path.join(IMAGES_DIR, "0.jpg")) and os.path.exists("/app/backend/static/0.jpg"):
        shutil.copy2("/app/backend/static/0.jpg", os.path.join(IMAGES_DIR, "0.jpg"))
    async with db_session() as db:
        await db.execute('CREATE TABLE IF NOT EXISTS ships (mmsi TEXT PRIMARY KEY, imo TEXT, name TEXT, callsign TEXT, type INTEGER, image_url TEXT, image_fetched_at DATETIME, last_seen DATETIME DEFAULT CURRENT_TIMESTAMP)')
        for c in ["previous_seen DATETIME", "manual_image BOOLEAN DEFAULT 0", "is_meteo BOOLEAN DEFAULT 0", "is_aton BOOLEAN DEFAULT 0", "aton_type INTEGER", "aton_type_text TEXT", "is_emergency BOOLEAN DEFAULT 0", "emergency_type TEXT", "virtual_aton BOOLEAN DEFAULT 0", "is_advanced_binary BOOLEAN DEFAULT 0", "dac INTEGER", "fid INTEGER", "raw_payload TEXT", "heading REAL", "length REAL", "width REAL", "message_count INTEGER DEFAULT 0", "eta TEXT", "rot REAL", "status_text TEXT", "country_code TEXT", "destination TEXT", "draught REAL", "latitude REAL", "longitude REAL", "sog REAL", "cog REAL", "source TEXT DEFAULT 'local'", "wind_speed REAL", "wind_gust REAL", "wind_direction REAL", "water_level REAL", "air_temp REAL", "air_pressure REAL"]:
            try: await db.execute(f"ALTER TABLE ships ADD COLUMN {c}")
            except Exception: pass
        await db.execute('CREATE TABLE IF NOT EXISTS ship_history (mmsi TEXT, latitude REAL, longitude REAL, timestamp INTEGER)')
        await db.execute("CREATE INDEX IF NOT EXISTS idx_ship_history_mmsi_ts ON ship_history (mmsi, timestamp)")
        await db.execute('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)')
        for k, v in [('history_duration', '60'), ('show_names_on_map', 'true'), ('units', 'nautical'), ('ship_size', '1.0'), ('circle_size', '1.0'), ('trail_size', '2.0'), ('aisstream_enabled', 'false'), ('aisstream_api_key', ''), ('aisstream_sw_lat', '56.5'), ('aisstream_sw_lon', '15.5'), ('aisstream_ne_lat', '60.0'), ('aisstream_ne_lon', '21.0'), ('trail_mode', 'all'), ('show_aisstream_on_map', 'true'), ('sdr_enabled', 'true'), ('udp_enabled', 'true'), ('udp_port', str(UDP_PORT))]:
            await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))
        await db.execute('CREATE TABLE IF NOT EXISTS coverage_sectors (sector_id INTEGER PRIMARY KEY, range_km_24h REAL DEFAULT 0.0, range_km_alltime REAL DEFAULT 0.0, last_updated DATETIME)')
        await db.execute('CREATE TABLE IF NOT EXISTS daily_stats (date TEXT PRIMARY KEY, unique_ships INTEGER DEFAULT 0, new_ships INTEGER DEFAULT 0, total_messages INTEGER DEFAULT 0, max_range_km REAL DEFAULT 0.0)')
        try: await db.execute("ALTER TABLE daily_stats ADD COLUMN new_ships INTEGER DEFAULT 0")
        except Exception: pass
        await db.execute('CREATE TABLE IF NOT EXISTS daily_mmsi (date TEXT, mmsi TEXT, PRIMARY KEY (date, mmsi))')
        await db.execute('CREATE TABLE IF NOT EXISTS hourly_stats (date TEXT, hour INTEGER, message_count INTEGER DEFAULT 0, PRIMARY KEY (date, hour))')
        await db.execute('CREATE TABLE IF NOT EXISTS minute_stats (time_min TEXT PRIMARY KEY, unique_ships INTEGER DEFAULT 0, total_messages INTEGER DEFAULT 0)')
        await db.execute('CREATE TABLE IF NOT EXISTS minute_mmsi (time_min TEXT, mmsi TEXT, PRIMARY KEY (time_min, mmsi))')
        await db.execute('CREATE TABLE IF NOT EXISTS sector_history (sector_id INTEGER, distance_km REAL, timestamp INTEGER)')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_sector_history_ts ON sector_history (timestamp)')
        await db.commit()
    asyncio.create_task(start_udp_listener()); restart_mqtt(); asyncio.create_task(mock_mode_loop()); asyncio.create_task(purge_job()); asyncio.create_task(coverage_24h_reset_job()); await restart_aisstream(); asyncio.create_task(enrichment_worker())

@app.get("/api/ships")
async def get_ships():
    s = await get_all_settings(); t = int(s.get("ship_timeout", 60))
    async with db_session() as db:
        db.row_factory = aiosqlite.Row
        r = await db.execute("SELECT value FROM settings WHERE key='history_duration'"); row = await r.fetchone(); dur = int(row[0]) if row else 60
        r = await db.execute(f"SELECT * FROM ships WHERE last_seen >= datetime('now', '-{t} minutes') AND latitude IS NOT NULL AND longitude IS NOT NULL")
        res = []
        for row in await r.fetchall():
            try:
                d = dict(row); m = d["mmsi"]; cut = int(time.time()*1000) - (dur*60000)
                hr = await db.execute("SELECT latitude, longitude FROM ship_history WHERE mmsi=? AND timestamp > ? ORDER BY timestamp ASC", (m, cut))
                d["history"] = [[r["latitude"], r["longitude"]] for r in await hr.fetchall()]
                d["imageUrl"] = d["image_url"] or "/images/0.jpg"
                if d["last_seen"]:
                    try: d["timestamp"] = datetime.strptime(d["last_seen"], "%Y-%m-%d %H:%M:%S").timestamp()*1000
                    except Exception: d["timestamp"] = time.time()*1000
                if d["type"] is not None:
                    d["shiptype"] = d["type"]
                    try: c = int(d["type"]); d["ship_type_text"], d["ship_category"] = get_ship_type_name(c), get_ship_category(c)
                    except Exception: pass
                d["lat"], d["lon"] = d["latitude"], d["longitude"]
                for f in ["manual_image", "is_emergency", "virtual_aton", "is_advanced_binary"]: d[f] = bool(d.get(f, 0))
                # Include binary and weather metadata
                for f in ["dac", "fid", "raw_payload", "emergency_type", "wind_speed", "wind_gust", "wind_direction", "water_level", "air_temp", "air_pressure"]: 
                    val = d.get(f)
                    if val is not None: d[f] = val
                if d["previous_seen"]:
                    try: d["previous_seen"] = datetime.strptime(d["previous_seen"], "%Y-%m-%d %H:%M:%S").timestamp()*1000
                    except Exception: pass
                res.append(d)
            except Exception: continue
        return res

@app.post("/api/ships/{mmsi}/image")
async def upload_ship_image(mmsi: str, file: UploadFile = File(...)):
    try:
        if not mmsi.isdigit() or len(mmsi) != 9:
            return {"error": "Invalid MMSI"}
            
        file_ext = "jpg"
        if file.filename:
            parts = file.filename.split(".")
            if len(parts) > 1:
                ext = parts[-1].lower()
                if ext in ["jpg", "jpeg", "png", "webp"]:
                    file_ext = ext
                
        safe_filename = f"{mmsi}.{file_ext}"
        file_path = os.path.join(IMAGES_DIR, safe_filename)
        
        # Remove any existing images for this MMSI with different extensions to avoid confusion
        for ext in ["jpg", "jpeg", "png", "webp"]:
            old_path = os.path.join(IMAGES_DIR, f"{mmsi}.{ext}")
            if os.path.exists(old_path) and old_path != file_path:
                try: os.remove(old_path)
                except Exception: pass

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        image_url = f"/images/{safe_filename}?t={int(time.time())}"
        
        async with db_session() as db:
            await db.execute(
                'UPDATE ships SET image_url = ?, manual_image = 1 WHERE mmsi = ?', 
                (f"/images/{safe_filename}", mmsi)
            )
            await db.commit()
            
        # Broadcast update to connected clients
        await broadcast({"mmsi": mmsi, "imageUrl": image_url, "manual_image": True})
        
        return {"success": True, "imageUrl": image_url}
    except Exception as e:
        logger.error(f"Error uploading image for {mmsi}: {e}")
        return {"error": str(e)}

@app.post("/api/ships/{mmsi}/details")
async def update_ship_details(mmsi: str, details: dict):
    try:
        if not mmsi.isdigit() or len(mmsi) != 9:
            return {"error": "Invalid MMSI"}
            
        upd = []
        vals = []
        # Allow updating specific fields
        allowed_fields = ["name", "imo", "callsign", "shiptype", "length", "width", "destination", "draught"]
        
        for f in allowed_fields:
            if f in details:
                # Map shiptype to type in DB
                db_field = "type" if f == "shiptype" else f
                upd.append(f"{db_field} = ?")
                vals.append(details[f])
        
        if not upd:
            return {"error": "No valid fields to update"}
            
        vals.append(mmsi)
        async with db_session() as db:
            await db.execute(f"UPDATE ships SET {', '.join(upd)} WHERE mmsi = ?", tuple(vals))
            await db.commit()
            
        # Broadcast the update (minimal)
        broadcast_data = {"mmsi": mmsi}
        for i, f in enumerate(upd):
            broadcast_data[f.split(' ')[0]] = vals[i]
        await broadcast(broadcast_data)
        
        return {"success": True}
    except Exception as e:
        logger.error(f"Error updating details for {mmsi}: {e}")
        return {"error": str(e)}

@app.get("/api/settings")
async def get_settings_api(): return await get_all_settings()

@app.post("/api/settings")
async def set_settings_api(settings: dict):
    old = await get_all_settings()
    for k, v in settings.items():
        if v is not None: await set_setting(k, str(v))
    if str(settings.get("origin_lat")) != old.get("origin_lat") or str(settings.get("origin_lon")) != old.get("origin_lon"):
        async with db_session() as db: await db.execute('UPDATE coverage_sectors SET range_km_24h = 0.0, range_km_alltime = 0.0'); await db.commit()
    if settings.get("udp_port") or settings.get("udp_enabled"): asyncio.create_task(start_udp_listener())
    if any(k in settings for k in ["aisstream_enabled", "aisstream_api_key", "aisstream_sw_lat", "aisstream_sw_lon", "aisstream_ne_lat", "aisstream_ne_lon"]):
        await restart_aisstream()
    restart_mqtt(); return {"success": True, "settings": await get_all_settings()}

@app.get("/api/coverage")
async def get_coverage():
    async with db_session() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT sector_id, range_km_24h, range_km_alltime FROM coverage_sectors ORDER BY sector_id ASC") as c:
            return [dict(r) for r in await c.fetchall()]

@app.get("/api/statistics")
async def get_statistics(date: str = None):
    try:
        sel = date or datetime.utcnow().strftime('%Y-%m-%d')
        yest = (datetime.strptime(sel, '%Y-%m-%d') - timedelta(days=1)).strftime('%Y-%m-%d')
        async with db_session() as db:
            db.row_factory = aiosqlite.Row
            r = await db.execute("SELECT * FROM daily_stats WHERE date = ?", (sel,)); t_row = await r.fetchone() or {"unique_ships":0,"new_ships":0,"total_messages":0,"max_range_km":0.0}
            r = await db.execute("SELECT * FROM daily_stats WHERE date = ?", (yest,)); y_row = await r.fetchone() or {"unique_ships":0,"new_ships":0,"total_messages":0}
            r = await db.execute("SELECT MAX(unique_ships), MAX(total_messages), MAX(max_range_km) FROM daily_stats"); a_row = await r.fetchone()
            r = await db.execute("SELECT date, unique_ships, total_messages FROM daily_stats ORDER BY date DESC LIMIT 30"); h30 = [dict(row) for row in await r.fetchall()]; h30.reverse()
            h_brk = []
            r = await db.execute("SELECT hour, message_count FROM hourly_stats WHERE date = ? ORDER BY hour ASC", (sel,))
            h_raw = {row["hour"]: row["message_count"] for row in await r.fetchall()}
            for h in range(24): h_brk.append({"hour":h, "count":h_raw.get(h,0)})
            t_brk = []
            r = await db.execute("SELECT type, COUNT(*) as count FROM ships WHERE last_seen LIKE ? GROUP BY type ORDER BY count DESC", (f"{sel}%",))
            for row in await r.fetchall():
                if row["type"]: t_brk.append({"type":row["type"], "label":get_ship_type_name(row["type"]), "count":row["count"]})
                
            # New hour stats (last 60 minutes)
            min_brk = []
            sixty_mins_ago = (datetime.utcnow() - timedelta(minutes=60)).strftime('%Y-%m-%d %H:%M')
            hour_ago_ts = int((datetime.utcnow() - timedelta(hours=1)).timestamp() * 1000)
            
            r = await db.execute("SELECT time_min, unique_ships, total_messages FROM minute_stats WHERE time_min >= ? ORDER BY time_min ASC", (sixty_mins_ago,))
            min_raw = {row["time_min"]: dict(row) for row in await r.fetchall()}
            
            for i in range(60, -1, -1):
                t_str = (datetime.utcnow() - timedelta(minutes=i)).strftime('%Y-%m-%d %H:%M')
                min_brk.append(min_raw.get(t_str, {"time_min": t_str, "unique_ships": 0, "total_messages": 0}))

            # New sector max distance last hour
            sector_max = [0] * 72
            r = await db.execute("SELECT sector_id, MAX(distance_km) as max_dist FROM sector_history WHERE timestamp >= ? GROUP BY sector_id", (hour_ago_ts,))
            for row in await r.fetchall():
                if 0 <= row["sector_id"] < 72:
                    sector_max[row["sector_id"]] = row["max_dist"]
                    
            # 24h sector max distance
            sector_24h_max = [0] * 72
            day_ago_ts = int((datetime.utcnow() - timedelta(hours=24)).timestamp() * 1000)
            r = await db.execute("SELECT sector_id, MAX(distance_km) as max_dist FROM sector_history WHERE timestamp >= ? GROUP BY sector_id", (day_ago_ts,))
            for row in await r.fetchall():
                if 0 <= row["sector_id"] < 72:
                    sector_24h_max[row["sector_id"]] = row["max_dist"]

            return {
                "selected_date":sel, "today":dict(t_row), "yesterday":dict(y_row), 
                "all_time":{"unique_ships":a_row[0] or 0,"total_messages":a_row[1] or 0,"max_range_km":a_row[2] or 0}, 
                "history_30d":h30, "hourly_breakdown":h_brk, "type_breakdown":t_brk,
                "minute_breakdown": min_brk, "sector_max_last_hour": sector_max, "sector_max_last_24h": sector_24h_max
            }
    except Exception as e: logger.error(f"Stats err: {e}"); return {"error": "Stats error"}

@app.get("/api/status")
async def get_status():
    up = 0
    try:
        with open('/proc/uptime','r') as f: up = float(f.readline().split()[0])
    except: pass
    s = await get_all_settings()
    return {"sdr": not MOCK_MODE, "mock_mode": MOCK_MODE, "mqtt": s["mqtt_enabled"]=="true", "uptime": up}

@app.websocket("/ws")
@app.websocket("/")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept(); connected_clients.add(websocket)
    try:
        await websocket.send_text(json.dumps({"type": "status", "message": "Connected"}))
        await websocket.send_text(json.dumps({"type": "mqtt_status", "connected": mqtt_connected}))
        while True: await websocket.receive_text()
    except: connected_clients.remove(websocket) if websocket in connected_clients else None

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, log_level=LOG_LEVEL.lower())
