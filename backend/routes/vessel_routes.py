"""Vessel-related API routes."""
import time
import logging
import shutil
import os
import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, UploadFile, File
import aiosqlite

from ais_logic import get_ship_type_name, get_ship_category

logger = logging.getLogger("NavisCore")

router = APIRouter()


def setup_vessel_routes(db_session, get_all_settings, broadcast, IMAGES_DIR):
    """Initialize routes with shared dependencies."""

    @router.get("/api/ships")
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

    @router.get("/api/database")
    async def get_database(q: str = None, ship_type: int = None, source: str = None, limit: int = 50, offset: int = 0, sort: str = "last_seen", order: str = "desc"):
        allowed_sorts = ["mmsi", "name", "type", "message_count", "registration_count", "last_seen", "length", "width"]
        if sort not in allowed_sorts: sort = "last_seen"
        if order.lower() not in ["asc", "desc"]: order = "desc"
        async with db_session() as db:
            db.row_factory = aiosqlite.Row
            conditions, params = [], []
            if q:
                conditions.append("(mmsi LIKE ? OR name LIKE ? COLLATE NOCASE OR callsign LIKE ? COLLATE NOCASE)")
                params.extend([f"%{q}%", f"%{q}%", f"%{q}%"])
            if ship_type is not None: conditions.append("type = ?"); params.append(ship_type)
            if source and source != 'all': conditions.append("source = ?"); params.append(source.lower())
            where_clause = f" WHERE {' AND '.join(conditions)}" if conditions else ""
            count_query = f"SELECT COUNT(*) FROM ships{where_clause}"
            async with db.execute(count_query, tuple(params)) as cursor:
                total_row = await cursor.fetchone()
                total = total_row[0] if total_row else 0
            query = f"SELECT * FROM ships{where_clause} ORDER BY {sort} {order} LIMIT ? OFFSET ?"
            data_params = params + [limit, offset]
            async with db.execute(query, tuple(data_params)) as cursor:
                res = []
                for row in await cursor.fetchall():
                    d = dict(row)
                    d["imageUrl"] = d["image_url"] or "/images/0.jpg"
                    if d["type"] is not None:
                        try: c = int(d["type"]); d["ship_type_text"], d["ship_category"] = get_ship_type_name(c), get_ship_category(c)
                        except: pass
                    if d.get("session_start"):
                        try:
                            dt = datetime.strptime(d["session_start"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                            d["session_start"] = int(dt.timestamp() * 1000)
                        except: pass
                    res.append(d)
                return {"ships": res, "total": total}

    @router.get("/api/safety-alerts")
    async def get_safety_alerts():
        async with db_session() as db:
            db.row_factory = aiosqlite.Row
            r = await db.execute('SELECT * FROM safety_alerts WHERE dismissed = 0 ORDER BY timestamp DESC LIMIT 100')
            alerts = []
            for row in await r.fetchall():
                d = dict(row)
                if d.get("timestamp"):
                    try: d["timestamp_ms"] = int(datetime.strptime(d["timestamp"], "%Y-%m-%d %H:%M:%S").timestamp() * 1000)
                    except Exception: d["timestamp_ms"] = int(time.time() * 1000)
                alerts.append(d)
            return alerts

    @router.post("/api/safety-alerts/{alert_id}/dismiss")
    async def dismiss_safety_alert(alert_id: int):
        async with db_session() as db:
            await db.execute('UPDATE safety_alerts SET dismissed = 1 WHERE id = ?', (alert_id,))
            await db.commit()
        return {"success": True}

    @router.post("/api/ships/{mmsi}/image")
    async def upload_ship_image(mmsi: str, file: UploadFile = File(...)):
        try:
            if not mmsi.isdigit() or len(mmsi) != 9: return {"error": "Invalid MMSI"}
            file_ext = "jpg"
            if file.filename:
                parts = file.filename.split(".")
                if len(parts) > 1:
                    ext = parts[-1].lower()
                    if ext in ["jpg", "jpeg", "png", "webp"]: file_ext = ext
            safe_filename = f"{mmsi}.{file_ext}"
            file_path = os.path.join(IMAGES_DIR, safe_filename)
            for ext in ["jpg", "jpeg", "png", "webp"]:
                old_path = os.path.join(IMAGES_DIR, f"{mmsi}.{ext}")
                if os.path.exists(old_path) and old_path != file_path:
                    try: os.remove(old_path)
                    except Exception: pass
            with open(file_path, "wb") as buffer: shutil.copyfileobj(file.file, buffer)
            image_url = f"/images/{safe_filename}?t={int(time.time())}"
            async with db_session() as db:
                await db.execute('UPDATE ships SET image_url = ?, manual_image = 1 WHERE mmsi = ?', (f"/images/{safe_filename}", mmsi))
                await db.commit()
            await broadcast({"mmsi": mmsi, "imageUrl": image_url, "manual_image": True})
            return {"success": True, "imageUrl": image_url}
        except Exception as e:
            logger.error(f"Error uploading image for {mmsi}: {e}")
            return {"error": str(e)}

    @router.post("/api/ships/{mmsi}/details")
    async def update_ship_details(mmsi: str, details: dict):
        try:
            if not mmsi.isdigit() or len(mmsi) != 9: return {"error": "Invalid MMSI"}
            allowed_fields = ["name", "imo", "callsign", "shiptype", "length", "width", "destination", "draught", "mqtt_ignore", "mqtt_send_new"]
            filtered_details = {k: v for k, v in details.items() if k in allowed_fields}
            if filtered_details: logger.info(f"Updating details for ship {mmsi}: {filtered_details}")
            upd, vals, broadcast_data = [], [], {"mmsi": mmsi}
            for f, val in filtered_details.items():
                db_field = "type" if f == "shiptype" else f
                upd.append(f"{db_field} = ?"); vals.append(val); broadcast_data[f] = val
                if f == "shiptype":
                    try:
                        code = int(val)
                        broadcast_data["ship_type_text"] = get_ship_type_name(code)
                        broadcast_data["ship_category"] = get_ship_category(code)
                    except Exception as e: logger.error(f"Error calculating type info for {mmsi}: {e}")
            if not upd: return {"success": True, "message": "No relevant fields to update"}
            vals.append(mmsi)
            async with db_session() as db:
                await db.execute(f"UPDATE ships SET {', '.join(upd)} WHERE mmsi = ?", tuple(vals))
                await db.commit()
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
                        "name": d["name"], "callsign": d["callsign"], "imo": d["imo"]
                    })
            await broadcast(broadcast_data)
            return {"status": "success"}
        except Exception as e:
            logger.error(f"Error updating ship details for {mmsi}: {e}")
            return {"error": str(e)}

    @router.delete("/api/ships/{mmsi}")
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

    @router.post("/api/ships/{mmsi}/scrape")
    async def scrape_ship_image(mmsi: str):
        try:
            if not mmsi.isdigit() or len(mmsi) != 9: return {"error": "Invalid MMSI"}
            from utils.images import enrich_ship_data
            asyncio.create_task(enrich_ship_data(mmsi, force=True))
            return {"status": "success", "message": "Scraping task started"}
        except Exception as e:
            logger.error(f"Error triggering scrape for {mmsi}: {e}")
            return {"error": str(e)}

    return router
