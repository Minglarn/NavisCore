import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Tooltip, LayersControl, useMap, Circle, Polygon, Polyline, useMapEvents, ZoomControl, Rectangle } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import L from 'leaflet'
import { Settings, X, Moon, Sun, Anchor, List, Navigation, Search, Ship, Signal, Info, Crosshair, Radio, BarChart2, Globe, Plus, Calendar, ChevronLeft, ChevronRight, Activity, Radar, Terminal, ChevronDown, ChevronUp, ArrowDownLeft, ArrowUpRight, LayoutGrid, Rows, Database, Wifi, User, TrendingUp, AlertTriangle, Check, Edit, Save, Trash2 } from 'lucide-react';
import 'leaflet/dist/leaflet.css'

import {
  Chart as ChartJS,
  RadialLinearScale,
  ArcElement,
  Tooltip as ChartTooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Filler,
  BarElement
} from 'chart.js';
import { PolarArea, Line, Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  RadialLinearScale,
  ArcElement,
  ChartTooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Filler,
  BarElement
);

function CenterButton({ originLat, originLon }: { originLat: number, originLon: number }) {
    const map = useMap();
    if (isNaN(originLat) || isNaN(originLon)) return null;
    return (
        <div style={{
            position: 'absolute', bottom: '100px', left: '10px', zIndex: 1000
        }}>
            <button
                onClick={() => map.flyTo([originLat, originLon], map.getZoom(), { duration: 1.2 })}
                title="Centrera p\u00E5 station"
                style={{
                    width: '36px', height: '36px', borderRadius: '6px',
                    background: 'rgba(255,255,255,0.95)', border: '2px solid rgba(0,0,0,0.2)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.3)', transition: 'transform 0.15s'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
                <Crosshair size={20} color="#333" />
            </button>
        </div>
    );
}
import './index.css'

// Fix default icons for Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function getShipColor(mmsiStr: string, type?: number, isMeteo?: boolean, isAton?: boolean, isEmergency?: boolean) {
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

function getShipTypeName(mmsiStr: string, shipType?: number, typeText?: string, isMeteo?: boolean) {
    if (isMeteo) return 'Stationary / Meteo';
    if (mmsiStr.startsWith('99')) return 'Aid to Navigation (Light/Buoy)';
    if (mmsiStr.startsWith('00')) return 'Base Station';

    // Prefer backend-supplied text
    if (typeText) return typeText;

    if (!shipType && shipType !== 0) return 'Unknown Type';

    if (shipType >= 20 && shipType <= 29) return 'Wing in ground (WIG)';
    if (shipType >= 40 && shipType <= 49) return 'High speed craft (HSC)';
    if (shipType >= 60 && shipType <= 69) return 'Passenger';
    if (shipType >= 70 && shipType <= 79) return 'Cargo';
    if (shipType >= 80 && shipType <= 89) return 'Tanker';
    if (shipType >= 90 && shipType <= 99) return 'Other Type';

    switch (shipType) {
        case 0: return "Not available";
        case 30: return "Fishing";
        case 31: case 32: return "Towing";
        case 33: return "Dredging/Underwater";
        case 34: return "Diving ops";
        case 35: return "Military ops";
        case 36: return "Sailing";
        case 37: return "Pleasure Craft";
        case 50: return "Pilot Vessel";
        case 51: return "S.A.R";
        case 52: return "Tug";
        case 53: return "Port Tender";
        case 54: return "Anti-pollution";
        case 55: return "Law Enforcement";
        case 56: case 57: return "Local Vessel";
        case 58: return "Medical Transport";
        case 59: return "Noncombatant ship";
        default: return "Unknown Type";
    }
}

function getShipFilterCategory(s: any): string {
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
 
const aisShipTypes = [
    { value: 0, label: "Not available" },
    { value: 30, label: "Fishing" },
    { value: 31, label: "Towing" },
    { value: 32, label: "Towing (Large)" },
    { value: 33, label: "Dredging/Underwater" },
    { value: 34, label: "Diving ops" },
    { value: 35, label: "Military ops" },
    { value: 36, label: "Sailing" },
    { value: 37, label: "Pleasure Craft" },
    { value: 50, label: "Pilot Vessel" },
    { value: 51, label: "S.A.R" },
    { value: 52, label: "Tug" },
    { value: 53, label: "Port Tender" },
    { value: 54, label: "Anti-pollution" },
    { value: 55, label: "Law Enforcement" },
    { value: 56, label: "Local Vessel" },
    { value: 57, label: "Local Vessel" },
    { value: 58, label: "Medical Transport" },
    { value: 59, label: "Noncombatant ship" },
    { value: 60, label: "Passenger" },
    { value: 70, label: "Cargo" },
    { value: 80, label: "Tanker" },
    { value: 90, label: "Other Type" }
];



function getCountryName(countryCode?: string) {
    if (!countryCode || countryCode === "00") return "";
    const names: { [key: string]: string } = {
        "ad": "Andorra", "ae": "U.A.E.", "af": "Afghanistan", "ag": "Antigua & Barbuda", "ai": "Anguilla", "al": "Albania", "am": "Armenia", "ao": "Angola", "ar": "Argentina", "as": "American Samoa", "at": "Austria", "au": "Australia", "aw": "Aruba", "az": "Azerbaijan",
        "ba": "Bosnia", "bb": "Barbados", "bd": "Bangladesh", "be": "Belgium", "bf": "Burkina Faso", "bg": "Bulgaria", "bh": "Bahrain", "bi": "Burundi", "bj": "Benin", "bm": "Bermuda", "bn": "Brunei", "bo": "Bolivia", "bq": "Bonaire", "br": "Brazil", "bs": "Bahamas", "bt": "Bhutan", "bw": "Botswana", "by": "Belarus", "bz": "Belize",
        "ca": "Canada", "cd": "Congo (DRC)", "cf": "Central Africa", "cg": "Congo", "ch": "Switzerland", "ci": "Ivory Coast", "ck": "Cook Islands", "cl": "Chile", "cm": "Cameroon", "cn": "China", "co": "Colombia", "cr": "Costa Rica", "cu": "Cuba", "cv": "Cape Verde", "cw": "Curaçao", "cy": "Cyprus", "cz": "Czech Rep.",
        "de": "Germany", "dj": "Djibouti", "dk": "Denmark", "dm": "Dominica", "do": "Dominican Rep.", "dz": "Algeria",
        "ec": "Ecuador", "ee": "Estonia", "eg": "Egypt", "er": "Eritrea", "es": "Spain", "et": "Ethiopia",
        "fi": "Finland", "fj": "Fiji", "fk": "Falkland Is.", "fo": "Faroe Is.", "fr": "France",
        "ga": "Gabon", "gb": "UK", "gd": "Grenada", "ge": "Georgia", "gf": "French Guiana", "gh": "Ghana", "gi": "Gibraltar", "gl": "Greenland", "gm": "Gambia", "gn": "Guinea", "gp": "Guadeloupe", "gq": "Equatorial Guinea", "gr": "Greece", "gt": "Guatemala", "gu": "Guam", "gw": "Guinea-Bissau", "gy": "Guyana",
        "hk": "Hong Kong", "hn": "Honduras", "hr": "Croatia", "ht": "Haiti", "hu": "Hungary",
        "id": "Indonesia", "ie": "Ireland", "il": "Israel", "in": "India", "iq": "Iraq", "ir": "Iran", "is": "Iceland", "it": "Italy",
        "jm": "Jamaica", "jo": "Jordan", "jp": "Japan",
        "ke": "Kenya", "kg": "Kyrgyzstan", "kh": "Cambodia", "kn": "St Kitts & Nevis", "kp": "North Korea", "kr": "South Korea", "kw": "Kuwait", "ky": "Cayman Is.", "kz": "Kazakhstan",
        "lb": "Lebanon", "lc": "St Lucia", "li": "Liechtenstein", "lk": "Sri Lanka", "lr": "Liberia", "ls": "Lesotho", "lt": "Lithuania", "lu": "Luxembourg", "lv": "Latvia", "ly": "Libya",
        "ma": "Morocco", "mc": "Monaco", "md": "Moldova", "me": "Montenegro", "mg": "Madagascar", "mh": "Marshall Is.", "mk": "North Macedonia", "ml": "Mali", "mm": "Myanmar", "mn": "Mongolia", "mo": "Macao", "mp": "N. Mariana Is.", "mq": "Martinique", "mr": "Mauritania", "ms": "Montserrat", "mt": "Malta", "mu": "Mauritius", "mv": "Maldives", "mw": "Malawi", "mx": "Mexico", "my": "Malaysia", "mz": "Mozambique",
        "na": "Namibia", "ne": "Niger", "ng": "Nigeria", "ni": "Nicaragua", "nl": "Netherlands", "no": "Norway", "np": "Nepal", "nz": "New Zealand",
        "om": "Oman",
        "pa": "Panama", "pe": "Peru", "pf": "Fr. Polynesia", "pg": "P.N.G.", "ph": "Philippines", "pk": "Pakistan", "pl": "Poland", "pm": "St Pierre", "pr": "Puerto Rico", "pt": "Portugal", "py": "Paraguay",
        "qa": "Qatar",
        "ro": "Romania", "rs": "Serbia", "ru": "Russia", "rw": "Rwanda",
        "sa": "Saudi Arabia", "sb": "Solomon Is.", "sc": "Seychelles", "sd": "Sudan", "se": "Sweden", "sg": "Singapore", "sh": "St Helena", "si": "Slovenia", "sk": "Slovakia", "sl": "Sierra Leone", "sm": "San Marino", "sn": "Senegal", "so": "Somalia", "sr": "Suriname", "st": "Sao Tome", "sv": "El Salvador", "sy": "Syria", "sz": "Eswatini",
        "tc": "Turks & Caicos", "td": "Chad", "tf": "Fr. S. Terr.", "tg": "Togo", "th": "Thailand", "tj": "Tajikistan", "tl": "Timor-Leste", "tm": "Turkmenistan", "tn": "Tunisia", "tr": "Turkey", "tt": "Trinidad", "tw": "Taiwan", "tz": "Tanzania",
        "ua": "Ukraine", "ug": "Uganda", "us": "USA", "uy": "Uruguay", "uz": "Uzbekistan",
        "va": "Vatican City", "vc": "St Vincent", "ve": "Venezuela", "vg": "Brit. Virgin Is.", "vi": "U.S. Virgin Is.", "vn": "Vietnam", "vu": "Vanuatu",
        "ws": "Samoa",
        "ye": "Yemen",
        "za": "South Africa", "zm": "Zambia", "zw": "Zimbabwe"
    };
    return names[countryCode.toLowerCase()] || countryCode.toUpperCase();
}

function getFlagEmoji(mmsiStr?: string, countryCode?: string) {
    const mid = mmsiStr ? mmsiStr.substring(0, 3) : '';
    let emoji = '🏳️';
    
    const midToEmoji: { [key: string]: string } = {
        // Europe
        "201": "🇦🇱", "202": "🇦🇩", "203": "🇦🇹", "204": "🇵🇹", "205": "🇧🇪", "206": "🇧🇾", "207": "🇧🇬", "208": "🇻🇦",
        "209": "🇨🇾", "210": "🇨🇾", "212": "🇨🇾", "229": "🇲🇹", "215": "🇲🇹", "248": "🇲🇹", "249": "🇲🇹", "256": "🇲🇹",
        "211": "🇩🇪", "218": "🇩🇪", "213": "🇬🇪", "214": "🇲🇩", "216": "🇦🇲", "219": "🇩🇰", "220": "🇩🇰", "231": "🇫🇴",
        "224": "🇪🇸", "225": "🇪🇸", "226": "🇫🇷", "227": "🇫🇷", "228": "🇫🇷", "230": "🇫🇮", "232": "🇬🇧", "233": "🇬🇧",
        "234": "🇬🇧", "235": "🇬🇧", "236": "🇬🇮", "237": "🇬🇷", "239": "🇬🇷", "240": "🇬🇷", "241": "🇬🇷", "238": "🇭🇷",
        "242": "🇲🇦", "243": "🇭🇺", "244": "🇳🇱", "245": "🇳🇱", "246": "🇳🇱", "247": "🇮🇹", "250": "🇮🇪", "251": "🇮🇸",
        "252": "🇱🇮", "253": "🇱🇺", "254": "🇲🇨", "255": "🇵🇹", "257": "🇳🇴", "258": "🇳🇴", "259": "🇳🇴", "261": "🇵🇱",
        "262": "🇲🇪", "263": "🇵🇹", "264": "🇷🇴", "265": "🇸🇪", "266": "🇸🇪", "267": "🇸🇰", "268": "🇸🇲", "269": "🇨🇭",
        "270": "🇨🇿", "271": "🇹🇷", "272": "🇺🇦", "273": "🇷🇺", "274": "🇲🇰", "275": "🇱🇻", "276": "🇪🇪", "277": "🇱🇹",
        "278": "🇸🇮", "279": "🇷🇸",
        // North / Central America
        "301": "🇦🇮", "303": "🇺🇸", "304": "🇦🇬", "305": "🇦🇬", "306": "🇧🇶", "307": "🇦🇼", "308": "🇧🇸", "309": "🇧🇸",
        "311": "🇧🇸", "310": "🇧🇲", "312": "🇧🇿", "314": "🇧🇧", "316": "🇨🇦", "319": "🇰🇾", "321": "🇨🇷", "323": "🇨🇺",
        "325": "🇩🇲", "327": "🇩🇴", "329": "🇬🇵", "330": "🇬🇩", "331": "🇬🇱", "332": "🇬🇹", "334": "🇭🇳", "336": "🇭🇹",
        "338": "🇺🇸", "366": "🇺🇸", "367": "🇺🇸", "368": "🇺🇸", "369": "🇺🇸", "339": "🇯🇲", "341": "🇰🇳", "343": "🇱🇨",
        "345": "🇲🇽", "347": "🇲🇶", "348": "🇲🇸", "350": "🇳🇮", "351": "🇵🇦", "352": "🇵🇦", "353": "🇵🇦", "354": "🇵🇦",
        "355": "🇵🇦", "356": "🇵🇦", "357": "🇵🇦", "370": "🇵🇦", "371": "🇵🇦", "372": "🇵🇦", "373": "🇵🇦", "358": "🇵🇷",
        "359": "🇸🇻", "361": "🇵🇲", "362": "🇹🇹", "378": "🇻🇬", "379": "🇻🇮",
        // Asia
        "401": "🇦🇫", "405": "🇧🇩", "408": "🇧🇭", "410": "🇧🇹", "412": "🇨🇳", "413": "🇨🇳", "414": "🇨🇳", "416": "🇨🇳",
        "417": "🇨🇰", "418": "🇫🇯", "419": "🇵🇫", "421": "🇮🇳", "423": "🇦🇿", "427": "🇮🇷", "428": "🇮🇶", "431": "🇯🇵",
        "432": "🇯🇵", "434": "🇯🇵", "436": "🇯🇵", "437": "🇰🇷", "438": "🇰🇵", "440": "🇲🇴", "441": "🇲🇾", "443": "🇲🇻",
        "445": "🇲🇺", "447": "🇲🇳", "449": "🇲🇲", "451": "🇳🇵", "453": "🇴🇲", "455": "🇵🇰", "457": "🇵🇭", "459": "🇶🇦",
        "461": "🇸🇦", "463": "🇸🇬", "466": "🇱🇰", "468": "🇸🇾", "470": "🇹🇼", "471": "🇹🇭", "473": "🇹🇱", "475": "🇦🇪",
        "477": "🇻🇳", "478": "🇧🇦",
        // Oceania / SE Asia
        "501": "🇹🇫", "503": "🇦🇺", "506": "🇲🇲", "510": "🇫🇲", "511": "🇵🇼", "512": "🇳🇿", "514": "🇰🇭", 
        "515": "🇰🇭", "518": "🇹🇭", "520": "🇭🇰", "523": "🇱🇦", "525": "🇮🇩", "529": "🇰🇮", "533": "🇲🇾", "536": "🇲🇵", 
        "538": "🇲🇭", "548": "🇵🇭", "553": "🇵🇬", "555": "🇵🇳", "557": "🇸🇧", "559": "🇦🇸", "561": "🇼🇸", "563": "🇸🇬", 
        "564": "🇸🇬", "565": "🇸🇬", "566": "🇸🇬", "567": "🇻🇺", "570": "🇸🇬", "572": "🇹🇺", "574": "🇻🇺", "576": "🇻🇺", 
        "577": "🇻🇺", "578": "🇼🇫",
        // Africa / Atlantic
        "601": "🇿🇦", "603": "🇦🇴", "605": "🇩🇿", "607": "🇹🇫", "608": "🇦🇨", "609": "🇧🇮", "610": "🇧🇯", "611": "🇧🇼", 
        "612": "🇨🇫", "613": "🇨🇲", "615": "🇨🇬", "616": "🇰🇲", "617": "🇨🇻", "618": "🇹🇫", "619": "🇨🇮", "620": "🇨🇬", 
        "621": "🇩🇯", "622": "🇪🇬", "624": "🇪🇹", "625": "🇪🇷", "626": "🇬🇶", "627": "🇬🇦", "629": "🇬🇲", "630": "🇬🇭", 
        "631": "🇬🇳", "632": "🇬🇼", "633": "🇧🇫", "634": "🇰🇪", "635": "🇹🇫", "636": "🇱🇷", "637": "🇱🇷", "642": "🇱🇾", 
        "644": "🇱🇸", "645": "🇲🇺", "647": "🇲🇬", "649": "🇲🇱", "650": "🇲🇿", "654": "🇲🇷", "655": "🇳🇪", "656": "🇳🇬", 
        "657": "🇷🇼", "659": "🇸🇳", "660": "🇸🇨", "661": "🇸🇱", "662": "🇸🇴", "663": "🇸🇩", "664": "🇸🇿", "665": "🇹🇿", 
        "666": "🇹🇬", "667": "🇹🇳", "668": "🇺🇬", "669": "🇨🇩", "670": "🇿🇲", "671": "🇿🇼", "672": "🇳🇦", "674": "🇹🇿", 
        "675": "🇪🇹", "676": "🇸🇴", "677": "🇹🇿", "678": "🇸🇹", "679": "🇨🇮",
        // South America
        "701": "🇦🇷", "710": "🇧🇷", "720": "🇧🇴", "725": "🇨🇱", "730": "🇨🇴", "735": "🇪🇨", "740": "🇫🇰", "745": "🇬🇾",
        "750": "🇵🇾", "755": "🇵🇪", "760": "🇸🇷", "765": "🇺🇾", "770": "🇻🇪"
    };

    if (midToEmoji[mid]) emoji = midToEmoji[mid];
    else if (!mmsiStr) emoji = '🏳️';

    if (countryCode && typeof countryCode === 'string' && countryCode.length === 2 && countryCode !== "00") {
        const code = countryCode.toLowerCase();
        return `<span style="display: inline-flex; align-items: center;">
            <img src="https://flagcdn.com/w80/${code}.png" 
                 alt="${countryCode}" 
                 style="height: 1.4em; width: auto; vertical-align: middle; border-radius: 2px; display: inline-block; box-shadow: 0 1px 3px rgba(0,0,0,0.2);" 
                 onerror="this.style.display='none'; this.nextSibling.style.display='inline';" 
            /><span style="display: none;">${emoji}</span>
        </span>`;
    }
    return emoji;
}

function ShipIcon(sog: number | undefined, cog: number | undefined, mmsi: string, type?: number, shouldFlash?: boolean, shipScale: number = 1.0, circleScale: number = 1.0, isMeteo?: boolean, isAton?: boolean, atonType?: number, isEmergency?: boolean, virtualAton?: boolean, isNew?: boolean, isDark?: boolean) {
    const isMoving = sog !== undefined && sog > 0.5 && cog !== undefined;
    const isAircraft = type === 9;
    const color = getShipColor(mmsi, type, isMeteo, isAton, isEmergency);
    const borderColor = '#000000';
    const strokeDash = virtualAton ? 'stroke-dasharray="2,2"' : '';
    const emergencyClass = isEmergency ? 'svg-emergency-pulse' : '';

    let svg = '';
    const baseHitArea = 24;
    const hitAreaSize = baseHitArea * Math.max(shipScale, circleScale, 1);

    if (isAton) {
        // AtoN Icon: Lighthouse for fixed structures (1, 3, 5-20), Buoy for floating (21-31)
        const isFloating = atonType && atonType >= 21 && atonType <= 31;
        const size = (isFloating ? 24 : 32) * shipScale;
        if (isFloating) {
            // High-quality Buoy Icon
            svg = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" class="${emergencyClass}">
                     <filter id="buoy-shadow" x="-20%" y="-20%" width="140%" height="140%">
                       <feGaussianBlur in="SourceAlpha" stdDeviation="0.5" />
                       <feOffset dx="0.5" dy="0.5" result="offsetblur" />
                       <feComponentTransfer><feFuncA type="linear" slope="0.5"/></feComponentTransfer>
                       <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                     </filter>
                     <path d="M12,4 L15,8 L16,18 L8,18 L9,8 Z" fill="${color}" stroke="${borderColor}" stroke-width="1.2" ${strokeDash} filter="url(#buoy-shadow)" />
                     <path d="M6,18 L18,18" stroke="${borderColor}" stroke-width="2.5" stroke-linecap="round" />
                     <path d="M7,19 L17,19" stroke="${isDark ? '#444' : '#ccc'}" stroke-width="1" stroke-linecap="round" />
                     <circle cx="12" cy="4" r="2.5" fill="yellow" stroke="${borderColor}" stroke-width="0.5" class="svg-pulse" style="filter: drop-shadow(0 0 3px yellow);" />
                   </svg>`;
        } else {
            // High-quality Lighthouse Icon
            svg = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" class="${emergencyClass}">
                     <defs>
                       <linearGradient id="beam" x1="0%" y1="50%" x2="100%" y2="50%">
                         <stop offset="0%" style="stop-color:yellow;stop-opacity:0.6" />
                         <stop offset="100%" style="stop-color:yellow;stop-opacity:0" />
                       </linearGradient>
                     </defs>
                     <path d="M9,22 L15,22 L13,6 L11,6 Z" fill="${color}" stroke="${borderColor}" stroke-width="1.2" ${strokeDash} />
                     <rect x="10" y="4" width="4" height="3" fill="#333" stroke="${borderColor}" stroke-width="0.8" />
                     <path d="M12,2 L12,4" stroke="yellow" stroke-width="1.5" stroke-linecap="round" />
                     <circle cx="12" cy="5.5" r="1.5" fill="white" class="svg-pulse" />
                     <path d="M12,5.5 L20,3 L20,8 Z" fill="url(#beam)" class="svg-rotate-slow" style="transform-origin: 12px 5.5px;" />
                   </svg>`;
        }
    } else if (isMeteo) {
        // Weather Icon (Vindstrut/Wind sock)
        const size = 28 * shipScale;
        svg = `<svg width="${size}" height="${size}" viewBox="0 0 24 24">
                 <path d="M12,2 L12,22 M12,2 L21,5 L21,9 L12,12 M12,5 L19,6.2 L19,7.8 L12,9" fill="${color}" stroke="${borderColor}" stroke-width="1.5" stroke-linecap="round" />
                 <circle cx="12" cy="2" r="1.5" fill="${borderColor}" />
               </svg>`;
    } else if (isAircraft) {
        const rotation = cog !== undefined ? cog : 0;
        const size = 24 * shipScale;
        svg = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="transform: rotate(${rotation}deg);">
                 <circle cx="12" cy="12" r="11" fill="rgba(255, 0, 0, 0.8)" stroke="white" stroke-width="1.5" />
                 <path d="M21,16 L21,14 L14,10 L14,3.5 C14,2.67 13.33,2 12.5,2 C11.67,2 11,2.67 11,3.5 L11,10 L4,14 L4,16 L11,14 L11,19 L9,20.5 L9,22 L12.5,21 L16,22 L16,20.5 L14,19 L14,14 L21,16 Z" fill="white" />
               </svg>`;
    } else if (isMoving) {
        const size = 26 * shipScale;
        svg = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="transform: rotate(${cog}deg);" class="${emergencyClass}">
                 <polygon points="12,2 19,10 17,22 7,22 5,10" fill="${color}" stroke="${borderColor}" stroke-width="1.5"
                           />
               </svg>`;
    } else {
        const size = 16 * circleScale;
        svg = `<svg width="${size}" height="${size}" viewBox="0 0 16 16" class="${emergencyClass}">
                 <circle cx="8" cy="8" r="6" fill="${color}" stroke="${borderColor}" stroke-width="1.5"
                          />
               </svg>`;
    }

    return L.divIcon({
        html: `<div class="ship-custom-icon" style="display:flex; justify-content:center; align-items:center; width: 100%; height: 100%; position: relative;">
                 ${shouldFlash ? `<div class="ship-update-flash"></div>` : ''}
                 ${isNew ? `<div class="new-vessel-ping"></div>` : ''}
                 <div style="z-index: 1; display:flex;">${svg}</div>
               </div>`,
        className: 'ship-custom-icon-container',
        iconSize: [hitAreaSize, hitAreaSize],
        iconAnchor: [hitAreaSize / 2, hitAreaSize / 2],
        mmsi: mmsi
    } as any);
}

// Injected css
const extraStyles = `
/* Custom Marker Cluster Styles */
.marker-cluster-small {
    background-color: rgba(0, 229, 255, 0.4);
}
.marker-cluster-small div {
    background-color: rgba(0, 229, 255, 0.8);
    color: #fff;
    font-weight: bold;
}
.marker-cluster-medium {
    background-color: rgba(255, 171, 64, 0.4);
}
.marker-cluster-medium div {
    background-color: rgba(255, 171, 64, 0.8);
    color: #fff;
    font-weight: bold;
}
.marker-cluster-large {
    background-color: rgba(255, 82, 82, 0.4);
}
.marker-cluster-large div {
    background-color: rgba(255, 82, 82, 0.8);
    color: #fff;
    font-weight: bold;
}
.marker-cluster {
    background-clip: padding-box;
    border-radius: 20px;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    transition: all 0.3s ease-in-out;
}
.marker-cluster div {
    width: 30px;
    height: 30px;
    margin-left: 5px;
    margin-top: 5px;
    text-align: center;
    border-radius: 15px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
}
.leaflet-cluster-anim .marker-cluster {
    transition: transform 0.2s ease-out, opacity 0.2s ease-in;
}
.cluster-update-pulse {
    animation: cluster-pulse-anim 0.8s ease-out;
}
@keyframes cluster-pulse-anim {
    0% { box-shadow: 0 0 0px #00e5ff; border: 0px solid #00e5ff; }
    50% { box-shadow: 0 0 20px #00e5ff; border: 2px solid #00e5ff; }
    100% { box-shadow: 0 0 0px #00e5ff; border: 0px solid #00e5ff; }
}

.ship-custom-icon-container { background: transparent; border: none; }
.ship-custom-icon svg { filter: drop-shadow(0px 2px 3px rgba(0,0,0,0.4)); }

/* New Vessel Ping - Flash every 10s */
.new-vessel-ping {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 24px;
    height: 24px;
    margin-top: -12px;
    margin-left: -12px;
    border-radius: 50%;
    border: 3px solid #ffea00;
    box-sizing: border-box;
    animation: new-vessel-ping-anim 10s infinite;
    pointer-events: none;
    z-index: -1;
}

@keyframes new-vessel-ping-anim {
    0% { transform: scale(0.5); opacity: 0; border-width: 6px; }
    2% { transform: scale(0.5); opacity: 1; border-width: 6px; }
    10% { transform: scale(3.5); opacity: 0; border-width: 1px; }
    100% { transform: scale(3.5); opacity: 0; border-width: 1px; }
}

.ship-name-label {
    background: rgba(15, 15, 26, 0.8) !important;
    border: none !important;
    border-radius: 4px !important;
    box-shadow: 0 1px 3px rgba(0,0,0,0.5) !important;
    color: #fff !important;
    padding: 2px 6px !important;
    pointer-events: none !important;
}

/* Vessel Database Table Styles - Premium Revamp */
.db-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    margin-top: 5px;
}
.db-table th {
    text-align: left;
    padding: 14px 15px;
    background: linear-gradient(to bottom, rgba(30, 30, 45, 0.8), rgba(20, 20, 30, 0.9));
    color: rgba(255, 255, 255, 0.8);
    font-weight: 800;
    text-transform: uppercase;
    font-size: 0.65rem;
    letter-spacing: 1.5px;
    position: sticky;
    top: 0;
    z-index: 10;
    cursor: pointer;
    user-select: none;
    transition: all 0.2s;
    border-bottom: 1px solid rgba(68, 170, 255, 0.2);
}
.db-table th:hover {
    background: linear-gradient(to bottom, rgba(45, 45, 65, 0.9), rgba(30, 30, 45, 1));
    color: #44aaff;
}
.db-table td {
    padding: 12px 15px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.85rem;
}
.db-table tr:nth-child(even) {
    background: rgba(68, 170, 255, 0.05);
}
.db-table tr:hover {
    background: rgba(68, 170, 255, 0.12);
    backdrop-filter: blur(4px);
}
.light-theme .db-table th {
    background: linear-gradient(to bottom, #f1f5f9, #e2e8f0);
    color: #475569;
    border-bottom-color: #cbd5e1;
}
.light-theme .db-table tr:nth-child(even) {
    background: rgba(0, 102, 204, 0.06);
}
.light-theme .db-table td {
    color: #1e293b;
    border-bottom-color: #f1f5f9;
}
.db-sort-icon {
    display: inline-flex;
    margin-left: 6px;
    vertical-align: middle;
    transition: transform 0.2s;
}

/* Premium Badges */
.ship-badge {
    padding: 4px 10px;
    border-radius: 100px;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: inline-block;
}
.badge-type { background: rgba(68, 170, 255, 0.15); color: #44aaff; border: 1px solid rgba(68, 170, 255, 0.3); }
.badge-obs { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
.badge-mmsi { font-family: 'JetBrains Mono', monospace; background: rgba(255, 255, 255, 0.05); color: rgba(255,255,255,0.6); border: 1px solid rgba(255,255,255,0.1); }

.light-theme .badge-type { background: rgba(68, 170, 255, 0.1); color: #0066cc; border-color: rgba(68, 170, 255, 0.2); }
.light-theme .badge-obs { background: rgba(0, 153, 51, 0.1); color: #008822; border-color: rgba(0, 153, 51, 0.2); }
.light-theme .badge-mmsi { background: rgba(0, 0, 0, 0.05); color: rgba(0, 0, 0, 0.5); border-color: rgba(0, 0, 0, 0.1); }
.badge-mmsi { font-family: 'JetBrains Mono', monospace; background: rgba(255, 255, 255, 0.05); color: rgba(255,255,255,0.6); border: 1px solid rgba(255,255,255,0.1); }

.db-pagination-info {
    padding: 15px 30px;
    border-top: 1px solid rgba(255,255,255,0.05);
    color: rgba(255,255,255,0.5);
    font-size: 0.75rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

/* Detailed Custom Popup Styles */
.custom-detailed-popup .leaflet-popup-content-wrapper {
    padding: 0;
    overflow: hidden;
    border-radius: 8px;
    background: var(--bg-card);
    color: var(--text-main);
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
}
.custom-detailed-popup .leaflet-popup-content {
    margin: 0;
    width: 460px !important;
}
.custom-detailed-popup .leaflet-popup-tip {
    background: var(--bg-card);
}
.styled-button {
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid var(--border-color);
    background: transparent;
    color: var(--text-main);
}
.styled-button.primary {
    background: #0066cc;
    color: white;
    border: none;
}
.ship-update-flash {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 24px;
    height: 24px;
    margin-top: -12px;
    margin-left: -12px;
    border-radius: 50%;
    border: 2px solid #00e5ff;
    box-sizing: border-box;
    animation: radar-ping 0.8s cubic-bezier(0, 0, 0.2, 1) forwards;
    pointer-events: none;
    z-index: 0;
}

@keyframes radar-ping {
    0% { transform: scale(0.5); opacity: 1; border-width: 4px; }
    100% { transform: scale(3.5); opacity: 0; border-width: 1px; }
}

.blink-source {
    animation: blink-anim 0.4s ease-in-out;
}

@keyframes blink-anim {
    0% { transform: scale(1); filter: brightness(1) drop-shadow(0 0 0px #10b981); }
    50% { transform: scale(1.3); filter: brightness(2) drop-shadow(0 0 8px #10b981); }
    100% { transform: scale(1); filter: brightness(1) drop-shadow(0 0 0px #10b981); }
}

@keyframes slideUpFade {
    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

@keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
}

.ship-flash {
    animation: side-flash-pop 0.8s ease-out;
}
@keyframes side-flash-pop {
    0% { background-color: rgba(255, 255, 0, 0.6) !important; }
    100% { background-color: transparent; }
}
.svg-pulse {
    animation: svg-pulse-anim 2s infinite ease-in-out;
}
@keyframes svg-pulse-anim {
    0% { opacity: 0.5; stroke-width: 1px; }
    50% { opacity: 1; stroke-width: 3px; }
    100% { opacity: 0.5; stroke-width: 1px; }
}
.svg-emergency-pulse {
    animation: svg-emergency-pulse-anim 1s infinite alternate;
}
@keyframes svg-emergency-pulse-anim {
    from { filter: drop-shadow(0 0 2px #ff0000) drop-shadow(0 0 5px #ff0000); }
    to { filter: drop-shadow(0 0 8px #ff0000) drop-shadow(0 0 15px #ff0000); }
}
@keyframes emergency-flash {
    from { background-color: #ff0000; }
    to { background-color: #880000; }
}

/* Settings Modal Overhaul - REFINED */
.settings-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(15px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.3s ease-out;
}

.settings-modal {
    width: 1400px;
    height: 900px;
    max-width: 98vw;
    max-height: 95vh;
    background: #0f0f1a;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 24px;
    display: flex;
    overflow: hidden;
    box-shadow: 0 40px 80px -12px rgba(0, 0, 0, 0.9), 0 0 30px rgba(0, 240, 255, 0.15);
    animation: modalSlideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    color: #e0e0e0;
}

.settings-sidebar {
    width: 320px;
    background: #0a0a14;
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    padding: 28px 0;
}

.settings-sidebar-header {
    padding: 0 30px 20px 30px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    margin-bottom: 18px;
}

.settings-sidebar-title {
    font-size: 1.35rem;
    font-weight: 900;
    color: #44aaff;
    letter-spacing: -0.5px;
}

.settings-tab-sidebar-btn {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 30px;
    width: 100%;
    border: none;
    background: transparent;
    color: #8892b0;
    font-weight: 700;
    font-size: 0.95rem;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
}

.settings-tab-sidebar-btn:hover {
    background: rgba(255, 255, 255, 0.04);
    color: #fff;
}

.settings-tab-sidebar-btn.active {
    background: rgba(0, 240, 255, 0.1);
    color: #44aaff;
    border-right: 5px solid #44aaff;
}

.settings-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: #0f0f1a;
    overflow: hidden;
}

.settings-header {
    padding: 28px 42px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.01);
}

.settings-header-title {
    font-size: 1.85rem;
    font-weight: 900;
    margin: 0;
    color: #fff;
    letter-spacing: -1px;
}

.settings-header-desc {
    font-size: 0.95rem;
    color: #8892b0;
    margin-top: 8px;
}

.settings-scroll-area {
    flex: 1;
    padding: 28px 42px;
    overflow-y: auto;
}

.settings-card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 20px;
    padding: 24px;
    margin-bottom: 28px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
}

.settings-card-title {
    font-size: 0.75rem;
    font-weight: 900;
    text-transform: uppercase;
    color: #44aaff;
    letter-spacing: 2.5px;
    margin-bottom: 30px;
    display: flex;
    align-items: center;
    gap: 12px;
}

.settings-grid { display: grid; grid-template-columns: 1fr; gap: 30px; }
.settings-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }

.settings-footer {
    padding: 20px 42px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    justify-content: flex-end;
    gap: 18px;
    background: rgba(0, 0, 0, 0.3);
}

.btn-cancel-premium {
    background: transparent;
    border: 1.5px solid rgba(255, 255, 255, 0.2);
    color: #fff;
    padding: 12px 30px;
    border-radius: 10px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
}

.btn-cancel-premium:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.4);
}

.form-group-premium {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    padding-bottom: 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.form-group-premium:last-child { border-bottom: none; padding-bottom: 0; }
.form-group-premium.vertical { 
    flex-direction: column; 
    align-items: flex-start; 
    gap: 10px; 
}

.form-group-grid-item {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 0;
    border: none;
}

.label-desc-container {
    min-height: 40px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    width: 100%;
}

.form-group-premium label { font-size: 0.95rem; font-weight: 700; color: #fff; }
.form-group-premium .description { font-size: 0.75rem; color: #8892b0; margin-top: 6px; max-width: 600px; }

.input-premium, .select-premium {
    width: 300px;
    padding: 10px 16px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    font-size: 0.9rem;
    transition: all 0.2s;
}

/* Light Theme Overrides */
.settings-modal.light-theme { background: #fff; color: #1a1a2e; border-color: #e2e8f0; box-shadow: 0 40px 80px -12px rgba(0,0,0,0.1); }
.settings-modal.light-theme .settings-sidebar { background: #f8fafc; border-right-color: #e2e8f0; }
.settings-modal.light-theme .settings-tab-sidebar-btn { color: #64748b; }
.settings-modal.light-theme .settings-tab-sidebar-btn:hover { background: #f1f5f9; color: #0f172a; }
.settings-modal.light-theme .settings-tab-sidebar-btn.active { background: #e0f2fe; color: #0284c7; border-right-color: #0284c7; }
.settings-modal.light-theme .settings-main { background: #fff; }
.settings-modal.light-theme .settings-header { background: #fcfdfe; border-bottom-color: #e2e8f0; }
.settings-modal.light-theme .settings-header-title { color: #0f172a; }
.settings-modal.light-theme .settings-card { background: #fdfdfe; border-color: #cbd5e1; box-shadow: 0 4px 15px rgba(0,0,0,0.08); }
.settings-modal.light-theme .input-premium, .settings-modal.light-theme .select-premium { background: #ffffff; border-color: #94a3b8; color: #0f172a; }
.settings-modal.light-theme .form-group-premium label { color: #0f172a; }
.settings-modal.light-theme .settings-header-desc, .settings-modal.light-theme .description { color: #475569; }
.settings-modal.light-theme .settings-footer { background: #f1f5f9; border-top-color: #cbd5e1; }
.settings-modal.light-theme .btn-cancel-premium { color: #334155; border-color: #94a3b8; }
.settings-modal.light-theme .btn-cancel-premium:hover { background: #e2e8f0; border-color: #64748b; }

/* Toggle Switch */
.switch { position: relative; display: inline-block; width: 54px; height: 30px; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider {
    position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
    background-color: #222; transition: .4s; border-radius: 30px;
}
.light-theme .slider { background-color: #cbd5e1; }
.slider:before {
    position: absolute; content: ""; height: 24px; width: 24px; left: 3px; bottom: 3px;
    background-color: white; transition: .4s; border-radius: 50%;
}
input:checked + .slider { background-color: #44aaff; }
.light-theme input:checked + .slider { background-color: #0284c7; }
input:checked + .slider:before { transform: translateX(24px); }

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes modalSlideUp { from { transform: translateY(60px) scale(0.97); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }

@keyframes emergency-flash-alt {
    from { background: #ff0000; box-shadow: 0 0 5px #ff0000; }
    to { background: #990000; box-shadow: 0 0 20px #ff0000; }
}
@keyframes pulse-angry-red {
    0% { background: #ff0000; transform: scale(1); box-shadow: 0 0 0px #ff0000; }
    50% { background: #ff5555; transform: scale(1.05); box-shadow: 0 0 15px #ff0000; }
    100% { background: #ff0000; transform: scale(1); box-shadow: 0 0 0px #ff0000; }
}
`;

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const toRad = (x: number) => x * Math.PI / 180;
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
    const toRad = (x: number) => x * Math.PI / 180;
    const toDeg = (x: number) => x * 180 / Math.PI;

    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
        Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    let brng = toDeg(Math.atan2(y, x));
    return (brng + 360) % 360;
}

// Unit Helpers
function formatSpeed(knots: number | undefined, units: string) {
    if (knots === undefined || knots === null) return '--';
    if (units === 'metric') {
        return `${(knots * 1.852).toFixed(1)} km/h`;
    }
    return `${knots.toFixed(1)} kn`;
}

function formatDistance(km: number | undefined, units: string) {
    if (km === undefined || km === null) return '--';
    if (units === 'metric') {
        return `${km.toFixed(1)} km`;
    }
    return `${(km / 1.852).toFixed(1)} nm`;
}

function getTimeAgo(timestamp: number) {
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Now';
    if (diffMins < 60) return `${diffMins}min`;
    const diffHours = Math.floor(diffMins / 60);
    const remainingMins = diffMins % 60;
    if (diffHours < 24) return `${diffHours}h ${remainingMins}m`;
    return `${Math.floor(diffHours / 24)}d`;
}


function calculateDestinationPoint(lat: number, lon: number, distance: number, bearing: number) {
    const toRad = (x: number) => x * Math.PI / 180;
    const toDeg = (x: number) => x * 180 / Math.PI;
    const R = 6371; // km

    const d = distance / R;
    const brng = toRad(bearing);
    const lat1 = toRad(lat);
    const lon1 = toRad(lon);

    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) +
        Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
    const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
        Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));

    return [toDeg(lat2), toDeg(lon2)];
}

const RangeRings = React.memo(({ originLat, originLon, isDark }: { originLat: number, originLon: number, isDark: boolean }) => {
    const rings = [5, 10, 15, 20, 30, 40, 50, 60];
    const ringColor = isDark ? '#44aaff' : '#0066cc';
    
    return (
        <>
            {rings.map(nm => (
                <Circle 
                    key={`ring-${nm}`}
                    center={[originLat, originLon]} 
                    radius={nm * 1852} 
                    pathOptions={{ color: ringColor, weight: 1.5, fill: false, opacity: 0.4 }}
                    interactive={false}
                />
            ))}
            {rings.flatMap(nm => [0, 180].map(bearing => {
                const labelPos = calculateDestinationPoint(originLat, originLon, nm * 1.852, bearing);
                return (
                    <Marker 
                        key={`label-${nm}-${bearing}`}
                        position={labelPos as L.LatLngExpression}
                        interactive={false}
                        icon={L.divIcon({
                            className: '',
                            html: `<div style="color: ${ringColor}; font-size: 11px; font-weight: 800; white-space: nowrap; transform: translate(-50%, -50%); text-shadow: -1px -1px 0 ${isDark ? '#000' : '#fff'}, 1px -1px 0 ${isDark ? '#000' : '#fff'}, -1px 1px 0 ${isDark ? '#000' : '#fff'}, 1px 1px 0 ${isDark ? '#000' : '#fff'};">${nm}nm</div>`,
                            iconSize: [0, 0],
                            iconAnchor: [0, 0]
                        })}
                    />
                );
            }))}
        </>
    );
});

function ChartCard({ title, children, colors }: any) {
    return (
        <div style={{ 
            background: colors.bgCard, 
            borderRadius: '16px', 
            padding: '24px', 
            border: `1px solid ${colors.border}`, 
            display: 'flex', 
            flexDirection: 'column', 
            boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
            height: '100%',
            overflow: 'hidden'
        }}>
            <h3 style={{ 
                margin: '0 0 20px 0', 
                fontSize: '1.1rem', 
                fontWeight: 800, 
                color: colors.textMain,
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
            }}>
                {title}
            </h3>
            <div style={{ width: '100%', flex: 1, position: 'relative', minHeight: '250px' }}>
                {children}
            </div>
        </div>
    );
}


function StatisticsModal({ isOpen, onClose, colors }: any) {
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [timeRange, setTimeRange] = useState<'7d' | '30d' | '1y'>('30d');
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            const isDev = window.location.port === '5173';
            const fetchPath = isDev ? `http://127.0.0.1:8080/api/statistics?date=${selectedDate}` : `/api/statistics?date=${selectedDate}`;
            fetch(fetchPath)
                .then(r => r.json())
                .then(data => {
                    setStats(data);
                    setLoading(false);
                })
                .catch(err => {
                    console.error("Failed to fetch stats", err);
                    setLoading(false);
                });
        }
    }, [isOpen, selectedDate]);

    if (!isOpen) return null;

    const allHistory = stats?.history_30d || [];
    const historyFiltered = timeRange === '7d' 
        ? allHistory.slice(-7) 
        : timeRange === '1y' 
            ? allHistory 
            : allHistory.slice(-30);
            
    const hourlyBreakdown = stats?.hourly_breakdown || [];
    const typeBreakdown = stats?.type_breakdown || [];

    // Summary Card colors
    const chartColors = [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', 
        '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9', '#ec4899'
    ];

    // 1. History (Messages & Vessels)
    const historyData = {
        labels: historyFiltered.map((h: any) => h.date.split('-').slice(1).join('/')),
        datasets: [
            {
                label: 'Vessels',
                data: historyFiltered.map((h: any) => h.unique_ships),
                backgroundColor: '#36A2EB',
                borderRadius: 4,
                yAxisID: 'y',
            },
            {
                label: 'Messages',
                data: historyFiltered.map((h: any) => h.total_messages),
                backgroundColor: '#4BC0C088',
                borderRadius: 4,
                yAxisID: 'y1',
            }
        ]
    };

    const historyOptions: any = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { 
            legend: { 
                position: 'top' as const,
                labels: { color: colors.textMain, usePointStyle: true, boxWidth: 8 }
            } 
        },
        scales: { 
            y: { 
                type: 'linear' as const, display: true, position: 'left' as const,
                title: { display: true, text: 'Vessels', color: colors.textMuted },
                grid: { color: colors.border }, ticks: { color: colors.textMuted } 
            },
            y1: { 
                type: 'linear' as const, display: true, position: 'right' as const,
                title: { display: true, text: 'Messages', color: colors.textMuted },
                grid: { drawOnChartArea: false }, ticks: { color: colors.textMuted } 
            },
            x: { grid: { display: false }, ticks: { color: colors.textMuted } } 
        }
    };

    // 2. Ship Type Breakdown (Doughnut)
    const typeData = {
        labels: typeBreakdown.map((t: any) => t.label),
        datasets: [{
            data: typeBreakdown.map((t: any) => t.count),
            backgroundColor: chartColors,
            borderWidth: 0,
            hoverOffset: 15
        }]
    };

    const doughnutOptions: any = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
            legend: {
                position: 'right' as const,
                labels: {
                    color: colors.textMain,
                    padding: 20,
                    font: { size: 11 },
                    usePointStyle: true
                }
            }
        }
    };

    // 3. Hourly Messages (Area Chart)
    const hourlyData = {
        labels: hourlyBreakdown.map((h: any) => `${h.hour}:00`),
        datasets: [{
            label: 'Messages',
            data: hourlyBreakdown.map((h: any) => h.count),
            borderColor: '#0ea5e9',
            backgroundColor: 'rgba(14, 165, 233, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: '#0ea5e9'
        }]
    };

    const hourlyOptions: any = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { 
            y: { beginAtZero: true, grid: { color: colors.border }, ticks: { color: colors.textMuted } },
            x: { grid: { display: false }, ticks: { color: colors.textMuted } }
        }
    };
    
    // 4. Station Range (Area Chart)
    const rangeData = {
        labels: historyFiltered.map((h: any) => h.date.split('-').slice(1).join('/')),
        datasets: [{
            label: 'Station Max Range (nm)',
            data: historyFiltered.map((h: any) => (Number(h.max_range_km || 0) * 0.539957).toFixed(1)),
            borderColor: '#ff00ff',
            backgroundColor: 'rgba(255, 0, 255, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: '#ff00ff'
        }]
    };

    const rangeOptions: any = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { 
            y: { 
                beginAtZero: true, 
                title: { display: true, text: 'Nautical Miles (nm)', color: colors.textMuted },
                grid: { color: colors.border }, ticks: { color: colors.textMuted } 
            },
            x: { grid: { display: false }, ticks: { color: colors.textMuted } }
        }
    };

    return (
        <div className="settings-modal-overlay" onClick={onClose} style={{ zIndex: 3000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
            <div className="settings-modal" onClick={e => e.stopPropagation()} style={{ 
                width: '95vw', 
                height: '92vh',
                maxWidth: '1400px',
                padding: '0',
                display: 'flex',
                flexDirection: 'column',
                background: colors.bgMain === '#ffffff' ? '#f8fafc' : colors.bgMain, // Light blue-ish background for depth
                border: `1px solid ${colors.border}`,
                borderRadius: '24px',
                overflow: 'hidden'
            }}>
                {/* Header Area */}
                <div style={{ padding: '30px 40px', background: colors.bgCard, borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 900, color: colors.textMain, letterSpacing: '-0.5px' }}>Statistics & Analysis</h1>
                        <div style={{ color: colors.textMuted, fontSize: '1rem', marginTop: '4px' }}>Analyze historical data and system performance metrics.</div>
                    </div>
                    
                    <button onClick={onClose} style={{ background: colors.bgMain, border: `1px solid ${colors.border}`, cursor: 'pointer', padding: '12px', borderRadius: '12px', color: colors.textMuted, transition: 'all 0.2s' }}>
                        <X size={24} />
                    </button>
                </div>
                
                {/* Dashboard Scroll View */}
                <div style={{ flex: 1, padding: '30px 40px', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                        
                        {/* Controls Row */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '20px' }}>
                            {/* Time Range Selector */}
                            <div style={{ background: colors.bgCard, padding: '24px', borderRadius: '16px', border: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: colors.textMain }}>History Range</h2>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: colors.textMuted }}>For trending charts</p>
                                </div>
                                <div style={{ display: 'flex', background: colors.bgApp, borderRadius: '8px', padding: '4px' }}>
                                    {[ {v:'7d', l:'Week'}, {v:'30d', l:'Month'}, {v:'1y', l:'Year'} ].map(t => (
                                        <button 
                                            key={t.v}
                                            onClick={() => setTimeRange(t.v as any)}
                                            style={{
                                                background: timeRange === t.v ? 'rgba(68,170,255,0.2)' : 'transparent',
                                                color: timeRange === t.v ? '#44aaff' : colors.textMuted,
                                                border: 'none', padding: '8px 16px', borderRadius: '6px',
                                                cursor: 'pointer', fontWeight: 700, transition: 'all 0.2s'
                                            }}
                                        >
                                            {t.l}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Select Date Card */}
                            <div style={{ background: colors.bgCard, padding: '24px', borderRadius: '16px', border: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: colors.textMain }}>Select Date</h2>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: colors.textMuted }}>Viewing data for {selectedDate}</p>
                                </div>
                                <div style={{ position: 'relative', width: '220px' }}>
                                    <Calendar size={18} style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', color: colors.textMuted, pointerEvents: 'none' }} />
                                    <input 
                                        type="date" 
                                        value={selectedDate}
                                        onChange={(e) => setSelectedDate(e.target.value)}
                                        style={{ 
                                            width: '100%',
                                            padding: '12px 45px 12px 15px', borderRadius: '12px',
                                            border: `1px solid ${colors.border}`, fontSize: '1rem', outline: 'none', 
                                            color: colors.textMain, background: colors.bgMain,
                                            cursor: 'pointer',
                                            fontWeight: 600
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '100px 0', flex: 1 }}>
                                <div className="spinner"></div>
                                <div style={{ marginTop: '20px', color: colors.textMuted, fontSize: '1.1rem' }}>Aggregating data...</div>
                            </div>
                        ) : (
                            <>
                                {/* Middle Row Grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr', gap: '30px' }}>
                                    <ChartCard title="Messages & Vessels History" colors={colors}>
                                        <Bar data={historyData} options={historyOptions} />
                                    </ChartCard>
                                    
                                    <ChartCard title="Ship types (Total)" colors={colors}>
                                        {typeBreakdown.length > 0 ? (
                                            <Doughnut data={typeData} options={doughnutOptions} />
                                        ) : (
                                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.textMuted }}>
                                                No data available
                                            </div>
                                        )}
                                    </ChartCard>
                                </div>

                                {/* Bottom Row Wide Charts */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', minHeight: '350px' }}>
                                    <ChartCard title="Station Range History (nm)" colors={colors} style={{ height: '350px' }}>
                                        <Line data={rangeData} options={rangeOptions} />
                                    </ChartCard>
                                    
                                    <ChartCard title="Messages per Hour (Selected Day)" colors={colors} style={{ height: '350px' }}>
                                        <Line data={hourlyData} options={hourlyOptions} />
                                    </ChartCard>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}


function Accordion({ title, children, isOpen, setIsOpen, colors }: any) {
    return (
        <div style={{ borderBottom: `1px solid ${colors.border}` }}>
            <div 
                onClick={setIsOpen} 
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: colors.bgSidebar, cursor: 'pointer' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#44aaff', fontWeight: 800, fontSize: '0.85rem' }}>
                    {title}
                </div>
                {isOpen ? <ChevronUp size={18} color="#44aaff" /> : <ChevronDown size={18} color="#44aaff" />}
            </div>
            {isOpen && (
                <div style={{ padding: '0', background: colors.bgCard }}>
                    {children}
                </div>
            )}
        </div>
    );
}

function AccordionRow({ label, value, labelIcon, colors, onDoubleClick }: any) {
    return (
        <div 
            onDoubleClick={onDoubleClick}
            style={{ display: 'flex', flexDirection: 'column', padding: '10px 16px', borderBottom: `1px solid ${colors.border}88`, cursor: onDoubleClick ? 'cell' : 'default' }}
        >
            <span style={{ fontSize: '0.65rem', color: colors.textMuted, fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                {labelIcon} {label}
            </span>
            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: colors.textMain }}>{value}</span>
        </div>
    );
}

function VesselDetailSidebar({ isOpen, onClose, ship, mqttSettings, colors }: any) {
    const sidebarRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [localImage, setLocalImage] = useState<string | null>(null);
    const [showSavePrompt, setShowSavePrompt] = useState(false);

    const mmsiStr = ship ? String(ship.mmsi) : '';

    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
        const saved = localStorage.getItem('naviscore_expanded_sections');
        return saved ? JSON.parse(saved) : { "Navigation & Signal": true };
    });

    useEffect(() => {
        localStorage.setItem('naviscore_expanded_sections', JSON.stringify(expandedSections));
    }, [expandedSections]);

    const toggleSection = (title: string) => {
        setExpandedSections(prev => ({ ...prev, [title]: !prev[title] }));
    };

    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState<any>({});

    useEffect(() => {
        setLocalImage(ship ? ship.imageUrl : null);
        setEditData(ship ? { ...ship } : {});
    }, [ship]);

    const handleSave = async () => {
        try {
            const isDev = window.location.port === '5173';
            const url = isDev ? `http://127.0.0.1:8080/api/ships/${mmsiStr}/details` : `/api/ships/${mmsiStr}/details`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editData)
            });
            if (res.ok) {
                setIsEditing(false);
                Object.assign(ship, editData);
            } else {
                alert("Failed to save ship details");
            }
        } catch (err) {
            console.error(err);
            alert("Error saving ship details");
        }
    };

    // Click outside logic
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isEditing && sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
                // Determine if data is dirty
                const isDirty = JSON.stringify(editData) !== JSON.stringify(ship);
                if (isDirty) {
                    setShowSavePrompt(true);
                } else {
                    setIsEditing(false);
                }
            }
        };

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isEditing, editData, ship]);

    if (!isOpen || !ship) return null;

    return (
        <>
        {isEditing && (
            <div 
                style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: 1100, background: 'transparent'
                }}
                onClick={(e) => {
                    e.stopPropagation();
                    const isDirty = JSON.stringify(editData) !== JSON.stringify(ship);
                    if (isDirty) {
                        setShowSavePrompt(true);
                    } else {
                        setIsEditing(false);
                    }
                }}
            />
        )}
        <div 
            ref={sidebarRef}
            style={{ 
            position: 'fixed', right: 0, top: 0, bottom: 0, width: '420px', 
            background: colors.bgMain, zIndex: 1101, display: 'flex', flexDirection: 'column', 
            boxShadow: '-10px 0 30px rgba(0,0,0,0.15)', overflowY: 'auto',
            transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
            transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
            borderLeft: `1px solid ${colors.border}`
        }}>
            {/* Save Confirmation Overlay */}
            {showSavePrompt && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                    zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '20px', textAlign: 'center'
                }}>
                    <div style={{ background: colors.bgCard, padding: '25px', borderRadius: '16px', border: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '300px' }}>
                        <div style={{ color: colors.textMain, fontWeight: 800, fontSize: '1.1rem' }}>Spara ändringar?</div>
                        <div style={{ color: colors.textMuted, fontSize: '0.9rem' }}>Du har gjort ändringar i fartygets uppgifter. Vill du spara dem?</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <button 
                                onClick={async () => {
                                    await handleSave();
                                    setShowSavePrompt(false);
                                }}
                                style={{ background: '#10b981', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: 800, cursor: 'pointer' }}
                            >
                                Spara och stäng
                            </button>
                            <button 
                                onClick={() => {
                                    setIsEditing(false);
                                    setEditData({ ...ship });
                                    setShowSavePrompt(false);
                                }}
                                style={{ background: 'transparent', border: `1px solid ${colors.border}`, color: colors.textMuted, padding: '10px', borderRadius: '8px', cursor: 'pointer' }}
                            >
                                Ignorera ändringar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Header Row */}
            <div style={{ 
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                padding: '16px 20px', borderBottom: `1px solid ${colors.border}`, 
                background: colors.bgCard, position: 'sticky', top: 0, zIndex: 10
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button 
                        onClick={onClose}
                        className="hover-opacity"
                        style={{ 
                            background: colors.bgMain, border: `1px solid ${colors.border}`, 
                            cursor: 'pointer', color: colors.textMuted, 
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: '32px', height: '32px', borderRadius: '8px'
                        }}
                    >
                        <X size={18} />
                    </button>
                    <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: '#44aaff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {ship.name || 'UNKNOWN'}
                    </h2>
                    {(() => {
                        const dist = haversineDistance(parseFloat(mqttSettings.origin_lat), parseFloat(mqttSettings.origin_lon), ship.lat, ship.lon);
                        if (dist > 185.2) {
                            return (
                                <div style={{
                                    background: 'linear-gradient(135deg, #ff00ff 0%, #aa00ff 100%)',
                                    color: 'white',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '0.65rem',
                                    fontWeight: 900,
                                    letterSpacing: '1px',
                                    boxShadow: '0 0 10px rgba(255, 0, 255, 0.4)'
                                }}>
                                    TROPO DUCTING
                                </div>
                            );
                        } else if (dist > 74.08 && dist < 148.16) {
                            return (
                                <div style={{
                                    background: 'linear-gradient(135deg, #00d2ff 0%, #3a7bd5 100%)',
                                    color: 'white',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '0.65rem',
                                    fontWeight: 900,
                                    letterSpacing: '1px',
                                    boxShadow: '0 0 10px rgba(0, 210, 255, 0.4)'
                                }}>
                                    ENHANCED RANGE
                                </div>
                            );
                        }
                        return null;
                    })()}
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                    </div>
                    <span style={{ fontSize: '1.8rem', lineHeight: 1 }} dangerouslySetInnerHTML={{ __html: getFlagEmoji(mmsiStr, ship.country_code) }} />
                </div>
            </div>

            {/* Destination Row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 20px', borderBottom: `1px solid ${colors.border}`, background: colors.bgSidebar }}>
                <div 
                    onDoubleClick={() => !isEditing && setIsEditing(true)}
                    style={{ cursor: isEditing ? 'default' : 'cell' }}
                >
                    <div style={{ fontSize: '0.65rem', color: colors.textMuted, fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Destination</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, color: colors.textMain, fontSize: '0.95rem' }}>
                        {isEditing ? (
                            <input 
                                type="text" 
                                value={editData.destination || ''} 
                                onChange={e => setEditData({...editData, destination: e.target.value})} 
                                style={{ width: '100%', background: 'transparent', border: 'none', color: '#44aaff', fontWeight: 800, fontSize: '0.95rem', outline: 'none' }} 
                            />
                        ) : (ship.destination || '--')}
                    </div>
                </div>
                <div 
                    onDoubleClick={() => !isEditing && setIsEditing(true)}
                    style={{ textAlign: 'right', cursor: isEditing ? 'default' : 'cell' }}
                >
                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: colors.textMain }}>
                        {isEditing ? (
                            <input 
                                type="text" 
                                value={editData.eta || ''} 
                                onChange={e => setEditData({...editData, eta: e.target.value})} 
                                style={{ width: '80px', background: 'transparent', border: 'none', color: '#44aaff', fontWeight: 800, textAlign: 'right', outline: 'none' }} 
                            />
                        ) : (ship.eta || 'N/A')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: colors.textMuted, fontWeight: 700 }}>{getTimeAgo(ship.timestamp)}</div>
                </div>
            </div>

            {/* Image Section */}
            <div style={{ position: 'relative', width: '100%', height: '260px', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    style={{ display: 'none' }} 
                    accept="image/jpeg, image/png, image/webp"
                    onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploading(true);
                        const formData = new FormData();
                        formData.append("file", file);
                        try {
                            const isDev = window.location.port === '5173';
                            const uploadUrl = isDev ? `http://127.0.0.1:8080/api/ships/${mmsiStr}/image` : `/api/ships/${mmsiStr}/image`;
                            const res = await fetch(uploadUrl, { method: 'POST', body: formData });
                            if (res.ok) {
                                const data = await res.json();
                                const newUrl = `${data.image_url}?t=${Date.now()}`;
                                setLocalImage(newUrl);
                                ship.imageUrl = newUrl;
                                ship.manual_image = true;
                            } else { alert("Image upload failed"); }
                        } catch (err) { console.error(err); } finally { setUploading(false); }
                    }}
                />
                
                {localImage && localImage !== "/images/0.jpg" ? (
                    <div 
                        title="Click to upload new image"
                        onClick={() => fileInputRef.current?.click()}
                        style={{ 
                            width: '100%', height: '100%', 
                            backgroundImage: `url(${localImage})`, 
                            backgroundSize: 'cover', backgroundPosition: 'center', 
                            cursor: 'pointer', opacity: uploading ? 0.5 : 1, transition: 'all 0.3s'
                        }} 
                        className="vessel-image-hover"
                    />
                ) : (
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        style={{ textAlign: 'center', color: colors.textMuted, cursor: 'pointer', padding: '20px' }}
                    >
                        <Ship size={48} style={{ marginBottom: '10px', opacity: 0.3 }} />
                        <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>CLICK TO UPLOAD IMAGE</div>
                    </div>
                )}
                {uploading && <div className="spinner" style={{ position: 'absolute' }}></div>}
            </div>

            {/* Details Content */}
            <div style={{ flex: 1 }}>
                <Accordion 
                    title="Vessel Specifications" 
                    colors={colors} 
                    isOpen={expandedSections["Vessel Specifications"] ?? true} 
                    setIsOpen={() => toggleSection("Vessel Specifications")}
                >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                        <AccordionRow label="MMSI" value={mmsiStr} colors={colors} />
                        <AccordionRow 
                            label="IMO" 
                            value={isEditing ? <input type="text" value={editData.imo || ''} onChange={e => setEditData({...editData, imo: e.target.value})} style={{ width: '100%', background: 'transparent', border: 'none', color: colors.textMain, fontWeight: 800 }} /> : (ship.imo || 'N/A')} 
                            colors={colors} 
                            onDoubleClick={() => !isEditing && setIsEditing(true)}
                        />
                        <AccordionRow 
                            label="Callsign" 
                            value={isEditing ? <input type="text" value={editData.callsign || ''} onChange={e => setEditData({...editData, callsign: e.target.value})} style={{ width: '100%', background: 'transparent', border: 'none', color: colors.textMain, fontWeight: 800 }} /> : (ship.callsign || 'N/A')} 
                            colors={colors} 
                            onDoubleClick={() => !isEditing && setIsEditing(true)}
                        />
                        <AccordionRow 
                            label="Name" 
                            value={isEditing ? <input type="text" value={editData.name || ''} onChange={e => setEditData({...editData, name: e.target.value})} style={{ width: '100%', background: 'transparent', border: 'none', color: colors.textMain, fontWeight: 800 }} /> : (ship.name || 'N/A')} 
                            colors={colors} 
                            onDoubleClick={() => !isEditing && setIsEditing(true)}
                        />
                        <AccordionRow 
                            label="Length" 
                            value={isEditing ? <input type="number" value={editData.length || ''} onChange={e => setEditData({...editData, length: parseFloat(e.target.value)})} style={{ width: '100%', background: 'transparent', border: 'none', color: colors.textMain, fontWeight: 800 }} /> : (ship.length ? `${ship.length}m` : 'N/A')} 
                            colors={colors} 
                            onDoubleClick={() => !isEditing && setIsEditing(true)}
                        />
                        <AccordionRow 
                            label="Width" 
                            value={isEditing ? <input type="number" value={editData.width || ''} onChange={e => setEditData({...editData, width: parseFloat(e.target.value)})} style={{ width: '100%', background: 'transparent', border: 'none', color: colors.textMain, fontWeight: 800 }} /> : (ship.width ? `${ship.width}m` : 'N/A')} 
                            colors={colors} 
                            onDoubleClick={() => !isEditing && setIsEditing(true)}
                        />
                        <AccordionRow 
                            label="Type" 
                            value={isEditing ? (
                                <select 
                                    value={editData.shiptype || 0} 
                                    onChange={e => setEditData({...editData, shiptype: parseInt(e.target.value)})}
                                    style={{ width: '100%', background: 'transparent', border: 'none', color: colors.textMain, fontWeight: 800, cursor: 'pointer', outline: 'none' }}
                                >
                                    {aisShipTypes.map(t => (
                                        <option key={t.value} value={t.value} style={{ background: colors.bgCard }}>
                                            {t.label}
                                        </option>
                                    ))}
                                </select>
                            ) : getShipTypeName(mmsiStr, ship.shiptype, ship.ship_type_text)} 
                            colors={colors} 
                            onDoubleClick={() => !isEditing && setIsEditing(true)}
                        />
                        <AccordionRow 
                            label="Draught" 
                            value={isEditing ? <input type="number" step="0.1" value={editData.draught || ''} onChange={e => setEditData({...editData, draught: parseFloat(e.target.value)})} style={{ width: '100%', background: 'transparent', border: 'none', color: colors.textMain, fontWeight: 800 }} /> : (ship.draught ? `${ship.draught}m` : 'N/A')} 
                            colors={colors} 
                            onDoubleClick={() => !isEditing && setIsEditing(true)}
                        />
                    </div>
                </Accordion>

                <Accordion 
                    title="Real-time Movement" 
                    colors={colors} 
                    isOpen={expandedSections["Real-time Movement"] ?? true} 
                    setIsOpen={() => toggleSection("Real-time Movement")}
                >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                        <AccordionRow label="Status" value={ship.status_text || 'Under way'} colors={colors} />
                        <AccordionRow label="Speed (SOG)" value={ship.sog ? `${ship.sog} kn` : '0.0 kn'} colors={colors} />
                        <AccordionRow label="Course (COG)" value={ship.cog ? `${ship.cog}°` : '0°'} colors={colors} />
                        <AccordionRow label="Heading" value={ship.heading ? `${ship.heading}°` : 'N/A'} colors={colors} />
                        <AccordionRow label="Last signal" value={getTimeAgo(ship.timestamp)} colors={colors} />
                        <AccordionRow label="Seen previously" value={ship.previous_seen ? getTimeAgo(ship.previous_seen) : '--'} colors={colors} />
                    </div>
                </Accordion>

                <Accordion 
                    title="Navigation & Signal" 
                    colors={colors} 
                    isOpen={expandedSections["Navigation & Signal"] ?? true} 
                    setIsOpen={() => toggleSection("Navigation & Signal")}
                >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                        <AccordionRow label="Messages" value={ship.message_count || '1'} colors={colors} />
                        <AccordionRow label="Source" value={ship.source || 'Local'} colors={colors} />
                        <AccordionRow 
                            label="Distance to Station" 
                            value={formatDistance(haversineDistance(parseFloat(mqttSettings.origin_lat), parseFloat(mqttSettings.origin_lon), ship.lat, ship.lon), mqttSettings.units)} 
                            colors={colors} 
                        />
                        <AccordionRow 
                            label="Seen Count" 
                            value={ship.registration_count || '1'} 
                            colors={colors} 
                        />
                    </div>
                </Accordion>
            </div>
        </div>
        </>
    );
}

function VesselDatabaseModal({ 
    isOpen, onClose, onSelectVessel, colors, 
    dbSearchTerm, setDbSearchTerm, 
    dbFilterType, setDbFilterType, 
    dbFilterSource, setDbFilterSource,
    databaseShips, fetchMore, hasMore, loading, 
    dbSort, setDbSort, dbTotal, onRefresh, isDark
}: any) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [shipToEdit, setShipToEdit] = useState<any>(null);

    const handleScroll = () => {
        if (!scrollRef.current || loading || !hasMore) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        if (scrollTop + clientHeight >= scrollHeight - 50) {
            fetchMore();
        }
    };

    const handleSort = (key: string) => {
        setDbSort((prev: any) => ({
            key,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    const renderSortIcon = (key: string) => {
        if (dbSort.key !== key) return <ChevronUp size={12} style={{ opacity: 0.2 }} className="db-sort-icon" />;
        return dbSort.direction === 'desc' 
            ? <ChevronDown size={14} className="db-sort-icon" style={{ color: '#44aaff' }} /> 
            : <ChevronUp size={14} className="db-sort-icon" style={{ color: '#44aaff' }} />;
    };

    const handleEditStart = (ship: any) => {
        setShipToEdit(ship);
        setIsEditModalOpen(true);
    };

    const handleDeleteShip = async (mmsi: number) => {
        if (!window.confirm(`Are you sure you want to delete vessel ${mmsi} from the archive? This cannot be undone.`)) return;
        
        try {
            const resp = await fetch(`/api/ships/${mmsi}`, { method: 'DELETE' });
            const data = await resp.json();
            if (data.status === 'success') {
                setIsEditModalOpen(false);
                onRefresh();
            } else {
                alert("Error deleting ship: " + (data.error || 'Unknown error'));
            }
        } catch (err) {
            console.error(err);
            alert("Failed to delete ship.");
        }
    };

    const handleEditSave = async (updatedData: any) => {
        try {
            const resp = await fetch(`/api/ships/${updatedData.mmsi}/details`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData)
            });
            const data = await resp.json();
            if (data.status === 'success') {
                setIsEditModalOpen(false);
                onRefresh();
            } else {
                alert("Error saving: " + (data.error || 'Unknown error'));
            }
        } catch (err) {
            console.error(err);
            alert("Failed to save changes.");
        }
    };

    if (!isOpen) return null;

    const getTimeStampFromStr = (dtStr: string) => {
        if (!dtStr) return Date.now();
        try {
            return new Date(dtStr.replace(' ', 'T')).getTime();
        } catch(e) { return Date.now(); }
    };

    return (
        <>
        <div className="settings-modal-overlay" onClick={onClose} style={{ zIndex: 1500 }}>
            <div className="settings-modal" onClick={e => e.stopPropagation()} style={{ 
                height: '92vh', 
                width: '85vw', 
                maxWidth: '1600px',
                borderRadius: '16px', 
                overflow: 'hidden', 
                display: 'flex', 
                flexDirection: 'column', 
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                background: colors.bgCard 
            }}>
                <div style={{ padding: '20px 30px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: colors.bgApp }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ background: 'rgba(68, 170, 255, 0.15)', color: '#44aaff', padding: '10px', borderRadius: '12px' }}>
                            <Database size={24} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>Vessel Database</h2>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>Explore archive • Double-click a row to edit</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {/* Filter Section */}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <div style={{ position: 'relative', width: '180px' }}>
                                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: colors.textMuted }} />
                                <input 
                                    type="text"
                                    placeholder="Search Name/MMSI..."
                                    value={dbSearchTerm}
                                    onChange={e => setDbSearchTerm(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 10px 8px 32px',
                                        borderRadius: '6px',
                                        background: colors.bgApp,
                                        border: `1px solid ${colors.border}`,
                                        color: colors.textMain,
                                        outline: 'none',
                                        fontSize: '0.8rem'
                                    }}
                                />
                            </div>
                            
                            <div style={{ position: 'relative', width: '140px' }}>
                                <select
                                    value={dbFilterSource}
                                    onChange={e => setDbFilterSource(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 30px 8px 10px',
                                        borderRadius: '6px',
                                        background: colors.bgApp,
                                        border: `1px solid ${colors.border}`,
                                        color: colors.textMain,
                                        outline: 'none',
                                        fontSize: '0.8rem',
                                        appearance: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value="all">All Sources</option>
                                    <option value="local">SDR (Local)</option>
                                    <option value="aisstream">STR (Stream)</option>
                                    <option value="udp">UDP (Network)</option>
                                </select>
                                <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.5 }} />
                            </div>

                            <div style={{ position: 'relative', width: '180px' }}>
                                <select
                                    value={dbFilterType}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setDbFilterType(val === 'all' ? 'all' : parseInt(val));
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '8px 30px 8px 10px',
                                        borderRadius: '6px',
                                        background: colors.bgApp,
                                        border: `1px solid ${colors.border}`,
                                        color: colors.textMain,
                                        outline: 'none',
                                        fontSize: '0.8rem',
                                        appearance: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value="all">All Ship Types</option>
                                    {aisShipTypes.map(t => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>
                                <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.5 }} />
                            </div>
                        </div>

                        <div style={{ width: '1px', height: '24px', background: colors.border, margin: '0 5px' }} />

                        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: colors.textMuted, cursor: 'pointer', padding: '8px', borderRadius: '50%', transition: 'all 0.2s' }}>
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div 
                    ref={scrollRef}
                    onScroll={handleScroll}
                    style={{ flex: 1, overflowY: 'auto', padding: '0' }}
                >
                    <table className="db-table-compact" style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: colors.bgCard }}>
                            <tr style={{ background: colors.bgApp }}>
                                <th style={{ width: '60px', padding: '10px 15px', textAlign: 'left', borderBottom: `2px solid ${colors.border}`, fontSize: '0.7rem', textTransform: 'uppercase', color: colors.textMuted, fontWeight: 700 }}>Img</th>
                                <th style={{ width: '100px', padding: '10px 15px', textAlign: 'left', borderBottom: `2px solid ${colors.border}`, fontSize: '0.7rem', textTransform: 'uppercase', color: colors.textMuted, fontWeight: 700, cursor: 'pointer' }} onClick={() => handleSort('mmsi')}>MMSI {renderSortIcon('mmsi')}</th>
                                <th style={{ padding: '10px 15px', textAlign: 'left', borderBottom: `2px solid ${colors.border}`, fontSize: '0.7rem', textTransform: 'uppercase', color: colors.textMuted, fontWeight: 700, cursor: 'pointer' }} onClick={() => handleSort('name')}>Name {renderSortIcon('name')}</th>
                                <th style={{ width: '150px', padding: '10px 15px', textAlign: 'left', borderBottom: `2px solid ${colors.border}`, fontSize: '0.7rem', textTransform: 'uppercase', color: colors.textMuted, fontWeight: 700, cursor: 'pointer' }} onClick={() => handleSort('type')}>Type {renderSortIcon('type')}</th>
                                <th style={{ width: '100px', padding: '10px 15px', textAlign: 'left', borderBottom: `2px solid ${colors.border}`, fontSize: '0.7rem', textTransform: 'uppercase', color: colors.textMuted, fontWeight: 700 }}>IMO/Call</th>
                                <th style={{ width: '100px', padding: '10px 15px', textAlign: 'left', borderBottom: `2px solid ${colors.border}`, fontSize: '0.7rem', textTransform: 'uppercase', color: colors.textMuted, fontWeight: 700 }}>Dim/Dr</th>
                                <th style={{ width: '60px', padding: '10px 15px', textAlign: 'center', borderBottom: `2px solid ${colors.border}`, fontSize: '0.7rem', textTransform: 'uppercase', color: colors.textMuted, fontWeight: 700, cursor: 'pointer' }} onClick={() => handleSort('registration_count')}>Seen {renderSortIcon('registration_count')}</th>
                                <th style={{ width: '160px', padding: '10px 15px', textAlign: 'left', borderBottom: `2px solid ${colors.border}`, fontSize: '0.7rem', textTransform: 'uppercase', color: colors.textMuted, fontWeight: 700, cursor: 'pointer' }} onClick={() => handleSort('last_seen')}>Last Seen {renderSortIcon('last_seen')}</th>
                                <th style={{ width: '120px', padding: '10px 15px', textAlign: 'left', borderBottom: `2px solid ${colors.border}`, fontSize: '0.7rem', textTransform: 'uppercase', color: colors.textMuted, fontWeight: 700 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {databaseShips.map((ship: any, idx: number) => {
                                return (
                                    <tr 
                                        key={ship.mmsi} 
                                        onDoubleClick={() => handleEditStart(ship)}
                                        onClick={() => onSelectVessel(ship)}
                                        style={{ 
                                            borderBottom: `1px solid ${colors.border}`, 
                                            cursor: 'pointer', 
                                            background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                                            transition: 'background 0.1s' 
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(68,170,255,0.05)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'; }}
                                    >
                                        <td style={{ padding: '6px 15px' }}>
                                            <div 
                                                style={{ width: '40px', height: '28px', borderRadius: '4px', background: '#0a0a0a', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${colors.border}`, cursor: ship.imageUrl ? 'zoom-in' : 'default' }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (ship.imageUrl && ship.imageUrl !== "/images/0.jpg") {
                                                        setSelectedImage(ship.imageUrl);
                                                    }
                                                }}
                                            >
                                                {ship.imageUrl && ship.imageUrl !== "/images/0.jpg" ? (
                                                    <img src={ship.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : (
                                                    <Ship size={14} color={colors.textMuted} style={{ opacity: 0.3 }} />
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ padding: '6px 15px' }}>
                                            <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.8rem', color: colors.textMain }}>{ship.mmsi}</div>
                                            <div style={{ fontSize: '0.65rem', color: colors.textMuted, opacity: 0.6 }}>{ship.source?.toUpperCase() || 'LOCAL'}</div>
                                        </td>
                                        <td style={{ padding: '6px 15px' }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: colors.textMain, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ship.name || 'Unknown Vessel'}</div>
                                        </td>
                                        <td style={{ padding: '6px 15px' }}>
                                            <div style={{ fontSize: '0.75rem', color: colors.textMain }}>
                                                {ship.ship_type_text || (ship.type ? `Type ${ship.type}` : 'Other')}
                                            </div>
                                        </td>
                                        <td style={{ padding: '6px 15px' }}>
                                            <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>
                                                <div>{ship.imo || '--'}</div>
                                                <div>{ship.callsign || '--'}</div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '6px 15px' }}>
                                            <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>
                                                <div>{ship.length && ship.width ? `${ship.length}×${ship.width}m` : '--'}</div>
                                                {ship.draught ? <div>{ship.draught}m dist</div> : null}
                                            </div>
                                        </td>
                                        <td style={{ padding: '6px 15px', textAlign: 'center' }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#10b981' }}>{ship.registration_count || 1}</div>
                                        </td>
                                        <td style={{ padding: '6px 15px' }}>
                                            <div style={{ fontWeight: 700, color: '#44aaff', fontSize: '0.75rem' }}>{getTimeAgo(getTimeStampFromStr(ship.last_seen))} ago</div>
                                            <div style={{ fontSize: '0.65rem', color: colors.textMuted, opacity: 0.7 }}>{ship.last_seen || '--'}</div>
                                        </td>
                                        <td style={{ padding: '6px 15px' }}>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleEditStart(ship); }}
                                                style={{ padding: '4px 8px', background: 'rgba(68,170,255,0.1)', color: '#44aaff', border: 'none', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}
                                            >
                                                EDIT
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    
                    {loading && (
                        <div style={{ textAlign: 'center', padding: '40px', color: colors.textMuted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                            <div className="loading-spinner" style={{ width: '24px', height: '24px', border: '2px solid rgba(68,170,255,0.1)', borderTopColor: '#44aaff', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', opacity: 0.5 }}>Syncing logs...</span>
                        </div>
                    )}
                    
                    {!loading && databaseShips.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '100px 0', color: colors.textMuted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                            <Database size={40} style={{ opacity: 0.1 }} />
                            <div style={{ fontSize: '1rem', fontWeight: 600, opacity: 0.4 }}>No data matched your filters</div>
                        </div>
                    )}
                    
                    {!loading && hasMore && databaseShips.length > 0 && (
                        <div style={{ textAlign: 'center', padding: '20px' }}>
                            <button 
                                onClick={() => fetchMore()}
                                style={{ background: 'rgba(68, 170, 255, 0.1)', color: '#44aaff', border: '1px solid rgba(68, 170, 255, 0.3)', padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, transition: 'all 0.2s' }}
                            >
                                LOAD MORE VESSELS
                            </button>
                        </div>
                    )}
                </div>

                <div className="db-pagination-info" style={{ background: colors.bgApp, borderTop: `1px solid ${colors.border}`, color: colors.textMain, padding: '15px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.85rem' }}>
                        Showing <strong>{databaseShips.length}</strong> of <strong>{dbTotal || databaseShips.length}</strong> historical records
                    </div>
                    <div style={{ opacity: 0.5, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        <Wifi size={14} />
                        <span>Live Database Synchronization Active</span>
                    </div>
                </div>

                {selectedImage && (
                    <div 
                        className="settings-modal-overlay" 
                        onClick={() => setSelectedImage(null)} 
                        style={{ zIndex: 2000, background: 'rgba(0,0,0,0.9)' }}
                    >
                        <div 
                            style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}
                            onClick={e => e.stopPropagation()}
                        >
                            <img 
                                src={selectedImage} 
                                alt="Vessel High-Res" 
                                style={{ width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '90vh', borderRadius: '8px', boxShadow: '0 30px 60px rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)' }} 
                            />
                            <button 
                                onClick={() => setSelectedImage(null)}
                                style={{ position: 'absolute', top: '15px', right: '15px', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* Vessel Edit Modal */}
        {isEditModalOpen && shipToEdit && (
            <VesselEditModal
                ship={shipToEdit}
                isOpen={isEditModalOpen}
                onClose={() => { setIsEditModalOpen(false); setShipToEdit(null); }}
                onSave={handleEditSave}
                onDelete={handleDeleteShip}
                colors={colors}
                isDark={isDark}
            />
        )}
        </>
    );
}

function VesselEditModal({ ship, isOpen, onClose, onSave, onDelete, colors, isDark }: any) {
    const [formData, setFormData] = useState({ ...ship });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [localImage, setLocalImage] = useState<string | null>(ship.imageUrl || null);

    useEffect(() => {
        setFormData({ ...ship });
        setLocalImage(ship.imageUrl || null);
    }, [ship]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData((prev: any) => ({ ...prev, [name]: value }));
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setUploading(true);
        const uploadFormData = new FormData();
        uploadFormData.append("file", file);
        
        try {
            const mmsiStr = String(ship.mmsi);
            const isDev = window.location.port === '5173';
            const uploadUrl = isDev ? `http://127.0.0.1:8080/api/ships/${mmsiStr}/image` : `/api/ships/${mmsiStr}/image`;
            
            const res = await fetch(uploadUrl, {
                method: 'POST',
                body: uploadFormData
            });
            
            if (res.ok) {
                const data = await res.json();
                const newUrl = `${data.image_url}?t=${Date.now()}`;
                setLocalImage(newUrl);
                setFormData((prev: any) => ({ ...prev, imageUrl: newUrl, manual_image: true }));
            } else {
                alert("Image upload failed");
            }
        } catch (err) {
            console.error(err);
            alert("Upload error");
        } finally {
            setUploading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="settings-modal-overlay" style={{ zIndex: 11000 }} onClick={onClose}>
            <div className="settings-modal" style={{ width: '850px', height: 'auto', maxHeight: '90vh', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '20px 30px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: colors.bgCard }}>
                    <h2 style={{ margin: 0, fontSize: '1.2rem', color: colors.textMain }}>Edit Vessel: {formData.name || formData.mmsi}</h2>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: colors.textMuted, cursor: 'pointer' }}><X size={24} /></button>
                </div>
                
                <div style={{ display: 'flex', padding: '30px', gap: '30px', overflowY: 'auto' }}>
                    {/* Left side: Image Upload/Preview */}
                    <div style={{ width: '280px', flexShrink: 0 }}>
                        <label style={{ fontSize: '0.75rem', color: colors.textMuted, fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Vessel Image</label>
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            style={{ 
                                width: '100%', 
                                height: '200px', 
                                background: isDark ? 'rgba(0,0,0,0.3)' : '#f8fafc',
                                border: `2px dashed ${colors.border}`,
                                borderRadius: '12px',
                                overflow: 'hidden',
                                position: 'relative',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s'
                            }}
                        >
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                style={{ display: 'none' }} 
                                accept="image/jpeg, image/png, image/webp"
                                onChange={handleImageUpload}
                            />
                            
                            {localImage && !(ship.is_aton || String(ship.mmsi).startsWith('99')) ? (
                                <img 
                                    src={localImage} 
                                    alt="Preview" 
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: uploading ? 0.4 : 1 }} 
                                />
                            ) : (
                                <div style={{ textAlign: 'center', color: colors.textMuted, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                    {ship.is_aton ? (
                                        <>
                                            <Navigation size={60} color={isDark ? '#44aaff' : '#00838f'} />
                                            <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>AtoN Symbol</div>
                                        </>
                                    ) : (
                                        <>
                                            <Ship size={40} style={{ marginBottom: '10px', opacity: 0.5 }} />
                                            <div style={{ fontSize: '0.8rem' }}>Click to upload image</div>
                                        </>
                                    )}
                                </div>
                            )}
                            
                            {uploading && (
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
                                    <div className="spinning" style={{ width: '24px', height: '24px', border: '3px solid #fff', borderTopColor: 'transparent', borderRadius: '50%' }}></div>
                                </div>
                            )}
                        </div>
                        <div style={{ marginTop: '10px', fontSize: '0.7rem', color: colors.textMuted }}>
                            Supports JPG, PNG, WebP. Click image to change.
                        </div>
                    </div>

                    {/* Right side: Form Fields */}
                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignContent: 'start' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '0.75rem', color: colors.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>Vessel Name</label>
                            <input name="name" value={formData.name || ''} onChange={handleChange} style={{ padding: '10px', borderRadius: '6px', border: `1px solid ${colors.border}`, background: isDark ? 'rgba(0,0,0,0.2)' : '#fff', color: colors.textMain }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '0.75rem', color: colors.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>MMSI (Read Only)</label>
                            <input value={ship.mmsi} disabled style={{ padding: '10px', borderRadius: '6px', border: `1px solid ${colors.border}`, background: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9', color: colors.textMuted, cursor: 'not-allowed' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '0.75rem', color: colors.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>IMO Number</label>
                            <input name="imo" value={formData.imo || ''} onChange={handleChange} style={{ padding: '10px', borderRadius: '6px', border: `1px solid ${colors.border}`, background: isDark ? 'rgba(0,0,0,0.2)' : '#fff', color: colors.textMain }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '0.75rem', color: colors.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>Callsign</label>
                            <input name="callsign" value={formData.callsign || ''} onChange={handleChange} style={{ padding: '10px', borderRadius: '6px', border: `1px solid ${colors.border}`, background: isDark ? 'rgba(0,0,0,0.2)' : '#fff', color: colors.textMain }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '0.75rem', color: colors.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>Ship Type</label>
                            <select name="type" value={formData.type || 0} onChange={handleChange} style={{ padding: '10px', borderRadius: '6px', border: `1px solid ${colors.border}`, background: isDark ? 'rgba(0,0,0,0.2)' : '#fff', color: colors.textMain }}>
                                {aisShipTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '0.75rem', color: colors.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>Destination</label>
                            <input name="destination" value={formData.destination || ''} onChange={handleChange} style={{ padding: '10px', borderRadius: '6px', border: `1px solid ${colors.border}`, background: isDark ? 'rgba(0,0,0,0.2)' : '#fff', color: colors.textMain }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '0.75rem', color: colors.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>Length (m)</label>
                            <input name="length" type="number" value={formData.length || ''} onChange={handleChange} style={{ padding: '10px', borderRadius: '6px', border: `1px solid ${colors.border}`, background: isDark ? 'rgba(0,0,0,0.2)' : '#fff', color: colors.textMain }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '0.75rem', color: colors.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>Width (m)</label>
                            <input name="width" type="number" value={formData.width || ''} onChange={handleChange} style={{ padding: '10px', borderRadius: '6px', border: `1px solid ${colors.border}`, background: isDark ? 'rgba(0,0,0,0.2)' : '#fff', color: colors.textMain }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '0.75rem', color: colors.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>Draught (m)</label>
                            <input name="draught" type="number" step="0.1" value={formData.draught || ''} onChange={handleChange} style={{ padding: '10px', borderRadius: '6px', border: `1px solid ${colors.border}`, background: isDark ? 'rgba(0,0,0,0.2)' : '#fff', color: colors.textMain }} />
                        </div>
                    </div>
                </div>

                <div style={{ padding: '20px 30px', borderTop: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', background: colors.bgCard }}>
                    <button 
                        onClick={() => onDelete(ship.mmsi)}
                        style={{ padding: '10px 20px', background: 'rgba(255,0,0,0.1)', border: '1px solid rgba(255,0,0,0.3)', color: '#ff4444', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}
                    >
                        DELETE VESSEL
                    </button>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button onClick={onClose} style={{ padding: '10px 20px', background: 'transparent', border: `1px solid ${colors.border}`, color: colors.textMain, borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                        <button 
                            onClick={() => onSave(formData)}
                            style={{ padding: '10px 25px', background: '#10b981', border: 'none', color: '#fff', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}
                        >
                            SAVE CHANGES
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}


function VesselDetailModal({ isOpen, onClose, ship, colors, mqttSettings, isDark }: any) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [localImage, setLocalImage] = useState<string | null>(null);

    useEffect(() => {
        setLocalImage(ship ? ship.imageUrl : null);
    }, [ship]);

    if (!isOpen || !ship) return null;

    const mmsiStr = String(ship.mmsi);
    const infoBlocks = [
        { label: 'MMSI', value: mmsiStr },
        { label: 'IMO', value: ship.imo || '--' },
        { label: 'Callsign', value: ship.callsign || '--' },
        { label: 'Vessel Type', value: ship.ship_type_text || (ship.shiptype ? `Type ${ship.shiptype}` : 'N/A') },
    ];

    const navBlocks = [
        { label: 'Position', value: `${ship.lat?.toFixed(3) ?? '--'}, ${ship.lon?.toFixed(3) ?? '--'}` },
        { label: 'Speed (SOG)', value: formatSpeed(ship.sog, mqttSettings.units) },
        { label: 'Course (COG)', value: ship.cog != null ? `${ship.cog.toFixed(0)}°` : '--' },
        { label: 'Heading', value: ship.heading != null ? `${ship.heading}°` : '--' },
        { label: 'ROT', value: ship.rot != null ? `${ship.rot}°/min` : '--' },
        { label: 'Status', value: ship.status_text || 'Unknown' },
    ];

    const voyageBlocks = [
        { label: 'Destination', value: ship.destination || '--' },
        { label: 'ETA', value: ship.eta || '--' },
        { label: 'Draught', value: ship.draught ? `${ship.draught}m` : '--' },
        { label: 'Distans till Station', value: formatDistance(haversineDistance(parseFloat(mqttSettings.origin_lat), parseFloat(mqttSettings.origin_lon), ship.lat, ship.lon), mqttSettings.units) },
    ];

    const specBlocks = [
        { label: 'Length', value: ship.length ? `${ship.length}m` : '--' },
        { label: 'Width', value: ship.width ? `${ship.width}m` : '--' },
        { label: 'Messages', value: ship.message_count || '--' },
        { label: 'Latest', value: getTimeAgo(ship.timestamp) },
        { label: 'Source', value: ship.source === 'aisstream' ? 'Stream' : 'Local' },
        { label: 'Seen previously', value: ship.previous_seen ? getTimeAgo(ship.previous_seen) : '--' },
    ];

    return (
        <div className="settings-modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
            <div className="settings-modal" onClick={e => e.stopPropagation()} style={{ height: 'auto', maxHeight: '95vh', width: '950px', borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
                <div style={{ position: 'relative', width: '100%', height: '450px', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        style={{ display: 'none' }} 
                        accept="image/jpeg, image/png, image/webp"
                        onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            
                            setUploading(true);
                            const formData = new FormData();
                            formData.append("file", file);
                            
                            try {
                                const isDev = window.location.port === '5173';
                                const uploadUrl = isDev ? `http://127.0.0.1:8080/api/ships/${mmsiStr}/image` : `/api/ships/${mmsiStr}/image`;
                                
                                const res = await fetch(uploadUrl, {
                                    method: 'POST',
                                    body: formData
                                });
                                
                                if (res.ok) {
                                    const data = await res.json();
                                    const newUrl = `${data.image_url}?t=${Date.now()}`;
                                    setLocalImage(newUrl);
                                    ship.imageUrl = newUrl;
                                    ship.manual_image = true;
                                } else {
                                    alert("Image upload failed");
                                }
                            } catch (err) {
                                console.error(err);
                                alert("Upload error");
                            } finally {
                                setUploading(false);
                            }
                        }}
                    />
                    
                    {localImage && localImage !== "/images/0.jpg" && !(ship.is_aton || String(ship.mmsi).startsWith('99')) ? (
                        <div 
                            title="Klicka för att ladda upp egen bild"
                            onClick={() => fileInputRef.current?.click()}
                            style={{ 
                                width: '100%', 
                                height: '100%', 
                                backgroundImage: `url(${localImage})`, 
                                backgroundSize: 'contain', 
                                backgroundPosition: 'center', 
                                backgroundRepeat: 'no-repeat',
                                cursor: 'pointer', 
                                opacity: uploading ? 0.5 : 1, 
                                transition: 'opacity 0.2s',
                                zIndex: 1
                            }} 
                        />
                    ) : (
                        <div 
                            title={(ship.is_aton || String(ship.mmsi).startsWith('99')) ? "Aids to Navigation" : "Click to upload custom image"}
                            onClick={(ship.is_aton || String(ship.mmsi).startsWith('99')) ? undefined : () => fileInputRef.current?.click()}
                            style={{ 
                                width: '100%', 
                                height: '100%', 
                                display: 'flex', 
                                flexDirection: 'column', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                color: isDark ? '#44aaff' : '#00838f', 
                                gap: '15px', 
                                cursor: (ship.is_aton || String(ship.mmsi).startsWith('99')) ? 'default' : 'pointer', 
                                opacity: uploading ? 0.5 : 1, 
                                transition: 'opacity 0.2s' 
                            }}>
                            {(ship.is_aton || String(ship.mmsi).startsWith('99')) ? (
                                <>
                                    <Navigation size={120} strokeWidth={1} />
                                    <span style={{ fontSize: '1.4rem', fontWeight: 700 }}>Aids to Navigation</span>
                                    {ship.is_meteo && <span style={{ fontSize: '1rem', color: colors.textMuted }}>Meteorological Station</span>}
                                </>
                            ) : (
                                <>
                                    <Ship size={80} strokeWidth={1} />
                                    <span style={{ fontSize: '0.9rem', color: '#666' }}>{uploading ? 'Uploading...' : 'Click to upload custom image'}</span>
                                </>
                            )}
                        </div>
                    )}
                    
                    {/* Gradient Overlay for Text Readability */}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%', background: 'linear-gradient(transparent, rgba(0,0,0,0.85))', zIndex: 2, pointerEvents: 'none' }}></div>
                    
                    <button onClick={onClose} style={{ position: 'absolute', top: '15px', right: '15px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', color: 'white', cursor: 'pointer', padding: '8px', backdropFilter: 'blur(10px)', zIndex: 10, transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.2)'} onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'}>
                        <X size={20} />
                    </button>
                    
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '25px 30px', color: 'white', zIndex: 3 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <span style={{ fontSize: '3.5rem', lineHeight: 1 }} dangerouslySetInnerHTML={{ __html: getFlagEmoji(mmsiStr, ship.country_code) }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                                    <h1 style={{ margin: 0, fontSize: '2.2rem', fontWeight: 800, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{ship.name || 'Unknown Vessel'}</h1>
                                    <div style={{
                                        background: ship.source === 'aisstream' ? '#44aaff33' : '#10b98133',
                                        color: ship.source === 'aisstream' ? '#44aaff' : '#10b981',
                                        padding: '2px 10px',
                                        borderRadius: '20px',
                                        fontSize: '0.7rem',
                                        fontWeight: 800,
                                        letterSpacing: '0.5px',
                                        textTransform: 'uppercase',
                                        border: `1px solid ${ship.source === 'aisstream' ? '#44aaff66' : '#10b98166'}`,
                                        backdropFilter: 'blur(4px)'
                                    }}>
                                        {ship.source === 'aisstream' ? 'STREAM' : 'LIVE'}
                                    </div>
                                    {(() => {
                                        const dist = haversineDistance(parseFloat(mqttSettings.origin_lat), parseFloat(mqttSettings.origin_lon), ship.lat, ship.lon);
                                        if (dist > 185.2) {
                                            return (
                                                <div style={{
                                                    background: 'linear-gradient(135deg, #ff00ff 0%, #aa00ff 100%)',
                                                    color: 'white',
                                                    padding: '2px 10px',
                                                    borderRadius: '20px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 800,
                                                    letterSpacing: '0.5px',
                                                    textTransform: 'uppercase',
                                                    border: '1px solid rgba(255, 0, 255, 0.4)',
                                                    backdropFilter: 'blur(4px)',
                                                    boxShadow: '0 0 15px rgba(255, 0, 255, 0.3)'
                                                }}>
                                                    TROPO DUCTING
                                                </div>
                                            );
                                        } else if (dist > 74.08 && dist < 148.16) {
                                            return (
                                                <div style={{
                                                    background: 'linear-gradient(135deg, #00d2ff 0%, #3a7bd5 100%)',
                                                    color: 'white',
                                                    padding: '2px 10px',
                                                    borderRadius: '20px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 800,
                                                    letterSpacing: '0.5px',
                                                    textTransform: 'uppercase',
                                                    border: '1px solid rgba(0, 210, 255, 0.4)',
                                                    backdropFilter: 'blur(4px)',
                                                    boxShadow: '0 0 15px rgba(0, 210, 255, 0.3)'
                                                }}>
                                                    ENHANCED RANGE
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}
                                </div>
                                <div style={{ opacity: 0.9, fontSize: '1rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Anchor size={16} />
                                    {ship.ship_type_text || (ship.shiptype ? `Type ${ship.shiptype}` : 'Unknown Type')}
                                    <span style={{ opacity: 0.5 }}>•</span>
                                    <span>MMSI: {mmsiStr}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="settings-content" style={{ padding: '35px 40px', background: colors.bgCard, flex: 1, display: 'flex', justifyContent: 'center' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) auto minmax(180px, 1fr) auto minmax(180px, 1fr) auto minmax(180px, 1fr)', gap: '0', width: '100%', maxWidth: '1000px' }}>
                        {/* Section 1: Info */}
                        <div style={{ padding: '0 15px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', color: '#44aaff' }}>
                                <Info size={16} />
                                <span style={{ fontSize: '0.9rem', fontWeight: 800, letterSpacing: '1px' }}>INFO</span>
                            </div>
                            <div style={{ display: 'grid', gap: '14px' }}>
                                {infoBlocks.map(b => (
                                    <div key={b.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '15px', borderBottom: `1px solid ${colors.border}1a`, paddingBottom: '6px' }}>
                                        <span style={{ color: colors.textMuted, fontSize: '0.85rem', fontWeight: 500, whiteSpace: 'nowrap' }}>{b.label}</span>
                                        <span style={{ fontWeight: 600, fontSize: '0.95rem', textAlign: 'right' }}>{b.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Divider */}
                        <div style={{ width: '2px', background: colors.border, opacity: 0.5, margin: '0 5px', height: '100%', alignSelf: 'stretch' }}></div>

                        {/* Section 2: Resa */}
                        <div style={{ padding: '0 15px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', color: '#44aaff' }}>
                                <Navigation size={16} />
                                <span style={{ fontSize: '0.9rem', fontWeight: 800, letterSpacing: '1px' }}>VOYAGE</span>
                            </div>
                            <div style={{ display: 'grid', gap: '14px' }}>
                                {voyageBlocks.map(b => (
                                    <div key={b.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '15px', borderBottom: `1px solid ${colors.border}1a`, paddingBottom: '6px' }}>
                                        <span style={{ color: colors.textMuted, fontSize: '0.85rem', fontWeight: 500, whiteSpace: 'nowrap' }}>{b.label}</span>
                                        <span style={{ fontWeight: 600, fontSize: '0.95rem', textAlign: 'right' }}>{b.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Divider */}
                        <div style={{ width: '2px', background: colors.border, opacity: 0.5, margin: '0 5px', height: '100%', alignSelf: 'stretch' }}></div>

                        {/* Section 3: Navigation */}
                        <div style={{ padding: '0 15px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', color: '#44aaff' }}>
                                <Signal size={16} />
                                <span style={{ fontSize: '0.9rem', fontWeight: 800, letterSpacing: '1px' }}>NAVIGATION</span>
                            </div>
                            <div style={{ display: 'grid', gap: '14px' }}>
                                {navBlocks.map(b => (
                                    <div key={b.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '15px', borderBottom: `1px solid ${colors.border}1a`, paddingBottom: '6px' }}>
                                        <span style={{ color: colors.textMuted, fontSize: '0.85rem', fontWeight: 500, whiteSpace: 'nowrap' }}>{b.label}</span>
                                        <span style={{ fontWeight: 700, fontSize: '0.95rem', textAlign: 'right', color: b.label === 'Status' && b.value.includes('anchor') ? '#ffaa00' : 'inherit' }}>{b.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Divider */}
                        <div style={{ width: '1px', background: `linear-gradient(to bottom, transparent, ${colors.border}33, transparent)`, margin: '0 5px' }}></div>

                        {/* Section 4: Stats */}
                        <div style={{ padding: '0 15px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', color: '#44aaff' }}>
                                <Radio size={16} />
                                <span style={{ fontSize: '0.9rem', fontWeight: 800, letterSpacing: '1px' }}>STATS</span>
                            </div>
                            <div style={{ display: 'grid', gap: '14px' }}>
                                {specBlocks.map(b => (
                                    <div key={b.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '15px', borderBottom: `1px solid ${colors.border}1a`, paddingBottom: '6px' }}>
                                        <span style={{ color: colors.textMuted, fontSize: '0.85rem', fontWeight: 500, whiteSpace: 'nowrap' }}>{b.label}</span>
                                        <span style={{ fontWeight: 600, fontSize: '0.95rem', textAlign: 'right' }}>{b.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Toggle({ checked, onChange }: { checked: boolean, onChange: (val: boolean) => void }) {
    return (
        <label className="switch">
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
            <span className="slider"></span>
        </label>
    );
}

function SettingsModal({ isOpen, onClose, settings, setSettings, onSave, activeTab, setActiveTab, colors, theme }: any) {

    if (!isOpen) return null;

    const tabs = [
        { id: 'general', label: 'General', icon: <Info size={18} />, title: 'General System Settings', desc: 'Configure basic application behavior and primary station location.' },
        { id: 'mqtt', label: 'MQTT', icon: <Signal size={18} />, title: 'MQTT Broker Configuration', desc: 'Manage incoming data feeds and outgoing vessel status broadcasts.' },
        { id: 'trail', label: 'Tracking', icon: <Navigation size={18} />, title: 'Vessel Tracking & Trails', desc: 'Customize how historical movement paths are displayed on the map.' },
        { id: 'map', label: 'Map', icon: <Sun size={18} />, title: 'Map Visualization', desc: 'Control map layers, vessel icons, labels, and interaction settings.' },
        { id: 'coverage', label: 'Coverage', icon: <Activity size={18} />, title: 'Coverage & Statistics', desc: 'Monitor system range and reset historical performance data.' },
        { id: 'sdr', label: 'SDR Tuning', icon: <Radio size={18} />, title: 'SDR Hardware Tuning', desc: 'Fine-tune your RTL-SDR frequency and gain settings (requires restart).' },
        { id: 'hybrid', label: 'Hybrid Data', icon: <Globe size={18} />, title: 'Hybrid Data Sources', desc: 'Configure AisStream.io integration and local NMEA UDP ingest.' },
        { id: 'data', label: 'Database & Images', icon: <Database size={18} />, title: 'Database & Image Management', desc: 'Manage stored data, clear history and configure automatic purging rules.' },
    ];

    const activeTabData = tabs.find(t => t.id === activeTab) || tabs[0];

    return (
        <div className="settings-modal-overlay" onClick={onClose}>
            <div className={`settings-modal ${theme === 'light' ? 'light-theme' : ''}`} onClick={e => e.stopPropagation()}>
                {/* Sidebar */}
                <div className="settings-sidebar">
                    <div className="settings-sidebar-header">
                        <div className="settings-sidebar-title">Settings</div>
                        <div style={{ fontSize: '0.75rem', color: '#8892b0', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>NavisCore Center</div>
                    </div>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {tabs.map(t => (
                                <button
                                    key={t.id}
                                    className={`settings-tab-sidebar-btn ${activeTab === t.id ? 'active' : ''}`}
                                    onClick={() => setActiveTab(t.id)}
                                >
                                    {t.icon}
                                    <span>{t.label}</span>
                                </button>
                            ))}
                        </div>
                        <div style={{ padding: '20px 25px', opacity: 0.5, fontSize: '0.7rem' }}>
                            NavisCore v1.0.0
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="settings-main">
                        <div className="settings-header">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h2 className="settings-header-title">{activeTabData.title}</h2>
                                    <div className="settings-header-desc">{activeTabData.desc}</div>
                                </div>
                                <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '5px', color: colors.textMuted }}>
                                    <X size={24} />
                                </button>
                            </div>
                        </div>

                        <div className="settings-scroll-area">
                            {activeTab === 'general' && (
                                <div className="settings-grid">
                                    <div className="settings-card">
                                        <div className="settings-card-title"><Settings size={14} /> Basic Configuration</div>
                                        <div className="form-group-premium">
                                            <div>
                                                <label>Vessel Timeout</label>
                                                <div className="description">How long a vessel remains visible after last signal (minutes)</div>
                                            </div>
                                            <input
                                                type="number"
                                                className="input-premium"
                                                value={settings.ship_timeout}
                                                onChange={e => setSettings({ ...settings, ship_timeout: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group-premium">
                                            <div>
                                                <label>Measurement Units</label>
                                                <div className="description">Choose between Nautical (nm/kn) or Metric (km/km/h)</div>
                                            </div>
                                            <select 
                                                className="select-premium"
                                                value={settings.units} 
                                                onChange={e => setSettings({ ...settings, units: e.target.value })}
                                            >
                                                <option value="nautical">Nautical (nm, kn)</option>
                                                <option value="metric">Metric (km, km/h)</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="settings-card">
                                        <div className="settings-card-title"><Anchor size={14} /> Station Location</div>
                                        <div className="settings-grid-2">
                                            <div className="form-group-grid-item">
                                                <div className="label-desc-container">
                                                    <label>Latitude</label>
                                                </div>
                                                <input
                                                    type="text"
                                                    className="input-premium"
                                                    placeholder="59.3293"
                                                    value={settings.origin_lat}
                                                    onChange={e => setSettings({ ...settings, origin_lat: e.target.value })}
                                                    style={{ width: '100%' }}
                                                />
                                            </div>
                                            <div className="form-group-grid-item">
                                                <div className="label-desc-container">
                                                    <label>Longitude</label>
                                                </div>
                                                <input
                                                    type="text"
                                                    className="input-premium"
                                                    placeholder="18.0686"
                                                    value={settings.origin_lon}
                                                    onChange={e => setSettings({ ...settings, origin_lon: e.target.value })}
                                                    style={{ width: '100%' }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'mqtt' && (
                                <div className="settings-grid">
                                    <div className="settings-grid-2">
                                        <div className="settings-card">
                                            <div className="settings-card-title" style={{ color: '#44aaff' }}><ArrowDownLeft size={14} /> Incoming AIS Data</div>
                                            <div className="form-group-premium">
                                                <label>MQTT Subscriber Enabled</label>
                                                <Toggle
                                                    checked={settings.mqtt_enabled === 'true'}
                                                    onChange={val => setSettings({ ...settings, mqtt_enabled: String(val) })}
                                                />
                                            </div>
                                            <div className="form-group-premium vertical">
                                                <label>Broker URL</label>
                                                <input type="text" className="input-premium" placeholder="mqtt://localhost:1883" value={settings.mqtt_url} onChange={e => setSettings({ ...settings, mqtt_url: e.target.value })} style={{ width: '100%' }} />
                                            </div>
                                            <div className="form-group-premium vertical">
                                                <label>Data Topic</label>
                                                <input type="text" className="input-premium" placeholder="ais" value={settings.mqtt_topic} onChange={e => setSettings({ ...settings, mqtt_topic: e.target.value })} style={{ width: '100%' }} />
                                            </div>
                                            
                                            <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: colors.textMuted, marginBottom: '15px', textTransform: 'uppercase' }}>Authentication</div>
                                                <div className="form-group-premium">
                                                    <label>Username</label>
                                                    <input type="text" className="input-premium" value={settings.mqtt_user} onChange={e => setSettings({ ...settings, mqtt_user: e.target.value })} style={{ width: '160px' }} />
                                                </div>
                                                <div className="form-group-premium">
                                                    <label>Password</label>
                                                    <input type="password" className="input-premium" value={settings.mqtt_pass} onChange={e => setSettings({ ...settings, mqtt_pass: e.target.value })} style={{ width: '160px' }} />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="settings-card">
                                            <div className="settings-card-title" style={{ color: '#44aaff' }}><ArrowUpRight size={14} /> Outgoing Publisher</div>
                                            <div className="form-group-premium">
                                                <label>MQTT Publisher Enabled</label>
                                                <Toggle
                                                    checked={settings.mqtt_pub_enabled === 'true'}
                                                    onChange={val => setSettings({ ...settings, mqtt_pub_enabled: String(val) })}
                                                />
                                            </div>
                                            <div className="form-group-premium vertical">
                                                <label>Broker URL</label>
                                                <input type="text" className="input-premium" placeholder="mqtt://192.168.1.121:1883" value={settings.mqtt_pub_url} onChange={e => setSettings({ ...settings, mqtt_pub_url: e.target.value })} style={{ width: '100%' }} />
                                            </div>
                                            <div className="form-group-premium vertical">
                                                <label>Outgoing Topic</label>
                                                <input type="text" className="input-premium" placeholder="naviscore/objects" value={settings.mqtt_pub_topic} onChange={e => setSettings({ ...settings, mqtt_pub_topic: e.target.value })} style={{ width: '100%' }} />
                                            </div>
                                            
                                            <div style={{ marginTop: '15px', display: 'grid', gap: '8px' }}>
                                                <div className="form-group-premium">
                                                    <div>
                                                        <label>Only New Objects</label>
                                                        <div className="description" style={{ fontSize: '0.75rem' }}>Only broadcast newly discovered vessels</div>
                                                    </div>
                                                    <Toggle
                                                        checked={settings.mqtt_pub_only_new === 'true'}
                                                        onChange={val => setSettings({ ...settings, mqtt_pub_only_new: String(val) })}
                                                    />
                                                </div>
                                                <div className="form-group-premium">
                                                    <div>
                                                        <label>New Vessel Timeout (Hours)</label>
                                                        <div className="description" style={{ fontSize: '0.75rem' }}>Hours of silence before a returning vessel triggers a new notification</div>
                                                    </div>
                                                    <input
                                                        type="number"
                                                        className="input-premium"
                                                        style={{ width: '80px' }}
                                                        value={settings.new_vessel_timeout_h}
                                                        onChange={e => setSettings({ ...settings, new_vessel_timeout_h: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group-premium">
                                                    <label>Forward Local SDR</label>
                                                    <Toggle
                                                        checked={settings.mqtt_pub_forward_sdr === 'true'}
                                                        onChange={val => setSettings({ ...settings, mqtt_pub_forward_sdr: String(val) })}
                                                    />
                                                </div>
                                                <div className="form-group-premium">
                                                    <label>Forward UDP</label>
                                                    <Toggle
                                                        checked={settings.mqtt_pub_forward_udp === 'true'}
                                                        onChange={val => setSettings({ ...settings, mqtt_pub_forward_udp: String(val) })}
                                                    />
                                                </div>
                                                <div className="form-group-premium">
                                                    <label>Forward AisStream</label>
                                                    <Toggle
                                                        checked={settings.mqtt_pub_forward_aisstream === 'true'}
                                                        onChange={val => setSettings({ ...settings, mqtt_pub_forward_aisstream: String(val) })}
                                                    />
                                                </div>
                                                <div className="form-group-premium">
                                                    <label>Wait for Name before 'new' payload</label>
                                                    <Toggle
                                                        checked={settings.mqtt_pub_wait_for_name === 'true'}
                                                        onChange={val => setSettings({ ...settings, mqtt_pub_wait_for_name: String(val) })}
                                                    />
                                                </div>
                                            </div>

                                            <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: colors.textMuted, marginBottom: '15px', textTransform: 'uppercase' }}>Authentication</div>
                                                <div className="form-group-premium">
                                                    <label>Username</label>
                                                    <input type="text" className="input-premium" value={settings.mqtt_pub_user} onChange={e => setSettings({ ...settings, mqtt_pub_user: e.target.value })} style={{ width: '160px' }} />
                                                </div>
                                                <div className="form-group-premium">
                                                    <label>Password</label>
                                                    <input type="password" className="input-premium" value={settings.mqtt_pub_pass} onChange={e => setSettings({ ...settings, mqtt_pub_pass: e.target.value })} style={{ width: '160px' }} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'trail' && (
                                <div className="settings-grid">
                                    <div className="settings-card">
                                        <div className="settings-card-title"><Activity size={14} /> Trails & Tracks</div>
                                        <div className="form-group-premium">
                                            <label>Enable Vessel Trails (Breadcrumbs)</label>
                                            <Toggle
                                                checked={settings.trail_enabled === 'true'}
                                                onChange={val => setSettings({ ...settings, trail_enabled: String(val) })}
                                            />
                                        </div>
                                        <div className="form-group-premium">
                                            <div>
                                                <label>Tracking Mode</label>
                                                <div className="description">Manage how many trails are visible simultaneously</div>
                                            </div>
                                            <select 
                                                className="select-premium"
                                                value={settings.trail_mode || 'all'} 
                                                onChange={e => setSettings({ ...settings, trail_mode: e.target.value })}
                                            >
                                                <option value="all">Show All Trails</option>
                                                <option value="selected">Only Selected/Hovered</option>
                                            </select>
                                        </div>
                                        <div className="form-group-premium">
                                            <div>
                                                <label>History Duration (Minutes)</label>
                                                <div className="description">How far back trails are shown (requires reload)</div>
                                            </div>
                                            <input type="number" className="input-premium" value={settings.history_duration} onChange={e => setSettings({ ...settings, history_duration: e.target.value })} />
                                        </div>
                                    </div>

                                    <div className="settings-card">
                                        <div className="settings-card-title"><LayoutGrid size={14} /> Trail Styling</div>
                                        <div className="form-group-premium">
                                            <label>Trail Base Color</label>
                                            <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                                                <input type="color" value={settings.trail_color} onChange={e => setSettings({ ...settings, trail_color: e.target.value })} style={{ width: '60px', height: '35px', padding: '2px', border: 'none', background: 'transparent', cursor: 'pointer' }} />
                                                <span style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: colors.textMuted }}>{settings.trail_color.toUpperCase()}</span>
                                            </div>
                                        </div>
                                        <div className="form-group-premium vertical" style={{ marginTop: '10px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                                <label>Trail Thickness</label>
                                                <span style={{ fontSize: '0.85rem', color: '#44aaff', fontWeight: 600 }}>{settings.trail_size}px</span>
                                            </div>
                                            <input type="range" min="0.5" max="8" step="0.5" value={settings.trail_size} onChange={e => setSettings({ ...settings, trail_size: e.target.value })} style={{ width: '100%' }} />
                                        </div>
                                        <div className="form-group-premium vertical" style={{ marginTop: '10px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                                <label>Opacity</label>
                                                <span style={{ fontSize: '0.85rem', color: '#44aaff', fontWeight: 600 }}>{Math.round(parseFloat(settings.trail_opacity) * 100)}%</span>
                                            </div>
                                            <input type="range" min="0.1" max="1" step="0.1" value={settings.trail_opacity} onChange={e => setSettings({ ...settings, trail_opacity: e.target.value })} style={{ width: '100%' }} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'map' && (
                                <div className="settings-grid">
                                    <div className="settings-card">
                                        <div className="settings-card-title"><LayoutGrid size={14} /> Interface & Behavior</div>
                                        <div className="settings-grid-2">
                                            <div style={{ display: 'grid', gap: '15px' }}>
                                                <div className="form-group-premium">
                                                    <label>Show Vessel Names on Map</label>
                                                    <Toggle
                                                        checked={settings.show_names_on_map === 'true'}
                                                        onChange={val => setSettings({ ...settings, show_names_on_map: String(val) })}
                                                    />
                                                </div>
                                                <div className="form-group-premium vertical" style={{ marginTop: '5px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                                        <label>Vessel Name Density</label>
                                                        <span style={{ fontSize: '0.85rem', color: '#44aaff', fontWeight: 600 }}>Level {settings.label_density || '3'}</span>
                                                    </div>
                                                    <input 
                                                        type="range" 
                                                        min="1" 
                                                        max="5" 
                                                        step="1" 
                                                        value={settings.label_density || '3'} 
                                                        onChange={e => setSettings({ ...settings, label_density: e.target.value })} 
                                                        style={{ width: '100%' }} 
                                                    />
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: colors.textMuted, marginTop: '4px' }}>
                                                        <span>Aggressive</span>
                                                        <span>Balanced</span>
                                                        <span>Show All</span>
                                                    </div>
                                                </div>
                                                <div className="form-group-premium vertical">
                                                    <label>UI Theme</label>
                                                    <select className="select-premium" style={{ width: '100%' }} value={settings.map_style} onChange={e => setSettings({ ...settings, map_style: e.target.value })}>
                                                        <option value="light">Light Mode</option>
                                                        <option value="dark">Dark Mode (Night)</option>
                                                    </select>
                                                </div>
                                                <div className="form-group-premium vertical">
                                                    <label>Map Base Layer</label>
                                                    <select className="select-premium" style={{ width: '100%' }} value={settings.base_layer} onChange={e => setSettings({ ...settings, base_layer: e.target.value })}>
                                                        <option value="standard">Standard Vector</option>
                                                        <option value="satellite">Satellite Imagery</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gap: '15px' }}>
                                                <div className="form-group-premium vertical">
                                                    <label>Vessel Detail View</label>
                                                    <select className="select-premium" style={{ width: '100%' }} value={settings.vessel_detail_view} onChange={e => setSettings({ ...settings, vessel_detail_view: e.target.value })}>
                                                        <option value="sidebar">Sidebar (Right)</option>
                                                        <option value="modal">Popup Modal</option>
                                                    </select>
                                                </div>
                                                <div className="form-group-premium vertical">
                                                    <div>
                                                        <label>Cluster Break Zoom</label>
                                                        <div className="description" style={{ fontSize: '0.75rem' }}>Where clusters split into ships</div>
                                                    </div>
                                                    <input
                                                        type="number"
                                                        className="input-premium"
                                                        style={{ width: '100%' }}
                                                        min="1"
                                                        max="20"
                                                        value={settings.cluster_break_zoom || '11'}
                                                        onChange={e => setSettings({ ...settings, cluster_break_zoom: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group-premium">
                                                    <label>Show Range Rings</label>
                                                    <Toggle
                                                        checked={settings.show_range_rings === 'true'}
                                                        onChange={val => setSettings({ ...settings, show_range_rings: String(val) })}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="settings-grid-2">
                                        <div className="settings-card">
                                            <div className="settings-card-title"><TrendingUp size={14} /> Highlight & Detection</div>
                                            <div className="form-group-premium vertical">
                                                <div>
                                                    <label>New Vessel Duration</label>
                                                    <div className="description">Minutes a vessel is highlighted as "NEW"</div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                                                    <input
                                                        type="number"
                                                        className="input-premium"
                                                        min="1"
                                                        max="60"
                                                        value={settings.new_vessel_threshold || '5'}
                                                        onChange={e => setSettings({ ...settings, new_vessel_threshold: e.target.value })}
                                                        style={{ flex: 1 }}
                                                    />
                                                    <span style={{ fontSize: '0.85rem', color: colors.textMuted }}>min</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="settings-card">
                                            <div className="settings-card-title"><Rows size={14} /> Global Object Scaling</div>
                                            <div className="form-group-premium vertical">
                                                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                                    <label>Vessel Icons</label>
                                                    <span style={{ fontSize: '0.85rem', color: '#44aaff', fontWeight: 600 }}>{settings.ship_size}x</span>
                                                </div>
                                                <input type="range" min="0.5" max="3" step="0.1" value={settings.ship_size} onChange={e => setSettings({ ...settings, ship_size: e.target.value })} style={{ width: '100%' }} />
                                            </div>
                                            <div className="form-group-premium vertical">
                                                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                                    <label>Stationary / Aton Icons</label>
                                                    <span style={{ fontSize: '0.85rem', color: '#44aaff', fontWeight: 600 }}>{settings.circle_size}x</span>
                                                </div>
                                                <input type="range" min="0.5" max="3" step="0.1" value={settings.circle_size} onChange={e => setSettings({ ...settings, circle_size: e.target.value })} style={{ width: '100%' }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'coverage' && (
                                <div className="settings-grid">
                                    <div className="settings-card">
                                        <div className="settings-card-title"><Radio size={14} /> Reception Analytics</div>
                                        <div className="form-group-premium">
                                            <div>
                                                <label>Include Internet Data in Range Statistics</label>
                                                <div className="description">If enabled, range heatmap will include vessels from AisStream.io</div>
                                            </div>
                                            <Toggle
                                                checked={settings.include_aisstream_in_range === 'true'}
                                                onChange={val => setSettings({ ...settings, include_aisstream_in_range: String(val) })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'sdr' && (
                                <div className="settings-grid">
                                    <div className="settings-card">
                                        <div className="settings-card-title"><Terminal size={14} /> Hardware Parameters</div>
                                        <div className="settings-grid-2">
                                            <div className="form-group-grid-item">
                                                <div className="label-desc-container">
                                                    <label>PPM Error (Frequency Correction)</label>
                                                    <div className="description">Standard RTL-SDR usually needs 0, 1 or 34.</div>
                                                </div>
                                                <input type="number" className="input-premium" style={{ width: '100%' }} value={settings.sdr_ppm} onChange={e => setSettings({ ...settings, sdr_ppm: e.target.value })} />
                                            </div>
                                            <div className="form-group-grid-item">
                                                <div className="label-desc-container">
                                                    <label>Tuner Gain (dB)</label>
                                                    <div className="description">Set to "auto" for most cases, or e.g. "49.6" for max.</div>
                                                </div>
                                                <input type="text" className="input-premium" style={{ width: '100%' }} value={settings.sdr_gain} onChange={e => setSettings({ ...settings, sdr_gain: e.target.value })} />
                                            </div>
                                        </div>
                                        <div style={{ marginTop: '20px', padding: '12px', background: 'rgba(68,170,255,0.05)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <Info size={16} color="#44aaff" />
                                            <span style={{ fontSize: '0.8rem', color: colors.textMuted }}>Changes to hardware parameters require a full container restart to take effect.</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'hybrid' && (
                                <div className="settings-grid">
                                    <div className="settings-card">
                                        <div className="settings-card-title"><Globe size={14} /> AisStream.io Integration</div>
                                        <div className="form-group-premium">
                                            <label>Enable Hybrid Data Feed</label>
                                            <Toggle
                                                checked={settings.aisstream_enabled === 'true'}
                                                onChange={val => setSettings({ ...settings, aisstream_enabled: String(val) })}
                                            />
                                        </div>
                                        <div className="form-group-premium vertical">
                                            <label>AisStream.io API Key</label>
                                            <input 
                                                type="password" 
                                                className="input-premium"
                                                placeholder="PASTE_YOUR_API_KEY_HERE" 
                                                value={settings.aisstream_api_key} 
                                                onChange={e => setSettings({ ...settings, aisstream_api_key: e.target.value })} 
                                                style={{ width: '100%' }} 
                                            />
                                            <div className="description" style={{ marginTop: '5px' }}>
                                                Obtain a free API key at <a href="https://aisstream.io" target="_blank" rel="noreferrer" style={{color: '#44aaff', fontWeight: 600}}>aisstream.io</a>.
                                            </div>
                                        </div>
                                        
                                        <div style={{ marginTop: '25px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                            <div className="settings-card-title" style={{ color: colors.textMain }}><Radar size={14} /> Geographical Filter Area</div>
                                            <div className="settings-grid-2">
                                                <div className="form-group-grid-item">
                                                    <div className="label-desc-container">
                                                        <label>South West Lat</label>
                                                    </div>
                                                    <input type="number" step="0.001" className="input-premium" style={{ width: '100%' }} value={settings.aisstream_sw_lat} onChange={e => setSettings({...settings, aisstream_sw_lat: e.target.value})} />
                                                </div>
                                                <div className="form-group-grid-item">
                                                    <div className="label-desc-container">
                                                        <label>South West Lon</label>
                                                    </div>
                                                    <input type="number" step="0.001" className="input-premium" style={{ width: '100%' }} value={settings.aisstream_sw_lon} onChange={e => setSettings({...settings, aisstream_sw_lon: e.target.value})} />
                                                </div>
                                                <div className="form-group-grid-item">
                                                    <div className="label-desc-container">
                                                        <label>North East Lat</label>
                                                    </div>
                                                    <input type="number" step="0.001" className="input-premium" style={{ width: '100%' }} value={settings.aisstream_ne_lat} onChange={e => setSettings({...settings, aisstream_ne_lat: e.target.value})} />
                                                </div>
                                                <div className="form-group-grid-item">
                                                    <div className="label-desc-container">
                                                        <label>North East Lon</label>
                                                    </div>
                                                    <input type="number" step="0.001" className="input-premium" style={{ width: '100%' }} value={settings.aisstream_ne_lon} onChange={e => setSettings({...settings, aisstream_ne_lon: e.target.value})} />
                                                </div>
                                            </div>
                                            <button 
                                                className="styled-button" 
                                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', marginTop: '20px', background: 'rgba(68,170,255,0.1)', borderColor: '#44aaff33' }}
                                                onClick={() => {
                                                    onClose();
                                                    setTimeout(() => {
                                                        window.dispatchEvent(new CustomEvent('naviscore_enter_selection'));
                                                    }, 300);
                                                }}
                                            >
                                                <Radar size={18} /> Select Filter Area on Map
                                            </button>
                                        </div>
                                        <div className="form-group-premium" style={{ marginTop: '20px' }}>
                                            <label>Show Hybrid Objects on Main Map</label>
                                            <Toggle
                                                checked={settings.show_aisstream_on_map !== 'false'}
                                                onChange={val => setSettings({ ...settings, show_aisstream_on_map: String(val) })}
                                            />
                                        </div>
                                    </div>

                                    <div className="settings-card">
                                        <div className="settings-card-title"><Wifi size={14} /> Local Data Ingest</div>
                                        <div className="settings-grid-2">
                                            <div className="form-group-premium">
                                                <label>Local SDR Receiver</label>
                                                <Toggle
                                                    checked={settings.sdr_enabled === 'true'}
                                                    onChange={val => setSettings({ ...settings, sdr_enabled: String(val) })}
                                                />
                                            </div>
                                            <div className="form-group-premium">
                                                <label>UDP NMEA Listener</label>
                                                <Toggle
                                                    checked={settings.udp_enabled === 'true'}
                                                    onChange={val => setSettings({ ...settings, udp_enabled: String(val) })}
                                                />
                                            </div>
                                        </div>
                                        <div className="form-group-premium" style={{ marginTop: '10px' }}>
                                            <div>
                                                <label>UDP Ingest Port</label>
                                                <div className="description">Standard AIS NMEA port is 10110</div>
                                            </div>
                                            <input 
                                                type="number" 
                                                className="input-premium"
                                                value={settings.udp_port} 
                                                onChange={e => setSettings({ ...settings, udp_port: e.target.value })} 
                                                style={{ width: '100px' }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'data' && (
                                <div className="settings-grid">
                                    <div className="settings-card">
                                        <div className="settings-card-title"><Calendar size={14} /> Automatic Purge</div>
                                        <div className="form-group-premium">
                                            <div>
                                                <label>Purge vessels after number of days</label>
                                                <div className="description">Vessels and their associated images are permanently deleted after this many days (counted from 'Last Seen').</div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <input
                                                    type="number"
                                                    className="input-premium"
                                                    style={{ width: '100px' }}
                                                    min="7"
                                                    max="3650"
                                                    value={settings.purge_days || '365'}
                                                    onChange={e => setSettings({ ...settings, purge_days: e.target.value })}
                                                />
                                                <span style={{ fontSize: '0.9rem', color: colors.textMuted }}>days</span>
                                            </div>
                                        </div>
                                        <div style={{ marginTop: '15px', padding: '12px', background: 'rgba(68,170,255,0.05)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <Info size={16} color="#44aaff" />
                                            <span style={{ fontSize: '0.8rem', color: colors.textMuted }}>Default value is 365 days (1 year). Images are only deleted if they were uploaded specifically for that vessel.</span>
                                        </div>
                                    </div>

                                    <div className="settings-card" style={{ border: '1px solid rgba(255, 68, 68, 0.2)' }}>
                                         <div className="settings-card-title" style={{ color: '#ff4444' }}><AlertTriangle size={14} /> Danger Zone</div>
                                         
                                         <div style={{ marginBottom: '20px' }}>
                                            <label style={{ color: '#ff4444', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Coverage Statistics</label>
                                            <p style={{ color: colors.textMuted, fontSize: '0.85rem', marginBottom: '10px' }}>
                                                Resetting coverage data will permanently remove all historical range sectors and statistics.
                                            </p>
                                            <button
                                                className="styled-button"
                                                style={{
                                                    width: '100%',
                                                    color: '#ff4444',
                                                    borderColor: '#ff4444',
                                                    padding: '10px',
                                                    fontWeight: 'bold',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '8px',
                                                    background: 'rgba(255, 68, 68, 0.05)'
                                                }}
                                                onClick={async () => {
                                                    if (window.confirm('Are you sure you want to reset all coverage statistics?')) {
                                                        try {
                                                            const isDev = window.location.port === '5173';
                                                            const fetchPath = isDev ? 'http://127.0.0.1:8080/api/coverage/reset' : '/api/coverage/reset';
                                                            await fetch(fetchPath, { method: 'POST' });
                                                            alert('Statistics reset!');
                                                            window.location.reload();
                                                        } catch (e) {
                                                            alert('An error occurred.');
                                                        }
                                                    }
                                                }}
                                            >
                                                <X size={18} /> Reset All Coverage Data
                                            </button>
                                         </div>

                                         <div style={{ paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                            <label style={{ color: '#ff4444', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Full Database Reset</label>
                                            <p style={{ color: colors.textMuted, fontSize: '0.85rem', marginBottom: '10px' }}>
                                                Clears all ships, history, and statistics. <strong>Vessel images will be preserved.</strong>
                                            </p>
                                            <button
                                                className="styled-button"
                                                style={{
                                                    width: '100%',
                                                    color: '#fff',
                                                    borderColor: '#ff2222',
                                                    background: 'linear-gradient(135deg, #ff4444 0%, #cc0000 100%)',
                                                    padding: '12px',
                                                    fontWeight: '900',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '8px',
                                                    boxShadow: '0 4px 15px rgba(255,0,0,0.2)'
                                                }}
                                                onClick={async () => {
                                                    if (window.confirm('⚠️ CRITICAL ACTION: Are you sure you want to wipe the entire database? This cannot be undone. Images will be kept.')) {
                                                        try {
                                                            const isDev = window.location.port === '5173';
                                                            const fetchPath = isDev ? 'http://127.0.0.1:8080/api/reset_db' : '/api/reset_db';
                                                            const res = await fetch(fetchPath, { method: 'POST' });
                                                            if (res.ok) {
                                                                alert('Database wiped successfully! Preserving images.');
                                                                window.location.reload();
                                                            } else {
                                                                alert('Error: ' + (await res.text()));
                                                            }
                                                        } catch (e) {
                                                            alert('An error occurred: ' + e);
                                                        }
                                                    }
                                                }}
                                            >
                                                <Trash2 size={18} /> WIPE DATABASE (KEEP IMAGES)
                                            </button>
                                         </div>
                                     </div>
                                </div>
                            )}
                        </div>

                        <div className="settings-footer">
                            <button className="btn-cancel-premium" onClick={onClose}>Cancel</button>
                            <button 
                                className="styled-button primary" 
                                onClick={() => { onSave(); onClose(); }}
                                style={{ 
                                    padding: '10px 35px', 
                                    borderRadius: '8px', 
                                    background: 'linear-gradient(135deg, #44aaff 0%, #0066cc 100%)', 
                                    boxShadow: '0 4px 15px rgba(0,102,204,0.3)' 
                                }}
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
        </div>
    );
}


// --- UI Components ---
const MultiSelect = ({ label, options, selected, onChange, colors, isDark }: { 
    label: string, 
    options: { value: string, label: string }[], 
    selected: string[], 
    onChange: (values: string[]) => void,
    colors: any,
    isDark: boolean
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const isAllSelected = selected.includes('all') || (selected.length === options.length - 1 && !selected.includes('all'));

    const toggleOption = (val: string) => {
        if (val === 'all') {
            if (isAllSelected) {
                onChange([]); // Deselect all
            } else {
                onChange(['all']); // Select all (using virtual 'all')
            }
        } else {
            let newSelected: string[];
            if (selected.includes('all')) {
                // If 'all' is active, and we click an individual item, 
                // it means we want all EXCEPT that item.
                newSelected = options
                    .map(o => o.value)
                    .filter(v => v !== 'all' && v !== val);
            } else {
                newSelected = [...selected];
                if (newSelected.includes(val)) {
                    newSelected = newSelected.filter(v => v !== val);
                } else {
                    newSelected.push(val);
                }
                
                // If we've manually checked everything, switch back to 'all' for clean state
                if (newSelected.length === options.length - 1) {
                    newSelected = ['all'];
                }
            }
            onChange(newSelected);
        }
    };

    const selectOnly = (e: React.MouseEvent, val: string) => {
        e.stopPropagation();
        onChange([val]);
    };

    const displayText = selected.includes('all') 
        ? label 
        : (selected.length === 0
            ? 'None selected'
            : (selected.length === 1 
                ? options.find(o => o.value === selected[0])?.label 
                : `${selected.length} selected`));

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
            <div 
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    background: isDark ? 'rgba(0,0,0,0.2)' : '#fff',
                    color: (selected.includes('all') || selected.length === 0) ? colors.textMuted : colors.textMain,
                    border: `1px solid ${isOpen ? '#44aaff' : colors.border}`,
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.2s',
                    minHeight: '32px',
                    boxSizing: 'border-box'
                }}
            >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayText}</span>
                <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
            </div>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 1050,
                    marginTop: '4px',
                    background: isDark ? '#1a1a2e' : '#fff',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '8px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                    maxHeight: '350px',
                    overflowY: 'auto',
                    padding: '4px'
                }}>
                    {options.map((opt, idx) => {
                        const isChecked = selected.includes('all') || selected.includes(opt.value);
                        return (
                            <div 
                                key={opt.value}
                                onClick={() => toggleOption(opt.value)}
                                className="multiselect-option"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '8px 10px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    background: isChecked ? (isDark ? 'rgba(68,170,255,0.15)' : '#f0f9ff') : 'transparent',
                                    color: isChecked ? '#44aaff' : colors.textMain,
                                    fontSize: '0.8rem',
                                    transition: 'all 0.1s',
                                    group: 'option'
                                } as any}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                    <div style={{
                                        width: '14px',
                                        height: '14px',
                                        borderRadius: '3px',
                                        border: `1.5px solid ${isChecked ? '#44aaff' : colors.textMuted}`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: isChecked ? '#44aaff' : 'transparent',
                                        transition: 'all 0.1s',
                                        flexShrink: 0
                                    }}>
                                        {isChecked && <Check size={10} color="#fff" strokeWidth={4} />}
                                    </div>
                                    <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                        {opt.value === 'all' ? `(Select All)` : opt.label}
                                    </span>
                                </div>
                                {opt.value !== 'all' && (
                                    <button
                                        onClick={(e) => selectOnly(e, opt.value)}
                                        className="only-button"
                                        style={{
                                            fontSize: '0.65rem',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                            border: 'none',
                                            color: colors.textMuted,
                                            cursor: 'pointer',
                                            opacity: 0,
                                            transition: 'opacity 0.2s'
                                        }}
                                    >
                                        Only
                                    </button>
                                )}
                            </div>
                        );
                    })}
                    <style>{`
                        .multiselect-option:hover .only-button { opacity: 1 !important; }
                        .only-button:hover { background: #44aaff !important; color: white !important; }
                    `}</style>
                </div>
            )}
        </div>
    );
};

export default function App() {
    const [ships, setShips] = useState<any[]>([]);
    const [status, setStatus] = useState('Connecting...');
    const [mqttConnected, setMqttConnected] = useState(false);
    const [hoveredMmsi, setHoveredMmsi] = useState<string | null>(null);
    const [localTimeoutStr, setLocalTimeoutStr] = useState('60');
    const [coverageSectors, setCoverageSectors] = useState<any[]>([]);
    const [flashedMmsis, setFlashedMmsis] = useState<Set<string>>(new Set());
    const flashedMmsisRef = useRef(flashedMmsis);
    useEffect(() => { flashedMmsisRef.current = flashedMmsis; }, [flashedMmsis]);
    const [showFlash, setShowFlash] = useState(() => localStorage.getItem('naviscore_flash') !== 'false');

    // Theme and Settings State
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        const saved = localStorage.getItem('naviscore_theme');
        return (saved === 'dark' || saved === 'light') ? saved : 'light';
    });
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
    const [mqttSettings, setMqttSettings] = useState(() => {
        const savedNames = localStorage.getItem('naviscore_show_names');
        const savedTrails = localStorage.getItem('naviscore_trail_enabled');
        
        return {
            mqtt_enabled: 'false',
            mqtt_url: '',
            mqtt_topic: 'ais',
            mqtt_user: '',
            mqtt_pass: '',
            mqtt_pub_enabled: 'false',
            mqtt_pub_url: '',
            mqtt_pub_topic: 'naviscore/objects',
            mqtt_pub_user: '',
            mqtt_pub_pass: '',
            mqtt_pub_only_new: 'false',
            mqtt_pub_forward_sdr: 'true',
            mqtt_pub_forward_aisstream: 'false',
            forward_enabled: 'false',
            ship_timeout: '60',
            origin_lat: '',
            origin_lon: '',
            show_range_rings: 'true',
            map_style: 'light',
            range_type: '24h',
            base_layer: 'standard',
            history_duration: '60',
            show_names_on_map: savedNames !== null ? savedNames : 'true',
            trail_color: '#ff4444',
            trail_opacity: '0.6',
            trail_enabled: savedTrails !== null ? savedTrails : 'true',
            sdr_ppm: '0',
            sdr_gain: 'auto',
            units: 'nautical',
            ship_size: '1.0',
            circle_size: '1.0',
            trail_size: '2.0',
            aisstream_enabled: 'false',
            aisstream_api_key: '',
            trail_mode: 'all',
            show_aisstream_on_map: 'true',
            sdr_enabled: 'true',
            udp_enabled: 'true',
            udp_port: '10110',
            vessel_detail_view: 'sidebar',
            cluster_break_zoom: '11',
            aisstream_sw_lat: '56.5',
            aisstream_sw_lon: '15.5',
            aisstream_ne_lat: '60.0',
            aisstream_ne_lon: '21.0',
            new_vessel_threshold: '5',
            label_density: '3'
        };
    });
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    
    // Selection Mode for BoundingBox
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectionStart, setSelectionStart] = useState<L.LatLng | null>(null);
    const [currentSelection, setCurrentSelection] = useState<[L.LatLng, L.LatLng] | null>(null);

    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [isNmeaModalOpen, setIsNmeaModalOpen] = useState(false);
    const [isDatabaseModalOpen, setIsDatabaseModalOpen] = useState(false);
    const [databaseShips, setDatabaseShips] = useState<any[]>([]);
    const [dbSearchTerm, setDbSearchTerm] = useState('');
    const [dbFilterType, setDbFilterType] = useState<number | 'all'>('all');
    const [dbFilterSource, setDbFilterSource] = useState<string>('all');
    const [editingMmsi, setEditingMmsi] = useState<string | null>(null);
    const [editBuffer, setEditBuffer] = useState<any>(null);
    const [dbOffset, setDbOffset] = useState(0);
    const [dbHasMore, setDbHasMore] = useState(true);
    const [dbTotal, setDbTotal] = useState(0);
    const [dbSort, setDbSort] = useState({ key: 'last_seen', direction: 'desc' });
    const [dbLoading, setDbLoading] = useState(false);
    const [nmeaLogs, setNmeaLogs] = useState<any[]>([]);
    const [settingsTab, setSettingsTab] = useState('general');

    const [selectedShipMmsi, setSelectedShipMmsi] = useState<string | null>(null);
    const [lastSdrTime, setLastSdrTime] = useState(0);
    const [lastUdpTime, setLastUdpTime] = useState(0);
    const [lastStreamTime, setLastStreamTime] = useState(0);
    const [lastUpdatedShip, setLastUpdatedShip] = useState<any>(null);

    const [isResizing, setIsResizing] = useState(false);
    const isResizingRef = useRef(isResizing);
    const [currentZoom, setCurrentZoom] = useState(10);
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>(() => {
        try {
            const saved = localStorage.getItem('naviscore_sort_config');
            if (saved) return JSON.parse(saved);
        } catch (e) { console.error("Could not load sort config", e); }
        return { key: 'last_seen', direction: 'desc' };
    });
    const [sidebarViewMode, setSidebarViewMode] = useState<'detail' | 'compact'>(() => {
        const saved = localStorage.getItem('naviscore_sidebar_view_mode');
        return (saved === 'compact' || saved === 'detail') ? saved : 'detail';
    });

    useEffect(() => {
        localStorage.setItem('naviscore_sort_config', JSON.stringify(sortConfig));
    }, [sortConfig]);

    useEffect(() => {
        localStorage.setItem('naviscore_sidebar_view_mode', sidebarViewMode);
    }, [sidebarViewMode]);
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = localStorage.getItem('naviscore_sidebar_width');
        return saved ? parseInt(saved) : 380;
    });

    // Sidebar Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [filterSource, setFilterSource] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('naviscore_filter_source');
            if (saved) return JSON.parse(saved);
        } catch (e) { console.error("Could not load filter source", e); }
        return ['all'];
    });
    const [filterShipType, setFilterShipType] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('naviscore_filter_shiptype');
            if (saved) return JSON.parse(saved);
        } catch (e) { console.error("Could not load filter shiptype", e); }
        return ['all'];
    });
    const hoverTimerRef = useRef<number | null>(null);
    const lastFlashRef = useRef<Record<string, number>>({});
    const mapRef = useRef<L.Map>(null);
    
    // Persist UI states to localStorage
    useEffect(() => {
        localStorage.setItem('naviscore_theme', theme);
    }, [theme]);

    useEffect(() => {
        localStorage.setItem('naviscore_show_names', mqttSettings.show_names_on_map);
    }, [mqttSettings.show_names_on_map]);

    useEffect(() => {
        localStorage.setItem('naviscore_trail_enabled', mqttSettings.trail_enabled);
    }, [mqttSettings.trail_enabled]);

    useEffect(() => {
        localStorage.setItem('naviscore_trail_color', mqttSettings.trail_color);
    }, [mqttSettings.trail_color]);

    useEffect(() => {
        localStorage.setItem('naviscore_trail_size', mqttSettings.trail_size);
    }, [mqttSettings.trail_size]);

    useEffect(() => {
        localStorage.setItem('naviscore_trail_opacity', mqttSettings.trail_opacity);
    }, [mqttSettings.trail_opacity]);

    useEffect(() => {
        localStorage.setItem('naviscore_filter_source', JSON.stringify(filterSource));
    }, [filterSource]);

    useEffect(() => {
        localStorage.setItem('naviscore_filter_shiptype', JSON.stringify(filterShipType));
    }, [filterShipType]);

    // Performance & Hybrid Visibility
    const [pinnedMmsis, setPinnedMmsis] = useState<Set<string>>(new Set());
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, mmsi: string } | null>(null);
    const createClusterCustomIcon = useCallback((cluster: any) => {
        const count = cluster.getChildCount();
        const markers = cluster.getAllChildMarkers();
        const hasFlash = markers.some((m: any) => {
            const iconOptions = m.options?.icon?.options;
            //@ts-ignore
            return iconOptions?.mmsi && flashedMmsisRef.current.has(iconOptions.mmsi);
        });

        let sizeClass = 'small';
        if (count >= 10 && count < 100) sizeClass = 'medium';
        else if (count >= 100) sizeClass = 'large';

        const pulseClass = hasFlash ? ' cluster-update-pulse' : '';

        return L.divIcon({
            html: `<div><span>${count}</span></div>`,
            className: `marker-cluster marker-cluster-${sizeClass}${pulseClass}`,
            iconSize: L.point(40, 40)
        } as any);
    }, []);


    const mapShips = useMemo(() => {
        const showAisStream = String(mqttSettings.show_aisstream_on_map) !== 'false';
        return ships.filter(s => {
            if (!showAisStream && s.source === 'aisstream') return false;
            return true;
        });
    }, [ships, mqttSettings.show_aisstream_on_map]);

    const sidebarShips = useMemo(() => {
        return ships.filter(s => {
            const nameUpper = (s.name || "").toUpperCase();
            const mmsiStr = String(s.mmsi || "");
            const showAisStream = String(mqttSettings.show_aisstream_on_map) !== 'false';
            
            // Internet vessel filtering (Always obey map setting for consistency or let sidebar show it?)
            // Usually if it's not on map, maybe it shouldn't be in sidebar? Let's keep consistent with map for now.
            if (!showAisStream && (s.source === 'aisstream')) return false;

            // Search Filter
            if (searchTerm) {
                const term = searchTerm.toUpperCase();
                if (!nameUpper.includes(term) && !mmsiStr.includes(term)) return false;
            }

            // Source Filter
            if (!filterSource.includes('all')) {
                const source = s.source || 'sdr';
                const isMatched = (filterSource.includes('sdr') && (source === 'sdr' || source === 'local')) ||
                                  (filterSource.includes('stream') && source === 'aisstream');
                if (!isMatched) return false;
            }

            // Ship Type Filter
            if (!filterShipType.includes('all')) {
                const category = getShipFilterCategory(s);
                if (!filterShipType.includes(category)) return false;
            }

            return true;
        });
    }, [ships, mqttSettings.show_aisstream_on_map, searchTerm, filterSource, filterShipType]);

    const sidebarShipsCount = useMemo(() => sidebarShips.length, [sidebarShips]);
    
    const vesselCount = useMemo(() => {
        return mapShips.filter(s => {
            const cat = getShipFilterCategory(s);
            // Non-vessels are AtoNs, Base Stations, and Meteo
            return cat !== 'aton' && cat !== 'base_station' && cat !== 'meteo';
        }).length;
    }, [mapShips]);

    const [isHudExpanded, setIsHudExpanded] = useState(() => localStorage.getItem('naviscore_hud_expanded') !== 'false');
    useEffect(() => { localStorage.setItem('naviscore_hud_expanded', String(isHudExpanded)); }, [isHudExpanded]);

    const vesselStatistics = useMemo(() => {
        const statusCounts: Record<string, number> = {};
        const typeCounts: Record<string, { count: number, color: string }> = {};
        const typeLabels: Record<string, string> = {
            cargo: 'Cargo', tanker: 'Tanker', passenger: 'Passenger', fishing: 'Fishing',
            pleasure: 'Pleasure', tug: 'Tug', highspeed: 'HSC', military: 'Military',
            pilot_sar: 'Pilot/SAR', special: 'Special', wig: 'WIG', aton: 'AtoN',
            meteo: 'Meteo', base_station: 'Base Stn', other: 'Other'
        };
        const typeColors: Record<string, string> = {
            cargo: '#22c55e', tanker: '#ef4444', passenger: '#3b82f6', fishing: '#f97316',
            pleasure: '#a855f7', tug: '#06b6d4', highspeed: '#eab308', military: '#4338ca',
            pilot_sar: '#f43f5e', special: '#2e8b57', wig: '#f8fafc', aton: '#d946ef',
            meteo: '#bae6fd', base_station: '#64748b', other: '#a0a0a0'
        };

        for (const s of mapShips) {
            // Status counts (only for actual vessels)
            const cat = getShipFilterCategory(s);
            if (cat !== 'aton' && cat !== 'base_station' && cat !== 'meteo') {
                const st = s.status_text || (s.sog > 0.5 ? 'Under way' : 'Unknown');
                statusCounts[st] = (statusCounts[st] || 0) + 1;
            }

            // Type counts (all objects)
            const label = typeLabels[cat] || 'Other';
            if (!typeCounts[label]) typeCounts[label] = { count: 0, color: typeColors[cat] || '#a0a0a0' };
            typeCounts[label].count++;
        }

        // Sort both by count descending
        const sortedStatus = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);
        const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1].count - a[1].count);

        return { statusCounts: sortedStatus, typeCounts: sortedTypes, total: mapShips.length };
    }, [mapShips]);

    // Fetch settings on mount
    useEffect(() => {
        const isDev = window.location.port === '5173';
        const baseUrl = isDev ? 'http://127.0.0.1:8080' : '/api';
        const fetchPath = isDev ? 'http://127.0.0.1:8080/api/settings' : '/api/settings';

        fetch(fetchPath)
            .then(r => r.json())
            .then(data => {
                setMqttSettings(prev => ({
                    ...data,
                    // Re-apply local overrides after backend load
                    ...(() => {
                        const savedNames = localStorage.getItem('naviscore_show_names');
                        const savedTrails = localStorage.getItem('naviscore_trail_enabled');
                        const savedTrailColor = localStorage.getItem('naviscore_trail_color');
                        const savedTrailSize = localStorage.getItem('naviscore_trail_size');
                        const savedTrailOpacity = localStorage.getItem('naviscore_trail_opacity');
                        
                        const overrides: any = {};
                        if (savedNames !== null) overrides.show_names_on_map = savedNames;
                        if (savedTrails !== null) overrides.trail_enabled = savedTrails;
                        if (savedTrailColor !== null) overrides.trail_color = savedTrailColor;
                        if (savedTrailSize !== null) overrides.trail_size = savedTrailSize;
                        if (savedTrailOpacity !== null) overrides.trail_opacity = savedTrailOpacity;
                        
                        const savedTheme = localStorage.getItem('naviscore_theme');
                        if (savedTheme !== null) overrides.map_style = savedTheme;
                        
                        return overrides;
                    })()
                }));
                setLocalTimeoutStr(data.ship_timeout || '60');
                
                // Only sync theme if not explicitly set in this session? 
                // Actually, let's honor the backend map_style but allow localStorage override.
                const savedTheme = localStorage.getItem('naviscore_theme');
                if (!savedTheme) {
                    setTheme(data.map_style === 'dark' ? 'dark' : 'light');
                }
                
                setIsSettingsLoaded(true);
            })
            .catch((err) => {
                console.error(err);
                setIsSettingsLoaded(true); // Fallback to defaults
            });

        // Fetch station coverage ranges
        const coveragePath = isDev ? 'http://127.0.0.1:8080/api/coverage' : '/api/coverage';
        fetch(coveragePath)
            .then(r => r.json())
            .then(data => setCoverageSectors(data))
            .catch(console.error);
    }, []);

    // Local timeout garbage collector
    useEffect(() => {
        const timeoutMs = parseInt(localTimeoutStr) * 60000;
        if (isNaN(timeoutMs) || timeoutMs <= 0) return; // Ensure timeoutMs is a valid positive number
        const interval = setInterval(() => {
            setShips(prev => prev.filter((s: any) => (Date.now() - s.timestamp) < timeoutMs));
        }, 10000); // Check every 10 seconds
        return () => clearInterval(interval);
    }, [localTimeoutStr]);

    const saveSettings = async (newSettings?: any) => {
        const settingsToSave = newSettings || mqttSettings;
        
        // Save UI settings to localStorage
        if (settingsToSave.show_names_on_map !== undefined) localStorage.setItem('naviscore_show_names', settingsToSave.show_names_on_map);
        if (settingsToSave.trail_enabled !== undefined) localStorage.setItem('naviscore_trail_enabled', settingsToSave.trail_enabled);
        if (settingsToSave.map_style !== undefined) {
            localStorage.setItem('naviscore_theme', settingsToSave.map_style);
            setTheme(settingsToSave.map_style as 'light' | 'dark');
        }
        if (settingsToSave.trail_color !== undefined) localStorage.setItem('naviscore_trail_color', settingsToSave.trail_color);
        if (settingsToSave.trail_size !== undefined) localStorage.setItem('naviscore_trail_size', settingsToSave.trail_size);
        if (settingsToSave.trail_opacity !== undefined) localStorage.setItem('naviscore_trail_opacity', settingsToSave.trail_opacity);

        const isDev = window.location.port === '5173';
        const fetchPath = isDev ? 'http://127.0.0.1:8080/api/settings' : '/api/settings';

        try {
            await fetch(fetchPath, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settingsToSave)
            });

            // Refetch coverage sectors manually
            const coveragePath = isDev ? 'http://127.0.0.1:8080/api/coverage' : '/api/coverage';
            fetch(coveragePath)
                .then(r => r.json())
                .then(data => setCoverageSectors(data))
                .catch(console.error);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchDatabaseShips = useCallback(async (isNewSearch = false) => {
        if (dbLoading && !isNewSearch) return;
        setDbLoading(true);
        
        const currentOffset = isNewSearch ? 0 : dbOffset;
        const limit = 50;
        const isDev = window.location.port === '5173';
        const baseUrl = isDev ? 'http://127.0.0.1:8080/api/database' : '/api/database';
        const sortParam = `&sort=${dbSort.key}&order=${dbSort.direction}`;
        const typeParam = dbFilterType !== 'all' ? `&ship_type=${dbFilterType}` : '';
        const sourceParam = dbFilterSource !== 'all' ? `&source=${dbFilterSource}` : '';
        const url = `${baseUrl}?limit=${limit}&offset=${currentOffset}${dbSearchTerm ? `&q=${encodeURIComponent(dbSearchTerm)}` : ''}${sortParam}${typeParam}${sourceParam}`;

        try {
            const res = await fetch(url);
            const data = await res.json();
            
            const newShips = data.ships || [];
            const total = data.total || 0;
            setDbTotal(total);

            if (isNewSearch) {
                setDatabaseShips(newShips);
                setDbOffset(newShips.length);
            } else {
                setDatabaseShips(prev => [...prev, ...newShips]);
                setDbOffset(prev => prev + newShips.length);
            }
            
            setDbHasMore(newShips.length === limit && (isNewSearch ? newShips.length : dbOffset + newShips.length) < total);
        } catch (err) {
            console.error("Failed to fetch database ships:", err);
        } finally {
            setDbLoading(false);
        }
    }, [dbSearchTerm, dbOffset, dbLoading]);

    useEffect(() => {
        if (isDatabaseModalOpen) {
            const timer = setTimeout(() => {
                fetchDatabaseShips(true);
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [dbSearchTerm, dbFilterType, dbFilterSource, isDatabaseModalOpen, dbSort]);

    useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = extraStyles;
        document.head.appendChild(style);

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const isDev = window.location.port === '5173';
        const wsUrl = isDev ? 'ws://127.0.0.1:8080/ws' : `${protocol}//${window.location.host}/ws`;

        // Load persisted ships from DB on page load
        const shipsPath = isDev ? 'http://127.0.0.1:8080/api/ships' : '/api/ships';
        fetch(shipsPath)
            .then(r => r.json())
            .then((data: any[]) => {
                if (Array.isArray(data) && data.length > 0) {
                    setShips(data.filter((s: any) => s.lat && s.lon));
                }
            })
            .catch(console.error);

        const ws = new WebSocket(wsUrl);
            ws.onopen = () => setStatus('Connected to NavisCore');
            ws.onmessage = (event: MessageEvent) => {
                const data = JSON.parse(event.data);
                
                const nowTime = Date.now();
                if (data.source === 'sdr' || data.source === 'local') setLastSdrTime(nowTime);
                else if (data.source === 'udp') setLastUdpTime(nowTime);
                else if (data.source === 'aisstream') setLastStreamTime(nowTime);

                if (data.mmsi && (data.name || data.mmsi)) {
                    setLastUpdatedShip({
                        name: data.name || `MMSI ${data.mmsi}`,
                        mmsi: data.mmsi,
                        time: nowTime
                    });
                }
            
            // Allow weather objects
            // const nameUpper = (data.name || "").toUpperCase();
            // if (data.is_meteo || nameUpper.includes('METEO') || nameUpper.includes('WEATHER')) return;

            if (data.type === 'status') {
                setStatus('Status: ' + data.message);
            } else if (data.type === 'mqtt_status') {
                setMqttConnected(data.connected);
            } else if (data.type === 'db_reset') {
                setShips([]);
                setNmeaLogs([]);
                setDatabaseShips([]);
                setLastUpdatedShip(null);
                setCoverageSectors([]);
                setStatus('Database Reset Locally');
                setTimeout(() => setStatus('Connected to NavisCore'), 3000);
            } else if (data.type === 'nmea') {
                setNmeaLogs(prev => [{ ...data, id: Date.now() + Math.random() }, ...prev].slice(0, 200));
            } else if (data.type === 'coverage_update') {
                setCoverageSectors(prev => {
                    const idx = prev.findIndex((s: any) => s.sector_id === data.sector_id);
                    const newSector = {
                        sector_id: data.sector_id,
                        range_km_24h: data.range_km_24h,
                        range_km_alltime: data.range_km_alltime
                    };
                    if (idx !== -1) {
                        // Update existing sector
                        const next = [...prev];
                        next[idx] = newSector;
                        return next;
                    }
                    // Insert new sector and keep sorted
                    return [...prev, newSector].sort((a: any, b: any) => a.sector_id - b.sector_id);
                });
            } else {
                setShips((prev: any[]) => {
                    const existing = prev.find((s: any) => s.mmsi === data.mmsi);
                    const historyMax = 100; // Keep a reasonable buffer in memory

                    if (existing) {
                        let newHistory = existing.history || [];
                        if (data.lat && data.lon) {
                            const last = newHistory[newHistory.length - 1];
                            // Only add to history if moved > 50m
                            if (!last || haversineDistance(last[0], last[1], data.lat, data.lon) > 0.05) {
                                newHistory = [...newHistory, [data.lat, data.lon]].slice(-historyMax);
                            }
                        }
                        return prev.map((s: any) => s.mmsi === data.mmsi ? { ...s, ...data, history: newHistory } : s);
                    }
                    const history = (data.lat && data.lon) ? [[data.lat, data.lon]] : [];
                    return [...prev, { ...data, history }];
                });
                // Flash effect with cooldown (10 seconds)
                if (data.mmsi) {
                    const mmsiKey = String(data.mmsi);
                    const now = Date.now();
                    const lastFlash = lastFlashRef.current[mmsiKey] || 0;
                    
                    if (now - lastFlash > 10000) {
                        lastFlashRef.current[mmsiKey] = now;
                        setFlashedMmsis(prev => new Set(prev).add(mmsiKey));
                        setTimeout(() => {
                            setFlashedMmsis(prev => {
                                const next = new Set(prev);
                                next.delete(mmsiKey);
                                return next;
                            });
                        }, 800);
                    }
                }

                // If this ship update includes decoded nmea, update the nmea log entry
                if (data.nmea && data.mmsi) {
                    setNmeaLogs(prev => prev.map(log => {
                        const rawMatches = Array.isArray(data.nmea) 
                            ? data.nmea.includes(log.raw)
                            : log.raw === data.nmea;
                        
                        if (rawMatches) {
                            return { ...log, decoded: data };
                        }
                        return log;
                    }));
                }
            }
        };
        ws.onclose = () => setStatus('Disconnected');
        ws.onerror = () => setStatus('WebSocket Error');

        return () => {
            ws.close();
            document.head.removeChild(style);
        };
    }, []);

    // Handle selection mode from settings
    useEffect(() => {
        const handleEnter = () => setIsSelectionMode(true);
        window.addEventListener('naviscore_enter_selection', handleEnter);
        return () => window.removeEventListener('naviscore_enter_selection', handleEnter);
    }, []);

    const confirmSelection = () => {
        if (currentSelection) {
            const [p1, p2] = currentSelection;
            const sw_lat = Math.min(p1.lat, p2.lat).toFixed(4);
            const sw_lon = Math.min(p1.lng, p2.lng).toFixed(4);
            const ne_lat = Math.max(p1.lat, p2.lat).toFixed(4);
            const ne_lon = Math.max(p1.lng, p2.lng).toFixed(4);
            
            setMqttSettings(prev => ({
                ...prev,
                aisstream_sw_lat: sw_lat,
                aisstream_sw_lon: sw_lon,
                aisstream_ne_lat: ne_lat,
                aisstream_ne_lon: ne_lon
            }));
        }
        setIsSelectionMode(false);
        setSelectionStart(null);
        setCurrentSelection(null);
        setIsSettingsModalOpen(true); // Return to settings
    };

    const cancelSelection = () => {
        setIsSelectionMode(false);
        setSelectionStart(null);
        setCurrentSelection(null);
        setIsSettingsModalOpen(true);
    };

    // Sidebar resizing logic
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            const newWidth = window.innerWidth - e.clientX;
            if (newWidth > 250 && newWidth < 800) {
                setSidebarWidth(newWidth);
            }
        };
        const handleMouseUp = () => {
            if (isResizing) {
                setIsResizing(false);
                localStorage.setItem('naviscore_sidebar_width', sidebarWidth.toString());
                document.body.style.cursor = 'default';
            }
        };

        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = 'auto';
        };
    }, [isResizing, sidebarWidth]);

    // Sync theme to CSS variables (to style body outside of React if needed)
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        setMqttSettings(prev => ({ ...prev, map_style: newTheme }));
    };

    // Remove old ships dynamically based on timeout
    useEffect(() => {
        const msTimeout = parseInt(mqttSettings.ship_timeout) * 60 * 1000;
        if (isNaN(msTimeout) || msTimeout <= 0) return;

        const interval = setInterval(() => {
            const nu = Date.now();
            setShips((prev: any[]) => prev.filter((s: any) => {
                const isMeteo = s.is_meteo || (s.name && (s.name.toUpperCase().includes('METEO') || s.name.toUpperCase().includes('WEATHER')));
                if (isMeteo) return (nu - s.timestamp) < 15 * 60 * 1000;
                return (nu - s.timestamp) < msTimeout;
            }));
        }, 15000);
        return () => clearInterval(interval);
    }, [mqttSettings.ship_timeout]);

    const tileUrl = theme === 'light'
        ? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

    const isDark = theme === 'dark';

    const colors = {
        bgMain: isDark ? '#0f0f1a' : '#f4f6f8',
        bgSidebar: isDark ? '#161625' : '#ffffff',
        bgCard: isDark ? '#1e1e30' : '#ffffff',
        textMain: isDark ? '#e0e0e0' : '#1a1a2e',
        textMuted: isDark ? '#8892b0' : '#64748b',
        border: isDark ? '#2a2a40' : '#e2e8f0',
        accent: '#44aaff',
        accentDark: '#00acc1'
    };

    // Setup CSS variables for popup
    useEffect(() => {
        document.documentElement.style.setProperty('--bg-card', colors.bgCard);
        document.documentElement.style.setProperty('--text-main', colors.textMain);
        document.documentElement.style.setProperty('--border-color', colors.border);
        document.documentElement.style.setProperty('--bg-main', colors.bgMain);
    }, [isDark]);

    const originLat = parseFloat(mqttSettings.origin_lat);
    const originLon = parseFloat(mqttSettings.origin_lon);
    const maxDistance = React.useMemo(() => {
        let maxD = 0;
        if (coverageSectors && coverageSectors.length > 0) {
            coverageSectors.forEach((s: any) => {
                const rangeAmount = mqttSettings.range_type === 'alltime' ? s.range_km_alltime : s.range_km_24h;
                if (rangeAmount > maxD) maxD = rangeAmount;
            });
        }
        return maxD;
    }, [coverageSectors, mqttSettings.range_type]);

    const rangePolygon = React.useMemo(() => {
        if (isNaN(originLat) || isNaN(originLon) || coverageSectors.length === 0) return null;

        const SECTORS = 72; // Same as backend

        // Group contiguous sectors to create solid "pie slices"
        const sortedSectors = [...coverageSectors].sort((a, b) => a.sector_id - b.sector_id);
        if (sortedSectors.length === 0) return null;

        const clusters: any[][] = [];
        let currentCluster = [sortedSectors[0]];

        for (let i = 1; i < sortedSectors.length; i++) {
            const prev = sortedSectors[i - 1];
            const curr = sortedSectors[i];

            // Check if they are adjacent
            if (curr.sector_id === prev.sector_id + 1) {
                currentCluster.push(curr);
            } else {
                clusters.push(currentCluster);
                currentCluster = [curr];
            }
        }

        // Handle wrap-around (sector 71 vs 0)
        if (clusters.length > 1) {
            const first = clusters[0];
            const last = currentCluster;
            if (first[0].sector_id === 0 && last[last.length - 1].sector_id === SECTORS - 1) {
                clusters[0] = last.concat(first);
            } else {
                clusters.push(currentCluster);
            }
        } else {
            clusters.push(currentCluster);
        }

        // Convert clusters to solid polygons (Pie Wedges)
        return clusters.map(cluster => {
            const pts: [number, number][] = [[originLat, originLon]];

            // Outer arc points
            cluster.forEach(s => {
                let rangeAmount = mqttSettings.range_type === 'alltime' ? s.range_km_alltime : s.range_km_24h;
                if (rangeAmount > 1.0) {
                    const startBearing = s.sector_id * (360 / SECTORS);
                    const endBearing = (s.sector_id + 1) * (360 / SECTORS);
                    const midBearing = startBearing + (360 / SECTORS / 2);

                    const p1 = calculateDestinationPoint(originLat, originLon, rangeAmount + 1.2, startBearing);
                    const p2 = calculateDestinationPoint(originLat, originLon, rangeAmount + 1.2, midBearing);
                    const p3 = calculateDestinationPoint(originLat, originLon, rangeAmount + 1.2, endBearing);

                    pts.push([p1[0], p1[1]]);
                    pts.push([p2[0], p2[1]]);
                    pts.push([p3[0], p3[1]]);
                }
            });

            pts.push([originLat, originLon]);
            return pts;
        });
    }, [coverageSectors, originLat, originLon, mqttSettings.range_type]);

    const initialCenter = (() => {
        try {
            const saved = localStorage.getItem('naviscore_center');
            if (saved) {
                const [lat, lng] = JSON.parse(saved);
                if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
            }
        } catch { }
        return (!isNaN(originLat) && !isNaN(originLon)) ? [originLat, originLon] : [59.3293, 18.0686];
    })();

    // Tracker for user switching map layers
    const handleLayerChange = (layerName: string) => {
        let mode = 'standard';
        if (layerName.includes('Satellite')) mode = 'satellite';
        else if (layerName.includes('Sea Chart')) mode = 'osm';
        else if (layerName.includes('Topo')) mode = 'topo';
        else if (layerName.includes('CyclOSM')) mode = 'cyclosm';
        else if (layerName.includes('Voyager')) mode = 'voyager';

        setMqttSettings(prev => {
            const next = { ...prev, base_layer: mode };
            // Auto-save map layers on fly
            const isDev = window.location.port === '5173';
            const fetchPath = isDev ? 'http://127.0.0.1:8080/api/settings' : '/api/settings';
            fetch(fetchPath, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(next)
            }).catch(e => console.error("Could not auto-save layer", e));
            return next;
        });
    };

    function ZoomTracker({ setZoom }: { setZoom: (zoom: number) => void }) {
        useMapEvents({
            baselayerchange: (e: any) => handleLayerChange(e.name),
            zoomend: (e: any) => {
                const z = e.target.getZoom();
                localStorage.setItem('naviscore_zoom', String(z));
                setZoom(z);
            },
            moveend: (e: any) => {
                const c = e.target.getCenter();
                localStorage.setItem('naviscore_center', JSON.stringify([c.lat, c.lng]));
            },
            mousedown: () => { setHoveredMmsi(null); setSelectedShipMmsi(null); }
        });
        return null;
    }

    function BoundingBoxSelector() {
        useMapEvents({
            mousedown: (e) => {
                if (!isSelectionMode) return;
                setSelectionStart(e.latlng);
                setCurrentSelection(null);
                e.target.dragging.disable();
            },
            mousemove: (e) => {
                if (!isSelectionMode || !selectionStart) return;
                setCurrentSelection([selectionStart, e.latlng]);
            },
            mouseup: (e) => {
                if (!isSelectionMode || !selectionStart) return;
                setCurrentSelection([selectionStart, e.latlng]);
                setSelectionStart(null);
                e.target.dragging.enable();
            }
        });
        return currentSelection ? (
            <Rectangle 
                bounds={[
                    [currentSelection[0].lat, currentSelection[0].lng],
                    [currentSelection[1].lat, currentSelection[1].lng]
                ]} 
                pathOptions={{ color: '#44aaff', weight: 2, fillOpacity: 0.1, dashArray: '5,10' }} 
            />
        ) : null;
    }

    const showRangeRings = mqttSettings.show_range_rings === 'true';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: colors.bgMain, color: colors.textMain, overflow: 'hidden' }}>
            {/* Header */}
            <header style={{
                position: 'relative',
                padding: '5px 25px',
                background: isDark ? '#0f0f1a' : '#ffffff',
                color: isDark ? '#44aaff' : '#00838f',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: `1px solid ${colors.border}`,
                boxShadow: isDark ? '0 2px 10px rgba(0,0,0,0.5)' : '0 2px 10px rgba(0,0,0,0.05)',
                zIndex: 1000
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Anchor size={24} />
                        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 600, letterSpacing: '1px' }}>NavisCore</h1>
                    </div>

                    {/* Activity Indicators */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '0 15px', borderLeft: `1px solid ${colors.border}` }}>
                        <div title="SDR Activity" style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: (Date.now() - lastSdrTime < 3000) ? 1 : 0.4, transition: 'all 0.3s' }}>
                            <Radio size={18} color={Date.now() - lastSdrTime < 3000 ? '#00ff80' : colors.textMuted} className={Date.now() - lastSdrTime < 500 ? 'blink-source' : ''} />
                            <span style={{ fontSize: '0.8rem', fontWeight: 800 }}>SDR</span>
                        </div>
                        <div title="UDP Activity" style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: (Date.now() - lastUdpTime < 3000) ? 1 : 0.4, transition: 'all 0.3s' }}>
                            <Database size={18} color={Date.now() - lastUdpTime < 3000 ? '#00ff80' : colors.textMuted} className={Date.now() - lastUdpTime < 500 ? 'blink-source' : ''} />
                            <span style={{ fontSize: '0.8rem', fontWeight: 800 }}>UDP</span>
                        </div>
                        <div title="Stream Activity" style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: (Date.now() - lastStreamTime < 3000) ? 1 : 0.4, transition: 'all 0.3s' }}>
                            <Wifi size={18} color={Date.now() - lastStreamTime < 3000 ? '#00ff80' : colors.textMuted} className={Date.now() - lastStreamTime < 500 ? 'blink-source' : ''} />
                            <span style={{ fontSize: '0.8rem', fontWeight: 800 }}>STR</span>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', color: colors.textMain, fontSize: '0.9rem', fontWeight: 600, paddingLeft: '10px', borderLeft: `1px solid ${colors.border}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Ship size={16} color={isDark ? '#44aaff' : '#00838f'} />
                            <span>Vessels: {vesselCount}</span>
                        </div>
                        
                        {!isNaN(originLat) && !isNaN(originLon) && maxDistance > 0 && (
                            <>
                                <div style={{ width: '1px', height: '16px', background: colors.border }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Navigation size={16} color={isDark ? '#44aaff' : '#0097a7'} />
                                    <span>Station Range: {formatDistance(maxDistance, mqttSettings.units)}</span>
                                </div>
                            </>
                        )}
                    </div>


                    {mqttSettings.mqtt_enabled === 'true' && (
                        <div style={{
                            background: mqttConnected ? (isDark ? 'rgba(0, 255, 128, 0.1)' : '#e6fffa') : (isDark ? 'rgba(255, 50, 50, 0.1)' : '#fff5f5'),
                            color: mqttConnected ? (isDark ? '#00ff80' : '#047857') : (isDark ? '#ff3333' : '#c53030'),
                            padding: '4px 12px',
                            borderRadius: '20px',
                            fontSize: '0.85rem',
                            fontWeight: 500,
                            border: `1px solid ${mqttConnected ? (isDark ? 'rgba(0, 255, 128, 0.3)' : '#a7f3d0') : (isDark ? 'rgba(255, 50, 50, 0.3)' : '#feb2b2')}`,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <div style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: mqttConnected ? (isDark ? '#00ff80' : '#10b981') : (isDark ? '#ff3333' : '#ef4444'),
                                boxShadow: isDark ? `0 0 10px ${mqttConnected ? '#00ff80' : '#ff3333'}` : 'none'
                            }} />
                            MQTT: {mqttConnected ? 'OK' : 'FAIL'}
                        </div>
                    )}

                    {/* Quick Toggles */}
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginLeft: '10px', paddingLeft: '15px', borderLeft: `1px solid ${colors.border}` }}>
                        <button 
                            onClick={() => {
                                const newVal = mqttSettings.show_names_on_map === 'true' ? 'false' : 'true';
                                setMqttSettings(prev => ({ ...prev, show_names_on_map: newVal }));
                                saveSettings({ ...mqttSettings, show_names_on_map: newVal });
                            }}
                            title="Toggle Vessel Names"
                            style={{ background: mqttSettings.show_names_on_map === 'true' ? 'rgba(68,170,255,0.1)' : 'transparent', border: 'none', color: mqttSettings.show_names_on_map === 'true' ? '#44aaff' : colors.textMuted, cursor: 'pointer', padding: '6px', borderRadius: '6px' }}
                        >
                            <User size={18} />
                        </button>
                        <button 
                            onClick={() => {
                                const newVal = mqttSettings.trail_enabled === 'true' ? 'false' : 'true';
                                setMqttSettings(prev => ({ ...prev, trail_enabled: newVal }));
                                saveSettings({ ...mqttSettings, trail_enabled: newVal });
                            }}
                            title="Toggle Trails"
                            style={{ background: mqttSettings.trail_enabled === 'true' ? 'rgba(68,170,255,0.1)' : 'transparent', border: 'none', color: mqttSettings.trail_enabled === 'true' ? '#44aaff' : colors.textMuted, cursor: 'pointer', padding: '6px', borderRadius: '6px' }}
                        >
                            <TrendingUp size={18} />
                        </button>
                        <button 
                            onClick={toggleTheme}
                            title="Toggle Theme"
                            style={{ background: 'transparent', border: 'none', color: colors.textMuted, cursor: 'pointer', padding: '6px', borderRadius: '6px' }}
                        >
                            {isDark ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                    </div>

                    <div style={{ display: 'flex', gap: '5px', borderLeft: `1px solid ${colors.border}`, paddingLeft: '15px' }}>
                        <button
                            onClick={() => setIsStatsModalOpen(true)}
                            style={{ background: 'transparent', border: 'none', color: colors.textMain, cursor: 'pointer', padding: '8px', borderRadius: '8px', transition: 'background 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            title="Statistics"
                        >
                            <BarChart2 size={22} />
                        </button>
                        <button
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            style={{ background: isSidebarOpen ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)') : 'transparent', border: 'none', color: colors.textMain, cursor: 'pointer', padding: '8px', borderRadius: '8px', transition: 'background 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}
                            onMouseLeave={e => { if (!isSidebarOpen) e.currentTarget.style.background = 'transparent' }}
                            title="Seen Objects"
                        >
                            <List size={22} />
                        </button>
                        <button
                            onClick={() => setIsNmeaModalOpen(true)}
                            style={{ background: 'transparent', border: 'none', color: colors.textMain, cursor: 'pointer', padding: '8px', borderRadius: '8px', transition: 'background 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            title="NMEA Info"
                        >
                            <Terminal size={22} />
                        </button>
                        <button
                            onClick={() => setIsDatabaseModalOpen(true)}
                            style={{ background: isDatabaseModalOpen ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)') : 'transparent', border: 'none', color: colors.textMain, cursor: 'pointer', padding: '8px', borderRadius: '8px', transition: 'background 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}
                            onMouseLeave={e => { if (!isDatabaseModalOpen) e.currentTarget.style.background = 'transparent' }}
                            title="Vessel Database"
                        >
                            <Database size={22} />
                        </button>
                        <button
                            onClick={() => setIsSettingsModalOpen(true)}
                            style={{ background: 'transparent', border: 'none', color: colors.textMain, cursor: 'pointer', padding: '8px', borderRadius: '8px', transition: 'background 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            title="Settings"
                        >
                            <Settings size={22} />
                        </button>
                    </div>
                </div>
            </header>

            {isSelectionMode && (
                <div style={{
                    position: 'absolute', top: '100px', left: '50%', transform: 'translateX(-50%)',
                    zIndex: 2000, background: 'rgba(0,0,0,0.8)', color: 'white',
                    padding: '20px 30px', borderRadius: '12px', border: '1px solid #44aaff',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)'
                }}>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#44aaff' }}>Interactive Selection</div>
                    <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>Draw a box on the map to select the coverage area.</div>
                    <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                        <button 
                            className="styled-button" 
                            style={{ flex: 1, borderColor: '#ff4444', color: '#ff4444' }}
                            onClick={cancelSelection}
                        >
                            Cancel
                        </button>
                        <button 
                            className="styled-button primary" 
                            style={{ flex: 1, background: 'linear-gradient(135deg, #44aaff 0%, #0072ff 100%)', border: 'none' }}
                            onClick={confirmSelection}
                            disabled={!currentSelection}
                        >
                            Confirm Selection
                        </button>
                    </div>
                </div>
            )}

            <div style={{ flex: 1, display: 'flex', position: 'relative', minHeight: 0, overflow: 'hidden' }}>

                <div style={{ flex: 1, position: 'relative' }}>
                    {!isSettingsLoaded ? (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', background: colors.bgMain, color: colors.textMuted }}>
                            Loading map...
                        </div>
                    ) : (
                        <MapContainer 
                            ref={mapRef} 
                            key={`map-${theme}`} 
                            center={initialCenter as L.LatLngExpression} 
                            zoom={(() => { try { const z = parseInt(localStorage.getItem('naviscore_zoom') || ''); return isNaN(z) ? 10 : z; } catch { return 10; } })()} 
                            style={{ height: '100%', width: '100%', background: colors.bgMain }} 
                            zoomControl={false}
                            zoomSnap={0.5}
                            zoomDelta={0.5}
                            wheelPxPerZoomLevel={120}
                        >
                            <CenterButton originLat={originLat} originLon={originLon} />
                            <ZoomTracker setZoom={setCurrentZoom} />
                            {isSelectionMode && <BoundingBoxSelector />}
                            
                            {/* Visual representation of current BoundingBox */}
                            {!isSelectionMode && mqttSettings.aisstream_enabled === 'true' && (
                                <Rectangle 
                                    bounds={[
                                        [parseFloat(mqttSettings.aisstream_sw_lat), parseFloat(mqttSettings.aisstream_sw_lon)],
                                        [parseFloat(mqttSettings.aisstream_ne_lat), parseFloat(mqttSettings.aisstream_ne_lon)]
                                    ]}
                                    pathOptions={{ color: '#44aaff', weight: 1, fill: false, opacity: 0.3, dashArray: '10,10' }}
                                />
                            )}
                            <LayersControl position="topright">
                                <LayersControl.BaseLayer name="Standard Map (Minimal)" checked={mqttSettings.base_layer === 'standard' || !mqttSettings.base_layer}>
                                    <TileLayer
                                        url={tileUrl}
                                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                                    />
                                </LayersControl.BaseLayer>
                                <LayersControl.BaseLayer name="Satellite (Esri)" checked={mqttSettings.base_layer === 'satellite'}>
                                    <TileLayer
                                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                        attribution='Tiles &copy; Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                                    />
                                </LayersControl.BaseLayer>
                                <LayersControl.BaseLayer name="Sea Chart / OSM" checked={mqttSettings.base_layer === 'osm'}>
                                    <TileLayer
                                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                    />
                                </LayersControl.BaseLayer>
                                <LayersControl.BaseLayer name="OpenTopoMap" checked={mqttSettings.base_layer === 'topo'}>
                                    <TileLayer
                                        url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                                        attribution='Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
                                    />
                                </LayersControl.BaseLayer>
                                <LayersControl.BaseLayer name="CyclOSM" checked={mqttSettings.base_layer === 'cyclosm'}>
                                    <TileLayer
                                        url="https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png"
                                        attribution='&copy; <a href="https://github.com/cyclosm/cyclosm-cartocss-style/releases" title="CyclOSM - OpenStreetMap bicycle layer">CyclOSM</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                    />
                                </LayersControl.BaseLayer>
                                <LayersControl.BaseLayer name="CartoDB Voyager" checked={mqttSettings.base_layer === 'voyager'}>
                                    <TileLayer
                                        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                                    />
                                </LayersControl.BaseLayer>
                                <LayersControl.BaseLayer name="Esri World Topo" checked={mqttSettings.base_layer === 'esri_topo'}>
                                    <TileLayer
                                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
                                        attribution='Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
                                    />
                                </LayersControl.BaseLayer>
                            </LayersControl>

                            {/* Origin Marker & Ranges */}
                            {originLat !== null && originLon !== null && !isNaN(originLat) && !isNaN(originLon) && (
                                <>
                                    <Marker position={[originLat, originLon]} icon={L.divIcon({
                                        className: 'origin-marker',
                                        html: `<div style="font-size:24px; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">📍</div>`,
                                        iconSize: [24, 24],
                                        iconAnchor: [12, 24]
                                    })}>
                                        <Tooltip direction="top" offset={[0, -20]} opacity={0.9}>
                                            <div style={{ fontWeight: 'bold' }}>SDR Station</div>
                                            <div style={{ fontSize: '0.8rem' }}>{originLat.toFixed(4)}, {originLon.toFixed(4)}</div>
                                            {maxDistance > 0 && <div style={{ fontSize: '0.8rem', color: '#0066cc', marginTop: '4px' }}>Range: {formatDistance(maxDistance, mqttSettings.units)}</div>}
                                        </Tooltip>
                                    </Marker>

                                    {showRangeRings && (
                                        <>
                                            {/* Dynamic Maximum Range Fill*/}
                                            {rangePolygon && rangePolygon.length > 0 && (
                                                <Polygon
                                                    positions={rangePolygon as any}
                                                    pathOptions={{
                                                        color: '#ff9800', // Orange color
                                                        fill: false,
                                                        weight: 2
                                                    }}
                                                />
                                            )}

                                            <RangeRings 
                                                originLat={originLat} 
                                                originLon={originLon} 
                                                isDark={isDark} 
                                            />
                                        </>
                                    )}
                                </>
                            )}

                            <MarkerClusterGroup 
                                key={`cluster-group-${mqttSettings.cluster_break_zoom || '11'}`}
                                chunkedLoading={true} 
                                maxClusterRadius={40} 
                                spiderfyOnMaxZoom={true}
                                disableClusteringAtZoom={parseInt(mqttSettings.cluster_break_zoom || '11')}
                                showCoverageOnHover={false}
                                zoomToBoundsOnClick={true}
                                iconCreateFunction={createClusterCustomIcon}
                            >
                            {mapShips.map((s: any, idx: number) => {
                                const mmsiStr = String(s.mmsi);
                                const now = Date.now();
                                const threshold = parseInt(mqttSettings.new_vessel_threshold || '5');
                                const isNew = s.session_start && (now - s.session_start < threshold * 60000);
                                
                                if (!s.lat || !s.lon) return null;

                                // Smart Label Logic:
                                // 1. Emergency: Always show name
                                // 2. Zoom >= 10: Show all names
                                // 3. Zoom 8-9: Show every 2nd ship
                                // 4. Zoom < 8: Show every 4th ship 
                                let shouldShowName = false;
                                if (mqttSettings.show_names_on_map === 'true' && !s.is_meteo) {
                                    if (s.is_emergency) {
                                        shouldShowName = true;
                                    } else {
                                        const density = parseInt(mqttSettings.label_density || '3');
                                        if (density >= 5) {
                                            shouldShowName = true;
                                        } else if (density >= 4) {
                                            if (currentZoom >= 8) shouldShowName = true;
                                            else if (idx % 2 === 0) shouldShowName = true;
                                        } else if (density >= 3) {
                                            if (currentZoom >= 10) shouldShowName = true;
                                            else if (currentZoom >= 8 && idx % 2 === 0) shouldShowName = true;
                                            else if (idx % 4 === 0) shouldShowName = true;
                                        } else if (density >= 2) {
                                            if (currentZoom >= 12) shouldShowName = true;
                                            else if (currentZoom >= 10 && idx % 3 === 0) shouldShowName = true;
                                            else if (idx % 6 === 0) shouldShowName = true;
                                        } else {
                                            // Aggressive (Density 1)
                                            if (currentZoom >= 14) shouldShowName = true;
                                            else if (currentZoom >= 12 && idx % 4 === 0) shouldShowName = true;
                                            else if (idx % 10 === 0) shouldShowName = true;
                                        }
                                    }
                                }

                                const cog = s.course ?? s.cog;
                                const icon = ShipIcon(
                                    s.sog,
                                    cog,
                                    mmsiStr,
                                    s.shiptype || s.ship_type,
                                    showFlash && flashedMmsis.has(mmsiStr),
                                    parseFloat(mqttSettings.ship_size),
                                    parseFloat(mqttSettings.circle_size),
                                    s.is_meteo,
                                    s.is_aton,
                                    s.aton_type,
                                    s.is_emergency,
                                    s.virtual_aton,
                                    isNew,
                                    isDark
                                );

                                return (
                                    <Marker key={`vessel-${mmsiStr}`} position={[s.lat, s.lon]} icon={icon}
                                        riseOnHover={true}
                                    eventHandlers={{
                                        mouseover: () => {
                                            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                                            hoverTimerRef.current = setTimeout(() => {
                                                setHoveredMmsi(mmsiStr);
                                            }, 300);
                                        },
                                        mouseout: () => {
                                            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                                            setHoveredMmsi(null);
                                        },
                                        click: (e) => {
                                            // Only open if hover card is visible (as requested)
                                            if (hoveredMmsi !== mmsiStr) return;
                                            // If we have a tooltip open, clear it when clicking (opening popup)
                                            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                                            setHoveredMmsi(null);
                                            setSelectedShipMmsi(mmsiStr);
                                        },
                                        contextmenu: (e) => {
                                            setContextMenu({
                                                x: e.originalEvent.clientX,
                                                y: e.originalEvent.clientY,
                                                mmsi: mmsiStr
                                            });
                                        }
                                    }}
                                    >
                                        {/* Smart Label (Fast text under ship) */}
                                        {shouldShowName && (
                                            <Tooltip permanent direction="bottom" offset={[0, 10]} opacity={0.8} className="ship-name-label">
                                                <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.8)', whiteSpace: 'nowrap' }}>
                                                    {s.name || s.mmsi}
                                                </div>
                                            </Tooltip>
                                        )}

                                        {/* Hover Card (Endast synlig om hovrad) */}
                                        {hoveredMmsi === mmsiStr && selectedShipMmsi !== mmsiStr && (
                                            <Tooltip
                                                key={`hover-tip-${mmsiStr}`}
                                                permanent
                                                direction="top"
                                                offset={[0, -15]}
                                                opacity={0.98}
                                                className="custom-tooltip"
                                            >
                                                {s.is_meteo && !s.is_aton ? (
                                                    <div style={{
                                                        display: 'flex', flexDirection: 'column',
                                                        borderRadius: '8px', overflow: 'hidden',
                                                        boxShadow: '0 6px 16px rgba(0,0,0,0.4)',
                                                        width: '280px',
                                                        fontFamily: 'system-ui, -apple-system, sans-serif'
                                                    }}>
                                                        <div style={{ background: '#44aaff', padding: '10px 15px', color: '#fff', fontSize: '1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <Activity size={18} />
                                                            {s.name || 'Meteorological Station'}
                                                        </div>
                                                        <div style={{ background: isDark ? '#1a1a2e' : '#fff', padding: '15px', color: colors.textMain }}>
                                                            <div style={{ fontSize: '0.8rem', color: colors.textMuted, marginBottom: '10px', textAlign: 'center' }}>
                                                                MMSI: {mmsiStr} • {new Date(s.timestamp).toLocaleTimeString()}
                                                            </div>
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                                                <div style={{ background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                                                                    <div style={{ fontSize: '0.7rem', color: colors.textMuted, textTransform: 'uppercase' }}>Wind</div>
                                                                    <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#44aaff' }}>{s.wind_speed ?? '--'}<span style={{ fontSize: '0.7rem', fontWeight: 400, marginLeft: '2px' }}>m/s</span></div>
                                                                    <div style={{ fontSize: '0.7rem', marginTop: '2px' }}>{s.wind_direction ?? '--'}°</div>
                                                                </div>
                                                                <div style={{ background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                                                                    <div style={{ fontSize: '0.7rem', color: colors.textMuted, textTransform: 'uppercase' }}>Environment</div>
                                                                    <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#ffab40' }}>{s.air_temp ?? '--'}<span style={{ fontSize: '0.7rem', fontWeight: 400, marginLeft: '2px' }}>°C</span></div>
                                                                    <div style={{ fontSize: '0.7rem' }}>Water: {s.water_level ?? '--'} m</div>
                                                                    {s.air_pressure && (
                                                                        <div style={{ fontSize: '0.7rem', color: colors.textMuted }}>Pressure: {s.air_pressure} hPa</div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {s.visibility !== undefined && (
                                                                <div style={{ marginTop: '10px', fontSize: '0.75rem', textAlign: 'center', color: colors.textMuted }}>
                                                                    Visibility: <strong>{s.visibility} NM</strong>
                                                                </div>
                                                            )}
                                                            {s.wind_gust > s.wind_speed && (
                                                                <div style={{ marginTop: '10px', padding: '6px', background: 'rgba(255, 50, 50, 0.1)', color: '#ff3333', borderRadius: '6px', fontSize: '0.75rem', textAlign: 'center', fontWeight: 'bold' }}>
                                                                    ⚠️ Wind gusts up to {s.wind_gust} m/s
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ 
                                                        display: 'flex', 
                                                        flexDirection: 'column', 
                                                        background: colors.bgCard, 
                                                        padding: '0', 
                                                        borderRadius: '12px', 
                                                        color: colors.textMain,
                                                        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                                                        border: `1px solid ${colors.border}`,
                                                        minWidth: '280px', width: (s.is_aton || mmsiStr.startsWith('99')) ? 'auto' : '280px', maxWidth: '450px',
                                                        overflow: 'hidden',
                                                        fontFamily: 'system-ui, -apple-system, sans-serif'
                                                    }}>
                                                        {/* Top: Vessel Image (Hidden for AtoNs) */}
                                                        {!(s.is_aton || mmsiStr.startsWith('99')) && (
                                                            <div style={{ position: 'relative', width: '100%', height: '160px', background: '#0a0a0a', borderBottom: `1px solid ${colors.border}` }}>
                                                                {s.imageUrl ? (
                                                                    <img
                                                                        src={s.imageUrl}
                                                                        onError={(e) => { (e.target as HTMLImageElement).src = "/images/0.jpg"; }}
                                                                        alt={s.name}
                                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                                    />
                                                                ) : (
                                                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.textMuted, flexDirection: 'column', gap: '8px' }}>
                                                                        <Ship size={32} />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Header: Flag, Name (MMSI), Speed/Fixed Aid */}
                                                         {/* Header: Flag, Name (MMSI), Speed/Fixed Aid */}
                                                         <div style={{ padding: (s.is_aton || mmsiStr.startsWith('99')) ? '10px 15px' : '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                                                 <span style={{ fontSize: '1.1rem', lineHeight: 1 }} dangerouslySetInnerHTML={{ __html: getFlagEmoji(mmsiStr, s.country_code) }} />
                                                                 <strong style={{ 
                                                                     fontSize: (s.is_aton || mmsiStr.startsWith('99')) ? '1rem' : '0.9rem', 
                                                                     fontWeight: 800, 
                                                                     whiteSpace: 'nowrap',
                                                                     textOverflow: (s.is_aton || mmsiStr.startsWith('99')) ? 'initial' : 'ellipsis',
                                                                     overflow: (s.is_aton || mmsiStr.startsWith('99')) ? 'initial' : 'hidden'
                                                                 }}>
                                                                     {s.name || 'Unknown'} 
                                                                 </strong>
                                                             </div>
                                                             <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                                                                 {!(s.is_aton || mmsiStr.startsWith('99')) ? (
                                                                     <>
                                                                         <span style={{ fontSize: '0.55rem', color: colors.textMuted, textTransform: 'uppercase', fontWeight: 900, lineHeight: 1 }}>
                                                                             {(s.shiptype === 9 || s.is_sar) ? 'Airspeed' : 'SOG'}
                                                                         </span>
                                                                         <span style={{ color: '#10b981', fontWeight: 900, fontSize: '0.95rem', whiteSpace: 'nowrap' }}>
                                                                              {formatSpeed(s.sog, mqttSettings.units)}
                                                                         </span>
                                                                     </>
                                                                 ) : null}
                                                             </div>
                                                         </div>

                                                        {/* Content Grid */}
                                                        <div style={{ background: 'rgba(0,0,0,0.05)', borderTop: `1px solid ${colors.border}` }}>
                                                            {/* Compact Position Info for AtoNs */}
                                                            {(s.is_aton || mmsiStr.startsWith('99')) ? (
                                                                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '10px 0', gap: '0' }}>
                                                                     <div style={{ textAlign: 'center', borderRight: `1px solid ${colors.border}` }}>
                                                                         <div style={{ fontSize: '0.55rem', color: colors.textMuted, textTransform: 'uppercase', fontWeight: 900 }}>Dist</div>
                                                                         <div style={{ height: '1px', background: colors.border, width: '15px', margin: '4px auto' }} />
                                                                         <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#44aaff' }}>{formatDistance(haversineDistance(originLat, originLon, s.lat, s.lon), mqttSettings.units)}</div>
                                                                     </div>
                                                                     <div style={{ textAlign: 'center', borderRight: `1px solid ${colors.border}` }}>
                                                                         <div style={{ fontSize: '0.55rem', color: colors.textMuted, textTransform: 'uppercase', fontWeight: 900 }}>Brg</div>
                                                                         <div style={{ height: '1px', background: colors.border, width: '15px', margin: '4px auto' }} />
                                                                         <div style={{ fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                                             <Navigation size={8} style={{ transform: `rotate(${calculateBearing(originLat, originLon, s.lat, s.lon)}deg)`, color: colors.textMuted }} />
                                                                             {calculateBearing(originLat, originLon, s.lat, s.lon)?.toFixed(0) ?? '0'}°
                                                                         </div>
                                                                     </div>
                                                                     <div style={{ textAlign: 'center' }}>
                                                                         <div style={{ fontSize: '0.55rem', color: colors.textMuted, textTransform: 'uppercase', fontWeight: 900 }}>Seen</div>
                                                                         <div style={{ height: '1px', background: colors.border, width: '15px', margin: '4px auto' }} />
                                                                         <div style={{ fontSize: '0.75rem', fontWeight: 700, color: colors.accent }}>{getTimeAgo(s.timestamp)}</div>
                                                                     </div>
                                                                 </div>
                                                            ) : (
                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                                                            {/* Status - Hidden for AtoNs */}
                                                            {!(s.is_aton || mmsiStr.startsWith('99')) && (
                                                                <div style={{ padding: '6px 12px', borderRight: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}` }}>
                                                                    <div style={{ fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', fontWeight: 'bold' }}>Status</div>
                                                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#44aaff', lineHeight: '1.1', whiteSpace: 'normal' }}>
                                                                        {s.status_text || 'Underway'}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Type */}
                                                            <div style={{ 
                                                                padding: '6px 12px', 
                                                                borderBottom: `1px solid ${colors.border}`,
                                                                gridColumn: (s.is_aton || mmsiStr.startsWith('99')) ? 'span 2' : 'auto'
                                                            }}>
                                                                <div style={{ fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', fontWeight: 'bold' }}>Type</div>
                                                                <div style={{ fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {s.virtual_aton ? 'Virtual AtoN' : (s.ship_type_text || (s.shiptype ? `Type ${s.shiptype}` : ((s.is_aton || mmsiStr.startsWith('99')) ? 'Fixed Aid' : 'Unknown')))}
                                                                </div>
                                                            </div>

                                                            {/* Distance */}
                                                            <div style={{ padding: '6px 12px', borderRight: `1px solid ${colors.border}` }}>
                                                                <div style={{ fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', fontWeight: 'bold' }}>Dist</div>
                                                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#44aaff' }}>
                                                                    {formatDistance(haversineDistance(originLat, originLon, s.lat, s.lon), mqttSettings.units)}
                                                                </div>
                                                            </div>

                                                            {/* Bearing */}
                                                            <div style={{ padding: '6px 12px', display: 'flex', flexDirection: 'column' }}>
                                                                <div style={{ fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', fontWeight: 'bold' }}>Brg</div>
                                                                <div style={{ fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <Navigation 
                                                                        size={10} 
                                                                        style={{ 
                                                                            transform: `rotate(${calculateBearing(originLat, originLon, s.lat, s.lon)}deg)`, 
                                                                            color: colors.textMuted
                                                                        }} 
                                                                    />
                                                                {calculateBearing(originLat, originLon, s.lat, s.lon)?.toFixed(0) ?? '0'}°
                                                            </div>
                                                        </div>

                                                                     {/* Last Seen & MMSI combined */}
                                                                     <div style={{ padding: '6px 12px', borderTop: `1px solid ${colors.border}`, borderRight: `1px solid ${colors.border}` }}>
                                                                         <div style={{ fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', fontWeight: 'bold' }}>Last Seen</div>
                                                                         <div style={{ fontSize: '0.75rem', fontWeight: 700, color: colors.accent }}>{getTimeAgo(s.timestamp)}</div>
                                                                     </div>
                                                                     <div style={{ padding: '6px 12px', borderTop: `1px solid ${colors.border}` }}>
                                                                         <div style={{ fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', fontWeight: 'bold' }}>MMSI</div>
                                                                         <div style={{ fontSize: '0.75rem', fontWeight: 700, color: colors.textMuted }}>{mmsiStr}</div>
                                                                     </div>
                                                                    </div>
                                                            )}
                                                        </div>

                                                        {/* Weather Data for AtoNs if available */}
                                                        {(s.is_aton || mmsiStr.startsWith('99')) && (s.wind_speed !== undefined || s.air_temp !== undefined) && (
                                                             <div style={{ 
                                                                 padding: '10px 0',
                                                                 background: isDark ? 'rgba(68, 170, 255, 0.08)' : 'rgba(0, 131, 143, 0.08)',
                                                                 borderTop: `1px solid ${colors.border}`,
                                                                 display: 'flex',
                                                                 justifyContent: 'space-around',
                                                                 alignItems: 'center'
                                                             }}>
                                                                 {s.wind_speed !== undefined && (
                                                                     <div style={{ textAlign: 'center', flex: 1, borderRight: `1px solid ${colors.border}` }}>
                                                                         <div style={{ fontSize: '0.55rem', color: colors.textMuted, textTransform: 'uppercase', fontWeight: 900 }}>Wind</div>
                                                                         <div style={{ height: '1px', background: colors.border, width: '15px', margin: '4px auto' }} />
                                                                         <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#44aaff' }}>{s.wind_speed} <span style={{ fontSize: '0.6rem', fontWeight: 400 }}>m/s</span></div>
                                                                         {s.wind_direction !== undefined && <div style={{ fontSize: '0.6rem', opacity: 0.7 }}>{s.wind_direction}°</div>}
                                                                     </div>
                                                                 )}
                                                                 {s.air_temp !== undefined && (
                                                                     <div style={{ textAlign: 'center', flex: 1, borderRight: s.air_pressure !== undefined ? `1px solid ${colors.border}` : 'none' }}>
                                                                         <div style={{ fontSize: '0.55rem', color: colors.textMuted, textTransform: 'uppercase', fontWeight: 900 }}>Temp</div>
                                                                         <div style={{ height: '1px', background: colors.border, width: '15px', margin: '4px auto' }} />
                                                                         <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#ffab40' }}>{s.air_temp}°C</div>
                                                                     </div>
                                                                 )}
                                                                 {s.air_pressure !== undefined && (
                                                                     <div style={{ textAlign: 'center', flex: 1 }}>
                                                                         <div style={{ fontSize: '0.55rem', color: colors.textMuted, textTransform: 'uppercase', fontWeight: 900 }}>Baro</div>
                                                                         <div style={{ height: '1px', background: colors.border, width: '15px', margin: '4px auto' }} />
                                                                         <div style={{ fontSize: '0.9rem', fontWeight: 900, color: colors.textMain }}>{s.air_pressure?.toFixed(0) ?? '--'} <span style={{ fontSize: '0.6rem', fontWeight: 400 }}>hPa</span></div>
                                                                     </div>
                                                                 )}
                                                             </div>
                                                         )}

                                                         {/* Footer Info for AtoNs */}
                                                         {(s.is_aton || mmsiStr.startsWith('99')) && (
                                                             <div style={{ padding: '6px 12px', borderTop: `1px solid ${colors.border}` }}>
                                                                 <div style={{ fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', fontWeight: 'bold' }}>MMSI</div>
                                                                 <div style={{ fontSize: '0.75rem', fontWeight: 700, color: colors.textMuted }}>{mmsiStr}</div>
                                                             </div>
                                                         )}

                                                        {/* Special Indicators (Tropo, Emergency, Altitude) */}
                                                        {((s.shiptype === 9 || s.is_sar) && s.altitude !== undefined) || s.is_emergency || (haversineDistance(originLat, originLon, s.lat, s.lon) > 74.08) ? (
                                                            <div style={{ padding: '6px 12px', borderTop: `1px solid ${colors.border}`, background: 'rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                {Boolean(s.shiptype === 9 || s.is_sar) && s.altitude !== undefined && (
                                                                    <div style={{ fontSize: '0.7rem', color: '#44aaff', fontWeight: 800, textAlign: 'center' }}>
                                                                        Altitude: {s.altitude * 10} ft
                                                                    </div>
                                                                )}
                                                                {s.is_emergency && (
                                                                    <div style={{ background: '#ff0000', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 900, textAlign: 'center' }}>
                                                                        ⚠️ EMERGENCY
                                                                    </div>
                                                                )}
                                                                {(() => {
                                                                    const dist = haversineDistance(originLat, originLon, s.lat, s.lon);
                                                                    if (dist > 185.2) {
                                                                        return (
                                                                            <div style={{ background: 'linear-gradient(90deg, #ff00ff, #aa00ff)', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 900, textAlign: 'center', boxShadow: '0 0 8px rgba(255, 0, 255, 0.4)' }}>
                                                                                ✨ TROPO DUCTING
                                                                            </div>
                                                                        );
                                                                    } else if (dist > 74.08) {
                                                                        return (
                                                                            <div style={{ background: 'linear-gradient(90deg, #00d2ff, #3a7bd5)', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 900, textAlign: 'center', boxShadow: '0 0 8px rgba(0, 210, 255, 0.4)' }}>
                                                                                📡 ENHANCED RANGE
                                                                            </div>
                                                                        );
                                                                    }
                                                                    return null;
                                                                })()}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                )}
                                            </Tooltip>
                                        )}

                                        {/* Detailed Popup on Click - NOT for meteo markers */}
                                        {(selectedShipMmsi === mmsiStr && !s.is_meteo) && <Popup className="custom-detailed-popup" offset={[0, -20]}>
                                            <div style={{ display: 'flex', flexDirection: 'column', width: '460px' }}>
                                                {/* SHIP NAME HEADER */}
                                                <div style={{ padding: '10px 15px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'flex-start', gap: '12px', background: 'var(--bg-card)' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '45px' }}>
                                                        <span style={{ fontSize: '1.6rem', display: 'flex' }} dangerouslySetInnerHTML={{ __html: getFlagEmoji(mmsiStr, s.country_code) }} />
                                                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: '1', fontWeight: 'bold' }}>
                                                            {getCountryName(s.country_code)}
                                                        </span>
                                                    </div>
                                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                                        <div style={{ fontWeight: '700', fontSize: '1.05rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span>{s.name || 'Unknown Vessel'} ({mmsiStr})</span>
                                                            {s.callsign && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>{s.callsign}</span>}
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                            Messages: {s.message_count || 1} • Last Signal: {getTimeAgo(s.timestamp)}
                                                            {s.previous_seen && <span> • Prev. Seen: {getTimeAgo(s.previous_seen)}</span>}
                                                        </div>
                                                        {s.status_text && (
                                                            <div style={{ fontSize: '0.75rem', color: '#44aaff', fontWeight: 'bold', marginTop: '2px' }}>
                                                                {s.status_text}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', flexDirection: 'row', background: 'var(--bg-card)' }}>
                                                    {/* LEFT: Image */}
                                                    <div style={{ width: '220px', minWidth: '220px', height: '160px', position: 'relative', borderRight: `1px solid ${colors.border}` }}>
                                                        {s.imageUrl && !(s.is_aton || mmsiStr.startsWith('99')) ? (
                                                            <div style={{ width: '100%', height: '100%', backgroundImage: `url(${s.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                                                                <div style={{ position: 'absolute', bottom: '5px', left: '8px', color: '#fff', fontSize: '0.75rem', fontWeight: 'bold', textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}>
                                                                    NavisCore
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div style={{ width: '100%', height: '100%', background: colors.bgMain, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.textMuted, flexDirection: 'column', gap: '8px' }}>
                                                                {(s.is_aton || mmsiStr.startsWith('99')) ? (
                                                                    <>
                                                                        <Navigation size={64} color={isDark ? '#44aaff' : '#00838f'} />
                                                                        <span style={{ fontSize: '1rem', fontWeight: 600 }}>Aids to Navigation</span>
                                                                    </>
                                                                ) : (
                                                                    'No image'
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* RIGHT: Stats */}
                                                    <div style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                            <div>
                                                                <div style={{ fontSize: '0.7rem', color: colors.textMuted, textTransform: 'uppercase' }}>
                                                                    {(s.shiptype === 9 || s.is_sar) ? 'Airspeed / Course' : 'SOG / COG'}
                                                                </div>
                                                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{formatSpeed(s.sog, mqttSettings.units)} / {s.cog?.toFixed(0) ?? '--'}°</div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: '0.7rem', color: colors.textMuted, textTransform: 'uppercase' }}>
                                                                    {(s.shiptype === 9 || s.is_sar) ? 'Altitude' : 'Dimensions'}
                                                                </div>
                                                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                                                    {(s.shiptype === 9 || s.is_sar) ? (s.altitude !== undefined ? `${s.altitude * 10} ft` : '--') : (s.length && s.width ? `${s.length}x${s.width}m` : '--')}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: '0.7rem', color: colors.textMuted, textTransform: 'uppercase' }}>Station Distance</div>
                                                                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#44aaff' }}>{formatDistance(haversineDistance(originLat, originLon, s.lat, s.lon), mqttSettings.units)}</div>
                                                            </div>
                                                                {s.is_emergency && (
                                                                    <div style={{ gridColumn: 'span 2', background: '#ff0000', color: '#fff', padding: '8px', borderRadius: '4px', textAlign: 'center', fontWeight: 'bold', animation: 'emergency-flash 1s infinite alternate' }}>
                                                                        ⚠️ EMERGENCY
                                                                    </div>
                                                                )}
                                                                {s.virtual_aton && (
                                                                    <div style={{ gridColumn: 'span 2', background: '#ff00ff', color: '#fff', padding: '4px', borderRadius: '4px', textAlign: 'center', fontSize: '0.75rem' }}>
                                                                        VIRTUAL AIS STATION
                                                                    </div>
                                                                )}
                                                                <div>
                                                                <div style={{ fontSize: '0.7rem', color: colors.textMuted, textTransform: 'uppercase' }}>Type / Stat</div>
                                                                <div style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.ship_type_text || (s.shiptype ? `Type ${s.shiptype}` : 'N/A')}</div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: '0.7rem', color: colors.textMuted, textTransform: 'uppercase' }}>Draught</div>
                                                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{s.draught ? `${s.draught}m` : '--'}</div>
                                                            </div>
                                                        </div>
                                                        
                                                        {s.is_advanced_binary && (
                                                            <div style={{ marginTop: '4px', padding: '6px', background: 'rgba(246,139,31,0.1)', borderRadius: '4px', border: '1px solid rgba(246,139,31,0.2)' }}>
                                                                <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#f68b1f', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                                                    <Terminal size={12} /> BINARY PAYLOAD
                                                                </div>
                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '0.65rem' }}>
                                                                    <div><span style={{ color: colors.textMuted }}>DAC:</span> {s.dac}</div>
                                                                    <div><span style={{ color: colors.textMuted }}>FI:</span> {s.fid}</div>
                                                                </div>
                                                                {s.raw_payload && (
                                                                    <div style={{ marginTop: '4px', fontSize: '0.6rem', fontFamily: 'monospace', wordBreak: 'break-all', color: colors.textMuted, background: 'rgba(0,0,0,0.05)', padding: '2px' }}>
                                                                        {s.raw_payload.substring(0, 60)}{s.raw_payload.length > 60 ? '...' : ''}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        <div style={{ marginTop: '2px', borderTop: `1px solid ${colors.border}`, paddingTop: '8px' }}>
                                                            <div style={{ fontSize: '0.7rem', color: colors.textMuted, textTransform: 'uppercase' }}>Destination / Update</div>
                                                            <div style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {s.destination || '--'} • {new Date(s.timestamp).toLocaleTimeString()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </Popup>}
                                    </Marker>
                                );
                            })}
                            </MarkerClusterGroup>

                            {/* Ship History Trails */}
                            {ships.map((s: any) => {
                                const nameUpper = (s.name || "").toUpperCase();
                                if (mqttSettings.trail_enabled !== 'true' || !s.history || s.history.length < 2 || s.is_meteo || nameUpper.includes('METEO') || nameUpper.includes('WEATHER')) return null;
                                
                                const mmsiStr = String(s.mmsi);
                                const isHovered = hoveredMmsi === mmsiStr;
                                const isSelected = selectedShipMmsi === mmsiStr;
                                const isPinned = pinnedMmsis.has(mmsiStr);

                                // Logic for selective tracking & Internet vessel filtering
                                const showAisStream = String(mqttSettings.show_aisstream_on_map) !== 'false';
                                if (!showAisStream && (s.source === 'aisstream')) return null;

                                // If trail_mode is 'selected', only show for hovered/selected/pinned
                                if (mqttSettings.trail_mode === 'selected' && !isHovered && !isSelected && !isPinned) return null;

                                const trailColor = mqttSettings.trail_color || '#ff4444';
                                const trailWeight = (isHovered || isSelected || isPinned) ? (parseFloat(mqttSettings.trail_size || '2.0') + 1) : parseFloat(mqttSettings.trail_size || '2.0');
                                const trailOpacity = (isHovered || isSelected || isPinned) ? 0.9 : parseFloat(mqttSettings.trail_opacity || '0.6');

                                return (
                                    <Polyline
                                        key={`trail-${s.mmsi}`}
                                        positions={s.history}
                                        pathOptions={{
                                            color: trailColor,
                                            weight: trailWeight,
                                            opacity: trailOpacity,
                                            dashArray: (isHovered || isSelected || isPinned) ? undefined : '5, 5'
                                        }}
                                    />
                                );
                            })}

                            {/* COG Course Line on Hover (Prediction - adjusted to be more subtle) */}
                            {hoveredMmsi && (() => {
                                const hs = ships.find((s: any) => String(s.mmsi) === hoveredMmsi);
                                if (hs && hs.lat && hs.lon && hs.cog != null && hs.sog > 0.1) {
                                    const cogRad = (hs.cog * Math.PI) / 180;
                                    const lineLen = Math.max(0.015, hs.sog * 0.003); // shorter / more subtle
                                    const endLat = hs.lat + lineLen * Math.cos(cogRad);
                                    const endLon = hs.lon + lineLen * Math.sin(cogRad) / Math.cos(hs.lat * Math.PI / 180);
                                    return <Polyline positions={[[hs.lat, hs.lon], [endLat, endLon]]} pathOptions={{ color: '#aaa', weight: 1.5, dashArray: '4 4', opacity: 0.6 }} />;
                                }
                                return null;
                            })()}


                            <ZoomControl position="bottomleft" />
                        </MapContainer>
                    )}

                    {/* Vessel Status HUD */}
                    {isSettingsLoaded && (
                        <div
                            id="vessel-status-hud"
                            style={{
                                position: 'absolute',
                                top: '12px',
                                left: '50px',
                                zIndex: 1000,
                                background: isDark ? 'rgba(10, 10, 20, 0.85)' : 'rgba(255, 255, 255, 0.9)',
                                backdropFilter: 'blur(12px)',
                                WebkitBackdropFilter: 'blur(12px)',
                                borderRadius: isHudExpanded ? '12px' : '8px',
                                border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                                boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.5)' : '0 4px 20px rgba(0,0,0,0.1)',
                                color: colors.textMain,
                                fontSize: '0.75rem',
                                minWidth: isHudExpanded ? '200px' : 'auto',
                                maxWidth: '280px',
                                transition: 'all 0.25s ease',
                                overflow: 'hidden',
                                userSelect: 'none'
                            }}
                        >
                            {/* HUD Header - always visible */}
                            <div
                                onClick={() => setIsHudExpanded(!isHudExpanded)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: isHudExpanded ? '8px 12px' : '6px 10px',
                                    cursor: 'pointer',
                                    gap: '8px',
                                    borderBottom: isHudExpanded ? `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}` : 'none',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Activity size={13} color={isDark ? '#44aaff' : '#0066cc'} />
                                    <span style={{ fontWeight: 800, fontSize: '0.7rem', letterSpacing: '0.5px', textTransform: 'uppercase', color: isDark ? '#44aaff' : '#0066cc' }}>
                                        Status
                                    </span>
                                    <span style={{
                                        background: isDark ? 'rgba(68,170,255,0.15)' : 'rgba(0,102,204,0.1)',
                                        color: isDark ? '#44aaff' : '#0066cc',
                                        padding: '1px 6px',
                                        borderRadius: '10px',
                                        fontSize: '0.65rem',
                                        fontWeight: 800
                                    }}>
                                        {vesselStatistics.total}
                                    </span>
                                </div>
                                <ChevronDown size={12} style={{ color: colors.textMuted, transform: isHudExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                            </div>

                            {/* HUD Content - collapsible */}
                            {isHudExpanded && (
                                <div style={{ padding: '6px 12px 10px 12px' }}>
                                    {/* Nav Status Section */}
                                    {vesselStatistics.statusCounts.length > 0 && (
                                        <div style={{ marginBottom: '8px' }}>
                                            <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: colors.textMuted, marginBottom: '4px' }}>Nav Status</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                {vesselStatistics.statusCounts.map(([status, count]) => (
                                                    <div key={status} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
                                                        <span style={{ color: colors.textMain, fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '170px' }}>{status}</span>
                                                        <span style={{ fontWeight: 700, fontSize: '0.72rem', color: isDark ? '#44aaff' : '#0066cc', minWidth: '20px', textAlign: 'right' }}>{count}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Divider */}
                                    <div style={{ height: '1px', background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', margin: '4px 0 6px 0' }} />

                                    {/* Type Section */}
                                    <div>
                                        <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: colors.textMuted, marginBottom: '4px' }}>By Type</div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                                            {vesselStatistics.typeCounts.map(([label, data]) => (
                                                <div key={label} style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                                                    padding: '2px 7px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.68rem'
                                                }}>
                                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: data.color, flexShrink: 0 }} />
                                                    <span style={{ color: colors.textMain, fontWeight: 500 }}>{label}</span>
                                                    <span style={{ fontWeight: 800, color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)' }}>{data.count}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                </div>

                {/* Expandable Right Sidebar */}
                {isSidebarOpen && (
                    <>
                        {/* Resize Handle */}
                        <div
                            onMouseDown={() => setIsResizing(true)}
                            style={{
                                width: '6px',
                                cursor: 'col-resize',
                                background: isResizing ? '#44aaff' : 'transparent',
                                zIndex: 1001,
                                transition: 'background 0.2s',
                                borderLeft: `1px solid ${colors.border}`,
                                height: '100%',
                                position: 'relative'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#44aaff'}
                            onMouseLeave={e => !isResizing && (e.currentTarget.style.background = 'transparent')}
                        />
                        <div style={{
                            width: `${sidebarWidth}px`,
                            minWidth: '250px',
                            maxWidth: '800px',
                            background: colors.bgSidebar,
                            display: 'flex',
                            flexDirection: 'column',
                            zIndex: 1000,
                            boxShadow: isDark ? '-5px 0 20px rgba(0,0,0,0.5)' : '-5px 0 20px rgba(0,0,0,0.05)',
                            transition: isResizing ? 'none' : 'width 0.3s ease',
                            overflow: 'hidden'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', borderBottom: `1px solid ${colors.border}` }}>
                                <h1 style={{ margin: 0, fontSize: '1.1rem', color: colors.textMain, fontWeight: 700 }}>
                                    Seen Objects ({sidebarShipsCount})
                                </h1>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <button 
                                        onClick={() => setSidebarViewMode(sidebarViewMode === 'detail' ? 'compact' : 'detail')} 
                                        style={{ background: 'transparent', border: 'none', color: colors.textMuted, cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                                        title={sidebarViewMode === 'detail' ? 'Switch to Compact View' : 'Switch to Detail View'}
                                    >
                                        {sidebarViewMode === 'detail' ? <Rows size={18} /> : <LayoutGrid size={18} />}
                                    </button>
                                    <button onClick={() => setSortConfig({ ...sortConfig, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })} style={{ background: 'transparent', border: 'none', color: colors.textMuted, cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
                                        <Navigation size={16} style={{
                                            transform: sortConfig.direction === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)',
                                            transition: 'transform 0.2s'
                                        }} />
                                    </button>
                                    <button onClick={() => setIsSidebarOpen(false)} style={{ background: 'transparent', border: 'none', color: colors.textMuted, cursor: 'pointer' }}>
                                        <X size={24} />
                                    </button>
                                </div>
                            </div>

                            {/* Sidebar Filter Bar */}
                            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', gap: '10px', background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}>
                                <div style={{ position: 'relative' }}>
                                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: colors.textMuted }} />
                                    <input 
                                        type="text" 
                                        placeholder="Search name or MMSI..." 
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        style={{ 
                                            width: '100%', 
                                            padding: '8px 10px 8px 32px', 
                                            borderRadius: '6px', 
                                            border: `1px solid ${colors.border}`,
                                            background: isDark ? 'rgba(0,0,0,0.2)' : '#fff',
                                            color: colors.textMain,
                                            fontSize: '0.85rem',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                    {searchTerm && (
                                        <button 
                                            onClick={() => setSearchTerm('')}
                                            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: colors.textMuted, cursor: 'pointer', padding: '2px' }}
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <MultiSelect 
                                        label="Any Source"
                                        isDark={isDark}
                                        colors={colors}
                                        selected={filterSource}
                                        onChange={setFilterSource}
                                        options={[
                                            { value: 'all', label: 'Any Source' },
                                            { value: 'sdr', label: 'Local SDR' },
                                            { value: 'stream', label: 'AisStream' }
                                        ]}
                                    />
                                    <select
                                        value={sortConfig.key}
                                        onChange={(e) => setSortConfig({ ...sortConfig, key: e.target.value })}
                                        style={{
                                            background: isDark ? 'rgba(0,0,0,0.2)' : '#fff',
                                            color: colors.textMain,
                                            border: `1px solid ${colors.border}`,
                                            borderRadius: '6px',
                                            padding: '6px 8px',
                                            fontSize: '0.8rem',
                                            cursor: 'pointer',
                                            height: '32px'
                                        }}
                                    >
                                        <option value="last_seen">Sort: Last Seen</option>
                                        <option value="name">Sort: Name</option>
                                        <option value="shiptype">Sort: Type</option>
                                        <option value="distance">Sort: Distance</option>
                                        <option value="message_count">Sort: Messages</option>
                                    </select>
                                </div>
                                <MultiSelect 
                                    label="All Ship Types"
                                    isDark={isDark}
                                    colors={colors}
                                    selected={filterShipType}
                                    onChange={setFilterShipType}
                                    options={[
                                        { value: 'all', label: 'All Ship Types' },
                                        { value: 'cargo', label: 'Cargo Vessels' },
                                        { value: 'tanker', label: 'Tankers' },
                                        { value: 'passenger', label: 'Passenger' },
                                        { value: 'aton', label: 'Aid to Navigation (AtoN)' },
                                        { value: 'pilot_sar', label: 'Pilot / SAR' },
                                        { value: 'tug', label: 'Tugs / Towing' },
                                        { value: 'fishing', label: 'Fishing' },
                                        { value: 'pleasure', label: 'Pleasure / Sailing' },
                                        { value: 'highspeed', label: 'High Speed Craft' },
                                        { value: 'military', label: 'Military / Law' },
                                        { value: 'wig', label: 'Wing In Ground (WIG)' },
                                        { value: 'special', label: 'Special / Ops' },
                                        { value: 'meteo', label: 'Stationary / Meteo' },
                                        { value: 'other', label: 'Other Types' }
                                    ]}
                                />
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '15px 20px', display: 'flex', flexDirection: 'column', gap: '8px', boxSizing: 'border-box' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {ships.length === 0 ? (
                                        <div style={{ color: colors.textMuted, textAlign: 'center', padding: '20px', background: colors.bgCard, borderRadius: '8px', border: `1px solid ${colors.border}` }}>
                                            No objects on the radar yet...
                                        </div>
                                    ) : sidebarShips
                                        .map(s => {
                                            const dist = (s.lat && s.lon && mqttSettings.origin_lat && mqttSettings.origin_lon)
                                                ? haversineDistance(s.lat, s.lon, parseFloat(mqttSettings.origin_lat), parseFloat(mqttSettings.origin_lon))
                                                : Infinity;
                                            return { ...s, distance: dist };
                                        })
                                        .sort((a, b) => {
                                            let valA = a[sortConfig.key];
                                            let valB = b[sortConfig.key];

                                            if (sortConfig.key === 'name') {
                                                valA = (a.name || a.mmsi || '').toString().toLowerCase();
                                                valB = (b.name || b.mmsi || '').toString().toLowerCase();
                                            } else {
                                                // Specific handling for strings
                                                if (typeof valA === 'string') valA = valA.toLowerCase();
                                                if (typeof valB === 'string') valB = valB.toLowerCase();
                                            }

                                            // Fallbacks for undefined
                                            if (valA === undefined) valA = sortConfig.direction === 'asc' ? Infinity : -Infinity;
                                            if (valB === undefined) valB = sortConfig.direction === 'asc' ? Infinity : -Infinity;

                                            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                                            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                                            return 0;
                                        })
                                        .map((ship: any, idx: number) => (
                                            <div key={ship.mmsi}
                                                className={showFlash && flashedMmsis.has(String(ship.mmsi)) ? 'ship-flash' : ''}
                                                style={{
                                                    padding: sidebarViewMode === 'compact' ? '6px 10px' : '10px',
                                                    background: idx % 2 === 0 ? colors.bgCard : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                                                    borderRadius: sidebarViewMode === 'compact' ? '4px' : '8px',
                                                    borderLeft: sidebarViewMode === 'compact' ? `3px solid ${getShipColor(String(ship.mmsi), ship.shiptype || ship.ship_type, ship.is_meteo, ship.is_aton, ship.is_emergency)}` : `5px solid ${getShipColor(String(ship.mmsi), ship.shiptype || ship.ship_type, ship.is_meteo, ship.is_aton, ship.is_emergency)}`,
                                                    display: 'flex',
                                                    gap: sidebarViewMode === 'compact' ? '10px' : '15px',
                                                    alignItems: 'center',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s',
                                                    border: `1px solid ${colors.border}`,
                                                    marginBottom: sidebarViewMode === 'compact' ? '1px' : '4px'
                                                }}
                                                onClick={() => {
                                                    setHoveredMmsi(String(ship.mmsi));
                                                    setSelectedShipMmsi(String(ship.mmsi));
                                                }}
                                                onContextMenu={(e) => {
                                                    e.preventDefault();
                                                    setContextMenu({
                                                        x: e.clientX,
                                                        y: e.clientY,
                                                        mmsi: String(ship.mmsi)
                                                    });
                                                }}
                                                onMouseEnter={e => {
                                                    e.currentTarget.style.transform = 'translateX(-4px)';
                                                    e.currentTarget.style.borderTopColor = '#44aaff';
                                                    e.currentTarget.style.borderRightColor = '#44aaff';
                                                    e.currentTarget.style.borderBottomColor = '#44aaff';
                                                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                                                }}
                                                onMouseLeave={e => {
                                                    e.currentTarget.style.transform = 'translateX(0)';
                                                    e.currentTarget.style.borderTopColor = colors.border;
                                                    e.currentTarget.style.borderRightColor = colors.border;
                                                    e.currentTarget.style.borderBottomColor = colors.border;
                                                    e.currentTarget.style.boxShadow = 'none';
                                                }}
                                            >
                                                {/* Thumbnail or Icon (Only in Detail Mode) */}
                                                {sidebarViewMode === 'detail' && (
                                                    <div style={{ width: '60px', minWidth: '60px', height: '45px', borderRadius: '4px', overflow: 'hidden', background: colors.bgMain, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${colors.border}` }}>
                                                        {ship.imageUrl ? (
                                                            <img src={ship.imageUrl} alt={ship.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).src = "/images/0.jpg"; }} />
                                                        ) : (
                                                            <Ship size={20} color={getShipColor(String(ship.mmsi), ship.shiptype || ship.ship_type)} />
                                                        )}
                                                    </div>
                                                )}

                                                {/* Info Section */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{
                                                        fontWeight: 700,
                                                        fontSize: sidebarViewMode === 'compact' ? '0.85rem' : '0.9rem',
                                                        color: 'var(--text-main)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        marginBottom: '1px'
                                                    }}>
                                                        <span dangerouslySetInnerHTML={{ __html: getFlagEmoji(String(ship.mmsi), ship.country_code) }} />
                                                        <span style={{
                                                            whiteSpace: 'nowrap',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis'
                                                        }}>
                                                            {ship.name || ship.mmsi}
                                                            {sidebarViewMode === 'compact' && ship.name && (
                                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'normal', marginLeft: '6px' }}>
                                                                    ({ship.mmsi})
                                                                </span>
                                                            )}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '4px 8px', alignItems: 'center' }}>
                                                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: sidebarViewMode === 'compact' ? '120px' : 'none' }}>
                                                            {getShipTypeName(String(ship.mmsi), ship.shiptype, ship.ship_type_text, ship.is_meteo)}
                                                        </span>
                                                        {ship.status_text && (
                                                            <>
                                                                <span style={{ opacity: 0.5 }}>•</span>
                                                                <span style={{ color: '#44aaff', fontWeight: 600 }}>{ship.status_text}</span>
                                                            </>
                                                        )}
                                                        <span style={{ opacity: 0.5 }}>•</span>
                                                        <span style={{ color: '#44aaff', fontWeight: 600 }}>
                                                            <span style={{ fontSize: '0.65rem', opacity: 0.7, marginRight: '3px' }}>Distance:</span>
                                                            {ship.distance !== Infinity ? formatDistance(ship.distance, mqttSettings.units) : '--'}
                                                        </span>
                                                        <span style={{ marginLeft: 'auto', background: (ship.source === 'aisstream') ? 'rgba(68,170,255,0.1)' : 'rgba(16, 185, 129, 0.1)', color: (ship.source === 'aisstream') ? '#44aaff' : '#10b981', padding: '1px 5px', borderRadius: '3px', fontSize: '0.6rem', fontWeight: 700, border: `1px solid ${(ship.source === 'aisstream') ? 'rgba(68,170,255,0.2)' : 'rgba(16, 185, 129, 0.2)'}` }}>
                                                            {ship.source === 'aisstream' ? 'STREAM' : 'SDR'}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Speed/Direction */}
                                                <div style={{ textAlign: 'right', minWidth: '65px' }}>
                                                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: (ship.sog && ship.sog > 1) ? '#10b981' : colors.textMain }}>
                                                        {formatSpeed(ship.sog, mqttSettings.units)}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: colors.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                        <Navigation size={10} style={{ transform: `rotate(${ship.cog || 0}deg)` }} />
                                                        {ship.cog?.toFixed(0) ?? '--'}°
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Settings Modal */}
            <SettingsModal
                isOpen={isSettingsModalOpen}
                onClose={() => setIsSettingsModalOpen(false)}
                settings={mqttSettings}
                setSettings={setMqttSettings}
                onSave={saveSettings}
                activeTab={settingsTab}
                setActiveTab={setSettingsTab}
                colors={colors}
                theme={theme}
            />

            <VesselDatabaseModal
                isOpen={isDatabaseModalOpen}
                onClose={() => {
                    setIsDatabaseModalOpen(false);
                    setEditingMmsi(null);
                    setEditBuffer(null);
                }}
                onSelectVessel={(ship: any) => {
                    const active = ships.find((s: any) => String(s.mmsi) === String(ship.mmsi));
                    if (active && active.lat && active.lon) {
                        setSelectedShipMmsi(String(active.mmsi));
                        if (mapRef.current) {
                            mapRef.current.flyTo([active.lat, active.lon], 14);
                        }
                    }
                }}
                colors={colors}
                dbSearchTerm={dbSearchTerm}
                setDbSearchTerm={setDbSearchTerm}
                dbFilterType={dbFilterType}
                setDbFilterType={setDbFilterType}
                dbFilterSource={dbFilterSource}
                setDbFilterSource={setDbFilterSource}
                editingMmsi={editingMmsi}
                setEditingMmsi={setEditingMmsi}
                editBuffer={editBuffer}
                setEditBuffer={setEditBuffer}
                databaseShips={databaseShips}
                fetchMore={() => fetchDatabaseShips(false)}
                hasMore={dbHasMore}
                loading={dbLoading}
                dbSort={dbSort}
                setDbSort={setDbSort}
                dbTotal={dbTotal}
                onRefresh={() => fetchDatabaseShips(true)}
            />

            {mqttSettings.vessel_detail_view === 'sidebar' ? (
                <VesselDetailSidebar
                    isOpen={!!selectedShipMmsi}
                    onClose={() => setSelectedShipMmsi(null)}
                    ship={ships.find((s: any) => String(s.mmsi) === selectedShipMmsi)}
                    mqttSettings={mqttSettings}
                    colors={colors}
                />
            ) : (
                <VesselDetailModal
                    isOpen={!!selectedShipMmsi}
                    onClose={() => setSelectedShipMmsi(null)}
                    ship={ships.find((s: any) => String(s.mmsi) === selectedShipMmsi)}
                    colors={colors}
                    mqttSettings={mqttSettings}
                    isDark={isDark}
                />
            )}

            <StatisticsModal
                isOpen={isStatsModalOpen}
                onClose={() => setIsStatsModalOpen(false)}
                colors={colors}
            />

            <NmeaConsoleModal
                isOpen={isNmeaModalOpen}
                onClose={() => setIsNmeaModalOpen(false)}
                logs={nmeaLogs}
                colors={colors}
            />

            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                    colors={colors}
                    isDark={isDark}
                    options={[
                        {
                            label: pinnedMmsis.has(contextMenu.mmsi) ? 'Stop Tracking' : 'Track Specifically',
                            icon: pinnedMmsis.has(contextMenu.mmsi) ? <X size={16} /> : <Navigation size={16} />,
                            onClick: () => {
                                setPinnedMmsis(prev => {
                                    const next = new Set(prev);
                                    if (next.has(contextMenu.mmsi)) next.delete(contextMenu.mmsi);
                                    else next.add(contextMenu.mmsi);
                                    return next;
                                });
                            }
                        },
                        {
                            label: 'Focus on Map',
                            icon: <Search size={16} />,
                            onClick: () => {
                                setSelectedShipMmsi(contextMenu.mmsi);
                                // Forcing map to re-center is handled by popup/marker usually,
                                // but we could trigger it here if needed.
                            },
                            separator: true
                        },
                        {
                            label: 'Vessel Details',
                            icon: <Info size={16} />,
                            onClick: () => setSelectedShipMmsi(contextMenu.mmsi)
                        }
                    ]}
                />
            )}

            {/* Mini Console (Ticker) at the bottom */}
            {lastUpdatedShip && (
                <div style={{
                    position: 'fixed',
                    bottom: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: isDark ? 'rgba(15, 15, 26, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                    backdropFilter: 'blur(12px)',
                    padding: '8px 20px',
                    borderRadius: '30px',
                    border: `1px solid ${isDark ? 'rgba(0, 240, 255, 0.3)' : 'rgba(0, 131, 143, 0.2)'}`,
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    zIndex: 10000,
                    animation: 'slideUpFade 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                    pointerEvents: 'none',
                    maxWidth: '90vw'
                }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }}></div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.5px' }}>LATEST EVENT:</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: isDark ? '#44aaff' : '#007080' }}>
                        {lastUpdatedShip.name} <span style={{ opacity: 0.6, fontWeight: 400, marginLeft: '5px' }}>(MMSI {lastUpdatedShip.mmsi})</span>
                    </span>
                    <span style={{ fontSize: '0.75rem', color: colors.textMuted, opacity: 0.8, marginLeft: '10px' }}>
                        {new Date(lastUpdatedShip.time).toLocaleTimeString()}
                    </span>
                </div>
            )}
        </div>
    );
}

function NmeaConsoleModal({ isOpen, onClose, logs, colors }: any) {
    const [expandedIds, setExpandedIds] = useState<Set<any>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'live' | 'grouped'>('live'); // 'live' or 'grouped'

    const filteredLogs = useMemo(() => {
        return logs.filter((log: any) => {
            const query = searchQuery.toLowerCase();
            if (!query) return true;
            
            const rawMatch = log.raw.toLowerCase().includes(query);
            const mmsiMatch = log.decoded?.mmsi?.toString().includes(query);
            const displayName = log.decoded?.name || 'Unknown';
            const nameMatch = displayName.toLowerCase().includes(query);
            
            return rawMatch || mmsiMatch || nameMatch;
        });
    }, [logs, searchQuery]);

    const groupedLogs = useMemo(() => {
        if (viewMode !== 'grouped') return [];
        
        const groups: Record<string, any[]> = {};
        filteredLogs.forEach((log: any) => {
            // Group primarily by MMSI to ensure uniqueness
            const mmsi = log.decoded?.mmsi?.toString();
            // If no MMSI, use name as fallback, else 'Unknown'
            const key = mmsi || log.decoded?.name || 'Unknown';
            
            if (!groups[key]) groups[key] = [];
            groups[key].push(log);
        });
        
        return Object.entries(groups).map(([id, items]) => {
            // Pick most frequent name for the group
            const names = items.map(i => i.decoded?.name).filter(Boolean);
            const name = names.length > 0 ? names[0] : 'Unknown';
            const mmsi = items.find(i => i.decoded?.mmsi)?.decoded?.mmsi;
            
            return {
                id, // Use the key as a stable ID for expanded state
                name,
                mmsi,
                items: items.sort((a, b) => b.timestamp - a.timestamp)
            };
        }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [filteredLogs, viewMode]);

    if (!isOpen) return null;

    const toggleExpand = (id: any) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <div className="settings-modal-overlay" onClick={onClose} style={{ zIndex: 3000 }}>
            <div className="settings-modal" onClick={e => e.stopPropagation()} style={{ 
                width: '90%', 
                height: '90%', 
                maxWidth: '1600px',
                padding: '0',
                display: 'flex',
                flexDirection: 'column',
                background: colors.bgMain,
                border: `1px solid ${colors.border}`,
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{ 
                    padding: '20px 30px', 
                    background: colors.bgCard, 
                    borderBottom: `1px solid ${colors.border}`, 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center' 
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ 
                            background: 'linear-gradient(135deg, #44aaff, #0072ff)', 
                            padding: '8px', 
                            borderRadius: '10px',
                            display: 'flex',
                            boxShadow: '0 0 15px rgba(0,240,255,0.3)'
                        }}>
                            <Terminal size={24} color="#000" />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, color: colors.textMain, letterSpacing: '-0.5px' }}>NMEA Info Browser</h2>
                            <div style={{ color: colors.textMuted, fontSize: '0.8rem', opacity: 0.8 }}>Real-time telemetry & protocol analysis</div>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: colors.textMuted, cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = '#ff5555'} onMouseLeave={e => e.currentTarget.style.color = colors.textMuted}>
                        <X size={28} />
                    </button>
                </div>

                {/* Toolbar */}
                <div style={{ 
                    padding: '12px 30px', 
                    background: colors.bgSidebar, 
                    borderBottom: `1px solid ${colors.border}`,
                    display: 'flex',
                    gap: '20px',
                    alignItems: 'center',
                    flexWrap: 'wrap'
                }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: colors.textMuted }} />
                        <input 
                            type="text" 
                            placeholder="Filter by MMSI, Name, or Raw Data..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{ 
                                width: '100%', 
                                background: colors.bgMain, 
                                border: `1px solid ${colors.border}`, 
                                borderRadius: '8px', 
                                padding: '8px 12px 8px 38px',
                                color: colors.textMain,
                                fontSize: '0.9rem',
                                outline: 'none'
                            }}
                        />
                    </div>
                    
                    <div style={{ display: 'flex', background: colors.bgMain, borderRadius: '8px', padding: '4px', border: `1px solid ${colors.border}` }}>
                        <button 
                            onClick={() => setViewMode('live')}
                            style={{ 
                                padding: '6px 16px', 
                                borderRadius: '6px', 
                                border: 'none', 
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                background: viewMode === 'live' ? '#44aaff' : 'transparent',
                                color: viewMode === 'live' ? '#000' : colors.textMuted,
                                transition: 'all 0.2s'
                            }}
                        >
                            Live Stream
                        </button>
                        <button 
                            onClick={() => setViewMode('grouped')}
                            style={{ 
                                padding: '6px 16px', 
                                borderRadius: '6px', 
                                border: 'none', 
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                background: viewMode === 'grouped' ? '#44aaff' : 'transparent',
                                color: viewMode === 'grouped' ? '#000' : colors.textMuted,
                                transition: 'all 0.2s'
                            }}
                        >
                            Grouped by Vessel
                        </button>
                    </div>
                </div>

                {/* Log View */}
                <div style={{ flex: 1, padding: '20px 30px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', fontFamily: "'JetBrains Mono', 'Fira Code', monospace", background: colors.bgMain }}>
                    {viewMode === 'live' ? (
                        filteredLogs.length === 0 ? (
                            <div style={{ padding: '60px', textAlign: 'center', color: colors.textMuted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                                <Radio size={48} style={{ opacity: 0.2 }} />
                                <div>Waiting for NMEA data matching your criteria...</div>
                            </div>
                        ) : filteredLogs.map((log: any) => (
                            <div key={log.id} style={{ 
                                display: 'flex', 
                                flexDirection: 'column', 
                                background: colors.bgCard, 
                                borderRadius: '6px', 
                                border: `1px solid ${colors.border}`,
                                transition: 'transform 0.1s, border-color 0.2s',
                                overflow: 'hidden',
                                flexShrink: 0
                            }}>
                                <div 
                                    onClick={() => log.decoded && toggleExpand(log.id)}
                                    style={{ 
                                        padding: '8px 15px', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '20px', 
                                        fontSize: '0.85rem',
                                        cursor: log.decoded ? 'pointer' : 'default'
                                    }}
                                    onMouseEnter={e => log.decoded && (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                                    onMouseLeave={e => log.decoded && (e.currentTarget.style.background = 'transparent')}
                                >
                                    <span style={{ color: colors.textMuted, minWidth: '85px', fontSize: '0.75rem', fontWeight: 600 }}>{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                    <span style={{ 
                                        color: colors.accent, 
                                        minWidth: '120px', 
                                        fontSize: '0.75rem', 
                                        fontWeight: 800, 
                                        textTransform: 'uppercase',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {log.decoded?.name || log.decoded?.mmsi || 'Unknown'}
                                    </span>
                                    <span style={{ color: colors.isDark ? '#00ff80' : '#00a854', flex: 1, wordBreak: 'break-all', letterSpacing: '0.5px', fontWeight: 500 }}>{log.raw}</span>
                                    {log.decoded ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ 
                                                background: '#44aaff', 
                                                color: '#000', 
                                                padding: '1px 8px', 
                                                borderRadius: '4px', 
                                                fontSize: '0.65rem', 
                                                fontWeight: 900, 
                                                boxShadow: '0 0 10px rgba(0,240,255,0.3)',
                                                textTransform: 'uppercase'
                                            }}>
                                                DECODED MSG • {log.decoded.type}
                                            </span>
                                            {expandedIds.has(log.id) ? <ChevronUp size={16} color={colors.textMuted} /> : <ChevronDown size={16} color={colors.textMuted} />}
                                        </div>
                                    ) : (
                                        <span style={{ color: colors.textMuted, fontSize: '0.65rem', opacity: 0.5, textTransform: 'uppercase', fontWeight: 800 }}>RAW</span>
                                    )}
                                </div>
                                
                                {expandedIds.has(log.id) && log.decoded && (
                                    <div style={{ 
                                        padding: '15px 20px 20px 50px', 
                                        background: colors.isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)', 
                                        borderTop: `1px solid ${colors.border}`,
                                        fontSize: '0.85rem',
                                        color: colors.textMain,
                                        overflow: 'auto',
                                        maxHeight: '400px'
                                    }}>
                                        <pre style={{ margin: 0, color: colors.isDark ? '#44aaff' : '#0066cc', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(log.decoded, null, 2)}</pre>
                                    </div>
                                )}
                            </div>
                        ))
                    ) : (
                        /* Grouped View */
                        groupedLogs.length === 0 ? (
                            <div style={{ padding: '60px', textAlign: 'center', color: colors.textMuted }}>No grouped data available.</div>
                        ) : groupedLogs.map((group: any) => (
                            <div key={group.id} style={{ 
                                background: colors.bgCard, 
                                borderRadius: '8px', 
                                border: `1px solid ${colors.border}`,
                                marginBottom: '10px',
                                overflow: 'hidden',
                                flexShrink: 0
                            }}>
                                <div 
                                    onClick={() => toggleExpand(`group-${group.id}`)}
                                    style={{ 
                                        padding: '12px 20px', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'space-between',
                                        cursor: 'pointer',
                                        background: colors.bgSidebar
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                        <Ship size={18} color={colors.accent} />
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontWeight: 800, color: colors.textMain }}>{group.name}</span>
                                            {group.mmsi && <span style={{ color: colors.textMuted, fontSize: '0.7rem', opacity: 0.8 }}>MMSI: {group.mmsi}</span>}
                                        </div>
                                        <span style={{ 
                                            background: colors.bgMain, 
                                            color: colors.textMuted, 
                                            padding: '2px 8px', 
                                            borderRadius: '12px', 
                                            fontSize: '0.7rem', 
                                            fontWeight: 700 
                                        }}>
                                            {group.items.length} msgs
                                        </span>
                                    </div>
                                    {expandedIds.has(`group-${group.id}`) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                </div>
                                
                                {expandedIds.has(`group-${group.id}`) && (
                                    <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {group.items.map((log: any) => (
                                            <div key={log.id} style={{ 
                                                background: colors.isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)',
                                                borderRadius: '4px',
                                                overflow: 'hidden',
                                                borderLeft: `3px solid ${log.decoded ? '#44aaff' : colors.border}`,
                                                marginLeft: '10px',
                                                flexShrink: 0
                                            }}>
                                                <div 
                                                    onClick={() => log.decoded && toggleExpand(log.id)}
                                                    style={{ 
                                                        padding: '8px 15px', 
                                                        fontSize: '0.8rem', 
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '15px',
                                                        cursor: log.decoded ? 'pointer' : 'default'
                                                    }}
                                                    onMouseEnter={e => log.decoded && (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                                                    onMouseLeave={e => log.decoded && (e.currentTarget.style.background = 'transparent')}
                                                >
                                                    <span style={{ color: colors.textMuted, fontSize: '0.75rem', minWidth: '70px' }}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                                                    <span style={{ color: colors.isDark ? '#00ff80' : '#00a854', flex: 1, wordBreak: 'break-all', fontFamily: 'monospace', fontWeight: 500 }}>{log.raw}</span>
                                                    {log.decoded ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span style={{ 
                                                                background: '#44aaff', 
                                                                color: '#000', 
                                                                padding: '1px 8px', 
                                                                borderRadius: '4px', 
                                                                fontSize: '0.65rem', 
                                                                fontWeight: 900, 
                                                                boxShadow: '0 0 10px rgba(0,240,255,0.3)'
                                                            }}>
                                                                DECODED MSG
                                                            </span>
                                                            {expandedIds.has(log.id) ? <ChevronUp size={14} color={colors.textMuted} /> : <ChevronDown size={14} color={colors.textMuted} />}
                                                        </div>
                                                    ) : (
                                                        <span style={{ color: colors.textMuted, fontSize: '0.65rem', opacity: 0.5 }}>RAW</span>
                                                    )}
                                                </div>
                                                {expandedIds.has(log.id) && log.decoded && (
                                                    <div style={{ 
                                                        padding: '15px 20px 20px 50px', 
                                                        background: colors.isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)', 
                                                        borderTop: `1px solid ${colors.border}`,
                                                        fontSize: '0.85rem',
                                                        color: colors.textMain,
                                                        overflow: 'auto',
                                                        maxHeight: '400px'
                                                    }}>
                                                        <pre style={{ margin: 0, color: colors.isDark ? '#44aaff' : '#0066cc', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(log.decoded, null, 2)}</pre>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                <div style={{ 
                    padding: '15px 30px', 
                    background: colors.bgCard, 
                    borderTop: `1px solid ${colors.border}`, 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    fontSize: '0.85rem', 
                    color: colors.textMuted 
                }}>
                    <div style={{ display: 'flex', gap: '20px' }}>
                        <span>Buffers: <b>{logs.length} / 200</b> msgs</span>
                        <span>Filtered: <b>{filteredLogs.length}</b></span>
                    </div>
                    <button 
                        onClick={onClose} 
                        style={{ 
                            padding: '10px 25px', 
                            background: '#44aaff', 
                            color: '#000', 
                            border: 'none', 
                            borderRadius: '8px', 
                            fontWeight: 900, 
                            cursor: 'pointer',
                            boxShadow: '0 4px 15px rgba(0,240,255,0.2)',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,240,255,0.4)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,240,255,0.2)';
                        }}
                    >
                        Close Browser
                    </button>
                </div>
            </div>
        </div>
    );
}

function ContextMenu({ x, y, options, onClose, colors, isDark }: any) {
    useEffect(() => {
        const handleClick = () => onClose();
        window.addEventListener('click', handleClick);
        window.addEventListener('scroll', handleClick);
        return () => {
            window.removeEventListener('click', handleClick);
            window.removeEventListener('scroll', handleClick);
        };
    }, [onClose]);

    return (
        <div 
            style={{
                position: 'fixed',
                left: x,
                top: y,
                background: colors.bgCard,
                border: `1px solid ${colors.border}`,
                borderRadius: '10px',
                padding: '6px 0',
                zIndex: 10000,
                boxShadow: isDark ? '0 10px 25px rgba(0,0,0,0.6)' : '0 10px 25px rgba(0,0,0,0.15)',
                minWidth: '180px',
                backdropFilter: 'blur(10px)',
                animation: 'contextFadeIn 0.15s ease-out'
            }}
            onClick={e => e.stopPropagation()}
        >
            {options.map((opt: any, i: number) => (
                <div
                    key={i}
                    onClick={() => { opt.onClick(); onClose(); }}
                    style={{
                        padding: '10px 16px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        fontSize: '0.9rem',
                        color: opt.danger ? '#ff5555' : colors.textMain,
                        transition: 'background 0.2s',
                        borderBottom: opt.separator ? `1px solid ${colors.border}` : 'none',
                        marginBottom: opt.separator ? '6px' : '0'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                    <span style={{ color: opt.danger ? '#ff5555' : colors.accent, display: 'flex' }}>{opt.icon}</span>
                    <span style={{ fontWeight: 500 }}>{opt.label}</span>
                </div>
            ))}
        </div>
    );
}
