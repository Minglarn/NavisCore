import aiohttp
import asyncio
import json
import logging
import time
from datetime import datetime

logger = logging.getLogger("NavisCore")

_ollama_lock = asyncio.Lock()

def get_relative_time_string(timestamp_ms):
    if not timestamp_ms:
        return "unknown time"
    
    try:
        now = datetime.now()
        dt = datetime.fromtimestamp(timestamp_ms / 1000.0)
        diff = now - dt
        
        minutes = int(diff.total_seconds() / 60)
        hours = int(minutes / 60)
        days = int(hours / 24)
        
        time_str = dt.strftime("%H:%M")
        
        if minutes < 1:
            return "just now"
        elif minutes < 60:
            return f"{minutes} minutes ago at {time_str}"
        elif hours < 24:
            if dt.date() == now.date():
                return f"today at {time_str} ({hours} hours ago)"
            else:
                return f"yesterday at {time_str}"
        else:
            return f"{days} days ago at {time_str}"
    except Exception:
        return "unknown time"

async def fetch_ollama_short_info(payload: dict, url: str, model: str, prompt_template: str = None, api_type: str = 'native') -> dict:
    """
    Calls the local AI service (Ollama or OpenAI-compatible) and returns a summary plus metrics.
    Returns: {"response": "...", "stats": {"duration_ms": ..., "tokens": ...}}
    """
    if not url or not model:
        logger.error("[Ollama] Saknas URL eller modell-namn i inställningarna.")
        return None
        
    mmsi = str(payload.get("mmsi", ""))

    if not mmsi:
        return None
        
    # Skicka BARA för faktiska fartyg. Skippa AtoN, Base Stations, Meteo, SAR-flyg etc.
    if payload.get("is_nav_aid") is True:
        return None
        
    if payload.get("icon_category") in ["meteo", "aton", "base_station", "sar_aircraft"]:
        return None
        
    if mmsi.startswith("99") or mmsi.startswith("00") or mmsi.startswith("111") or mmsi.startswith("8"):
        return None
        
    if payload.get("msg_type") in [4, 8, 21]:
        return None
    
    ship_name = payload.get("name")
    if not ship_name or ship_name.upper() == "UNKNOWN":
        return None
        
    async with _ollama_lock:
        logger.debug(f"[Ollama] Förbereder prompt för MMSI {mmsi} med modell {model}...")

        current_date = datetime.now().strftime("%Y-%m-%d")
        last_seen_rel = get_relative_time_string(payload.get("last_seen"))
        
        # Om ingen mall skickas med (fallback), använd användarens föreslagna stil
        if not prompt_template:
            prompt_template = (
                "You are a maritime assistant. Based on this AIS data for a vessel in JSON format, "
                "write a short information sentence (max 2 sentences) in English.\n\n"
                "Include details such as:\n"
                "- Nationality/Home country based on 'country_adjective' and 'country_code'. Put the country code in parentheses after the country name.\n"
                "- Vessel type {ship_type_label} and Status '{status_text}'\n"
                "- Name {name} and MMSI {mmsi}\n"
                "- Destination {destination}, Speed {sog} and Position {lat}, {lon}\n"
                "- When the vessel was last seen. Today's date is {current_date}. Base it on {last_seen_relative}.\n\n"
                "Respond only with the information sentence, skip introductions like 'Here is...'."
            )

        # Ersätt placeholders dynamiskt från payload
        final_prompt = prompt_template
        
        # Lägg till special-placeholders i en temporär ordbok för ersättning
        template_vars = {**payload}
        template_vars["last_seen_relative"] = last_seen_rel
        template_vars["current_date"] = current_date
        
        # Säker ersättning för att undvika f-string kraschar om användaren har { i texten
        for key, value in template_vars.items():
            placeholder = "{" + str(key) + "}"
            if placeholder in final_prompt:
                val_str = str(value) if value is not None else ""
                final_prompt = final_prompt.replace(placeholder, val_str)

        if api_type == 'openai':
            # Auto-adjust URL if it looks like a base URL
            final_url = url
            if not final_url.endswith('/chat/completions') and not final_url.endswith('/completions'):
                base = final_url.rstrip('/')
                if not base.endswith('/v1'):
                    base += '/v1'
                final_url = base + '/chat/completions'
            
            request_data = {
                "model": model,
                "messages": [
                    {"role": "system", "content": "You are a helpful maritime assistant."},
                    {"role": "user", "content": final_prompt}
                ],
                "stream": False,
                "temperature": 0.2,
                "max_tokens": 300
            }
        else:
            final_url = url
            request_data = {
                "model": model,
                "prompt": final_prompt,
                "stream": False,
                "options": {
                    "num_ctx": 8192,
                    "temperature": 0.2,
                    "num_predict": 300
                }
            }

        start_time = time.time()
        try:
            connector = aiohttp.TCPConnector(limit=10)
            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.post(final_url, json=request_data, timeout=aiohttp.ClientTimeout(total=45)) as response:
                    duration_ms = int((time.time() - start_time) * 1000)
                    
                    if response.status == 200:
                        result = await response.json()
                        stats = {"duration_ms": duration_ms}
                        
                        if api_type == 'openai':
                            # OpenAI format: choices[0].message.content
                            ai_response = result.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                            usage = result.get("usage", {})
                            stats.update({
                                "prompt_tokens": usage.get("prompt_tokens"),
                                "completion_tokens": usage.get("completion_tokens"),
                                "total_tokens": usage.get("total_tokens")
                            })
                        else:
                            # Ollama format: response
                            ai_response = result.get("response", "").strip()
                            stats.update({
                                "total_duration_ms": int(result.get("total_duration", 0) / 1_000_000) if result.get("total_duration") else duration_ms,
                                "prompt_eval_count": result.get("prompt_eval_count"),
                                "eval_count": result.get("eval_count")
                            })
                            # Use internal duration if available for more precision
                            if "total_duration_ms" in stats:
                                stats["duration_ms"] = stats["total_duration_ms"]
                            
                        logger.info(f"AI response for {payload.get('name', 'unknown vessel')} ({duration_ms}ms): {ai_response}")
                        return {"response": ai_response, "stats": stats}
                    else:
                        error_text = await response.text()
                        logger.error(f"Local AI API error: {response.status} - {error_text}")
        except Exception as e:
            logger.error(f"Could not connect to AI service at {url}: {str(e)}")
        
        return None
