import os
from .db import db_session
import aiosqlite

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
    if db:
        return await _get_all_settings_internal(db)
    async with db_session() as ds:
        return await _get_all_settings_internal(ds)

async def _get_all_settings_internal(db: aiosqlite.Connection):
    from config import UDP_PORT
    settings = {}
    async with db.execute('SELECT key, value FROM settings') as cursor:
        async for row in cursor:
            settings[row[0]] = row[1]
    
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
        "mqtt_pub_forward_aisstream": "true",
        "mqtt_pub_wait_for_name": "false",
        "new_vessel_threshold": "5",
        "new_vessel_timeout_h": "24",
        "purge_days": "365"
    }
    for k, v in defaults.items():
        if k not in settings:
            settings[k] = v
    return settings

def is_true(val):
    if val is None: return False
    if isinstance(val, bool): return val
    s = str(val).lower()
    return s in ("true", "1", "yes", "on")
