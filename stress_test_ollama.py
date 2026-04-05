import asyncio
import json
import aiohttp
import sqlite3
import os
import time
import random
from datetime import datetime

# Inställningar
MODEL = "gemma4-nothink2:latest"
ITERATIONS = 10
DB_PATH = "data/naviscore.db"

# Data-pooler för slumpmässiga fartyg
COUNTRIES = [
    {"code": "se", "name": "Sverige"}, {"code": "no", "name": "Norge"}, 
    {"code": "fi", "name": "Finland"}, {"code": "dk", "name": "Danmark"},
    {"code": "de", "name": "Tyskland"}, {"code": "ee", "name": "Estland"},
    {"code": "nl", "name": "Nederländerna"}, {"code": "pl", "name": "Polen"}
]

SHIP_TYPES = ["Cargo", "Tanker", "Passenger", "Tug", "Fishing", "Pleasure Craft"]

DESTINATIONS = [
    "STOCKHOLM", "GÖTEBORG", "HELSINKI", "TALLINN", "HAMBURG", 
    "ROTTERDAM", "OSLO", "COPENHAGEN", "GDANSK", "VISBY"
]

SHIP_NAMES = [
    "OCEAN BREEZE", "BALTIC STAR", "NORDIC PRIDE", "SEA HUNTER",
    "GUSTAF V", "VIKING EXPLORER", "NEPTUNE", "POSEIDON",
    "FREJA", "THOR"
]

def generate_random_ship():
    country = random.choice(COUNTRIES)
    return {
        "mmsi": str(random.randint(200000000, 299999999)),
        "name": random.choice(SHIP_NAMES),
        "country_code": country["code"],
        "ship_type_label": random.choice(SHIP_TYPES),
        "destination": random.choice(DESTINATIONS),
        "sog": round(random.uniform(0.5, 25.0), 1),
        "lat": round(random.uniform(54.0, 65.0), 4),
        "lon": round(random.uniform(10.0, 25.0), 4),
        "last_seen": int(time.time() * 1000) - random.randint(0, 1000 * 60 * 60 * 24 * 7) # Upp till 7 dagar sedan
    }

async def call_ollama(session, url, payload, current_date):
    prompt = (
        "Du är en maritim assistent. Baserat på denna AIS-data för ett fartyg i JSON-format, "
        "skriv en kort informationsmening (max 2 meningar) på svenska.\n\n"
        "Inkludera detaljer som:\n"
        "- Nationalitet/Hemland baserat på 'country_code' (t.ex. 'Det cypriska lastfartyget...')\n"
        "- Fartygstyp (på svenska)\n"
        "- Namn och MMSI\n"
        "- Destination, Fart och Position\n"
        f"- När fartyget senast sågs. Dagens datum är {current_date}. Utgå från 'last_seen' (Unix timestamp i ms). "
        "Beskriv tiden relativt (t.ex. 'Sågs för 3 dagar sedan kl 14:20').\n\n"
        f"Data: {json.dumps(payload)}\n\n"
        "Svara endast med informationsmeningen."
    )

    request_data = {
        "model": MODEL,
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
        async with session.post(url, json=request_data, timeout=60) as response:
            duration = time.perf_counter() - start_time
            if response.status == 200:
                result = await response.json()
                return {
                    "status": "OK",
                    "time": duration,
                    "response": result.get("response", "").strip()
                }
            else:
                return {"status": f"Error {response.status}", "time": duration}
    except Exception as e:
        return {"status": f"Failed: {str(e)}", "time": 0}

async def run_stress_test():
    if not os.path.exists(DB_PATH):
        print(f"[FEL] Hittade inte databasen på {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    url = conn.execute("SELECT value FROM settings WHERE key='ollama_url'").fetchone()[0]
    conn.close()

    print("\n" + "="*80)
    print(f"       OLLAMA STRESS TEST (Seq: {ITERATIONS} iterations)      ")
    print(f"Modell: {MODEL}")
    print(f"URL: {url}")
    print("="*80 + "\n")

    current_date = datetime.now().strftime("%Y-%m-%d")
    total_time = 0
    successful = 0

    async with aiohttp.ClientSession() as session:
        for i in range(1, ITERATIONS + 1):
            ship = generate_random_ship()
            print(f"[{i}/{ITERATIONS}] Skickar {ship['name']} ({ship['ship_type_label']})...", end="", flush=True)
            
            res = await call_ollama(session, url, ship, current_date)
            
            if res["status"] == "OK":
                print(f" \033[92mKLAR ({res['time']:.2f}s)\033[0m")
                print(f"  > Svar: {res['response']}")
                total_time += res["time"]
                successful += 1
            else:
                print(f" \033[91mFEL: {res['status']}\033[0m")
            
            print("-" * 40)
            # Ingen sömn här eftersom vi vill testa sekventiell belastning direkt

    if successful > 0:
        avg_time = total_time / successful
        print("\n" + "="*80)
        print(f" SAMMANFATTNING: {successful}/{ITERATIONS} lyckades")
        print(f" Genomsnittlig tid: {avg_time:.2f}s")
        print("="*80 + "\n")

if __name__ == "__main__":
    asyncio.run(run_stress_test())
