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


async def fetch_ollama_hourly_summary(stats_payload: dict, url: str, model: str, prompt_template: str = None, api_type: str = 'native', prev_stats: dict = None) -> dict:
    """
    Calls the local AI service to generate a comprehensive hourly summary
    based on aggregated AIS statistics, optionally including trend data from the previous hour.
    Returns: {"response": "...", "stats": {"duration_ms": ...}} or None
    """
    if not url or not model:
        logger.error("[Ollama] Missing URL or model for hourly summary.")
        return None

    async with _ollama_lock:
        logger.info(f"[Ollama] Preparing hourly summary prompt with model {model}...")

        current_date = datetime.now().strftime("%Y-%m-%d")
        current_time = datetime.now().strftime("%H:%M")
        current_hour = datetime.now().hour

        # Format the ship type distribution into readable text
        shiptypes = stats_payload.get("shiptypes", {})
        active_types = {k: v for k, v in shiptypes.items() if v > 0}
        if active_types:
            sorted_types = sorted(active_types.items(), key=lambda x: x[1], reverse=True)
            shiptype_summary = ", ".join([f"{label}: {count}" for label, count in sorted_types])
        else:
            shiptype_summary = "No vessel types recorded"

        # Calculate trend data compared to previous hour
        def calc_change(current, previous):
            """Returns change percentage string like '+25%' or '-10%' or 'N/A'."""
            if previous is None or previous == 0:
                return "N/A (no previous data)"
            change = ((current - previous) / previous) * 100
            sign = "+" if change >= 0 else ""
            return f"{sign}{change:.0f}%"

        if prev_stats:
            prev_messages = prev_stats.get("messages_received", 0)
            prev_new_vessels = prev_stats.get("new_vessels", 0)
            prev_max_vessels = prev_stats.get("max_vessels", 0)
            prev_max_range_km = prev_stats.get("max_range_km", 0)
            prev_max_range_nm = prev_stats.get("max_range_nm", 0)
            
            change_messages = calc_change(stats_payload.get("messages_received", 0), prev_messages)
            change_new_vessels = calc_change(stats_payload.get("new_vessels", 0), prev_new_vessels)
            change_max_vessels = calc_change(stats_payload.get("max_vessels", 0), prev_max_vessels)
            change_range = calc_change(stats_payload.get("max_range_km", 0), prev_max_range_km)
            
            trend_section = (
                f"\n\nComparison with previous hour:\n"
                f"- Messages: {prev_messages} → {stats_payload.get('messages_received', 0)} ({change_messages})\n"
                f"- New vessels: {prev_new_vessels} → {stats_payload.get('new_vessels', 0)} ({change_new_vessels})\n"
                f"- Unique vessels: {prev_max_vessels} → {stats_payload.get('max_vessels', 0)} ({change_max_vessels})\n"
                f"- Max range: {prev_max_range_km} km → {stats_payload.get('max_range_km', 0)} km ({change_range})"
            )
            has_prev = True
        else:
            prev_messages = 0
            prev_new_vessels = 0
            prev_max_vessels = 0
            prev_max_range_km = 0.0
            prev_max_range_nm = 0.0
            change_messages = "N/A"
            change_new_vessels = "N/A"
            change_max_vessels = "N/A"
            change_range = "N/A"
            trend_section = "\n\nNo previous hour data available for comparison."
            has_prev = False

        if not prompt_template:
            prompt_template = (
                "You are a maritime traffic analyst. Based on the following hourly AIS statistics, "
                "write a comprehensive summary (3-5 sentences) in English.\n\n"
                "Statistics for the past hour:\n"
                "- Date: {current_date}, Time: {current_time} (hour {current_hour})\n"
                "- Total AIS messages received: {messages_received}\n"
                "- New vessels detected this hour: {new_vessels}\n"
                "- Maximum unique vessels observed: {max_vessels}\n"
                "- Maximum reception range: {max_range_km} km ({max_range_nm} nm)\n"
                "- Vessel type distribution: {shiptype_summary}\n"
                "{trend_section}\n\n"
                "Provide an insightful analysis of the maritime traffic patterns. "
                "Compare with the previous hour if data is available and highlight significant changes. "
                "Note any interesting trends such as increasing/decreasing traffic, unusual vessel types, or notable range performance. "
                "Respond only with the summary text, no introductions."
            )

        # Build template variables
        template_vars = {**stats_payload}
        template_vars["current_date"] = current_date
        template_vars["current_time"] = current_time
        template_vars["current_hour"] = str(current_hour)
        template_vars["shiptype_summary"] = shiptype_summary
        template_vars["trend_section"] = trend_section
        # Previous hour values (for custom prompts)
        template_vars["prev_messages_received"] = str(prev_messages)
        template_vars["prev_new_vessels"] = str(prev_new_vessels)
        template_vars["prev_max_vessels"] = str(prev_max_vessels)
        template_vars["prev_max_range_km"] = str(prev_max_range_km)
        template_vars["prev_max_range_nm"] = str(prev_max_range_nm)
        # Change percentages (for custom prompts)
        template_vars["change_messages"] = change_messages
        template_vars["change_new_vessels"] = change_new_vessels
        template_vars["change_max_vessels"] = change_max_vessels
        template_vars["change_range"] = change_range
        template_vars["has_previous_data"] = "yes" if has_prev else "no"

        # Safe placeholder replacement
        final_prompt = prompt_template
        for key, value in template_vars.items():
            placeholder = "{" + str(key) + "}"
            if placeholder in final_prompt:
                val_str = str(value) if value is not None else ""
                final_prompt = final_prompt.replace(placeholder, val_str)

        if api_type == 'openai':
            final_url = url
            if not final_url.endswith('/chat/completions') and not final_url.endswith('/completions'):
                base = final_url.rstrip('/')
                if not base.endswith('/v1'):
                    base += '/v1'
                final_url = base + '/chat/completions'

            request_data = {
                "model": model,
                "messages": [
                    {"role": "system", "content": "You are a helpful maritime traffic analyst."},
                    {"role": "user", "content": final_prompt}
                ],
                "stream": False,
                "temperature": 0.3,
                "max_tokens": 500
            }
        else:
            final_url = url
            request_data = {
                "model": model,
                "prompt": final_prompt,
                "stream": False,
                "options": {
                    "num_ctx": 8192,
                    "temperature": 0.3,
                    "num_predict": 500
                }
            }

        start_time = time.time()
        try:
            connector = aiohttp.TCPConnector(limit=10)
            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.post(final_url, json=request_data, timeout=aiohttp.ClientTimeout(total=120)) as response:
                    duration_ms = int((time.time() - start_time) * 1000)

                    if response.status == 200:
                        result = await response.json()
                        stats = {"duration_ms": duration_ms}

                        if api_type == 'openai':
                            ai_response = result.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                            usage = result.get("usage", {})
                            stats.update({
                                "prompt_tokens": usage.get("prompt_tokens"),
                                "completion_tokens": usage.get("completion_tokens"),
                                "total_tokens": usage.get("total_tokens")
                            })
                        else:
                            ai_response = result.get("response", "").strip()
                            stats.update({
                                "total_duration_ms": int(result.get("total_duration", 0) / 1_000_000) if result.get("total_duration") else duration_ms,
                                "prompt_eval_count": result.get("prompt_eval_count"),
                                "eval_count": result.get("eval_count")
                            })
                            if "total_duration_ms" in stats:
                                stats["duration_ms"] = stats["total_duration_ms"]

                        logger.info(f"[Ollama] Hourly summary generated ({duration_ms}ms): {ai_response[:100]}...")
                        return {"response": ai_response, "stats": stats}
                    else:
                        error_text = await response.text()
                        logger.error(f"[Ollama] Hourly summary API error: {response.status} - {error_text}")
        except Exception as e:
            logger.error(f"[Ollama] Could not generate hourly summary: {str(e)}")

        return None


async def fetch_ollama_daily_summary(stats_payload: dict, url: str, model: str, prompt_template: str = None, api_type: str = 'native') -> dict:
    """
    Calls the local AI service to generate a comprehensive daily summary
    based on aggregated AIS statistics for the entire day.
    Returns: {"response": "...", "stats": {"duration_ms": ...}} or None
    """
    if not url or not model:
        logger.error("[Ollama] Missing URL or model for daily summary.")
        return None

    async with _ollama_lock:
        logger.info(f"[Ollama] Preparing daily summary prompt with model {model}...")

        report_date = stats_payload.get("date", datetime.now().strftime("%Y-%m-%d"))

        # Format the ship type distribution into readable text
        shiptype_json = stats_payload.get("shiptype_json", "")
        if shiptype_json and isinstance(shiptype_json, str):
            try:
                shiptype_list = json.loads(shiptype_json)
                if shiptype_list:
                    sorted_types = sorted(shiptype_list, key=lambda x: x.get("count", 0), reverse=True)
                    shiptype_summary = ", ".join([f"{t.get('label', 'Unknown')}: {t.get('count', 0)}" for t in sorted_types if t.get("count", 0) > 0])
                else:
                    shiptype_summary = "No vessel types recorded"
            except (json.JSONDecodeError, TypeError):
                shiptype_summary = "No vessel types recorded"
        else:
            shiptype_summary = "No vessel types recorded"

        if not prompt_template:
            prompt_template = (
                "You are a maritime traffic analyst. Based on the following daily AIS statistics, "
                "write a comprehensive summary (3-5 sentences) in English.\n\n"
                "Daily statistics for {report_date}:\n"
                "- Total AIS messages received: {total_messages}\n"
                "- Unique vessels observed: {unique_ships}\n"
                "- New vessels detected: {new_ships}\n"
                "- Maximum reception range: {max_range_km} km ({max_range_nm} nm)\n"
                "- Vessel type distribution: {shiptype_summary}\n\n"
                "Provide an insightful analysis of the day's maritime traffic patterns. "
                "Highlight interesting trends such as vessel diversity, traffic volume, "
                "or notable range performance. "
                "Respond only with the summary text, no introductions."
            )

        # Build template variables
        template_vars = {**stats_payload}
        template_vars["report_date"] = report_date
        template_vars["shiptype_summary"] = shiptype_summary

        # Safe placeholder replacement
        final_prompt = prompt_template
        for key, value in template_vars.items():
            placeholder = "{" + str(key) + "}"
            if placeholder in final_prompt:
                val_str = str(value) if value is not None else ""
                final_prompt = final_prompt.replace(placeholder, val_str)

        if api_type == 'openai':
            final_url = url
            if not final_url.endswith('/chat/completions') and not final_url.endswith('/completions'):
                base = final_url.rstrip('/')
                if not base.endswith('/v1'):
                    base += '/v1'
                final_url = base + '/chat/completions'

            request_data = {
                "model": model,
                "messages": [
                    {"role": "system", "content": "You are a helpful maritime traffic analyst."},
                    {"role": "user", "content": final_prompt}
                ],
                "stream": False,
                "temperature": 0.3,
                "max_tokens": 500
            }
        else:
            final_url = url
            request_data = {
                "model": model,
                "prompt": final_prompt,
                "stream": False,
                "options": {
                    "num_ctx": 8192,
                    "temperature": 0.3,
                    "num_predict": 500
                }
            }

        start_time = time.time()
        try:
            connector = aiohttp.TCPConnector(limit=10)
            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.post(final_url, json=request_data, timeout=aiohttp.ClientTimeout(total=120)) as response:
                    duration_ms = int((time.time() - start_time) * 1000)

                    if response.status == 200:
                        result = await response.json()
                        stats = {"duration_ms": duration_ms}

                        if api_type == 'openai':
                            ai_response = result.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                            usage = result.get("usage", {})
                            stats.update({
                                "prompt_tokens": usage.get("prompt_tokens"),
                                "completion_tokens": usage.get("completion_tokens"),
                                "total_tokens": usage.get("total_tokens")
                            })
                        else:
                            ai_response = result.get("response", "").strip()
                            stats.update({
                                "total_duration_ms": int(result.get("total_duration", 0) / 1_000_000) if result.get("total_duration") else duration_ms,
                                "prompt_eval_count": result.get("prompt_eval_count"),
                                "eval_count": result.get("eval_count")
                            })
                            if "total_duration_ms" in stats:
                                stats["duration_ms"] = stats["total_duration_ms"]

                        logger.info(f"[Ollama] Daily summary generated ({duration_ms}ms): {ai_response[:100]}...")
                        return {"response": ai_response, "stats": stats}
                    else:
                        error_text = await response.text()
                        logger.error(f"[Ollama] Daily summary API error: {response.status} - {error_text}")
        except Exception as e:
            logger.error(f"[Ollama] Could not generate daily summary: {str(e)}")

        return None
