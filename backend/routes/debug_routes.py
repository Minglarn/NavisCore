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

    return router

