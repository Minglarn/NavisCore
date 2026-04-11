import asyncio
import aiosqlite
import os
import sys

# Ensure we can find the data directory
DB_PATH = os.path.join(os.getcwd(), 'data', 'naviscore.db')

async def clean_db():
    if not os.path.exists(DB_PATH):
        print(f"Error: Database not found at {DB_PATH}")
        return

    print(f"Connecting to database at {DB_PATH}...")
    async with aiosqlite.connect(DB_PATH) as db:
        # 1. Update country codes to lowercase
        print("Normalizing country_code to lowercase in 'ships' table...")
        cursor = await db.execute("UPDATE ships SET country_code = lower(country_code) WHERE country_code IS NOT NULL AND country_code != lower(country_code)")
        print(f"Updated {cursor.rowcount} ships.")
        
        # 2. Update status_text and other fields that might have stray formatting (optional but good)
        # For now we stick to the primary goal: flags.
        
        await db.commit()
        print("Cleanup complete!")

if __name__ == "__main__":
    asyncio.run(clean_db())
