import React, { useState, useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Tooltip, LayersControl, useMap, Circle, Polygon, Polyline, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { Settings, X, Moon, Sun, Anchor, List, Navigation, Search, Ship, Signal, Info, Crosshair, Radio, BarChart2, Globe, Plus, Calendar, ChevronLeft, ChevronRight, Activity, Radar, Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import 'leaflet/dist/leaflet.css'

function CenterButton({ originLat, originLon }: { originLat: number, originLon: number }) {
    const map = useMap();
    if (isNaN(originLat) || isNaN(originLon)) return null;
    return (
        <div style={{
            position: 'absolute', bottom: '25px', left: '10px', zIndex: 1000
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

    if (isMeteo) return '#44aaff'; // Weather (Light Blue)
    if (isAton || mmsiStr.startsWith('99')) return '#ff00ff'; // AtoN (Magenta)
    if (mmsiStr.startsWith('00')) return '#555555'; // Base Station
    if (!type && type !== 0) return '#a0a0a0'; // Unknown

    if (type >= 20 && type <= 29) return '#ffffff'; // WIG (White)
    if (type === 30) return '#f68b1f'; // Fishing (Orange)
    if (type >= 31 && type <= 32 || type == 52) return '#00ffff'; // Towing/Tug (Cyan)
    if (type === 33) return '#8b4513'; // Dredging (Brown)
    if (type === 34) return '#4682b4'; // Diving (SteelBlue)
    if (type === 35 || type === 55) return '#4b0082'; // Military/Law Enf (Indigo)
    if (type >= 36 && type <= 37) return '#d500f9'; // Pleasure/Sailing (Purple)
    if (type >= 40 && type <= 49) return '#ffff00'; // HSC (Yellow)
    if (type === 50) return '#add8e6'; // Pilot (LightBlue)
    if (type === 51 || type === 9) return '#ff1493'; // SAR (DeepPink)
    if (type >= 53 && type <= 54) return '#2e8b57'; // Port/Anti-pollution (SeaGreen)
    if (type === 58) return '#ff69b4'; // Medical (HotPink)
    if (type >= 60 && type <= 69) return '#0000ff'; // Passenger (Blue)
    if (type === 70 || type === 79 || (type >= 71 && type <= 78)) return '#00ff00'; // Cargo (Green)
    if (type >= 80 && type <= 89) return '#ff0000'; // Tanker (Red)

    return '#a0a0a0'; // Other Type
}

function getShipTypeName(mmsiStr: string, shipType?: number, typeText?: string) {
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
    let emoji = '📌';
    
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
        "501": "🇹🇫", "503": "🇦🇺", "508": "🇧🇳", "514": "🇰🇭", "515": "🇰🇭", "536": "🇲🇵", "559": "🇦🇸",
        // Africa / Atlantic
        "601": "🇿🇦", "603": "🇦🇴", "605": "🇩🇿", "608": "🇸🇭", "609": "🇧🇮", "610": "🇧🇯", "611": "🇧🇼", "613": "🇨🇲",
        "616": "🇰🇲", "617": "🇨🇻", "618": "🇨🇫", "619": "🇹🇩", "620": "🇨🇬", "621": "🇩🇯", "622": "🇪🇬", "624": "🇪🇹",
        "625": "🇪🇷", "626": "🇬🇶", "627": "🇬🇦", "629": "🇬🇲", "630": "🇬🇭", "631": "🇬🇳", "632": "🇬🇼", "633": "🇧🇫",
        "634": "🇰🇪", "635": "🇱🇸", "636": "🇱🇷", "637": "🇱🇾", "642": "🇲🇬", "644": "🇲🇼", "645": "🇲🇱", "647": "🇲🇷",
        "649": "🇲🇺", "650": "🇲🇿", "654": "🇳🇦", "655": "🇳🇪", "656": "🇳🇬", "657": "🇷🇼", "659": "🇸🇳", "660": "🇸🇨",
        "661": "🇸🇱", "662": "🇸🇴", "663": "🇸🇩", "664": "🇸🇿", "665": "🇹🇿", "666": "🇹🇬", "667": "🇹🇳", "668": "🇺🇬",
        "669": "🇨🇩", "670": "🇿🇲", "671": "🇿🇼", "672": "🇳🇦", "674": "🇹🇿", "675": "🇪🇹", "676": "🇸🇴", "677": "🇹🇿",
        "678": "🇸🇹", "679": "🇨🇮",
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

function ShipIcon(sog: number | undefined, cog: number | undefined, mmsi: string, type?: number, shouldFlash?: boolean, shipScale: number = 1.0, circleScale: number = 1.0, isMeteo?: boolean, isAton?: boolean, atonType?: number, isEmergency?: boolean, virtualAton?: boolean) {
    const isMoving = sog !== undefined && sog > 0.5 && cog !== undefined;
    const isAircraft = type === 9;
    const color = getShipColor(mmsi, type, isMeteo, isAton, isEmergency);
    const borderColor = '#000000';
    const strokeDash = virtualAton ? 'stroke-dasharray="2,2"' : '';
    const emergencyClass = isEmergency ? 'svg-emergency-pulse' : '';

    let svg = '';
    const baseHitArea = 56;
    const hitAreaSize = baseHitArea * Math.max(shipScale, circleScale, 1);

    if (isMeteo) {
        // Weather Icon (Vindstrut/Wind sock)
        const size = 28 * shipScale;
        svg = `<svg width="${size}" height="${size}" viewBox="0 0 24 24">
                 <path d="M12,2 L12,22 M12,2 L21,5 L21,9 L12,12 M12,5 L19,6.2 L19,7.8 L12,9" fill="${color}" stroke="${borderColor}" stroke-width="1.5" stroke-linecap="round" />
                 <circle cx="12" cy="2" r="1.5" fill="${borderColor}" />
               </svg>`;
    } else if (isAton) {
        // AtoN Icon: Lighthouse for fixed structures (1, 3, 5-20), Buoy for floating (21-31)
        const isFloating = atonType && atonType >= 21 && atonType <= 31;
        const size = (isFloating ? 24 : 28) * shipScale;
        if (isFloating) {
            // Buoy
            svg = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" class="${emergencyClass}">
                     <path d="M12,2 L14,6 L16,18 L8,18 L10,6 Z" fill="${color}" stroke="${borderColor}" stroke-width="1.5" ${strokeDash} />
                     <path d="M6,18 L18,18" stroke="${borderColor}" stroke-width="2" stroke-linecap="round" />
                     <circle cx="12" cy="4" r="2" fill="yellow" stroke="${borderColor}" stroke-width="0.5" class="svg-pulse" />
                   </svg>`;
        } else {
            // Lighthouse / Fixed Structure
            svg = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" class="${emergencyClass}">
                     <path d="M8,22 L16,22 L14,6 L10,6 Z" fill="${color}" stroke="${borderColor}" stroke-width="1.5" ${strokeDash} />
                     <rect x="9" y="4" width="6" height="4" fill="#333" stroke="${borderColor}" stroke-width="1" />
                     <path d="M7,6 L4,4 M17,6 L20,4 M12,2 L12,4" stroke="yellow" stroke-width="2" stroke-linecap="round" class="svg-pulse" />
                   </svg>`;
        }
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
                          class="${shouldFlash ? 'svg-flash-fill' : ''}" />
               </svg>`;
    } else {
        const size = 16 * circleScale;
        svg = `<svg width="${size}" height="${size}" viewBox="0 0 16 16" class="${emergencyClass}">
                 <circle cx="8" cy="8" r="6" fill="${color}" stroke="${borderColor}" stroke-width="1.5"
                         class="${shouldFlash ? 'svg-flash-fill' : ''}" />
               </svg>`;
    }

    return L.divIcon({
        html: `<div class="ship-custom-icon" style="display:flex; justify-content:center; align-items:center; width: 100%; height: 100%;">${svg}</div>`,
        className: 'ship-custom-icon-container',
        iconSize: [hitAreaSize, hitAreaSize],
        iconAnchor: [hitAreaSize / 2, hitAreaSize / 2]
    });
}

// Injected css
const extraStyles = `
.ship-custom-icon-container { background: transparent; border: none; }
.ship-custom-icon svg { filter: drop-shadow(0px 2px 3px rgba(0,0,0,0.4)); }

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
.svg-flash-fill {
    animation: svg-fill-flash 1.5s ease-out;
}
@keyframes svg-fill-flash {
    0% { fill: #ffff00; stroke: #ffffff; stroke-width: 3px; }
    100% { }
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
.settings-modal-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.4); backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center; z-index: 9999;
    animation: fadeIn 0.3s ease-out;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.settings-modal {
    background: var(--bg-card); width: 975px; max-width: 95vw; height: 720px;
    border-radius: 16px; display: flex; flex-direction: column; overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); 
    border: 1px solid rgba(255,255,255,0.1);
    animation: slideUp 0.3s ease-out;
}
@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

.settings-tabs {
    display: flex; background: rgba(0,0,0,0.2); border-bottom: 1px solid var(--border-color);
    padding: 0 10px;
}
.settings-tab-btn {
    padding: 16px 20px; border: none; background: transparent; cursor: pointer;
    color: var(--text-muted); font-weight: 600; border-bottom: 3px solid transparent;
    transition: all 0.2s; font-size: 0.95rem;
}
.settings-tab-btn:hover { color: var(--text-main); background: rgba(255,255,255,0.05); }
.settings-tab-btn.active {
    color: #44aaff; border-bottom-color: #44aaff; background: rgba(68,170,255,0.1);
}
.settings-content {
    flex: 1; padding: 30px; overflow-y: auto; color: var(--text-main);
    display: flex; flexDirection: column; gap: 25px;
}
.settings-section {
    display: flex; flex-direction: column; gap: 15px;
    padding-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.05);
}
.settings-section:last-child { border-bottom: none; }
.settings-section-title {
    font-size: 0.8rem; font-weight: 700; text-transform: uppercase;
    color: #44aaff; letter-spacing: 1px; margin-bottom: 5px;
}
.form-group { 
    display: flex; justify-content: space-between; align-items: center;
    gap: 20px;
}
.form-group.vertical { flex-direction: column; align-items: flex-start; gap: 8px; }

.form-group label { font-size: 0.95rem; color: var(--text-main); font-weight: 500; }
.form-group .description { font-size: 0.8rem; color: var(--text-muted); margin-top: 2px; }

.form-group input[type="text"], 
.form-group input[type="number"],
.form-group input[type="password"],
.form-group select {
    width: 280px; padding: 10px 14px; border-radius: 8px;
    border: 1px solid var(--border-color); background: rgba(0,0,0,0.2); color: var(--text-main);
    transition: border-color 0.2s;
}
.form-group input:focus { border-color: #44aaff; outline: none; }

/* Toggle Switch Styles */
.switch {
  position: relative; display: inline-block; width: 44px; height: 24px;
}
.switch input { opacity: 0; width: 0; height: 0; }
.slider {
  position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
  background-color: #333; transition: .4s; border-radius: 24px;
}
.slider:before {
  position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px;
  background-color: white; transition: .4s; border-radius: 50%;
}
input:checked + .slider { background-color: #44aaff; }
input:checked + .slider:before { transform: translateX(20px); }

@keyframes emergency-flash {
    from { background: #ff0000; box-shadow: 0 0 5px #ff0000; }
    to { background: #990000; box-shadow: 0 0 20px #ff0000; }
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

function StatisticsModal({ isOpen, onClose, colors }: any) {
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            const fetchPath = `/api/statistics?date=${selectedDate}`;
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

    const today = stats?.today || { unique_ships: 0, new_ships: 0, total_messages: 0, max_range_km: 0.0 };
    const history30d = stats?.history_30d || [];
    const hourlyBreakdown = stats?.hourly_breakdown || [];
    const typeBreakdown = stats?.type_breakdown || [];

    const max30dMsgs = Math.max(...history30d.map((h: any) => h.total_messages), 1);
    const maxHourlyMsgs = Math.max(...hourlyBreakdown.map((h: any) => h.count), 1);

    // Donut Chart Helpers
    const totalVesselsForType = typeBreakdown.reduce((sum: number, item: any) => sum + item.count, 0);
    let cumulativePercent = 0;
    const donutPaths = totalVesselsForType > 0 ? typeBreakdown.slice(0, 8).map((item: any, i: number) => {
        const percent = item.count / totalVesselsForType;
        const startPercent = cumulativePercent;
        cumulativePercent += percent;
        
        const startAngle = startPercent * 2 * Math.PI;
        const endAngle = cumulativePercent * 2 * Math.PI;
        
        const x1 = 50 + 40 * Math.sin(startAngle);
        const y1 = 50 - 40 * Math.cos(startAngle);
        const x2 = 50 + 40 * Math.sin(endAngle);
        const y2 = 50 - 40 * Math.cos(endAngle);
        
        const largeArcFlag = percent > 0.5 ? 1 : 0;
        const d = `M ${x1} ${y1} A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2}`;
        
        const categoryColors = ['#ff5252', '#ffd740', '#69f0ae', '#40c4ff', '#7c4dff', '#e040fb', '#ff4081', '#ffab40'];
        return { d, color: categoryColors[i % categoryColors.length], label: item.label, count: item.count };
    }) : [];

    // Area Chart path - using 1000 width for high definition and thin lines
    const areaPoints = hourlyBreakdown.map((h: any, i: number) => {
        const x = (i / 23) * 1000;
        const y = 100 - (h.count / maxHourlyMsgs) * 85; 
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    
    const areaPath = `0,100 ${areaPoints} 1000,100`;
    const linePath = areaPoints;

    return (
        <div className="settings-modal-overlay" onClick={onClose} style={{ zIndex: 3000 }}>
            <div className="settings-modal" onClick={e => e.stopPropagation()} style={{ 
                width: '85%', 
                height: '85%', 
                maxWidth: '1400px',
                padding: '0',
                display: 'flex',
                flexDirection: 'column',
                background: '#f8fafd'
            }}>
                {/* Header */}
                <div style={{ padding: '15px 40px', background: 'white', borderBottom: '1px solid #eef2f7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#1a2233' }}>Advanced Statistics Dashboard</h2>
                        <div style={{ color: '#5a6b8a', fontSize: '0.85rem' }}>Analyze historical data and system performance.</div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1a2233' }}>Target Date:</div>
                        <div style={{ position: 'relative' }}>
                            <Calendar size={18} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#5a6b8a', pointerEvents: 'none' }} />
                            <input 
                                type="date" 
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                style={{ 
                                    padding: '10px 40px 10px 15px',
                                    borderRadius: '8px',
                                    border: '1px solid #e2e8f0',
                                    fontSize: '0.9rem',
                                    outline: 'none',
                                    color: '#1a2233'
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Dashboard Grid */}
                <div style={{ flex: 1, padding: '20px 40px', overflowY: 'auto' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '100px 0' }}>
                            <div className="spinner"></div>
                            <div style={{ marginTop: '20px', color: '#5a6b8a' }}>Refreshing dashboard...</div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {/* Summary Cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
                                {[
                                    { label: 'Total Messages', value: today.total_messages, icon: <Activity size={20} /> },
                                    { label: 'Unique Vessels', value: today.unique_ships, icon: <Ship size={20} /> },
                                    { label: 'New Vessels', value: today.new_ships, icon: <Plus size={20} color="#10b981" /> },
                                    { label: 'Max Range', value: `${today.max_range_km?.toFixed(1) || '0.0'} km`, icon: <Radar size={20} /> },
                                ].map((card, i) => (
                                    <div key={i} style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #eef2f7', display: 'flex', alignItems: 'center', gap: '15px' }}>
                                        <div style={{ width: '45px', height: '45px', borderRadius: '12px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1a2233' }}>
                                            {card.icon}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>{card.label}</div>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1a2233' }}>{card.value}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Main Charts */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
                                {/* Messages per Day (30d) */}
                                <div style={{ background: 'white', borderRadius: '16px', padding: '30px', border: '1px solid #eef2f7', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                                    <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1rem', fontWeight: 800, color: '#1a2233' }}>Messages per Day (30d)</h3>
                                    <div style={{ height: '180px', display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
                                        {history30d.map((h: any, i: number) => {
                                            const height = (h.total_messages / max30dMsgs) * 100;
                                            const isSelected = h.date === selectedDate;
                                            return (
                                                <div key={i} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                                                    <div style={{ 
                                                        width: '100%', 
                                                        height: `${Math.max(height, 2)}%`, 
                                                        background: isSelected ? '#44aaff' : '#cbd5e1',
                                                        borderRadius: '3px 3px 0 0',
                                                        transition: 'height 0.3s ease'
                                                    }} title={`${h.date}: ${h.total_messages} msgs`}></div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Vessel Distribution */}
                                <div style={{ background: 'white', borderRadius: '16px', padding: '30px', border: '1px solid #eef2f7', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                                    <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1rem', fontWeight: 800, color: '#1a2233' }}>Vessel Distribution</h3>
                                    <div style={{ display: 'flex', gap: '25px', alignItems: 'center' }}>
                                        <div style={{ width: '150px', height: '150px', position: 'relative' }}>
                                            <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                                                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f1f5f9" strokeWidth="10" />
                                                {donutPaths.map((p: any, i: number) => (
                                                    <path key={i} d={p.d} fill="transparent" stroke={p.color} strokeWidth="10" strokeLinecap="round" />
                                                ))}
                                            </svg>
                                            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                                                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1a2233' }}>{today.unique_ships}</div>
                                                <div style={{ fontSize: '0.6rem', color: '#94a3b8', textTransform: 'uppercase' }}>Ships</div>
                                            </div>
                                        </div>
                                        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                                            {donutPaths.map((p: any, i: number) => (
                                                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div style={{ width: '8px', height: '8px', background: p.color, borderRadius: '50%' }}></div>
                                                        <div style={{ color: '#5a6b8a' }}>{p.label}</div>
                                                    </div>
                                                    <div style={{ fontWeight: 700, color: '#1a2233' }}>{p.count}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Activity Chart */}
                            <div style={{ background: 'white', borderRadius: '16px', padding: '30px', border: '1px solid #eef2f7', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1a2233' }}>Hourly Message Activity</h3>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.8rem', color: '#5a6b8a' }}>
                                        <div style={{ width: '30px', height: '2px', background: '#22d3ee' }}></div>
                                        <span>Total Reports / Hour</span>
                                    </div>
                                </div>
                                <div style={{ height: '220px', position: 'relative', marginTop: '10px' }}>
                                    {/* Gridlines */}
                                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
                                        {[0, 1, 2, 3].map(i => <div key={i} style={{ width: '100%', height: '1px', background: '#f1f5f9' }}></div>)}
                                    </div>
                                    
                                    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                                        <defs>
                                            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.15" />
                                                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.0" />
                                            </linearGradient>
                                        </defs>
                                        <path d={areaPath} fill="url(#areaGradient)" />
                                        <polyline points={linePath} fill="none" stroke="#22d3ee" strokeWidth="1.2" strokeLinejoin="round" />
                                        {hourlyBreakdown.map((h: any, i: number) => {
                                            const x = (i / 23) * 1000;
                                            const y = 100 - (h.count / maxHourlyMsgs) * 85;
                                            return <circle key={i} cx={x} cy={y} r="3" fill="white" stroke="#22d3ee" strokeWidth="1" />;
                                        })}
                                    </svg>
                                    
                                    {/* Labels */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px', color: '#94a3b8', fontSize: '0.7rem' }}>
                                        {hourlyBreakdown.filter((_: any, i: number) => i % 2 === 0).map((h: any, i: number) => (
                                            <span key={i}>{h.hour}:00</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ padding: '20px 40px', background: '#f1f5f9', borderTop: '1px solid #eef2f7', display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{ padding: '10px 25px', background: '#1a2233', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
                        Close Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
}

function VesselDetailModal({ isOpen, onClose, ship, colors, mqttSettings }: any) {
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
        { label: 'Fartygstyp', value: ship.ship_type_text || (ship.shiptype ? `Typ ${ship.shiptype}` : 'N/A') },
    ];

    const navBlocks = [
        { label: 'Position', value: `${ship.lat.toFixed(3)}, ${ship.lon.toFixed(3)}` },
        { label: 'Fart (SOG)', value: formatSpeed(ship.sog, mqttSettings.units) },
        { label: 'Kurs (COG)', value: ship.cog != null ? `${ship.cog.toFixed(0)}°` : '--' },
        { label: 'Styrning', value: ship.heading != null ? `${ship.heading}°` : '--' },
        { label: 'ROT', value: ship.rot != null ? `${ship.rot}°/min` : '--' },
        { label: 'Status', value: ship.status_text || 'Okänd' },
    ];

    const voyageBlocks = [
        { label: 'Destination', value: ship.destination || '--' },
        { label: 'ETA', value: ship.eta || '--' },
        { label: 'Djupgående', value: ship.draught ? `${ship.draught}m` : '--' },
    ];

    const specBlocks = [
        { label: 'Längd', value: ship.length ? `${ship.length}m` : '--' },
        { label: 'Bredd', value: ship.width ? `${ship.width}m` : '--' },
        { label: 'Meddelanden', value: ship.message_count || '--' },
        { label: 'Senaste', value: getTimeAgo(ship.timestamp) },
        { label: 'Källa', value: ship.source === 'aisstream' ? 'Stream' : 'Lokal' },
        { label: 'Sett tidigare', value: ship.previous_seen ? getTimeAgo(ship.previous_seen) : '--' },
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
                    
                    {localImage && localImage !== "/images/0.jpg" ? (
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
                            title="Klicka för att ladda upp egen bild"
                            onClick={() => fileInputRef.current?.click()}
                            style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#666', gap: '10px', cursor: 'pointer', opacity: uploading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                            <Ship size={80} strokeWidth={1} />
                            <span style={{ fontSize: '0.9rem' }}>{uploading ? 'Laddar upp...' : 'Klicka för att ladda upp egen bild'}</span>
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
                                    <h1 style={{ margin: 0, fontSize: '2.2rem', fontWeight: 800, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{ship.name || 'Okänt Fartyg'}</h1>
                                    <div style={{
                                        background: ship.source === 'aisstream' ? '#44aaff33' : '#00ff8033',
                                        color: ship.source === 'aisstream' ? '#44aaff' : '#00ff80',
                                        padding: '2px 10px',
                                        borderRadius: '20px',
                                        fontSize: '0.7rem',
                                        fontWeight: 800,
                                        letterSpacing: '0.5px',
                                        textTransform: 'uppercase',
                                        border: `1px solid ${ship.source === 'aisstream' ? '#44aaff66' : '#00ff8066'}`,
                                        backdropFilter: 'blur(4px)'
                                    }}>
                                        {ship.source === 'aisstream' ? 'STREAM' : 'LIVE'}
                                    </div>
                                </div>
                                <div style={{ opacity: 0.9, fontSize: '1rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Anchor size={16} />
                                    {ship.ship_type_text || (ship.shiptype ? `Typ ${ship.shiptype}` : 'Okänd Typ')}
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
                                <span style={{ fontSize: '0.9rem', fontWeight: 800, letterSpacing: '1px' }}>RESA</span>
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

                <div style={{ padding: '20px 30px', borderTop: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'flex-end', background: colors.bgCard }}>
                    <button 
                        className="styled-button primary" 
                        onClick={onClose} 
                        style={{ 
                            borderRadius: '12px', 
                            padding: '10px 40px', 
                            fontSize: '1rem', 
                            fontWeight: 700, 
                            background: 'linear-gradient(135deg, #44aaff 0%, #0066cc 100%)',
                            boxShadow: '0 4px 15px rgba(0,102,204,0.3)',
                            border: 'none',
                            color: 'white',
                            cursor: 'pointer'
                        }}
                    >
                        Stäng
                    </button>
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

function SettingsModal({ isOpen, onClose, settings, setSettings, onSave, activeTab, setActiveTab, colors }: any) {
    if (!isOpen) return null;

    const tabs = [
        { id: 'general', label: 'General', icon: <Info size={18} /> },
        { id: 'mqtt', label: 'MQTT', icon: <Signal size={18} /> },
        { id: 'trail', label: 'Tracking', icon: <Navigation size={18} /> },
        { id: 'map', label: 'Map', icon: <Sun size={18} /> },
        { id: 'coverage', label: 'Coverage', icon: <Navigation size={18} /> },
        { id: 'sdr', label: 'SDR Tuning', icon: <Radio size={18} /> },
        { id: 'hybrid', label: 'Hybrid Data', icon: <Globe size={18} /> },
    ];

    return (
        <div className="settings-modal-overlay" onClick={onClose}>
            <div className="settings-modal" onClick={e => e.stopPropagation()}>
                <div className="settings-tabs" style={{ flexWrap: 'wrap' }}>
                    {tabs.map(t => (
                        <button
                            key={t.id}
                            className={`settings-tab-btn ${activeTab === t.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(t.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
                        >
                            {t.icon} {t.label}
                        </button>
                    ))}
                    <div style={{ flex: 1 }}></div>
                    <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '10px', color: colors.textMuted }}>
                        <X size={24} />
                    </button>
                </div>

                <div className="settings-content">
                    {activeTab === 'general' && (
                        <div className="settings-section">
                            <div className="settings-section-title">General Settings</div>
                            <div className="form-group">
                                <div>
                                    <label>Vessel Timeout</label>
                                    <div className="description">How long a vessel remains visible after last signal (minutes)</div>
                                </div>
                                <input
                                    type="number"
                                    value={settings.ship_timeout}
                                    onChange={e => setSettings({ ...settings, ship_timeout: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <div>
                                    <label>Units</label>
                                    <div className="description">Choose between Nautical (nm/kn) or Metric (km/km/h)</div>
                                </div>
                                <select value={settings.units} onChange={e => setSettings({ ...settings, units: e.target.value })}>
                                    <option value="nautical">Nautical (nm, kn)</option>
                                    <option value="metric">Metric (km, km/h)</option>
                                </select>
                            </div>
                            <div className="settings-section-title" style={{ marginTop: '10px' }}>Station Position</div>
                            <div className="form-group">
                                <label>Latitude</label>
                                <input
                                    type="text"
                                    placeholder="e.g. 59.3293"
                                    value={settings.origin_lat}
                                    onChange={e => setSettings({ ...settings, origin_lat: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Longitude</label>
                                <input
                                    type="text"
                                    placeholder="e.g. 18.0686"
                                    value={settings.origin_lon}
                                    onChange={e => setSettings({ ...settings, origin_lon: e.target.value })}
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'mqtt' && (
                        <div className="settings-section">
                            <div className="settings-section-title">Connection</div>
                            <div className="form-group">
                                <label>MQTT Enabled</label>
                                <Toggle
                                    checked={settings.mqtt_enabled === 'true'}
                                    onChange={val => setSettings({ ...settings, mqtt_enabled: String(val) })}
                                />
                            </div>
                            <div className="form-group vertical">
                                <label>MQTT Broker URL</label>
                                <input type="text" placeholder="mqtt://localhost:1883" value={settings.mqtt_url} onChange={e => setSettings({ ...settings, mqtt_url: e.target.value })} style={{ width: '100%', boxSizing: 'border-box' }} />
                            </div>
                            <div className="form-group vertical">
                                <label>MQTT Topic</label>
                                <input type="text" placeholder="ais" value={settings.mqtt_topic} onChange={e => setSettings({ ...settings, mqtt_topic: e.target.value })} style={{ width: '100%', boxSizing: 'border-box' }} />
                            </div>
                            <div className="settings-section-title" style={{ marginTop: '10px' }}>Authentication (Optional)</div>
                            <div className="form-group">
                                <label>Username</label>
                                <input type="text" value={settings.mqtt_user} onChange={e => setSettings({ ...settings, mqtt_user: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Password</label>
                                <input type="password" value={settings.mqtt_pass} onChange={e => setSettings({ ...settings, mqtt_pass: e.target.value })} />
                            </div>
                        </div>
                    )}

                    {activeTab === 'trail' && (
                        <div className="settings-section">
                            <div className="settings-section-title">Visualization</div>
                            <div className="form-group">
                                <label>Show Vessel Trails (Breadcrumbs)</label>
                                <Toggle
                                    checked={settings.trail_enabled === 'true'}
                                    onChange={val => setSettings({ ...settings, trail_enabled: String(val) })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Tracking Mode</label>
                                <select 
                                    value={settings.trail_mode || 'all'} 
                                    onChange={e => setSettings({ ...settings, trail_mode: e.target.value })}
                                    style={{
                                        background: settings.map_style === 'dark' ? 'rgba(0,0,0,0.2)' : '#fff',
                                        color: colors.textMain,
                                        border: `1px solid ${colors.border}`,
                                        borderRadius: '6px',
                                        padding: '6px 8px',
                                        fontSize: '0.85rem'
                                    }}
                                >
                                    <option value="all">Show All Trails</option>
                                    <option value="selected">Only Selected/Hovered</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <div>
                                    <label>History (Minutes)</label>
                                    <div className="description">How far back trails are shown (requires reload)</div>
                                </div>
                                <input type="number" value={settings.history_duration} onChange={e => setSettings({ ...settings, history_duration: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Trail Color</label>
                                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                                    <input type="color" value={settings.trail_color} onChange={e => setSettings({ ...settings, trail_color: e.target.value })} style={{ width: '60px', height: '35px', padding: '2px', border: 'none', background: 'transparent', cursor: 'pointer' }} />
                                    <span style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{settings.trail_color.toUpperCase()}</span>
                                </div>
                            </div>
                            <div className="form-group vertical">
                                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                    <label>Opacity</label>
                                    <span style={{ fontSize: '0.85rem', color: '#44aaff', fontWeight: 600 }}>{Math.round(parseFloat(settings.trail_opacity) * 100)}%</span>
                                </div>
                                <input type="range" min="0.1" max="1" step="0.1" value={settings.trail_opacity} onChange={e => setSettings({ ...settings, trail_opacity: e.target.value })} style={{ width: '100%' }} />
                            </div>
                        </div>
                    )}

                    {activeTab === 'map' && (
                        <div className="settings-section">
                            <div className="settings-section-title">Map Settings</div>
                            <div className="form-group">
                                <div>
                                    <label>Show Vessel Names</label>
                                    <div className="description">Displays name directly above the vessel icon on the map</div>
                                </div>
                                <Toggle
                                    checked={settings.show_names_on_map === 'true'}
                                    onChange={val => setSettings({ ...settings, show_names_on_map: String(val) })}
                                />
                            </div>
                            <div className="form-group">
                                <label>UI Theme</label>
                                <select value={settings.map_style} onChange={e => setSettings({ ...settings, map_style: e.target.value })}>
                                    <option value="light">Light Mode</option>
                                    <option value="dark">Dark Mode (Night)</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Map Layer (Base)</label>
                                <select value={settings.base_layer} onChange={e => setSettings({ ...settings, base_layer: e.target.value })}>
                                    <option value="standard">Standard Vector</option>
                                    <option value="satellite">Satellite Imagery</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Show Range Rings</label>
                                <Toggle
                                    checked={settings.show_range_rings === 'true'}
                                    onChange={val => setSettings({ ...settings, show_range_rings: String(val) })}
                                />
                            </div>
                            <div className="settings-section-title" style={{ marginTop: '10px' }}>Object Sizes</div>
                            <div className="form-group vertical">
                                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                    <label>Vessels (Moving)</label>
                                    <span style={{ fontSize: '0.85rem', color: '#44aaff', fontWeight: 600 }}>{settings.ship_size}x</span>
                                </div>
                                <input type="range" min="0.5" max="3" step="0.1" value={settings.ship_size} onChange={e => setSettings({ ...settings, ship_size: e.target.value })} style={{ width: '100%' }} />
                            </div>
                            <div className="form-group vertical">
                                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                    <label>Stationary / Meteo</label>
                                    <span style={{ fontSize: '0.85rem', color: '#44aaff', fontWeight: 600 }}>{settings.circle_size}x</span>
                                </div>
                                <input type="range" min="0.5" max="3" step="0.1" value={settings.circle_size} onChange={e => setSettings({ ...settings, circle_size: e.target.value })} style={{ width: '100%' }} />
                            </div>
                            <div className="form-group vertical">
                                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                    <label>Trail Thickness</label>
                                    <span style={{ fontSize: '0.85rem', color: '#44aaff', fontWeight: 600 }}>{settings.trail_size}px</span>
                                </div>
                                <input type="range" min="1" max="10" step="0.5" value={settings.trail_size} onChange={e => setSettings({ ...settings, trail_size: e.target.value })} style={{ width: '100%' }} />
                            </div>
                        </div>
                    )}

                    {activeTab === 'coverage' && (
                        <div className="settings-section">
                            <div className="settings-section-title">Statistics & Coverage</div>
                            <div className="form-group" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '15px' }}>
                                <div className="description" style={{ fontSize: '0.9rem' }}>
                                    Here you can reset all saved coverage data. This removes 24h stats and "All-time high".
                                </div>
                                <button
                                    className="styled-button"
                                    style={{
                                        color: '#ff4444',
                                        borderColor: '#ff4444',
                                        padding: '10px 20px',
                                        fontWeight: 'bold',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
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
                        </div>
                    )}

                    {activeTab === 'sdr' && (
                        <div className="settings-section">
                            <div className="settings-section-title">SDR Tuning (Requires Restart)</div>
                            <div className="form-group">
                                <div>
                                    <label>PPM Error (Frequency Correction)</label>
                                    <div className="description">e.g. 0 or 34</div>
                                </div>
                                <input type="number" value={settings.sdr_ppm} onChange={e => setSettings({ ...settings, sdr_ppm: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <div>
                                    <label>Tuner Gain</label>
                                    <div className="description">e.g. auto, 49.6, etc</div>
                                </div>
                                <input type="text" value={settings.sdr_gain} onChange={e => setSettings({ ...settings, sdr_gain: e.target.value })} />
                            </div>
                        </div>
                    )}

                    {activeTab === 'hybrid' && (
                        <div className="settings-section">
                            <div className="settings-section-title">AisStream.io Integration</div>
                            <div className="form-group">
                                <label>Enable Hybrid Data</label>
                                <Toggle
                                    checked={settings.aisstream_enabled === 'true'}
                                    onChange={val => setSettings({ ...settings, aisstream_enabled: String(val) })}
                                />
                            </div>
                            <div className="form-group vertical">
                                <label>AisStream.io API Key</label>
                                <input 
                                    type="password" 
                                    placeholder="Your API Key" 
                                    value={settings.aisstream_api_key} 
                                    onChange={e => setSettings({ ...settings, aisstream_api_key: e.target.value })} 
                                    style={{ width: '100%', boxSizing: 'border-box' }} 
                                />
                                <div className="description" style={{ marginTop: '8px' }}>
                                    Required to fetch live AIS data from AisStream.io. 
                                    Get your free key at <a href="https://aisstream.io" target="_blank" rel="noreferrer" style={{color: '#44aaff'}}>aisstream.io</a>.
                                </div>
                            </div>
                            <div className="form-group" style={{ marginTop: '10px' }}>
                                <label>Show internet vessels on main map</label>
                                <Toggle
                                    checked={settings.show_aisstream_on_map !== 'false'}
                                    onChange={val => setSettings({ ...settings, show_aisstream_on_map: String(val) })}
                                />
                            </div>

                            <div className="settings-section-title" style={{ marginTop: '20px' }}>Local Data Sources</div>
                            <div className="form-group">
                                <label>Enable Local SDR Dongle</label>
                                <Toggle
                                    checked={settings.sdr_enabled === 'true'}
                                    onChange={val => setSettings({ ...settings, sdr_enabled: String(val) })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Enable UDP NMEA Listener</label>
                                <Toggle
                                    checked={settings.udp_enabled === 'true'}
                                    onChange={val => setSettings({ ...settings, udp_enabled: String(val) })}
                                />
                            </div>
                            <div className="form-group">
                                <div>
                                    <label>UDP Listen Port</label>
                                    <div className="description">Default: 10110</div>
                                </div>
                                <input 
                                    type="number" 
                                    value={settings.udp_port} 
                                    onChange={e => setSettings({ ...settings, udp_port: e.target.value })} 
                                    style={{ width: '100px' }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ padding: '25px 30px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '15px', background: 'rgba(0,0,0,0.1)' }}>
                    <button className="styled-button" style={{ padding: '10px 20px', borderRadius: '8px' }} onClick={onClose}>Cancel</button>
                    <button className="styled-button primary" style={{ padding: '10px 25px', borderRadius: '8px', background: 'linear-gradient(135deg, #44aaff 0%, #0066cc 100%)', boxShadow: '0 4px 15px rgba(0,102,204,0.3)' }} onClick={() => { onSave(); onClose(); }}>Save Changes</button>
                </div>
            </div>
        </div>
    );
}

export default function App() {
    const [ships, setShips] = useState<any[]>([]);
    const [status, setStatus] = useState('Ansluter...');
    const [mqttConnected, setMqttConnected] = useState(false);
    const [hoveredMmsi, setHoveredMmsi] = useState<string | null>(null);
    const [localTimeoutStr, setLocalTimeoutStr] = useState('60');
    const [coverageSectors, setCoverageSectors] = useState<any[]>([]);
    const [flashedMmsis, setFlashedMmsis] = useState<Set<string>>(new Set());
    const [showFlash, setShowFlash] = useState(() => localStorage.getItem('naviscore_flash') !== 'false');

    // Theme and Settings State
    const [theme, setTheme] = useState<'light' | 'dark'>('light'); // Light is default now!
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
    const [mqttSettings, setMqttSettings] = useState({
        mqtt_enabled: 'false',
        mqtt_url: '',
        mqtt_topic: 'ais',
        mqtt_user: '',
        mqtt_pass: '',
        ship_timeout: '60',
        origin_lat: '',
        origin_lon: '',
        show_range_rings: 'true',
        map_style: 'light',
        range_type: '24h',
        base_layer: 'standard',
        history_duration: '60',
        show_names_on_map: 'true',
        trail_color: '#ff4444',
        trail_opacity: '0.6',
        trail_enabled: 'true',
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
        udp_port: '10110'
    });
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [isNmeaModalOpen, setIsNmeaModalOpen] = useState(false);
    const [nmeaLogs, setNmeaLogs] = useState<any[]>([]);
    const [settingsTab, setSettingsTab] = useState('general');

    const [selectedShipMmsi, setSelectedShipMmsi] = useState<string | null>(null);

    const [isResizing, setIsResizing] = useState(false);
    const isResizingRef = useRef(isResizing);
    const [currentZoom, setCurrentZoom] = useState(10);
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'last_seen', direction: 'desc' });
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = localStorage.getItem('naviscore_sidebar_width');
        return saved ? parseInt(saved) : 380;
    });

    // Sidebar Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [filterSource, setFilterSource] = useState('all'); // all, sdr, stream
    const [filterShipType, setFilterShipType] = useState('all');
    const hoverTimerRef = useRef<number | null>(null);
    const lastFlashRef = useRef<Record<string, number>>({});

    // Performance & Hybrid Visibility
    const [pinnedMmsis, setPinnedMmsis] = useState<Set<string>>(new Set());
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, mmsi: string } | null>(null);

    const filteredShipsCount = useMemo(() => {
        const showAisStream = String(mqttSettings.show_aisstream_on_map) !== 'false';
        return ships.filter(s => {
            const nameUpper = (s.name || "").toUpperCase();
            const mmsiStr = String(s.mmsi || "");
            const type = s.shiptype || s.ship_type;
            const isMeteo = s.is_meteo || nameUpper.includes('METEO') || nameUpper.includes('WEATHER');
            if (isMeteo) return false;

            // Internet vessel filtering
            if (!showAisStream && (s.source === 'aisstream')) return false;

            // Exclude ATONs (Buoys/Beacons/etc)
            if (mmsiStr.startsWith('99') || (type >= 91 && type <= 99) || type === 21) return false;

            // Exclude Aircraft (SAR typically type 18)
            if (type === 18) return false;

            return true;
        }).length;
    }, [ships, mqttSettings.show_aisstream_on_map]);

    // Fetch settings on mount
    useEffect(() => {
        const isDev = window.location.port === '5173';
        const baseUrl = isDev ? 'http://127.0.0.1:8080' : '/api';
        const fetchPath = isDev ? 'http://127.0.0.1:8080/api/settings' : '/api/settings';

        fetch(fetchPath)
            .then(r => r.json())
            .then(data => {
                setMqttSettings({
                    mqtt_enabled: data.mqtt_enabled || 'false',
                    mqtt_url: data.mqtt_url || '',
                    mqtt_topic: data.mqtt_topic || 'ais',
                    mqtt_user: data.mqtt_user || '',
                    mqtt_pass: data.mqtt_pass || '',
                    ship_timeout: data.ship_timeout || '60',
                    origin_lat: data.origin_lat || '',
                    origin_lon: data.origin_lon || '',
                    show_range_rings: data.show_range_rings || 'true',
                    map_style: data.map_style || 'light',
                    range_type: data.range_type || '24h',
                    base_layer: data.base_layer || 'standard',
                    history_duration: data.history_duration || '60',
                    show_names_on_map: data.show_names_on_map || 'true',
                    trail_color: data.trail_color || '#ff4444',
                    trail_opacity: data.trail_opacity || '0.6',
                    trail_enabled: data.trail_enabled || 'true',
                    sdr_ppm: data.sdr_ppm || '0',
                    sdr_gain: data.sdr_gain || 'auto',
                    units: data.units || 'nautical',
                    ship_size: data.ship_size || '1.0',
                    circle_size: data.circle_size || '1.0',
                    trail_size: data.trail_size || '2.0',
                    aisstream_enabled: data.aisstream_enabled || 'false',
                    aisstream_api_key: data.aisstream_api_key || '',
                    trail_mode: data.trail_mode || 'all',
                    show_aisstream_on_map: data.show_aisstream_on_map || 'true',
                    sdr_enabled: data.sdr_enabled || 'true',
                    udp_enabled: data.udp_enabled || 'true',
                    udp_port: data.udp_port || '10110'
                });
                setLocalTimeoutStr(data.ship_timeout || '60');
                setTheme(data.map_style === 'dark' ? 'dark' : 'light');
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

    const saveSettings = async () => {
        const isDev = window.location.port === '5173';
        const fetchPath = isDev ? 'http://127.0.0.1:8080/api/settings' : '/api/settings';

        try {
            await fetch(fetchPath, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mqttSettings)
            });

            // Refetch coverage sectors manually
            const isDev = window.location.port === '5173';
            const coveragePath = isDev ? 'http://127.0.0.1:8080/api/coverage' : '/api/coverage';
            fetch(coveragePath)
                .then(r => r.json())
                .then(data => setCoverageSectors(data))
                .catch(console.error);

            alert('Settings saved!');
        } catch (err) {
            console.error(err);
            alert('Could not save settings');
        }
    };

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
            
            // Allow weather objects
            // const nameUpper = (data.name || "").toUpperCase();
            // if (data.is_meteo || nameUpper.includes('METEO') || nameUpper.includes('WEATHER')) return;

            if (data.type === 'status') {
                setStatus('Status: ' + data.message);
            } else if (data.type === 'mqtt_status') {
                setMqttConnected(data.connected);
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
                        }, 1500);
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
            setShips((prev: any[]) => prev.filter((s: any) => (nu - s.timestamp) < msTimeout));
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
        accent: '#00f0ff',
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
            mousemove: (e: any) => {
                // To avoid tooltips sticking, clear hover if user moves mouse far from ships
                // Markers handle their own hover, but this is a safety fallback
            },
            mousedown: () => setHoveredMmsi(null) // Hard clear on click anywhere else
        });
        return null;
    }

    const showRangeRings = mqttSettings.show_range_rings === 'true';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: colors.bgMain, color: colors.textMain, overflow: 'hidden' }}>
            {/* Header */}
            <header style={{
                position: 'relative',
                padding: '15px 25px',
                background: isDark ? '#0f0f1a' : '#ffffff',
                color: isDark ? '#00f0ff' : '#00838f',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: `1px solid ${colors.border}`,
                boxShadow: isDark ? '0 2px 10px rgba(0,0,0,0.5)' : '0 2px 10px rgba(0,0,0,0.05)',
                zIndex: 1000
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Anchor size={28} />
                    <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, letterSpacing: '1px' }}>NavisCore</h1>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{
                        background: isDark ? 'rgba(0, 240, 255, 0.1)' : '#e0f7fa',
                        color: isDark ? '#00f0ff' : '#006064',
                        padding: '6px 16px',
                        borderRadius: '20px',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        border: `1px solid ${isDark ? 'rgba(0, 240, 255, 0.3)' : '#b2ebf2'}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <Ship size={16} />
                        Vessels: {filteredShipsCount}
                    </div>

                    {!isNaN(originLat) && !isNaN(originLon) && maxDistance > 0 && (
                        <div style={{
                            background: isDark ? 'rgba(0, 240, 255, 0.1)' : '#e0f7fa',
                            color: isDark ? '#00f0ff' : '#0097a7',
                            padding: '6px 16px',
                            borderRadius: '20px',
                            fontSize: '0.9rem',
                            fontWeight: 600,
                            border: `1px solid ${isDark ? 'rgba(0, 240, 255, 0.3)' : '#b2ebf2'}`,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <Navigation size={16} />
                            Station Range: {formatDistance(maxDistance, mqttSettings.units)}
                        </div>
                    )}

                    <div style={{
                        background: (status.toLowerCase().includes('ansluten') || status.toLowerCase().includes('connected')) ? (isDark ? 'rgba(0, 255, 128, 0.1)' : '#e6fffa') : (isDark ? 'rgba(255, 50, 50, 0.1)' : '#fff5f5'),
                        color: (status.toLowerCase().includes('ansluten') || status.toLowerCase().includes('connected')) ? (isDark ? '#00ff80' : '#047857') : (isDark ? '#ff3333' : '#c53030'),
                        padding: '6px 16px',
                        borderRadius: '20px',
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        border: `1px solid ${(status.toLowerCase().includes('ansluten') || status.toLowerCase().includes('connected')) ? (isDark ? 'rgba(0, 255, 128, 0.3)' : '#a7f3d0') : (isDark ? 'rgba(255, 50, 50, 0.3)' : '#feb2b2')}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: (status.toLowerCase().includes('ansluten') || status.toLowerCase().includes('connected')) ? (isDark ? '#00ff80' : '#10b981') : (isDark ? '#ff3333' : '#ef4444'),
                            boxShadow: isDark ? `0 0 10px ${(status.toLowerCase().includes('ansluten') || status.toLowerCase().includes('connected')) ? '#00ff80' : '#ff3333'}` : 'none'
                        }} />
                        {status}
                    </div>

                    {mqttSettings.mqtt_enabled === 'true' && (
                        <div style={{
                            background: mqttConnected ? (isDark ? 'rgba(0, 255, 128, 0.1)' : '#e6fffa') : (isDark ? 'rgba(255, 50, 50, 0.1)' : '#fff5f5'),
                            color: mqttConnected ? (isDark ? '#00ff80' : '#047857') : (isDark ? '#ff3333' : '#c53030'),
                            padding: '6px 16px',
                            borderRadius: '20px',
                            fontSize: '0.9rem',
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

            <div style={{ flex: 1, display: 'flex', position: 'relative', minHeight: 0, overflow: 'hidden' }}>

                <div style={{ flex: 1, position: 'relative' }}>
                    {!isSettingsLoaded ? (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', background: colors.bgMain, color: colors.textMuted }}>
                            Loading map...
                        </div>
                    ) : (
                        <MapContainer key={`map-${theme}`} center={initialCenter as L.LatLngExpression} zoom={(() => { try { const z = parseInt(localStorage.getItem('naviscore_zoom') || ''); return isNaN(z) ? 10 : z; } catch { return 10; } })()} style={{ height: '100%', width: '100%', background: colors.bgMain }} zoomControl={false}>
                            <CenterButton originLat={originLat} originLon={originLon} />
                            <ZoomTracker setZoom={setCurrentZoom} />
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
                                        attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                                    />
                                </LayersControl.BaseLayer>
                                <LayersControl.BaseLayer name="Sea Chart / OSM" checked={mqttSettings.base_layer === 'osm'}>
                                    <TileLayer
                                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
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

                                            <Circle center={[originLat, originLon]} radius={10000} pathOptions={{ color: '#0066cc', weight: 1.5, fill: false, opacity: 0.5, dashArray: '5 5' }} />
                                            <Circle center={[originLat, originLon]} radius={20000} pathOptions={{ color: '#0066cc', weight: 1.5, fill: false, opacity: 0.5, dashArray: '5 5' }} />
                                            <Circle center={[originLat, originLon]} radius={50000} pathOptions={{ color: '#0066cc', weight: 1.5, fill: false, opacity: 0.5, dashArray: '5 5' }} />
                                            <Circle center={[originLat, originLon]} radius={100000} pathOptions={{ color: '#0066cc', weight: 1.5, fill: false, opacity: 0.5, dashArray: '5 5' }} />
                                        </>
                                    )}
                                </>
                            )}

                            {ships.map((s: any, idx: number) => {
                                const mmsiStr = String(s.mmsi);
                                const nameUpper = (s.name || "").toUpperCase();
                                if (!s.lat || !s.lon) return null;

                                // Internet vessel filtering
                                const showAisStream = String(mqttSettings.show_aisstream_on_map) !== 'false';
                                if (!showAisStream && (s.source === 'aisstream')) return null;

                                // Smart Label Logic:
                                // 1. Zoom > 13: Show all names
                                // 2. Zoom 11-13: Show every 3rd ship
                                // 3. Zoom < 11: Show every 10th ship 
                                // This prevents clutter in busy areas while still showing some activity
                                let shouldShowName = false;
                                if (mqttSettings.show_names_on_map === 'true' && !s.is_meteo) {
                                    if (currentZoom > 13) shouldShowName = true;
                                    else if (currentZoom > 11 && idx % 3 === 0) shouldShowName = true;
                                    else if (currentZoom <= 11 && idx % 10 === 0) shouldShowName = true;
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
                                    s.virtual_aton
                                );

                                return (
                                    <Marker key={`vessel-${mmsiStr}`} position={[s.lat, s.lon]} icon={icon}
                                        riseOnHover={true}
                                    eventHandlers={{
                                        mouseover: () => {
                                            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                                            hoverTimerRef.current = setTimeout(() => {
                                                setHoveredMmsi(mmsiStr);
                                            }, 1000);
                                        },
                                        mouseout: () => {
                                            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                                            setHoveredMmsi(null);
                                        },
                                        click: (e) => {
                                            // If we have a tooltip open, clear it when clicking (opening popup)
                                            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                                            setHoveredMmsi(null);
                                        },
                                        dblclick: (e) => {
                                            // Explicitly for double click as requested
                                            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                                            setHoveredMmsi(null);
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
                                        {hoveredMmsi === mmsiStr && (
                                            <Tooltip
                                                key={`hover-tip-${mmsiStr}`}
                                                permanent
                                                direction="top"
                                                offset={[0, -15]}
                                                opacity={0.98}
                                                className={s.is_meteo ? "custom-meteo-tooltip" : ""}
                                            >
                                                {s.is_meteo ? (
                                                    <div style={{
                                                        display: 'flex', flexDirection: 'column',
                                                        borderRadius: '8px', overflow: 'hidden',
                                                        boxShadow: '0 6px 16px rgba(0,0,0,0.4)',
                                                        width: '280px',
                                                        fontFamily: 'system-ui, -apple-system, sans-serif'
                                                    }}>
                                                        <div style={{ background: '#44aaff', padding: '10px 15px', color: '#fff', fontSize: '1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <Activity size={18} />
                                                            {s.name || 'Meteorologisk Station'}
                                                        </div>
                                                        <div style={{ background: isDark ? '#1a1a2e' : '#fff', padding: '15px', color: colors.textMain }}>
                                                            <div style={{ fontSize: '0.8rem', color: colors.textMuted, marginBottom: '10px', textAlign: 'center' }}>
                                                                MMSI: {mmsiStr} • {new Date(s.timestamp).toLocaleTimeString()}
                                                            </div>
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                                                <div style={{ background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                                                                    <div style={{ fontSize: '0.7rem', color: colors.textMuted, textTransform: 'uppercase' }}>Vind</div>
                                                                    <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#00f0ff' }}>{s.wind_speed ?? '--'}<span style={{ fontSize: '0.7rem', fontWeight: 400, marginLeft: '2px' }}>m/s</span></div>
                                                                    <div style={{ fontSize: '0.7rem', marginTop: '2px' }}>{s.wind_direction ?? '--'}°</div>
                                                                </div>
                                                                <div style={{ background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                                                                    <div style={{ fontSize: '0.7rem', color: colors.textMuted, textTransform: 'uppercase' }}>Miljö</div>
                                                                    <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#ffab40' }}>{s.air_temp ?? '--'}<span style={{ fontSize: '0.7rem', fontWeight: 400, marginLeft: '2px' }}>°C</span></div>
                                                                    <div style={{ fontSize: '0.7rem', marginTop: '2px' }}>Vatten: {s.water_level ?? '--'} m</div>
                                                                </div>
                                                            </div>
                                                            {s.visibility !== undefined && (
                                                                <div style={{ marginTop: '10px', fontSize: '0.75rem', textAlign: 'center', color: colors.textMuted }}>
                                                                    Sikt: <strong>{s.visibility} NM</strong>
                                                                </div>
                                                            )}
                                                            {s.wind_gust > s.wind_speed && (
                                                                <div style={{ marginTop: '10px', padding: '6px', background: 'rgba(255, 50, 50, 0.1)', color: '#ff3333', borderRadius: '6px', fontSize: '0.75rem', textAlign: 'center', fontWeight: 'bold' }}>
                                                                    ⚠️ Vindbyar upp till {s.wind_gust} m/s
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'var(--bg-card)', padding: '8px', borderRadius: '8px', color: 'var(--text-main)' }}>
                                                        <strong style={{ fontSize: '1rem' }}>{s.name || s.mmsi}</strong>
                                                        {s.is_emergency && (
                                                            <div style={{ background: '#ff0000', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                                                ⚠️ NÖDSITUATION
                                                            </div>
                                                        )}
                                                        {s.virtual_aton && (
                                                            <div style={{ background: '#ff00ff', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>
                                                                VIRTUELLT SJÖMÄRKE
                                                            </div>
                                                        )}
                                                        {s.status_text && (
                                                            <span style={{ fontSize: '0.8rem', fontStyle: 'italic', color: 'var(--text-muted)' }}>
                                                                {s.status_text}
                                                            </span>
                                                        )}
                                                        {s.imageUrl && (
                                                            <img
                                                                src={s.imageUrl}
                                                                onError={(e) => { (e.target as HTMLImageElement).src = "/images/0.jpg"; }}
                                                                alt={s.name}
                                                                style={{ width: '120px', height: '80px', objectFit: 'cover', borderRadius: '4px', marginTop: '4px' }}
                                                            />
                                                        )}
                                                    </div>
                                                )}
                                            </Tooltip>
                                        )}

                                        {/* Detailed Popup on Click - NOT for meteo markers */}
                                        {!s.is_meteo && <Popup className="custom-detailed-popup" offset={[0, -20]}>
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
                                                        {s.imageUrl ? (
                                                            <div style={{ width: '100%', height: '100%', backgroundImage: `url(${s.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                                                                <div style={{ position: 'absolute', bottom: '5px', left: '8px', color: '#fff', fontSize: '0.75rem', fontWeight: 'bold', textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}>
                                                                    NavisCore
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div style={{ width: '100%', height: '100%', background: colors.bgMain, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.textMuted }}>
                                                                No image
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* RIGHT: Stats */}
                                                    <div style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                            <div>
                                                                <div style={{ fontSize: '0.7rem', color: colors.textMuted, textTransform: 'uppercase' }}>SOG / COG</div>
                                                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{formatSpeed(s.sog, mqttSettings.units)} / {s.cog?.toFixed(0) ?? '--'}°</div>
                                                            </div>
                                                            <div>
                                                                    <div style={{ fontSize: '0.7rem', color: colors.textMuted, textTransform: 'uppercase' }}>Dimensions</div>
                                                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{s.length && s.width ? `${s.length}x${s.width}m` : '--'}</div>
                                                                </div>
                                                                {s.is_emergency && (
                                                                    <div style={{ gridColumn: 'span 2', background: '#ff0000', color: '#fff', padding: '8px', borderRadius: '4px', textAlign: 'center', fontWeight: 'bold', animation: 'emergency-flash 1s infinite alternate' }}>
                                                                        ⚠️ NÖDSITUATION
                                                                    </div>
                                                                )}
                                                                {s.virtual_aton && (
                                                                    <div style={{ gridColumn: 'span 2', background: '#ff00ff', color: '#fff', padding: '4px', borderRadius: '4px', textAlign: 'center', fontSize: '0.75rem' }}>
                                                                        VIRTUELT SJÖMÄRKE
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
                                if (mqttSettings.trail_mode === 'selected' && !isHovered && !isSelected && !isPinned) return null;

                                return (
                                    <Polyline
                                        key={`trail-${s.mmsi}`}
                                        positions={s.history}
                                        pathOptions={{
                                            color: (isHovered || isSelected || isPinned) ? '#00f0ff' : mqttSettings.trail_color,
                                            weight: (isHovered || isSelected || isPinned) ? Math.max(parseFloat(mqttSettings.trail_size) + 2, 4) : parseFloat(mqttSettings.trail_size),
                                            opacity: (isHovered || isSelected || isPinned) ? 1 : parseFloat(mqttSettings.trail_opacity),
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


                        </MapContainer>
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
                                    Seen Objects
                                </h1>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                                    <select
                                        value={filterSource}
                                        onChange={(e) => setFilterSource(e.target.value)}
                                        style={{
                                            background: isDark ? 'rgba(0,0,0,0.2)' : '#fff',
                                            color: colors.textMain,
                                            border: `1px solid ${colors.border}`,
                                            borderRadius: '6px',
                                            padding: '6px 8px',
                                            fontSize: '0.8rem',
                                            cursor: 'pointer',
                                            width: '100%'
                                        }}
                                    >
                                        <option value="all">Any Source</option>
                                        <option value="sdr">Local SDR</option>
                                        <option value="stream">AisStream</option>
                                    </select>
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
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <option value="last_seen">Sort: Last Seen</option>
                                        <option value="name">Sort: Name</option>
                                        <option value="shiptype">Sort: Type</option>
                                        <option value="distance">Sort: Distance</option>
                                        <option value="message_count">Sort: Messages</option>
                                    </select>
                                </div>
                                <select
                                    value={filterShipType}
                                    onChange={(e) => setFilterShipType(e.target.value)}
                                    style={{
                                        background: isDark ? 'rgba(0,0,0,0.2)' : '#fff',
                                        color: colors.textMain,
                                        border: `1px solid ${colors.border}`,
                                        borderRadius: '6px',
                                        padding: '6px 8px',
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                        width: '100%'
                                    }}
                                >
                                    <option value="all">All Ship Types</option>
                                    <option value="cargo">Cargo Vessels</option>
                                    <option value="tanker">Tankers</option>
                                    <option value="passenger">Passenger Ships</option>
                                    <option value="fishing">Fishing</option>
                                    <option value="pleasure">Pleasure/Sailing</option>
                                    <option value="tug">Tugs/Towing</option>
                                    <option value="highspeed">High Speed Craft</option>
                                    <option value="other">Other Types</option>
                                </select>
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', boxSizing: 'border-box' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {ships.length === 0 ? (
                                        <div style={{ color: colors.textMuted, textAlign: 'center', padding: '20px', background: colors.bgCard, borderRadius: '8px', border: `1px solid ${colors.border}` }}>
                                            No objects on the radar yet...
                                        </div>
                                    ) : ships
                                        .filter(s => {
                                            const nameUpper = (s.name || "").toUpperCase();
                                            const mmsiStr = String(s.mmsi);
                                            const type = s.shiptype || s.ship_type;
                                            
                                            // Basic exclusions (AtoN, Meteo, etc)
                                            if (s.is_meteo || nameUpper.includes('METEO') || nameUpper.includes('WEATHER')) return false;

                                            // Internet vessel filtering
                                            const showAisStream = String(mqttSettings.show_aisstream_on_map) !== 'false';
                                            if (!showAisStream && (s.source === 'aisstream')) return false;

                                            // Search Filter
                                            if (searchTerm) {
                                                const term = searchTerm.toUpperCase();
                                                if (!nameUpper.includes(term) && !mmsiStr.includes(term)) return false;
                                            }

                                            // Source Filter
                                            if (filterSource !== 'all') {
                                                const source = s.source || 'sdr';
                                                if (filterSource === 'sdr' && source !== 'sdr' && source !== 'local') return false;
                                                if (filterSource === 'stream' && source !== 'aisstream') return false;
                                            }

                                            // Ship Type Filter
                                            if (filterShipType !== 'all') {
                                                if (filterShipType === 'cargo' && !(type >= 70 && type <= 79)) return false;
                                                if (filterShipType === 'tanker' && !(type >= 80 && type <= 89)) return false;
                                                if (filterShipType === 'passenger' && !(type >= 60 && type <= 69)) return false;
                                                if (filterShipType === 'fishing' && type !== 30) return false;
                                                if (filterShipType === 'pleasure' && !(type >= 36 && type <= 37)) return false;
                                                if (filterShipType === 'tug' && !(type >= 31 && type <= 32 || type === 52)) return false;
                                                if (filterShipType === 'highspeed' && !(type >= 40 && type <= 49)) return false;
                                                if (filterShipType === 'other' && (type >= 30 && type <= 89)) return false; // Simple logic: not any above but still defined
                                            }

                                            return true;
                                        })
                                        .map(s => {
                                            const dist = (s.lat && s.lon && mqttSettings.origin_lat && mqttSettings.origin_lon)
                                                ? haversineDistance(s.lat, s.lon, parseFloat(mqttSettings.origin_lat), parseFloat(mqttSettings.origin_lon))
                                                : Infinity;
                                            return { ...s, distance: dist };
                                        })
                                        .sort((a, b) => {
                                            let valA = a[sortConfig.key];
                                            let valB = b[sortConfig.key];

                                            // Specific handling for strings
                                            if (typeof valA === 'string') valA = valA.toLowerCase();
                                            if (typeof valB === 'string') valB = valB.toLowerCase();

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
                                                    padding: '10px',
                                                    background: idx % 2 === 0 ? colors.bgCard : colors.bgSidebar,
                                                    borderRadius: '8px',
                                                    borderLeft: `5px solid ${getShipColor(String(ship.mmsi), ship.shiptype || ship.ship_type, ship.is_meteo, ship.is_aton, ship.is_emergency)}`,
                                                    display: 'flex',
                                                    gap: '12px',
                                                    alignItems: 'center',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    border: `1px solid ${colors.border}`,
                                                    marginBottom: '8px'
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
                                                    e.currentTarget.style.borderColor = '#44aaff';
                                                }}
                                                onMouseLeave={e => {
                                                    e.currentTarget.style.transform = 'translateX(0)';
                                                    e.currentTarget.style.borderColor = colors.border;
                                                }}
                                            >
                                                {/* Thumbnail or Icon */}
                                                <div style={{ width: '60px', minWidth: '60px', height: '45px', borderRadius: '4px', overflow: 'hidden', background: colors.bgMain, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${colors.border}` }}>
                                                    {ship.imageUrl ? (
                                                        <img src={ship.imageUrl} alt={ship.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).src = "/images/0.jpg"; }} />
                                                    ) : (
                                                        <Ship size={20} color={getShipColor(String(ship.mmsi), ship.shiptype || ship.ship_type)} />
                                                    )}
                                                </div>

                                                {/* Info Section */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{
                                                        fontWeight: 700,
                                                        fontSize: '0.9rem',
                                                        color: 'var(--text-main)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        marginBottom: '2px'
                                                    }}>
                                                        <span dangerouslySetInnerHTML={{ __html: getFlagEmoji(String(ship.mmsi), ship.country_code) }} />
                                                        <span style={{
                                                            whiteSpace: 'nowrap',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis'
                                                        }}>
                                                            {ship.name || ship.mmsi}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '4px 8px', alignItems: 'center' }}>
                                                        <span>{getShipTypeName(String(ship.mmsi), ship.shiptype, ship.ship_type_text)}</span>
                                                        <span style={{ opacity: 0.5 }}>•</span>
                                                        <span style={{ color: '#44aaff', fontWeight: 600 }}>{ship.distance !== Infinity ? formatDistance(ship.distance, mqttSettings.units) : '--'}</span>
                                                        <span style={{ marginLeft: 'auto', background: (ship.source === 'aisstream') ? 'rgba(68,170,255,0.1)' : 'rgba(0,255,128,0.1)', color: (ship.source === 'aisstream') ? '#44aaff' : '#00ff80', padding: '1px 5px', borderRadius: '3px', fontSize: '0.6rem', fontWeight: 700, border: `1px solid ${(ship.source === 'aisstream') ? 'rgba(68,170,255,0.2)' : 'rgba(0,255,128,0.2)'}` }}>
                                                            {ship.source === 'aisstream' ? 'STREAM' : 'SDR'}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Speed/Direction */}
                                                <div style={{ textAlign: 'right', minWidth: '65px' }}>
                                                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: (ship.sog && ship.sog > 1) ? '#00ee00' : colors.textMain }}>
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
            />

            <VesselDetailModal
                isOpen={!!selectedShipMmsi}
                onClose={() => setSelectedShipMmsi(null)}
                ship={ships.find((s: any) => String(s.mmsi) === selectedShipMmsi)}
                colors={colors}
                mqttSettings={mqttSettings}
            />

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
                            background: 'linear-gradient(135deg, #00f0ff, #0072ff)', 
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
                                background: viewMode === 'live' ? '#00f0ff' : 'transparent',
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
                                background: viewMode === 'grouped' ? '#00f0ff' : 'transparent',
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
                                                background: '#00f0ff', 
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
                                                borderLeft: `3px solid ${log.decoded ? '#00f0ff' : colors.border}`,
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
                                                                background: '#00f0ff', 
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
                            background: '#00f0ff', 
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
