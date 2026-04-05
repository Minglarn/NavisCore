import asyncio
import logging
import time
from datetime import datetime

from utils.settings import get_all_settings, is_true
from utils.db import db_session
from utils.stats import stats_collector
from utils.geo import haversine_distance, calculate_bearing
from utils.mmsi import get_country_code_from_mmsi
from utils.images import enrichment_queue, queued_mmsis
from core.mqtt import notify_new_vessel, mqtt_pub_queue
from ais_logic import get_ship_type_name, get_ship_category

logger = logging.getLogger("NavisCore")

_broadcast_callback = None
local_vessels = {}
MAX_STATS_RANGE_KM = 1000.0

def init_ais_processor(broadcast_cb):
    global _broadcast_callback
    _broadcast_callback = broadcast_cb

async def broadcast_ais(data: dict):
    if _broadcast_callback:
        await _broadcast_callback(data)

def translate_aisstream_message(msg: dict) -> dict:
    try:
        msg_type_str = msg.get("MessageType")
        meta = msg.get("MetaData", {})
        body = msg.get("Message", {}).get(msg_type_str, {})
        mmsi = meta.get("MMSI")
        if not mmsi: return None
        
        type_map = {
            "PositionReport": 1,
            "StandardClassBPositionReport": 18,
            "ExtendedClassBPositionReport": 19,
            "ShipStaticData": 5,
            "AidsToNavigationReport": 21,
            "StandardSearchAndRescueAircraftReport": 9,
            "SafetyBroadcastMessage": 14,
            "MultiSlotBinaryMessage": 25
        }
        
        internal_data = {
            "mmsi": mmsi,
            "type": type_map.get(msg_type_str, 0),
            "name": meta.get("ShipName", "").strip(),
            "lat": body.get("Latitude"),
            "lon": body.get("Longitude"),
            "speed": body.get("Sog") or body.get("SpeedOverGround"),
            "course": body.get("Cog") or body.get("CourseOverGround"),
            "heading": body.get("TrueHeading"),
            "source": "aisstream"
        }
        
        if not internal_data["speed"] and "Sog" in body:
             internal_data["speed"] = body["Sog"]
             
        if msg_type_str == "AidsToNavigationReport":
            internal_data["is_aton"] = True
        elif msg_type_str == "StandardSearchAndRescueAircraftReport":
            internal_data["is_sar"] = True
            internal_data["altitude"] = body.get("Altitude")
        elif msg_type_str == "SafetyBroadcastMessage":
            internal_data["is_safety"] = True
            internal_data["safety_text"] = body.get("Text", "")
            internal_data["is_broadcast_alert"] = True
            
        return internal_data
    except Exception as e:
        logger.error(f"Error translating AisStream message ({msg.get('MessageType')}): {e}")
        return None

async def process_ais_data(data: dict):
    mmsi_val = data.get("mmsi")
    if not mmsi_val: return
    mmsi_str = str(mmsi_val)
    logger.debug(f"[AIS] Processing message type {data.get('type')} for MMSI {mmsi_str} from {data.get('source', 'unknown')}")


    lat, lon = data.get("lat"), data.get("lon")

    msg_type = data.get("type", 0)
    ship_name = data.get("shipname") or data.get("name")
    source = data.get("source", "local")

    if source == "aisstream":
        if mmsi_str in local_vessels and time.time() - local_vessels[mmsi_str] < 600:
            return
    else: local_vessels[mmsi_str] = time.time()

    if data.get("is_safety"):
        safety_msg = {
            "type": "safety_alert", 
            "mmsi": mmsi_str, 
            "text": data.get("safety_text", ""), 
            "dest_mmsi": str(data.get("dest_mmsi", "")) if data.get("dest_mmsi") else None, 
            "is_broadcast": data.get("is_broadcast_alert", False), 
            "msg_type": data.get("type", 0), 
            "alarm_level": data.get("alarm_level", 0),
            "timestamp": int(datetime.now().timestamp() * 1000)
        }
        try:
            async with db_session() as db:
                async with db.execute('SELECT name, type, latitude, longitude FROM ships WHERE mmsi = ?', (mmsi_str,)) as cursor:
                    row = await cursor.fetchone()
                    if row:
                        safety_msg["name"] = row[0]
                        if row[1] is not None:
                            safety_msg["ship_category"] = get_ship_category(row[1])
                        if row[2] is not None and row[3] is not None:
                            safety_msg["lat"] = row[2]
                            safety_msg["lon"] = row[3]

                await db.execute('INSERT INTO safety_alerts (mmsi, dest_mmsi, text, is_broadcast, msg_type) VALUES (?, ?, ?, ?, ?)',
                    (mmsi_str, safety_msg.get("dest_mmsi"), safety_msg["text"], 1 if safety_msg["is_broadcast"] else 0, safety_msg.get("msg_type", 0)))
                await db.commit()
                
                async with db.execute('SELECT last_insert_rowid()') as cursor:
                    row = await cursor.fetchone()
                    if row: safety_msg["id"] = row[0]
        except Exception as e:
            logger.error(f"Error saving safety alert: {e}")
            
        await broadcast_ais(safety_msg)

    if data.get("is_ack"):
        ack_info = {
            "type": "safety_ack",
            "mmsi": mmsi_str,
            "ack_mmsi": str(data.get("ack_mmsi")),
            "seq_num": data.get("ack_seq_num"),
            "timestamp": int(datetime.now().timestamp() * 1000)
        }
        logger.info(f"Broadcasting ACK: {ack_info}")
        await broadcast_ais(ack_info)
        return

    try:
        async with db_session() as db:
            settings = await get_all_settings(db)
            
            async with db.execute('SELECT last_seen, latitude, longitude, is_meteo, is_aton, is_sar, virtual_aton, mqtt_new_sent, ais_channel, type FROM ships WHERE mmsi = ?', (mmsi_str,)) as cursor:
                row = await cursor.fetchone()
            
            is_new_v = row is None
            reset_count = False
            last_known_lat, last_known_lon = None, None
            db_is_meteo, db_is_aton, db_is_sar, db_virtual_aton = False, False, False, False
            db_type = None
            
            if row:
                last_known_lat, last_known_lon = row[1], row[2]
                db_is_meteo, db_is_aton, db_is_sar, db_virtual_aton = bool(row[3]), bool(row[4]), bool(row[5]), bool(row[6])
                db_mqtt_new_sent = bool(row[7])
                db_ais_channel = row[8]
                db_type = row[9]
                try:
                    last_seen_dt = datetime.strptime(row[0], "%Y-%m-%d %H:%M:%S")
                    nv_timeout_h = int(settings.get("new_vessel_timeout_h", 24))
                    if (datetime.utcnow() - last_seen_dt).total_seconds() > (nv_timeout_h * 3600):
                        reset_count = True
                        logger.info(f"Vessel {mmsi_str} re-acquired after {nv_timeout_h}h silence. Resetting count.")
                except Exception: pass

            is_meteo = data.get("is_meteo", False) or msg_type == 4
            is_aton = data.get("is_aton", False) or db_is_aton
            is_base_station = data.get("is_base_station", False)
            
            if msg_type in [5, 24] and mmsi_str not in queued_mmsis:
                if not (is_meteo or is_aton or is_base_station):
                    queued_mmsis.add(mmsi_str)
                    enrichment_queue.put_nowait(mmsi_str)
            
            is_sar_mmsi = mmsi_str.startswith("111")
            is_currently_sar = data.get("is_sar", False) or msg_type == 9
            
            final_is_sar = is_currently_sar
            if not is_currently_sar and db_is_sar:
                if not is_sar_mmsi:
                    final_is_sar = False
                else:
                    final_is_sar = True
            
            current_shiptype = data.get("ship_type") or data.get("shiptype")
            if not current_shiptype:
                if msg_type == 9:
                    current_shiptype = 9
                elif db_type == 9 and not final_is_sar and not is_sar_mmsi:
                    current_shiptype = 0
            
            ship_data = {
                "mmsi": mmsi_str, "lat": lat, "lon": lon, "sog": data.get("speed") or data.get("sog"), "cog": data.get("course") or data.get("cog"),
                "heading": data.get("heading"), "name": ship_name, "callsign": data.get("callsign"), "shiptype": current_shiptype,
                "status_text": data.get("status_text") or data.get("status"), "country_code": data.get("country_code") or get_country_code_from_mmsi(mmsi_str),
                "timestamp": int(datetime.now().timestamp() * 1000), "is_meteo": is_meteo, "is_aton": is_aton,
                "is_sar": final_is_sar, "altitude": data.get("altitude"), "aton_type": data.get("aton_type"), "aton_type_text": data.get("aton_type_text"),
                "destination": data.get("destination"), "draught": data.get("draught"), "is_emergency": data.get("is_emergency", False),
                "emergency_type": data.get("emergency_type"), "emergency_label": data.get("emergency_label"),
                "sart_mode": data.get("sart_mode"),
                "virtual_aton": data.get("virtual_aton", False) or db_virtual_aton, "is_advanced_binary": data.get("is_advanced_binary", False),
                "dac": data.get("dac"), "fid": data.get("fid"), "raw_payload": data.get("raw_payload"),
                "source": source, "nmea": data.get("nmea"), "ship_type_text": data.get("ship_type_text"), "ship_category": data.get("ship_category"),
                "wind_speed": data.get("wind_speed"), "wind_gust": data.get("wind_gust"), "wind_direction": data.get("wind_direction"),
                "water_level": data.get("water_level"), "air_temp": data.get("air_temp"), "air_pressure": data.get("air_pressure"),
                "is_base_station": is_base_station, "is_vessel": data.get("is_vessel", True),
                "msg_type": msg_type
            }

            new_channel = data.get("ais_channel")
            if new_channel:
                if row and not reset_count:
                    existing = db_ais_channel.split("+") if db_ais_channel else []
                    channels = set(existing)
                    channels.add(new_channel)
                    ship_data["ais_channel"] = "+".join(sorted(list(channels)))
                else:
                    ship_data["ais_channel"] = new_channel
            elif row and not reset_count:
                ship_data["ais_channel"] = db_ais_channel

            if ship_data.get("is_advanced_binary") and not ship_data.get("status_text"):
                dac, fid = ship_data.get("dac"), ship_data.get("fid")
                ship_data["status_text"] = f"Advanced Binary (DAC:{dac}, FI:{fid})" if dac is not None and fid is not None else "Advanced Binary Message"

            if ship_data.get("sog") is not None:
                sog = ship_data["sog"]
                nav_status = data.get("nav_status")
                if sog < 0.1 and nav_status in [0, 8]:
                    ship_data["status_text"] = "Moored (Stationary)"
                elif sog > 1.0 and nav_status in [1, 5]:
                    ship_data["status_text"] = "Under way (SOG > 1kn)"

            if ship_data.get("lat") is None and last_known_lat is not None:
                ship_data["lat"], ship_data["lon"] = last_known_lat, last_known_lon

            if is_new_v:
                logger.info(f"New Vessel {mmsi_str} ({ship_name or 'Unknown'}) detected! Source: {source}")
            
            await db.execute('INSERT OR IGNORE INTO ships (mmsi, name, callsign, last_seen, message_count, registration_count, session_start) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 0, 1, CURRENT_TIMESTAMP)', (mmsi_str, ship_name, data.get("callsign")))
            
            flds = ["last_seen = CURRENT_TIMESTAMP"]
            if reset_count: 
                flds.append("previous_seen = last_seen, message_count = 1, registration_count = registration_count + 1, session_start = CURRENT_TIMESTAMP, mqtt_new_sent = 0")
                db_mqtt_new_sent = False
            else: flds.append("message_count = message_count + 1")
            
            vals = []
            db_fields = [("name", "name"), ("callsign", "callsign"), ("type", "shiptype"), ("status_text", "status_text"), ("country_code", "country_code"), ("latitude", "lat"), ("longitude", "lon"), ("sog", "sog"), ("cog", "cog"), ("heading", "heading"), ("source", "source"), ("emergency_type", "emergency_type"), ("altitude", "altitude"), ("wind_speed", "wind_speed"), ("wind_gust", "wind_gust"), ("wind_direction", "wind_direction"), ("water_level", "water_level"), ("air_temp", "air_temp"), ("air_pressure", "air_pressure"), ("destination", "destination"), ("draught", "draught"), ("eta", "eta"), ("imo", "imo"), ("ais_channel", "ais_channel")]
            for f, k in db_fields:
                v = ship_data.get(k)
                if v is not None: flds.append(f"{f} = ?"); vals.append(v)
            
            for f, k in [("is_meteo", "is_meteo"), ("is_emergency", "is_emergency"), ("virtual_aton", "virtual_aton"), ("is_advanced_binary", "is_advanced_binary"), ("dac", "dac"), ("fid", "fid"), ("raw_payload", "raw_payload"), ("is_base_station", "is_base_station"), ("is_vessel", "is_vessel")]:
                v = ship_data.get(k)
                if v is not None: flds.append(f"{f} = ?"); vals.append(1 if v is True else (0 if v is False else v))
            
            to_b, to_s, to_p, to_st = data.get("to_bow"), data.get("to_stern"), data.get("to_port"), data.get("to_starboard")
            if to_b is not None and to_s is not None: flds.append("length = ?"); vals.append(to_b + to_s)
            if to_p is not None and to_st is not None: flds.append("width = ?"); vals.append(to_p + to_st)

            vals.append(mmsi_str)
            await db.execute(f'UPDATE ships SET {", ".join(flds)} WHERE mmsi = ?', tuple(vals))
            
            if lat is not None and lon is not None:
                async with db.execute('SELECT latitude, longitude FROM ship_history WHERE mmsi = ? ORDER BY timestamp DESC LIMIT 1', (mmsi_str,)) as cursor:
                    hr = await cursor.fetchone()
                    if not hr or haversine_distance(hr[0], hr[1], lat, lon) > 0.05:
                        await db.execute('INSERT INTO ship_history (mmsi, latitude, longitude, timestamp) VALUES (?, ?, ?, ?)', (mmsi_str, lat, lon, int(datetime.now().timestamp() * 1000)))
            
            now_local = datetime.now()
            today, time_min = now_local.strftime('%Y-%m-%d'), now_local.strftime('%Y-%m-%d %H:%M')
            await db.execute('INSERT INTO daily_stats (date, total_messages) VALUES (?, 1) ON CONFLICT(date) DO UPDATE SET total_messages = total_messages + 1', (today,))
            await db.execute('INSERT INTO hourly_stats (date, hour, message_count) VALUES (?, ?, 1) ON CONFLICT(date, hour) DO UPDATE SET message_count = message_count + 1', (today, now_local.hour))
            await db.execute('INSERT INTO minute_stats (time_min, total_messages) VALUES (?, 1) ON CONFLICT(time_min) DO UPDATE SET total_messages = total_messages + 1', (time_min,))
            try:
                await db.execute('INSERT INTO daily_mmsi (date, mmsi) VALUES (?, ?)', (today, mmsi_str))
                sf = ["unique_ships = unique_ships + 1"]
                if is_new_v: sf.append("new_ships = new_ships + 1")
                await db.execute(f'UPDATE daily_stats SET {", ".join(sf)} WHERE date = ?', (today,))
            except Exception: pass

            stats_collector.update(mmsi_str, is_new_v, ship_data.get("shiptype"))
            
            try:
                await db.execute('INSERT INTO minute_mmsi (time_min, mmsi) VALUES (?, ?)', (time_min, mmsi_str))
                await db.execute('UPDATE minute_stats SET unique_ships = unique_ships + 1 WHERE time_min = ?', (time_min,))
            except Exception: pass
            
            async with db.execute('SELECT image_url, name, type, status_text, country_code, length, width, destination, draught, message_count, eta, rot, imo, callsign, previous_seen, manual_image, latitude, longitude, is_meteo, is_emergency, emergency_type, virtual_aton, is_advanced_binary, dac, fid, raw_payload, wind_speed, wind_gust, wind_direction, water_level, air_temp, air_pressure, altitude, registration_count, session_start, mqtt_new_sent, is_base_station, is_vessel, mqtt_ignore, mqtt_send_new FROM ships WHERE mmsi = ?', (mmsi_str,)) as cursor:
                r = await cursor.fetchone()
                if r:
                    ship_data["imageUrl"] = r[0] or "/images/0.jpg"
                    if not ship_name and r[1]: ship_data["name"] = r[1]
                    if ship_data["shiptype"] is None: ship_data["shiptype"] = r[2]
                    if not ship_data["status_text"]: ship_data["status_text"] = r[3]
                    if not ship_data["country_code"]: ship_data["country_code"] = r[4]
                    ship_data["length"], ship_data["width"] = r[5], r[6]
                    if not ship_data["destination"]: ship_data["destination"] = r[7]
                    if not ship_data["draught"]: ship_data["draught"] = r[8]
                    ship_data["message_count"], ship_data["eta"], ship_data["rot"], ship_data["imo"], ship_data["callsign"] = r[9], r[10], r[11], r[12], r[13]
                    ship_data["registration_count"] = r[33]
                    if r[34]:
                        try: 
                            dt = datetime.strptime(r[34], "%Y-%m-%d %H:%M:%S")
                            from datetime import timezone
                            dt = dt.replace(tzinfo=timezone.utc)
                            ship_data["session_start"] = int(dt.timestamp() * 1000)
                        except Exception: pass
                    if r[14]:
                        try: ship_data["previous_seen"] = datetime.strptime(r[14], "%Y-%m-%d %H:%M:%S").timestamp() * 1000
                        except Exception: pass
                    ship_data["manual_image"] = bool(r[15])
                    if ship_data.get("lat") is None: ship_data["lat"] = r[16]
                    if ship_data.get("lon") is None: ship_data["lon"] = r[17]
                    ship_data["is_meteo"] = bool(r[18])
                    ship_data["is_emergency"] = bool(r[19])
                    ship_data["emergency_type"] = r[20]
                    ship_data["virtual_aton"] = bool(r[21])
                    ship_data["is_advanced_binary"] = bool(r[22])
                    ship_data["dac"], ship_data["fid"], ship_data["raw_payload"] = r[23], r[24], r[25]
                    ship_data["wind_speed"], ship_data["wind_gust"], ship_data["wind_direction"] = r[26], r[27], r[28]
                    ship_data["water_level"], ship_data["air_temp"], ship_data["air_pressure"] = r[29], r[30], r[31]
                    ship_data["altitude"] = r[32]
                    ship_data["mqtt_new_sent"] = bool(r[35])
                    ship_data["is_base_station"] = bool(r[36])
                    ship_data["is_vessel"] = bool(r[37])
                    ship_data["mqtt_ignore"] = bool(r[38])
                    ship_data["mqtt_send_new"] = bool(r[39]) if r[39] is not None else True
            
            if not ship_data.get("ship_type_text") and ship_data.get("shiptype") is not None:
                try:
                    c = int(ship_data["shiptype"])
                    ship_data["ship_type_text"], ship_data["ship_category"] = get_ship_type_name(c), get_ship_category(c)
                except Exception: pass
            
            if lat is not None and lon is not None:
                origin_lat, origin_lon = settings.get("origin_lat"), settings.get("origin_lon")
                if (source != "aisstream" or is_true(settings.get("include_aisstream_in_range"))) and \
                   origin_lat and origin_lon and not is_meteo and not ship_data.get("is_aton") and \
                   not ship_data.get("is_sar") and not mmsi_str.startswith("99"):
                    try:
                        dist = haversine_distance(float(origin_lat), float(origin_lon), lat, lon)
                        if ship_data.get("message_count", 0) >= 1 and 1.0 <= dist <= MAX_STATS_RANGE_KM:
                            stats_collector.update_range(dist)
                            bearing = calculate_bearing(float(origin_lat), float(origin_lon), lat, lon)
                            sector = int(bearing // 5) % 72
                            async with db.execute('SELECT range_km_24h, range_km_alltime FROM coverage_sectors WHERE sector_id = ?', (sector,)) as cursor:
                                row = await cursor.fetchone()
                                rng_24h, rng_all = (row[0] if row else 0.0), (row[1] if row else 0.0)
                                updated = False
                                if dist > rng_24h: rng_24h = dist; updated = True
                                if dist > rng_all: rng_all = dist; updated = True
                                if updated or not row:
                                    await db.execute('INSERT INTO coverage_sectors (sector_id, range_km_24h, range_km_alltime, last_updated) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(sector_id) DO UPDATE SET range_km_24h = ?, range_km_alltime = ?, last_updated = CURRENT_TIMESTAMP', (sector, rng_24h, rng_all, rng_24h, rng_all))
                                    await db.execute('UPDATE daily_stats SET max_range_km = ? WHERE date = ? AND ? > max_range_km', (dist, today, dist))
                                    await db.execute('INSERT INTO sector_history (sector_id, distance_km, timestamp) VALUES (?, ?, ?)', (sector, dist, int(datetime.utcnow().timestamp() * 1000)))
                                    await broadcast_ais({"type": "coverage_update", "sector_id": sector, "range_km_24h": rng_24h, "range_km_alltime": rng_all})
                    except Exception as e: logger.error(f"Range err: {e}")

            await db.commit()
            
            dist_nm, dist_km = 0, 0
            origin_lat, origin_lon = settings.get("origin_lat"), settings.get("origin_lon")
            if origin_lat and origin_lon and lat is not None and lon is not None:
                try:
                    dist_km = haversine_distance(float(origin_lat), float(origin_lon), lat, lon)
                    dist_nm = dist_km * 0.539957
                    ship_data["dist_to_station_nm"] = round(dist_nm, 2)
                    ship_data["dist_to_station_km"] = round(dist_km, 2)
                except: pass

            ais_channel = ship_data.get("ais_channel")
            is_real_vessel = ship_data.get("is_vessel") and not (is_aton or is_meteo or is_base_station or is_sar_mmsi)

            if ais_channel and 0 < dist_km <= MAX_STATS_RANGE_KM and is_real_vessel:
                try:
                    await db.execute('''
                        INSERT INTO channel_stats (channel_id, max_range_km, last_seen, mmsi, name, ship_type, msg_type) 
                        VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?)
                        ON CONFLICT(channel_id) DO UPDATE SET 
                            last_seen = CASE WHEN ? > max_range_km THEN CURRENT_TIMESTAMP ELSE last_seen END,
                            mmsi = CASE WHEN ? > max_range_km THEN ? ELSE mmsi END,
                            name = CASE WHEN ? > max_range_km THEN ? ELSE name END,
                            ship_type = CASE WHEN ? > max_range_km THEN ? ELSE ship_type END,
                            msg_type = CASE WHEN ? > max_range_km THEN ? ELSE msg_type END,
                            max_range_km = MAX(max_range_km, ?)
                    ''', (ais_channel, dist_km, mmsi_str, ship_data.get("name"), ship_data.get("shiptype"), msg_type,
                          dist_km, dist_km, mmsi_str, dist_km, ship_data.get("name"), dist_km, ship_data.get("shiptype"), dist_km, msg_type, dist_km))
                except Exception as e:
                    logger.error(f"Error updating channel stats: {e}")

            await db.commit()

            if dist_nm > 200 and ship_data.get("message_count", 0) < 2:
                return

            if is_true(settings.get("mqtt_pub_enabled")):
                try:
                    forward_sdr = is_true(settings.get("mqtt_pub_forward_sdr", "true"))
                    forward_stream = is_true(settings.get("mqtt_pub_forward_aisstream", "false"))
                    
                    should_forward = False
                    if (source == "local" or source == "sdr") and forward_sdr:
                        should_forward = True
                    elif source == "udp" and is_true(settings.get("mqtt_pub_forward_udp", "true")):
                        should_forward = True
                    elif source == "aisstream" and forward_stream:
                        should_forward = True
                        
                    if ship_data.get("mqtt_ignore"):
                        should_forward = False

                    if should_forward:
                        pub_payload = {
                            "mmsi": mmsi_str,
                            "name": ship_data.get("name"),
                            "lat": round(ship_data.get("lat"), 5) if ship_data.get("lat") is not None else None,
                            "lon": round(ship_data.get("lon"), 5) if ship_data.get("lon") is not None else None,
                            "msg_type": msg_type,
                            "imo": ship_data.get("imo"),
                            "callsign": ship_data.get("callsign"),
                            "country_code": ship_data.get("country_code"),
                            "ais_channel": ship_data.get("ais_channel"),
                            "sog": ship_data.get("sog"),
                            "cog": ship_data.get("cog"),
                            "heading": ship_data.get("heading"),
                            "rot": ship_data.get("rot"),
                            "shiptype": ship_data.get("shiptype"),
                            "ship_type_label": ship_data.get("ship_type_text"),
                            "icon_category": ship_data.get("ship_category"),
                            "is_nav_aid": bool(ship_data.get("is_aton")),
                            "length": ship_data.get("length"),
                            "width": ship_data.get("width"),
                            "draught": ship_data.get("draught"),
                            "status_text": ship_data.get("status_text"),
                            "nav_status": ship_data.get("nav_status"),
                            "destination": ship_data.get("destination"),
                            "eta": ship_data.get("eta"),
                            "wind_speed": ship_data.get("wind_speed"),
                            "wind_gust": ship_data.get("wind_gust"),
                            "wind_direction": ship_data.get("wind_direction"),
                            "water_level": ship_data.get("water_level"),
                            "air_temp": ship_data.get("air_temp"),
                            "air_pressure": ship_data.get("air_pressure"),
                            "last_seen": ship_data.get("timestamp"),
                            "previous_seen": ship_data.get("previous_seen"),
                            "registration_count": ship_data.get("registration_count"),
                            "source": source,
                            "timestamp": ship_data.get("timestamp"),
                            "image_url": ship_data.get("imageUrl", "").split("/")[-1] if ship_data.get("imageUrl") else None,
                            "dist_to_station_nm": round(dist_nm, 2) if dist_nm > 0 else None,
                            "dist_to_station_km": round(dist_km, 2) if dist_km > 0 else None
                        }

                        initial_event_type = "new" if is_new_v or reset_count else "update"
                        wait_for_name = is_true(settings.get("mqtt_pub_wait_for_name", "false"))
                        only_new = is_true(settings.get("mqtt_pub_only_new"))
                        
                        event_type = initial_event_type
                        should_trigger_new = False
                        
                        if wait_for_name and initial_event_type == "new" and not ship_data.get("name"):
                            should_trigger_new = False
                            event_type = "update"
                        elif wait_for_name and initial_event_type == "update" and ship_data.get("name") and not ship_data.get("mqtt_new_sent"):
                            should_trigger_new = True
                            event_type = "new"
                        else:
                            should_trigger_new = (initial_event_type == "new")
                        
                        if should_trigger_new and ship_data.get("mqtt_send_new") == False:
                            should_trigger_new = False
                            if not only_new:
                                event_type = "update"
                                pub_payload["event_type"] = "update"
                            else:
                                return

                        if not only_new or should_trigger_new:
                            pub_payload["event_type"] = event_type
                            
                            if dist_nm > 200: pub_payload["propagation"] = "tropo_ducting"
                            elif 40 < dist_nm < 80: pub_payload["propagation"] = "enhanced_range"
                            else: pub_payload["propagation"] = "normal"
                            
                            from core.mqtt import mqtt_last_sent
                            should_send_mqtt = True
                            if event_type != "new":
                                now_ts = time.time()
                                fingerprint = f"{round(pub_payload.get('lat') or 0, 4)}|{round(pub_payload.get('lon') or 0, 4)}|{pub_payload.get('sog')}|{pub_payload.get('cog')}|{pub_payload.get('nav_status')}"
                                
                                if mmsi_str in mqtt_last_sent:
                                    last = mqtt_last_sent[mmsi_str]
                                    is_identical = last["fingerprint"] == fingerprint
                                    time_since = now_ts - last["timestamp"]
                                    if is_identical and time_since < 30:
                                        should_send_mqtt = False
                                            
                                if should_send_mqtt:
                                    mqtt_last_sent[mmsi_str] = {"timestamp": now_ts, "fingerprint": fingerprint}

                            if event_type == "new":
                                logger.info(f"[AIS] Triggering NEW vessel notification for {mmsi_str}")
                                asyncio.create_task(notify_new_vessel(mmsi_str, pub_payload, settings))
                            elif should_send_mqtt:
                                mqtt_pub_queue.put_nowait(pub_payload)


                except Exception as e:
                    logger.error(f"Error queuing MQTT pub message: {e}")

            await broadcast_ais(ship_data)
    except Exception as e:
        logger.error(f"Error for MMSI {mmsi_str}: {e}")
