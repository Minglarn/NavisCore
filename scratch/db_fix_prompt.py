import sqlite3
import os

db_path = 'd:/antigravity/NavisCore/data/naviscore.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    # Perform the replacement
    c.execute("UPDATE settings SET value = REPLACE(REPLACE(value, \"'country_adjective'\", '{country_adjective}'), \"'country_code'\", '{country_code}') WHERE key = 'ollama_prompt'")
    conn.commit()
    rows = c.rowcount
    conn.close()
    print(f"Update successful. Rows affected: {rows}")
else:
    print(f"Error: DB not found at {db_path}")
