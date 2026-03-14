import sqlite3
import os

DB_PATH = r"d:\antigravity\NavisCore\data\naviscore.db"

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"File not found: {DB_PATH}")
        return

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        new_cols = [
            ("is_emergency", "BOOLEAN DEFAULT 0"),
            ("emergency_type", "TEXT"),
            ("virtual_aton", "BOOLEAN DEFAULT 0"),
            ("is_advanced_binary", "BOOLEAN DEFAULT 0")
        ]
        
        for col_name, col_def in new_cols:
            try:
                print(f"Adding column {col_name}...")
                cursor.execute(f"ALTER TABLE ships ADD COLUMN {col_name} {col_def}")
                print(f"Successfully added {col_name}.")
            except sqlite3.OperationalError as e:
                if "duplicate column name" in str(e):
                    print(f"Column {col_name} already exists.")
                else:
                    print(f"Error adding {col_name}: {e}")
        
        conn.commit()
        conn.close()
        print("Migration finished.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    migrate()
