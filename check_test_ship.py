import sqlite3
import os

db_path = "d:/antigravity/NavisCore/data/naviscore.db"
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("--- Searching for MMSI 219001234 ---")
    cursor.execute("SELECT mmsi, name, message_count, last_seen, source FROM ships WHERE mmsi = '219001234'")
    row = cursor.fetchone()
    if row:
        print(f"MMSI: {row[0]}, Name: {row[1]}, Count: {row[2]}, Last Seen: {row[3]}, Source: {row[4]}")
    else:
        print("MMSI not found")
        
    print("\n--- Recent activity (last 10) ---")
    cursor.execute("SELECT mmsi, name, last_seen, source, message_count FROM ships ORDER BY last_seen DESC LIMIT 10")
    rows = cursor.fetchall()
    for row in rows:
        print(f"MMSI: {row[0]}, Name: {row[1]}, Last Seen: {row[2]}, Source: {row[3]}, Count: {row[4]}")
        
    conn.close()
else:
    print("Database not found")
