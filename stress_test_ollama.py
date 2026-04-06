import asyncio
import json
import aiohttp
import sqlite3
import os
import time
import random
from datetime import datetime

# Settings
MODEL = "gemma4-nothink2:latest"
ITERATIONS = 10
DB_PATH = "backend/data/naviscore.db"

# Data pools for random vessels
COUNTRIES = [
    {"code": "se", "name": "Sweden", "adjective": "Swedish"}, 
    {"code": "no", "name": "Norway", "adjective": "Norwegian"}, 
    {"code": "fi", "name": "Finland", "adjective": "Finnish"}, 
    {"code": "dk", "name": "Denmark", "adjective": "Danish"},
    {"code": "de", "name": "Germany", "adjective": "German"}, 
    {"code": "ee", "name": "Estonia", "adjective": "Estonian"},
    {"code": "nl", "name": "Netherlands", "adjective": "Dutch"}, 
    {"code": "pl", "name": "Poland", "adjective": "Polish"},
    {"code": "gb", "name": "United Kingdom", "adjective": "British"},
    {"code": "cy", "name": "Cyprus", "adjective": "Cypriot"}
]

SHIP_TYPES = ["Cargo", "Tanker", "Passenger", "Tug", "Fishing", "Pleasure Craft"]

DESTINATIONS = [
    "STOCKHOLM", "GOTHENBURG", "HELSINKI", "TALLINN", "HAMBURG", 
    "ROTTERDAM", "OSLO", "COPENHAGEN", "GDANSK", "VISBY"
]

STATUSES = [
    "Under way using engine", "At anchor", "Moored", "Not under command", 
    "Constrained by her draught", "Restricted manoeuverability", "Aground"
]

SHIP_NAMES = [
    "OCEAN BREEZE", "BALTIC STAR", "NORDIC PRIDE", "SEA HUNTER",
    "GUSTAF V", "VIKING EXPLORER", "NEPTUNE", "POSEIDON",
    "FREJA", "THOR"
]

def get_relative_time_string(timestamp_ms):
    try:
        now = datetime.now()
        dt = datetime.fromtimestamp(timestamp_ms / 1000.0)
        diff = now - dt
        minutes = int(diff.total_seconds() / 60)
        hours = int(minutes / 60)
        days = int(hours / 24)
        time_str = dt.strftime("%H:%M")
        if minutes < 1: return "just now"
        if minutes < 60: return f"{minutes} minutes ago at {time_str}"
        if hours < 24: return f"today at {time_str}" if dt.date() == now.date() else f"yesterday at {time_str}"
        return f"{days} days ago at {time_str}"
    except: return "unknown time"

def generate_random_ship():
    country = random.choice(COUNTRIES)
    ts = int(time.time() * 1000) - random.randint(0, 1000 * 60 * 60 * 24 * 7)
    return {
        "mmsi": str(random.randint(200000000, 299999999)),
        "name": random.choice(SHIP_NAMES),
        "country_code": country["code"],
        "country_name": country["name"],
        "country_adjective": country["adjective"],
        "ship_type_label": random.choice(SHIP_TYPES),
        "status_text": random.choice(STATUSES),
        "destination": random.choice(DESTINATIONS),
        "sog": round(random.uniform(0.5, 25.0), 1),
        "lat": round(random.uniform(54.0, 65.0), 4),
        "lon": round(random.uniform(10.0, 25.0), 4),
        "last_seen": ts,
        "last_seen_relative": get_relative_time_string(ts)
    }

async def call_ollama(session, url, payload, current_date):
    prompt = (
        "You are a maritime assistant. Based on this AIS data for a vessel in JSON format, "
        "write a short information sentence (max 2 sentences) in English.\n\n"
        "Include details such as:\n"
        "- Nationality/Home country based on 'country_adjective' and 'country_code'. Put the country code in parentheses after the country name.\n"
        "- Vessel type {ship_type_label} and Status '{status_text}'\n"
        "- Name {name} and MMSI {mmsi}\n"
        "- Destination {destination}, Speed {sog} and Position {lat}, {lon}\n"
        f"- When the vessel was last seen. Today's date is {current_date}. Base it on the field 'last_seen_relative' in the JSON data.\n\n"
        f"Data: {json.dumps(payload)}\n\n"
        "Respond only with the information sentence."
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
        print(f"[ERROR] Could not find database at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    url_row = conn.execute("SELECT value FROM settings WHERE key='ollama_url'").fetchone()
    if not url_row:
        print("[ERROR] Could not find 'ollama_url' in settings table.")
        return
    url = url_row[0]
    conn.close()

    print("\n" + "="*80)
    print(f"       OLLAMA STRESS TEST (Seq: {ITERATIONS} iterations)      ")
    print(f"Model: {MODEL}")
    print(f"URL: {url}")
    print("="*80 + "\n")

    current_date = datetime.now().strftime("%Y-%m-%d")
    total_time = 0
    successful = 0

    async with aiohttp.ClientSession() as session:
        for i in range(1, ITERATIONS + 1):
            ship = generate_random_ship()
            print(f"[{i}/{ITERATIONS}] Sending {ship['name']} ({ship['ship_type_label']})...", end="", flush=True)
            
            res = await call_ollama(session, url, ship, current_date)
            
            if res["status"] == "OK":
                print(f" \033[92mDONE ({res['time']:.2f}s)\033[0m")
                print(f"  {res['response']}")
                total_time += res["time"]
                successful += 1
            else:
                print(f" \033[91mERROR: {res['status']}\033[0m")
            
            print("-" * 40)
            # No sleep here as we want to test sequential load directly

    if successful > 0:
        avg_time = total_time / successful
        print("\n" + "="*80)
        print(f" SUMMARY: {successful}/{ITERATIONS} succeeded")
        print(f" Average time: {avg_time:.2f}s")
        print("="*80 + "\n")

if __name__ == "__main__":
    asyncio.run(run_stress_test())
