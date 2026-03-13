import sqlite3
import os

DB_PATH = 'd:/antigravity/NavisCore/data/naviscore.db'
if not os.path.exists(DB_PATH):
    DB_PATH = 'd:/antigravity/NavisCore/backend/naviscore.db'

if not os.path.exists(DB_PATH):
    print(f"Database not found at {DB_PATH}")
else:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''CREATE TABLE IF NOT EXISTS hourly_stats (
        date TEXT,
        hour INTEGER,
        message_count INTEGER DEFAULT 0,
        PRIMARY KEY (date, hour)
    )''')
    conn.commit()
    print("Table hourly_stats created successfully.")
    conn.close()
