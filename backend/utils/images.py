"""Image utility functions and enrichment logic."""
import os
import base64
import logging
import asyncio
import httpx
from datetime import datetime

from config import IMAGES_DIR
from .db import db_session
from .settings import get_all_settings
from .vessel_scraper import get_scraper
logger = logging.getLogger("NavisCore")

_broadcast_callback = None

def set_image_broadcast_callback(cb):
    global _broadcast_callback
    _broadcast_callback = cb

async def broadcast_image(data: dict):
    if _broadcast_callback:
        await _broadcast_callback(data)

# Globals for enrichment
enrichment_queue = asyncio.Queue()
queued_mmsis = set()
active_lookups = set()

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
                await broadcast_image({"mmsi": mmsi, "imageUrl": f"/images/{mmsi}.jpg"})
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
                await broadcast_image({"mmsi": mmsi, "imageUrl": f"/images/{mmsi}.jpg"})
                return True
    except Exception as e: logger.error(f"[Enrichment] MarineTraffic error for {mmsi}: {str(e)}")
    return False

async def enrich_ship_data(mmsi: str, force: bool = False):
    if mmsi in active_lookups: return
    active_lookups.add(mmsi)
    try:
        async with db_session() as db:
            async with db.execute('SELECT image_fetched_at, image_url, manual_image, is_meteo, is_aton, is_base_station, name FROM ships WHERE mmsi = ?', (mmsi,)) as cursor:
                row = await cursor.fetchone()
                if not row: active_lookups.remove(mmsi); return # Not in DB yet
                
                image_fetched_at, image_url, manual_image, is_meteo, is_aton, is_base_station, name = row
                
                if not force:
                    if is_meteo or is_aton or is_base_station or not name or name.strip() == "":
                        active_lookups.remove(mmsi)
                        return

                    name_upper = name.upper()
                    if any(x in name_upper for x in ["METEO", "WEATHER", "BASE STATION", "ATON"]):
                        active_lookups.remove(mmsi)
                        return

                    if manual_image: active_lookups.remove(mmsi); return
                    if image_fetched_at:
                        fetch_date = datetime.strptime(image_fetched_at, "%Y-%m-%d %H:%M:%S")
                        if image_url and image_url != "/images/0.jpg":
                            if (datetime.now() - fetch_date).days < 30: active_lookups.remove(mmsi); return
                        else:
                            if (datetime.now() - fetch_date).days < 1: active_lookups.remove(mmsi); return

        local_path = os.path.join(IMAGES_DIR, f"{mmsi}.jpg")
        if os.path.exists(local_path):
            if force:
                try: os.remove(local_path)
                except Exception: pass
            else:
                async with db_session() as db:
                    await db.execute('UPDATE ships SET image_url = ?, image_fetched_at = CURRENT_TIMESTAMP WHERE mmsi = ?', (f"/images/{mmsi}.jpg", mmsi))
                    await db.commit()
                await broadcast_image({"mmsi": mmsi, "imageUrl": f"/images/{mmsi}.jpg"})
                return True

        async with db_session() as db:
            await db.execute('INSERT OR IGNORE INTO ships (mmsi, image_fetched_at, last_seen) VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)', (mmsi,))
            await db.execute('UPDATE ships SET image_fetched_at = CURRENT_TIMESTAMP WHERE mmsi = ?', (mmsi,))
            await db.commit()
        
        has_image = False
        
        # 1. Try Minglarn (fastest)
        if await try_minglarn_image(mmsi):
            has_image = True
        
        # 2. Try myshiptracking
        if not has_image:
            async with httpx.AsyncClient() as client:
                res = await client.get(f"https://www.myshiptracking.com/requests/autocomplete.php?type=1&site=1&q={mmsi}", headers={'User-Agent': 'Mozilla/5.0'}, timeout=10.0)
                try:
                    data = res.json() if res.status_code == 200 else []
                except Exception:
                    data = []
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
                            await broadcast_image({"mmsi": mmsi, "imageUrl": f"/images/{mmsi}.jpg"})
                            has_image = True
                            
        # 3. If still no image, check Playwright Settings and fallback
        if not has_image:
            settings = await get_all_settings()
            if settings.get("playwright_enabled", "false") == "true":
                logger.info(f"[Enrichment] Trying Playwright Scraper for {mmsi}")
                if await get_scraper(IMAGES_DIR).fetch_image(mmsi):
                    async with db_session() as db:
                        await db.execute('UPDATE ships SET image_url = ? WHERE mmsi = ?', (f"/images/{mmsi}.jpg", mmsi))
                        await db.commit()
                    await broadcast_image({"mmsi": mmsi, "imageUrl": f"/images/{mmsi}.jpg"})
                    has_image = True
            
        # 4. Final Http Fallback
        if not has_image:
            await asyncio.sleep(2)
            if not await try_marinetraffic_image(mmsi):
                await handle_fallback_image(mmsi)

    except Exception as e: logger.error(f"[Enrichment] Error for {mmsi}: {e}")
    finally:
        if mmsi in active_lookups: active_lookups.remove(mmsi)
