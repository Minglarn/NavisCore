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
    print(f"Current columns: {columns}")
    
    if 'total_messagees' in columns:
        print("FIXING TYPO: total_messagees -> total_messages")
        # In SQLite 3.25+, we can use RENAME COLUMN
        try:
            cursor.execute("ALTER TABLE daily_stats RENAME COLUMN total_messagees TO total_messages;")
            conn.commit()
            print("Successfully renamed column.")
        except Exception as e:
            print(f"Failed to rename via ALTER: {e}")
            # Fallback for older sqlite: create new table, copy data, drop old
    else:
        print("Typical column found or already fixed.")
    
    conn.close()
