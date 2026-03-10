import os
import re

file_path = r"d:\antigravity\NavisCore\frontend\src\App.tsx"
with open(file_path, 'r', encoding='utf-8') as f:
    text = f.read()

header_marker = "{/* Header */}"
map_marker = "{/* Map */}"

pre_header = text[:text.find(header_marker)]
post_map = text[text.find(map_marker) + len(map_marker):]

new_header_and_body = """{/* Header */}
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
                
                {/* Main Content Area (Map is flex-reversed or just flex 1) */}
                <div style={{ flex: 1, position: 'relative' }}>
                    {/* Map insertion point */}
"""

post_map_area = """                
                {/* Expandable Right Sidebar */}
                {isSidebarOpen && (
                    <div style={{
                        width: '380px',
                        background: colors.bgSidebar,
                        borderLeft: `1px solid ${colors.border}`,
                        display: 'flex',
                        flexDirection: 'column',
                        zIndex: 1000,
                        boxShadow: isDark ? '-5px 0 20px rgba(0,0,0,0.5)' : '-5px 0 20px rgba(0,0,0,0.05)',
                        transition: 'width 0.3s ease'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: `1px solid ${colors.border}` }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', color: colors.textMain }}>
                                {sidebarTab === 'ships' ? `Lokala Fartyg (${ships.length})` : 'Inställningar'}
                            </h2>
                            <button onClick={() => setIsSidebarOpen(false)} style={{ background: 'transparent', border: 'none', color: colors.textMuted, cursor: 'pointer' }}>
                                <X size={24} />
                            </button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {sidebarTab === 'ships' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {ships.length === 0 ? (
                                        <div style={{ color: colors.textMuted, textAlign: 'center', padding: '20px', background: colors.bgCard, borderRadius: '8px', border: `1px solid ${colors.border}` }}>
                                            Inget fartyg på radarn ännu...
                                        </div>
                                    ) : ships.map((s, idx) => (
                                        <div key={s.mmsi} style={{
                                            padding: '12px 15px',
                                            background: idx % 2 === 0 ? colors.bgCard : colors.bgSidebar,
                                            borderRadius: '6px',
                                            borderLeft: `4px solid ${getShipColor(s.mmsi, s.shiptype || s.ship_type)}`,
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            cursor: 'pointer',
                                            transition: 'transform 0.1s',
                                            boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.05)'
                                        }} 
                                        onClick={() => setTrackedMmsi(s.mmsi)}
                                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                                        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                                        >
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <strong style={{ fontSize: '1.05rem', color: colors.textMain }}>{s.name || s.mmsi}</strong>
                                                <span style={{ fontSize: '0.75rem', color: colors.textMuted }}>{getShipTypeName(s.mmsi, s.shiptype || s.ship_type)}</span>
                                            </div>
                                            <div style={{ textAlign: 'right', fontSize: '0.85rem', color: colors.textMain }}>
                                                <div style={{ fontWeight: 600 }}>{s.sog?.toFixed(1) ?? '--'} kn</div>
                                                <div style={{ color: colors.textMuted }}>{s.cog?.toFixed(0) ?? '--'}°</div>
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
                                                        padding: '10px', borderRadius: '6px', outline: 'none'
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
                                                        padding: '10px', borderRadius: '6px', outline: 'none'
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: colors.textMain, cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={mqttSettings.show_range_rings === 'true'}
                                                onChange={(e) => setMqttSettings({ ...mqttSettings, show_range_rings: e.target.checked ? 'true' : 'false' })}
                                                style={{ accentColor: isDark ? colors.accent : colors.accentDark, width: '18px', height: '18px' }}
                                            />
                                            Visa avståndscirklar (Range Rings)
                                        </label>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${colors.border}` }}>
                                            <label style={{ color: colors.textMain, fontWeight: 'bold' }}>Göm inaktiva fartyg efter (minuter)</label>
                                            <input
                                                type="number" min="1" max="1440"
                                                value={mqttSettings.ship_timeout}
                                                onChange={(e) => setMqttSettings({ ...mqttSettings, ship_timeout: e.target.value })}
                                                style={{
                                                    background: colors.bgSidebar, border: `1px solid ${colors.border}`, color: colors.textMain,
                                                    padding: '10px', borderRadius: '6px', outline: 'none'
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <div style={{ background: colors.bgCard, padding: '15px', borderRadius: '10px', border: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', gap: '15px' }}>
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
                                                    style={{ background: colors.bgSidebar, border: `1px solid ${colors.border}`, color: colors.textMain, padding: '10px', borderRadius: '6px', outline: 'none' }}
                                                />
                                                <input
                                                    type="text" placeholder="ais/messages"
                                                    value={mqttSettings.mqtt_topic}
                                                    onChange={(e) => setMqttSettings({ ...mqttSettings, mqtt_topic: e.target.value })}
                                                    style={{ background: colors.bgSidebar, border: `1px solid ${colors.border}`, color: colors.textMain, padding: '10px', borderRadius: '6px', outline: 'none' }}
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
                                                    style={{ background: colors.bgSidebar, border: `1px solid ${colors.border}`, color: colors.textMain, padding: '10px', borderRadius: '6px', outline: 'none' }}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                <label style={{ color: colors.textMuted, fontSize: '0.9rem' }}>Lösenord</label>
                                                <input
                                                    type="password" placeholder="Frivilligt"
                                                    value={mqttSettings.mqtt_pass}
                                                    onChange={(e) => setMqttSettings({ ...mqttSettings, mqtt_pass: e.target.value })}
                                                    style={{ background: colors.bgSidebar, border: `1px solid ${colors.border}`, color: colors.textMain, padding: '10px', borderRadius: '6px', outline: 'none' }}
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
"""

# Vi måste också lägga till Range Rings och Origin marker inuti <MapContainer>
# Vi ska hitta {ships.map(s => s.lat && s.lon && (
ships_loop_marker = "{ships.map(s => s.lat && s.lon && ("

map_content = post_map[:post_map.find(ships_loop_marker)]
post_ships = post_map[post_map.find(ships_loop_marker):]

origin_map_insert = """
                        {/* Origin Marker & Range Rings */}
                        {!isNaN(originLat) && !isNaN(originLon) && (
                            <>
                                <Marker position={[originLat, originLon]} icon={L.divIcon({
                                        html: `<div style="display:flex; justify-content:center; align-items:center; width: 100%; height: 100%; border-radius:50%; background: #ff0044; border: 2px solid white; box-shadow: 0 0 10px rgba(255,0,0,0.5);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 16 16 12 12 8"></polyline><line x1="8" y1="12" x2="16" y2="12"></line></svg></div>`,
                                        className: 'origin-marker-icon',
                                        iconSize: [20, 20],
                                        iconAnchor: [10, 10]
                                    })}>
                                    <Tooltip direction="top" offset={[0, -10]}>Stationens Placering (ORIGIN)</Tooltip>
                                </Marker>

                                {mqttSettings.show_range_rings === 'true' && (
                                    <>
                                        <Circle center={[originLat, originLon]} radius={10000} color={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)"} weight={1} dashArray="5,5" fill={false} />
                                        <Circle center={[originLat, originLon]} radius={20000} color={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)"} weight={1} dashArray="5,5" fill={false} />
                                        <Circle center={[originLat, originLon]} radius={50000} color={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)"} weight={1} dashArray="5,5" fill={false} />
                                        <Circle center={[originLat, originLon]} radius={100000} color={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)"} weight={1} dashArray="5,5" fill={false} />
                                    </>
                                )}
                            </>
                        )}
                        
                        """

final_text = pre_header + new_header_and_body + map_content + origin_map_insert + post_ships + post_map_area
final_text = final_text.replace("</div>\\n</div>\\n)","</div>\\n)") # cleanup bottom

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(final_text)
