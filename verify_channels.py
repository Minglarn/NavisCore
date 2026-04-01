import sqlite3
import os

DB_PATH = 'data/naviscore.db'

def verify():
    if not os.path.exists(DB_PATH):
        print(f"Error: Database {DB_PATH} not found.")
        return

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Check if table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='channel_stats'")
        if not cursor.fetchone():
            print("Error: Table 'channel_stats' does not exist.")
            return
        
        # Insert dummy data to verify logic
        print("Inserting test data...")
        cursor.execute("INSERT OR REPLACE INTO channel_stats (channel_id, max_range_km, last_seen) VALUES ('TEST-A', 100.0, '2026-03-29 12:00:00')")
        conn.commit()
        
        # Query it back
        cursor.execute("SELECT * FROM channel_stats WHERE channel_id='TEST-A'")
        row = cursor.fetchone()
        print(f"Result: {row}")
        
        # Clean up
        cursor.execute("DELETE FROM channel_stats WHERE channel_id='TEST-A'")
        conn.commit()
        
        print("Verification successful!")
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    verify()
