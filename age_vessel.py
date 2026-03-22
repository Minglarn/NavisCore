import sqlite3
import os
from datetime import datetime, timedelta
import argparse

def main():
    parser = argparse.ArgumentParser(description="Age a vessel in the NavisCore database to test re-acquisition.")
    parser.add_argument("mmsi", type=str, help="MMSI of the vessel to age")
    parser.add_argument("--hours", type=int, default=25, help="How many hours ago was it last seen (default 25)")
    parser.add_argument("--db", type=str, default="data/naviscore.db", help="Path to database file")

    args = parser.parse_args()

    if not os.path.exists(args.db):
        print(f"Error: Database not found at {args.db}")
        return

    # Calculate the old timestamp
    old_time = datetime.utcnow() - timedelta(hours=args.hours)
    old_time_str = old_time.strftime("%Y-%m-%d %H:%M:%S")

    try:
        conn = sqlite3.connect(args.db)
        cursor = conn.cursor()

        # Check if vessel exists
        cursor.execute("SELECT mmsi FROM ships WHERE mmsi = ?", (args.mmsi,))
        if not cursor.fetchone():
            print(f"Vessel {args.mmsi} not found in database. Creating a dummy entry...")
            cursor.execute("INSERT INTO ships (mmsi, name, last_seen, message_count) VALUES (?, ?, ?, ?)", 
                         (args.mmsi, "TEST_VESSEL", old_time_str, 5))
        else:
            print(f"Aging vessel {args.mmsi} to {old_time_str}...")
            cursor.execute("UPDATE ships SET last_seen = ? WHERE mmsi = ?", (old_time_str, args.mmsi))

        conn.commit()
        conn.close()
        print("Done. Now run send_test_ais.py with the same MMSI.")
    except Exception as e:
        print(f"Error updating database: {e}")

if __name__ == "__main__":
    main()
