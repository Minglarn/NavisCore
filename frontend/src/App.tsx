import React, { useState, useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Tooltip, LayersControl, useMap, Circle, Polygon, Polyline, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { Settings, X, Moon, Sun, Anchor, List, Navigation, Search, Ship, Signal, Info, Crosshair } from 'lucide-react';
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

function getShipColor(mmsiStr: string, type?: number) {
    if (mmsiStr.startsWith('99')) return '#ff00ff'; // AtoN (Boj/Fyr)
    if (mmsiStr.startsWith('00')) return '#000000'; // Base Station
    if (!type) return '#a0a0a0'; // Unknown

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
    if (mmsiStr.startsWith('99')) return 'Navigationshjälpmedel (Fyr/Boj)';
    if (mmsiStr.startsWith('00')) return 'Basstation';

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


function getFlagEmoji(mmsiStr?: string, countryCode?: string) {
    if (countryCode && typeof countryCode === 'string' && countryCode.length === 2) {
        return `<img src="https://flagcdn.com/h20/${countryCode.toLowerCase()}.png" alt="${countryCode}" style="height: 14px; width: auto; vertical-align: middle; border-radius: 2px;" />`;
    }

    // Fallback till vanliga emojin om ingen landskod hunnit dyka upp än
    if (!mmsiStr) return '🏳️';
    const mid = mmsiStr.substring(0, 3);
    if (mid === '265' || mid === '266') return '🇸🇪';
    if (mid === '219' || mid === '220') return '🇩🇰';
    if (mid === '257' || mid === '258' || mid === '259') return '🇳🇴';
    if (mid === '230') return '🇫🇮';
    if (mid === '211' || mid === '218') return '🇩🇪';
    if (mid === '235' || mid === '232') return '🇬🇧';
    if (mid === '276') return '🇪🇪';
    if (mid === '275') return '🇱🇻';
    if (mid === '277') return '🇱🇹';
    if (mid === '261') return '🇵🇱';
    if (mid === '273') return '🇷🇺';
    if (mid === '244') return '🇳🇱';
    if (mid === '205') return '🇧🇪';
    return '📌'; // Fallback
}

function ShipIcon(sog: number | undefined, cog: number | undefined, mmsi: string, type?: number) {
    const isMoving = sog !== undefined && sog > 0.5 && cog !== undefined;
    const color = getShipColor(mmsi, type);
    const borderColor = '#000000'; // Dark border for contrast

    let svg = '';

    if (isMoving) {
        // Triangel
        svg = `<svg width="24" height="24" viewBox="0 0 24 24" style="transform: rotate(${cog}deg);">
                 <polygon points="12,2 22,20 12,17 2,20" fill="${color}" stroke="${borderColor}" stroke-width="1.5" />
               </svg>`;
    } else {
        // Cirkel
        svg = `<svg width="16" height="16" viewBox="0 0 16 16">
                 <circle cx="8" cy="8" r="6" fill="${color}" stroke="${borderColor}" stroke-width="1.5" />
               </svg>`;
    }

    return L.divIcon({
        html: `<div class="ship-custom-icon" style="display:flex; justify-content:center; align-items:center; width: 100%; height: 100%;">${svg}</div>`,
        className: 'ship-custom-icon-container',
        iconSize: isMoving ? [24, 24] : [16, 16],
        iconAnchor: isMoving ? [12, 12] : [8, 8]
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
    width: 280px !important;
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
@keyframes ship-flash {
    0% { box-shadow: 0 0 0 0 rgba(0, 200, 255, 0.5); }
    30% { box-shadow: 0 0 12px 4px rgba(0, 200, 255, 0.4); }
    100% { box-shadow: none; }
}
.ship-flash {
    animation: ship-flash 1.5s ease-out;
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
    const [sidebarTab, setSidebarTab] = useState<'ships' | 'settings'>('ships');
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
        range_type: '24h', // '24h' eller 'alltime'
        base_layer: 'standard'
    });

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
                    base_layer: data.base_layer || 'standard'
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

            alert('Inställningar sparade!');
        } catch (err) {
            console.error(err);
            alert('Kunde inte spara inställningar');
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
        ws.onopen = () => setStatus('Ansluten till NavisCore');
        ws.onmessage = (event: MessageEvent) => {
            const data = JSON.parse(event.data);
            if (data.type === 'status') {
                setStatus('Status: ' + data.message);
            } else if (data.type === 'mqtt_status') {
                setMqttConnected(data.connected);
            } else {
                setShips((prev: any[]) => {
                    const existing = prev.find((s: any) => s.mmsi === data.mmsi);
                    if (existing) {
                        return prev.map((s: any) => s.mmsi === data.mmsi ? { ...s, ...data } : s);
                    }
                    return [...prev, data];
                });
                // Flash effect
                if (data.mmsi) {
                    setFlashedMmsis(prev => new Set(prev).add(String(data.mmsi)));
                    setTimeout(() => {
                        setFlashedMmsis(prev => {
                            const next = new Set(prev);
                            next.delete(String(data.mmsi));
                            return next;
                        });
                    }, 1500);
                }
            }
        };
        ws.onclose = () => setStatus('Nedkopplad');
        ws.onerror = () => setStatus('WebSocket Error');

        return () => {
            ws.close();
            document.head.removeChild(style);
        };
    }, []);

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

        const SECTORS = 72; // Samma som backend
        const populated: { sector: number, dist: number }[] = [];

        coverageSectors.forEach((s: any) => {
            let rangeAmount = mqttSettings.range_type === 'alltime' ? s.range_km_alltime : s.range_km_24h;
            if (rangeAmount > 1.0) {
                // Buffer padding so ships don't sit perfectly on the very outer edge
                populated.push({ sector: s.sector_id, dist: rangeAmount + 1.5 });
            }
        });

        if (populated.length === 0) return null;
        populated.sort((a, b) => a.sector - b.sector);

        const MAX_GAP = 15; // 75 degrees max gap between adjacent vessels
        const clusters: { sector: number, dist: number }[][] = [];
        let currentCluster = [populated[0]];

        for (let i = 1; i < populated.length; i++) {
            const prev = populated[i - 1];
            const curr = populated[i];

            if ((curr.sector - prev.sector) > MAX_GAP) {
                clusters.push(currentCluster);
                currentCluster = [curr];
            } else {
                currentCluster.push(curr);
            }
        }

        // Handle wrap-around for the last and first cluster
        if (clusters.length > 0) {
            const firstCluster = clusters[0];
            const lastCluster = currentCluster;
            const firstSector = firstCluster[0].sector;
            const lastSector = lastCluster[lastCluster.length - 1].sector;
            const wrapGap = (firstSector + SECTORS) - lastSector;

            if (wrapGap <= MAX_GAP && firstCluster !== lastCluster) {
                // Merge them!
                clusters[0] = lastCluster.concat(firstCluster);
            } else {
                clusters.push(lastCluster);
            }
        } else {
            clusters.push(currentCluster);
        }

        const polygons = clusters.map(cluster => {
            const pts: [number, number][] = [[originLat, originLon]];
            cluster.forEach(p => {
                const bearing = p.sector * (360 / SECTORS) + (360 / SECTORS / 2);
                const pt = calculateDestinationPoint(originLat, originLon, p.dist, bearing);
                pts.push([pt[0], pt[1]]);
            });
            pts.push([originLat, originLon]);
            return pts;
        });

        return polygons;
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
        if (layerName.includes('Satellit')) mode = 'satellite';
        else if (layerName.includes('Sjökort')) mode = 'osm';

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

    function MapLayerTracker() {
        useMapEvents({
            baselayerchange: (e: any) => handleLayerChange(e.name),
            zoomend: (e: any) => {
                const z = e.target.getZoom();
                localStorage.setItem('naviscore_zoom', String(z));
            },
            moveend: (e: any) => {
                const c = e.target.getCenter();
                localStorage.setItem('naviscore_center', JSON.stringify([c.lat, c.lng]));
            }
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
                            Station Range: {maxDistance.toFixed(1)} km
                        </div>
                    )}

                    <div style={{
                        background: status.includes('Ansluten') ? (isDark ? 'rgba(0, 255, 128, 0.1)' : '#e6fffa') : (isDark ? 'rgba(255, 50, 50, 0.1)' : '#fff5f5'),
                        color: status.includes('Ansluten') ? (isDark ? '#00ff80' : '#047857') : (isDark ? '#ff3333' : '#c53030'),
                        padding: '6px 16px',
                        borderRadius: '20px',
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        border: `1px solid ${status.includes('Ansluten') ? (isDark ? 'rgba(0, 255, 128, 0.3)' : '#a7f3d0') : (isDark ? 'rgba(255, 50, 50, 0.3)' : '#feb2b2')}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: status.includes('Ansluten') ? (isDark ? '#00ff80' : '#10b981') : (isDark ? '#ff3333' : '#ef4444'),
                            boxShadow: isDark ? `0 0 10px ${status.includes('Ansluten') ? '#00ff80' : '#ff3333'}` : 'none'
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
                            onClick={() => { setSidebarTab('ships'); setIsSidebarOpen(true); }}
                            style={{ background: sidebarTab === 'ships' && isSidebarOpen ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)') : 'transparent', border: 'none', color: colors.textMain, cursor: 'pointer', padding: '8px', borderRadius: '8px', transition: 'background 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}
                            onMouseLeave={e => { if (!(sidebarTab === 'ships' && isSidebarOpen)) e.currentTarget.style.background = 'transparent' }}
                        >
                            <List size={22} />
                        </button>
                        <button
                            onClick={() => { setSidebarTab('settings'); setIsSidebarOpen(true); }}
                            style={{ background: sidebarTab === 'settings' && isSidebarOpen ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)') : 'transparent', border: 'none', color: colors.textMain, cursor: 'pointer', padding: '8px', borderRadius: '8px', transition: 'background 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}
                            onMouseLeave={e => { if (!(sidebarTab === 'settings' && isSidebarOpen)) e.currentTarget.style.background = 'transparent' }}
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
                            Laddar karta...
                        </div>
                    ) : (
                        <MapContainer key={`map-${theme}`} center={initialCenter as L.LatLngExpression} zoom={(() => { try { const z = parseInt(localStorage.getItem('naviscore_zoom') || ''); return isNaN(z) ? 10 : z; } catch { return 10; } })()} style={{ height: '100%', width: '100%', background: colors.bgMain }} zoomControl={false}>
                            <CenterButton originLat={originLat} originLon={originLon} />
                            <MapLayerTracker />
                            <LayersControl position="topright">
                                <LayersControl.BaseLayer name="Standard Karta (Minimal)" checked={mqttSettings.base_layer === 'standard' || !mqttSettings.base_layer}>
                                    <TileLayer
                                        url={tileUrl}
                                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                                    />
                                </LayersControl.BaseLayer>
                                <LayersControl.BaseLayer name="Satellit (Esri)" checked={mqttSettings.base_layer === 'satellite'}>
                                    <TileLayer
                                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                        attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                                    />
                                </LayersControl.BaseLayer>
                                <LayersControl.BaseLayer name="Sjökort / OSM" checked={mqttSettings.base_layer === 'osm'}>
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
                                            {maxDistance > 0 && <div style={{ fontSize: '0.8rem', color: '#0066cc', marginTop: '4px' }}>Range: {maxDistance.toFixed(1)} km</div>}
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
                                                        fillColor: '#ff9800',
                                                        fillOpacity: 0.15,
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

                            {ships.map((s: any) => {
                                const mmsiStr = String(s.mmsi); // Define mmsiStr here
                                return s.lat && s.lon && (
                                    <Marker key={s.mmsi} position={[s.lat, s.lon]} icon={ShipIcon(s.sog, s.cog, s.mmsi, s.shiptype || s.ship_type)}
                                        eventHandlers={{
                                            mouseover: () => setHoveredMmsi(String(s.mmsi)),
                                            mouseout: () => setHoveredMmsi(null)
                                        }}
                                    >
                                        {/* Tooltip on Hover */}
                                        <Tooltip direction="top" offset={[0, -10]} opacity={0.95} className={s.is_meteo ? "custom-meteo-tooltip" : ""}>
                                            {s.is_meteo ? (
                                                <div style={{
                                                    display: 'flex', flexDirection: 'column',
                                                    borderRadius: '6px', overflow: 'hidden',
                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                                                    width: '300px',
                                                    fontFamily: 'sans-serif'
                                                }}>
                                                    {/* Header */}
                                                    <div style={{ background: 'rgba(130, 140, 150, 0.9)', padding: '6px 12px', color: '#fff', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                                        From: MMSI {mmsiStr} {s.shiptype ? `(${s.shiptype})` : '(1)'}
                                                    </div>
                                                    {/* Body */}
                                                    <div style={{ background: '#22282d', padding: '12px', color: '#fff' }}>
                                                        <div style={{ textAlign: 'center', fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '8px' }}>
                                                            {new Date(s.timestamp).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} - {s.name || 'Meteo & Hydro'}
                                                        </div>
                                                        <div style={{ height: '1px', background: 'rgba(255,255,255,0.15)', margin: '8px 0' }}></div>
                                                        <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', fontSize: '0.9rem' }}>
                                                            <span>Vind: <strong>{s.wind_speed !== undefined ? `${s.wind_speed} m/s` : '--'}</strong></span>
                                                            <span>Byar: <strong>{s.wind_gust !== undefined ? `${s.wind_gust} m/s` : '--'}</strong></span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                                    <strong style={{ fontSize: '1rem' }}>{s.name || s.mmsi}</strong>
                                                    {s.status_text && (
                                                        <span style={{ fontSize: '0.8rem', fontStyle: 'italic', color: '#666' }}>
                                                            {s.status_text}
                                                        </span>
                                                    )}
                                                    {s.imageUrl && (
                                                        <img src={s.imageUrl} alt={s.name} style={{ width: '120px', height: '80px', objectFit: 'cover', borderRadius: '4px' }} />
                                                    )}
                                                </div>
                                            )}
                                        </Tooltip>

                                        {/* Detailed Popup on Click - NOT for meteo markers */}
                                        {!s.is_meteo && <Popup className="custom-detailed-popup">
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                {/* SHIP NAME HEADER */}
                                                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-card)' }}>
                                                    <span style={{ fontSize: '1.2rem' }} dangerouslySetInnerHTML={{ __html: getFlagEmoji(mmsiStr, s.country_code) }} />
                                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                                        <div style={{ fontWeight: '700', fontSize: '1.1rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span>{s.name || 'Unknown Vessel'}</span>
                                                            {s.callsign && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>{s.callsign}</span>}
                                                        </div>
                                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                            MMSI: {mmsiStr}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Image */}
                                                {s.imageUrl ? (
                                                    <div style={{ position: 'relative', width: '100%', height: '180px', backgroundImage: `url(${s.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', borderTop: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}` }}>
                                                        <div style={{ position: 'absolute', bottom: '5px', left: '10px', color: '#fff', fontSize: '0.9rem', fontWeight: 'bold', textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                                                            NavisCore
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ width: '100%', height: '100px', background: colors.bgMain, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.textMuted, borderTop: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}` }}>
                                                        No image available
                                                    </div>
                                                )}
                                                {/* Data Row */}
                                                <div style={{ padding: '12px 15px 15px 15px' }}>

                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', border: `1px solid ${colors.border}`, borderRadius: '4px' }}>
                                                        <div style={{ padding: '8px', borderRight: `1px solid ${colors.border}` }}>
                                                            <div style={{ fontSize: '0.8rem', color: colors.textMuted }}>Nav. status:</div>
                                                            <strong style={{ color: colors.textMain, fontSize: '0.9rem' }}>Active</strong>
                                                        </div>
                                                        {(s.sog === undefined || s.sog === null || s.is_meteo) ? (
                                                            <div style={{ padding: '8px' }}>
                                                                <div style={{ fontSize: '0.8rem', color: colors.textMuted }}>Object type:</div>
                                                                <strong style={{ color: colors.textMain, fontSize: '0.9rem' }}>Stationary</strong>
                                                            </div>
                                                        ) : (
                                                            <div style={{ padding: '8px' }}>
                                                                <div style={{ fontSize: '0.8rem', color: colors.textMuted }}>SOG / COG:</div>
                                                                <strong style={{ color: colors.textMain, fontSize: '0.9rem' }}>{s.sog?.toFixed(1) ?? '--'}kn / {s.cog?.toFixed(0) ?? '--'}°</strong>
                                                            </div>
                                                        )}
                                                        <div style={{ padding: '8px', borderRight: `1px solid ${colors.border}`, borderTop: `1px solid ${colors.border}` }}>
                                                            <div style={{ fontSize: '0.8rem', color: colors.textMuted }}>Latitude:</div>
                                                            <strong style={{ color: colors.textMain, fontSize: '0.9rem' }}>{s.lat?.toFixed(5)}</strong>
                                                        </div>
                                                        <div style={{ padding: '8px', borderTop: `1px solid ${colors.border}` }}>
                                                            <div style={{ fontSize: '0.8rem', color: colors.textMuted }}>Longitude:</div>
                                                            <strong style={{ color: colors.textMain, fontSize: '0.9rem' }}>{s.lon?.toFixed(5)}</strong>
                                                        </div>
                                                    </div>

                                                    <div style={{ fontSize: '0.85rem', color: colors.textMuted, marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                            <span>Last seen:</span> <strong style={{ color: colors.textMain }}>{new Date(s.timestamp).toLocaleTimeString()}</strong>
                                                        </div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                            <span>Type:</span> <strong style={{ color: colors.textMain }}>{s.ship_type_text || getShipTypeName(mmsiStr, s.shiptype, s.ship_type_text) || 'Unknown'}</strong>
                                                        </div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                            <span>Status:</span> <strong style={{ color: colors.textMain }}>{s.status_text || 'Unknown'}</strong>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </Popup>}
                                    </Marker>
                                )
                            })}

                            {/* COG Course Line on Hover */}
                            {hoveredMmsi && (() => {
                                const hs = ships.find((s: any) => String(s.mmsi) === hoveredMmsi);
                                if (hs && hs.lat && hs.lon && hs.cog != null && hs.sog > 0.1) {
                                    const cogRad = (hs.cog * Math.PI) / 180;
                                    const lineLen = Math.max(0.02, hs.sog * 0.005); // scale line length by speed
                                    const endLat = hs.lat + lineLen * Math.cos(cogRad);
                                    const endLon = hs.lon + lineLen * Math.sin(cogRad) / Math.cos(hs.lat * Math.PI / 180);
                                    return <Polyline positions={[[hs.lat, hs.lon], [endLat, endLon]]} pathOptions={{ color: '#ff4444', weight: 2.5, dashArray: '8 6', opacity: 0.85 }} />;
                                }
                                return null;
                            })()}

                        </MapContainer>
                    )}
                </div>

                {/* Expandable Right Sidebar */}
                {isSidebarOpen && (
                    <div style={{
                        width: '380px',
                        minWidth: '380px',
                        maxWidth: '380px',
                        background: colors.bgSidebar,
                        borderLeft: `1px solid ${colors.border}`,
                        display: 'flex',
                        flexDirection: 'column',
                        zIndex: 1000,
                        boxShadow: isDark ? '-5px 0 20px rgba(0,0,0,0.5)' : '-5px 0 20px rgba(0,0,0,0.05)',
                        transition: 'width 0.3s ease',
                        overflow: 'hidden'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: `1px solid ${colors.border}` }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', color: colors.textMain }}>
                                {sidebarTab === 'ships' ? `Lokala Fartyg (${ships.length})` : 'Inställningar'}
                            </h2>
                            <button onClick={() => setIsSidebarOpen(false)} style={{ background: 'transparent', border: 'none', color: colors.textMuted, cursor: 'pointer' }}>
                                <X size={24} />
                            </button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', boxSizing: 'border-box' }}>
                            {sidebarTab === 'ships' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {ships.length === 0 ? (
                                        <div style={{ color: colors.textMuted, textAlign: 'center', padding: '20px', background: colors.bgCard, borderRadius: '8px', border: `1px solid ${colors.border}` }}>
                                            Inget fartyg på radarn ännu...
                                        </div>
                                    ) : ships.map((ship: any, idx: number) => (
                                        <div key={ship.mmsi} className={showFlash && flashedMmsis.has(ship.mmsi) ? 'ship-flash' : ''} style={{
                                            padding: '12px 15px',
                                            background: idx % 2 === 0 ? colors.bgCard : colors.bgSidebar,
                                            borderRadius: '6px',
                                            borderLeft: `4px solid ${getShipColor(ship.mmsi, ship.shiptype || ship.ship_type)}`,
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            cursor: 'pointer',
                                            transition: 'transform 0.1s',
                                            boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.05)'
                                        }}
                                            onClick={() => setHoveredMmsi(hoveredMmsi === ship.mmsi ? null : ship.mmsi)}
                                            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                                            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                                        >
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.90rem', marginBottom: '2px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span dangerouslySetInnerHTML={{ __html: getFlagEmoji(ship.mmsi, ship.country_code) }} />
                                                    <span style={{
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        maxWidth: '180px'
                                                    }}>
                                                        {ship.name || ship.mmsi}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.80rem', color: 'var(--text-muted)' }}>
                                                    {getShipTypeName(ship.mmsi, ship.shiptype, ship.ship_type_text)} • {ship.sog && ship.sog > 0.1 ? `${ship.sog.toFixed(1)} knop` : 'Ankrad/Förtöjd'}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right', fontSize: '0.85rem', color: colors.textMain }}>
                                                <div style={{ fontWeight: 600 }}>{ship.sog?.toFixed(1) ?? '--'} kn</div>
                                                <div style={{ color: colors.textMuted }}>{ship.cog?.toFixed(0) ?? '--'}°</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <>
                                    <div style={{ background: colors.bgCard, padding: '15px', borderRadius: '10px', border: `1px solid ${colors.border}` }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <strong style={{ color: colors.textMain }}>Tema</strong>
                                            <button
                                                onClick={toggleTheme}
                                                style={{
                                                    background: colors.bgSidebar, border: `1px solid ${colors.border}`, padding: '8px 12px', borderRadius: '8px',
                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: colors.textMain
                                                }}
                                            >
                                                {isDark ? <Moon size={18} /> : <Sun size={18} />}
                                                {isDark ? 'Mörkt Läge' : 'Ljust Läge'}
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ background: colors.bgCard, padding: '15px', borderRadius: '10px', border: `1px solid ${colors.border}` }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <strong style={{ color: colors.textMain }}>Flash vid uppdatering</strong>
                                            <button
                                                onClick={() => {
                                                    const next = !showFlash;
                                                    setShowFlash(next);
                                                    localStorage.setItem('naviscore_flash', String(next));
                                                }}
                                                style={{
                                                    background: showFlash ? '#0066cc' : colors.bgSidebar,
                                                    border: `1px solid ${showFlash ? '#0066cc' : colors.border}`,
                                                    padding: '8px 16px', borderRadius: '8px',
                                                    cursor: 'pointer', color: showFlash ? 'white' : colors.textMain,
                                                    fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.2s'
                                                }}
                                            >
                                                {showFlash ? 'PÅ' : 'AV'}
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ background: colors.bgCard, padding: '15px', borderRadius: '10px', border: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                        <h3 style={{ margin: 0, color: colors.textMain, fontSize: '1.1rem', borderBottom: `1px solid ${colors.border}`, paddingBottom: '8px' }}>Kartinställningar & Station</h3>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                <label style={{ color: colors.textMuted, fontSize: '0.9rem' }}>Origin Latitud</label>
                                                <input
                                                    type="number" step="0.0001"
                                                    placeholder="t.ex. 59.329"
                                                    value={mqttSettings.origin_lat}
                                                    onChange={(e) => setMqttSettings({ ...mqttSettings, origin_lat: e.target.value })}
                                                    style={{
                                                        background: colors.bgSidebar, border: `1px solid ${colors.border}`, color: colors.textMain,
                                                        padding: '10px', borderRadius: '6px', outline: 'none', width: '100%', boxSizing: 'border-box'
                                                    }}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                <label style={{ color: colors.textMuted, fontSize: '0.9rem' }}>Origin Longitud</label>
                                                <input
                                                    type="number" step="0.0001"
                                                    placeholder="t.ex. 18.068"
                                                    value={mqttSettings.origin_lon}
                                                    onChange={(e) => setMqttSettings({ ...mqttSettings, origin_lon: e.target.value })}
                                                    style={{
                                                        background: colors.bgSidebar, border: `1px solid ${colors.border}`, color: colors.textMain,
                                                        padding: '10px', borderRadius: '6px', outline: 'none', width: '100%', boxSizing: 'border-box'
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: colors.textMain, cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={mqttSettings.show_range_rings === 'true'}
                                                onChange={(e: any) => setMqttSettings({ ...mqttSettings, show_range_rings: e.target.checked ? 'true' : 'false' })}
                                                style={{ accentColor: isDark ? colors.accent : colors.accentDark, width: '18px', height: '18px' }}
                                            />
                                            Visa avståndscirklar (Range Rings)
                                        </label>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${colors.border}` }}>
                                            <label style={{ color: colors.textMain, fontWeight: 'bold' }}>Sektortäckning (Range Polygon)</label>
                                            <div style={{ display: 'flex', gap: '15px' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: colors.textMain, cursor: 'pointer' }}>
                                                    <input
                                                        type="radio" name="rangeType" value="24h"
                                                        checked={mqttSettings.range_type === '24h'}
                                                        onChange={() => setMqttSettings({ ...mqttSettings, range_type: '24h' })}
                                                        style={{ accentColor: isDark ? colors.accent : colors.accentDark }}
                                                    />
                                                    Sista 24 Timmarna
                                                </label>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: colors.textMain, cursor: 'pointer' }}>
                                                    <input
                                                        type="radio" name="rangeType" value="alltime"
                                                        checked={mqttSettings.range_type === 'alltime'}
                                                        onChange={() => setMqttSettings({ ...mqttSettings, range_type: 'alltime' })}
                                                        style={{ accentColor: isDark ? colors.accent : colors.accentDark }}
                                                    />
                                                    All Time Max
                                                </label>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${colors.border}` }}>
                                            <label style={{ color: colors.textMain, fontWeight: 'bold' }}>Göm inaktiva fartyg efter (minuter)</label>
                                            <input
                                                type="number" min="1" max="1440"
                                                value={mqttSettings.ship_timeout}
                                                onChange={(e) => setMqttSettings({ ...mqttSettings, ship_timeout: e.target.value })}
                                                style={{
                                                    background: colors.bgSidebar, border: `1px solid ${colors.border}`, color: colors.textMain,
                                                    padding: '10px', borderRadius: '6px', outline: 'none', width: '100%', boxSizing: 'border-box'
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <div style={{ background: colors.bgCard, padding: '15px', borderRadius: '10px', border: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', gap: '15px', overflow: 'hidden' }}>
                                        <h3 style={{ margin: 0, color: colors.textMain, fontSize: '1.1rem', borderBottom: `1px solid ${colors.border}`, paddingBottom: '8px' }}>MQTT Server</h3>

                                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: colors.textMain, cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={mqttSettings.mqtt_enabled === 'true'}
                                                onChange={(e) => setMqttSettings({ ...mqttSettings, mqtt_enabled: e.target.checked ? 'true' : 'false' })}
                                                style={{ accentColor: isDark ? colors.accent : colors.accentDark, width: '18px', height: '18px' }}
                                            />
                                            Aktivera MQTT-mottagning
                                        </label>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                            <label style={{ color: colors.textMuted, fontSize: '0.9rem' }}>Broker URL & Topic</label>
                                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                                                <input
                                                    type="text" placeholder="mqtt://din-broker:1883"
                                                    value={mqttSettings.mqtt_url}
                                                    onChange={(e) => setMqttSettings({ ...mqttSettings, mqtt_url: e.target.value })}
                                                    style={{ background: colors.bgSidebar, border: `1px solid ${colors.border}`, color: colors.textMain, padding: '10px', borderRadius: '6px', outline: 'none', width: '100%', boxSizing: 'border-box', minWidth: 0 }}
                                                />
                                                <input
                                                    type="text" placeholder="ais/messages"
                                                    value={mqttSettings.mqtt_topic}
                                                    onChange={(e) => setMqttSettings({ ...mqttSettings, mqtt_topic: e.target.value })}
                                                    style={{ background: colors.bgSidebar, border: `1px solid ${colors.border}`, color: colors.textMain, padding: '10px', borderRadius: '6px', outline: 'none', width: '100%', boxSizing: 'border-box', minWidth: 0 }}
                                                />
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                <label style={{ color: colors.textMuted, fontSize: '0.9rem' }}>Användarnamn</label>
                                                <input
                                                    type="text" placeholder="Frivilligt"
                                                    value={mqttSettings.mqtt_user}
                                                    onChange={(e) => setMqttSettings({ ...mqttSettings, mqtt_user: e.target.value })}
                                                    style={{ background: colors.bgSidebar, border: `1px solid ${colors.border}`, color: colors.textMain, padding: '10px', borderRadius: '6px', outline: 'none', width: '100%', boxSizing: 'border-box', minWidth: 0 }}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                <label style={{ color: colors.textMuted, fontSize: '0.9rem' }}>Lösenord</label>
                                                <input
                                                    type="password" placeholder="Frivilligt"
                                                    value={mqttSettings.mqtt_pass}
                                                    onChange={(e) => setMqttSettings({ ...mqttSettings, mqtt_pass: e.target.value })}
                                                    style={{ background: colors.bgSidebar, border: `1px solid ${colors.border}`, color: colors.textMain, padding: '10px', borderRadius: '6px', outline: 'none', width: '100%', boxSizing: 'border-box', minWidth: 0 }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        onClick={saveSettings}
                                        style={{
                                            background: isDark ? colors.accent : colors.accentDark,
                                            color: isDark ? '#000' : '#fff',
                                            border: 'none', padding: '12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '1rem',
                                            cursor: 'pointer', marginTop: '10px', transition: 'filter 0.2s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.1)'}
                                        onMouseLeave={e => e.currentTarget.style.filter = 'brightness(1)'}
                                    >
                                        Spara Alla Inställningar
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
