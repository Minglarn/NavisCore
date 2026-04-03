"""Statistics and coverage API routes."""
import json
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter
import aiosqlite

from ais_logic import get_ship_type_name

logger = logging.getLogger("NavisCore")

router = APIRouter()


def setup_stats_routes(db_session):
    """Initialize routes with shared dependencies."""

    @router.get("/api/coverage")
    async def get_coverage():
        async with db_session() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT sector_id, range_km_24h, range_km_alltime FROM coverage_sectors ORDER BY sector_id ASC") as c:
                return [dict(r) for r in await c.fetchall()]

    @router.post("/api/coverage/reset")
    async def reset_coverage():
        async with db_session() as db:
            await db.execute("UPDATE coverage_sectors SET range_km_24h = 0.0, range_km_alltime = 0.0")
            await db.commit()
        return {"status": "success"}

    @router.get("/api/statistics")
    async def get_statistics(date: str = None):
        try:
            sel = date or datetime.utcnow().strftime('%Y-%m-%d')
            yest = (datetime.strptime(sel, '%Y-%m-%d') - timedelta(days=1)).strftime('%Y-%m-%d')
            async with db_session() as db:
                db.row_factory = aiosqlite.Row
                r = await db.execute("SELECT * FROM daily_stats WHERE date = ?", (sel,))
                row = await r.fetchone()
                t_row = dict(row) if row else {"unique_ships":0,"new_ships":0,"total_messages":0,"max_range_km":0.0, "shiptype_json": None}
                r = await db.execute("SELECT * FROM daily_stats WHERE date = ?", (yest,))
                row = await r.fetchone()
                y_row = dict(row) if row else {"unique_ships":0,"new_ships":0,"total_messages":0}
                r = await db.execute("SELECT MAX(unique_ships), MAX(total_messages), MAX(max_range_km) FROM daily_stats")
                a_row = await r.fetchone() or (0, 0, 0)
                r = await db.execute("SELECT date, unique_ships, total_messages, max_range_km FROM daily_stats ORDER BY date DESC LIMIT 365")
                h30 = [dict(row) for row in await r.fetchall()]; h30.reverse()
                h_brk = []
                r = await db.execute("SELECT hour, message_count FROM hourly_stats WHERE date = ? ORDER BY hour ASC", (sel,))
                h_raw = {row["hour"]: row["message_count"] for row in await r.fetchall()}
                for h in range(24): h_brk.append({"hour":h, "count":h_raw.get(h,0)})
                t_brk = []
                if t_row and t_row.get("shiptype_json"):
                    try: t_brk = json.loads(t_row["shiptype_json"])
                    except Exception: pass
                if not t_brk:
                    r = await db.execute("SELECT type, COUNT(*) as count FROM ships WHERE last_seen LIKE ? GROUP BY type ORDER BY count DESC", (f"{sel}%",))
                    for row in await r.fetchall():
                        if row["type"]: t_brk.append({"type":row["type"], "label":get_ship_type_name(row["type"]), "count":row["count"]})
                min_brk = []
                sixty_mins_ago = (datetime.utcnow() - timedelta(minutes=60)).strftime('%Y-%m-%d %H:%M')
                hour_ago_ts = int((datetime.utcnow() - timedelta(hours=1)).timestamp() * 1000)
                r = await db.execute("SELECT time_min, unique_ships, total_messages FROM minute_stats WHERE time_min >= ? ORDER BY time_min ASC", (sixty_mins_ago,))
                min_raw = {row["time_min"]: dict(row) for row in await r.fetchall()}
                for i in range(60, -1, -1):
                    t_str = (datetime.utcnow() - timedelta(minutes=i)).strftime('%Y-%m-%d %H:%M')
                    min_brk.append(min_raw.get(t_str, {"time_min": t_str, "unique_ships": 0, "total_messages": 0}))
                sector_max = [0] * 72
                r = await db.execute("SELECT sector_id, MAX(distance_km) as max_dist FROM sector_history WHERE timestamp >= ? GROUP BY sector_id", (hour_ago_ts,))
                for row in await r.fetchall():
                    if 0 <= row["sector_id"] < 72: sector_max[row["sector_id"]] = row["max_dist"]
                sector_24h_max = [0] * 72
                day_ago_ts = int((datetime.utcnow() - timedelta(hours=24)).timestamp() * 1000)
                r = await db.execute("SELECT sector_id, MAX(distance_km) as max_dist FROM sector_history WHERE timestamp >= ? GROUP BY sector_id", (day_ago_ts,))
                for row in await r.fetchall():
                    if 0 <= row["sector_id"] < 72: sector_24h_max[row["sector_id"]] = row["max_dist"]
                return {
                    "selected_date":sel, "today":t_row, "yesterday":y_row,
                    "all_time":{"unique_ships":a_row[0] or 0,"total_messages":a_row[1] or 0,"max_range_km":a_row[2] or 0},
                    "history_30d":h30, "hourly_breakdown":h_brk, "type_breakdown":t_brk,
                    "minute_breakdown": min_brk, "sector_max_last_hour": sector_max, "sector_max_last_24h": sector_24h_max
                }
        except Exception as e: logger.error(f"Stats err: {e}"); return {"error": "Stats error"}

    @router.get("/api/channel_stats")
    async def get_channel_stats():
        async with db_session() as db:
            db.row_factory = aiosqlite.Row
            try:
                cursor = await db.execute("SELECT channel_id, max_range_km, last_seen, mmsi, name, ship_type, msg_type FROM channel_stats ORDER BY max_range_km DESC")
                rows = await cursor.fetchall()
                return [dict(r) for r in rows]
            except Exception as e:
                logger.error(f"Error fetching channel stats: {e}")
                return []

    return router
