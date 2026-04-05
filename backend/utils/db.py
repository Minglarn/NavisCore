import aiosqlite
from contextlib import asynccontextmanager
from config import DB_PATH

@asynccontextmanager
async def db_session():
    """
    Tillhandahåller en asynkron databassession.
    Konfigurerad med WAL (Write-Ahead Logging) för bättre samtidighetsstöd.
    """
    async with aiosqlite.connect(DB_PATH, timeout=60.0) as db:
        try:
            await db.execute('PRAGMA journal_mode=DELETE')

        except Exception:
            pass
        await db.execute('PRAGMA busy_timeout=60000')
        yield db

