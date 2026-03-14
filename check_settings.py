import sqlite3
import os

db_path = "d:/antigravity/NavisCore/data/naviscore.db"
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("--- Settings ---")
    cursor.execute("SELECT * FROM settings")
    rows = cursor.fetchall()
    for row in rows:
        print(f"{row[0]}: {row[1]}")
    
    print("\n--- Recent Ships ---")
    # Check for our test MMSI 219001234 or any other recent activity
    cursor.execute("SELECT mmsi, name, last_seen, source FROM ships ORDER BY last_seen DESC LIMIT 5")
    rows = cursor.fetchall()
    for row in rows:
        print(f"MMSI: {row[0]}, Name: {row[1]}, Last Seen: {row[2]}, Source: {row[3]}")
    
    conn.close()
else:
    print("Database not found")
