import asyncio
import json
import aiohttp
import sqlite3
import os
import time
import random
from datetime import datetime

# Inställningar
MODEL = "gemma-4-26b-a4b-moe"
ITERATIONS = 10
# Uppdaterad URL för OpenAI-kompatibelt API i Ollama
# http://192.168.1.239:11434/api/generate <-- Om vi använder OLLAMA!!!
OLLAMA_API_URL = "http://192.168.1.239:11434/v1/chat/completions"

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
        "last_seen": int(time.time() * 1000) - random.randint(0, 1000 * 60 * 60 * 24 * 7) 
    }

async def call_ollama(session, payload, current_date):
    # OpenAI-format kräver meddelanden i en lista
    system_prompt = (
        "Du är en maritim assistent. Baserat på AIS-data för ett fartyg, "
        "skriv en kort informationsmening (max 2 meningar) på engelska."
    )
    
    user_content = (
        f"Inkludera detaljer som:\n"
        f"- Nationalitet baserat på country_code\n"
        f"- Fartygstyp (på svenska), Namn och MMSI\n"
        f"- Destination, Fart och Position\n"
        f"- Senast sedd relativt till dagens datum ({current_date}).\n\n"
        f"Data: {json.dumps(payload)}"
        "Respond only with the information sentence, skip introductions like 'Here is...'."
    )

    # Payload enligt OpenAI API standard
    request_data = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ],
        "temperature": 0.2,
        "max_tokens": 300
    }

    start_time = time.perf_counter()
    try:
        async with session.post(OLLAMA_API_URL, json=request_data, timeout=60) as response:
            duration = time.perf_counter() - start_time
            if response.status == 200:
                result = await response.json()
                # Extrahera svaret enligt OpenAI-format: choices[0].message.content
                content = result["choices"][0]["message"]["content"].strip()
                return {
                    "status": "OK",
                    "time": duration,
                    "response": content
                }
            else:
                error_text = await response.text()
                return {"status": f"Error {response.status}: {error_text}", "time": duration}
    except Exception as e:
        return {"status": f"Failed: {str(e)}", "time": 0}

async def run_stress_test():
    print("\n" + "="*80)
    print(f"      OLLAMA OPENAI-API STRESS TEST (Seq: {ITERATIONS} iterations)      ")
    print(f"Modell: {MODEL}")
    print(f"URL: {OLLAMA_API_URL}")
    print("="*80 + "\n")

    current_date = datetime.now().strftime("%Y-%m-%d")
    total_time = 0
    successful = 0

    # Skapar en session för att återanvända TCP-anslutningar (effektivare)
    async with aiohttp.ClientSession() as session:
        for i in range(1, ITERATIONS + 1):
            ship = generate_random_ship()
            print(f"[{i}/{ITERATIONS}] Skickar {ship['name']} ({ship['ship_type_label']})...", end="", flush=True)
            
            res = await call_ollama(session, ship, current_date)
            
            if res["status"] == "OK":
                print(f" \033[92mKLAR ({res['time']:.2f}s)\033[0m")
                print(f"  > Svar: {res['response']}")
                total_time += res["time"]
                successful += 1
            else:
                print(f" \033[91mFEL: {res['status']}\033[0m")
            
            print("-" * 40)

    if successful > 0:
        avg_time = total_time / successful
        print("\n" + "="*80)
        print(f" SAMMANFATTNING: {successful}/{ITERATIONS} lyckades")
        print(f" Genomsnittlig tid per anrop: {avg_time:.2f}s")
        print("="*80 + "\n")

if __name__ == "__main__":
    asyncio.run(run_stress_test())