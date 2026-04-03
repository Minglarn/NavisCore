import React, { useEffect, useRef, useState } from 'react';
import { aisShipTypes } from '../../utils/ais';
import { Bell, Navigation, Save, Ship, Trash2, Upload, X } from 'lucide-react';

export default function VesselEditModal({ ship, isOpen, onClose, onSave, onDelete, colors, isDark }: any) {
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
                    
                    {/* Full Width section for MQTT flags */}
                    <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: '20px', marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <div style={{ fontSize: '0.75rem', color: colors.textMuted, fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Bell size={14} /> MQTT Configuration
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 15px', background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', borderRadius: '8px', border: `1px solid ${colors.border}` }}>
                                <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: colors.textMain }}>Ignore Vessel (MQTT)</div>
                                    <div style={{ fontSize: '0.65rem', color: colors.textMuted }}>Mute this vessel completely from MQTT stream</div>
                                </div>
                                <label className="switch">
                                    <input 
                                        type="checkbox" 
                                        checked={!!formData.mqtt_ignore} 
                                        onChange={(e) => setFormData((prev: any) => ({ ...prev, mqtt_ignore: e.target.checked }))} 
                                    />
                                    <span className="slider"></span>
                                </label>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 15px', background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', borderRadius: '8px', border: `1px solid ${colors.border}` }}>
                                <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: colors.textMain }}>Send on Rediscovery</div>
                                    <div style={{ fontSize: '0.65rem', color: colors.textMuted }}>Trigger 'NEW' alert on MQTT when vessel returns</div>
                                </div>
                                <label className="switch">
                                    <input 
                                        type="checkbox" 
                                        checked={formData.mqtt_send_new !== false} 
                                        onChange={(e) => setFormData((prev: any) => ({ ...prev, mqtt_send_new: e.target.checked }))} 
                                    />
                                    <span className="slider"></span>
                                </label>
                            </div>
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


