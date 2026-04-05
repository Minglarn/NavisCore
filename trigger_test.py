import sqlite3
import os
import time
import random
import json
import urllib.request

# Konfiguration
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(PROJECT_ROOT, "data", "naviscore.db")
API_URL = "http://localhost:3000/api/debug/inject-json"

def reset_vessel_in_db(mmsi):
    if not os.path.exists(DB_PATH):
        print(f"Databasen hittades inte på {DB_PATH}. Försöker ändå skicka API-anrop...")
        return
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM ships WHERE mmsi = ?", (mmsi,))
        ships_deleted = cursor.rowcount
        cursor.execute("DELETE FROM ship_history WHERE mmsi = ?", (mmsi,))
        history_deleted = cursor.rowcount
        print(f"[DB] Raderade {ships_deleted} fartygsrader och {history_deleted} historierader för {mmsi}")
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[DB] Fel vid radering av {mmsi}: {e}")

def inject_via_json(payload):
    """Skickar en ren JSON-payload direkt till backend för AIS-processing."""
    try:
        data = json.dumps(payload).encode('utf-8')
        headers = {'Content-Type': 'application/json'}
        req = urllib.request.Request(API_URL, data=data, headers=headers, method='POST')
        with urllib.request.urlopen(req) as response:
            if response.getcode() == 200:
                return True
    except Exception as e:
        print(f"[API] Fel vid injicering till {API_URL}: {e}")
    return False

def trigger_test_vessels():
    print("--- STARTAR JSON-BASERAD TEST-TRIGGER V9 (NÄRA DIN POSITION) ---")
    
    # Skapa unika MMSI
    unique_id = random.randint(100, 999)
    MMSI_1 = f"235062{unique_id}"
    MMSI_2 = f"266027{unique_id}"
    
    print(f"[INFO] Raderar gamla spår i DB för {MMSI_1} och {MMSI_2}...")
    reset_vessel_in_db(MMSI_1)
    reset_vessel_in_db(MMSI_2)
    time.sleep(1) # Ge Windows-mount lite tid att hinna med
    
    # Bas-data för positioner (Typ 1) nära ditt exakta behov (58.91, 17.56)
    pos_payload_1 = {"mmsi": MMSI_1, "type": 1, "lat": 58.91500, "lon": 17.57000, "sog": 12.5, "cog": 100, "nav_status": 0, "status_text": "Under way using engine"}
    pos_payload_2 = {"mmsi": MMSI_2, "type": 1, "lat": 58.89000, "lon": 17.55000, "sog": 10.2, "cog": 200, "nav_status": 0, "status_text": "Under way using engine"}

    # Bas-data för namn (Typ 5)
    name_payload_1 = {"mmsi": MMSI_1, "type": 5, "name": f"SIMULATION_{unique_id}_A", "shiptype": 70, "callsign": "SIM1", "destination": "NYNASHAMN"}
    name_payload_2 = {"mmsi": MMSI_2, "type": 5, "name": f"SIMULATION_{unique_id}_B", "shiptype": 60, "callsign": "SIM2", "destination": "STOCKHOLM"}

    print("\n[API] Injicerar positioner...")
    if inject_via_json(pos_payload_1): print(f"  -> {MMSI_1} position injicerad (Typ 1)")
    if inject_via_json(pos_payload_2): print(f"  -> {MMSI_2} position injicerad (Typ 1)")
    
    print("\n[API] Väntar 2 sekunder för att simulera fördröjning...")
    time.sleep(2)
    
    print("\n[API] Injicerar namn (Typ 5)...")
    if inject_via_json(name_payload_1): print(f"  -> {MMSI_1} namn injicerat (Typ 5)")
    if inject_via_json(name_payload_2): print(f"  -> {MMSI_2} namn injicerat (Typ 5)")
    
    print("\n--- KLAR ---")
    print("Fartygen är nu placerade väldigt nära LAT 58.91129 och LON 17.56135!")
    print("Kolla din docker-logg för att se MQTT/Ollama-anropen.")

if __name__ == "__main__":
    trigger_test_vessels()

