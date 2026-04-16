import React, { useState, useEffect, useRef } from 'react';
import { Activity, AlertTriangle, Anchor, ArrowDownLeft, ArrowUpRight, BarChart2, Bell, Calendar, Check, ChevronDown, ChevronUp, Cpu, Crosshair, Database, Download, Edit, Globe, Info, LayoutGrid, List, Moon, Navigation, Plus, Radar, Radio, RefreshCw, Rows, Save, Search, Settings, Ship, Signal, Sun, Terminal, Trash2, TrendingUp, Upload, User, Wifi, X } from 'lucide-react';
import Toggle from '../ui/Toggle';
import { MultiSelect } from '../ui/MultiSelect';

export default function SettingsModal({ isOpen, onClose, settings, setSettings, onSave, activeTab, setActiveTab, colors, theme, setIsRestarting, isMobile }: any) {
    const [isTestingAI, setIsTestingAI] = useState(false);
    const [testAIResponse, setTestAIResponse] = useState<any | null>(null);
    const [isTestingHourlyAI, setIsTestingHourlyAI] = useState(false);
    const [testHourlyAIResponse, setTestHourlyAIResponse] = useState<any | null>(null);
    const [isTestingDailyAI, setIsTestingDailyAI] = useState(false);
    const [testDailyAIResponse, setTestDailyAIResponse] = useState<any | null>(null);
    const [aiSubTab, setAiSubTab] = useState<'config' | 'vessel' | 'hourly' | 'daily'>('config');

    const handleTestAI = async () => {
        setIsTestingAI(true);
        setTestAIResponse(null);
        try {
            const API_BASE = window.location.port === '5173' ? 'http://127.0.0.1:8080' : '';
            const response = await fetch(`${API_BASE}/api/settings/test_ollama`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: settings.ollama_url,
                    model: settings.ollama_model,
                    prompt: settings.ollama_prompt,
                    api_type: settings.ollama_api_type || 'native',
                    max_tokens: settings.ollama_max_tokens || 2000
                })
            });
            const data = await response.json();
            setIsTestingAI(false);
            
            if (data.success) {
                setTestAIResponse({
                    text: data.response,
                    stats: data.stats
                });
            } else {
                setTestAIResponse({ error: data.error || 'Unknown error occurred' });
            }
        } catch (err) {
            setTestAIResponse({ error: "Failed to connect to backend test endpoint." });
        } finally {
            setIsTestingAI(false);
        }
    };

    const handleTestHourlyAI = async () => {
        setIsTestingHourlyAI(true);
        setTestHourlyAIResponse(null);
        try {
            const API_BASE = window.location.port === '5173' ? 'http://127.0.0.1:8080' : '';
            const response = await fetch(`${API_BASE}/api/settings/test_ollama_hourly`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: settings.ollama_url,
                    model: settings.ollama_model,
                    prompt: settings.ollama_hourly_prompt_template,
                    api_type: settings.ollama_api_type || 'native',
                    max_tokens: settings.ollama_max_tokens || 2000
                })
            });
            const data = await response.json();
            setIsTestingHourlyAI(false);
            
            if (data.success) {
                setTestHourlyAIResponse({
                    text: data.response,
                    stats: data.stats
                });
            } else {
                setTestHourlyAIResponse({ error: data.error || 'Unknown error occurred' });
            }
        } catch (err) {
            setTestHourlyAIResponse({ error: "Failed to connect to backend test endpoint." });
        } finally {
            setIsTestingHourlyAI(false);
        }
    };

    const handleTestDailyAI = async () => {
        setIsTestingDailyAI(true);
        setTestDailyAIResponse(null);
        try {
            const API_BASE = window.location.port === '5173' ? 'http://127.0.0.1:8080' : '';
            const response = await fetch(`${API_BASE}/api/settings/test_ollama_daily`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: settings.ollama_url,
                    model: settings.ollama_model,
                    prompt: settings.ollama_daily_prompt_template,
                    api_type: settings.ollama_api_type || 'native',
                    max_tokens: settings.ollama_max_tokens || 2000
                })
            });
            const data = await response.json();
            setIsTestingDailyAI(false);
            
            if (data.success) {
                setTestDailyAIResponse({
                    text: data.response,
                    stats: data.stats
                });
            } else {
                setTestDailyAIResponse({ error: data.error || 'Unknown error occurred' });
            }
        } catch (err) {
            setTestDailyAIResponse({ error: "Failed to connect to backend test endpoint." });
        } finally {
            setIsTestingDailyAI(false);
        }
    };

    if (!isOpen) return null;

    const tabs = [
        { id: 'general', label: 'General', icon: <Info size={18} />, title: 'General System Settings', desc: 'Configure basic application behavior and primary station location.' },
        { id: 'mqtt', label: 'MQTT', icon: <Signal size={18} />, title: 'MQTT Broker Configuration', desc: 'Manage incoming data feeds and outgoing vessel status broadcasts.' },
        { id: 'trail', label: 'Tracking', icon: <Navigation size={18} />, title: 'Vessel Tracking & Trails', desc: 'Customize how historical movement paths are displayed on the map.' },
        { id: 'map', label: 'Map', icon: <Sun size={18} />, title: 'Map Visualization', desc: 'Control map layers, vessel icons, labels, and interaction settings.' },
        { id: 'coverage', label: 'Coverage', icon: <Activity size={18} />, title: 'Coverage & Statistics', desc: 'Monitor system range and reset historical performance data.' },
        { id: 'sdr', label: 'SDR Tuning', icon: <Radio size={18} />, title: 'SDR Hardware Tuning', desc: 'Fine-tune your RTL-SDR frequency and gain settings (requires restart).' },
        { id: 'hybrid', label: 'Hybrid Data', icon: <Globe size={18} />, title: 'Hybrid Data Sources', desc: 'Configure AisStream.io integration and local NMEA UDP ingest.' },
        { id: 'ai', label: 'Local AI', icon: <Cpu size={18} />, title: 'Local AI Integration', desc: 'Power your vessel descriptions and safety analysis with local AI models (Ollama, LM Studio).' },
        { id: 'data', label: 'Database & Images', icon: <Database size={18} />, title: 'Database & Image Management', desc: 'Manage stored data, clear history and configure automatic purging rules.' },
    ];

    const activeTabData = tabs.find(t => t.id === activeTab) || tabs[0];

    return (
        <div className="settings-modal-overlay" onClick={onClose} style={isMobile ? { padding: 0 } : {}}>
            <div className={`settings-modal ${theme === 'light' ? 'light-theme' : ''}`} onClick={e => e.stopPropagation()} style={isMobile ? { width: '100%', height: '100%', maxWidth: 'none', maxHeight: 'none', borderRadius: 0, flexDirection: 'column' } : {}}>
                {/* Mobile Tab Switcher */}
                {isMobile && (
                    <div style={{ display: 'flex', overflowX: 'auto', background: colors.bgCard, borderBottom: `1px solid ${colors.border}`, padding: '10px 5px' }}>
                        {tabs.map(t => (
                            <button
                                key={t.id}
                                onClick={() => setActiveTab(t.id)}
                                style={{
                                    flexShrink: 0,
                                    padding: '8px 15px',
                                    margin: '0 5px',
                                    borderRadius: '20px',
                                    border: 'none',
                                    background: activeTab === t.id ? 'rgba(68,170,255,0.2)' : 'transparent',
                                    color: activeTab === t.id ? '#44aaff' : colors.textMuted,
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                {t.icon} {t.label}
                            </button>
                        ))}
                    </div>
                )}
                {/* Sidebar - Hidden on Mobile in favor of top switcher */}
                {!isMobile && (
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
                            NavisCore v2026.04.14
                        </div>
                    </div>
                )}

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

                            {activeTab === 'ai' && (
                                <div className="settings-grid">
                                    {/* AI Sub-tab Navigation */}
                                    <div style={{ 
                                        display: 'flex', 
                                        gap: '4px', 
                                        padding: '4px',
                                        background: 'rgba(255,255,255,0.03)',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(255,255,255,0.06)'
                                    }}>
                                        {([
                                            { id: 'config' as const, label: 'Configuration', icon: <Settings size={13} /> },
                                            { id: 'vessel' as const, label: 'Vessel Prompt', icon: <Ship size={13} /> },
                                            { id: 'hourly' as const, label: 'Hourly Prompt', icon: <BarChart2 size={13} /> },
                                            { id: 'daily' as const, label: 'Daily Prompt', icon: <Calendar size={13} /> },
                                        ]).map(tab => (
                                            <button
                                                key={tab.id}
                                                onClick={() => setAiSubTab(tab.id)}
                                                style={{
                                                    flex: 1,
                                                    padding: '10px 12px',
                                                    borderRadius: '9px',
                                                    border: 'none',
                                                    background: aiSubTab === tab.id 
                                                        ? 'linear-gradient(135deg, rgba(68,170,255,0.15), rgba(68,170,255,0.08))'
                                                        : 'transparent',
                                                    color: aiSubTab === tab.id ? '#44aaff' : colors.textMuted,
                                                    fontSize: '0.78rem',
                                                    fontWeight: aiSubTab === tab.id ? 700 : 500,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '6px',
                                                    transition: 'all 0.2s ease',
                                                    boxShadow: aiSubTab === tab.id 
                                                        ? '0 2px 8px rgba(68,170,255,0.1), inset 0 0 0 1px rgba(68,170,255,0.15)' 
                                                        : 'none'
                                                }}
                                            >
                                                {tab.icon} {tab.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Sub-tab: Configuration */}
                                    {aiSubTab === 'config' && (
                                    <div className="settings-card">
                                        <div className="settings-card-title"><Cpu size={14} /> AI Service Configuration</div>
                                        <div className="form-group-premium">
                                            <div>
                                                <label>Enable AI Descriptions</label>
                                                <div className="description">Use local LLM to generate natural language vessel summaries</div>
                                            </div>
                                            <Toggle
                                                checked={settings.ollama_enabled === 'true'}
                                                onChange={val => setSettings({ ...settings, ollama_enabled: String(val) })}
                                            />
                                        </div>

                                        <div className="form-group-premium vertical">
                                            <label>Service API URL</label>
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <input 
                                                    type="text" 
                                                    className="input-premium" 
                                                    placeholder="http://192.168.1.xxx:11434" 
                                                    value={settings.ollama_url} 
                                                    onChange={e => setSettings({ ...settings, ollama_url: e.target.value })} 
                                                    style={{ flex: 1 }} 
                                                />
                                            </div>
                                            <div className="description" style={{ marginTop: '5px' }}>
                                                The base URL for your AI service. For LM Studio, usually ends in <code>/v1</code>.
                                            </div>
                                        </div>

                                        <div className="form-group-premium vertical">
                                            <label>AI API Type</label>
                                            <select 
                                                className="input-premium"
                                                value={settings.ollama_api_type || 'native'}
                                                onChange={e => setSettings({ ...settings, ollama_api_type: e.target.value })}
                                                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', color: colors.text }}
                                            >
                                                <option value="native">Ollama (Native /api/generate)</option>
                                                <option value="openai">OpenAI / LM Studio (/v1/chat/completions)</option>
                                            </select>
                                            <div className="description" style={{ marginTop: '5px' }}>
                                                Choose <strong>Ollama Native</strong> for default Ollama installs, or <strong>OpenAI</strong> for LM Studio, LocalAI, or Ollama's compatibility mode.
                                            </div>
                                        </div>

                                        <div className="form-group-premium vertical">
                                            <label>AI Model Name</label>
                                            <input 
                                                type="text" 
                                                className="input-premium" 
                                                placeholder="google/gemma-4-e4b" 
                                                value={settings.ollama_model} 
                                                onChange={e => setSettings({ ...settings, ollama_model: e.target.value })} 
                                                style={{ width: '100%' }} 
                                            />
                                            <div className="description" style={{ marginTop: '5px' }}>
                                                We recommend <strong>google/gemma-4-e4b</strong> for best accuracy and performance.
                                            </div>
                                        </div>

                                        <div className="form-group-premium vertical">
                                            <label>Max Completion Tokens</label>
                                            <input 
                                                type="number" 
                                                className="input-premium" 
                                                placeholder="2000" 
                                                value={settings.ollama_max_tokens || 2000} 
                                                onChange={e => setSettings({ ...settings, ollama_max_tokens: e.target.value })} 
                                                style={{ width: '100%' }} 
                                            />
                                            <div className="description" style={{ marginTop: '5px' }}>
                                                Maximum length of AI response. Use higher values (e.g. 2000) for <strong>Reasoning/Thought</strong> models.
                                            </div>
                                        </div>

                                        <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(68,170,255,0.05)', borderRadius: '10px', border: '1px solid rgba(68,170,255,0.1)' }}>
                                            <div style={{ display: 'flex', gap: '12px' }}>
                                                <div style={{ background: 'rgba(68,170,255,0.1)', padding: '8px', borderRadius: '8px', height: 'fit-content' }}>
                                                    <Info size={18} color="#44aaff" />
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#44aaff', marginBottom: '4px' }}>AI Optimization Active</div>
                                                    <div style={{ fontSize: '0.8rem', color: colors.textMuted, lineHeight: 1.5 }}>
                                                        The system is now configured to use <strong>reasoning: False</strong> and <strong>minified payloads</strong>, providing vessel descriptions in under 10 seconds.
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    )}

                                    {/* Sub-tab: Vessel Prompt */}
                                    {aiSubTab === 'vessel' && (
                                    <div className="settings-card">
                                        <div className="settings-card-title"><Ship size={14} /> Vessel Description Prompt</div>
                                        <div style={{ fontSize: '0.8rem', color: colors.textMuted, lineHeight: 1.5, marginBottom: '15px' }}>
                                            Configure the AI prompt used to generate short natural language descriptions for individual vessels.
                                            This summary is included in the <code style={{ color: '#44aaff', fontSize: '0.75rem' }}>new_detected</code> MQTT payload.
                                        </div>
                                        <div className="form-group-premium vertical" style={{ marginTop: '10px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                <label>AI Summary Prompt Template</label>
                                                <div style={{ display: 'flex', gap: '15px' }}>
                                                    <button 
                                                        disabled={isTestingAI}
                                                        onClick={handleTestAI}
                                                        style={{ 
                                                            background: 'transparent', 
                                                            border: 'none', 
                                                            color: '#10b981', 
                                                            fontSize: '0.75rem', 
                                                            fontWeight: 700, 
                                                            cursor: isTestingAI ? 'not-allowed' : 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            opacity: isTestingAI ? 0.5 : 1
                                                        }}
                                                    >
                                                        <Radar size={12} className={isTestingAI ? 'animate-spin' : ''} /> 
                                                        {isTestingAI ? 'Testing...' : 'Test AI Integration'}
                                                    </button>
                                                    <button 
                                                        onClick={() => {
                                                            const defaultPrompt = "You are a maritime assistant. Based on this AIS data for a vessel in JSON format, write a short information sentence (max 2 sentences) in English.\n\nInclude details such as:\n- Nationality/Home country based on 'country_adjective' and 'country_code'. Put the country code in parentheses after the country name.\n- Vessel type {ship_type_label} and Status '{status_text}'\n- Name {name} and MMSI {mmsi}\n- Destination {destination}, Speed {sog} and Position {lat}, {lon}\n- When the vessel was last seen. Today's date is {current_date}. Base it on {last_seen_relative}.\n\nRespond only with the information sentence, skip introductions like 'Here is...'.";
                                                            setSettings({ ...settings, ollama_prompt: defaultPrompt });
                                                            setTestAIResponse(null);
                                                        }}
                                                        style={{ 
                                                            background: 'transparent', 
                                                            border: 'none', 
                                                            color: '#44aaff', 
                                                            fontSize: '0.75rem', 
                                                            fontWeight: 700, 
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                    >
                                                        <RefreshCw size={12} /> Reset to Default
                                                    </button>
                                                </div>
                                            </div>
                                            {testAIResponse && (
                                                <div style={{ 
                                                    marginBottom: '12px', 
                                                    padding: '12px', 
                                                    background: testAIResponse.error ? 'rgba(255,68,68,0.1)' : 'rgba(16,185,129,0.1)', 
                                                    border: `1px solid ${testAIResponse.error ? 'rgba(255,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`,
                                                    borderRadius: '8px',
                                                    fontSize: '0.8rem',
                                                    color: colors.textMain,
                                                    lineHeight: '1.4'
                                                }}>
                                                    <div style={{ fontWeight: 800, fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '8px', opacity: 0.9, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span>{testAIResponse.error ? 'Test Failed' : 'AI Response Preview'}</span>
                                                        {testAIResponse.stats && (
                                                            <span style={{ 
                                                                color: '#10b981', 
                                                                background: 'rgba(16,185,129,0.2)', 
                                                                padding: '2px 8px', 
                                                                borderRadius: '4px',
                                                                fontSize: '0.75rem'
                                                            }}>
                                                                {(testAIResponse.stats.duration_ms / 1000).toFixed(2)}s
                                                            </span>
                                                        )}
                                                    </div>
                                                    
                                                    {testAIResponse.error ? (
                                                        <div style={{ color: '#ff4444' }}>{testAIResponse.error}</div>
                                                    ) : (
                                                        <>
                                                            <div style={{ marginBottom: testAIResponse.stats ? '10px' : '0' }}>{testAIResponse.text}</div>
                                                            {testAIResponse.stats && (
                                                                <div style={{ 
                                                                    display: 'flex', 
                                                                    gap: '15px', 
                                                                    fontSize: '0.65rem', 
                                                                    paddingTop: '8px', 
                                                                    borderTop: '1px solid rgba(255,255,255,0.05)',
                                                                    color: colors.textMuted 
                                                                }}>
                                                                    {testAIResponse.stats.total_tokens && (
                                                                        <span>Tokens: <strong>{testAIResponse.stats.total_tokens}</strong> ({testAIResponse.stats.prompt_tokens}p + {testAIResponse.stats.completion_tokens}r)</span>
                                                                    )}
                                                                    {testAIResponse.stats.eval_count && (
                                                                        <span>Eval: <strong>{testAIResponse.stats.eval_count}</strong> tokens ({testAIResponse.stats.prompt_eval_count}p)</span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                            <textarea 
                                                className="input-premium" 
                                                rows={8}
                                                value={settings.ollama_prompt} 
                                                onChange={e => setSettings({ ...settings, ollama_prompt: e.target.value })} 
                                                style={{ 
                                                    width: '100%', 
                                                    fontFamily: 'monospace', 
                                                    fontSize: '0.85rem', 
                                                    lineHeight: '1.5',
                                                    resize: 'vertical',
                                                    padding: '12px'
                                                }}
                                            />
                                        </div>

                                        <div style={{ marginTop: '20px' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: colors.textMuted, marginBottom: '12px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Terminal size={14} /> Available Data Variables
                                            </div>
                                            <div style={{ 
                                                display: 'grid', 
                                                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', 
                                                gap: '8px',
                                                padding: '2px',
                                                background: 'transparent'
                                            }}>
                                                {[
                                                    {t:'{name}', d:'Vessel Name'}, {t:'{mmsi}', d:'MMSI Number'}, 
                                                    {t:'{country_code}', d:'ISO Code'}, {t:'{country_name}', d:'Country Name'},
                                                    {t:'{country_adjective}', d:'Country Adj'}, {t:'{ship_type_label}', d:'Vessel Type'},
                                                    {t:'{destination}', d:'Destination'}, {t:'{sog}', d:'Speed (knots)'},
                                                    {t:'{lat}', d:'Latitude'}, {t:'{lon}', d:'Longitude'},
                                                    {t:'{callsign}', d:'Radio Callsign'}, {t:'{imo}', d:'IMO Number'},
                                                    {t:'{status_text}', d:'Nav Status'}, {t:'{length}', d:'Length (m)'},
                                                    {t:'{width}', d:'Width (m)'}, {t:'{draught}', d:'Draught (m)'},
                                                    {t:'{last_seen_relative}', d:'Relative Time'}, {t:'{current_date}', d:'Today\'s Date'},
                                                    {t:'{ais_channel}', d:'AIS Ch'}, {t:'{cog}', d:'Course (COG)'},
                                                    {t:'{wind_speed}', d:'Wind Speed'}, {t:'{air_temp}', d:'Air Temp'}
                                                ].map(item => (
                                                    <div 
                                                        key={item.t} 
                                                        onClick={() => {
                                                            const textarea = document.querySelector('textarea');
                                                            if (textarea) {
                                                                const start = textarea.selectionStart;
                                                                const end = textarea.selectionEnd;
                                                                const text = settings.ollama_prompt || "";
                                                                const newText = text.substring(0, start) + item.t + text.substring(end);
                                                                setSettings({ ...settings, ollama_prompt: newText });
                                                            }
                                                        }}
                                                        style={{ 
                                                            fontSize: '0.7rem', 
                                                            padding: '8px 10px', 
                                                            background: 'rgba(255,255,255,0.03)', 
                                                            border: `1px solid rgba(68,170,255,0.2)`,
                                                            borderRadius: '6px',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '2px',
                                                            transition: 'all 0.2s ease'
                                                        }}
                                                        className="hover-bright"
                                                        title={`Click to insert ${item.t}`}
                                                    >
                                                        <span style={{ color: '#44aaff', fontWeight: 800, fontSize: '0.75rem' }}>{item.t}</span>
                                                        <span style={{ color: colors.textMuted, fontSize: '0.6rem', opacity: 0.8 }}>{item.d}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    )}

                                    {/* Sub-tab: Hourly Prompt */}
                                    {aiSubTab === 'hourly' && (
                                    <div className="settings-card">
                                        <div className="settings-card-title"><BarChart2 size={14} /> AI Hourly Traffic Summary</div>
                                        <div style={{ fontSize: '0.8rem', color: colors.textMuted, lineHeight: 1.5, marginBottom: '15px' }}>
                                            Configure a separate AI prompt used to generate a comprehensive hourly summary of all maritime traffic.
                                            This summary is included in the <code style={{ color: '#44aaff', fontSize: '0.75rem' }}>objects_stat_hourly</code> MQTT payload every hour.
                                        </div>
                                        <div className="form-group-premium vertical" style={{ marginTop: '10px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                <label>Hourly Summary Prompt Template</label>
                                                <div style={{ display: 'flex', gap: '15px' }}>
                                                    <button 
                                                        disabled={isTestingHourlyAI}
                                                        onClick={handleTestHourlyAI}
                                                        style={{ 
                                                            background: 'transparent', 
                                                            border: 'none', 
                                                            color: '#10b981', 
                                                            fontSize: '0.75rem', 
                                                            fontWeight: 700, 
                                                            cursor: isTestingHourlyAI ? 'not-allowed' : 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            opacity: isTestingHourlyAI ? 0.5 : 1
                                                        }}
                                                    >
                                                        <Radar size={12} className={isTestingHourlyAI ? 'animate-spin' : ''} /> 
                                                        {isTestingHourlyAI ? 'Testing...' : 'Test Hourly Summary'}
                                                    </button>
                                                    <button 
                                                        onClick={() => {
                                                            const defaultPrompt = "You are a maritime traffic analyst. Based on the following hourly AIS statistics, write a comprehensive summary (3-5 sentences) in English.\n\nStatistics for the past hour:\n- Date: {current_date}, Time: {current_time} (hour {current_hour})\n- Total AIS messages received: {messages_received}\n- New vessels detected this hour: {new_vessels}\n- Maximum unique vessels observed: {max_vessels}\n- Maximum reception range: {max_range_km} km ({max_range_nm} nm)\n- Vessel type distribution: {shiptype_summary}\n{trend_section}\n\nProvide an insightful analysis of the maritime traffic patterns. Compare with the previous hour if data is available and highlight significant changes. Note any interesting trends such as increasing/decreasing traffic, unusual vessel types, or notable range performance. Respond only with the summary text, no introductions.";
                                                            setSettings({ ...settings, ollama_hourly_prompt_template: defaultPrompt });
                                                            setTestHourlyAIResponse(null);
                                                        }}
                                                        style={{ 
                                                            background: 'transparent', 
                                                            border: 'none', 
                                                            color: '#44aaff', 
                                                            fontSize: '0.75rem', 
                                                            fontWeight: 700, 
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                    >
                                                        <RefreshCw size={12} /> Reset to Default
                                                    </button>
                                                </div>
                                            </div>
                                            {testHourlyAIResponse && (
                                                <div style={{ 
                                                    marginBottom: '12px', 
                                                    padding: '12px', 
                                                    background: testHourlyAIResponse.error ? 'rgba(255,68,68,0.1)' : 'rgba(16,185,129,0.1)', 
                                                    border: `1px solid ${testHourlyAIResponse.error ? 'rgba(255,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`,
                                                    borderRadius: '8px',
                                                    fontSize: '0.8rem',
                                                    color: colors.textMain,
                                                    lineHeight: '1.4'
                                                }}>
                                                    <div style={{ fontWeight: 800, fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '8px', opacity: 0.9, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span>{testHourlyAIResponse.error ? 'Test Failed' : 'Hourly Summary Preview'}</span>
                                                        {testHourlyAIResponse.stats && (
                                                            <span style={{ 
                                                                color: '#10b981', 
                                                                background: 'rgba(16,185,129,0.2)', 
                                                                padding: '2px 8px', 
                                                                borderRadius: '4px',
                                                                fontSize: '0.75rem'
                                                            }}>
                                                                {(testHourlyAIResponse.stats.duration_ms / 1000).toFixed(2)}s
                                                            </span>
                                                        )}
                                                    </div>
                                                    
                                                    {testHourlyAIResponse.error ? (
                                                        <div style={{ color: '#ff4444' }}>{testHourlyAIResponse.error}</div>
                                                    ) : (
                                                        <div>{testHourlyAIResponse.text}</div>
                                                    )}
                                                </div>
                                            )}
                                            <textarea 
                                                className="input-premium" 
                                                id="hourly-prompt-textarea"
                                                rows={8}
                                                placeholder="Leave empty to use the built-in default prompt. Click 'Reset to Default' to see and customize it."
                                                value={settings.ollama_hourly_prompt_template || ''} 
                                                onChange={e => setSettings({ ...settings, ollama_hourly_prompt_template: e.target.value })} 
                                                style={{ 
                                                    width: '100%', 
                                                    fontFamily: 'monospace', 
                                                    fontSize: '0.85rem', 
                                                    lineHeight: '1.5',
                                                    resize: 'vertical',
                                                    padding: '12px'
                                                }}
                                            />
                                        </div>

                                        <div style={{ marginTop: '20px' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: colors.textMuted, marginBottom: '12px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Terminal size={14} /> Available Hourly Variables
                                            </div>
                                            <div style={{ 
                                                display: 'grid', 
                                                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', 
                                                gap: '8px',
                                                padding: '2px',
                                                background: 'transparent'
                                            }}>
                                                {[
                                                    {t:'{messages_received}', d:'AIS Messages'},
                                                    {t:'{new_vessels}', d:'New Vessels'},
                                                    {t:'{max_vessels}', d:'Unique Vessels'},
                                                    {t:'{max_range_km}', d:'Max Range (km)'},
                                                    {t:'{max_range_nm}', d:'Max Range (nm)'},
                                                    {t:'{shiptype_summary}', d:'Type Distribution'},
                                                    {t:'{current_date}', d:'Today\'s Date'},
                                                    {t:'{current_time}', d:'Current Time'},
                                                    {t:'{current_hour}', d:'Hour Number'},
                                                    {t:'{trend_section}', d:'Full Trend Block'},
                                                    {t:'{prev_messages_received}', d:'Prev Messages'},
                                                    {t:'{prev_new_vessels}', d:'Prev New Vessels'},
                                                    {t:'{prev_max_vessels}', d:'Prev Unique'},
                                                    {t:'{prev_max_range_km}', d:'Prev Range (km)'},
                                                    {t:'{change_messages}', d:'Msg Change %'},
                                                    {t:'{change_new_vessels}', d:'New Vessels Change %'},
                                                    {t:'{change_max_vessels}', d:'Vessels Change %'},
                                                    {t:'{change_range}', d:'Range Change %'},
                                                    {t:'{has_previous_data}', d:'Has Prev Data'}
                                                ].map(item => (
                                                    <div 
                                                        key={item.t} 
                                                        onClick={() => {
                                                            const textarea = document.getElementById('hourly-prompt-textarea') as HTMLTextAreaElement;
                                                            if (textarea) {
                                                                const start = textarea.selectionStart;
                                                                const end = textarea.selectionEnd;
                                                                const text = settings.ollama_hourly_prompt_template || "";
                                                                const newText = text.substring(0, start) + item.t + text.substring(end);
                                                                setSettings({ ...settings, ollama_hourly_prompt_template: newText });
                                                            }
                                                        }}
                                                        style={{ 
                                                            fontSize: '0.7rem', 
                                                            padding: '8px 10px', 
                                                            background: 'rgba(255,255,255,0.03)', 
                                                            border: `1px solid rgba(68,170,255,0.2)`,
                                                            borderRadius: '6px',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            flexDirection: 'column' as const,
                                                            gap: '2px',
                                                            transition: 'all 0.2s ease'
                                                        }}
                                                        className="hover-bright"
                                                        title={`Click to insert ${item.t}`}
                                                    >
                                                        <span style={{ color: '#44aaff', fontWeight: 800, fontSize: '0.75rem' }}>{item.t}</span>
                                                        <span style={{ color: colors.textMuted, fontSize: '0.6rem', opacity: 0.8 }}>{item.d}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    )}

                                    {/* Sub-tab: Daily Prompt */}
                                    {aiSubTab === 'daily' && (
                                    <div className="settings-card">
                                        <div className="settings-card-title"><Calendar size={14} /> AI Daily Traffic Summary</div>
                                        <div style={{ fontSize: '0.8rem', color: colors.textMuted, lineHeight: 1.5, marginBottom: '15px' }}>
                                            Configure a separate AI prompt used to generate a comprehensive daily summary of all maritime traffic.
                                            This summary is included in the <code style={{ color: '#44aaff', fontSize: '0.75rem' }}>objects_stat_daily</code> MQTT payload at midnight.
                                        </div>
                                        <div className="form-group-premium vertical" style={{ marginTop: '10px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                <label>Daily Summary Prompt Template</label>
                                                <div style={{ display: 'flex', gap: '15px' }}>
                                                    <button 
                                                        disabled={isTestingDailyAI}
                                                        onClick={handleTestDailyAI}
                                                        style={{ 
                                                            background: 'transparent', 
                                                            border: 'none', 
                                                            color: '#10b981', 
                                                            fontSize: '0.75rem', 
                                                            fontWeight: 700, 
                                                            cursor: isTestingDailyAI ? 'not-allowed' : 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            opacity: isTestingDailyAI ? 0.5 : 1
                                                        }}
                                                    >
                                                        <Radar size={12} className={isTestingDailyAI ? 'animate-spin' : ''} /> 
                                                        {isTestingDailyAI ? 'Testing...' : 'Test Daily Summary'}
                                                    </button>
                                                    <button 
                                                        onClick={() => {
                                                            const defaultPrompt = "You are a maritime traffic analyst. Based on the following daily AIS statistics, write a comprehensive summary (3-5 sentences) in English.\n\nDaily statistics for {report_date}:\n- Total AIS messages received: {total_messages}\n- Unique vessels observed: {unique_ships}\n- New vessels detected: {new_ships}\n- Maximum reception range: {max_range_km} km ({max_range_nm} nm)\n- Vessel type distribution: {shiptype_summary}\n\nProvide an insightful analysis of the day's maritime traffic patterns. Highlight interesting trends such as vessel diversity, traffic volume, or notable range performance. Respond only with the summary text, no introductions.";
                                                            setSettings({ ...settings, ollama_daily_prompt_template: defaultPrompt });
                                                            setTestDailyAIResponse(null);
                                                        }}
                                                        style={{ 
                                                            background: 'transparent', 
                                                            border: 'none', 
                                                            color: '#44aaff', 
                                                            fontSize: '0.75rem', 
                                                            fontWeight: 700, 
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                    >
                                                        <RefreshCw size={12} /> Reset to Default
                                                    </button>
                                                </div>
                                            </div>
                                            {testDailyAIResponse && (
                                                <div style={{ 
                                                    marginBottom: '12px', 
                                                    padding: '12px', 
                                                    background: testDailyAIResponse.error ? 'rgba(255,68,68,0.1)' : 'rgba(16,185,129,0.1)', 
                                                    border: `1px solid ${testDailyAIResponse.error ? 'rgba(255,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`,
                                                    borderRadius: '8px',
                                                    fontSize: '0.8rem',
                                                    color: colors.textMain,
                                                    lineHeight: '1.4'
                                                }}>
                                                    <div style={{ fontWeight: 800, fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '8px', opacity: 0.9, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span>{testDailyAIResponse.error ? 'Test Failed' : 'Daily Summary Preview'}</span>
                                                        {testDailyAIResponse.stats && (
                                                            <span style={{ 
                                                                color: '#10b981', 
                                                                background: 'rgba(16,185,129,0.2)', 
                                                                padding: '2px 8px', 
                                                                borderRadius: '4px',
                                                                fontSize: '0.75rem'
                                                            }}>
                                                                {(testDailyAIResponse.stats.duration_ms / 1000).toFixed(2)}s
                                                            </span>
                                                        )}
                                                    </div>
                                                    
                                                    {testDailyAIResponse.error ? (
                                                        <div style={{ color: '#ff4444' }}>{testDailyAIResponse.error}</div>
                                                    ) : (
                                                        <div>{testDailyAIResponse.text}</div>
                                                    )}
                                                </div>
                                            )}
                                            <textarea 
                                                className="input-premium" 
                                                id="daily-prompt-textarea"
                                                rows={8}
                                                placeholder="Leave empty to use the built-in default prompt. Click 'Reset to Default' to see and customize it."
                                                value={settings.ollama_daily_prompt_template || ''} 
                                                onChange={e => setSettings({ ...settings, ollama_daily_prompt_template: e.target.value })} 
                                                style={{ 
                                                    width: '100%', 
                                                    fontFamily: 'monospace', 
                                                    fontSize: '0.85rem', 
                                                    lineHeight: '1.5',
                                                    resize: 'vertical',
                                                    padding: '12px'
                                                }}
                                            />
                                        </div>

                                        <div style={{ marginTop: '20px' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: colors.textMuted, marginBottom: '12px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Terminal size={14} /> Available Daily Variables
                                            </div>
                                            <div style={{ 
                                                display: 'grid', 
                                                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', 
                                                gap: '8px',
                                                padding: '2px',
                                                background: 'transparent'
                                            }}>
                                                {[
                                                    {t:'{report_date}', d:'Report Date'},
                                                    {t:'{total_messages}', d:'Total Messages'},
                                                    {t:'{unique_ships}', d:'Unique Vessels'},
                                                    {t:'{new_ships}', d:'New Vessels'},
                                                    {t:'{max_range_km}', d:'Max Range (km)'},
                                                    {t:'{max_range_nm}', d:'Max Range (nm)'},
                                                    {t:'{shiptype_summary}', d:'Type Distribution'}
                                                ].map(item => (
                                                    <div 
                                                        key={item.t} 
                                                        onClick={() => {
                                                            const textarea = document.getElementById('daily-prompt-textarea') as HTMLTextAreaElement;
                                                            if (textarea) {
                                                                const start = textarea.selectionStart;
                                                                const end = textarea.selectionEnd;
                                                                const text = settings.ollama_daily_prompt_template || "";
                                                                const newText = text.substring(0, start) + item.t + text.substring(end);
                                                                setSettings({ ...settings, ollama_daily_prompt_template: newText });
                                                            }
                                                        }}
                                                        style={{ 
                                                            fontSize: '0.7rem', 
                                                            padding: '8px 10px', 
                                                            background: 'rgba(255,255,255,0.03)', 
                                                            border: `1px solid rgba(68,170,255,0.2)`,
                                                            borderRadius: '6px',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            flexDirection: 'column' as const,
                                                            gap: '2px',
                                                            transition: 'all 0.2s ease'
                                                        }}
                                                        className="hover-bright"
                                                        title={`Click to insert ${item.t}`}
                                                    >
                                                        <span style={{ color: '#44aaff', fontWeight: 800, fontSize: '0.75rem' }}>{item.t}</span>
                                                        <span style={{ color: colors.textMuted, fontSize: '0.6rem', opacity: 0.8 }}>{item.d}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'data' && (
                                <div className="settings-grid">
                                    <div className="settings-card">
                                        <div className="settings-card-title"><Globe size={14} /> Advanced Image Enrichment</div>
                                        <div className="form-group-premium">
                                            <div>
                                                <label>Enable Playwright Stealth Scraper</label>
                                                <div className="description">Use an embedded headless browser to bypass anti-bot protections on image sites (Resource Intensive). Will be used as fallback when simple queries fail.</div>
                                            </div>
                                            <Toggle
                                                checked={settings.playwright_enabled === 'true'}
                                                onChange={val => setSettings({ ...settings, playwright_enabled: String(val) })}
                                            />
                                        </div>
                                    </div>

                                    <div className="settings-card">
                                        <div className="settings-card-title"><Database size={14} /> System Backup & Migration</div>

                                        <div style={{ display: 'grid', gap: '20px' }}>
                                            <div className="form-group-premium">
                                                <div>
                                                    <label>Full System Backup</label>
                                                    <div className="description">Downloads a ZIP archive containing the database and all vessel images.</div>
                                                </div>
                                                <button 
                                                    className="styled-button" 
                                                    style={{ padding: '10px 20px', background: 'rgba(68,170,255,0.1)', borderColor: '#44aaff66', color: '#44aaff' }}
                                                    onClick={async () => {
                                                        const isDev = window.location.port === '5173';
                                                        const url = isDev ? 'http://127.0.0.1:8080/api/backup/full' : '/api/backup/full';
                                                        window.location.href = url;
                                                    }}
                                                >
                                                    <Download size={16} style={{marginRight: '8px'}} /> Download Backup (ZIP)
                                                </button>
                                            </div>
                                            
                                            <div className="form-group-premium">
                                                <div>
                                                    <label>Restore from Backup</label>
                                                    <div className="description">Upload a previously downloaded ZIP. <strong>Warning: This overwrites current data!</strong></div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '10px' }}>
                                                    <input 
                                                        type="file" 
                                                        id="restore-upload" 
                                                        style={{ display: 'none' }} 
                                                        accept=".zip"
                                                        onChange={async (e) => {
                                                            const file = e.target.files?.[0];
                                                            if (!file) return;
                                                            if (window.confirm('Are you sure you want to restore the system from this backup? This will overwrite your current database and images.')) {
                                                                const formData = new FormData();
                                                                formData.append('file', file);
                                                                const isDev = window.location.port === '5173';
                                                                const url = isDev ? 'http://127.0.0.1:8080/api/restore/full' : '/api/restore/full';
                                                                try {
                                                                    const res = await fetch(url, { method: 'POST', body: formData });
                                                                    const data = await res.json();
                                                                    if (data.status === 'success') {
                                                                        alert('Restore successful! The system will now restart to apply changes.');
                                                                        // Trigger restart
                                                                        const restartUrl = isDev ? 'http://127.0.0.1:8080/api/system/restart' : '/api/system/restart';
                                                                        await fetch(restartUrl, { method: 'POST' });
                                                                        setIsRestarting(true);
                                                                    } else {
                                                                        alert('Restore failed: ' + data.message);
                                                                    }
                                                                } catch (err) {
                                                                    alert('Error during restore.');
                                                                }
                                                            }
                                                            e.target.value = '';
                                                        }}
                                                    />
                                                    <button 
                                                        className="styled-button" 
                                                        style={{ padding: '10px 20px', background: 'rgba(16,185,129,0.1)', borderColor: '#10b98166', color: '#10b981' }}
                                                        onClick={() => document.getElementById('restore-upload')?.click()}
                                                    >
                                                        <Upload size={16} style={{marginRight: '8px'}} /> Select Backup File
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="form-group-premium">
                                                <div>
                                                    <label>Restart Backend Service</label>
                                                    <div className="description">Actively restarts the NavisCore backend process. Useful after restore or hardware changes.</div>
                                                </div>
                                                <button 
                                                    className="styled-button" 
                                                    style={{ padding: '10px 20px', background: 'rgba(255,170,0,0.1)', borderColor: '#ffaa0066', color: '#ffaa00' }}
                                                    onClick={async () => {
                                                        if (window.confirm('Do you want to restart the backend service? Navigation and AIS tracking will temporarily stop for a few seconds.')) {
                                                            const isDev = window.location.port === '5173';
                                                            const url = isDev ? 'http://127.0.0.1:8080/api/system/restart' : '/api/system/restart';
                                                            try {
                                                                await fetch(url, { method: 'POST' });
                                                                setIsRestarting(true);
                                                            } catch (e) {
                                                                alert('Restart command failed.');
                                                            }
                                                        }
                                                    }}
                                                >
                                                    <RefreshCw size={16} style={{marginRight: '8px'}} /> Restart Backend Now
                                                </button>
                                            </div>
                                        </div>
                                    </div>

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

