import React from 'react';
import { X, Navigation, Anchor, Ship } from 'lucide-react';
import { LiveTimeAgo } from '../ui/LiveTimeAgo';
import { formatSpeed } from '../../utils/geo';

export default function VesselMobilePanel({ ship, onClose, colors, isDark, getShipColor, getCountryName, getFlagEmoji, formatSpeed, formatDistance, haversineDistance, originLat, originLon, mqttSettings }: any) {
    if (!ship) return null;

    const shipColor = getShipColor(String(ship.mmsi), ship.shiptype || ship.ship_type, ship.is_meteo, ship.is_aton, ship.is_emergency);

    return (
        <div style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: isDark ? '#1a1a2e' : '#fff',
            zIndex: 10001,
            borderTopLeftRadius: '24px',
            borderTopRightRadius: '24px',
            boxShadow: '0 -10px 40px rgba(0,0,0,0.4)',
            animation: 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            color: isDark ? '#fff' : '#333'
        }}>
            <div style={{ width: '40px', height: '5px', background: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)', borderRadius: '3px', margin: '12px auto', flexShrink: 0 }} />
            
            <div style={{ overflowY: 'auto', padding: '0 20px 30px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                        <div style={{ width: '50px', height: '50px', borderRadius: '12px', background: shipColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', boxShadow: `0 4px 12px ${shipColor}44` }}>
                            <span dangerouslySetInnerHTML={{ __html: getFlagEmoji(String(ship.mmsi), ship.country_code) }} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>{ship.name || 'Unknown Vessel'}</h2>
                            <div style={{ color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)', fontSize: '0.85rem', fontWeight: 600 }}>
                                MMSI: {ship.mmsi} • {ship.callsign || 'No Callsign'}
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <X size={20} />
                    </button>
                </div>

                {ship.imageUrl && (
                    <div style={{ width: '100%', height: '180px', borderRadius: '16px', overflow: 'hidden', marginBottom: '20px', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}` }}>
                        <img src={ship.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={ship.name} />
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '25px' }}>
                    <div style={{ background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', padding: '12px', borderRadius: '12px' }}>
                        <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', fontWeight: 700, marginBottom: '4px' }}>Status</div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#44aaff' }}>{ship.status_text || 'Active'}</div>
                    </div>
                    <div style={{ background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', padding: '12px', borderRadius: '12px' }}>
                        <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', fontWeight: 700, marginBottom: '4px' }}>Distance</div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{formatDistance(haversineDistance(originLat, originLon, ship.lat, ship.lon), mqttSettings.units)}</div>
                    </div>
                    <div style={{ background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', padding: '12px', borderRadius: '12px' }}>
                        <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', fontWeight: 700, marginBottom: '4px' }}>Speed / Course</div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{formatSpeed(ship.sog)} / {ship.cog?.toFixed(0)}°</div>
                    </div>
                    <div style={{ background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', padding: '12px', borderRadius: '12px' }}>
                        <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', fontWeight: 700, marginBottom: '4px' }}>Heading</div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{ship.heading != null ? `${ship.heading}°` : '--'}</div>
                    </div>
                </div>

                <div style={{ borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, paddingTop: '20px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ opacity: 0.6 }}>Destination</span>
                            <span style={{ fontWeight: 700 }}>{ship.destination || '--'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ opacity: 0.6 }}>Type</span>
                            <span style={{ fontWeight: 700 }}>{ship.ship_type_text || (ship.shiptype ? `Type ${ship.shiptype}` : '--')}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ opacity: 0.6 }}>Source</span>
                            <span style={{ fontWeight: 700, color: '#44aaff' }}>{ship.source || 'Local'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ opacity: 0.6 }}>Last Seen</span>
                            <span style={{ fontWeight: 700 }}>{new Date(ship.timestamp).toLocaleTimeString()}</span>
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: '30px', display: 'flex', gap: '10px' }}>
                    <button style={{ flex: 1, background: '#44aaff', color: 'white', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: 800, fontSize: '0.9rem' }}>Follow Vessel</button>
                    <button style={{ flex: 1, background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', color: isDark ? '#fff' : '#333', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: 700, fontSize: '0.9rem' }}>History</button>
                </div>
            </div>
        </div>
    );
}

