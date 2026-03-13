import sqlite3
import os

DB_PATH = 'd:/antigravity/NavisCore/data/naviscore.db' # Correct path based on volume mapping
if not os.path.exists(DB_PATH):
    # Try alternate path if not found
    DB_PATH = 'd:/antigravity/NavisCore/backend/naviscore.db'

if not os.path.exists(DB_PATH):
    print(f"Database not found.")
else:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    print(f"Tables: {tables}")
    
    if ('hourly_stats',) not in tables:
        print("MISSING TABLE: hourly_stats")
    
    conn.close()
