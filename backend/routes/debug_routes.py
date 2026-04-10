"""Debug and simulation routes for NavisCore."""
import logging
import asyncio
from fastapi import APIRouter, HTTPException, Body
from ais_logic import AisStreamManager

logger = logging.getLogger("NavisCore")

router = APIRouter()

def setup_debug_routes(ais_queue: asyncio.Queue, broadcast_callback):
    """Initialize debug routes with shared dependencies."""
    
    # Vi skapar en egen manager för API-injektioner för att inte störa UDP-flödet
    # (eller delar den om vi vill ha fragmenteringsstöd över API).
    stream_manager = AisStreamManager()
    
    def handle_decoded(decoded_data):
        decoded_data["source"] = "udp"
        try:
            ais_queue.put_nowait(decoded_data)
            logger.info(f"[DEBUG API] Injected decoded AIS data for MMSI {decoded_data.get('mmsi')}")

        except asyncio.QueueFull:
            logger.warning("[DEBUG API] AIS queue full! Injection failed.")

    stream_manager.on_decode(handle_decoded)

    @router.post("/api/debug/inject-nmea")
    async def inject_nmea(payload: dict = Body(...)):
        """
        Injects one or more NMEA sentences directly into the AIS processing queue.
        Payload: {"nmea": "!AIVDM...*CS", "broadcast": true}
        """
        nmea = payload.get("nmea")
        should_broadcast = payload.get("broadcast", True)
        
        if not nmea:
            raise HTTPException(status_code=400, detail="Missing 'nmea' field in payload")
            
        logger.info(f"[DEBUG API] Received NMEA injection request: {nmea[:50]}...")
        
        # Simulera broadcast till frontend om det efterfrågas
        if should_broadcast:
            await broadcast_callback({"type": "nmea", "raw": nmea, "timestamp": int(asyncio.get_event_loop().time() * 1000)})
            
        # Processa meningen (detta triggar handle_decoded asynkront om den är komplett)
        try:
            stream_manager.process_sentence(nmea)
            return {"status": "success", "message": "NMEA sentence accepted for processing"}
        except Exception as e:
            logger.error(f"[DEBUG API] Error processing injected NMEA: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/api/debug/inject-json")
    async def inject_json(payload: dict = Body(...)):
        """
        Injects a raw decoded AIS JSON dict directly into the queue.
        Bypasses NMEA decoding entirely.
        """
        logger.info(f"[DEBUG API] Received JSON injection for MMSI {payload.get('mmsi')}")
        payload["source"] = payload.get("source", "udp") # Simulera UDP by default
        
        try:
            ais_queue.put_nowait(payload)
            return {"status": "success", "message": "JSON payload accepted for processing"}
        except asyncio.QueueFull:
            logger.warning("[DEBUG API] AIS queue full! JSON Injection failed.")
            raise HTTPException(status_code=500, detail="Queue full")

    @router.post("/api/debug/trigger-daily-summary")
    async def trigger_daily_summary():
        """
        Manually triggers the daily AI summary generation for the most recent date 
        in daily_stats. Useful for testing without waiting for midnight.
        """
        from utils.db import db_session as debug_db_session
        from utils.settings import get_all_settings as debug_settings, is_true as debug_is_true
        from utils.ollama import fetch_ollama_daily_summary
        import json as debug_json
        import aiosqlite
        
        logger.info("[DEBUG API] Manual daily summary trigger requested.")
        
        try:
            async with debug_db_session() as db:
                db.row_factory = aiosqlite.Row
                r = await db.execute("SELECT * FROM daily_stats ORDER BY date DESC LIMIT 1")
                day_row = await r.fetchone()
                
                if not day_row:
                    raise HTTPException(status_code=404, detail="No daily stats found in database")
                
                daily_payload = dict(day_row)
                if daily_payload.get("max_range_km") is not None:
                    km = daily_payload["max_range_km"]
                    daily_payload["max_range_km"] = round(km, 2)
                    daily_payload["max_range_nm"] = round(km * 0.539957, 2)
            
            s = await debug_settings()
            ollama_enabled = debug_is_true(s.get("ollama_enabled", "true"))
            ollama_url = s.get("ollama_url")
            ollama_model = s.get("ollama_model", "")
            ollama_api_type = s.get("ollama_api_type", "native")
            ollama_daily_prompt = s.get("ollama_daily_prompt_template", "")
            
            if not ollama_enabled or not ollama_url or not ollama_model:
                return {"status": "error", "message": "Ollama is not enabled or configured", "daily_payload": daily_payload}
            
            ai_result = await asyncio.wait_for(
                fetch_ollama_daily_summary(daily_payload, ollama_url, ollama_model, ollama_daily_prompt or None, ollama_api_type),
                timeout=120.0
            )
            
            if ai_result and isinstance(ai_result, dict):
                daily_payload["ai_daily_summary"] = ai_result.get("response", "")
                return {
                    "status": "success",
                    "daily_payload": daily_payload,
                    "ai_stats": ai_result.get("stats", {})
                }
            else:
                return {"status": "error", "message": "AI returned no result", "daily_payload": daily_payload}
                
        except asyncio.TimeoutError:
            raise HTTPException(status_code=504, detail="AI summary timed out after 120 seconds")
        except Exception as e:
            logger.error(f"[DEBUG API] Daily summary trigger error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    return router

