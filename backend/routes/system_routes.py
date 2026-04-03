"""System management API routes (settings, backup, restart)."""
import asyncio
import os
import io
import shutil
import zipfile
import json
import logging
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Response
import aiosqlite

logger = logging.getLogger("NavisCore")

router = APIRouter()


def setup_system_routes(db_session, get_all_settings, set_setting, broadcast, stats_collector, 
                        start_udp_listener, restart_aisstream, restart_mqtt_pub, restart_mqtt,
                        DB_PATH, DATA_DIR, IMAGES_DIR, MOCK_MODE, is_true, udp_transport_getter):
    """Initialize routes with shared dependencies."""

    @router.post("/api/reset_db")
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

    @router.get("/api/settings")
    async def get_settings_api(): return await get_all_settings()

    @router.post("/api/settings")
    async def set_settings_api(settings: dict):
        old = await get_all_settings()
        changed_keys = []
        for k, v in settings.items():
            if v is not None:
                old_val = old.get(k)
                new_val = str(v).lower() if isinstance(v, bool) else str(v)
                normalized_old = old_val.lower() if old_val in ["true", "false", "True", "False"] else old_val
                if normalized_old != new_val:
                    logger.info(f"Setting change detected: [{k}] '{old_val}' -> '{new_val}'")
                    await set_setting(k, new_val)
                    changed_keys.append(k)
        if not changed_keys:
            return {"success": True, "message": "No settings changed", "settings": old}
        logger.info(f"Settings update summary: {len(changed_keys)} fields changed: {', '.join(changed_keys)}")
        if "origin_lat" in changed_keys or "origin_lon" in changed_keys:
            logger.info("Origin coordinates changed. Resetting coverage sectors...")
            try:
                async with db_session() as db:
                    await db.execute('UPDATE coverage_sectors SET range_km_24h = 0.0, range_km_alltime = 0.0')
                    await db.commit()
            except Exception as e: logger.error(f"Failed to reset coverage sectors: {e}")
        if "udp_port" in changed_keys or "udp_enabled" in changed_keys:
            logger.info("Scheduling UDP listener restart...")
            asyncio.create_task(start_udp_listener())
        aisstream_keys = ["aisstream_enabled", "aisstream_api_key", "aisstream_sw_lat", "aisstream_sw_lon", "aisstream_ne_lat", "aisstream_ne_lon"]
        if any(k in changed_keys for k in aisstream_keys):
            logger.info("Scheduling AisStream restart...")
            asyncio.create_task(restart_aisstream())
        if any(k.startswith("mqtt_pub_") for k in changed_keys):
            logger.info("Scheduling MQTT Publisher restart...")
            restart_mqtt_pub()
        mqtt_keys = ["mqtt_enabled", "mqtt_url", "mqtt_user", "mqtt_pass"]
        if any(k in changed_keys for k in mqtt_keys):
            logger.info("Scheduling Core MQTT restart...")
            restart_mqtt()
        return {"success": True, "settings": await get_all_settings(), "changed": changed_keys}

    @router.get("/api/status")
    async def get_status():
        up = 0
        try:
            with open('/proc/uptime', 'r') as f: up = float(f.readline().split()[0])
        except: pass
        s = await get_all_settings()
        return {"sdr": not MOCK_MODE, "mock_mode": MOCK_MODE, "mqtt": is_true(s["mqtt_enabled"]), "uptime": up}

    @router.get("/api/backup/full")
    async def backup_full():
        try:
            temp_db = os.path.join(DATA_DIR, "naviscore_backup.db")
            shutil.copy2(DB_PATH, temp_db)
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, False) as zip_file:
                zip_file.write(temp_db, "naviscore.db")
                for root, _, files in os.walk(IMAGES_DIR):
                    for file in files:
                        file_path = os.path.join(root, file)
                        arcname = os.path.join("images", os.path.relpath(file_path, IMAGES_DIR))
                        zip_file.write(file_path, arcname)
            if os.path.exists(temp_db): os.remove(temp_db)
            zip_buffer.seek(0)
            filename = f"naviscore_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
            return Response(zip_buffer.getvalue(), media_type="application/x-zip-compressed",
                          headers={"Content-Disposition": f"attachment; filename={filename}"})
        except Exception as e:
            logger.error(f"Backup error: {e}")
            return {"status": "error", "message": str(e)}

    @router.post("/api/restore/full")
    async def restore_full(file: UploadFile = File(...)):
        try:
            contents = await file.read()
            zip_buffer = io.BytesIO(contents)
            with zipfile.ZipFile(zip_buffer) as zip_ref:
                if "naviscore.db" in zip_ref.namelist():
                    restore_db_path = os.path.join(DATA_DIR, "naviscore.db.restore")
                    with open(restore_db_path, "wb") as f: f.write(zip_ref.read("naviscore.db"))
                    shutil.move(restore_db_path, DB_PATH)
                    logger.info("Database restored from backup")
                for member in zip_ref.namelist():
                    if member.startswith("images/") and not member.endswith("/"):
                        filename = os.path.basename(member)
                        if filename:
                            target_path = os.path.join(IMAGES_DIR, filename)
                            with open(target_path, "wb") as f: f.write(zip_ref.read(member))
            return {"status": "success", "message": "System restored. Restart recommended."}
        except Exception as e:
            logger.error(f"Restore error: {e}")
            return {"status": "error", "message": str(e)}

    @router.post("/api/system/restart")
    async def system_restart():
        logger.warning("System restart requested via API")
        async def exit_later():
            await asyncio.sleep(1.0)
            transport = udp_transport_getter()
            if transport:
                logger.info("Closing UDP transport before exit")
                transport.close()
            logger.info("Exiting process for Docker restart")
            os._exit(0)
        asyncio.create_task(exit_later())
        return {"status": "success", "message": "Restarting system... UI will reconnect shortly."}

    return router
