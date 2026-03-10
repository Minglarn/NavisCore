import asyncio
import aiosqlite
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from main import enrich_ship_data, DB_PATH

async def run():
    print("Startar manuell nedladdning av saknade fartygsbilder...")
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute('SELECT mmsi FROM ships WHERE image_url IS NULL') as cursor:
            rows = await cursor.fetchall()
            if not rows:
                print("Inga fartyg saknar bilder i databasen just nu.")
                return
            for row in rows:
                mmsi = row[0]
                print(f"Hämtar bild för MMSI: {mmsi}")
                await enrich_ship_data(mmsi)
                # Vänta 1.5 sekund för att undvika överbelastningsskydd hos MarineTraffic
                await asyncio.sleep(1.5)
    print("Nedladdning slutförd!")

if __name__ == "__main__":
    asyncio.run(run())
