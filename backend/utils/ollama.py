import aiohttp
import asyncio
import json
import logging
from datetime import datetime

logger = logging.getLogger("NavisCore")

_ollama_lock = asyncio.Lock()

def get_relative_time_string(timestamp_ms):
    if not timestamp_ms:
        return "okänd tid"
    
    try:
        now = datetime.now()
        dt = datetime.fromtimestamp(timestamp_ms / 1000.0)
        diff = now - dt
        
        minutes = int(diff.total_seconds() / 60)
        hours = int(minutes / 60)
        days = int(hours / 24)
        
        time_str = dt.strftime("%H:%M")
        
        if minutes < 1:
            return "just nu"
        elif minutes < 60:
            return f"för {minutes} minuter sedan kl {time_str}"
        elif hours < 24:
            if dt.date() == now.date():
                return f"idag kl {time_str} (för {hours} timmar sedan)"
            else:
                return f"igår kl {time_str}"
        else:
            return f"för {days} dagar sedan kl {time_str}"
    except Exception:
        return "okänd tid"

async def fetch_ollama_short_info(payload: dict, url: str, model: str, prompt_template: str = None) -> str:
    """
    Anropar lokala OLLAMA för att skapa en kort sammanfattning av AIS-datan.
    Returnerar texten från modellen, eller None om det misslyckas.
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
        
        # Om ingen mall skickas med (fallback), använd vår beprövade standardmall
        if not prompt_template:
            prompt_template = (
                "Du är en maritim assistent. Baserat på denna AIS-data för ett fartyg, skriv en kort informationsmening (max 2 meningar) på svenska.\n\n"
                "Inkludera detaljer som:\n"
                "- Nationalitet/Hemland baserat på {country_code} (t.ex. 'Det cypriska lastfartyget...')\n"
                "- Fartygstyp {ship_type_label} (på svenska)\n"
                "- Namn {name} och MMSI {mmsi}\n"
                "- Destination {destination}, Fart {sog} och Position {lat}, {lon}\n"
                f"- När fartyget senast sågs. Dagens datum är {current_date}. Utgå från {last_seen_relative}.\n\n"
                "Svara endast med informationsmeningen, skippa inledningar som 'Här är...'."
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

        request_data = {
            "model": model,
            "prompt": final_prompt,
            "stream": False,
            "reasoning": False,
            "think": False,
            "options": {
                "num_ctx": 8192,
                "temperature": 0.2,
                "num_predict": 300
            }
        }

        try:
            connector = aiohttp.TCPConnector(limit=10)
            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.post(url, json=request_data, timeout=aiohttp.ClientTimeout(total=45)) as response:
                    if response.status == 200:
                        result = await response.json()
                        ai_response = result.get("response", "").strip()
                        logger.info(f"Ollama svar för {payload.get('name', 'okänt fartyg')}: {ai_response}")
                        return ai_response
                    else:
                        error_text = await response.text()
                        logger.error(f"Ollama API fel: {response.status} - {error_text}")
        except Exception as e:
            logger.error(f"Kunde inte kontakta Ollama på {url}: {str(e)}")
        
        return None
