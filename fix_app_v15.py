
import os
import re

filepath = r'd:\antigravity\NavisCore\frontend\src\App.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    full_content = f.read()

# 1. Update VesselDetailSidebar
new_vessel_sidebar = """function VesselDetailSidebar({ isOpen, onClose, ship, mqttSettings, colors }: any) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [localImage, setLocalImage] = useState<string | null>(null);

    useEffect(() => {
        setLocalImage(ship ? ship.imageUrl : null);
    }, [ship]);

    if (!isOpen || !ship) return null;

    const mmsiStr = String(ship.mmsi);
    
    return (
        <>
            <div style={{ 
                position: 'fixed', right: 0, top: 0, bottom: 0, width: '400px', 
                background: colors.bgMain, zIndex: 1101, display: 'flex', flexDirection: 'column', 
                boxShadow: '-5px 0 25px rgba(0,0,0,0.3)', overflowY: 'auto',
                transition: 'transform 0.3s ease-out', transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
                borderLeft: `1px solid ${colors.border}`
            }}>
                {/* Header Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${colors.border}`, background: colors.bgCard }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button 
                            onClick={onClose}
                            style={{ 
                                background: 'transparent', border: 'none', cursor: 'pointer', 
                                color: colors.textMuted, display: 'flex', alignItems: 'center',
                                padding: '4px', borderRadius: '4px'
                            }}
                        >
                            <X size={20} />
                        </button>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: '#44aaff', textTransform: 'uppercase' }}>{ship.name || 'UNKNOWN'}</h2>
                    </div>
                    <span style={{ fontSize: '1.8rem', lineHeight: 1 }} dangerouslySetInnerHTML={{ __html: getFlagEmoji(mmsiStr, ship.country_code) }} />
                </div>
"""

# Pattern to match the start of VesselDetailSidebar up to the Destination Row
sidebar_start_pattern = r"function VesselDetailSidebar\(.*?\)\s*\{.*?background: colors\.bgSidebar \}\}\s*>"
# Actually, I'll just replace the whole function to be safer and cleaner.
vessel_sidebar_full_pattern = r"function VesselDetailSidebar\(.*?\)\s*\{.*?^\}"

# New full VesselDetailSidebar implementation (copied from view_file and modified)
# I need to be careful with the body of the function.
# Let's construct it more robustly.

vessel_sidebar_body = """function VesselDetailSidebar({ isOpen, onClose, ship, mqttSettings, colors }: any) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [localImage, setLocalImage] = useState<string | null>(null);

    useEffect(() => {
        setLocalImage(ship ? ship.imageUrl : null);
    }, [ship]);

    if (!isOpen || !ship) return null;

    const mmsiStr = String(ship.mmsi);
    
    return (
        <div style={{ 
            position: 'fixed', right: 0, top: 0, bottom: 0, width: '420px', 
            background: colors.bgMain, zIndex: 1101, display: 'flex', flexDirection: 'column', 
            boxShadow: '-10px 0 30px rgba(0,0,0,0.15)', overflowY: 'auto',
            transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
            transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
            borderLeft: `1px solid ${colors.border}`
        }}>
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
                </div>
                <span style={{ fontSize: '1.8rem', lineHeight: 1 }} dangerouslySetInnerHTML={{ __html: getFlagEmoji(mmsiStr, ship.country_code) }} />
            </div>

            {/* Destination Row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 20px', borderBottom: `1px solid ${colors.border}`, background: colors.bgSidebar }}>
                <div>
                    <div style={{ fontSize: '0.65rem', color: colors.textMuted, fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Destination</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, color: colors.textMain, fontSize: '0.95rem' }}>
                        <span dangerouslySetInnerHTML={{ __html: getFlagEmoji(mmsiStr, ship.country_code) }} />
                        {ship.destination || '--'}
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: colors.textMain }}>{ship.eta || 'N/A'}</div>
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
                        <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>KLICKA FÖR ATT LADDA UPP BILD</div>
                    </div>
                )}
                {uploading && <div className="spinner" style={{ position: 'absolute' }}></div>}
            </div>

            {/* Details Content */}
            <div style={{ flex: 1 }}>
                <Accordion title="Vessel Specifications" colors={colors} defaultOpen={true}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                        <AccordionRow label="MMSI" value={mmsiStr} colors={colors} />
                        <AccordionRow label="IMO" value={ship.imo || 'N/A'} colors={colors} />
                        <AccordionRow label="Callsign" value={ship.callsign || 'N/A'} colors={colors} />
                        <AccordionRow label="Type" value={ship.ship_type_text || 'Unknown'} colors={colors} />
                        <AccordionRow label="Length" value={ship.length ? `${ship.length}m` : 'N/A'} colors={colors} />
                        <AccordionRow label="Width" value={ship.width ? `${ship.width}m` : 'N/A'} colors={colors} />
                    </div>
                </Accordion>

                <Accordion title="Real-time Movement" colors={colors} defaultOpen={true}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                        <AccordionRow label="Status" value={ship.status_text || 'Under way'} colors={colors} />
                        <AccordionRow label="Speed (SOG)" value={ship.sog ? `${ship.sog} kn` : '0.0 kn'} colors={colors} />
                        <AccordionRow label="Course (COG)" value={ship.cog ? `${ship.cog}°` : '0°'} colors={colors} />
                        <AccordionRow label="Heading" value={ship.heading ? `${ship.heading}°` : 'N/A'} colors={colors} />
                    </div>
                </Accordion>

                <Accordion title="Navigation & Signal" colors={colors}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                        <AccordionRow label="Draught" value={ship.draught ? `${ship.draught}m` : 'N/A'} colors={colors} />
                        <AccordionRow label="Source" value={ship.source || 'Local'} colors={colors} />
                    </div>
                </Accordion>
            </div>
        </div>
    );
}
"""

full_content = re.sub(vessel_sidebar_full_pattern, vessel_sidebar_body, full_content, flags=re.MULTILINE|re.DOTALL)

# 2. Update SettingsModal Map Tab
settings_map_replacement = """                            <div className="form-group">
                                <div>
                                    <label>Cluster Break Zoom</label>
                                    <div className="description">Zoomnivå där fartygskluster delas upp (standard: 11)</div>
                                </div>
                                <input
                                    type="number"
                                    min="1"
                                    max="20"
                                    value={settings.cluster_break_zoom || '11'}
                                    onChange={e => setSettings({ ...settings, cluster_break_zoom: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Show Range Rings</label>
"""

full_content = full_content.replace('<label>Show Range Rings</label>', settings_map_replacement.split('<label>Show Range Rings</label>')[0] + '<label>Show Range Rings</label>')

# 3. Update MarkerClusterGroup prop
full_content = full_content.replace('disableClusteringAtZoom={11}', "disableClusteringAtZoom={parseInt(mqttSettings.cluster_break_zoom || '11')}")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(full_content)

print("Sidebar interaction and Cluster zoom settings applied.")
