import asyncio
import logging
import json
import time
from datetime import datetime, timedelta
import os

from utils.settings import get_all_settings, is_true
from utils.db import db_session
from utils.images import enrichment_queue, queued_mmsis, enrich_ship_data
from config import IMAGES_DIR
from core.ais_processor import translate_aisstream_message, process_ais_data

logger = logging.getLogger("NavisCore")

aisstream_task = None
_ais_queue = None

def init_tasks(ais_queue):
    global _ais_queue
    _ais_queue = ais_queue

async def ais_processing_worker():
    """Background worker to process AIS messages sequentially from the queue."""
    logger.info("AIS processing worker started.")
    while True:
        try:
            if _ais_queue:
                data = await _ais_queue.get()
                await process_ais_data(data)
                _ais_queue.task_done()
            else:
                await asyncio.sleep(1)
        except Exception as e:
            logger.error(f"Worker error: {e}")
            await asyncio.sleep(1)

async def enrichment_worker():
    logger.info("Enrichment worker started.")
    while True:
        try:
            mmsi = await enrichment_queue.get()
            await enrich_ship_data(mmsi)
            if mmsi in queued_mmsis: queued_mmsis.remove(mmsi)
            enrichment_queue.task_done()
            await asyncio.sleep(5.0 + (time.time() % 2)*2.0)
        except Exception as e: 
            logger.error(f"Enrichment worker error: {e}")
            await asyncio.sleep(5.0)

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

async def purge_job():
    while True:
        try:
            settings = await get_all_settings()
            purge_days = int(settings.get("purge_days", "365"))
            
            async with db_session() as db:
                query = f"SELECT mmsi, image_url FROM ships WHERE last_seen < datetime('now', '-{purge_days} days')"
                async with db.execute(query) as cursor:
                    rows = await cursor.fetchall()
                    for row in rows:
                        mmsi, image_url = row
                        if image_url and image_url != "/images/0.jpg":
                            filename = image_url.split('/')[-1].split('?')[0]
                            p = os.path.join(IMAGES_DIR, filename)
                            if os.path.exists(p):
                                try:
                                    os.remove(p)
                                    logger.info(f"[Purge] Deleted image for purged vessel {mmsi}: {filename}")
                                except Exception as img_err:
                                    logger.error(f"[Purge] Failed to delete image {p}: {img_err}")
                
                await db.execute(f"DELETE FROM ships WHERE last_seen < datetime('now', '-{purge_days} days')")
                await db.execute("DELETE FROM daily_mmsi WHERE date < date('now', '-7 days')")
                await db.execute("DELETE FROM minute_stats WHERE time_min < datetime('now', '-24 hours')")
                await db.execute("DELETE FROM minute_mmsi WHERE time_min < datetime('now', '-24 hours')")
                await db.execute("DELETE FROM sector_history WHERE timestamp < ?", (int((datetime.now() - timedelta(hours=24)).timestamp() * 1000),))
                await db.commit()
                if len(rows) > 0:
                    logger.info(f"[Purge] Successfully purged {len(rows)} vessels older than {purge_days} days.")
        except Exception as e: 
            logger.error(f"[Purge] Error: {e}")
        
        await asyncio.sleep(86400)

async def coverage_24h_reset_job():
    while True:
        try:
            async with db_session() as db:
                await db.execute("UPDATE coverage_sectors SET range_km_24h = 0.0 WHERE last_updated < datetime('now', '-24 hours')")
                await db.commit()
        except Exception: pass
        await asyncio.sleep(3600)

async def aisstream_loop():
    import websockets
    logger.info("AisStream.io background task started.")
    try:
        while True:
            try:
                settings = await get_all_settings()
                enabled = is_true(settings.get("aisstream_enabled"))
                api_key = settings.get("aisstream_api_key")
                if not enabled or not api_key:
                    await asyncio.sleep(15)
                    continue
                
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
                        "FilterMessageTypes": ["PositionReport", "StandardClassBPositionReport", "ExtendedClassBPositionReport", "ShipStaticData", "AidsToNavigationReport", "StandardSearchAndRescueAircraftReport", "SafetyBroadcastMessage", "MultiSlotBinaryMessage"]
                    }
                    await ws.send(json.dumps(sub_msg))
                    logger.info("AisStream.io subscription sent successfully.")
                    
                    debug_count = 0
                    last_heartbeat = time.time()
                    
                    try:
                        async for message in ws:
                            now = time.time()
                            if now - last_heartbeat > 60:
                                logger.info(f"AisStream.io Heartbeat: Loop active, total messages this session: {debug_count}")
                                last_heartbeat = now
                            
                            debug_count += 1
                            try:
                                msg_json = json.loads(message)
                                translated = translate_aisstream_message(msg_json)
                                if translated and _ais_queue:
                                    _ais_queue.put_nowait(translated)
                            except Exception as inner_e:
                                logger.error(f"Error processing AisStream message: {inner_e}")
                    except websockets.exceptions.ConnectionClosed as ecc:
                        logger.error(f"AisStream.io connection closed by server: {ecc.code} - {ecc.reason}")
            except Exception as e:
                logger.error(f"AisStream.io loop error: {e}")
                await asyncio.sleep(10)
    except asyncio.CancelledError:
        logger.info("AisStream.io task cancelled.")

async def restart_aisstream():
    global aisstream_task
    if aisstream_task:
        logger.info("Cancelling existing AisStream task...")
        aisstream_task.cancel()
        try: await aisstream_task
        except asyncio.CancelledError: pass
    aisstream_task = asyncio.create_task(aisstream_loop())
    logger.info("New AisStream task started.")
