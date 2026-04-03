import React, { useState, useEffect, useRef } from 'react';
import { Activity, Anchor, Edit, Globe, Info, Navigation, Radio, Ship, Signal, X } from 'lucide-react';
import { Accordion, AccordionRow } from '../ui/Accordion';
import { LiveTimeAgo } from '../ui/LiveTimeAgo';
import { getShipColor, getShipTypeName } from '../../utils/ais';
import { getCountryName, getFlagEmoji } from '../../utils/countries';
import { formatSpeed, formatDistance, haversineDistance } from '../../utils/geo';
import { getTimeAgo } from '../../utils/geo';
import { aisShipTypes } from '../../utils/ais';

export default function VesselDetailSidebar({ isOpen, onClose, ship, mqttSettings, colors }: any) {
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
        // Don't overwrite editData while user is actively editing
        if (!isEditing) {
            setEditData(ship ? { ...ship } : {});
        }
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
                <Accordion 
                    title="MQTT & Notifications" 
                    colors={colors} 
                    isOpen={expandedSections["MQTT & Notifications"] ?? false} 
                    setIsOpen={() => toggleSection("MQTT & Notifications")}
                >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: `1px solid ${colors.border}88` }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '0.65rem', color: colors.textMuted, fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>Ignore Vessel</span>
                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: colors.textMain }}>Do not send MQTT events</span>
                            </div>
                            <label className="switch" style={{ transform: 'scale(0.85)' }}>
                                <input 
                                    type="checkbox" 
                                    checked={!!editData.mqtt_ignore} 
                                    onChange={async (e) => {
                                        const newVal = e.target.checked;
                                        setEditData((prev: any) => ({ ...prev, mqtt_ignore: newVal }));
                                        // Auto-save toggle directly
                                        const isDev = window.location.port === '5173';
                                        const url = isDev ? `http://127.0.0.1:8080/api/ships/${mmsiStr}/details` : `/api/ships/${mmsiStr}/details`;
                                        try {
                                            await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mqtt_ignore: newVal }) });
                                            if (ship) ship.mqtt_ignore = newVal;
                                        } catch (err) { console.error('Failed to save mqtt_ignore', err); }
                                    }} 
                                />
                                <span className="slider"></span>
                            </label>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: `1px solid ${colors.border}88` }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '0.65rem', color: colors.textMuted, fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>Send on Rediscovery</span>
                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: colors.textMain }}>Send event type NEW</span>
                            </div>
                            <label className="switch" style={{ transform: 'scale(0.85)' }}>
                                <input 
                                    type="checkbox" 
                                    checked={!!editData.mqtt_send_new} 
                                    onChange={async (e) => {
                                        const newVal = e.target.checked;
                                        setEditData((prev: any) => ({ ...prev, mqtt_send_new: newVal }));
                                        // Auto-save toggle directly
                                        const isDev = window.location.port === '5173';
                                        const url = isDev ? `http://127.0.0.1:8080/api/ships/${mmsiStr}/details` : `/api/ships/${mmsiStr}/details`;
                                        try {
                                            await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mqtt_send_new: newVal }) });
                                            if (ship) ship.mqtt_send_new = newVal;
                                        } catch (err) { console.error('Failed to save mqtt_send_new', err); }
                                    }} 
                                />
                                <span className="slider"></span>
                            </label>
                        </div>
                    </div>
                </Accordion>
            </div>
        </div>
        </>
    );
}

