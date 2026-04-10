import asyncio
import json
import logging
import aiomqtt
import time
from datetime import datetime

from utils.settings import get_all_settings, is_true
from utils.db import db_session
from utils.stats import stats_collector
from utils.images import get_image_bytes
from utils.ollama import fetch_ollama_short_info, fetch_ollama_hourly_summary, fetch_ollama_daily_summary
from utils.mmsi import get_country_adjective, get_country_name

logger = logging.getLogger("NavisCore")

mqtt_client_task = None
mqtt_connected = False

mqtt_pub_queue = asyncio.Queue()
mqtt_pub_task = None
mqtt_pub_connected = False
mqtt_new_vessel_lock = asyncio.Lock()

mqtt_last_sent = {} # {mmsi: {"timestamp": float, "fingerprint": str}}

_broadcast_callback = None
_ais_queue = None

def init_mqtt(broadcast_cb, ais_q):
    global _broadcast_callback, _ais_queue
    _broadcast_callback = broadcast_cb
    _ais_queue = ais_q

async def broadcast_mqtt_status(connected: bool):
    if _broadcast_callback:
        await _broadcast_callback({"type": "mqtt_status", "connected": connected})

async def mqtt_loop():
    global mqtt_connected
    while True:
        s = await get_all_settings()
        if not is_true(s.get("mqtt_enabled")) or not s.get("mqtt_url"): 
            mqtt_connected = False
            await asyncio.sleep(5)
            continue
        try:
            p = s["mqtt_url"].replace("mqtt://", "").replace("mqtts://", "").split(":")
            host = p[0]
            port = int(p[1]) if len(p) > 1 else 1883
            
            async with aiomqtt.Client(hostname=host, port=port, username=s.get("mqtt_user") or None, password=s.get("mqtt_pass") or None) as c:
                mqtt_connected = True
                await broadcast_mqtt_status(True)
                await c.subscribe(s.get("mqtt_topic", "ais"))
                async for m in c.messages:
                    if _ais_queue:
                        try:
                            _ais_queue.put_nowait(json.loads(m.payload.decode()))
                        except Exception: pass
        except Exception as e: 
            logger.error(f"MQTT error: {e}")
            mqtt_connected = False
            await broadcast_mqtt_status(False)
            await asyncio.sleep(5)

def restart_mqtt():
    global mqtt_client_task
    if mqtt_client_task: mqtt_client_task.cancel()
    mqtt_client_task = asyncio.create_task(mqtt_loop())

async def mqtt_publisher_worker():
    global mqtt_pub_connected
    while True:
        try:
            s = await get_all_settings()
            if not is_true(s.get("mqtt_pub_enabled")) or not s.get("mqtt_pub_url"):
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
                    item = await mqtt_pub_queue.get()
                    try:
                        if isinstance(item, tuple) and len(item) == 2:
                            topic, payload = item
                        else:
                            topic = item.pop("_topic", None)
                            if not topic:
                                base_topic = s.get("mqtt_pub_topic", "naviscore/objects").rstrip("/")
                                if not base_topic.endswith("/objects"):
                                    topic = f"{base_topic}/objects"
                                else:
                                    topic = base_topic
                            payload = json.dumps(item)
                        
                        await client.publish(topic, payload=payload)
                    except Exception as e:
                        logger.error(f"MQTT Publish error: {e}")
                        raise e 
                    finally:
                        mqtt_pub_queue.task_done()
        except asyncio.CancelledError:
            mqtt_pub_connected = False
            break
        except Exception as e:
            logger.error(f"MQTT Publisher error: {e}")
            mqtt_pub_connected = False
            await asyncio.sleep(10)

def restart_mqtt_pub():
    global mqtt_pub_task
    if mqtt_pub_task:
        mqtt_pub_task.cancel()
    mqtt_pub_task = asyncio.create_task(mqtt_publisher_worker())

async def mqtt_stats_reporter():
    logger.info("MQTT Statistics Reporter task started.")
    last_hour = datetime.now().hour
    last_day = datetime.now().date()
    from ais_logic import get_ship_type_name
    
    while True:
        try:
            now = datetime.now()
            current_hour = now.hour
            current_day = now.date()
            
            if current_hour != last_hour:
                logger.info(f"Generating hourly MQTT statistics for hour {last_hour}")
                snapshot = stats_collector.get_hourly_snapshot()
                
                s = await get_all_settings()
                base_topic = s.get("mqtt_pub_topic", "naviscore/objects").rstrip("/")
                prefix = base_topic.rsplit("/", 1)[0] if base_topic.endswith("/objects") else base_topic
                hourly_topic = f"{prefix}/objects_stat_hourly"
                
                # Generate AI hourly summary if enabled
                prev_snapshot = stats_collector.previous_hourly_snapshot
                hourly_payload = {
                    "_topic": hourly_topic,
                    **snapshot,
                    "hour": last_hour,
                    "date": now.strftime('%Y-%m-%d'),
                    "timestamp": int(now.timestamp() * 1000)
                }
                
                # Inkludera föregående timmens data i payloaden om den finns
                if prev_snapshot:
                    hourly_payload["previous_hour"] = {
                        "messages_received": prev_snapshot.get("messages_received", 0),
                        "new_vessels": prev_snapshot.get("new_vessels", 0),
                        "max_vessels": prev_snapshot.get("max_vessels", 0),
                        "max_range_km": prev_snapshot.get("max_range_km", 0),
                        "max_range_nm": prev_snapshot.get("max_range_nm", 0)
                    }
                
                ollama_enabled = is_true(s.get("ollama_enabled", "true"))
                ollama_url = s.get("ollama_url")
                ollama_model = s.get("ollama_model", "")
                ollama_api_type = s.get("ollama_api_type", "native")
                ollama_hourly_prompt = s.get("ollama_hourly_prompt_template", "")
                
                if ollama_enabled and ollama_url and ollama_model:
                    try:
                        ai_result = await asyncio.wait_for(
                            fetch_ollama_hourly_summary(snapshot, ollama_url, ollama_model, ollama_hourly_prompt or None, ollama_api_type, prev_snapshot),
                            timeout=120.0
                        )
                        if ai_result and isinstance(ai_result, dict):
                            hourly_payload["ai_hourly_summary"] = ai_result.get("response", "")
                            logger.info(f"[MQTT] AI hourly summary included in payload.")
                    except Exception as e:
                        logger.error(f"[MQTT] AI hourly summary failed or timed out: {e}")
                
                mqtt_pub_queue.put_nowait(hourly_payload)
                
                async with db_session() as db:
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
            
            if current_day != last_day:
                logger.info(f"Generating daily MQTT statistics for {last_day}")
                
                async with db_session() as db:
                    import aiosqlite
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
                        base_topic = s.get("mqtt_pub_topic", "naviscore/objects").rstrip("/")
                        prefix = base_topic.rsplit("/", 1)[0] if base_topic.endswith("/objects") else base_topic
                        daily_topic = f"{prefix}/objects_stat_daily"
                        
                        # Generate AI daily summary if enabled
                        ollama_enabled = is_true(s.get("ollama_enabled", "true"))
                        ollama_url = s.get("ollama_url")
                        ollama_model = s.get("ollama_model", "")
                        ollama_api_type = s.get("ollama_api_type", "native")
                        ollama_daily_prompt = s.get("ollama_daily_prompt_template", "")
                        
                        if ollama_enabled and ollama_url and ollama_model:
                            try:
                                ai_result = await asyncio.wait_for(
                                    fetch_ollama_daily_summary(daily_payload, ollama_url, ollama_model, ollama_daily_prompt or None, ollama_api_type),
                                    timeout=120.0
                                )
                                if ai_result and isinstance(ai_result, dict):
                                    daily_payload["ai_daily_summary"] = ai_result.get("response", "")
                                    logger.info(f"[MQTT] AI daily summary included in payload.")
                            except Exception as e:
                                logger.error(f"[MQTT] AI daily summary failed or timed out: {e}")
                        
                        mqtt_pub_queue.put_nowait({
                            "_topic": daily_topic,
                            **daily_payload,
                            "timestamp": int(now.timestamp() * 1000)
                        })
                
                last_day = current_day
                stats_collector.daily_new_vessels = 0
                
        except Exception as e:
            logger.error(f"Error in mqtt_stats_reporter: {e}")
            
        await asyncio.sleep(60)

async def notify_new_vessel(mmsi_str, pub_payload, settings):
    """Called by ais_processor to handle deduplication for NEW vessels."""
    logger.info(f"[MQTT] Entering notify_new_vessel for MMSI {mmsi_str} (Source: {pub_payload.get('source')})")
    is_already_handled = False
    now_ts = time.time()
    fingerprint = f"{round(pub_payload.get('lat') or 0, 4)}|{round(pub_payload.get('lon') or 0, 4)}|{pub_payload.get('sog')}|{pub_payload.get('cog')}|{pub_payload.get('nav_status')}"

    # Vi kollar databasen för att se om vi redan markerat detta som ett skickat 'nytt' fartyg.
    db_new_sent = False
    try:
        async with db_session() as db:
            async with db.execute("SELECT mqtt_new_sent FROM ships WHERE mmsi = ?", (mmsi_str,)) as cursor:
                row_db = await cursor.fetchone()
                if row_db:
                    db_new_sent = bool(row_db[0])
                    logger.debug(f"[MQTT] Found vessel {mmsi_str} in DB, mqtt_new_sent={db_new_sent}")
                else:
                    db_new_sent = False # Nytt fartyg
                    logger.debug(f"[MQTT] Vessel {mmsi_str} NOT found in DB. Treating as NEW.")
    except Exception as dbe:
        logger.error(f"[MQTT] Database error in notify_new_vessel for {mmsi_str}: {dbe}")
        # Vid DB-fel, anta att vi inte skickat den (fail safe för att tillåta triggers)
        db_new_sent = False
                
    async with mqtt_new_vessel_lock:
        if db_new_sent:
            # Om den redan är skickad som 'ny' enligt DB, kolla cachen för att undvika spam-updates
            if mmsi_str in mqtt_last_sent:
                time_since = now_ts - mqtt_last_sent[mmsi_str]["timestamp"]
                if time_since < 10:
                    is_already_handled = True
                    logger.debug(f"[MQTT] Vessel {mmsi_str} handled recently (<10s).")
                elif mqtt_last_sent[mmsi_str]["fingerprint"] == fingerprint and time_since < 30:
                    is_already_handled = True
                    logger.debug(f"[MQTT] Vessel {mmsi_str} identical state handled recently (<30s).")

        if is_already_handled:
            if is_true(settings.get("mqtt_pub_only_new")):
                return
            
            logger.info(f"[MQTT] Sending UPDATE instead of NEW for MMSI {mmsi_str}")
            pub_payload["event_type"] = "update"

            should_send_mqtt = True
            
            if mmsi_str in mqtt_last_sent:
                time_since = now_ts - mqtt_last_sent[mmsi_str]["timestamp"]
                if time_since < 10 or (mqtt_last_sent[mmsi_str]["fingerprint"] == fingerprint and time_since < 30):
                    should_send_mqtt = False
                    
            if should_send_mqtt:
                mqtt_last_sent[mmsi_str] = {"timestamp": now_ts, "fingerprint": fingerprint}
                mqtt_pub_queue.put_nowait(pub_payload)
            return

        # Not handled yet - we are sending as 'new'
        # Om vi inte har ett namn ännu, så vill vi inte låsa detta som "skickat" i DB.
        # Genom att inte sätta mqtt_new_sent = 1 så tillåter vi nästa meddelande (t.ex. Typ 5 som har namnet)
        # att trigga denna funktion som 'new' igen, vilket då inkluderar Ollama-anropet.
        has_name = pub_payload.get("name") and pub_payload.get("name").upper() != "UNKNOWN"
        
        mqtt_last_sent[mmsi_str] = {"timestamp": now_ts, "fingerprint": fingerprint}
        
        if has_name:
            async with db_session() as db:
                await db.execute("UPDATE ships SET mqtt_new_sent = 1 WHERE mmsi = ?", (mmsi_str,))
                await db.commit()
        else:
            logger.debug(f"[MQTT] New vessel {mmsi_str} detected but lacks name. Not marking as 'sent' in DB yet to allow Ollama trigger later.")


    # -- UTANFÖR LÅSET (för asynkrona time-consuming tasks) --
    base_topic = settings.get("mqtt_pub_topic", "naviscore/objects").rstrip("/")
    prefix = base_topic.rsplit("/", 1)[0] if base_topic.endswith("/objects") else base_topic
    new_topic = f"{prefix}/new_detected"
    
    # Hämtar ev. bild tidigt
    img_bytes = get_image_bytes(mmsi_str)
    
    # Lägg till landets namn (Sverige) och adjektiv (svenska) i payloaden
    country_code = pub_payload.get("country_code")
    if country_code:
        c_name = get_country_name(country_code)
        c_adj = get_country_adjective(country_code)
        if c_name:
            pub_payload["country_name"] = c_name
        if c_adj:
            pub_payload["country_adjective"] = c_adj
    
    # Hämta Ollama sammanfattning (om aktiverat)
    ollama_enabled = is_true(settings.get("ollama_enabled", "true"))
    ollama_url = settings.get("ollama_url")
    ollama_api_type = settings.get("ollama_api_type", "native")
    ollama_model = settings.get("ollama_model", "")
    ollama_prompt = settings.get("ollama_prompt_template", "")
    
    short_info_task = None
    if ollama_enabled and ollama_url and ollama_model:
        short_info_task = asyncio.create_task(fetch_ollama_short_info(pub_payload, ollama_url, ollama_model, ollama_prompt, ollama_api_type))
        # Vi väntar en kort stund för att ge Ollama chansen att svara
        await asyncio.sleep(2)
        
    try:
        if short_info_task:
            # Ge Ollama chansen att svara innan vi skickar ut de publika meddelandena
            ai_data = await asyncio.wait_for(short_info_task, timeout=120.0)
            if ai_data and isinstance(ai_data, dict):
                pub_payload["short_info"] = ai_data.get("response", "")
    except Exception as e:
        logger.error(f"[MQTT] Ollama fetch failed or timed out: {e}")



    # NU publicerar vi (en gång per händelse, med AI-infon inbakad om den hann bli klar)
    if img_bytes:
        mqtt_pub_queue.put_nowait((new_topic, img_bytes))
    else:
        mqtt_pub_queue.put_nowait((new_topic, json.dumps({"mmsi": mmsi_str, "event": "new_detected"})))
        
    mqtt_pub_queue.put_nowait(pub_payload)
