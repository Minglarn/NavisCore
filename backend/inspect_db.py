import asyncio
import aiosqlite
import os

DB_PATH = '/app/data/naviscore.db'

async def inspect():
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT mmsi, name, country_code FROM ships WHERE country_code IS NOT NULL LIMIT 20") as cursor:
            rows = await cursor.fetchall()
            print("MMSI | Name | Country Code")
            print("---------------------------")
            for r in rows:
                print(f"{r[0]} | {r[1]} | '{r[2]}'")

if __name__ == "__main__":
    asyncio.run(inspect())
