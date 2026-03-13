import asyncio
import time
import json
import random
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
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute('PRAGMA journal_mode=WAL')
        await db.execute('PRAGMA busy_timeout=30000')
        yield db

# Settings Helpers
async def cleanup_history_task():
    """Background task to remove history entries older than 24 hours"""
    while True:
        try:
            async with db_session() as db:
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
    async with db_session() as db:
        async with db.execute('SELECT value FROM settings WHERE key = ?', (key,)) as cursor:
            row = await cursor.fetchone()
            return row[0] if row else default_val

async def set_setting(key: str, value: str):
    async with db_session() as db:
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
        "sdr_gain": await get_setting("sdr_gain", "auto"),
        "ship_size": await get_setting("ship_size", "1.0"),
        "circle_size": await get_setting("circle_size", "1.0"),
        "trail_size": await get_setting("trail_size", "1.0"),
        "aisstream_enabled": await get_setting("aisstream_enabled", "false"),
        "aisstream_api_key": await get_setting("aisstream_api_key", os.getenv("AISSTREAM_API_KEY", "")),
        "trail_mode": await get_setting("trail_mode", "all"),
        "show_aisstream_on_map": await get_setting("show_aisstream_on_map", "true"),
        "sdr_enabled": await get_setting("sdr_enabled", "true"),
        "udp_enabled": await get_setting("udp_enabled", "true"),
        "udp_port": await get_setting("udp_port", str(UDP_PORT)),
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


# ── AisStream Integration ──
def translate_aisstream_message(msg: dict) -> dict:
    """
    Translates AisStream.io JSON format to internal dict format.
    """
    try:
        msg_type_str = msg.get("MessageType")
        meta = msg.get("MetaData", {})
        body = msg.get("Message", {}).get(msg_type_str, {})
        
        mmsi = meta.get("MMSI")
        if not mmsi: return None
        
        # Internal types: 
        # PositionReport: 1, ShipStaticData: 5, AidsToNavigationReport: 21, SAR: 9
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

async def aisstream_loop():
    """
    Background loop connecting to AisStream.io WebSocket.
    """
    import websockets
    
    logger.info("AisStream.io background task started.")
    
    while True:
        try:
            settings = await get_all_settings()
            enabled = settings.get("aisstream_enabled") == "true"
            api_key = settings.get("aisstream_api_key")
            
            if not enabled:
                logger.debug("AisStream.io is disabled in settings.")
                await asyncio.sleep(15)
                continue
                
            if not api_key:
                logger.warning("AisStream.io is enabled but API key is missing.")
                await asyncio.sleep(15)
                continue
                
            url = "wss://stream.aisstream.io/v0/stream"
            
            logger.info(f"Connecting to AisStream.io at {url}...")
            async with websockets.connect(url, ping_interval=20, ping_timeout=20) as ws:
                # Subscription Message
                sub_msg = {
                    "APIKey": api_key,
                    "BoundingBoxes": [[[56.5, 15.5], [60.0, 21.0]]],
                    "FiltersShipMMSI": [],
                    "FilterMessageTypes": [
                        "PositionReport", 
                        "ShipStaticData", 
                        "AidsToNavigationReport", 
                        "StandardSearchAndRescueAircraftReport",
                        "SafetyBroadcastMessage"
                    ]
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

def get_country_code_from_mmsi(mmsi_str: str) -> str:
    """Returns ISO country code (2 letters) based on MMSI prefix (MID)."""
    if not mmsi_str or len(mmsi_str) < 3:
        return None
    
    mid = mmsi_str[:3]
    mid_map = {
        # Europe
        "201": "al", "202": "ad", "203": "at", "204": "pt", "205": "be", "206": "by", "207": "bg", "208": "va",
        "209": "cy", "210": "cy", "212": "cy", "229": "mt", "215": "mt", "248": "mt", "249": "mt", "256": "mt",
        "211": "de", "218": "de", "213": "ge", "214": "md", "216": "am", "219": "dk", "220": "dk", "231": "fo",
        "224": "es", "225": "es", "226": "fr", "227": "fr", "228": "fr", "230": "fi", "232": "gb", "233": "gb",
        "234": "gb", "235": "gb", "236": "gi", "237": "gr", "239": "gr", "240": "gr", "241": "gr", "238": "hr",
        "242": "ma", "243": "hu", "244": "nl", "245": "nl", "246": "nl", "247": "it", "250": "ie", "251": "is",
        "252": "li", "253": "lu", "254": "mc", "255": "pt", "257": "no", "258": "no", "259": "no", "261": "pl",
        "262": "me", "263": "pt", "264": "ro", "265": "se", "266": "se", "267": "sk", "268": "sm", "269": "ch",
        "270": "cz", "271": "tr", "272": "ua", "273": "ru", "274": "mk", "275": "lv", "276": "ee", "277": "lt",
        "278": "si", "279": "rs",
        # North / Central America
        "301": "ai", "303": "us", "304": "ag", "305": "ag", "306": "bq", "307": "aw", "308": "bs", "309": "bs",
        "311": "bs", "310": "bm", "312": "bz", "314": "bb", "316": "ca", "319": "ky", "321": "cr", "323": "cu",
        "325": "dm", "327": "do", "329": "gp", "330": "gd", "331": "gl", "332": "gt", "334": "hn", "336": "ht",
        "338": "us", "366": "us", "367": "us", "368": "us", "369": "us", "339": "jm", "341": "kn", "343": "lc",
        "345": "mx", "347": "mq", "348": "ms", "350": "ni", "351": "pa", "352": "pa", "353": "pa", "354": "pa",
        "355": "pa", "356": "pa", "357": "pa", "370": "pa", "371": "pa", "372": "pa", "373": "pa", "358": "pr",
        "359": "sv", "361": "pm", "362": "tt", "378": "vg", "379": "vi",
        # Asia
        "401": "af", "405": "bd", "408": "bh", "410": "bt", "412": "cn", "413": "cn", "414": "cn", "416": "cn",
        "417": "ck", "418": "fj", "419": "pf", "421": "in", "423": "az", "427": "ir", "428": "iq", "431": "jp",
        "432": "jp", "434": "jp", "436": "jp", "437": "kr", "438": "kp", "440": "mo", "441": "my", "443": "mv",
        "445": "mu", "447": "mn", "449": "mm", "451": "np", "453": "om", "455": "pk", "457": "ph", "459": "qa",
        "461": "sa", "463": "sg", "466": "lk", "468": "sy", "470": "tw", "471": "th", "473": "tl", "475": "ae",
        "477": "vn", "478": "ba",
        # Oceania / SE Asia
        "501": "tf", "503": "au", "508": "bn", "514": "kh", "515": "kh", "536": "mp", "559": "as",
        # Africa / Atlantic
        "601": "za", "603": "ao", "605": "dz", "608": "sh", "609": "bi", "610": "bj", "611": "bw", "613": "cm",
        "616": "km", "617": "cv", "618": "cf", "619": "td", "620": "cg", "621": "dj", "622": "eg", "624": "et",
        "625": "er", "626": "gq", "627": "ga", "629": "gm", "630": "gh", "631": "gn", "632": "gw", "633": "bf",
        "634": "ke", "635": "ls", "636": "lr", "637": "ly", "642": "mg", "644": "mw", "645": "ml", "647": "mr",
        "649": "mu", "650": "mz", "654": "na", "655": "ne", "656": "ng", "657": "rw", "659": "sn", "660": "sc",
        "661": "sl", "662": "so", "663": "sd", "664": "sz", "665": "tz", "666": "tg", "667": "tn", "668": "ug",
        "669": "cd", "670": "zm", "671": "zw", "672": "na", "674": "tz", "675": "et", "676": "so", "677": "tz",
        "678": "st", "679": "ci",
        # South America
        "701": "ar", "710": "br", "720": "bo", "725": "cl", "730": "co", "735": "ec", "740": "fk", "745": "gy",
        "750": "py", "755": "pe", "760": "sr", "765": "uy", "770": "ve"
    }
    return mid_map.get(mid)

# Image Fetching Logic
async def handle_fallback_image(mmsi: str):
    source_file = os.path.join(IMAGES_DIR, '0.jpg')
    if os.path.exists(source_file):
        try:
            # Instead of copying, we just point to the default image in the DB
            # This allows us to retry fetching a real image later
            async with db_session() as db:
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
                async with db_session() as db:
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
                async with db_session() as db:
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
        async with db_session() as db:
            async with db.execute('SELECT image_fetched_at, image_url, manual_image FROM ships WHERE mmsi = ?', (mmsi,)) as cursor:
                row = await cursor.fetchone()
                image_url = None
                fetch_date = None
                if row:
                    manual_image = row[2]
                    if manual_image:
                        active_lookups.remove(mmsi)
                        return

                    if row[0]:
                        fetch_date = datetime.strptime(row[0], "%Y-%m-%d %H:%M:%S")
                    image_url = row[1]
                    
                    # If we have a REAL image (not the placeholder 0.jpg and not empty)
                    if image_url and image_url != "/images/0.jpg" and fetch_date:
                        # Refresh real images every 30 days
                        if (datetime.now() - fetch_date).days < 30:
                            active_lookups.remove(mmsi)
                            return
                    elif fetch_date:
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
            try:
                data = res.json()
            except (json.JSONDecodeError, AttributeError):
                logger.warning(f"[Enrichment] MyShipTracking returned invalid JSON for {mmsi}")
                data = []

            if data and isinstance(data, list) and len(data) > 0:
                ship = data[0]
                name = ship.get("NAME")
                portrait_id = ship.get("PORTRAIT")

                async with db_session() as db:
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
                        await asyncio.sleep(2.0 + random.random())
                        success = await try_marinetraffic_image(mmsi)
                        if not success:
                            await handle_fallback_image(mmsi)
            else:
                success = await try_minglarn_image(mmsi)
                if not success:
                    await asyncio.sleep(2.0 + random.random())
                    success = await try_marinetraffic_image(mmsi)
                    if not success:
                        await handle_fallback_image(mmsi)
                
    except Exception as e:
        logger.error(f"[Enrichment] Error during enrichment for {mmsi}: {e}")
        success = await try_minglarn_image(mmsi)
        if not success:
            await asyncio.sleep(2.0 + random.random())
            success = await try_marinetraffic_image(mmsi)
            if not success:
                await handle_fallback_image(mmsi)
    finally:
        if mmsi in active_lookups:
            active_lookups.remove(mmsi)

# Enrichment Worker
async def enrichment_worker():
    """
    Background worker that processes the enrichment queue sequentially with a delay
    to avoid overwhelming external AIS image providers.
    """
    logger.info("Enrichment worker started.")
    while True:
        try:
            mmsi = await enrichment_queue.get()
            try:
                await enrich_ship_data(mmsi)
            finally:
                if mmsi in queued_mmsis:
                    queued_mmsis.remove(mmsi)
                enrichment_queue.task_done()
                
            # Polite delay between requests (5-7 seconds with jitter)
            await asyncio.sleep(5.0 + random.random() * 2.0)
        except Exception as e:
            logger.error(f"Error in enrichment_worker: {e}")
            await asyncio.sleep(5.0)

# Processing logic
async def process_ais_data(data: dict):
    mmsi_val = data.get("mmsi")
    if not mmsi_val:
        return
    msg_type = data.get("type", 0)
    
    # ── IMMEDIATE DISCARD for Type 8 (Binary Broadcast / Meteo) ──
    if msg_type == 8:
        return

    mmsi_str = str(mmsi_val)
    lat = data.get("lat")
    lon = data.get("lon")

    ship_name = data.get("shipname") or data.get("name")
    settings = await get_all_settings()
    
    source = data.get("source", "local")
    
    # ── Deduplication for AisStream ──
    if source == "aisstream":
        # Discard if we have fresh local data (within last 10 minutes)
        if mmsi_str in local_vessels:
            if time.time() - local_vessels[mmsi_str] < 600:
                return
    else:
        # Update local tracking
        local_vessels[mmsi_str] = time.time()

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
        if mmsi_str not in queued_mmsis:
            queued_mmsis.add(mmsi_str)
            enrichment_queue.put_nowait(mmsi_str)
        async with db_session() as db:
            # Check if ship exists and when it was last seen for reset_count
            async with db.execute('SELECT last_seen FROM ships WHERE mmsi = ?', (mmsi_str,)) as cursor:
                row = await cursor.fetchone()
                reset_count = False
                if row:
                    try:
                        last_seen_dt = datetime.strptime(row[0], "%Y-%m-%d %H:%M:%S")
                        diff_seconds = (datetime.utcnow() - last_seen_dt).total_seconds()
                        timeout_mins = int(settings.get("ship_timeout", 60))
                        if diff_seconds > (timeout_mins * 60):
                            reset_count = True
                    except Exception: pass

            await db.execute(
                'INSERT OR IGNORE INTO ships (mmsi, name, callsign, last_seen, message_count) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 0)',
                (mmsi_str, ship_name, data.get("callsign"))
            )
            update_fields = ["last_seen = CURRENT_TIMESTAMP"]
            if reset_count:
                update_fields.append("previous_seen = last_seen")
                update_fields.append("message_count = 1")
            else:
                update_fields.append("message_count = message_count + 1")
            update_values = []
            if ship_name:
                update_fields.append("name = ?")
                update_values.append(ship_name)
            if data.get("callsign"):
                update_fields.append("callsign = ?")
                update_values.append(data.get("callsign"))
            if (data.get("ship_type") or data.get("shiptype")) is not None:
                update_fields.append("type = ?")
                update_values.append(data.get("ship_type") or data.get("shiptype"))
            
            # Persist source
            update_fields.append("source = ?")
            update_values.append(source)

            if data.get("destination"):
                update_fields.append("destination = ?")
                update_values.append(data.get("destination"))
            if data.get("eta"):
                update_fields.append("eta = ?")
                update_values.append(data.get("eta"))
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
        
    origin_lat_str = settings.get("origin_lat")
    origin_lon_str = settings.get("origin_lon")

    is_meteo = data.get("is_meteo", False) or msg_type in [4, 8]
    if is_meteo:
        return
        
    is_aton = data.get("is_aton", False)
    
    # NEW: Use enrichment queue instead of starting immediate task
    if mmsi_str not in queued_mmsis:
        queued_mmsis.add(mmsi_str)
        enrichment_queue.put_nowait(mmsi_str)
    
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
        "country_code": data.get("country_code") or get_country_code_from_mmsi(mmsi_str),
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
        "source": source,
    }

    # Validate Navigational Status against Speed (SOG)
    # If reporting "Under way" (0 or 8) but SOG is essentially 0, override to "Moored" (5)
    sog_val = ship_data.get("sog")
    if sog_val is not None and sog_val < 0.1:
        # 0 = Under way using engine, 8 = Under way sailing
        current_status = data.get("nav_status")
        if current_status in [0, 8]:
            ship_data["status_text"] = "Moored (Stationary)"
            ship_data["nav_status"] = 5

    async with db_session() as db:
        # Check if ship exists and when it was last seen
        async with db.execute('SELECT last_seen, message_count FROM ships WHERE mmsi = ?', (mmsi_str,)) as cursor:
            row = await cursor.fetchone()
            reset_count = False
            if row:
                last_seen_str = row[0]
                try:
                    # Current timestamp in UTC for comparison with DB last_seen
                    last_seen_dt = datetime.strptime(last_seen_str, "%Y-%m-%d %H:%M:%S")
                    diff_seconds = (datetime.utcnow() - last_seen_dt).total_seconds()
                    
                    timeout_mins = int(settings.get("ship_timeout", 60))
                    if diff_seconds > (timeout_mins * 60):
                        reset_count = True
                        logger.info(f"Vessel {mmsi_str} re-acquired after timeout ({int(diff_seconds)}s > {timeout_mins}m). Resetting Seen count.")
                except Exception as e:
                    logger.error(f"Error checking last_seen for {mmsi_str}: {e}")

        is_new_vessel = row is None
        await db.execute('INSERT OR IGNORE INTO ships (mmsi, name, callsign, last_seen, message_count) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 0)', (mmsi_str, ship_name, data.get("callsign")))
        
        # Build update query dynamically
        update_fields = ["last_seen = CURRENT_TIMESTAMP"]
        if reset_count:
            update_fields.append("previous_seen = last_seen")
            update_fields.append("message_count = 1")
        else:
            update_fields.append("message_count = message_count + 1")
            
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
        if data.get("rot") is not None:
            update_fields.append("rot = ?")
            update_values.append(data.get("rot"))
            
        # Persist source
        update_fields.append("source = ?")
        update_values.append(source)
            
        update_values.append(mmsi_str)
        await db.execute(f'UPDATE ships SET {", ".join(update_fields)} WHERE mmsi = ?', tuple(update_values))
        
        # Save position to ship_history if it moved significantly (>50m) or if no history exists
        now_ms = int(datetime.now().timestamp() * 1000)
        async with db.execute('SELECT latitude, longitude FROM ship_history WHERE mmsi = ? ORDER BY timestamp DESC LIMIT 1', (mmsi_str,)) as cursor:
            row = await cursor.fetchone()
            if not row or haversine_distance(row[0], row[1], lat, lon) > 0.05:
                # Limit history to prevent excessive growth (e.g. keep last 200 points per ship in DB)
                await db.execute('INSERT INTO ship_history (mmsi, latitude, longitude, timestamp) VALUES (?, ?, ?, ?)', (mmsi_str, lat, lon, now_ms))
        
        # ── Statistics Tracking (Daily) ──
        today_date = datetime.utcnow().strftime('%Y-%m-%d')
        
        # Increment total messages for today
        await db.execute('''
            INSERT INTO daily_stats (date, total_messages) VALUES (?, 1)
            ON CONFLICT(date) DO UPDATE SET total_messages = total_messages + 1
        ''', (today_date,))
        
        # Increment hourly status
        current_hour = datetime.utcnow().hour
        await db.execute('''
            INSERT INTO hourly_stats (date, hour, message_count) VALUES (?, ?, 1)
            ON CONFLICT(date, hour) DO UPDATE SET message_count = message_count + 1
        ''', (today_date, current_hour))
        
        # Track unique ships
        try:
            await db.execute('INSERT INTO daily_mmsi (date, mmsi) VALUES (?, ?)', (today_date, mmsi_str))
            # If successful (no UNIQUE constraint violation), increment unique_ships
            update_stats_fields = ["unique_ships = unique_ships + 1"]
            if is_new_vessel:
                update_stats_fields.append("new_ships = new_ships + 1")
            
            await db.execute(f'''
                UPDATE daily_stats SET {", ".join(update_stats_fields)} WHERE date = ?
            ''', (today_date,))
        except Exception:
            pass # MMSI already counted for today
        
        # Read back whatever data we lacked in this specific incoming packet
        async with db.execute('SELECT image_url, name, type, status_text, country_code, length, width, destination, draught, message_count, eta, rot, imo, callsign, previous_seen, manual_image FROM ships WHERE mmsi = ?', (mmsi_str,)) as cursor:
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
                ship_data["message_count"] = row[9]
                ship_data["eta"] = row[10]
                ship_data["rot"] = row[11]
                ship_data["imo"] = row[12]
                ship_data["callsign"] = row[13]
                
                # Previous Seen
                if row[14]:
                    try:
                        ps_dt = datetime.strptime(row[14], "%Y-%m-%d %H:%M:%S")
                        ship_data["previous_seen"] = ps_dt.timestamp() * 1000
                    except Exception: pass
                    
                ship_data["manual_image"] = bool(row[15])
        
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
        stype = ship_data.get("shiptype")
        is_aton_val = ship_data.get("is_aton", False)
        is_aircraft = stype == 9 or stype == 18 or data.get("is_sar", False)

        # AISSTREAM data never updates range stats
        if source != "aisstream" and origin_lat_str and origin_lon_str and not is_meteo and not is_aton_val and not is_aircraft and not mmsi_str.startswith("99"):
            try:
                olat = float(origin_lat_str)
                olon = float(origin_lon_str)
                dist = haversine_distance(olat, olon, lat, lon)
                
                # NEW: Noise filter for Range. 
                # We only count objects that have sent at least 2 messages.
                msg_count = ship_data.get("message_count", 0)
                if msg_count < 2:
                    return # Stop here for range tracking, but ship is still processed for map

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
                            
                            # Update max_range_km in daily_stats if this is a new daily record
                            await db.execute('''
                                UPDATE daily_stats 
                                SET max_range_km = ? 
                                WHERE date = ? AND ? > max_range_km
                            ''', (dist, today_date, dist))
                            
                            await db.commit()
                            await broadcast({
                                "type": "coverage_update",
                                "sector_id": sector,
                                "range_km_24h": rng_24h,
                                "range_km_alltime": rng_all
                            })
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
        self.settings = {}
        # Initialize custom AisStreamManager for puzzle messages & Swedish weather
        self.stream_manager = AisStreamManager()
        self.stream_manager.on_decode(self.handle_parsed_custom)
        asyncio.create_task(self.update_settings_loop())

    def handle_parsed_custom(self, decoded_data: dict):
        decoded_data["source"] = "local"
        asyncio.create_task(process_ais_data(decoded_data))

    async def update_settings_loop(self):
        while True:
            self.settings = await get_all_settings()
            await asyncio.sleep(5)

async def start_udp_listener():
    global udp_server_transport
    loop = asyncio.get_running_loop()
    settings = await get_all_settings()
    port_str = settings.get("udp_port", str(UDP_PORT))
    enabled = settings.get("udp_enabled", "true") == "true"
    
    try:
        port = int(port_str)
    except ValueError:
        port = UDP_PORT
    
    if udp_server_transport:
        logger.info("Closing existing UDP listener...")
        udp_server_transport.close()
        udp_server_transport = None
        
    if not enabled:
        logger.info("UDP Listener is DISABLED in settings.")
        return

    try:
        transport, _ = await loop.create_datagram_endpoint(
            lambda: UDPProtocol(), 
            local_addr=('0.0.0.0', port)
        )
        udp_server_transport = transport
        logger.info(f"UDP server successfully started on port {port}")
    except Exception as e:
        logger.error(f"Failed to start UDP listener on port {port}: {e}")

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
            async with db_session() as db:
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
                
                # Clean up old daily_mmsi records (older than 7 days is enough to prevent huge DB)
                logger.info("[Purge] Cleaning up old daily_mmsi records (>7 days)")
                await db.execute("DELETE FROM daily_mmsi WHERE date < date('now', '-7 days')")
                
                await db.commit()
        except Exception as e:
            logger.error(f"[Purge] Error: {e}")
            
        await asyncio.sleep(24 * 60 * 60) # Run once daily

# Reset 24h coverage sectors periodically
async def coverage_24h_reset_job():
    while True:
        try:
            async with db_session() as db:
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
    
    # Ensure default image 0.jpg exists in IMAGES_DIR
    default_img_path = os.path.join(IMAGES_DIR, "0.jpg")
    backup_img_path = "/app/backend/static/0.jpg"
    if not os.path.exists(default_img_path):
        if os.path.exists(backup_img_path):
            try:
                shutil.copy2(backup_img_path, default_img_path)
                logger.info("Restored default image 0.jpg from backup")
            except Exception as e:
                logger.error(f"Failed to restore 0.jpg: {e}")
        else:
            # If no backup, create an empty placeholder to at least avoid 404
            try:
                with open(default_img_path, 'wb') as f:
                    f.write(b"")
                logger.warning("Placeholder 0.jpg created (backup not found)")
            except Exception as e:
                logger.error(f"Failed to create placeholder 0.jpg: {e}")

    async with db_session() as db:
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
            timestamp INTEGER
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
        await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('units', 'nautical')")
        await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('ship_size', '1.0')")
        await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('circle_size', '1.0')")
        await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('trail_size', '2.0')")
        await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('aisstream_enabled', 'false')")
        await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('aisstream_api_key', '')")
        await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('trail_mode', 'all')")
        await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('show_aisstream_on_map', 'true')")
        await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('sdr_enabled', 'true')")
        await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('udp_enabled', 'true')")
        await db.execute(f"INSERT OR IGNORE INTO settings (key, value) VALUES ('udp_port', '{UDP_PORT}')")
        
        try:
            await db.execute("ALTER TABLE ships ADD COLUMN heading REAL")
        except Exception: pass

        try:
            await db.execute("ALTER TABLE ships ADD COLUMN length REAL")
        except Exception: pass

        try:
            await db.execute("ALTER TABLE ships ADD COLUMN message_count INTEGER DEFAULT 0")
        except Exception: pass
        try:
            await db.execute("ALTER TABLE ships ADD COLUMN width REAL")
        except Exception: pass

        try:
            await db.execute("ALTER TABLE ships ADD COLUMN eta TEXT")
        except Exception: pass

        try:
            await db.execute("ALTER TABLE ships ADD COLUMN rot REAL")
        except Exception: pass

        try:
            await db.execute("ALTER TABLE ships ADD COLUMN source TEXT DEFAULT 'local'")
        except Exception: pass

        try:
            await db.execute("ALTER TABLE ships ADD COLUMN previous_seen DATETIME")
        except Exception: pass
        
        try:
            await db.execute("ALTER TABLE ships ADD COLUMN manual_image BOOLEAN DEFAULT 0")
        except Exception: pass
        
        await db.execute('''CREATE TABLE IF NOT EXISTS coverage_sectors (
            sector_id INTEGER PRIMARY KEY,
            range_km_24h REAL DEFAULT 0.0,
            range_km_alltime REAL DEFAULT 0.0,
            last_updated DATETIME
        )''')
        
        # New: Statistics tracking tables
        await db.execute('''CREATE TABLE IF NOT EXISTS daily_stats (
            date TEXT PRIMARY KEY,
            unique_ships INTEGER DEFAULT 0,
            new_ships INTEGER DEFAULT 0,
            total_messages INTEGER DEFAULT 0,
            max_range_km REAL DEFAULT 0.0
        )''')
        
        try:
            await db.execute("ALTER TABLE daily_stats ADD COLUMN new_ships INTEGER DEFAULT 0")
        except Exception: pass
        
        await db.execute('''CREATE TABLE IF NOT EXISTS daily_mmsi (
            date TEXT,
            mmsi TEXT,
            PRIMARY KEY (date, mmsi)
        )''')

        await db.execute('''CREATE TABLE IF NOT EXISTS hourly_stats (
            date TEXT,
            hour INTEGER,
            message_count INTEGER DEFAULT 0,
            PRIMARY KEY (date, hour)
        )''')
        
        await db.commit()

    loop = asyncio.get_running_loop()
    await start_udp_listener()
    
    restart_mqtt()
    asyncio.create_task(mock_mode_loop())
    asyncio.create_task(purge_job())
    asyncio.create_task(coverage_24h_reset_job())
    asyncio.create_task(aisstream_loop())
    asyncio.create_task(enrichment_worker())

# API Endpoints
@app.get("/api/ships")
async def get_ships():
    settings = await get_all_settings()
    timeout_mins = int(settings.get("ship_timeout", 60))
    async with db_session() as db:
        db.row_factory = aiosqlite.Row
        
        # Get history duration setting
        cursor = await db.execute("SELECT value FROM settings WHERE key='history_duration'")
        row = await cursor.fetchone()
        duration_min = int(row["value"]) if row else 60

        cursor = await db.execute(f"SELECT * FROM ships WHERE last_seen >= datetime('now', '-{timeout_mins} minutes') AND latitude IS NOT NULL AND longitude IS NOT NULL AND (name NOT LIKE '%METEO%' AND name NOT LIKE '%WEATHER%')")
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
                d["eta"] = row["eta"]
                d["rot"] = row["rot"]
                d["imo"] = row["imo"]
                d["callsign"] = row["callsign"]
                d["source"] = row["source"] or "local"
                d["manual_image"] = bool(row["manual_image"])
                
                if d.get("previous_seen"):
                    try:
                        ps_dt = datetime.strptime(d["previous_seen"], "%Y-%m-%d %H:%M:%S")
                        d["previous_seen"] = ps_dt.timestamp() * 1000
                    except Exception: pass
                
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
    logger.info(f"[Settings] Received update request: {list(settings.keys())}")
    old_settings = await get_all_settings()
    for key, value in settings.items():
        if value is not None:
            # Only log important changes to avoid spamming
            if old_settings.get(key) != str(value):
                logger.info(f"[Settings] Updating {key}: {old_settings.get(key)} -> {value}")
            await set_setting(key, str(value))
            
    # Reset 24h range ONLY if origin has actually changed
    new_lat = settings.get("origin_lat")
    new_lon = settings.get("origin_lon")
    
    if new_lat is not None or new_lon is not None:
        if str(new_lat) != old_settings.get("origin_lat") or str(new_lon) != old_settings.get("origin_lon"):
             logger.info(f"[Settings] Station origin changed from ({old_settings.get('origin_lat')},{old_settings.get('origin_lon')}) to ({new_lat},{new_lon}). Resetting coverage.")
             async with db_session() as db:
                await db.execute('UPDATE coverage_sectors SET range_km_24h = 0.0, range_km_alltime = 0.0')
                await db.commit()
            
    if settings.get("udp_port") and str(settings.get("udp_port")) != old_settings.get("udp_port"):
        logger.info(f"[Settings] UDP Port changed to {settings.get('udp_port')}. Restarting listener.")
        asyncio.create_task(start_udp_listener())
    elif settings.get("udp_enabled") and str(settings.get("udp_enabled")) != old_settings.get("udp_enabled"):
        logger.info(f"[Settings] UDP Enabled status changed to {settings.get('udp_enabled')}. Updating listener.")
        asyncio.create_task(start_udp_listener())

    restart_mqtt()
    return {"success": True, "settings": await get_all_settings()}

@app.post("/api/coverage/reset")
async def reset_coverage():
    async with db_session() as db:
        await db.execute('UPDATE coverage_sectors SET range_km_24h = 0.0, range_km_alltime = 0.0')
        await db.commit()
    logger.info("[Coverage] Manual reset of all range data")
    return {"success": True}

@app.get("/api/coverage")
async def get_coverage():
    async with db_session() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT sector_id, range_km_24h, range_km_alltime FROM coverage_sectors ORDER BY sector_id ASC") as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

@app.post("/api/ships/{mmsi}/image")
async def upload_ship_image(mmsi: str, file: UploadFile = File(...)):
    if not mmsi.isdigit():
        return {"success": False, "error": "Invalid MMSI"}
        
    local_filename = f"{mmsi}.jpg"
    local_path = os.path.join(IMAGES_DIR, local_filename)
    
    try:
        with open(local_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        async with db_session() as db:
            await db.execute('''
                UPDATE ships 
                SET image_url = ?, manual_image = 1, image_fetched_at = CURRENT_TIMESTAMP
                WHERE mmsi = ?
            ''', (f"/images/{local_filename}", mmsi))
            await db.commit()
            
        logger.info(f"[API] Manual image uploaded for {mmsi}")
        
        # We broadcast the new image URL immediately so connected clients update
        # We need to construct a minimal ship update message via broadcast
        await broadcast({
            "type": "ais_data",
            "mmsi": mmsi,
            "imageUrl": f"/images/{local_filename}",
            "manual_image": True,
            "timestamp": int(datetime.now().timestamp() * 1000)
        })
        
        return {"success": True, "imageUrl": f"/images/{local_filename}"}
        
    except Exception as e:
        logger.error(f"[API] Error uploading image for {mmsi}: {e}")
        return {"success": False, "error": str(e)}

@app.get("/api/statistics")
async def get_statistics(date: str = None):
    try:
        today_date = datetime.utcnow().strftime('%Y-%m-%d')
        selected_date = date if date else today_date
        
        # Validate date format
        try:
            yesterday_date = (datetime.strptime(selected_date, '%Y-%m-%d') - timedelta(days=1)).strftime('%Y-%m-%d')
        except:
            selected_date = today_date
            yesterday_date = (datetime.strptime(selected_date, '%Y-%m-%d') - timedelta(days=1)).strftime('%Y-%m-%d')
            yesterday_date = (datetime.strptime(selected_date, '%Y-%m-%d') - timedelta(days=1)).strftime('%Y-%m-%d')

        async with db_session() as db:
            db.row_factory = aiosqlite.Row
            
            # 1. Get stats for selected date
            cursor = await db.execute("SELECT unique_ships, new_ships, total_messages, max_range_km FROM daily_stats WHERE date = ?", (selected_date,))
            today_row = await cursor.fetchone()
            today_stats = dict(today_row) if today_row else {"unique_ships": 0, "new_ships": 0, "total_messages": 0, "max_range_km": 0.0}
            
            # 2. Get stats for day before selected for trends
            cursor = await db.execute("SELECT unique_ships, new_ships, total_messages FROM daily_stats WHERE date = ?", (yesterday_date,))
            yest_row = await cursor.fetchone()
            yest_stats = dict(yest_row) if yest_row else {"unique_ships": 0, "new_ships": 0, "total_messages": 0}
            
            # 3. Get all-time records
            cursor = await db.execute("SELECT MAX(unique_ships) as max_ships, MAX(total_messages) as max_msgs, MAX(max_range_km) as max_rng FROM daily_stats")
            all_row = await cursor.fetchone()
            all_time_stats = {
                "unique_ships": all_row["max_ships"] if all_row["max_ships"] else 0,
                "total_messages": all_row["max_msgs"] if all_row["max_msgs"] else 0,
                "max_range_km": round(all_row["max_rng"] if all_row["max_rng"] else 0.0, 1)
            }
            
            # 4. Get 30-day message history
            cursor = await db.execute("SELECT date, total_messages FROM daily_stats ORDER BY date DESC LIMIT 30")
            history_rows = await cursor.fetchall()
            history_30d = [dict(row) for row in history_rows]
            history_30d.reverse()
            
            # 5. Get hourly breakdown for selected date
            hourly_breakdown = []
            try:
                cursor = await db.execute("SELECT hour, message_count FROM hourly_stats WHERE date = ? ORDER BY hour ASC", (selected_date,))
                hourly_rows = await cursor.fetchall()
                hourly_raw = {row["hour"]: row["message_count"] for row in hourly_rows}
                for h in range(24):
                    hourly_breakdown.append({"hour": h, "count": hourly_raw.get(h, 0)})
            except:
                for h in range(24):
                    hourly_breakdown.append({"hour": h, "count": 0})
            
            # 6. Get Vessel Type Breakdown for selected date
            type_breakdown = []
            try:
                start_ts = f"{selected_date} 00:00:00"
                end_ts = f"{selected_date} 23:59:59"
                cursor = await db.execute("""
                    SELECT type, COUNT(*) as count 
                    FROM ships 
                    WHERE last_seen >= ? AND last_seen <= ? AND type IS NOT NULL
                    GROUP BY type 
                    ORDER BY count DESC
                """, (start_ts, end_ts))
                type_rows = await cursor.fetchall()
                for row in type_rows:
                    type_code = row["type"]
                    type_breakdown.append({
                        "type": type_code,
                        "label": get_ship_type_name(type_code),
                        "count": row["count"]
                    })
            except:
                pass

            return {
                "selected_date": selected_date,
                "today": today_stats,
                "yesterday": yest_stats,
                "all_time": all_time_stats,
                "history_30d": history_30d,
                "hourly_breakdown": hourly_breakdown,
                "type_breakdown": type_breakdown
            }
    except Exception as e:
        logger.error(f"Error in get_statistics: {e}")
        return {"error": str(e)}

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
