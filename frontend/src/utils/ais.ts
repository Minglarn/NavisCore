export const AIS_MSG_TYPE_NAMES: Record<number, string> = {
    1: 'Scheduled Position Report',
    2: 'Assigned Position Report',
    3: 'Special Position Report',
    4: 'Base Station Report',
    5: 'Static and Voyage Data',
    6: 'Binary Addressed Message',
    7: 'Binary Acknowledge',
    8: 'Binary Broadcast Message',
    9: 'SAR Aircraft Position Report',
    10: 'UTC and Date Inquiry',
    11: 'UTC and Date Response',
    12: 'Addressed Safety Message',
    13: 'Safety Acknowledge',
    14: 'Safety Broadcast Message',
    15: 'Interrogation',
    16: 'Assignment Mode Command',
    17: 'DGNSS Broadcast Binary Message',
    18: 'Standard Class B Position Report',
    19: 'Extended Class B Position Report',
    20: 'Data Link Management',
    21: 'Aid to Navigation (AtoN)',
    22: 'Channel Management',
    23: 'Group Assignment Command',
    24: 'Static Data Report',
    25: 'Single Slot Binary Message',
    26: 'Multiple Slot Binary Message',
    27: 'Long Range Position Report'
};


export function getAisMsgTypeName(type?: number): string {
    if (type == null) return 'Unknown';
    return AIS_MSG_TYPE_NAMES[type] || `Unknown (${type})`;
}

export function getShipColor(mmsiStr: string, type?: number, isMeteo?: boolean, isAton?: boolean, isEmergency?: boolean) {
    if (isEmergency) return '#ff0000'; // Emergency (Bright Red)
    
    // Fallback: Check MMSI prefixes for emergency devices if flag didn't catch it
    if (mmsiStr && (mmsiStr.startsWith('970') || mmsiStr.startsWith('972') || mmsiStr.startsWith('974'))) {
        return '#ff0000';
    }

    if (isMeteo) return '#bae6fd'; // Weather (Very Light Blue)
    if (isAton || mmsiStr.startsWith('99')) return '#d946ef'; // AtoN (Magenta)
    if (mmsiStr.startsWith('00')) return '#64748b'; // Base Station (Slate)
    if (!type && type !== 0) return '#a0a0a0'; // Unknown

    if (type >= 20 && type <= 29) return '#f8fafc'; // WIG (White)
    if (type === 30) return '#f97316'; // Fishing (Orange)
    if (type >= 31 && type <= 32 || type == 52) return '#06b6d4'; // Tugs & Towing (Cyan)
    if (type === 33) return '#b45309'; // Dredging (Brown/Amber)
    if (type === 34) return '#0ea5e9'; // Diving (Sky Blue)
    if (type === 35 || type === 55) return '#4338ca'; // Military/Law Enf (Indigo)
    if (type >= 36 && type <= 37) return '#a855f7'; // Pleasure/Sailing (Purple)
    if (type >= 40 && type <= 49) return '#eab308'; // HSC (Yellow)
    if (type === 50) return '#7dd3fc'; // Pilot (Light Blue)
    if (type === 51 || type === 9) return '#f43f5e'; // SAR (Pink-Red)
    if (type >= 53 && type <= 54) return '#2e8b57'; // Port/Anti-pollution (SeaGreen)
    if (type === 58) return '#ec4899'; // Medical (Pink)
    if (type >= 60 && type <= 69) return '#3b82f6'; // Passenger (Blue)
    if (type === 70 || type === 79 || (type >= 71 && type <= 78)) return '#22c55e'; // Cargo (Green)
    if (type >= 80 && type <= 89) return '#ef4444'; // Tanker (Red)

    return '#a0a0a0'; // Other Type
}

export function getShipTypeName(mmsiStr: string, shipType?: number, typeText?: string, isMeteo?: boolean) {
    if (isMeteo) return 'Stationary / Meteo';
    if (mmsiStr.startsWith('99')) return 'Aid to Navigation (Light/Buoy)';
    if (mmsiStr.startsWith('00')) return 'Base Station';

    // Prefer backend-supplied text
    if (typeText) return typeText;

    if (shipType === undefined || shipType === null) return 'Unknown Type';

    switch (shipType) {
        case 0: return "Not available (default)";
        case 20: return "Wing in ground (WIG)";
        case 21: return "Wing in ground (WIG), Hazardous category A";
        case 22: return "Wing in ground (WIG), Hazardous category B";
        case 23: return "Wing in ground (WIG), Hazardous category C";
        case 24: return "Wing in ground (WIG), Hazardous category D";
        case 25: case 26: case 27: case 28: case 29: return "Wing in ground (WIG), Reserved";
        case 30: return "Fishing";
        case 31: return "Towing";
        case 32: return "Towing: length >200m or breadth >25m";
        case 33: return "Dredging or underwater ops";
        case 34: return "Diving ops";
        case 35: return "Military ops";
        case 36: return "Sailing";
        case 37: return "Pleasure Craft";
        case 38: case 39: return "Reserved";
        case 40: return "High speed craft (HSC)";
        case 41: return "High speed craft (HSC), Hazardous category A";
        case 42: return "High speed craft (HSC), Hazardous category B";
        case 43: return "High speed craft (HSC), Hazardous category C";
        case 44: return "High speed craft (HSC), Hazardous category D";
        case 45: case 46: case 47: case 48: return "High speed craft (HSC), Reserved";
        case 49: return "High speed craft (HSC)";
        case 50: return "Pilot Vessel";
        case 51: return "SAR";
        case 52: return "Tug";
        case 53: return "Port Tender";
        case 54: return "Anti-pollution equipment";
        case 55: return "Law Enforcement";
        case 56: case 57: return "Spare - Local Vessel";
        case 58: return "Medical Transport";
        case 59: return "Non-combatant ship according to RR Resolution No. 18";
        case 60: return "Passenger";
        case 61: return "Passenger, Hazardous category A";
        case 62: return "Passenger, Hazardous category B";
        case 63: return "Passenger, Hazardous category C";
        case 64: return "Passenger, Hazardous category D";
        case 65: case 66: case 67: case 68: return "Passenger, Reserved";
        case 69: return "Passenger";
        case 70: return "Cargo";
        case 71: return "Cargo, Hazardous category A";
        case 72: return "Cargo, Hazardous category B";
        case 73: return "Cargo, Hazardous category C";
        case 74: return "Cargo, Hazardous category D";
        case 75: case 76: case 77: case 78: return "Cargo, Reserved";
        case 79: return "Cargo";
        case 80: return "Tanker";
        case 81: return "Tanker, Hazardous category A";
        case 82: return "Tanker, Hazardous category B";
        case 83: return "Tanker, Hazardous category C";
        case 84: return "Tanker, Hazardous category D";
        case 85: case 86: case 87: case 88: return "Tanker, Reserved";
        case 89: return "Tanker";
        case 90: return "Other Type";
        case 91: return "Other Type, Hazardous category A";
        case 92: return "Other Type, Hazardous category B";
        case 93: return "Other Type, Hazardous category C";
        case 94: return "Other Type, Hazardous category D";
        case 95: case 96: case 97: case 98: return "Other Type, Reserved";
        case 99: return "Other Type";
        default: 
            if (shipType >= 1 && shipType <= 19) return "Reserved for future use";
            return "Unknown Type";
    }
}

export function getShipFilterCategory(s: any): string {
    const mmsiStr = String(s.mmsi || "");
    const typeNum = parseInt(String(s.shiptype || s.ship_type || 0));
    const typeStr = (s.ship_type_text || "").toUpperCase();
    
    // 1. AtoN (Highest priority)
    if (s.is_aton || mmsiStr.startsWith('99') || typeStr.includes('AID TO NAVIGATION') || typeStr.includes('ATON')) {
        return 'aton';
    }
    
    // 1b. Meteo
    if (s.is_meteo || typeStr.includes('METEO') || typeStr.includes('WEATHER')) {
        return 'meteo';
    }
    
    // 2. Base Station
    if (mmsiStr.startsWith('00')) return 'base_station';
    
    // 3. SAR / Pilot
    if (typeNum === 50 || typeNum === 51 || typeNum === 9 || typeStr.includes('PILOT') || typeStr.includes('SAR')) return 'pilot_sar';
    
    // 4. Military / Law
    if (typeNum === 35 || typeNum === 55 || typeNum === 59 || typeStr.includes('MILITARY') || typeStr.includes('LAW')) return 'military';
    
    // 5. Cargo
    if ((typeNum >= 70 && typeNum <= 79) || typeStr.includes('CARGO')) return 'cargo';
    
    // 6. Tanker
    if ((typeNum >= 80 && typeNum <= 89) || typeStr.includes('TANKER')) return 'tanker';
    
    // 7. Passenger
    if ((typeNum >= 60 && typeNum <= 69) || typeStr.includes('PASSENGER')) return 'passenger';
    
    // 8. Fishing
    if (typeNum === 30 || typeStr.includes('FISHING')) return 'fishing';
    
    // 9. Pleasure / Sailing
    if (typeNum === 36 || typeNum === 37 || typeStr.includes('SAILING') || typeStr.includes('PLEASURE')) return 'pleasure';
    
    // 10. Tug / Towing
    if (typeNum === 52 || typeNum === 31 || typeNum === 32 || typeStr.includes('TUG') || typeStr.includes('TOWING')) return 'tug';
    
    // 11. High Speed
    if ((typeNum >= 40 && typeNum <= 49) || typeStr.includes('HSC') || typeStr.includes('HIGH SPEED')) return 'highspeed';
    
    // 12. WIG
    if ((typeNum >= 20 && typeNum <= 29) || typeStr.includes('WIG') || typeStr.includes('WING')) return 'wig';
    
    // 13. Special
    if (typeNum === 33 || typeNum === 34 || typeNum === 53 || typeNum === 54 || typeNum === 58 || typeStr.includes('DREDGING') || typeStr.includes('DIVING') || typeStr.includes('PORT') || typeStr.includes('MEDICAL')) return 'special';
    
    // Default
    return 'other';
}
 
export const aisShipTypes = [
    { value: 0, label: "Not available (default)" },
    { value: 20, label: "Wing in ground (WIG), all ships" },
    { value: 30, label: "Fishing" },
    { value: 31, label: "Towing" },
    { value: 32, label: "Towing: length >200m or breadth >25m" },
    { value: 33, label: "Dredging or underwater ops" },
    { value: 34, label: "Diving ops" },
    { value: 35, label: "Military ops" },
    { value: 36, label: "Sailing" },
    { value: 37, label: "Pleasure Craft" },
    { value: 40, label: "High speed craft (HSC), all ships" },
    { value: 50, label: "Pilot Vessel" },
    { value: 51, label: "Search and Rescue vessel" },
    { value: 52, label: "Tug" },
    { value: 53, label: "Port Tender" },
    { value: 54, label: "Anti-pollution equipment" },
    { value: 55, label: "Law Enforcement" },
    { value: 56, label: "Spare - Local Vessel" },
    { value: 58, label: "Medical Transport" },
    { value: 59, label: "Non-combatant ship" },
    { value: 60, label: "Passenger, all ships" },
    { value: 70, label: "Cargo, all ships" },
    { value: 80, label: "Tanker, all ships" },
    { value: 90, label: "Other Type, all ships" }
];


