"""
ais_logic.py — Full AIS Bitstream Decoder for NavisCore
Supports all 27 AIS message types per ITU-R M.1371-5.
Handles multi-fragment reassembly, 6-bit ASCII decoding,
and provides dictionary mappings for ship types and nav statuses.
"""
import time
import logging

logger = logging.getLogger("NavisCore")

# ═══════════════════════════════════════════════════════
# LOOKUP TABLES
# ═══════════════════════════════════════════════════════

NAV_STATUS_MAP = {
    0: "Under way using engine",
    1: "At anchor",
    2: "Not under command",
    3: "Restricted manoeuvrability",
    4: "Constrained by draught",
    5: "Moored",
    6: "Aground",
    7: "Engaged in fishing",
    8: "Under way sailing",
    9: "Reserved (HSC)",
    10: "Reserved (WIG)",
    11: "Power-driven vessel towing astern",
    12: "Power-driven pushing ahead/towing alongside",
    13: "Reserved",
    14: "AIS-SART (active)",
    15: "Not defined",
}

SHIP_TYPE_MAP = {
    0: "Not Available",
    # 1-19 Reserved
    20: "Wing in Ground (WIG)",
    30: "Fishing Vessel",
    31: "Towing Vessel",
    32: "Towing (length >200m or breadth >25m)",
    33: "Dredging or underwater ops",
    34: "Diving ops",
    35: "Military Ops",
    36: "Sailing Vessel",
    37: "Pleasure Craft",
    38: "Reserved",
    39: "Reserved",
    40: "High Speed Craft (HSC)",
    50: "Pilot Vessel",
    51: "Search and Rescue Vessel",
    52: "Tug",
    53: "Port Tender",
    54: "Anti-pollution equipment",
    55: "Law Enforcement",
    56: "Spare - Local Vessel",
    57: "Spare - Local Vessel",
    58: "Medical Transport",
    59: "Ship according to RR Resolution No. 18",
    60: "Passenger",
    70: "Cargo",
    80: "Tanker",
    90: "Other Type",
}

def get_ship_type_info(code: int) -> dict:
    """
    Returns a dictionary with 'description' and 'icon_category' 
    based on the international AIS ship type standard.
    """
    # Base description
    desc = SHIP_TYPE_MAP.get(code)
    
    # Handle hazardous categories (last digit 1-4) for specific ranges
    hazard_map = {
        1: "Hazardous category A",
        2: "Hazardous category B",
        3: "Hazardous category C",
        4: "Hazardous category D"
    }
    
    last_digit = code % 10
    parent_cat = (code // 10) * 10
    
    if desc is None:
        if parent_cat in [20, 40, 60, 70, 80, 90] and 1 <= last_digit <= 4:
            base_name = SHIP_TYPE_MAP.get(parent_cat, "Unknown")
            desc = f"{base_name}, {hazard_map[last_digit]}"
        elif parent_cat in [20, 40, 60, 70, 80, 90] and 5 <= last_digit <= 8:
            base_name = SHIP_TYPE_MAP.get(parent_cat, "Unknown")
            desc = f"{base_name}, Reserved"
        elif last_digit == 9:
             desc = SHIP_TYPE_MAP.get(parent_cat, "Unknown")
        elif 1 <= code <= 19:
            desc = "Reserved"
        else:
            desc = "Unknown"

    # Simplified icon categories for frontend
    icon_cat = "other"
    if code == 30:
        icon_cat = "fishing"
    elif code in [31, 32, 52]:
        icon_cat = "tug"
    elif code == 35:
        icon_cat = "military"
    elif code == 36:
        icon_cat = "sailing"
    elif code == 37:
        icon_cat = "pleasure"
    elif 40 <= code <= 49:
        icon_cat = "high_speed"
    elif code == 50:
        icon_cat = "pilot"
    elif code == 51:
        icon_cat = "sar"
    elif 60 <= code <= 69:
        icon_cat = "passenger"
    elif 70 <= code <= 79:
        icon_cat = "cargo"
    elif 80 <= code <= 89:
        icon_cat = "tanker"
    
    return {
        "description": desc,
        "icon_category": icon_cat
    }

# Backward compatibility wrappers
def get_ship_type_name(code: int) -> str:
    return get_ship_type_info(code)["description"]

def get_ship_category(code: int) -> str:
    return get_ship_type_info(code)["icon_category"]

ATON_TYPE_MAP = {
    0: "Default/Unspecified",
    1: "Reference point",
    2: "RACON",
    3: "Fixed structure",
    4: "Spare",
    5: "Light, without sectors",
    6: "Light, with sectors",
    7: "Leading Light Front",
    8: "Leading Light Rear",
    9: "Beacon, Cardinal N",
    10: "Beacon, Cardinal E",
    11: "Beacon, Cardinal S",
    12: "Beacon, Cardinal W",
    13: "Beacon, Port hand",
    14: "Beacon, Starboard hand",
    15: "Beacon, Preferred Channel port hand",
    16: "Beacon, Preferred Channel starboard hand",
    17: "Beacon, Isolated danger",
    18: "Beacon, Safe water",
    19: "Beacon, Special mark",
    20: "Beacon, Light vessel / LANBY / FABs",
    21: "Buoy, Cardinal N",
    22: "Buoy, Cardinal E",
    23: "Buoy, Cardinal S",
    24: "Buoy, Cardinal W",
    25: "Buoy, Port hand",
    26: "Buoy, Starboard hand",
    27: "Buoy, Preferred Channel port hand",
    28: "Buoy, Preferred Channel starboard hand",
    29: "Buoy, Isolated danger",
    30: "Buoy, Safe water",
    31: "Buoy, Special mark",
}


# ═══════════════════════════════════════════════════════
# BIT HELPERS
# ═══════════════════════════════════════════════════════

def validate_checksum(nmea_sentence: str) -> bool:
    """Verifies the NMEA checksum by XOR-ing all chars between ! and *."""
    if not nmea_sentence.startswith('!') or '*' not in nmea_sentence:
        logger.debug(f"[AIS] Invalid NMEA format (no ! or *): {nmea_sentence}")
        return False
    try:
        data_str, checksum_hex = nmea_sentence.split('*', 1)
        data_to_hash = data_str[1:]
        calculated_checksum = 0
        for char in data_to_hash:
            calculated_checksum ^= ord(char)
        return f"{calculated_checksum:02X}" == checksum_hex.strip().upper()
    except Exception:
        return False
    except Exception as e:
        logger.error(f"[AIS] Error validating checksum: {e}")
        return False


def to_6_bit_string(payload_char: str) -> str:
    """Converts a single ASCII payload character to its 6-bit binary representation."""
    val = ord(payload_char) - 48
    if val > 40:
        val -= 8
    # Ensure value is clamped to 0-63 range as per AIS spec
    val = max(0, min(63, val))
    return f"{val:06b}"


def get_int_from_bits(bitstr: str, start: int, length: int, signed: bool = False) -> int:
    """Extracts an integer from the bit string at specified position and length."""
    if start < 0 or start + length > len(bitstr):
        return 0
    sub_bits = bitstr[start:start + length]
    if not sub_bits:
        return 0
    val = int(sub_bits, 2)
    if signed and sub_bits[0] == '1':
        val = val - (1 << length)
    return val


def decode_6bit_string(bitstr: str, start: int, num_chars: int) -> str:
    """Decodes a 6-bit encoded string (ITU R.M.1371 Table 47) from the bit stream."""
    result = []
    for i in range(num_chars):
        offset = start + i * 6
        if offset + 6 > len(bitstr):
            break
        val = int(bitstr[offset:offset + 6], 2)
        if val < 32:
            result.append(chr(val + 64))  # @, A-Z, etc.
        else:
            result.append(chr(val))  # space, 0-9, etc.
    return "".join(result).rstrip("@ ").strip()


# ═══════════════════════════════════════════════════════
# TYPE-SPECIFIC DECODERS
# ═══════════════════════════════════════════════════════

def _decode_type_1_2_3(bitstr: str, data: dict):
    """Types 1, 2, 3: Position Report (Class A)."""
    if len(bitstr) < 168:
        return
    nav_status = get_int_from_bits(bitstr, 38, 4)
    rot = get_int_from_bits(bitstr, 42, 8, signed=True)
    sog = get_int_from_bits(bitstr, 50, 10) / 10.0
    accuracy = get_int_from_bits(bitstr, 60, 1)
    lon = get_int_from_bits(bitstr, 61, 28, signed=True) / 600000.0
    lat = get_int_from_bits(bitstr, 89, 27, signed=True) / 600000.0
    cog = get_int_from_bits(bitstr, 116, 12) / 10.0
    heading = get_int_from_bits(bitstr, 128, 9)
    timestamp = get_int_from_bits(bitstr, 137, 6)

    # Validate position
    if lon == 181.0 or lat == 91.0:
        return

    data["nav_status"] = nav_status
    data["status_text"] = NAV_STATUS_MAP.get(nav_status, "Unknown")
    data["rot"] = rot
    data["sog"] = sog if sog < 102.2 else None
    data["accuracy"] = accuracy
    data["lon"] = lon
    data["lat"] = lat
    data["cog"] = cog if cog < 360.0 else None
    data["heading"] = heading if heading < 511 else None
    data["timestamp_sec"] = timestamp


def _decode_type_4_11(bitstr: str, data: dict):
    """Type 4: Base Station Report / Type 11: UTC Response."""
    if len(bitstr) < 168:
        return
    lon = get_int_from_bits(bitstr, 79, 28, signed=True) / 600000.0
    lat = get_int_from_bits(bitstr, 107, 27, signed=True) / 600000.0

    if lon == 181.0 or lat == 91.0:
        return

    data["lon"] = lon
    data["lat"] = lat
    data["is_meteo"] = True
    data["is_base_station"] = True
    data["is_vessel"] = False


def _decode_type_5(bitstr: str, data: dict):
    """Type 5: Static and Voyage Related Data (2-fragment)."""
    if len(bitstr) < 424:
        return
    data["imo"] = get_int_from_bits(bitstr, 40, 30)
    data["callsign"] = decode_6bit_string(bitstr, 70, 7)
    data["name"] = decode_6bit_string(bitstr, 112, 20)
    data["ship_type"] = get_int_from_bits(bitstr, 232, 8)
    data["to_bow"] = get_int_from_bits(bitstr, 240, 9)
    data["to_stern"] = get_int_from_bits(bitstr, 249, 9)
    data["to_port"] = get_int_from_bits(bitstr, 258, 6)
    data["to_starboard"] = get_int_from_bits(bitstr, 264, 6)
    
    # ETA: Month(4), Day(5), Hour(5), Minute(6) starting at bit 274
    eta_month = get_int_from_bits(bitstr, 274, 4)
    eta_day = get_int_from_bits(bitstr, 278, 5)
    eta_hour = get_int_from_bits(bitstr, 283, 5)
    eta_minute = get_int_from_bits(bitstr, 288, 6)
    
    if 1 <= eta_month <= 12 and 1 <= eta_day <= 31:
        data["eta"] = f"{eta_month:02d}-{eta_day:02d} {eta_hour:02d}:{eta_minute:02d}"
    
    data["draught"] = get_int_from_bits(bitstr, 294, 8) / 10.0
    data["destination"] = decode_6bit_string(bitstr, 302, 20)
    ship_info = get_ship_type_info(data["ship_type"])
    data["ship_type_text"] = ship_info["description"]
    data["ship_type_description"] = ship_info["description"]
    data["ship_category"] = ship_info["icon_category"]


def _decode_type_6(bitstr: str, data: dict):
    """Type 6: Binary Addressed Message."""
    if len(bitstr) < 88:
        return
    data["dest_mmsi"] = get_int_from_bits(bitstr, 40, 30)
    data["dac"] = get_int_from_bits(bitstr, 72, 10)
    data["fid"] = get_int_from_bits(bitstr, 82, 6)


def _decode_type_7_13(bitstr: str, data: dict):
    """Type 7: Binary Acknowledge / Type 13: Safety Acknowledge."""
    if len(bitstr) < 72:
        return
    data["ack_mmsi_1"] = get_int_from_bits(bitstr, 40, 30)


def _decode_type_8(bitstr: str, data: dict):
    """Type 8: Binary Broadcast Message (including weather)."""
    if len(bitstr) < 56:
        return
    dac = get_int_from_bits(bitstr, 40, 10)
    fid = get_int_from_bits(bitstr, 50, 6)
    data["dac"] = dac
    data["fid"] = fid

    # Swedish weather station (DAC 1, FID 31 — meteorological/hydro)
    if dac == 1 and fid == 31 and len(bitstr) >= 163:
        lon = get_int_from_bits(bitstr, 56, 25, signed=True) / 60000.0
        lat = get_int_from_bits(bitstr, 81, 24, signed=True) / 60000.0
        
        # Wind: Apply 0.1 scaling (Common for SMA legacy stations)
        wind_speed = get_int_from_bits(bitstr, 140, 7) / 10.0
        wind_gust = get_int_from_bits(bitstr, 147, 7) / 10.0
        wind_dir = get_int_from_bits(bitstr, 154, 9)

        if len(bitstr) >= 185:
            # Water level: standard offset for FID 31 is different but let's 
            # try to detect if it needs scaling.
            water_raw = get_int_from_bits(bitstr, 163, 12, signed=True)
            water_level = water_raw / 100.0
            data["water_level"] = water_level

        # Validation per user rules (even for DAC 1)
        if wind_dir > 360 or wind_speed > 120.0:
            return

        data["lat"] = lat
        data["wind_speed"] = wind_speed
        data["wind_gust"] = wind_gust
        data["wind_direction"] = wind_dir
        data["is_meteo"] = True
        data["is_vessel"] = False
        data["name"] = f"METEO WEATHER {data['mmsi']}"

    # Swedish weather report (DAC 265, FI 01)
    elif dac == 265 and fid == 1 and len(bitstr) >= 185:
        # According to SMA / VIVA AIS specification (Strict Rule Implementation)
        
        # Station name: Bits 56-115 (10 chars of 6-bit ASCII)
        station_name = decode_6bit_string(bitstr, 56, 10)
        
        # Wind: Medel (7 bits), Byar (7 bits), Riktning (9 bits)
        # Unit: 0.1 m/s for speeds
        wind_speed = get_int_from_bits(bitstr, 116, 7) / 10.0
        wind_gust = get_int_from_bits(bitstr, 123, 7) / 10.0
        wind_dir = get_int_from_bits(bitstr, 130, 9)
        
        # Lufttryck: Bits 139-152 (14 bits, Unit: hPa)
        air_pressure = get_int_from_bits(bitstr, 139, 14)
        
        # Water level: Bits 153-166 (14 bits, Unit: cm)
        # Signed 14-bit: If RawValue > 8192, val = RawValue - 16384
        water_val = get_int_from_bits(bitstr, 153, 14)
        if water_val > 8192:
            water_val -= 16384
        water_level = water_val / 100.0  # cm to meters
        
        # Air temperature: Bits 175-185 (11 bits, 0.1C units)
        # Signed 11-bit: If bit 175 is 1 (val > 1024), val = val - 2048
        temp_val = get_int_from_bits(bitstr, 175, 11)
        if temp_val > 1024:
            temp_val -= 2048
        air_temp = temp_val / 10.0

        # Validation per user rules
        if wind_dir > 360 or wind_speed > 120.0:
            logger.warning(f"[AIS] VIVA decode error (bad offset?): mmsi={data.get('mmsi')} wind={wind_speed} dir={wind_dir}")
            return

        data["wind_speed"] = wind_speed
        data["wind_direction"] = wind_dir
        data["wind_gust"] = wind_gust
        data["air_pressure"] = air_pressure
        data["water_level"] = water_level
        data["air_temp"] = air_temp
        data["is_meteo"] = True
        data["is_vessel"] = False
        data["name"] = station_name if station_name else f"VIVA WEATHER {data['mmsi']}"


def _decode_type_9(bitstr: str, data: dict):
    """Type 9: SAR Aircraft Position Report."""
    if len(bitstr) < 168:
        return
    altitude = get_int_from_bits(bitstr, 38, 12)
    sog = get_int_from_bits(bitstr, 50, 10)
    lon = get_int_from_bits(bitstr, 61, 28, signed=True) / 600000.0
    lat = get_int_from_bits(bitstr, 89, 27, signed=True) / 600000.0
    cog = get_int_from_bits(bitstr, 116, 12) / 10.0

    if lon == 181.0 or lat == 91.0:
        return

    data["altitude"] = altitude if altitude < 4094 else None
    data["sog"] = sog
    data["lon"] = lon
    data["lat"] = lat
    data["cog"] = cog if cog < 360.0 else None
    data["is_sar"] = True
    data["ship_type_text"] = "SAR Aircraft"
    data["ship_category"] = "special"


def _decode_type_10(bitstr: str, data: dict):
    """Type 10: UTC/Date Inquiry."""
    if len(bitstr) < 72:
        return
    data["dest_mmsi"] = get_int_from_bits(bitstr, 40, 30)


def _decode_type_12(bitstr: str, data: dict):
    """Type 12: Addressed Safety-Related Message."""
    if len(bitstr) < 72:
        return
    data["dest_mmsi"] = get_int_from_bits(bitstr, 40, 30)
    seq_num = get_int_from_bits(bitstr, 70, 2)
    data["seq_num"] = seq_num

    # Decode text (starts at bit 72, variable length, 6-bit chars)
    avail_chars = (len(bitstr) - 72) // 6
    if avail_chars > 0:
        text = decode_6bit_string(bitstr, 72, min(avail_chars, 157))
        data["safety_text"] = text
        data["is_safety"] = True
        logger.warning(f"[AIS Safety Msg] MMSI={data['mmsi']} -> {data['dest_mmsi']}: {text}")


def _decode_type_14(bitstr: str, data: dict):
    """Type 14: Safety-Related Broadcast Message."""
    if len(bitstr) < 40:
        return
    avail_chars = (len(bitstr) - 40) // 6
    if avail_chars > 0:
        text = decode_6bit_string(bitstr, 40, min(avail_chars, 161))
        data["safety_text"] = text
        data["is_safety"] = True
        data["is_broadcast_alert"] = True
        logger.warning(f"[AIS Broadcast Alert] MMSI={data['mmsi']}: {text}")


def _decode_type_15(bitstr: str, data: dict):
    """Type 15: Interrogation."""
    if len(bitstr) < 88:
        return
    data["dest_mmsi_1"] = get_int_from_bits(bitstr, 40, 30)


def _decode_type_16(bitstr: str, data: dict):
    """Type 16: Assignment Mode Command."""
    if len(bitstr) < 96:
        return
    data["dest_mmsi_1"] = get_int_from_bits(bitstr, 40, 30)
    data["offset_1"] = get_int_from_bits(bitstr, 70, 12)
    data["increment_1"] = get_int_from_bits(bitstr, 82, 10)


def _decode_type_17(bitstr: str, data: dict):
    """Type 17: DGNSS Broadcast Binary Message."""
    if len(bitstr) < 80:
        return
    lon = get_int_from_bits(bitstr, 40, 18, signed=True) / 600.0
    lat = get_int_from_bits(bitstr, 58, 17, signed=True) / 600.0
    data["lon"] = lon
    data["lat"] = lat


def _decode_type_18(bitstr: str, data: dict):
    """Type 18: Standard Class B CS Position Report."""
    if len(bitstr) < 168:
        return
    sog = get_int_from_bits(bitstr, 46, 10) / 10.0
    accuracy = get_int_from_bits(bitstr, 56, 1)
    lon = get_int_from_bits(bitstr, 57, 28, signed=True) / 600000.0
    lat = get_int_from_bits(bitstr, 85, 27, signed=True) / 600000.0
    cog = get_int_from_bits(bitstr, 112, 12) / 10.0
    heading = get_int_from_bits(bitstr, 124, 9)

    if lon == 181.0 or lat == 91.0:
        return

    data["sog"] = sog if sog < 102.2 else None
    data["accuracy"] = accuracy
    data["lon"] = lon
    data["lat"] = lat
    data["cog"] = cog if cog < 360.0 else None
    data["heading"] = heading if heading < 511 else None
    data["status_text"] = "Class B"
    # Class B Type 18 doesn't have ROT.


def _decode_type_19(bitstr: str, data: dict):
    """Type 19: Extended Class B Equipment Position Report."""
    if len(bitstr) < 312:
        return
    sog = get_int_from_bits(bitstr, 46, 10) / 10.0
    lon = get_int_from_bits(bitstr, 57, 28, signed=True) / 600000.0
    lat = get_int_from_bits(bitstr, 85, 27, signed=True) / 600000.0
    cog = get_int_from_bits(bitstr, 112, 12) / 10.0
    heading = get_int_from_bits(bitstr, 124, 9)
    name = decode_6bit_string(bitstr, 143, 20)
    ship_type = get_int_from_bits(bitstr, 263, 8)

    if lon == 181.0 or lat == 91.0:
        return

    data["sog"] = sog if sog < 102.2 else None
    data["lon"] = lon
    data["lat"] = lat
    data["cog"] = cog if cog < 360.0 else None
    data["heading"] = heading if heading < 511 else None
    data["name"] = name
    data["ship_type"] = ship_type
    ship_info = get_ship_type_info(ship_type)
    data["ship_type_text"] = ship_info["description"]
    data["ship_type_description"] = ship_info["description"]
    data["ship_category"] = ship_info["icon_category"]


def _decode_type_20(bitstr: str, data: dict):
    """Type 20: Data Link Management Message."""
    if len(bitstr) < 72:
        return
    data["offset_1"] = get_int_from_bits(bitstr, 40, 12)
    data["num_slots_1"] = get_int_from_bits(bitstr, 52, 4)
    data["timeout_1"] = get_int_from_bits(bitstr, 56, 3)
    data["increment_1"] = get_int_from_bits(bitstr, 59, 11)


def _decode_type_21(bitstr: str, data: dict):
    """Type 21: Aid-to-Navigation Report (AtoN)."""
    if len(bitstr) < 272:
        return
    aton_type = get_int_from_bits(bitstr, 38, 5)
    name = decode_6bit_string(bitstr, 43, 20)
    accuracy = get_int_from_bits(bitstr, 163, 1)
    lon = get_int_from_bits(bitstr, 164, 28, signed=True) / 600000.0
    lat = get_int_from_bits(bitstr, 192, 27, signed=True) / 600000.0
    to_bow = get_int_from_bits(bitstr, 219, 9)
    to_stern = get_int_from_bits(bitstr, 228, 9)
    to_port = get_int_from_bits(bitstr, 237, 6)
    to_starboard = get_int_from_bits(bitstr, 243, 6)
    virtual_aton = get_int_from_bits(bitstr, 253, 1)

    if lon == 181.0 or lat == 91.0:
        return

    data["aton_type"] = aton_type
    data["aton_type_text"] = ATON_TYPE_MAP.get(aton_type, "Unknown")
    data["name"] = name
    data["accuracy"] = accuracy
    data["lon"] = lon
    data["lat"] = lat
    data["to_bow"] = to_bow
    data["to_stern"] = to_stern
    data["to_port"] = to_port
    data["to_starboard"] = to_starboard
    data["virtual_aton"] = bool(virtual_aton)
    data["is_aton"] = True
    data["ship_type_text"] = ATON_TYPE_MAP.get(aton_type, "AtoN")
    data["ship_category"] = "aton"


def _decode_type_22(bitstr: str, data: dict):
    """Type 22: Channel Management."""
    channel_a = get_int_from_bits(bitstr, 40, 12)
    channel_b = get_int_from_bits(bitstr, 52, 12)
    tx_rx_mode = get_int_from_bits(bitstr, 64, 4)
    power = get_int_from_bits(bitstr, 68, 1)
    
    data["channel_a"] = channel_a
    data["channel_b"] = channel_b
    data["tx_rx_mode"] = tx_rx_mode
    data["high_power"] = bool(power)
    
    logger.info(f"[AIS Channel Mgmt] MMSI={data['mmsi']} | CH_A={channel_a} CH_B={channel_b} Mode={tx_rx_mode} Power={'High' if power else 'Low'}")


def _decode_type_23(bitstr: str, data: dict):
    """Type 23: Group Assignment Command."""
    if len(bitstr) < 160:
        return
    data["ne_lon"] = get_int_from_bits(bitstr, 40, 18, signed=True) / 600.0
    data["ne_lat"] = get_int_from_bits(bitstr, 58, 17, signed=True) / 600.0
    data["sw_lon"] = get_int_from_bits(bitstr, 75, 18, signed=True) / 600.0
    data["sw_lat"] = get_int_from_bits(bitstr, 93, 17, signed=True) / 600.0


def _decode_type_25(bitstr: str, data: dict):
    """Type 25: Single Slot Binary Message."""
    if len(bitstr) < 40:
        return
    addressed = bool(get_int_from_bits(bitstr, 38, 1))
    structured = bool(get_int_from_bits(bitstr, 39, 1))
    data["addressed"] = addressed
    data["structured"] = structured
    
    if structured:
        data["dac"] = get_int_from_bits(bitstr, 40, 10)
        data["fid"] = get_int_from_bits(bitstr, 50, 6)
        data["is_advanced_binary"] = True
        # Content starts at bit 56
        data["raw_payload"] = bitstr[56:]
    else:
        # Unstructured binary data starts at bit 40 (addressed=1) or 40 (addressed=0)
        # Actually bit 40 if addressed, otherwise bit 40? 
        # Referencing ITU-R M.1371: 
        # If addressed=0, structured=0: 168 bits total, data starts at 40
        # If addressed=1, structured=0: 168 bits total, data starts at 70 (dest mmsi is 30 bits)
        if addressed:
            data["dest_mmsi"] = get_int_from_bits(bitstr, 40, 30)
            data["raw_payload"] = bitstr[70:]
        else:
            data["raw_payload"] = bitstr[40:]
        data["is_advanced_binary"] = True


def _decode_type_26(bitstr: str, data: dict):
    """Type 26: Multiple Slot Binary Message with Communications State."""
    if len(bitstr) < 60:
        return
    addressed = bool(get_int_from_bits(bitstr, 38, 1))
    structured = bool(get_int_from_bits(bitstr, 39, 1))
    data["addressed"] = addressed
    data["structured"] = structured
    
    if addressed:
        data["dest_mmsi"] = get_int_from_bits(bitstr, 40, 30)
        start_bit = 70
    else:
        start_bit = 40

    if structured:
        data["dac"] = get_int_from_bits(bitstr, start_bit, 10)
        data["fid"] = get_int_from_bits(bitstr, start_bit + 10, 6)
        data["is_advanced_binary"] = True
        data["raw_payload"] = bitstr[start_bit + 16 : len(bitstr) - 20] # Subtract comm state
    else:
        data["is_advanced_binary"] = True
        data["raw_payload"] = bitstr[start_bit : len(bitstr) - 20]


def _decode_type_27(bitstr: str, data: dict):
    """Type 27: Long Range AIS Broadcast Message."""
    if len(bitstr) < 96:
        return
    accuracy = get_int_from_bits(bitstr, 38, 1)
    nav_status = get_int_from_bits(bitstr, 40, 4)
    lon = get_int_from_bits(bitstr, 44, 18, signed=True) / 600.0
    lat = get_int_from_bits(bitstr, 62, 17, signed=True) / 600.0
    sog = get_int_from_bits(bitstr, 79, 6)
    cog = get_int_from_bits(bitstr, 85, 9)

    if lon == 181.0 or lat == 91.0:
        return

    data["accuracy"] = accuracy
    data["nav_status"] = nav_status
    data["status_text"] = NAV_STATUS_MAP.get(nav_status, "Unknown")
    data["lon"] = lon
    data["lat"] = lat
    data["sog"] = float(sog)
    data["cog"] = float(cog)


# ═══════════════════════════════════════════════════════
# MAIN STREAM MANAGER
# ═══════════════════════════════════════════════════════

# Decoder dispatch table
_TYPE_DECODERS = {
    1: _decode_type_1_2_3,
    2: _decode_type_1_2_3,
    3: _decode_type_1_2_3,
    4: _decode_type_4_11,
    5: _decode_type_5,
    6: _decode_type_6,
    7: _decode_type_7_13,
    8: _decode_type_8,
    9: _decode_type_9,
    10: _decode_type_10,
    11: _decode_type_4_11,
    12: _decode_type_12,
    13: _decode_type_7_13,
    14: _decode_type_14,
    15: _decode_type_15,
    16: _decode_type_16,
    17: _decode_type_17,
    18: _decode_type_18,
    19: _decode_type_19,
    20: _decode_type_20,
    21: _decode_type_21,
    22: _decode_type_22,
    23: _decode_type_23,
    # 24 handled separately (A/B pairing)
    25: _decode_type_25,
    26: _decode_type_26,
    27: _decode_type_27,
}


class AisStreamManager:
    def __init__(self):
        # Multi-fragment reassembly buffer
        # Key: (sequence_id, channel) → Value: {fragments, expected, timestamp}
        self.buffer = {}
        self.ttl = 5.0  # seconds

        # Type 24 Part A/B pairing buffer
        # Key: MMSI → Value: {"part_a": {...}, "timestamp": float}
        self.type24_buffer = {}
        self.type24_ttl = 30.0  # seconds

        self.decoders = []

    def on_decode(self, callback):
        self.decoders.append(callback)

    def process_sentence(self, sentence: str):
        if not validate_checksum(sentence):
            return

        self._cleanup()

        parts = sentence.split(',')
        if len(parts) < 7:
            return

        try:
            total_fragments = int(parts[1])
            fragment_num = int(parts[2])
            sequence_id = parts[3]
            channel = parts[4]
            payload = parts[5]
        except ValueError:
            return

        if total_fragments == 1:
            self._decode_payload(payload, [sentence], channel=channel)
        else:
            key = (sequence_id, channel)
            if key not in self.buffer:
                self.buffer[key] = {
                    "fragments": {},
                    "sentences": {},
                    "expected": total_fragments,
                    "timestamp": time.time()
                }

            self.buffer[key]["fragments"][fragment_num] = payload
            self.buffer[key]["sentences"][fragment_num] = sentence
            self.buffer[key]["timestamp"] = time.time()

            if len(self.buffer[key]["fragments"]) == self.buffer[key]["expected"]:
                full_payload = ""
                full_sentences = []
                for i in range(1, total_fragments + 1):
                    full_payload += self.buffer[key]["fragments"].get(i, "")
                    full_sentences.append(self.buffer[key]["sentences"].get(i, ""))

                del self.buffer[key]
                self._decode_payload(full_payload, full_sentences, channel=channel)

    def _cleanup(self):
        now = time.time()
        # Multi-fragment TTL
        expired = [k for k, v in self.buffer.items() if now - v["timestamp"] > self.ttl]
        for k in expired:
            del self.buffer[k]
        # Type 24 pairing TTL
        expired_24 = [k for k, v in self.type24_buffer.items() if now - v["timestamp"] > self.type24_ttl]
        for k in expired_24:
            del self.type24_buffer[k]

    def _decode_payload(self, payload: str, sentences: list = None, channel: str = None):
        bitstr = "".join([to_6_bit_string(c) for c in payload])

        if len(bitstr) < 38:
            return

        msg_type = get_int_from_bits(bitstr, 0, 6)
        mmsi = get_int_from_bits(bitstr, 8, 30)

        # Emergency Detection (MMSI Prefixes)
        mmsi_str = str(mmsi)
        is_emergency = False
        emergency_type = None
        if mmsi_str.startswith("970"):
            is_emergency = True
            emergency_type = "AIS-SART"
        elif mmsi_str.startswith("972"):
            is_emergency = True
            emergency_type = "MOB"
        elif mmsi_str.startswith("974"):
            is_emergency = True
            emergency_type = "EPIRB"

        decoded_data = {
            "mmsi": mmsi,
            "type": msg_type,
            "nmea": sentences[0] if sentences and len(sentences) == 1 else sentences,
            "is_emergency": is_emergency,
            "emergency_type": emergency_type,
            "ais_channel": channel
        }

        # Type 24: Class B CS Static Data Report (Part A + B pairing)
        if msg_type == 24:
            self._handle_type_24(bitstr, decoded_data)
            return

        # All other types via dispatch table
        decoder = _TYPE_DECODERS.get(msg_type)
        if decoder:
            decoder(bitstr, decoded_data)

        # Propagate to listeners
        for cb in self.decoders:
            cb(decoded_data)

    def _handle_type_24(self, bitstr: str, data: dict):
        """
        Type 24: Class B CS Static Data Report.
        Part A (part_num=0) has the ship name.
        Part B (part_num=1) has callsign, ship type, dimensions.
        We buffer Part A and emit only when Part B arrives (or vice versa).
        """
        if len(bitstr) < 160:
            return

        part_num = get_int_from_bits(bitstr, 38, 2)
        mmsi = data["mmsi"]

        if part_num == 0:
            # Part A: Ship Name
            name = decode_6bit_string(bitstr, 40, 20)
            if mmsi not in self.type24_buffer:
                self.type24_buffer[mmsi] = {"timestamp": time.time()}
            self.type24_buffer[mmsi]["part_a"] = {"name": name}
            self.type24_buffer[mmsi]["timestamp"] = time.time()

            # Check if Part B already arrived
            if "part_b" in self.type24_buffer[mmsi]:
                self._emit_type_24(mmsi, data)

        elif part_num == 1:
            # Part B: Ship Type, Callsign, Dimensions
            ship_type = get_int_from_bits(bitstr, 40, 8)
            vendor_id = decode_6bit_string(bitstr, 48, 3)
            callsign = decode_6bit_string(bitstr, 90, 7)
            to_bow = get_int_from_bits(bitstr, 132, 9)
            to_stern = get_int_from_bits(bitstr, 141, 9)
            to_port = get_int_from_bits(bitstr, 150, 6)
            to_starboard = get_int_from_bits(bitstr, 156, 6)

            if mmsi not in self.type24_buffer:
                self.type24_buffer[mmsi] = {"timestamp": time.time()}
            self.type24_buffer[mmsi]["part_b"] = {
                "ship_type": ship_type,
                "vendor_id": vendor_id,
                "callsign": callsign,
                "to_bow": to_bow,
                "to_stern": to_stern,
                "to_port": to_port,
                "to_starboard": to_starboard,
            }
            self.type24_buffer[mmsi]["timestamp"] = time.time()

            # Check if Part A already arrived
            if "part_a" in self.type24_buffer[mmsi]:
                self._emit_type_24(mmsi, data)

    def _emit_type_24(self, mmsi: int, data: dict):
        """Merge Part A + Part B and emit the combined result."""
        entry = self.type24_buffer.pop(mmsi, None)
        if not entry:
            return

        part_a = entry.get("part_a", {})
        part_b = entry.get("part_b", {})

        data["name"] = part_a.get("name", "")
        data["ship_type"] = part_b.get("ship_type", 0)
        data["callsign"] = part_b.get("callsign", "")
        data["to_bow"] = part_b.get("to_bow", 0)
        data["to_stern"] = part_b.get("to_stern", 0)
        data["to_port"] = part_b.get("to_port", 0)
        data["to_starboard"] = part_b.get("to_starboard", 0)
        ship_info = get_ship_type_info(data["ship_type"])
        data["ship_type_text"] = ship_info["description"]
        data["ship_type_description"] = ship_info["description"]
        data["ship_category"] = ship_info["icon_category"]

        for cb in self.decoders:
            cb(data)
