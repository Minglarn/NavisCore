import asyncio
import json
import logging
import os
import shutil
import os
import shutil
import httpx
import aiosqlite
import aiomqtt
import socket
import math
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
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

# Settings Helpers
async def cleanup_history_task():
    """Background task to remove history entries older than 24 hours"""
    while True:
        try:
            async with aiosqlite.connect(DB_PATH) as db:
                # Remove history older than 24 hours (86400 seconds)
                # Note: We use 24h as a hard limit regardless of UI setting to keep DB lean
                cutoff = int(datetime.now().timestamp() * 1000) - (24 * 3600 * 1000)
                await db.execute('DELETE FROM ship_history WHERE timestamp < ?', (cutoff,))
                await db.commit()
                logger.info("Cleaned up old ship history entries")
        except Exception as e:
            logger.error(f"Error in cleanup_history_task: {e}")
        await asyncio.sleep(3600) # Run once an hour

async def get_setting(key: str, default_val: str = "") -> str:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute('SELECT value FROM settings WHERE key = ?', (key,)) as cursor:
            row = await cursor.fetchone()
            return row[0] if row else default_val

async def set_setting(key: str, value: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', (key, str(value)))
        await db.commit()

async def get_all_settings():
    return {
        "mqtt_enabled": await get_setting("mqtt_enabled", "false"),
        "mqtt_url": await get_setting("mqtt_url", ""),
        "mqtt_topic": await get_setting("mqtt_topic", "ais"),
        "mqtt_user": await get_setting("mqtt_user", ""),
        "mqtt_pass": await get_setting("mqtt_pass", ""),
        "forward_enabled": await get_setting("forward_enabled", "false"),
        "forward_ip": await get_setting("forward_ip", ""),
        "forward_port": await get_setting("forward_port", ""),
        "ship_timeout": await get_setting("ship_timeout", "60"),
        "origin_lat": await get_setting("origin_lat", ""),
        "origin_lon": await get_setting("origin_lon", ""),
        "show_range_rings": await get_setting("show_range_rings", "true"),
        "map_style": await get_setting("map_style", "light"),
        "base_layer": await get_setting("base_layer", "standard"),
        "range_type": await get_setting("range_type", "24h"),
        "history_duration": await get_setting("history_duration", "60"),
        "show_names_on_map": await get_setting("show_names_on_map", "true"),
        "trail_color": await get_setting("trail_color", "#ff4444"),
        "trail_opacity": await get_setting("trail_opacity", "0.6"),
        "trail_enabled": await get_setting("trail_enabled", "true"),
        "sdr_ppm": await get_setting("sdr_ppm", "0"),
        "sdr_gain": await get_setting("sdr_gain", "auto")
    }

# WebSockets
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

# Math Helpers
def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371.0 # Earth radius in km
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = math.sin(dLat/2) * math.sin(dLat/2) + \
        math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * \
        math.sin(dLon/2) * math.sin(dLon/2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def calculate_bearing(lat1, lon1, lat2, lon2):
    rlat1 = math.radians(lat1)
    rlat2 = math.radians(lat2)
    rdlon = math.radians(lon2 - lon1)
    
    y = math.sin(rdlon) * math.cos(rlat2)
    x = math.cos(rlat1) * math.sin(rlat2) - \
        math.sin(rlat1) * math.cos(rlat2) * math.cos(rdlon)
    
    theta = math.atan2(y, x)
    brng = (math.degrees(theta) + 360) % 360
    return brng

# Image Fetching Logic
async def handle_fallback_image(mmsi: str):
    source_file = os.path.join(IMAGES_DIR, '0.jpg')
    if os.path.exists(source_file):
        try:
            # Instead of copying, we just point to the default image in the DB
            # This allows us to retry fetching a real image later
            async with aiosqlite.connect(DB_PATH) as db:
                await db.execute('UPDATE ships SET image_url = ? WHERE mmsi = ?', ("/images/0.jpg", mmsi))
                await db.commit()
            logger.info(f"[Enrichment] Set placeholder image for {mmsi}")
        except Exception as err:
            logger.error(f"[Enrichment] Failed to update fallback image for {mmsi}: {err}")
    else:
        logger.warning(f"[Enrichment] Default fallback image (0.jpg) not found in {IMAGES_DIR}.")

async def try_minglarn_image(mmsi: str) -> bool:
    image_url = f"https://minglarn.se/minglarn/php/ais_images/vessel_info_{mmsi}.jpg"
    local_filename = f"{mmsi}.jpg"
    local_path = os.path.join(IMAGES_DIR, local_filename)
    headers = {'User-Agent': 'Mozilla/5.0'}

    try:
        # First attempt with standard SSL verification
        async with httpx.AsyncClient(follow_redirects=True, timeout=10.0) as client:
            try:
                res = await client.get(image_url, headers=headers)
            except httpx.ConnectError as ce:
                if "UNRECOGNIZED_NAME" in str(ce) or "ssl" in str(ce).lower():
                    logger.warning(f"[Enrichment] SSL issue with Minglarn for {mmsi}, retrying without verification...")
                    async with httpx.AsyncClient(follow_redirects=True, verify=False, timeout=10.0) as insecure_client:
                        res = await insecure_client.get(image_url, headers=headers)
                else:
                    raise ce
            
            if res.status_code == 200 and res.headers.get('content-type', '').startswith('image/'):
                with open(local_path, "wb") as f:
                    f.write(res.content)
                logger.info(f"[Enrichment] Downloaded image for {mmsi} from Minglarn")
                async with aiosqlite.connect(DB_PATH) as db:
                    await db.execute('UPDATE ships SET image_url = ? WHERE mmsi = ?', (f"/images/{local_filename}", mmsi))
                    await db.commit()
                return True
    except Exception as e:
        logger.error(f"[Enrichment] Minglarn fetch error for {mmsi}: {e}")
    return False

async def try_marinetraffic_image(mmsi: str) -> bool:
    image_url = f"https://photos.marinetraffic.com/ais/showphoto.aspx?mmsi={mmsi}"
    local_filename = f"{mmsi}.jpg"
    local_path = os.path.join(IMAGES_DIR, local_filename)
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

    try:
        # Using verify=False as fallback here too if needed, but usually MT works better with standard verification
        async with httpx.AsyncClient(follow_redirects=True, timeout=10.0, verify=False) as client:
            res = await client.get(image_url, headers=headers)
            content_type = res.headers.get('content-type', '')
            
            if res.status_code == 200 and content_type.startswith('image/'):
                with open(local_path, "wb") as f:
                    f.write(res.content)
                logger.info(f"[Enrichment] Downloaded image for {mmsi} from MarineTraffic fallback")
                async with aiosqlite.connect(DB_PATH) as db:
                    await db.execute('UPDATE ships SET image_url = ? WHERE mmsi = ?', (f"/images/{local_filename}", mmsi))
                    await db.commit()
                return True
            else:
                if res.status_code == 500:
                    logger.warning(f"[Enrichment] MarineTraffic 500 error for {mmsi} - usually means no photo available for this MMSI in their legacy API.")
                else:
                    logger.info(f"[Enrichment] Failed to fetch image for {mmsi} from MarineTraffic. Status: {res.status_code} Content-Type: {content_type}")
    except Exception as e:
        logger.error(f"[Enrichment] Network error while fetching image for {mmsi}: {str(e)}")
    return False

async def enrich_ship_data(mmsi: str):
    if mmsi in active_lookups:
        return
    active_lookups.add(mmsi)

    try:
        async with aiosqlite.connect(DB_PATH) as db:
            async with db.execute('SELECT image_fetched_at, image_url FROM ships WHERE mmsi = ?', (mmsi,)) as cursor:
                row = await cursor.fetchone()
                if row and row[0]:
                    fetch_date = datetime.strptime(row[0], "%Y-%m-%d %H:%M:%S")
                    image_url = row[1]
                    
                    # If we have a REAL image (not the placeholder 0.jpg and not empty)
                    if image_url and image_url != "/images/0.jpg":
                        # Refresh real images every 30 days
                        if (datetime.now() - fetch_date).days < 30:
                            active_lookups.remove(mmsi)
                            return
                    else:
                        # Placeholder or no image. Retry every 24 hours.
                        if (datetime.now() - fetch_date).days < 1:
                            active_lookups.remove(mmsi)
                            return
                    
            await db.execute('INSERT OR IGNORE INTO ships (mmsi, image_fetched_at, last_seen) VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)', (mmsi,))
            await db.execute('UPDATE ships SET image_fetched_at = CURRENT_TIMESTAMP WHERE mmsi = ?', (mmsi,))
            await db.commit()

        logger.info(f"[Enrichment] Looking up MMSI {mmsi}...")
        
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"https://www.myshiptracking.com/requests/autocomplete.php?type=1&site=1&q={mmsi}",
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'},
                timeout=10.0
            )
            data = res.json()
            if data and len(data) > 0:
                ship = data[0]
                name = ship.get("NAME")
                portrait_id = ship.get("PORTRAIT")

                async with aiosqlite.connect(DB_PATH) as db:
                    if name:
                        await db.execute('UPDATE ships SET name = ? WHERE mmsi = ?', (name, mmsi))
                    
                    has_image = False
                    if portrait_id and portrait_id != '0':
                        img_url = f"https://static.myshiptracking.com/images/vessels/small/{portrait_id}.jpg"
                        local_filename = f"{mmsi}.jpg"
                        local_path = os.path.join(IMAGES_DIR, local_filename)
                        
                        try:
                            img_res = await client.get(img_url, timeout=10.0)
                            if img_res.status_code == 200:
                                with open(local_path, "wb") as f:
                                    f.write(img_res.content)
                                logger.info(f"[Enrichment] Downloaded image for {mmsi} from MyShipTracking")
                                await db.execute('UPDATE ships SET image_url = ? WHERE mmsi = ?', (f"/images/{local_filename}", mmsi))
                                has_image = True
                        except Exception as e:
                            logger.error(f"[Enrichment] Failed to download MST image for {mmsi}: {e}")
                    
                    await db.execute("UPDATE ships SET image_fetched_at = CURRENT_TIMESTAMP WHERE mmsi = ?", (mmsi,))
                    await db.commit()

                if not has_image:
                    success = await try_minglarn_image(mmsi)
                    if not success:
                        success = await try_marinetraffic_image(mmsi)
                        if not success:
                            await handle_fallback_image(mmsi)
            else:
                success = await try_minglarn_image(mmsi)
                if not success:
                    success = await try_marinetraffic_image(mmsi)
                    if not success:
                        await handle_fallback_image(mmsi)
                
    except Exception as e:
        logger.error(f"[Enrichment] Error during enrichment for {mmsi}: {e}")
        success = await try_minglarn_image(mmsi)
        if not success:
            success = await try_marinetraffic_image(mmsi)
            if not success:
                await handle_fallback_image(mmsi)
    finally:
        if mmsi in active_lookups:
            active_lookups.remove(mmsi)

# Processing logic
async def process_ais_data(data: dict):
    mmsi_val = data.get("mmsi")
    if not mmsi_val:
        return
    mmsi_str = str(mmsi_val)
    msg_type = data.get("type", 0)
    lat = data.get("lat")
    lon = data.get("lon")

    ship_name = data.get("shipname") or data.get("name")

    # ── Safety Messages (Type 12 & 14) — broadcast to all WebSocket clients ──
    if data.get("is_safety"):
        safety_msg = {
            "type": "safety_alert",
            "mmsi": mmsi_str,
            "text": data.get("safety_text", ""),
            "is_broadcast": data.get("is_broadcast_alert", False),
            "timestamp": int(datetime.now().timestamp() * 1000)
        }
        for ws in list(connected_clients):
            try:
                await ws.send_json(safety_msg)
            except Exception:
                pass
        return

    # ── Static data without position (Type 5, 24) — update DB only ──
    if msg_type in [5, 24] and lat is None:
        asyncio.create_task(enrich_ship_data(mmsi_str))
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                'INSERT OR IGNORE INTO ships (mmsi, name, callsign, last_seen) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
                (mmsi_str, ship_name, data.get("callsign"))
            )
            update_fields = ["last_seen = CURRENT_TIMESTAMP"]
            update_values = []
            if ship_name:
                update_fields.append("name = ?")
                update_values.append(ship_name)
            if data.get("callsign"):
                update_fields.append("callsign = ?")
                update_values.append(data.get("callsign"))
            ship_type_val = data.get("ship_type") or data.get("shiptype")
            if ship_type_val is not None:
                update_fields.append("type = ?")
                update_values.append(ship_type_val)
            if data.get("destination"):
                update_fields.append("destination = ?")
                update_values.append(data.get("destination"))
            if data.get("imo"):
                update_fields.append("imo = ?")
                update_values.append(data.get("imo"))
            update_values.append(mmsi_str)
            await db.execute(f'UPDATE ships SET {", ".join(update_fields)} WHERE mmsi = ?', tuple(update_values))

            # Save dimensions if available (usually from Type 5 or 24)
            to_bow = data.get("to_bow")
            to_stern = data.get("to_stern")
            to_port = data.get("to_port")
            to_starboard = data.get("to_starboard")
            if to_bow is not None and to_stern is not None:
                length = to_bow + to_stern
                if length > 0:
                    await db.execute("UPDATE ships SET length = ? WHERE mmsi = ?", (length, mmsi_str))
            if to_port is not None and to_starboard is not None:
                width = to_port + to_starboard
                if width > 0:
                    await db.execute("UPDATE ships SET width = ? WHERE mmsi = ?", (width, mmsi_str))
            
            await db.commit()
        return

    # ── Position-bearing messages (require lat/lon) ──
    if lat is None or lon is None:
        return
        
    settings = await get_all_settings()
    origin_lat_str = settings.get("origin_lat")
    origin_lon_str = settings.get("origin_lon")

    is_meteo = data.get("is_meteo", False) or msg_type in [4, 8]
    is_aton = data.get("is_aton", False)
    
    asyncio.create_task(enrich_ship_data(mmsi_str))
    
    ship_data = {
        "mmsi": mmsi_str,
        "lat": lat,
        "lon": lon,
        "sog": data.get("speed") or data.get("sog"),
        "cog": data.get("course") or data.get("cog"),
        "heading": data.get("heading"),
        "name": ship_name,
        "callsign": data.get("callsign"),
        "shiptype": data.get("ship_type") or data.get("shiptype"),
        "status_text": data.get("status_text") or data.get("status"),
        "ship_type_text": data.get("ship_type_text"),
        "ship_category": data.get("ship_category"),
        "country_code": data.get("country_code"),
        "timestamp": int(datetime.now().timestamp() * 1000),
        "is_meteo": is_meteo,
        "is_aton": is_aton,
        "is_sar": data.get("is_sar", False),
        "aton_type": data.get("aton_type"),
        "aton_type_text": data.get("aton_type_text"),
        "altitude": data.get("altitude"),
        "wind_speed": data.get("wind_speed"),
        "wind_gust": data.get("wind_gust"),
        "wind_direction": data.get("wind_direction"),
        "water_level": data.get("water_level"),
        "destination": data.get("destination"),
        "draught": data.get("draught"),
    }

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute('INSERT OR IGNORE INTO ships (mmsi, name, callsign, last_seen) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', (mmsi_str, ship_name, data.get("callsign")))
        
        # Build update query dynamically
        update_fields = ["last_seen = CURRENT_TIMESTAMP"]
        update_values = []
        if ship_name:
            update_fields.append("name = ?")
            update_values.append(ship_name)
        if data.get("callsign"):
            update_fields.append("callsign = ?")
            update_values.append(data.get("callsign"))
        if ship_data["shiptype"] is not None:
            update_fields.append("type = ?")
            update_values.append(ship_data["shiptype"])
        if ship_data["status_text"]:
            update_fields.append("status_text = ?")
            update_values.append(ship_data["status_text"])
        if ship_data["country_code"]:
            update_fields.append("country_code = ?")
            update_values.append(ship_data["country_code"])
        if lat is not None:
            update_fields.append("latitude = ?")
            update_values.append(lat)
        if lon is not None:
            update_fields.append("longitude = ?")
            update_values.append(lon)
        if ship_data.get("sog") is not None:
            update_fields.append("sog = ?")
            update_values.append(ship_data["sog"])
        if ship_data.get("cog") is not None:
            update_fields.append("cog = ?")
            update_values.append(ship_data["cog"])
        if ship_data.get("heading") is not None:
            update_fields.append("heading = ?")
            update_values.append(ship_data["heading"])
            
        update_values.append(mmsi_str)
        await db.execute(f'UPDATE ships SET {", ".join(update_fields)} WHERE mmsi = ?', tuple(update_values))
        
        # Read back whatever data we lacked in this specific incoming packet
        async with db.execute('SELECT image_url, name, type, status_text, country_code, length, width, destination, draught FROM ships WHERE mmsi = ?', (mmsi_str,)) as cursor:
            row = await cursor.fetchone()
            if row:
                ship_data["imageUrl"] = row[0] if row[0] else "/images/0.jpg"
                if not ship_name and row[1]:
                    ship_data["name"] = row[1]
                if ship_data["shiptype"] is None and row[2] is not None:
                    ship_data["shiptype"] = row[2]
                if not ship_data["status_text"] and row[3]:
                    ship_data["status_text"] = row[3]
                if not ship_data["country_code"] and row[4]:
                    ship_data["country_code"] = row[4]
                ship_data["length"] = row[5]
                ship_data["width"] = row[6]
                if not ship_data["destination"] and row[7]:
                    ship_data["destination"] = row[7]
                if not ship_data["draught"] and row[8]:
                    ship_data["draught"] = row[8]
        
        # Ensure ship_type_text is always populated
        if not ship_data.get("ship_type_text") and ship_data.get("shiptype") is not None:
            try:
                code = int(ship_data["shiptype"])
                ship_data["ship_type_text"] = get_ship_type_name(code)
                ship_data["ship_category"] = get_ship_category(code)
            except (ValueError, TypeError):
                pass

        await db.commit()
        
        # Sektor Range Tracking
        if origin_lat_str and origin_lon_str and not is_meteo:
            try:
                olat = float(origin_lat_str)
                olon = float(origin_lon_str)
                dist = haversine_distance(olat, olon, lat, lon)
                
                # Max valid range is 200 Nm (approx 370.4 km). Anything over is TROPO or noise.
                MAX_VALID_RANGE_KM = 370.4
                if dist >= 1.0 and dist <= MAX_VALID_RANGE_KM:
                    bearing = calculate_bearing(olat, olon, lat, lon)
                    SECTORS = 72
                    sector = int(bearing // (360 / SECTORS)) % SECTORS
                    
                    # Update Sector distance if it breaks previous record
                    async with db.execute('SELECT range_km_24h, range_km_alltime FROM coverage_sectors WHERE sector_id = ?', (sector,)) as cursor:
                        row = await cursor.fetchone()
                        
                        rng_24h = row[0] if row else 0.0
                        rng_all = row[1] if row else 0.0
                        
                        changed = False
                        if dist > rng_24h:
                            rng_24h = dist
                            changed = True
                        if dist > rng_all:
                            rng_all = dist
                            changed = True
                            
                        if changed or not row:
                            await db.execute('''
                                INSERT INTO coverage_sectors (sector_id, range_km_24h, range_km_alltime, last_updated)
                                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                                ON CONFLICT(sector_id) DO UPDATE SET 
                                    range_km_24h = ?,
                                    range_km_alltime = ?,
                                    last_updated = CURRENT_TIMESTAMP
                            ''', (sector, rng_24h, rng_all, rng_24h, rng_all))
                            await db.commit()
                elif dist > MAX_VALID_RANGE_KM:
                    # Log tropo/anomaly but don't update range records
                    logging.info(f"Anomalous range detected (TROPO?): {dist:.1f} km for ship {mmsi_str} | ship_pos=({lat},{lon}) station=({olat},{olon})")
            except ValueError:
                pass

    if not is_meteo:
        await broadcast(ship_data)


# UDP NMEA Listener & Forwarder
class UDPProtocol(asyncio.DatagramProtocol):
    def connection_made(self, transport):
        self.transport = transport
        logger.info(f"UDP server listening on port {UDP_PORT}")
        self.settings = {}
        
        # Initialize custom AisStreamManager for puzzle messages & Swedish weather
        self.stream_manager = AisStreamManager()
        self.stream_manager.on_decode(self.handle_parsed_custom)
        
        asyncio.create_task(self.update_settings_loop())

    def handle_parsed_custom(self, decoded_data: dict):
        asyncio.create_task(process_ais_data(decoded_data))

    async def update_settings_loop(self):
        while True:
            self.settings = await get_all_settings()
            await asyncio.sleep(5)

    def datagram_received(self, data, addr):
        if MOCK_MODE:
            return
        
        message = data.decode('utf-8', errors='ignore').strip()
        
        # AIS-catcher may send multiple NMEA sentences in a single UDP packet
        for line in message.splitlines():
            line = line.strip()
            if line:
                # Custom decoder handles ALL AIS message types (1-27)
                self.stream_manager.process_sentence(line)
        
        # Forwarding logic
        if self.settings.get("forward_enabled") == "true":
            fwd_ip = self.settings.get("forward_ip")
            fwd_port = self.settings.get("forward_port")
            if fwd_ip and fwd_port:
                try:
                    forwarding_socket.sendto(data, (fwd_ip, int(fwd_port)))
                except Exception:
                    pass

# MQTT Client Loop
async def mqtt_loop():
    global mqtt_connected
    while True:
        settings = await get_all_settings()
        if settings["mqtt_enabled"] != "true" or not settings["mqtt_url"]:
            mqtt_connected = False
            await asyncio.sleep(5)
            continue

        try:
            logger.info(f"Connecting to MQTT broker at {settings['mqtt_url']}...")
            url_parts = settings["mqtt_url"].replace("mqtt://", "").replace("mqtts://", "").split(":")
            host = url_parts[0]
            port = int(url_parts[1]) if len(url_parts) > 1 else 1883
            
            async with aiomqtt.Client(
                hostname=host,
                port=port,
                username=settings["mqtt_user"] or None,
                password=settings["mqtt_pass"] or None
            ) as client:
                mqtt_connected = True
                await broadcast({"type": "mqtt_status", "connected": True})
                logger.info(f"Connected to MQTT broker. Subscribing to {settings['mqtt_topic']}")
                
                await client.subscribe(settings["mqtt_topic"])
                
                async for message in client.messages:
                    try:
                        payload = json.loads(message.payload.decode())
                        asyncio.create_task(process_ais_data(payload))
                    except Exception:
                        pass
        except aiomqtt.MqttError as err:
            logger.error(f"MQTT error: {err}")
            mqtt_connected = False
            await broadcast({"type": "mqtt_status", "connected": False})
            await asyncio.sleep(5)
        except Exception as err:
            logger.error(f"Unexpected MQTT error: {err}")
            mqtt_connected = False
            await asyncio.sleep(5)

def restart_mqtt():
    global mqtt_client_task
    if mqtt_client_task:
        mqtt_client_task.cancel()
    mqtt_client_task = asyncio.create_task(mqtt_loop())

# Mock Mode Generator 
async def mock_mode_loop():
    import random
    mock_lat = 59.3293
    mock_lon = 18.0686
    while True:
        settings = await get_all_settings()
        if MOCK_MODE and settings["mqtt_enabled"] != "true":
            mock_lat += (random.random() - 0.5) * 0.001
            mock_lon += (random.random() - 0.5) * 0.001
            await broadcast({
                "mmsi": "265123456",
                "name": "PYTHON GHOST",
                "lat": mock_lat,
                "lon": mock_lon,
                "sog": 5.2,
                "cog": random.random() * 360,
                "timestamp": int(datetime.now().timestamp() * 1000)
            })
        await asyncio.sleep(2)

# Purge Old Database Entries and Images
async def purge_job():
    while True:
        try:
            logger.info("[Purge] Running cleanup of old ships data (>30 days)")
            async with aiosqlite.connect(DB_PATH) as db:
                async with db.execute("SELECT mmsi, image_url FROM ships WHERE last_seen < datetime('now', '-30 days')") as cursor:
                    rows = await cursor.fetchall()
                    for row in rows:
                        image_url = row[1]
                        if image_url:
                            filename = image_url.split('/')[-1]
                            local_path = os.path.join(IMAGES_DIR, filename)
                            if os.path.exists(local_path):
                                os.remove(local_path)
                                logger.info(f"[Purge] Deleted old image: {filename}")
                                
                await db.execute("DELETE FROM ships WHERE last_seen < datetime('now', '-30 days')")
                await db.commit()
        except Exception as e:
            logger.error(f"[Purge] Error: {e}")
            
        await asyncio.sleep(24 * 60 * 60) # Run once daily

# Reset 24h coverage sectors periodically
async def coverage_24h_reset_job():
    while True:
        try:
            async with aiosqlite.connect(DB_PATH) as db:
                # Reset range_km_24h for sectors not updated in the last 24 hours
                await db.execute(
                    "UPDATE coverage_sectors SET range_km_24h = 0.0 WHERE last_updated < datetime('now', '-24 hours')"
                )
                await db.commit()
                logger.info("[Coverage] Reset 24h range for stale sectors")
        except Exception as e:
            logger.error(f"[Coverage] Reset error: {e}")
        await asyncio.sleep(60 * 60) # Run every hour

@app.on_event("startup")
async def startup_event():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute('''CREATE TABLE IF NOT EXISTS ships (
            mmsi TEXT PRIMARY KEY,
            imo TEXT,
            name TEXT,
            callsign TEXT,
            type INTEGER,
            image_url TEXT,
            image_fetched_at DATETIME,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
        )''')
        try:
            await db.execute("ALTER TABLE ships ADD COLUMN image_url TEXT")
        except Exception: pass
        try:
            await db.execute("ALTER TABLE ships ADD COLUMN image_fetched_at DATETIME")
        except Exception: pass
        
        try:
            await db.execute("ALTER TABLE ships ADD COLUMN status_text TEXT")
        except Exception: pass
        
        try:
            await db.execute("ALTER TABLE ships ADD COLUMN country_code TEXT")
        except Exception: pass
        
        try:
            await db.execute("ALTER TABLE ships ADD COLUMN destination TEXT")
        except Exception: pass
        
        try:
            await db.execute("ALTER TABLE ships ADD COLUMN draught REAL")
        except Exception: pass
        
        try:
            await db.execute("ALTER TABLE ships ADD COLUMN latitude REAL")
        except Exception: pass
        try:
            await db.execute("ALTER TABLE ships ADD COLUMN longitude REAL")
        except Exception: pass
        try:
            await db.execute("ALTER TABLE ships ADD COLUMN sog REAL")
        except Exception: pass
        try:
            await db.execute("ALTER TABLE ships ADD COLUMN cog REAL")
        except Exception: pass
        
        # New: ship_history table
        await db.execute('''CREATE TABLE IF NOT EXISTS ship_history (
            mmsi TEXT,
            latitude REAL,
            longitude REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )''')
        await db.execute("CREATE INDEX IF NOT EXISTS idx_ship_history_mmsi_ts ON ship_history (mmsi, timestamp)")

        await db.execute('''CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )''')

        # Settings updates
        # New settings
        await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('history_duration', '60')")
        await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('show_names_on_map', 'true')")
        
        try:
            await db.execute("ALTER TABLE ships ADD COLUMN heading REAL")
        except Exception: pass

        try:
            await db.execute("ALTER TABLE ships ADD COLUMN length REAL")
        except Exception: pass
        try:
            await db.execute("ALTER TABLE ships ADD COLUMN width REAL")
        except Exception: pass
        
        await db.execute('''CREATE TABLE IF NOT EXISTS coverage_sectors (
            sector_id INTEGER PRIMARY KEY,
            range_km_24h REAL DEFAULT 0.0,
            range_km_alltime REAL DEFAULT 0.0,
            last_updated DATETIME
        )''')
        await db.commit()

    loop = asyncio.get_running_loop()
    await loop.create_datagram_endpoint(lambda: UDPProtocol(), local_addr=('0.0.0.0', UDP_PORT))
    
    restart_mqtt()
    asyncio.create_task(mock_mode_loop())
    asyncio.create_task(purge_job())
    asyncio.create_task(coverage_24h_reset_job())

# API Endpoints
@app.get("/api/ships")
async def get_ships():
    settings = await get_all_settings()
    timeout_mins = int(settings.get("ship_timeout", 60))
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        
        # Get history duration setting
        cursor = await db.execute("SELECT value FROM settings WHERE key='history_duration'")
        row = await cursor.fetchone()
        duration_min = int(row["value"]) if row else 60

        cursor = await db.execute(f"SELECT * FROM ships WHERE last_seen >= datetime('now', '-{timeout_mins} minutes') AND latitude IS NOT NULL AND longitude IS NOT NULL")
        rows = await cursor.fetchall()
        result = []
        for row in rows:
            try:
                d = dict(row)
                mmsi = d["mmsi"]
                
                # Fetch history for this ship (timestamp is in ms, duration is in min)
                cutoff_ms = int(datetime.now().timestamp() * 1000) - (duration_min * 60 * 1000)
                h_cursor = await db.execute(
                    "SELECT latitude, longitude FROM ship_history WHERE mmsi=? AND timestamp > ? ORDER BY timestamp ASC",
                    (mmsi, cutoff_ms)
                )
                h_rows = await h_cursor.fetchall()
                d["history"] = [[r["latitude"], r["longitude"]] for r in h_rows]
                
                if d.get("image_url"):
                    d["imageUrl"] = d["image_url"]
                else:
                    d["imageUrl"] = "/images/0.jpg"
                
                # Convert string last_seen to numeric timestamp (epoch seconds)
                if d.get("last_seen"):
                    try:
                        # SQLite datetime('now') returns UTC string
                        dt = datetime.strptime(d["last_seen"], "%Y-%m-%d %H:%M:%S")
                        d["timestamp"] = dt.timestamp() * 1000 # Convert to JS milliseconds
                    except Exception:
                        d["timestamp"] = int(datetime.now().timestamp() * 1000)
                else:
                    d["timestamp"] = int(datetime.now().timestamp() * 1000)

                if d.get("type") is not None:
                    d["shiptype"] = d["type"]
                    try:
                        code = int(d["type"])
                        d["ship_type_text"] = get_ship_type_name(code)
                        d["ship_category"] = get_ship_category(code)
                    except (ValueError, TypeError):
                        pass
                
                # Map DB lat/lon to frontend format
                if d.get("latitude") is not None and d.get("longitude") is not None:
                    d["lat"] = d["latitude"]
                    d["lon"] = d["longitude"]
                
                # Ensure new fields are present
                d["length"] = row["length"]
                d["width"] = row["width"]
                d["destination"] = row["destination"]
                d["draught"] = row["draught"]
                
                result.append(d)
            except Exception as e:
                logger.error(f"Error processing ship row: {e}")
                continue
        return result

@app.get("/api/settings")
async def get_settings_api():
    return await get_all_settings()

@app.post("/api/settings")
async def set_settings_api(settings: dict):
    old_settings = await get_all_settings()
    for key, value in settings.items():
        if value is not None:
            await set_setting(key, str(value))
            
    # Reset 24h range ONLY if origin has actually changed
    new_lat = settings.get("origin_lat")
    new_lon = settings.get("origin_lon")
    
    if new_lat is not None or new_lon is not None:
        if str(new_lat) != old_settings.get("origin_lat") or str(new_lon) != old_settings.get("origin_lon"):
             logger.info(f"[Settings] Station origin changed from ({old_settings.get('origin_lat')},{old_settings.get('origin_lon')}) to ({new_lat},{new_lon}). Resetting coverage.")
             async with aiosqlite.connect(DB_PATH) as db:
                await db.execute('UPDATE coverage_sectors SET range_km_24h = 0.0, range_km_alltime = 0.0')
                await db.commit()
            
    restart_mqtt()
    return {"success": True, "settings": await get_all_settings()}

@app.post("/api/coverage/reset")
async def reset_coverage():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute('UPDATE coverage_sectors SET range_km_24h = 0.0, range_km_alltime = 0.0')
        await db.commit()
    logger.info("[Coverage] Manual reset of all range data")
    return {"success": True}

@app.get("/api/coverage")
async def get_coverage():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT sector_id, range_km_24h, range_km_alltime FROM coverage_sectors ORDER BY sector_id ASC") as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

@app.get("/api/status")
async def get_status():
    uptime_seconds = 0
    try:
        with open('/proc/uptime', 'r') as f:
            uptime_seconds = float(f.readline().split()[0])
    except:
        pass
    
    settings = await get_all_settings()
    return {
        "sdr": not MOCK_MODE,
        "mock_mode": MOCK_MODE,
        "mqtt": settings["mqtt_enabled"] == "true",
        "uptime": uptime_seconds
    }

@app.websocket("/ws")
@app.websocket("/")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.add(websocket)
    try:
        await websocket.send_text(json.dumps({"type": "status", "message": "Connected to FastAPI"}))
        await websocket.send_text(json.dumps({"type": "mqtt_status", "connected": mqtt_connected}))
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in connected_clients:
            connected_clients.remove(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, log_level=LOG_LEVEL.lower())
