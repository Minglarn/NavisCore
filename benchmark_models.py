import asyncio
import json
import aiohttp
import sqlite3
import os
import time
import sys
from datetime import datetime

# Konfiguration
DB_PATH = "data/naviscore.db"
TIMEOUT_LIMIT = 60 # Användarens gräns

MODELS = [
    "gemma4:latest",
    "gemma4-fast:latest",
    "gemma4-nothink:latest",
    "gemma4-nothink2:latest",
    "gemma-analytisk:latest"
]

async def benchmark_model(session, url, model, payload, current_date):
    prompt = (
        "Du är en maritim assistent. Baserat på denna AIS-data för ett fartyg i JSON-format, "
        "skriv en kort informationsmening (max 2 meningar) på svenska.\n\n"
        "Inkludera detaljer som:\n"
        "- Nationalitet/Hemland baserat på 'country_code' (t.ex. 'Det cypriska lastfartyget...')\n"
        "- Fartygstyp (på svenska)\n"
        "- Namn och MMSI\n"
        "- Destination, Fart och Position\n"
        f"- När fartyget senast sågs. Dagens datum är {current_date}. Utgå från 'last_seen' (ms). "
        "Beskriv tiden relativt (t.ex. 'Sågs för 3 dagar sedan kl 14:20').\n\n"
        f"Data: {json.dumps(payload)}\n\n"
        "Svara endast med informationsmeningen."
    )

    request_data = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "reasoning": False,
        "think": False,
        "options": {
            "num_ctx": 8192,
            "temperature": 0.2,
            "num_predict": 300
        }
    }

    start_time = time.perf_counter()
    try:
        async with session.post(url, json=request_data, timeout=TIMEOUT_LIMIT) as response:
            duration = time.perf_counter() - start_time
            if response.status == 200:
                result = await response.json()
                return {
                    "model": model,
                    "status": "OK",
                    "time": duration,
                    "response": result.get("response", "").strip()
                }
            else:
                return {"model": model, "status": f"Error {response.status}", "time": duration}
    except asyncio.TimeoutError:
        return {"model": model, "status": "TOO SLOW (>60s)", "time": TIMEOUT_LIMIT}
    except Exception as e:
        return {"model": model, "status": f"Failed: {str(e)}", "time": 0}

async def run_benchmark():
    if not os.path.exists(DB_PATH):
        print(f"[FEL] Hittade inte databasen på {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    url = conn.execute("SELECT value FROM settings WHERE key='ollama_url'").fetchone()[0]
    conn.close()

    print("\n" + "="*80)
    print(f"{'Modell':<35} | {'Status':<15} | {'Tid (s)':<10}")
    print("-" * 80)

    test_payload = {
        "mmsi": "265000000", "name": "SVEA RIKET", "country_code": "se",
        "ship_type_label": "Cargo", "destination": "STOCKHOLM", "sog": 12.5,
        "lat": 59.3, "lon": 18.5, "last_seen": int(time.time() * 1000) - (26 * 60 * 60 * 1000) # Igår
    }
    current_date = datetime.now().strftime("%Y-%m-%d")

    results = []
    async with aiohttp.ClientSession() as session:
        for model in MODELS:
            res = await benchmark_model(session, url, model, test_payload, current_date)
            results.append(res)
            
            status_str = res["status"]
            time_str = f"{res['time']:.2f}"
            print(f"{res['model']:<35} | {status_str:<15} | {time_str:<10}")
            if res["status"] == "OK":
                print(f"  > Svar: {res['response'][:100]}...")
            print("-" * 80)
            await asyncio.sleep(2) # Pausa mellan för stabilitet

    print("\n" + "="*80)
    print(" SAMMANFATTNING (Godkända modeller < 60s)")
    print("="*80)
    ok_models = sorted([r for r in results if r["status"] == "OK"], key=lambda x: x["time"])
    for m in ok_models:
        print(f" - {m['model']:<35}: {m['time']:.2f}s")

if __name__ == "__main__":
    asyncio.run(run_benchmark())
