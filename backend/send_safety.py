#!/usr/bin/env python3
"""
NavisCore AIS Safety Alert Test Generator
Sends simulated safety alerts (AIS Type 14) at random positions
near the configured Station Origin.
"""
import socket
import time
import sqlite3
import os
import random
import math
import json

# ─── AIS Encoding ────────────────────────────────────────────

def ais_6bit_encode(text):
    """Encodes text to AIS 6-bit binary string."""
    res = ""
    for char in text.upper():
        c = ord(char)
        if c < 32: val = 0
        elif c < 64: val = c
        elif c < 96: val = c - 64
        else: val = 0
        res += f"{val:06b}"
    return res


def encode_type14(mmsi, text):
    """Creates a raw NMEA Type 14 sentence."""
    bits = f"{14:06b}00{mmsi:030b}00"
    bits += ais_6bit_encode(text)
    padding = (6 - (len(bits) % 6)) % 6
    bits += "0" * padding
    payload = ""
    for i in range(0, len(bits), 6):
        val = int(bits[i:i+6], 2)
        if val < 40: payload += chr(val + 48)
        else: payload += chr(val + 56)
    return f"!AIVDM,1,1,,A,{payload},{padding}"


def calculate_checksum(sentence):
    if sentence.startswith(('!', '$')): sentence = sentence[1:]
    if '*' in sentence: sentence = sentence.split('*')[0]
    checksum = 0
    for char in sentence: checksum ^= ord(char)
    return f"{checksum:02X}"


def send_nmea(sentence, host='127.0.0.1', port=10110):
    full_sentence = f"{sentence}*{calculate_checksum(sentence)}\r\n"
    print(f"  TX: {full_sentence.strip()}")
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.sendto(full_sentence.encode('ascii'), (host, port))
    sock.close()


# ─── Geo Helpers ─────────────────────────────────────────────

def random_point_near(lat, lon, max_radius_km=15):
    """Generate a random point within max_radius_km of (lat, lon)."""
    r = max_radius_km * math.sqrt(random.random())  # uniform distribution in circle
    theta = random.uniform(0, 2 * math.pi)
    
    dlat = r / 111.32  # 1 degree lat ≈ 111.32 km
    dlon = r / (111.32 * math.cos(math.radians(lat)))
    
    new_lat = lat + dlat * math.cos(theta)
    new_lon = lon + dlon * math.sin(theta)
    return round(new_lat, 6), round(new_lon, 6)


# ─── Database ────────────────────────────────────────────────

def find_db():
    """Find the naviscore.db file."""
    possible_paths = [
        os.path.join(os.path.dirname(__file__), '..', 'data', 'naviscore.db'),
        os.path.join(os.path.dirname(__file__), 'data', 'naviscore.db'),
        'data/naviscore.db',
    ]
    for p in possible_paths:
        if os.path.exists(p):
            return os.path.abspath(p)
    return None


def get_origin(db_path):
    """Read Station Origin from settings table."""
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key='origin_lat'")
        lat_row = cursor.fetchone()
        cursor.execute("SELECT value FROM settings WHERE key='origin_lon'")
        lon_row = cursor.fetchone()
        conn.close()
        
        if lat_row and lon_row and lat_row[0] and lon_row[0]:
            return float(lat_row[0]), float(lon_row[0])
    except Exception as e:
        print(f"  Could not read origin from DB: {e}")
    
    return None, None


def inject_vessel(db_path, mmsi, name, lat, lon):
    """Insert or update a test vessel with position in the DB."""
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT OR REPLACE INTO ships (mmsi, name, latitude, longitude, last_seen, source) "
            "VALUES (?, ?, ?, ?, datetime('now'), 'udp')",
            (mmsi, name, lat, lon)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"  DB inject error for {mmsi}: {e}")


# ─── Test Alerts ─────────────────────────────────────────────

ALERTS = [
    # (MMSI, vessel_name, alert_text, description, color)
    (265501001, "STENA SCANDICA",    "FIRE EXPLOSION ON BOARD",    "🔴 CRITICAL: Fire/Explosion",     "red"),
    (265501002, "VIKING GRACE",      "MAYDAY SINKING",            "🔴 CRITICAL: Mayday Sinking",     "red"),
    (265501003, "MV GOTLANDIA",      "MAN OVERBOARD",             "🔴 CRITICAL: Man Overboard",       "red"),
    (265501004, "BALTIC CARRIER",    "DANGER WRECK AHEAD",        "🟠 HIGH: Wreck Danger",            "orange"),
    (265501005, "SILJA SERENADE",    "RESTRICTED AREA MILITARY",  "🟠 HIGH: Restricted Area",         "orange"),
    (265501006, "FINNSTAR",          "WEATHER STORM WARNING",     "🟡 WARNING: Storm",                "yellow"),
    (265501007, "AMORELLA",          "ICE WARNING HEAVY",         "🟡 WARNING: Heavy Ice",            "yellow"),
    (265501008, "MARIELLA",          "TEST DRILL EXERCISE",       "⚪ INFO: Test/Drill",              "grey"),
]


# ─── Main ────────────────────────────────────────────────────

if __name__ == "__main__":
    print("╔══════════════════════════════════════════════╗")
    print("║   NavisCore AIS Safety Alert Generator       ║")
    print("╚══════════════════════════════════════════════╝")
    print()
    
    db_path = find_db()
    if not db_path:
        print("❌ Could not find naviscore.db!")
        exit(1)
    
    print(f"📂 Database: {db_path}")
    
    # Get station origin  
    origin_lat, origin_lon = get_origin(db_path)
    
    if origin_lat is None:
        # Fallback: Stockholm area
        origin_lat, origin_lon = 59.3293, 18.0686
        print(f"⚠️  No origin configured, using fallback: {origin_lat}, {origin_lon}")
    else:
        print(f"📍 Station Origin: {origin_lat}, {origin_lon}")
    
    print(f"\n🚨 Sending {len(ALERTS)} safety alerts near station...\n")
    print("─" * 60)
    
    for mmsi, name, text, desc, color in ALERTS:
        # Generate random position near origin (within 2-15 km)
        alert_lat, alert_lon = random_point_near(origin_lat, origin_lon, max_radius_km=15)
        
        # Inject vessel with that position into DB so map can show it
        inject_vessel(db_path, mmsi, name, alert_lat, alert_lon)
        
        # Build and send the Type 14 NMEA sentence
        sentence = encode_type14(mmsi, text)
        
        dist_km = math.sqrt(
            ((alert_lat - origin_lat) * 111.32) ** 2 +
            ((alert_lon - origin_lon) * 111.32 * math.cos(math.radians(origin_lat))) ** 2
        )
        
        print(f"\n{desc}")
        print(f"  Vessel: {name} (MMSI {mmsi})")
        print(f"  Position: {alert_lat}, {alert_lon}  ({dist_km:.1f} km from station)")
        send_nmea(sentence)
        
        time.sleep(1.2)
    
    print("\n" + "─" * 60)
    print(f"\n✅ Done! {len(ALERTS)} alerts sent. Check the dashboard at http://localhost:8080")
