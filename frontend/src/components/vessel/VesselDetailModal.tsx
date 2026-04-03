import React, { useState, useEffect , useRef } from 'react';
import { Activity, Anchor, Globe, Info, Navigation, Radio, Ship, Signal, X } from 'lucide-react';
import { LiveTimeAgo } from '../ui/LiveTimeAgo';
import { getShipColor, getShipTypeName } from '../../utils/ais';
import { getCountryName, getFlagEmoji } from '../../utils/countries';
import { formatDistance, formatSpeed, getTimeAgo, haversineDistance } from '../../utils/geo';

export default function VesselDetailModal({ isOpen, onClose, ship, colors, mqttSettings, isDark }: any) {
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

