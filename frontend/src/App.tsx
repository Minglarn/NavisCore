import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Tooltip, LayersControl, useMap, Circle, Polygon, Polyline, useMapEvents, ZoomControl, Rectangle } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import L from 'leaflet'
import { Settings, X, Moon, Sun, Anchor, List, Navigation, Search, Ship, Signal, Info, Crosshair, Radio, BarChart2, Globe, Plus, Calendar, ChevronLeft, ChevronRight, Activity, Radar, Terminal, ChevronDown, ChevronUp, ArrowDownLeft, ArrowUpRight, LayoutGrid, Rows, Database, Wifi, User, TrendingUp, AlertTriangle, Check, Edit, Save, Trash2, Bell, Download, Upload, RefreshCw } from 'lucide-react';
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

// Module imports
import { AIS_MSG_TYPE_NAMES, getAisMsgTypeName, getShipColor, getShipTypeName, getShipFilterCategory, aisShipTypes } from './utils/ais';
import { getCountryName, getFlagEmoji } from './utils/countries';
import { haversineDistance, calculateBearing, formatSpeed, formatDistance, getTimeAgo, calculateDestinationPoint } from './utils/geo';
import { LiveTimeAgo } from './components/ui/LiveTimeAgo';
import { Accordion, AccordionRow } from './components/ui/Accordion';
import Toggle from './components/ui/Toggle';
import { MultiSelect } from './components/ui/MultiSelect';
import { ShipIcon, extraStyles } from './components/map/ShipIcon';
import CenterButton from './components/map/CenterButton';
import ContextMenu from './components/map/ContextMenu';
import StatisticsModal from './components/modals/StatisticsModal';
import SettingsModal from './components/modals/SettingsModal';
import NmeaConsoleModal from './components/modals/NmeaConsoleModal';
import VesselDetailSidebar from './components/vessel/VesselDetailSidebar';
import VesselDatabaseModal from './components/vessel/VesselDatabaseModal';
import VesselEditModal from './components/vessel/VesselEditModal';
import VesselDetailModal from './components/vessel/VesselDetailModal';
import VesselMobilePanel from './components/vessel/VesselMobilePanel';

import './index.css'

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

// Fix default icons for Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

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
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Set default closed for Sidebar but mobile logic still applies
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
    const [safetyAlerts, setSafetyAlerts] = useState<any[]>([]);
    const [safetyAlertMarkers, setSafetyAlertMarkers] = useState<any[]>([]);
    const [safetyPanelOpen, setSafetyPanelOpen] = useState(false);
    const [safetyToast, setSafetyToast] = useState<any>(null);
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
    const [eventLog, setEventLog] = useState<any[]>([]);
    const [consoleExpanded, setConsoleExpanded] = useState(false);

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
    const [isRestarting, setIsRestarting] = useState(false);
    const reconnectTimerRef = useRef<any | null>(null);
    const isConnectingRef = useRef(false);

    useEffect(() => {
        localStorage.setItem('naviscore_sort_config', JSON.stringify(sortConfig));
    }, [sortConfig]);

    // Backend Restart Ping Logic
    useEffect(() => {
        let interval: any;
        if (isRestarting) {
            const isDev = window.location.port === '5173';
            const pingUrl = isDev ? 'http://127.0.0.1:8080/api/settings' : '/api/settings';
            
            interval = setInterval(async () => {
                try {
                    const res = await fetch(pingUrl);
                    if (res.ok) {
                        console.log("Backend reachable again. Reconnecting WebSocket...");
                        setIsRestarting(false);
                        // Instead of reload, we now just trigger a reconnect
                        if (connectWebSocketRef.current) {
                            connectWebSocketRef.current();
                        }
                    }
                } catch (e) {
                    // Still down
                }
            }, 2000);
        }
        return () => clearInterval(interval);
    }, [isRestarting]);

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
        const filtered = ships.filter(s => {
            const nameUpper = (s.name || "").toUpperCase();
            const mmsiStr = String(s.mmsi || "");
            const showAisStream = String(mqttSettings.show_aisstream_on_map) !== 'false';
            
            if (!showAisStream && (s.source === 'aisstream')) return false;

            if (searchTerm) {
                const term = searchTerm.toUpperCase();
                if (!nameUpper.includes(term) && !mmsiStr.includes(term)) return false;
            }

            if (!filterSource.includes('all')) {
                const source = s.source || 'sdr';
                const isMatched = (filterSource.includes('sdr') && (source === 'sdr' || source === 'local')) ||
                                  (filterSource.includes('stream') && source === 'aisstream');
                if (!isMatched) return false;
            }

            if (!filterShipType.includes('all')) {
                const category = getShipFilterCategory(s);
                if (!filterShipType.includes(category)) return false;
            }

            return true;
        });

        // Add distance and sort here for performance and live-update consistency
        return filtered
            .map(s => {
                const dist = (s.lat && s.lon && mqttSettings.origin_lat && mqttSettings.origin_lon)
                    ? haversineDistance(s.lat, s.lon, parseFloat(mqttSettings.origin_lat), parseFloat(mqttSettings.origin_lon))
                    : Infinity;
                return { ...s, distance: dist };
            })
            .sort((a, b) => {
                let valA = a[sortConfig.key];
                let valB = b[sortConfig.key];

                if (sortConfig.key === 'last_seen') {
                    valA = a.timestamp || 0;
                    valB = b.timestamp || 0;
                } else if (sortConfig.key === 'name') {
                    valA = (a.name || a.mmsi || '').toString().toLowerCase();
                    valB = (b.name || b.mmsi || '').toString().toLowerCase();
                } else if (typeof valA === 'string') {
                    valA = valA.toLowerCase();
                    if (typeof valB === 'string') valB = valB.toLowerCase();
                }

                if (valA === undefined || valA === null) valA = sortConfig.direction === 'asc' ? Infinity : -Infinity;
                if (valB === undefined || valB === null) valB = sortConfig.direction === 'asc' ? Infinity : -Infinity;

                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
    }, [ships, mqttSettings.show_aisstream_on_map, mqttSettings.origin_lat, mqttSettings.origin_lon, searchTerm, filterSource, filterShipType, sortConfig]);

    const sidebarShipsCount = useMemo(() => sidebarShips.length, [sidebarShips]);
    
    const vesselCount = useMemo(() => {
        return mapShips.filter(s => {
            const cat = getShipFilterCategory(s);
            // Non-vessels are AtoNs, Base Stations, and Meteo
            return cat !== 'aton' && cat !== 'base_station' && cat !== 'meteo';
        }).length;
    }, [mapShips]);

    const [isHudExpanded, setIsHudExpanded] = useState(() => {
        if (window.innerWidth <= 768) return false;
        return localStorage.getItem('naviscore_hud_expanded') !== 'false';
    });
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

    // Safety Alert Marker Expiration (1 hour)
    useEffect(() => {
        const interval = setInterval(() => {
            const oneHourAgo = Date.now() - 3600000;
            setSafetyAlertMarkers(prev => prev.filter(m => m.timestamp > oneHourAgo));
        }, 60000);
        return () => clearInterval(interval);
    }, []);

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

    const isUnmountingRef = useRef(false);
    const connectWebSocketRef = useRef<(() => void) | null>(null);
    const wsRef = useRef<WebSocket | null>(null);

    const connectWebSocket = useCallback(() => {
        if (isUnmountingRef.current || isConnectingRef.current) return;
        
        isConnectingRef.current = true;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const isDev = window.location.port === '5173';
        const wsUrl = isDev ? 'ws://127.0.0.1:8080/ws' : `${protocol}//${window.location.host}/ws`;

        console.log("Connecting to WebSocket:", wsUrl);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("WebSocket connected.");
            setStatus('Connected to NavisCore');
            isConnectingRef.current = false;
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
            setIsRestarting(false);
        };

        ws.onmessage = (event: MessageEvent) => {
            const data = JSON.parse(event.data);
            const nowTime = Date.now();
            
            if (data.source === 'sdr' || data.source === 'local') setLastSdrTime(nowTime);
            else if (data.source === 'udp') setLastUdpTime(nowTime);
            else if (data.source === 'aisstream') setLastStreamTime(nowTime);

            if (data.mmsi && (data.name || data.mmsi)) {
                const entry = {
                    name: data.name || `MMSI ${data.mmsi}`,
                    mmsi: data.mmsi,
                    time: nowTime,
                    msgType: data.msg_type
                };
                setLastUpdatedShip(entry);
                setEventLog(prev => [entry, ...prev].slice(0, 50));
            }
        
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
            } else if (data.type === 'safety_alert') {
                setSafetyAlerts(prev => [{ ...data, timestamp_ms: data.timestamp, dismissed: 0 }, ...prev]);
                setSafetyToast(data);
                
                // Add to map if position exists - Stabilize ID by using MMSI
                if (data.lat && data.lon) {
                    const markerId = `alert-${data.mmsi}`;
                    setSafetyAlertMarkers(prev => {
                        // Replace existing marker for this vessel if it exists
                        const others = prev.filter(m => m.id !== markerId);
                        return [...others, {
                            id: markerId,
                            lat: data.lat,
                            lon: data.lon,
                            text: data.text,
                            mmsi: data.mmsi,
                            name: data.name,
                            level: data.alarm_level || 0,
                            timestamp: Date.now(),
                            dismissed: 0
                        }];
                    });
                }

                // Play sound for Critical (Level 3)
                if (data.alarm_level === 3) {
                    try {
                        const audio = new Audio('https://actions.google.com/sounds/v1/alarms/emergency_siren_short.ogg');
                        audio.play().catch(e => console.log("Audio play blocked", e));
                    } catch(e) {}
                }

                setTimeout(() => setSafetyToast(null), 8000);
            } else if (data.type === 'safety_ack') {
                // Handle ACK: maybe flash the UI or mark the alert as acknowledged
                console.log("Received Safety ACK:", data);
                setEventLog(prev => [{
                    name: `ACK: ${data.mmsi} confirm ${data.ack_mmsi}`,
                    mmsi: data.mmsi,
                    time: Date.now(),
                    msgType: 13
                }, ...prev].slice(0, 50));
            } else if (data.type === 'coverage_update') {
                setCoverageSectors(prev => {
                    const idx = prev.findIndex((s: any) => s.sector_id === data.sector_id);
                    const newSector = {
                        sector_id: data.sector_id,
                        range_km_24h: data.range_km_24h,
                        range_km_alltime: data.range_km_alltime
                    };
                    if (idx !== -1) {
                        const next = [...prev];
                        next[idx] = newSector;
                        return next;
                    }
                    return [...prev, newSector].sort((a: any, b: any) => a.sector_id - b.sector_id);
                });
            } else {
                setShips((prev: any[]) => {
                    const existing = prev.find((s: any) => s.mmsi === data.mmsi);
                    const historyMax = 100;
                    if (existing) {
                        let newHistory = existing.history || [];
                        if (data.lat && data.lon) {
                            const last = newHistory[newHistory.length - 1];
                            if (!last || haversineDistance(last[0], last[1], data.lat, data.lon) > 0.05) {
                                newHistory = [...newHistory, [data.lat, data.lon]].slice(-historyMax);
                            }
                        }
                        return prev.map((s: any) => s.mmsi === data.mmsi ? { ...s, ...data, history: newHistory } : s);
                    }
                    const history = (data.lat && data.lon) ? [[data.lat, data.lon]] : [];
                    return [...prev, { ...data, history }];
                });
                
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

                if (data.nmea && data.mmsi) {
                    setNmeaLogs(prev => prev.map(log => {
                        const rawMatches = Array.isArray(data.nmea) 
                            ? data.nmea.includes(log.raw)
                            : log.raw === data.nmea;
                        if (rawMatches) return { ...log, decoded: data };
                        return log;
                    }));
                }
            }
        };

        ws.onclose = () => {
            isConnectingRef.current = false;
            setStatus('Disconnected');
            if (!isUnmountingRef.current) {
                console.log("WebSocket closed. Starting quiet reconnect...");
                // Start a timer before showing "Restarting" UI (5 seconds grace period)
                if (!reconnectTimerRef.current) {
                    reconnectTimerRef.current = setTimeout(() => {
                        console.log("Still disconnected after 5s. Triggering full reconnect UI.");
                        setIsRestarting(true);
                    }, 5000);
                }
                // Try to reconnect immediately in background
                setTimeout(() => connectWebSocket(), 3000);
            }
        };

        ws.onerror = (err) => {
            isConnectingRef.current = false;
            console.error("WebSocket Error:", err);
            setStatus('WebSocket Error');
        };
    }, []);

    useEffect(() => {
        connectWebSocketRef.current = connectWebSocket;
    }, [connectWebSocket]);

    useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = extraStyles;
        document.head.appendChild(style);

        const isDev = window.location.port === '5173';
        
        // Initial data fetches
        const shipsPath = isDev ? 'http://127.0.0.1:8080/api/ships' : '/api/ships';
        fetch(shipsPath)
            .then(r => r.json())
            .then((data: any[]) => {
                if (Array.isArray(data) && data.length > 0) {
                    setShips(data.filter((s: any) => s.lat && s.lon));
                }
            })
            .catch(console.error);

        const alertsPath = isDev ? 'http://127.0.0.1:8080/api/safety-alerts' : '/api/safety-alerts';
        fetch(alertsPath)
            .then(r => r.json())
            .then((data: any[]) => {
                if (Array.isArray(data)) setSafetyAlerts(data);
            })
            .catch(console.error);

        connectWebSocket();

        return () => {
            isUnmountingRef.current = true;
            if (wsRef.current) wsRef.current.close();
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            document.head.removeChild(style);
        };
    }, [connectWebSocket]);

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
    const occupiedLabelGrids = new Set<string>();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: colors.bgMain, color: colors.textMain, overflow: 'hidden' }}>
            {/* Header */}
            <header className="nav-header" style={{
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
                <div className="nav-header-left" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Anchor size={24} />
                        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 600, letterSpacing: '1px' }}>NavisCore</h1>
                    </div>

                    {/* Activity Indicators */}
                    <div className="nav-header-indicators" style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '0 15px', borderLeft: `1px solid ${colors.border}` }}>
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

                <div className="nav-header-right" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>

                    <div className="nav-header-vessels" style={{ display: 'flex', alignItems: 'center', gap: '15px', color: colors.textMain, fontSize: '0.9rem', fontWeight: 600, paddingLeft: '10px', borderLeft: `1px solid ${colors.border}` }}>
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
                            onClick={() => setSafetyPanelOpen(!safetyPanelOpen)}
                            style={{ background: safetyPanelOpen ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)') : 'transparent', border: 'none', color: safetyAlerts.filter(a => !a.dismissed).length > 0 ? '#f59e0b' : colors.textMain, cursor: 'pointer', padding: '8px', borderRadius: '8px', transition: 'background 0.2s', position: 'relative' }}
                            onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}
                            onMouseLeave={e => { if (!safetyPanelOpen) e.currentTarget.style.background = 'transparent' }}
                            title="Safety Alerts"
                        >
                            <Bell size={22} />
                            {safetyAlerts.filter(a => !a.dismissed).length > 0 && (
                                <span style={{
                                    position: 'absolute', top: '2px', right: '2px',
                                    background: '#ef4444', color: '#fff',
                                    fontSize: '0.6rem', fontWeight: 800,
                                    width: '16px', height: '16px', borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    lineHeight: 1
                                }}>
                                    {safetyAlerts.filter(a => !a.dismissed).length}
                                </span>
                            )}
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


                             {/* Standalone Safety Alert Icons (when no vessel is tracked on map) */}
                             {safetyAlerts.filter(a => !a.dismissed && a.lat && a.lon && !ships.some(s => s.mmsi === a.mmsi)).map((alert, i) => (
                                 <Marker 
                                     key={`standalone-alert-${alert.id || i}`} 
                                     position={[alert.lat, alert.lon]} 
                                     icon={L.divIcon({
                                         className: 'safety-alert-marker-standalone',
                                         html: `<div style="display:flex; justify-content:center; align-items:center; width: 44px; height: 44px; animation: warning-flash 1.2s infinite alternate; position: relative;">
                                                   <svg width="32" height="32" viewBox="0 0 24 24" fill="#ff0000" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 8px red);">
                                                       <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                                                       <line x1="12" y1="9" x2="12" y2="13" stroke="white"></line>
                                                       <line x1="12" y1="17" x2="12.01" y2="17" stroke="white"></line>
                                                   </svg>
                                                </div>`,
                                         iconSize: [44, 44],
                                         iconAnchor: [22, 22]
                                     })}
                                 >
                                     <Popup className="custom-detailed-popup">
                                         <div style={{ padding: '15px' }}>
                                             <div style={{ fontWeight: 900, color: '#ff0000', marginBottom: '8px', fontSize: '0.8rem', textTransform: 'uppercase' }}>Safety Alert</div>
                                             <div style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '5px' }}>{alert.name || `MMSI ${alert.mmsi}`}</div>
                                             <div style={{ fontSize: '0.9rem', background: 'rgba(0,0,0,0.05)', padding: '10px', borderRadius: '8px', borderLeft: '4px solid red' }}>
                                                 {alert.text}
                                             </div>
                                         </div>
                                     </Popup>
                                 </Marker>
                             ))}


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

                                 // Spatial Grid Decluttering:
                                 let shouldShowName = false;
                                 if (mqttSettings.show_names_on_map === 'true' && !s.is_meteo) {
                                     if (s.is_emergency) {
                                         shouldShowName = true;
                                     } else {
                                         const density = parseInt(mqttSettings.label_density || '3');
                                         if (density >= 5) {
                                             shouldShowName = true;
                                         } else {
                                             // Approx pixels per degree at this zoom
                                             const pixelsPerDegree = (256 * Math.pow(2, currentZoom)) / 360;
                                             // Grid size based on density level (1: 500px, 2: 300px, 3: 150px, 4: 70px)
                                             const gridSize = [0, 500, 300, 150, 70, 1][density];
                                             
                                             const gridX = Math.floor(s.lon * pixelsPerDegree / gridSize);
                                             const gridY = Math.floor(s.lat * pixelsPerDegree / gridSize);
                                             const gridKey = `${gridX}|${gridY}`;
                                             
                                             if (!occupiedLabelGrids.has(gridKey)) {
                                                 shouldShowName = true;
                                                 occupiedLabelGrids.add(gridKey);
                                             }
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
                                    isDark,
                                    s.status_text,
                                    safetyAlerts.some((a: any) => a.mmsi === mmsiStr && !a.dismissed && (Date.now() - (a.timestamp_ms || 0)) < 3600000),
                                    s.sart_mode || null,
                                    s.emergency_type || null
                                );

                                // SART/MOB/EPIRB: Ensure markers float above everything
                                const isSartMarker = s.emergency_type === 'AIS-SART' || s.emergency_type === 'MOB' || s.emergency_type === 'EPIRB' || mmsiStr.startsWith('970') || mmsiStr.startsWith('972') || mmsiStr.startsWith('974');

                                return (
                                    <Marker key={`vessel-${mmsiStr}`} position={[s.lat, s.lon]} icon={icon}
                                        riseOnHover={true}
                                        zIndexOffset={isSartMarker ? 10000 : 0}
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
                                                         <div style={{ padding: (s.is_aton || mmsiStr.startsWith('99')) ? '10px 15px' : '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                                                 <span style={{ fontSize: '1.1rem', lineHeight: 1 }} dangerouslySetInnerHTML={{ __html: getFlagEmoji(mmsiStr, s.country_code) }} />
                                                                 <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                                                     <strong style={{ 
                                                                         fontSize: (s.is_aton || mmsiStr.startsWith('99')) ? '1rem' : '0.9rem', 
                                                                         fontWeight: 800, 
                                                                         whiteSpace: 'nowrap',
                                                                         textOverflow: (s.is_aton || mmsiStr.startsWith('99')) ? 'initial' : 'ellipsis',
                                                                         overflow: (s.is_aton || mmsiStr.startsWith('99')) ? 'initial' : 'hidden',
                                                                         lineHeight: 1.1
                                                                     }}>
                                                                         {s.name || 'Unknown'} 
                                                                     </strong>
                                                                     {!(s.is_aton || mmsiStr.startsWith('99')) && s.length && s.width ? (
                                                                         <span style={{ fontSize: '0.65rem', color: colors.textMuted, fontWeight: 700, marginTop: '2px' }}>
                                                                             {s.length} × {s.width} m
                                                                         </span>
                                                                     ) : null}
                                                                 </div>
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
                                                                         <div style={{ fontSize: '0.75rem', fontWeight: 700, color: colors.accent }}>
                                                                            <LiveTimeAgo timestamp={s.timestamp} colors={colors} />
                                                                         </div>
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
                                                                         <div style={{ fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'normal', lineHeight: '1.2' }}>
                                                                            {s.virtual_aton ? 'Virtual AtoN' : (s.ship_type_text || (s.shiptype ? `Type ${s.shiptype}` : ((s.is_aton || mmsiStr.startsWith('99')) ? 'Fixed Aid' : 'Unknown')))}
                                                                        </div>
                                                                    </div>

                                                                    {/* Row 2: Dist, Brg, Channel (3 columns) */}
                                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridColumn: 'span 2', borderBottom: `1px solid ${colors.border}` }}>
                                                                        <div style={{ padding: '6px 12px', borderRight: `1px solid ${colors.border}` }}>
                                                                            <div style={{ fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', fontWeight: 'bold' }}>Dist</div>
                                                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#44aaff' }}>
                                                                                {formatDistance(haversineDistance(originLat, originLon, s.lat, s.lon), mqttSettings.units)}
                                                                            </div>
                                                                        </div>
                                                                        <div style={{ padding: '6px 12px', borderRight: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column' }}>
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
                                                                        <div style={{ padding: '6px 12px' }}>
                                                                            <div style={{ fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', fontWeight: 'bold' }}>Channel</div>
                                                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: (s.ais_channel?.includes('C') || s.ais_channel?.includes('D')) ? '#ffab40' : colors.textMain }}>
                                                                                {s.ais_channel || '--'}
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Row 3: Last Seen & MMSI (2 columns) */}
                                                                    <div style={{ padding: '6px 12px', borderRight: `1px solid ${colors.border}` }}>
                                                                        <div style={{ fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', fontWeight: 'bold' }}>Last Seen</div>
                                                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: colors.accent }}>
                                                                            <LiveTimeAgo timestamp={s.timestamp} colors={colors} />
                                                                        </div>
                                                                    </div>
                                                                    <div style={{ padding: '6px 12px' }}>
                                                                        <div style={{ fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', fontWeight: 'bold' }}>MMSI</div>
                                                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: colors.textMuted }}>{mmsiStr}</div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Weather Data for AtoNs if available */}
                                                        {(s.is_aton || mmsiStr.startsWith('99')) && (s.wind_speed !== undefined || s.air_temp !== undefined || s.air_pressure !== undefined) && (
                                                             <div style={{ 
                                                                 padding: '10px 0',
                                                                 background: isDark ? 'rgba(68, 170, 255, 0.08)' : 'rgba(0, 131, 143, 0.08)',
                                                                 borderTop: `1px solid ${colors.border}`,
                                                                 display: 'flex',
                                                                 justifyContent: 'space-around',
                                                                 alignItems: 'center'
                                                             }}>
                                                                 {s.wind_speed !== undefined && (
                                                                     <div style={{ textAlign: 'center', flex: 1, borderRight: (s.air_temp !== undefined || s.air_pressure !== undefined) ? `1px solid ${colors.border}` : 'none' }}>
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
                                                              <div style={{ padding: '6px 12px', borderTop: `1px solid ${colors.border}`, display: 'flex', gap: '20px' }}>
                                                                  <div>
                                                                      <div style={{ fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', fontWeight: 'bold' }}>MMSI</div>
                                                                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: colors.textMuted }}>{mmsiStr}</div>
                                                                  </div>
                                                                  <div>
                                                                      <div style={{ fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', fontWeight: 'bold' }}>Channel</div>
                                                                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: (s.ais_channel === 'C' || s.ais_channel === 'D') ? '#ffab40' : colors.textMain }}>
                                                                          {s.ais_channel || '--'}
                                                                      </div>
                                                                  </div>
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

                                        {/* Detailed Popup on Click - NOT for meteo markers (Disabled on mobile in favor of VesselMobilePanel) */}
                                        {(selectedShipMmsi === mmsiStr && !s.is_meteo && !isMobile) && <Popup className="custom-detailed-popup" offset={[0, -20]}>
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
                                                                {(() => {
                                                                    const vesselAlerts = safetyAlerts.filter((a: any) => a.mmsi === mmsiStr && !a.dismissed && (Date.now() - (a.timestamp_ms || 0)) < 3600000);
                                                                    if (vesselAlerts.length === 0) return null;
                                                                    const levelColors: Record<string, string> = { 'MAYDAY': '#ff0000', 'FIRE': '#ff0000', 'SINKING': '#ff0000', 'MAN OVERBOARD': '#ff0000', 'DANGER': '#ff6600', 'WRECK': '#ff6600', 'RESTRICTED': '#ff6600', 'WEATHER': '#f59e0b', 'STORM': '#f59e0b', 'ICE': '#f59e0b', 'GALE': '#f59e0b' };
                                                                    return vesselAlerts.map((alert: any, ai: number) => {
                                                                        const text = (alert.text || '').toUpperCase();
                                                                        let bgColor = '#6b7280';
                                                                        for (const [kw, color] of Object.entries(levelColors)) { if (text.includes(kw)) { bgColor = color; break; } }
                                                                        return (
                                                                            <div key={ai} style={{ gridColumn: 'span 2', background: bgColor, color: '#fff', padding: '6px 10px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px', animation: bgColor === '#ff0000' ? 'emergency-flash 1s infinite alternate' : undefined }}>
                                                                                <span style={{ fontSize: '1.1rem' }}>🔺</span>
                                                                                <div style={{ flex: 1 }}>
                                                                                    <div>SAFETY ALERT</div>
                                                                                    <div style={{ fontWeight: 400, fontSize: '0.7rem', opacity: 0.9 }}>{alert.text || 'Unknown alert'}</div>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    });
                                                                })()}
                                                                {s.virtual_aton && (
                                                                    <div style={{ gridColumn: 'span 2', background: '#ff00ff', color: '#fff', padding: '4px', borderRadius: '4px', textAlign: 'center', fontSize: '0.75rem' }}>
                                                                        VIRTUAL AIS STATION
                                                                    </div>
                                                                )}
                                                                <div>
                                                                <div style={{ fontSize: '0.7rem', color: colors.textMuted, textTransform: 'uppercase' }}>Type / Stat</div>
                                                                <div style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'normal', lineHeight: '1.2' }}>{s.ship_type_text || (s.shiptype ? `Type ${s.shiptype}` : 'N/A')}</div>
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

                            {/* Selection Highlight Circle */}
                            {(() => {
                                const selected = ships.find(s => String(s.mmsi) === selectedShipMmsi);
                                if (selected && selected.lat && selected.lon) {
                                    return (
                                        <Circle 
                                            center={[selected.lat, selected.lon]} 
                                            radius={200} 
                                            pathOptions={{ 
                                                color: '#44aaff', 
                                                fillColor: '#44aaff', 
                                                fillOpacity: 0.1, 
                                                weight: 2,
                                                className: 'ship-selection-pulse'
                                            }} 
                                        />
                                    );
                                }
                                return null;
                            })()}

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
                                top: isMobile ? '70px' : '12px',
                                left: isMobile ? '12px' : '50px',
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
                        {/* Resize Handle - Hidden on Mobile */}
                        {!isMobile && (
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
                        )}
                        <div style={{
                            width: isMobile ? '100%' : `${sidebarWidth}px`,
                            height: '100%',
                            position: isMobile ? 'fixed' : 'relative',
                            top: 0,
                            right: 0,
                            bottom: 0,
                            left: isMobile ? 0 : 'auto',
                            minWidth: isMobile ? '100%' : '250px',
                            maxWidth: isMobile ? '100%' : '800px',
                            background: colors.bgSidebar,
                            display: 'flex',
                            flexDirection: 'column',
                            zIndex: 2000,
                            boxShadow: isDark ? '-5px 0 20px rgba(0,0,0,0.5)' : '-5px 0 20px rgba(0,0,0,0.05)',
                            transition: isResizing ? 'none' : 'width 0.3s ease, transform 0.3s ease',
                            overflow: 'hidden',
                            animation: isMobile ? 'slideInRight 0.3s ease-out' : 'none'
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
                                <div className="seen-objects-filters" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
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
                                        .map((ship: any, idx: number) => {
                                            const isSelected = String(ship.mmsi) === selectedShipMmsi;
                                            return (
                                                <div key={ship.mmsi}
                                                    className={`${showFlash && flashedMmsis.has(String(ship.mmsi)) ? 'ship-flash' : ''} ${isSelected ? 'sidebar-selected-item' : ''}`}
                                                    style={{
                                                        padding: sidebarViewMode === 'compact' ? '6px 10px' : '10px',
                                                        background: isSelected ? 'rgba(68,170,255,0.1)' : (idx % 2 === 0 ? colors.bgCard : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)')),
                                                        borderRadius: sidebarViewMode === 'compact' ? '4px' : '8px',
                                                        borderLeft: sidebarViewMode === 'compact' ? `3px solid ${getShipColor(String(ship.mmsi), ship.shiptype || ship.ship_type, ship.is_meteo, ship.is_aton, ship.is_emergency)}` : `5px solid ${getShipColor(String(ship.mmsi), ship.shiptype || ship.ship_type, ship.is_meteo, ship.is_aton, ship.is_emergency)}`,
                                                        display: 'flex',
                                                        gap: sidebarViewMode === 'compact' ? '10px' : '15px',
                                                        alignItems: 'center',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s',
                                                        border: isSelected ? '1px solid #44aaff' : `1px solid ${colors.border}`,
                                                        marginBottom: sidebarViewMode === 'compact' ? '1px' : '4px',
                                                        position: 'relative'
                                                    }}
                                                    onClick={() => {
                                                        setHoveredMmsi(String(ship.mmsi));
                                                        setSelectedShipMmsi(String(ship.mmsi));
                                                        if (mapRef.current && ship.lat && ship.lon) {
                                                            mapRef.current.flyTo([ship.lat, ship.lon], 14, { animate: true, duration: 1 });
                                                        }
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
                                                        if (!isSelected) {
                                                            e.currentTarget.style.transform = 'translateX(-4px)';
                                                            e.currentTarget.style.borderTopColor = '#44aaff';
                                                            e.currentTarget.style.borderRightColor = '#44aaff';
                                                            e.currentTarget.style.borderBottomColor = '#44aaff';
                                                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                                                        }
                                                    }}
                                                    onMouseLeave={e => {
                                                        if (!isSelected) {
                                                            e.currentTarget.style.transform = 'translateX(0)';
                                                            e.currentTarget.style.borderTopColor = colors.border;
                                                            e.currentTarget.style.borderRightColor = colors.border;
                                                            e.currentTarget.style.borderBottomColor = colors.border;
                                                            e.currentTarget.style.boxShadow = 'none';
                                                        }
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
                                                                textOverflow: 'ellipsis',
                                                                flex: 1
                                                            }}>
                                                                {ship.name || ship.mmsi}
                                                                {sidebarViewMode === 'compact' && ship.name && (
                                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'normal', marginLeft: '6px' }}>
                                                                        ({ship.mmsi})
                                                                    </span>
                                                                )}
                                                            </span>
                                                            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: colors.accent, fontWeight: 700, whiteSpace: 'nowrap', paddingLeft: '10px' }}>
                                                                 <LiveTimeAgo timestamp={ship.timestamp} colors={colors} />
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
                                                            <span style={{ 
                                                                marginLeft: 'auto', 
                                                                background: (ship.source === 'aisstream') ? 'rgba(68,170,255,0.1)' : (ship.source === 'udp' ? 'rgba(234, 179, 8, 0.1)' : 'rgba(16, 185, 129, 0.1)'), 
                                                                color: (ship.source === 'aisstream') ? '#44aaff' : (ship.source === 'udp' ? '#eab308' : '#10b981'), 
                                                                padding: '1px 5px', 
                                                                borderRadius: '3px', 
                                                                fontSize: '0.6rem', 
                                                                fontWeight: 700, 
                                                                border: `1px solid ${(ship.source === 'aisstream') ? 'rgba(68,170,255,0.2)' : (ship.source === 'udp' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(16, 185, 129, 0.2)')}` 
                                                            }}>
                                                                {ship.source === 'aisstream' ? 'STR' : (ship.source === 'udp' ? 'UDP' : 'SDR')}
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
                                        );
                                    })}
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
                setIsRestarting={setIsRestarting}
                isMobile={isMobile}
            />

            {isMobile && selectedShipMmsi && (
                <VesselMobilePanel
                    ship={ships.find(s => String(s.mmsi) === selectedShipMmsi)}
                    onClose={() => setSelectedShipMmsi(null)}
                    colors={colors}
                    isDark={isDark}
                    getShipColor={getShipColor}
                    getCountryName={getCountryName}
                    getFlagEmoji={getFlagEmoji}
                    formatSpeed={formatSpeed}
                    formatDistance={formatDistance}
                    haversineDistance={haversineDistance}
                    originLat={originLat}
                    originLon={originLon}
                    mqttSettings={mqttSettings}
                />
            )}

            {isMobile && !isSidebarOpen && !selectedShipMmsi && (
                <button
                    onClick={() => setIsSidebarOpen(true)}
                    style={{
                        position: 'fixed',
                        bottom: '100px',
                        right: '25px',
                        zIndex: 1000,
                        width: '60px',
                        height: '60px',
                        borderRadius: '30px',
                        background: 'linear-gradient(135deg, #44aaff 0%, #0066cc 100%)',
                        border: 'none',
                        color: 'white',
                        boxShadow: '0 8px 25px rgba(0,102,204,0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'transform 0.2s active',
                    }}
                >
                    <Rows size={28} />
                </button>
            )}

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
                isMobile={isMobile}
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
                isMobile={isMobile}
            />

            <NmeaConsoleModal
                isOpen={isNmeaModalOpen}
                onClose={() => setIsNmeaModalOpen(false)}
                logs={nmeaLogs}
                colors={colors}
            />

            {/* Safety Alerts Panel */}
            {safetyPanelOpen && (
                <div style={{
                    position: 'fixed', top: 0, right: 0, bottom: 0,
                    width: '480px', maxWidth: '100vw',
                    background: isDark ? 'rgba(12, 12, 22, 0.98)' : 'rgba(250, 250, 252, 0.98)',
                    backdropFilter: 'blur(16px)',
                    borderLeft: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                    boxShadow: '-8px 0 30px rgba(0,0,0,0.3)',
                    zIndex: 20000,
                    display: 'flex', flexDirection: 'column',
                    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
                    animation: 'slideInRight 0.3s ease-out'
                }}>
                    {/* Panel Header */}
                    <div style={{
                        padding: '16px 20px',
                        borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <AlertTriangle size={20} color="#f59e0b" />
                            <span style={{ fontSize: '1rem', fontWeight: 700, color: colors.textMain }}>
                                Safety Alerts
                            </span>
                            <span style={{
                                fontSize: '0.7rem', fontWeight: 700,
                                background: safetyAlerts.filter(a => !a.dismissed).length > 0 ? '#ef4444' : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                                color: safetyAlerts.filter(a => !a.dismissed).length > 0 ? '#fff' : colors.textMuted,
                                padding: '2px 8px', borderRadius: '10px'
                            }}>
                                {safetyAlerts.filter(a => !a.dismissed).length}
                            </span>
                        </div>
                        <button
                            onClick={() => setSafetyPanelOpen(false)}
                            style={{ background: 'transparent', border: 'none', color: colors.textMuted, cursor: 'pointer', padding: '4px' }}
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Alert List */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                        {safetyAlerts.filter(a => !a.dismissed).length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 20px', color: colors.textMuted, opacity: 0.6 }}>
                                <Bell size={32} style={{ marginBottom: '12px', opacity: 0.4 }} />
                                <div style={{ fontSize: '0.85rem' }}>No active safety alerts</div>
                            </div>
                        ) : (
                            safetyAlerts.filter(a => !a.dismissed).map((alert, i) => (
                                <div key={alert.id || i} style={{
                                    margin: '4px 12px',
                                    padding: '12px 16px',
                                    background: isDark ? 'rgba(245, 158, 11, 0.06)' : 'rgba(245, 158, 11, 0.05)',
                                    border: `1px solid ${isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.15)'}`,
                                    borderRadius: '10px',
                                    borderLeft: '3px solid #f59e0b'
                                }}>
                                    {/* Alert header row */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{
                                                fontSize: '0.65rem', fontWeight: 800,
                                                background: alert.is_broadcast ? '#ef4444' : '#f59e0b',
                                                color: '#fff', padding: '2px 7px', borderRadius: '4px',
                                                textTransform: 'uppercase'
                                            }}>
                                                {alert.is_broadcast ? 'Broadcast' : 'Addressed'}
                                            </span>
                                            <span style={{
                                                fontSize: '0.68rem', fontWeight: 700,
                                                color: isDark ? '#44aaff' : '#007080',
                                                background: isDark ? 'rgba(68,170,255,0.1)' : 'rgba(0,112,128,0.08)',
                                                padding: '2px 7px', borderRadius: '4px'
                                            }}>
                                                Type {alert.msg_type} • {getAisMsgTypeName(alert.msg_type)}
                                            </span>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                const isDev = window.location.port === '5173';
                                                const base = isDev ? 'http://127.0.0.1:8080' : '';
                                                if (alert.id) {
                                                    await fetch(`${base}/api/safety-alerts/${alert.id}/dismiss`, { method: 'POST' });
                                                }
                                                setSafetyAlerts(prev => prev.map(a => a === alert ? { ...a, dismissed: 1 } : a));
                                                // Also update marker if it exists on map
                                                if (alert.id) {
                                                    setSafetyAlertMarkers(prev => prev.map(m => m.id === alert.id ? { ...m, dismissed: 1 } : m));
                                                }
                                            }}
                                            style={{
                                                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                                border: 'none', color: colors.textMuted, cursor: 'pointer',
                                                padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600
                                            }}
                                            title="Dismiss alert"
                                        >
                                            Dismiss
                                        </button>
                                    </div>

                                    {/* MMSI info */}
                                    <div style={{ fontSize: '0.78rem', color: colors.textMuted, marginBottom: '6px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        <span><strong>From:</strong> <span style={{ color: colors.textMain, fontWeight: 700 }}>{alert.name || alert.mmsi}</span></span>
                                        {alert.name && <span style={{ opacity: 0.6, fontSize: '0.7rem' }}>({alert.mmsi})</span>}
                                        {alert.dest_mmsi && <span><strong>• To:</strong> {alert.dest_mmsi}</span>}
                                    </div>

                                    {/* Message text */}
                                    <div style={{
                                        fontSize: '0.82rem', fontWeight: 500, color: colors.textMain,
                                        padding: '8px 10px',
                                        background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.03)',
                                        borderRadius: '6px',
                                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                        wordBreak: 'break-all',
                                        marginBottom: '6px'
                                    }}>
                                        {alert.text || '(no text)'}
                                    </div>

                    {/* Timestamp */}
                    <div style={{ fontSize: '0.7rem', color: colors.textMuted, opacity: 0.7 }}>
                        {alert.timestamp_ms ? new Date(alert.timestamp_ms).toLocaleString() : alert.timestamp || '—'}
                    </div>
                </div>
            ))
        )}
    </div>
</div>
)}

{/* Safety Alert Toast */}
{safetyToast && (
                <div style={{
                    position: 'fixed', top: '80px', right: '20px',
                    background: isDark ? 'rgba(30, 20, 10, 0.95)' : 'rgba(255, 250, 240, 0.95)',
                    backdropFilter: 'blur(12px)',
                    border: `1px solid ${isDark ? 'rgba(245, 158, 11, 0.4)' : 'rgba(245, 158, 11, 0.3)'}`,
                    borderLeft: '4px solid #f59e0b',
                    borderRadius: '10px',
                    padding: '14px 18px',
                    maxWidth: '380px',
                    zIndex: 30000,
                    boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                    animation: 'slideInRight 0.4s ease-out',
                    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif"
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <AlertTriangle size={16} color="#f59e0b" />
                        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase' }}>
                            {safetyToast.is_broadcast ? 'Safety Broadcast' : 'Safety Alert'}
                        </span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: colors.textMuted, marginBottom: '4px' }}>
                        From: <span style={{ fontWeight: 800, color: colors.textMain }}>{safetyToast.name || safetyToast.mmsi}</span> {safetyToast.dest_mmsi ? `→ ${safetyToast.dest_mmsi}` : ''}
                    </div>
                    <div style={{
                        fontSize: '0.8rem', fontWeight: 500, color: colors.textMain,
                        fontFamily: "'JetBrains Mono', monospace",
                        wordBreak: 'break-all'
                    }}>
                        {safetyToast.text ? safetyToast.text.substring(0, 120) : '(no text)'}
                    </div>
                </div>
            )}            {contextMenu && (
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

            {/* Bottom Console Bar */}
            {!isMobile && lastUpdatedShip && (
                <div style={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    zIndex: 10000,
                    display: 'flex',
                    flexDirection: 'column',
                    background: isDark ? 'rgba(12, 12, 22, 0.97)' : 'rgba(245, 247, 250, 0.97)',
                    backdropFilter: 'blur(12px)',
                    borderTop: `1px solid ${isDark ? 'rgba(68, 170, 255, 0.25)' : 'rgba(0, 131, 143, 0.15)'}`,
                    boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.2)',
                    fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
                    transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}>
                    {/* Expanded log area */}
                    {consoleExpanded && eventLog.length > 1 && (
                        <div style={{
                            maxHeight: '200px',
                            overflowY: 'auto',
                            borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                            padding: '4px 0'
                        }}>
                            {eventLog.slice(1, 30).map((ev, i) => (
                                <div key={`${ev.mmsi}-${ev.time}-${i}`} style={{
                                    display: 'grid',
                                    gridTemplateColumns: isMobile ? '70px auto 1fr' : '75px 50px 240px 95px 1fr',
                                    alignItems: 'center',
                                    padding: '3px 20px',
                                    fontSize: '0.8rem',
                                    color: colors.textMuted,
                                    opacity: Math.max(0.3, 1 - i * 0.05),
                                    borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}`,
                                    gap: isMobile ? '8px' : '12px'
                                }}>
                                    <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.75rem' }}>
                                        {new Date(ev.time).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    {!isMobile && (
                                        <>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isDark ? 'rgba(68,170,255,0.7)' : 'rgba(0,112,128,0.7)' }}>
                                                {ev.msgType != null ? `Type ${ev.msgType}` : '—'}
                                            </span>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: isDark ? 'rgba(68,170,255,0.5)' : 'rgba(0,112,128,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {ev.msgType != null ? getAisMsgTypeName(ev.msgType) : ''}
                                            </span>
                                            <span style={{ fontSize: '0.75rem', opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>
                                                {ev.mmsi}
                                            </span>
                                        </>
                                    )}
                                    {isMobile && (
                                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: isDark ? 'rgba(68,170,255,0.5)' : 'rgba(0,112,128,0.5)' }}>
                                            {ev.msgType != null ? `T${ev.msgType}` : ''}
                                        </span>
                                    )}
                                    <span style={{ fontWeight: 600, color: isDark ? 'rgba(68,170,255,0.7)' : 'rgba(0,112,128,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {ev.name}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Main bar (always visible) */}
                    <div
                        onClick={() => setConsoleExpanded(prev => !prev)}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: isMobile ? '8px auto 65px 1fr 24px' : '8px auto 75px 50px 240px 95px 1fr 70px 24px',
                            alignItems: 'center',
                            padding: isMobile ? '8px 12px' : '8px 20px',
                            gap: isMobile ? '8px' : '12px',
                            cursor: 'pointer',
                            minHeight: '36px',
                            userSelect: 'none'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                        {/* Pulse dot */}
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite', flexShrink: 0 }} />

                        {/* Label */}
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.5px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Latest</span>

                        {/* Timestamp */}
                        <span style={{ fontSize: '0.75rem', color: colors.textMuted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {new Date(lastUpdatedShip.time).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}
                        </span>

                        {!isMobile && (
                            <>
                                {/* Type number */}
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: isDark ? '#44aaff' : '#007080', whiteSpace: 'nowrap' }}>
                                    {lastUpdatedShip.msgType != null ? `Type ${lastUpdatedShip.msgType}` : '\u2014'}
                                </span>
                                {/* Type text */}
                                <span style={{ fontSize: '0.75rem', color: colors.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.8 }}>
                                    {lastUpdatedShip.msgType != null ? getAisMsgTypeName(lastUpdatedShip.msgType) : ''}
                                </span>

                                {/* MMSI (hidden on mobile) */}
                                <span style={{ fontSize: '0.8rem', opacity: 0.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                    {lastUpdatedShip.mmsi}
                                </span>
                            </>
                        )}

                        {/* Ship name */}
                        <span style={{ fontSize: '0.88rem', fontWeight: 600, color: isDark ? '#44aaff' : '#007080', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {lastUpdatedShip.name}
                        </span>

                        {/* Event count (hidden on mobile to fit the 5 column mobile grid) */}
                        {!isMobile && (
                            <span style={{ fontSize: '0.7rem', color: colors.textMuted, opacity: 0.6, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                {eventLog.length} events
                            </span>
                        )}

                        {/* Expand/collapse chevron */}
                        {consoleExpanded ? <ChevronDown size={14} color={colors.textMuted} /> : <ChevronUp size={14} color={colors.textMuted} />}
                    </div>
                </div>
            )}
            {isRestarting && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(15px)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    zIndex: 20000, color: 'white', textAlign: 'center'
                }}>
                    <RefreshCw size={64} className="restart-pulse" style={{ color: '#44aaff', marginBottom: '25px' }} />
                    <h1 style={{ margin: 0, fontSize: '2.2rem', fontWeight: 900, letterSpacing: '-1px' }}>Backend Restarting...</h1>
                    <p style={{ opacity: 0.7, marginTop: '12px', fontSize: '1.1rem', maxWidth: '400px', lineHeight: '1.5' }}>
                        NavisCore is reconnecting to the backend service. This usually takes 5-10 seconds.
                    </p>
                    <div style={{ width: '300px', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '10px', marginTop: '40px', overflow: 'hidden', position: 'relative' }}>
                        <div className="loading-bar-progress" style={{ position: 'absolute', height: '100%', background: 'linear-gradient(90deg, #44aaff, #0072ff)', width: '30%' }}></div>
                    </div>
                </div>
            )}
            <style>{`
                @keyframes restart-pulse-anim {
                    from { transform: rotate(0deg) scale(1); opacity: 0.8; }
                    to { transform: rotate(360deg) scale(1.15); opacity: 1; }
                }
                .restart-pulse { animation: restart-pulse-anim 2s infinite linear; }
                .loading-bar-progress { animation: loading-bar-anim 1.5s infinite ease-in-out; }
                @keyframes loading-bar-anim {
                    0% { left: -40%; width: 30%; }
                    50% { width: 60%; }
                    100% { left: 110%; width: 30%; }
                }
            `}</style>
        </div>
    );
}

