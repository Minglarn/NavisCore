import sqlite3
import os

DB_PATH = 'd:/antigravity/NavisCore/data/naviscore.db'
if not os.path.exists(DB_PATH):
    DB_PATH = 'd:/antigravity/NavisCore/backend/naviscore.db'

if not os.path.exists(DB_PATH):
    print(f"Database not found.")
else:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(daily_stats);")
    columns = [row[1] for row in cursor.fetchall()]
    print(f"Columns in daily_stats: {columns}")
    
    if 'new_ships' not in columns:
        print("MISSING COLUMN: new_ships")
    
    conn.close()
