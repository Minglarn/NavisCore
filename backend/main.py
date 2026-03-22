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
from datetime import datetime, timedelta, timezone
from contextlib import asynccontextmanager
import base64
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

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("NavisCore")
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)

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
# MQTT Publisher Queue and task for outgoing data
mqtt_pub_queue = asyncio.Queue()
mqtt_pub_task = None
mqtt_pub_connected = False
mqtt_pub_queued_mmsis = set()
mqtt_new_vessel_lock = asyncio.Lock()

# Enrichment Queue for ship images to avoid rate limiting
enrichment_queue = asyncio.Queue()
queued_mmsis = set()

class StatsCollector:
    def __init__(self):
        self.reset_hourly()
        self.daily_new_vessels = 0 # Tracked separately for daily report if needed
        
    def reset_hourly(self):
        self.hourly_messages = 0
        self.hourly_new_vessels = 0
        self.hourly_mmsis = set()
        self.hourly_max_range = 0.0
        self.hourly_shiptypes = {} # type_id -> set(mmsis)
        
    def update_range(self, dist_km):
        if dist_km > self.hourly_max_range:
            self.hourly_max_range = dist_km
        
    def update(self, mmsi, is_new, shiptype_id):
        self.hourly_messages += 1
        if is_new:
            self.hourly_new_vessels += 1
            self.daily_new_vessels += 1
        self.hourly_mmsis.add(mmsi)
        if shiptype_id:
            try:
                sid = int(shiptype_id)
                if sid not in self.hourly_shiptypes:
                    self.hourly_shiptypes[sid] = set()
                self.hourly_shiptypes[sid].add(mmsi)
            except: pass

    def get_hourly_snapshot(self):
        # Convert shiptype IDs to labels for the payload
        # Initialize all possible labels to 0 as requested by the user
        shiptype_dist = {}
        for i in range(100):
            label = get_ship_type_name(i)
            if label not in shiptype_dist:
                shiptype_dist[label] = 0
                
        for sid, mmsis in self.hourly_shiptypes.items():
            try:
                label = get_ship_type_name(sid)
                # Overwrite the 0 with the actual count (or add if multiple IDs map to same label)
                # We add the length because we only process each sid once, but multiple sids 
                # might resolve to the same label (e.g. 56 and 57 both resolve to "Spare - Local Vessel").
                # However, shiptype_dist[label] already has 0, so adding works perfectly.
                shiptype_dist[label] += len(mmsis)
            except: pass
            
        return {
            "messages_received": self.hourly_messages,
            "new_vessels": self.hourly_new_vessels,
            "max_vessels": len(self.hourly_mmsis),
            "max_range_km": round(self.hourly_max_range, 2),
            "max_range_nm": round(self.hourly_max_range * 0.539957, 2),
            "shiptypes": shiptype_dist
        }

stats_collector = StatsCollector()

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
        "mqtt_pub_enabled": os.getenv("MQTT_PUB_ENABLED", "false").lower(),
        "mqtt_pub_url": os.getenv("MQTT_PUB_URL", os.getenv("MQTT_BROKER", "")),
        "mqtt_pub_topic": os.getenv("MQTT_PUB_TOPIC", os.getenv("MQTT_TOPIC", "naviscore/objects")),
        "mqtt_pub_user": os.getenv("MQTT_PUB_USER", os.getenv("MQTT_USER", "")),
        "mqtt_pub_pass": os.getenv("MQTT_PUB_PASS", os.getenv("MQTT_PASS", "")),
        "mqtt_pub_only_new": os.getenv("MQTT_PUB_ONLY_NEW", "false").lower(),
        "mqtt_pub_new_topic": os.getenv("MQTT_PUB_NEW_TOPIC", "naviscore/new_detected"),
        "mqtt_pub_forward_sdr": "true",
        "mqtt_pub_forward_udp": "true",
        "mqtt_pub_forward_aisstream": "false",
        "mqtt_pub_wait_for_name": "false",
        "new_vessel_threshold": "5",
        "new_vessel_timeout_h": "24",
        "purge_days": "365"
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
            internal_data["altitude"] = body.get("Altitude")
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

def get_image_bytes(mmsi: str) -> bytes:
    """Read image file and return its raw binary content."""
    try:
        image_path = os.path.join(IMAGES_DIR, f"{mmsi}.jpg")
        if not os.path.exists(image_path):
            image_path = os.path.join(IMAGES_DIR, "0.jpg")
            
        if os.path.exists(image_path):
            with open(image_path, "rb") as f:
                return f.read()
    except Exception as e:
        logger.error(f"Error reading image bytes for {mmsi}: {e}")
    return None

def get_image_base64(mmsi: str) -> str:
    """Read image file and return its base64 encoded content."""
    img_bytes = get_image_bytes(mmsi)
    if img_bytes:
        return base64.b64encode(img_bytes).decode('utf-8')
    return None

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
                await broadcast({"mmsi": mmsi, "imageUrl": f"/images/{mmsi}.jpg"})
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
                await broadcast({"mmsi": mmsi, "imageUrl": f"/images/{mmsi}.jpg"})
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
        # Check disk first (e.g. if DB was deleted but images were kept)
        local_path = os.path.join(IMAGES_DIR, f"{mmsi}.jpg")
        if os.path.exists(local_path):
            async with db_session() as db:
                await db.execute('UPDATE ships SET image_url = ?, image_fetched_at = CURRENT_TIMESTAMP WHERE mmsi = ?', (f"/images/{mmsi}.jpg", mmsi))
                await db.commit()
            await broadcast({"mmsi": mmsi, "imageUrl": f"/images/{mmsi}.jpg"})
            return True

        async with db_session() as db:
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
                        await broadcast({"mmsi": mmsi, "imageUrl": f"/images/{mmsi}.jpg"})
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
            
            # 1. Determine Event Type (New, Re-acquired, or Update)
            async with db.execute('SELECT last_seen, latitude, longitude, is_meteo, is_aton, is_sar, virtual_aton, mqtt_new_sent FROM ships WHERE mmsi = ?', (mmsi_str,)) as cursor:
                row = await cursor.fetchone()
            
            is_new_v = row is None
            reset_count = False
            last_known_lat, last_known_lon = None, None
            db_is_meteo, db_is_aton, db_is_sar, db_virtual_aton = False, False, False, False
            
            if row:
                last_known_lat, last_known_lon = row[1], row[2]
                db_is_meteo, db_is_aton, db_is_sar, db_virtual_aton = bool(row[3]), bool(row[4]), bool(row[5]), bool(row[6])
                db_mqtt_new_sent = bool(row[7])
                try:
                    last_seen_dt = datetime.strptime(row[0], "%Y-%m-%d %H:%M:%S")
                    # Use explicit New Vessel Timeout (hours) instead of just ship_timeout
                    nv_timeout_h = int(settings.get("new_vessel_timeout_h", 24))
                    if (datetime.utcnow() - last_seen_dt).total_seconds() > (nv_timeout_h * 3600):
                        reset_count = True
                        logger.info(f"Vessel {mmsi_str} re-acquired after {nv_timeout_h}h silence. Resetting count.")
                except Exception: pass

            # 2. Prepare ship data dictionary
            is_meteo = data.get("is_meteo", False) or msg_type in [4, 8] or db_is_meteo
            if mmsi_str not in queued_mmsis: queued_mmsis.add(mmsi_str); enrichment_queue.put_nowait(mmsi_str)
            
            ship_data = {
                "mmsi": mmsi_str, "lat": lat, "lon": lon, "sog": data.get("speed") or data.get("sog"), "cog": data.get("course") or data.get("cog"),
                "heading": data.get("heading"), "name": ship_name, "callsign": data.get("callsign"), "shiptype": data.get("ship_type") or data.get("shiptype") or (9 if msg_type == 9 else None),
                "status_text": data.get("status_text") or data.get("status"), "country_code": data.get("country_code") or get_country_code_from_mmsi(mmsi_str),
                "timestamp": int(datetime.now().timestamp() * 1000), "is_meteo": is_meteo, "is_aton": data.get("is_aton", False) or db_is_aton,
                "is_sar": data.get("is_sar", False) or msg_type == 9 or db_is_sar, "altitude": data.get("altitude"), "aton_type": data.get("aton_type"), "aton_type_text": data.get("aton_type_text"),
                "destination": data.get("destination"), "draught": data.get("draught"), "is_emergency": data.get("is_emergency", False),
                "emergency_type": data.get("emergency_type"), "virtual_aton": data.get("virtual_aton", False) or db_virtual_aton, "is_advanced_binary": data.get("is_advanced_binary", False),
                "dac": data.get("dac"), "fid": data.get("fid"), "raw_payload": data.get("raw_payload"),
                "source": source, "nmea": data.get("nmea"), "ship_type_text": data.get("ship_type_text"), "ship_category": data.get("ship_category"),
                "wind_speed": data.get("wind_speed"), "wind_gust": data.get("wind_gust"), "wind_direction": data.get("wind_direction"),
                "water_level": data.get("water_level"), "air_temp": data.get("air_temp"), "air_pressure": data.get("air_pressure")
            }

            if ship_data.get("is_advanced_binary") and not ship_data.get("status_text"):
                dac, fid = ship_data.get("dac"), ship_data.get("fid")
                ship_data["status_text"] = f"Advanced Binary (DAC:{dac}, FI:{fid})" if dac is not None and fid is not None else "Advanced Binary Message"

            if ship_data.get("sog") is not None and ship_data["sog"] < 0.1:
                if data.get("nav_status") in [0, 8]: ship_data["status_text"] = "Moored (Stationary)"

            # If current message has no lat/lon but we have it in DB, use it for the broadcast/mqtt
            if ship_data.get("lat") is None and last_known_lat is not None:
                ship_data["lat"], ship_data["lon"] = last_known_lat, last_known_lon

            # 3. Update Database
            if is_new_v:
                logger.info(f"New Vessel {mmsi_str} ({ship_name or 'Unknown'}) detected! Source: {source}")
            
            await db.execute('INSERT OR IGNORE INTO ships (mmsi, name, callsign, last_seen, message_count, registration_count, session_start) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 0, 1, CURRENT_TIMESTAMP)', (mmsi_str, ship_name, data.get("callsign")))
            
            flds = ["last_seen = CURRENT_TIMESTAMP"]
            if reset_count: 
                flds.append("previous_seen = last_seen, message_count = 1, registration_count = registration_count + 1, session_start = CURRENT_TIMESTAMP, mqtt_new_sent = 0")
                db_mqtt_new_sent = False
            else: flds.append("message_count = message_count + 1")
            
            vals = []
            db_fields = [("name", "name"), ("callsign", "callsign"), ("type", "shiptype"), ("status_text", "status_text"), ("country_code", "country_code"), ("latitude", "lat"), ("longitude", "lon"), ("sog", "sog"), ("cog", "cog"), ("heading", "heading"), ("source", "source"), ("emergency_type", "emergency_type"), ("altitude", "altitude"), ("wind_speed", "wind_speed"), ("wind_gust", "wind_gust"), ("wind_direction", "wind_direction"), ("water_level", "water_level"), ("air_temp", "air_temp"), ("air_pressure", "air_pressure"), ("destination", "destination"), ("draught", "draught"), ("eta", "eta"), ("imo", "imo")]
            for f, k in db_fields:
                v = ship_data.get(k)
                if v is not None: flds.append(f"{f} = ?"); vals.append(v)
            
            for f, k in [("is_meteo", "is_meteo"), ("is_emergency", "is_emergency"), ("virtual_aton", "virtual_aton"), ("is_advanced_binary", "is_advanced_binary"), ("dac", "dac"), ("fid", "fid"), ("raw_payload", "raw_payload")]:
                v = ship_data.get(k)
                if v is not None: flds.append(f"{f} = ?"); vals.append(1 if v is True else (0 if v is False else v))
            
            # Dimensions
            to_b, to_s, to_p, to_st = data.get("to_bow"), data.get("to_stern"), data.get("to_port"), data.get("to_starboard")
            if to_b is not None and to_s is not None: flds.append("length = ?"); vals.append(to_b + to_s)
            if to_p is not None and to_st is not None: flds.append("width = ?"); vals.append(to_p + to_st)

            vals.append(mmsi_str)
            await db.execute(f'UPDATE ships SET {", ".join(flds)} WHERE mmsi = ?', tuple(vals))
            
            # 4. History Tracking (only if position exists)
            if lat is not None and lon is not None:
                async with db.execute('SELECT latitude, longitude FROM ship_history WHERE mmsi = ? ORDER BY timestamp DESC LIMIT 1', (mmsi_str,)) as cursor:
                    hr = await cursor.fetchone()
                    if not hr or haversine_distance(hr[0], hr[1], lat, lon) > 0.05:
                        await db.execute('INSERT INTO ship_history (mmsi, latitude, longitude, timestamp) VALUES (?, ?, ?, ?)', (mmsi_str, lat, lon, int(datetime.now().timestamp() * 1000)))
            
            # Stats (Switching to Local Time for user-facing consistency)
            now_local = datetime.now()
            today, time_min = now_local.strftime('%Y-%m-%d'), now_local.strftime('%Y-%m-%d %H:%M')
            await db.execute('INSERT INTO daily_stats (date, total_messages) VALUES (?, 1) ON CONFLICT(date) DO UPDATE SET total_messages = total_messages + 1', (today,))
            await db.execute('INSERT INTO hourly_stats (date, hour, message_count) VALUES (?, ?, 1) ON CONFLICT(date, hour) DO UPDATE SET message_count = message_count + 1', (today, now_local.hour))
            await db.execute('INSERT INTO minute_stats (time_min, total_messages) VALUES (?, 1) ON CONFLICT(time_min) DO UPDATE SET total_messages = total_messages + 1', (time_min,))
            try:
                await db.execute('INSERT INTO daily_mmsi (date, mmsi) VALUES (?, ?)', (today, mmsi_str))
                sf = ["unique_ships = unique_ships + 1"]
                if is_new_v: sf.append("new_ships = new_ships + 1")
                await db.execute(f'UPDATE daily_stats SET {", ".join(sf)} WHERE date = ?', (today,))
            except Exception: pass

            # Update in-memory stats collector
            stats_collector.update(mmsi_str, is_new_v, ship_data.get("shiptype"))
            
            try:
                await db.execute('INSERT INTO minute_mmsi (time_min, mmsi) VALUES (?, ?)', (time_min, mmsi_str))
                await db.execute('UPDATE minute_stats SET unique_ships = unique_ships + 1 WHERE time_min = ?', (time_min,))
            except Exception: pass
            
            # Read back missing data
            async with db.execute('SELECT image_url, name, type, status_text, country_code, length, width, destination, draught, message_count, eta, rot, imo, callsign, previous_seen, manual_image, latitude, longitude, is_meteo, is_emergency, emergency_type, virtual_aton, is_advanced_binary, dac, fid, raw_payload, wind_speed, wind_gust, wind_direction, water_level, air_temp, air_pressure, altitude, registration_count, session_start, mqtt_new_sent FROM ships WHERE mmsi = ?', (mmsi_str,)) as cursor:
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
                    ship_data["registration_count"] = r[33]
                    if r[34]:
                        try: 
                            # SQLite CURRENT_TIMESTAMP is UTC. Convert to UTC timestamp.
                            dt = datetime.strptime(r[34], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                            ship_data["session_start"] = int(dt.timestamp() * 1000)
                        except Exception: pass
                    if r[14]:
                        try: ship_data["previous_seen"] = datetime.strptime(r[14], "%Y-%m-%d %H:%M:%S").timestamp() * 1000
                        except Exception: pass
                    ship_data["manual_image"] = bool(r[15])
                    if ship_data.get("lat") is None: ship_data["lat"] = r[16]
                    if ship_data.get("lon") is None: ship_data["lon"] = r[17]
                    # Unified field mapping for extra parameters
                    ship_data["is_meteo"] = bool(r[18])
                    ship_data["is_emergency"] = bool(r[19])
                    ship_data["emergency_type"] = r[20]
                    ship_data["virtual_aton"] = bool(r[21])
                    ship_data["is_advanced_binary"] = bool(r[22])
                    ship_data["dac"], ship_data["fid"], ship_data["raw_payload"] = r[23], r[24], r[25]
                    ship_data["wind_speed"], ship_data["wind_gust"], ship_data["wind_direction"] = r[26], r[27], r[28]
                    ship_data["water_level"], ship_data["air_temp"], ship_data["air_pressure"] = r[29], r[30], r[31]
                    ship_data["altitude"] = r[32]
                    ship_data["mqtt_new_sent"] = bool(r[35])
            
            if not ship_data.get("ship_type_text") and ship_data.get("shiptype") is not None:
                try:
                    c = int(ship_data["shiptype"])
                    ship_data["ship_type_text"], ship_data["ship_category"] = get_ship_type_name(c), get_ship_category(c)
                except Exception: pass
            
            # Range tracking (only if current message has position)
            if lat is not None and lon is not None:
                origin_lat, origin_lon = settings.get("origin_lat"), settings.get("origin_lon")
                if (source != "aisstream" or settings.get("include_aisstream_in_range") == "true") and \
                   origin_lat and origin_lon and not is_meteo and not ship_data.get("is_aton") and \
                   not ship_data.get("is_sar") and not mmsi_str.startswith("99"):
                    try:
                        dist = haversine_distance(float(origin_lat), float(origin_lon), lat, lon)
                        if ship_data.get("message_count", 0) >= 1 and 1.0 <= dist <= 370.4:
                            stats_collector.update_range(dist)
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
            
            # --- MQTT Publisher Logic ---
            if settings.get("mqtt_pub_enabled") == "true":
                try:
                    forward_sdr = settings.get("mqtt_pub_forward_sdr", "true") == "true"
                    forward_stream = settings.get("mqtt_pub_forward_aisstream", "false") == "true"
                    
                    should_forward = False
                    if (source == "local" or source == "sdr") and forward_sdr:
                        should_forward = True
                    elif source == "udp" and settings.get("mqtt_pub_forward_udp", "true") == "true":
                        should_forward = True
                    elif source == "aisstream" and forward_stream:
                        should_forward = True
                        
                    if should_forward:
                        event_type = "new" if is_new_v or reset_count else "update"
                        wait_for_name = settings.get("mqtt_pub_wait_for_name", "false") == "true"
                        only_new = settings.get("mqtt_pub_only_new") == "true"
                        
                        # Special Logic: Wait for name if enabled
                        if wait_for_name and event_type == "new" and not ship_data.get("name"):
                            # Skip sending "new" for now as name is missing
                            should_trigger_new = False
                        elif wait_for_name and event_type == "update" and ship_data.get("name") and not ship_data.get("mqtt_new_sent"):
                                # Name finally arrived and we haven't sent "new" yet
                                should_trigger_new = True
                                event_type = "new" # Upgrade this update to a "new" event for MQTT
                        else:
                            # Normal logic
                            should_trigger_new = (event_type == "new")

                        if not only_new or should_trigger_new:
                            pub_payload = {
                                "mmsi": mmsi_str,
                                "name": ship_data.get("name"),
                                "lat": round(ship_data.get("lat"), 5) if ship_data.get("lat") is not None else None,
                                "lon": round(ship_data.get("lon"), 5) if ship_data.get("lon") is not None else None,
                                # Basic Identification
                                "msg_type": msg_type,
                                "imo": ship_data.get("imo"),
                                "callsign": ship_data.get("callsign"),
                                "country_code": ship_data.get("country_code"),
                                # Movement & Position
                                "sog": ship_data.get("sog"),
                                "cog": ship_data.get("cog"),
                                "heading": ship_data.get("heading"),
                                "rot": ship_data.get("rot"),
                                # Type & Category
                                "shiptype": ship_data.get("shiptype"),
                                "ship_type_label": ship_data.get("ship_type_text"),
                                "icon_category": ship_data.get("ship_category"),
                                "is_nav_aid": bool(ship_data.get("is_aton")),
                                # Dimensions
                                "length": ship_data.get("length"),
                                "width": ship_data.get("width"),
                                "draught": ship_data.get("draught"),
                                # Status & Voyage
                                "status_text": ship_data.get("status_text"),
                                "nav_status": ship_data.get("nav_status"),
                                "destination": ship_data.get("destination"),
                                "eta": ship_data.get("eta"),
                                # Meteo Data
                                "wind_speed": ship_data.get("wind_speed"),
                                "wind_gust": ship_data.get("wind_gust"),
                                "wind_direction": ship_data.get("wind_direction"),
                                "water_level": ship_data.get("water_level"),
                                "air_temp": ship_data.get("air_temp"),
                                "air_pressure": ship_data.get("air_pressure"),
                                # History & Meta
                                "last_seen": ship_data.get("timestamp"),
                                "previous_seen": ship_data.get("previous_seen"),
                                "source": source,
                                "event_type": event_type,
                                "timestamp": ship_data.get("timestamp"),
                                "image_url": ship_data.get("imageUrl", "").split("/")[-1] if ship_data.get("imageUrl") else None
                            }
                            origin_lat, origin_lon = settings.get("origin_lat"), settings.get("origin_lon")
                            if origin_lat and origin_lon and lat is not None and lon is not None:
                                try:
                                    dist_km = haversine_distance(float(origin_lat), float(origin_lon), lat, lon)
                                    pub_payload["dist_to_station_km"] = round(dist_km, 2)
                                    pub_payload["dist_to_station_nm"] = round(dist_km * 0.539957, 2)
                                    # Signal Propagation classification
                                    if dist_km > 185.2: pub_payload["propagation"] = "tropo_ducting"
                                    elif 74.08 < dist_km < 148.16: pub_payload["propagation"] = "enhanced_range"
                                    else: pub_payload["propagation"] = "normal"
                                except: 
                                    pub_payload["propagation"] = "normal"

                            if event_type == "new":
                                async with mqtt_new_vessel_lock:
                                    new_topic = settings.get("mqtt_pub_new_topic", "naviscore/new_detected")
                                    img_bytes = get_image_bytes(mmsi_str)
                                    if img_bytes:
                                        mqtt_pub_queue.put_nowait((new_topic, img_bytes))
                                    else:
                                        mqtt_pub_queue.put_nowait((new_topic, json.dumps({"mmsi": mmsi_str, "event": "new_detected"})))
                                    
                                    # Wait 5s before sending the object details as requested
                                    await asyncio.sleep(5)
                                    
                                    mqtt_pub_queue.put_nowait(pub_payload)
                                    await db.execute("UPDATE ships SET mqtt_new_sent = 1 WHERE mmsi = ?", (mmsi_str,))
                                    await db.commit()
                            else:
                                mqtt_pub_queue.put_nowait(pub_payload)
                except Exception as e:
                    logger.error(f"Error queuing MQTT pub message: {e}")

            await broadcast(ship_data)
    except Exception as e:
        logger.error(f"Error for MMSI {mmsi_str}: {e}")

class UDPProtocol(asyncio.DatagramProtocol):
    def connection_made(self, transport):
        self.transport = transport; self.settings = {}
        self.stream_manager = AisStreamManager()
        self.stream_manager.on_decode(self.handle_parsed_custom)
        asyncio.create_task(self.update_settings_loop())
    def handle_parsed_custom(self, d): d["source"] = "udp"; asyncio.create_task(process_ais_data(d))
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

async def mqtt_publisher_worker():
    global mqtt_pub_connected
    while True:
        try:
            s = await get_all_settings()
            if s.get("mqtt_pub_enabled") != "true" or not s.get("mqtt_pub_url"):
                mqtt_pub_connected = False
                await asyncio.sleep(5)
                continue
            
            p = s["mqtt_pub_url"].replace("mqtt://", "").replace("mqtts://", "").split(":")
            host = p[0]
            port = int(p[1]) if len(p) > 1 else 1883
            
            async with aiomqtt.Client(
                hostname=host, 
                port=port, 
                username=s.get("mqtt_pub_user") or None, 
                password=s.get("mqtt_pub_pass") or None,
                timeout=10
            ) as client:
                mqtt_pub_connected = True
                logger.info(f"MQTT Publisher connected to {host}:{port}")
                while True:
                    # Get outgoing message from queue
                    item = await mqtt_pub_queue.get()
                    try:
                        if isinstance(item, tuple) and len(item) == 2:
                            topic, payload = item
                        else:
                            topic = item.pop("_topic", s.get("mqtt_pub_topic", "naviscore/objects"))
                            payload = json.dumps(item)
                        
                        await client.publish(topic, payload=payload)
                    except Exception as e:
                        logger.error(f"MQTT Publish error: {e}")
                        # Put back in queue if it failed? Maybe not to avoid infinite loops
                        raise e # Trigger reconnect
                    finally:
                        mqtt_pub_queue.task_done()
        except asyncio.CancelledError:
            mqtt_pub_connected = False
            break
        except Exception as e:
            logger.error(f"MQTT Publisher error: {e}")
            mqtt_pub_connected = False
            await asyncio.sleep(10)

async def mqtt_stats_reporter():
    """Background task to send hourly and daily statistics to MQTT."""
    logger.info("MQTT Statistics Reporter task started.")
    
    # Switch to Local Time for consistency with user discovery/reporting expectations
    last_hour = datetime.now().hour
    last_day = datetime.now().date()
    
    while True:
        try:
            now = datetime.now()
            current_hour = now.hour
            current_day = now.date()
            
            # Diagnostic logs
            logger.debug(f"[StatsReporter] Current time: {now}. Last hour: {last_hour}")

            # 1. Hourly Report
            if current_hour != last_hour:
                logger.info(f"Generating hourly MQTT statistics for hour {last_hour}")
                snapshot = stats_collector.get_hourly_snapshot()
                
                s = await get_all_settings()
                base_topic = s.get("mqtt_pub_topic", "naviscore/objects")
                prefix = base_topic.rsplit("/", 1)[0] if "/" in base_topic else ""
                hourly_topic = f"{prefix}/objects_stat_hourly" if prefix else "objects_stat_hourly"
                
                logger.info(f"[StatsReporter] Queuing hourly stats to topic: {hourly_topic}")
                mqtt_pub_queue.put_nowait({
                    "_topic": hourly_topic,
                    **snapshot,
                    "hour": last_hour,
                    "date": now.strftime('%Y-%m-%d'),
                    "timestamp": int(now.timestamp() * 1000)
                })
                
                # Persist shiptype distribution to DB to speed up the stats modal
                async with db_session() as db:
                    # Get existing shiptypes for today (if any) to merge or replace
                    # Actually, we can just aggregate from the ships table once an hour and save it
                    # OR we can keep a daily shiptype counter in memory too.
                    # For simplicity and speed, let's aggregate from the ships table for the current day
                    today_str = now.strftime('%Y-%m-%d')
                    r = await db.execute("SELECT type, COUNT(*) as count FROM ships WHERE last_seen LIKE ? GROUP BY type", (f"{today_str}%",))
                    db_dist = []
                    for row in await r.fetchall():
                        if row[0]:
                            db_dist.append({"type": row[0], "label": get_ship_type_name(row[0]), "count": row[1]})
                    
                    await db.execute("UPDATE daily_stats SET shiptype_json = ? WHERE date = ?", (json.dumps(db_dist), today_str))
                    await db.commit()
                
                stats_collector.reset_hourly()
                last_hour = current_hour
            
            # 2. Daily Report (Midnight check)
            if current_day != last_day:
                logger.info(f"Generating daily MQTT statistics for {last_day}")
                
                # Get stats for the day from the DB (since they are persisted every hour)
                async with db_session() as db:
                    db.row_factory = aiosqlite.Row
                    r = await db.execute("SELECT * FROM daily_stats WHERE date = ?", (last_day.strftime('%Y-%m-%d'),))
                    day_row = await r.fetchone()
                    if day_row:
                        daily_payload = dict(day_row)
                        if daily_payload.get("max_range_km") is not None:
                            km = daily_payload["max_range_km"]
                            daily_payload["max_range_km"] = round(km, 2)
                            daily_payload["max_range_nm"] = round(km * 0.539957, 2)
                        
                        s = await get_all_settings()
                        base_topic = s.get("mqtt_pub_topic", "naviscore/objects")
                        prefix = base_topic.rsplit("/", 1)[0] if "/" in base_topic else ""
                        daily_topic = f"{prefix}/objects_stat_daily" if prefix else "objects_stat_daily"
                        
                        mqtt_pub_queue.put_nowait({
                            "_topic": daily_topic,
                            **daily_payload,
                            "timestamp": int(now.timestamp() * 1000)
                        })
                
                last_day = current_day
                stats_collector.daily_new_vessels = 0
                
        except Exception as e:
            logger.error(f"Error in mqtt_stats_reporter: {e}")
            
        # Sleep for a bit before checking again (e.g. 1 minute)
        await asyncio.sleep(60)

def restart_mqtt_pub():
    global mqtt_pub_task
    if mqtt_pub_task:
        mqtt_pub_task.cancel()
    mqtt_pub_task = asyncio.create_task(mqtt_publisher_worker())

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
            settings = await get_all_settings()
            purge_days = int(settings.get("purge_days", "365"))
            
            async with db_session() as db:
                # Find ships to be purged to delete their images first
                query = f"SELECT mmsi, image_url FROM ships WHERE last_seen < datetime('now', '-{purge_days} days')"
                async with db.execute(query) as cursor:
                    rows = await cursor.fetchall()
                    for row in rows:
                        mmsi, image_url = row
                        if image_url and image_url != "/images/0.jpg":
                            # Extract filename from URL (handles ?t= timestamps too)
                            filename = image_url.split('/')[-1].split('?')[0]
                            p = os.path.join(IMAGES_DIR, filename)
                            if os.path.exists(p):
                                try:
                                    os.remove(p)
                                    logger.info(f"[Purge] Deleted image for purged vessel {mmsi}: {filename}")
                                except Exception as img_err:
                                    logger.error(f"[Purge] Failed to delete image {p}: {img_err}")
                
                # Delete the ships from database
                await db.execute(f"DELETE FROM ships WHERE last_seen < datetime('now', '-{purge_days} days')")
                
                # Clean up other historical data
                await db.execute("DELETE FROM daily_mmsi WHERE date < date('now', '-7 days')")
                await db.execute("DELETE FROM minute_stats WHERE time_min < datetime('now', '-24 hours')")
                await db.execute("DELETE FROM minute_mmsi WHERE time_min < datetime('now', '-24 hours')")
                await db.execute("DELETE FROM sector_history WHERE timestamp < ?", (int((datetime.now() - timedelta(hours=24)).timestamp() * 1000),))
                await db.commit()
                if len(rows) > 0:
                    logger.info(f"[Purge] Successfully purged {len(rows)} vessels older than {purge_days} days.")
        except Exception as e: 
            logger.error(f"[Purge] Error: {e}")
        
        # Run once every 24 hours
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
        await db.execute('CREATE TABLE IF NOT EXISTS ships (mmsi TEXT PRIMARY KEY, imo TEXT, name TEXT, callsign TEXT, type INTEGER, image_url TEXT, image_fetched_at DATETIME, last_seen DATETIME DEFAULT CURRENT_TIMESTAMP, session_start DATETIME DEFAULT CURRENT_TIMESTAMP)')
        for c in ["previous_seen DATETIME", "manual_image BOOLEAN DEFAULT 0", "is_meteo BOOLEAN DEFAULT 0", "is_aton BOOLEAN DEFAULT 0", "is_sar BOOLEAN DEFAULT 0", "aton_type INTEGER", "aton_type_text TEXT", "is_emergency BOOLEAN DEFAULT 0", "emergency_type TEXT", "virtual_aton BOOLEAN DEFAULT 0", "is_advanced_binary BOOLEAN DEFAULT 0", "dac INTEGER", "fid INTEGER", "raw_payload TEXT", "heading REAL", "length REAL", "width REAL", "message_count INTEGER DEFAULT 0", "registration_count INTEGER DEFAULT 1", "eta TEXT", "rot REAL", "status_text TEXT", "country_code TEXT", "destination TEXT", "draught REAL", "latitude REAL", "longitude REAL", "sog REAL", "cog REAL", "source TEXT DEFAULT 'local'", "wind_speed REAL", "wind_gust REAL", "wind_direction REAL", "water_level REAL", "air_temp REAL", "air_pressure REAL", "altitude INTEGER", "session_start DATETIME", "mqtt_new_sent BOOLEAN DEFAULT 0"]:
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
            ('new_vessel_threshold', '5')
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
        await db.commit()
    asyncio.create_task(start_udp_listener())
    restart_mqtt()
    restart_mqtt_pub()
    asyncio.create_task(mock_mode_loop())
    asyncio.create_task(purge_job())
    asyncio.create_task(coverage_24h_reset_job())
    asyncio.create_task(restart_aisstream())
    asyncio.create_task(enrichment_worker())
    asyncio.create_task(mqtt_stats_reporter())
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
                for f in ["dac", "fid", "raw_payload", "emergency_type", "wind_speed", "wind_gust", "wind_direction", "water_level", "air_temp", "air_pressure", "altitude"]: 
                    val = d.get(f)
                    if val is not None: d[f] = val
                if d["previous_seen"]:
                    try: d["previous_seen"] = datetime.strptime(d["previous_seen"], "%Y-%m-%d %H:%M:%S").timestamp()*1000
                    except Exception: pass
                if d.get("session_start"):
                    try: d["session_start"] = datetime.strptime(d["session_start"], "%Y-%m-%d %H:%M:%S").timestamp()*1000
                    except Exception: pass
                res.append(d)
            except Exception: continue
        return res

@app.get("/api/database")
async def get_database(q: str = None, ship_type: int = None, source: str = None, limit: int = 50, offset: int = 0, sort: str = "last_seen", order: str = "desc"):
    # Security check for sort and order to avoid SQL injection
    allowed_sorts = ["mmsi", "name", "type", "message_count", "registration_count", "last_seen", "length", "width"]
    if sort not in allowed_sorts:
        sort = "last_seen"
    if order.lower() not in ["asc", "desc"]:
        order = "desc"

    async with db_session() as db:
        db.row_factory = aiosqlite.Row
        
        # Build filter conditions
        conditions = []
        params = []
        
        if q:
            conditions.append("(mmsi LIKE ? OR name LIKE ?)")
            params.extend([f"%{q}%", f"%{q}%"])
        
        if ship_type is not None:
            conditions.append("type = ?")
            params.append(ship_type)
            
        if source and source != 'all':
            conditions.append("source = ?")
            params.append(source.lower())
            
        where_clause = f" WHERE {' AND '.join(conditions)}" if conditions else ""
        
        # Get total count first
        count_query = f"SELECT COUNT(*) FROM ships{where_clause}"
        async with db.execute(count_query, tuple(params)) as cursor:
            total_row = await cursor.fetchone()
            total = total_row[0] if total_row else 0

        # Now get the actual data
        query = f"SELECT * FROM ships{where_clause} ORDER BY {sort} {order} LIMIT ? OFFSET ?"
        data_params = params + [limit, offset]
        
        async with db.execute(query, tuple(data_params)) as cursor:
            res = []
            for row in await cursor.fetchall():
                d = dict(row)
                d["imageUrl"] = d["image_url"] or "/images/0.jpg"
                if d["type"] is not None:
                    try:
                        c = int(d["type"])
                        d["ship_type_text"], d["ship_category"] = get_ship_type_name(c), get_ship_category(c)
                    except: pass
                
                # Format session_start for database view if needed, but ensure it's available
                if d.get("session_start"):
                    try:
                        dt = datetime.strptime(d["session_start"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                        d["session_start"] = int(dt.timestamp() * 1000)
                    except: pass

                res.append(d)
            return {"ships": res, "total": total}



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
            
        # Prepare filtered details for logging and processing
        allowed_fields = ["name", "imo", "callsign", "shiptype", "length", "width", "destination", "draught"]
        filtered_details = {k: v for k, v in details.items() if k in allowed_fields}
        
        if filtered_details:
            logger.info(f"Updating details for ship {mmsi}: {filtered_details}")
        
        upd = []
        vals = []
        broadcast_data = {"mmsi": mmsi}
        
        for f, val in filtered_details.items():
            # Map shiptype to type in DB
            db_field = "type" if f == "shiptype" else f
            upd.append(f"{db_field} = ?")
            vals.append(val)
            broadcast_data[f] = val
            
            # If shiptype is updated, also update text and category for broadcast
            if f == "shiptype":
                try:
                    code = int(val)
                    broadcast_data["ship_type_text"] = get_ship_type_name(code)
                    broadcast_data["ship_category"] = get_ship_category(code)
                except Exception as e:
                    logger.error(f"Error calculating type info for {mmsi}: {e}")
        
        if not upd:
            return {"success": True, "message": "No relevant fields to update"}
        
        if not upd:
            return {"error": "No valid fields to update"}
            
        vals.append(mmsi)
        async with db_session() as db:
            await db.execute(f"UPDATE ships SET {', '.join(upd)} WHERE mmsi = ?", tuple(vals))
            await db.commit()
            
        # Re-fetch from DB to get the most accurate state for broadcast
        async with db_session() as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM ships WHERE mmsi = ?", (mmsi,))
            row = await cursor.fetchone()
            if row:
                d = dict(row)
                broadcast_data.update({
                    "shiptype": d["type"],
                    "ship_type_text": get_ship_type_name(d["type"]) if d["type"] else "Unknown",
                    "ship_category": get_ship_category(d["type"]) if d["type"] else "default",
                    "name": d["name"],
                    "callsign": d["callsign"],
                    "imo": d["imo"]
                })
        
        await broadcast(broadcast_data)
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error updating ship details for {mmsi}: {e}")
        return {"error": str(e)}

@app.delete("/api/ships/{mmsi}")
async def delete_ship(mmsi: int):
    try:
        async with db_session() as db:
            await db.execute("DELETE FROM ships WHERE mmsi = ?", (mmsi,))
            await db.execute("DELETE FROM ship_history WHERE mmsi = ?", (mmsi,))
            await db.commit()
        return {"status": "success", "message": f"Vessel {mmsi} deleted from archive"}
    except Exception as e:
        logger.error(f"Error deleting ship {mmsi}: {e}")
        return {"error": str(e)}

@app.post("/api/reset_db")
async def reset_db():
    try:
        async with db_session() as db:
            tables = ["ships", "ship_history", "daily_stats", "daily_mmsi", 
                      "hourly_stats", "minute_stats", "minute_mmsi", 
                      "coverage_sectors", "sector_history"]
            for table in tables:
                await db.execute(f"DELETE FROM {table}")
            await db.commit()
        
        stats_collector.reset_hourly()
        stats_collector.daily_new_vessels = 0
        await broadcast({"type": "db_reset"})
        logger.info("Database reset triggered by user. All tables cleared, images preserved.")
        return {"status": "success", "message": "Database has been reset"}
    except Exception as e:
        logger.error(f"Error resetting database: {e}")
        return {"error": str(e)}
        logger.info(f"Successfully updated and broadcasted details for {mmsi}")
        
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
    if any(k in settings for k in ["mqtt_pub_enabled", "mqtt_pub_url", "mqtt_pub_topic", "mqtt_pub_user", "mqtt_pub_pass", "mqtt_pub_only_new"]):
        restart_mqtt_pub()
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
            r = await db.execute("SELECT * FROM daily_stats WHERE date = ?", (sel,))
            row = await r.fetchone()
            t_row = dict(row) if row else {"unique_ships":0,"new_ships":0,"total_messages":0,"max_range_km":0.0, "shiptype_json": None}
            r = await db.execute("SELECT * FROM daily_stats WHERE date = ?", (yest,))
            row = await r.fetchone()
            y_row = dict(row) if row else {"unique_ships":0,"new_ships":0,"total_messages":0}
            r = await db.execute("SELECT MAX(unique_ships), MAX(total_messages), MAX(max_range_km) FROM daily_stats")
            a_row = await r.fetchone() or (0, 0, 0)
            r = await db.execute("SELECT date, unique_ships, total_messages, max_range_km FROM daily_stats ORDER BY date DESC LIMIT 365")
            h30 = [dict(row) for row in await r.fetchall()]; h30.reverse()
            h_brk = []
            r = await db.execute("SELECT hour, message_count FROM hourly_stats WHERE date = ? ORDER BY hour ASC", (sel,))
            h_raw = {row["hour"]: row["message_count"] for row in await r.fetchall()}
            for h in range(24): h_brk.append({"hour":h, "count":h_raw.get(h,0)})
            t_brk = []
            
            # Use pre-calculated shiptype distribution if available
            if t_row and t_row.get("shiptype_json"):
                try:
                    t_brk = json.loads(t_row["shiptype_json"])
                except Exception: pass
            
            # Fallback to expensive query if no JSON or today
            if not t_brk:
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
                "selected_date":sel, "today":t_row, "yesterday":y_row, 
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
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, log_level=LOG_LEVEL.lower(), access_log=False)
