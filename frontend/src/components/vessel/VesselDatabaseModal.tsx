import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Database, Download, Edit, Globe, Radio, Search, Ship, Trash2, Upload, Wifi, X } from 'lucide-react';
import { getShipColor, getShipTypeName } from '../../utils/ais';
import { getCountryName, getFlagEmoji } from '../../utils/countries';
import { getTimeAgo } from '../../utils/geo';
import { aisShipTypes } from '../../utils/ais';
import VesselEditModal from './VesselEditModal';

export default function VesselDatabaseModal({ 
    isOpen, onClose, onSelectVessel, colors, 
    dbSearchTerm, setDbSearchTerm, 
    dbFilterType, setDbFilterType, 
    dbFilterSource, setDbFilterSource,
    databaseShips, fetchMore, hasMore, loading, 
    dbSort, setDbSort, dbTotal, onRefresh, isDark, isMobile
}: any) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [shipToEdit, setShipToEdit] = useState<any>(null);

    const handleScroll = () => {
        if (!scrollRef.current || loading || !hasMore) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        if (scrollTop + clientHeight >= scrollHeight - 50) {
            fetchMore();
        }
    };

    const handleSort = (key: string) => {
        setDbSort((prev: any) => ({
            key,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    const renderSortIcon = (key: string) => {
        if (dbSort.key !== key) return <ChevronUp size={12} style={{ opacity: 0.2 }} className="db-sort-icon" />;
        return dbSort.direction === 'desc' 
            ? <ChevronDown size={14} className="db-sort-icon" style={{ color: '#44aaff' }} /> 
            : <ChevronUp size={14} className="db-sort-icon" style={{ color: '#44aaff' }} />;
    };

    const handleEditStart = (ship: any) => {
        setShipToEdit(ship);
        setIsEditModalOpen(true);
    };

    const handleDeleteShip = async (mmsi: number) => {
        if (!window.confirm(`Are you sure you want to delete vessel ${mmsi} from the archive? This cannot be undone.`)) return;
        
        try {
            const resp = await fetch(`/api/ships/${mmsi}`, { method: 'DELETE' });
            const data = await resp.json();
            if (data.status === 'success') {
                setIsEditModalOpen(false);
                onRefresh();
            } else {
                alert("Error deleting ship: " + (data.error || 'Unknown error'));
            }
        } catch (err) {
            console.error(err);
            alert("Failed to delete ship.");
        }
    };

    const handleEditSave = async (updatedData: any) => {
        try {
            const resp = await fetch(`/api/ships/${updatedData.mmsi}/details`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData)
            });
            const data = await resp.json();
            if (data.status === 'success') {
                setIsEditModalOpen(false);
                onRefresh();
            } else {
                alert("Error saving: " + (data.error || 'Unknown error'));
            }
        } catch (err) {
            console.error(err);
            alert("Failed to save changes.");
        }
    };

    if (!isOpen) return null;

    const getTimeStampFromStr = (dtStr: string) => {
        if (!dtStr) return Date.now();
        try {
            return new Date(dtStr.replace(' ', 'T')).getTime();
        } catch(e) { return Date.now(); }
    };

    return (
        <>
        <div className="settings-modal-overlay" onClick={onClose} style={{ zIndex: 1500 }}>
            <div className="settings-modal" onClick={e => e.stopPropagation()} style={{ 
                height: isMobile ? '100vh' : '92vh', 
                width: isMobile ? '100vw' : '85vw', 
                maxWidth: '1600px',
                borderRadius: isMobile ? '0' : '16px', 
                overflow: 'hidden', 
                display: 'flex', 
                flexDirection: 'column', 
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                background: colors.bgCard 
            }}>
                <div className="modal-header" style={{ borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: colors.bgApp }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ background: 'rgba(68, 170, 255, 0.15)', color: '#44aaff', padding: '10px', borderRadius: '12px' }}>
                            <Database size={24} />
                        </div>
                        <div>
                            <h2 className="modal-title" style={{ margin: 0, fontWeight: 800 }}>Vessel Database</h2>
                            <p className="modal-sub-title" style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>Explore archive • Double-click a row to edit</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {/* Filter Section */}
                    <div className="modal-toolbar" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <div style={{ position: 'relative', width: '180px' }}>
                                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: colors.textMuted }} />
                                <input 
                                    type="text"
                                    placeholder="Search Name/MMSI..."
                                    value={dbSearchTerm}
                                    onChange={e => setDbSearchTerm(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 10px 8px 32px',
                                        borderRadius: '6px',
                                        background: colors.bgApp,
                                        border: `1px solid ${colors.border}`,
                                        color: colors.textMain,
                                        outline: 'none',
                                        fontSize: '0.8rem'
                                    }}
                                />
                            </div>
                            
                            <div style={{ position: 'relative', width: '140px' }}>
                                <select
                                    value={dbFilterSource}
                                    onChange={e => setDbFilterSource(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 30px 8px 10px',
                                        borderRadius: '6px',
                                        background: colors.bgApp,
                                        border: `1px solid ${colors.border}`,
                                        color: colors.textMain,
                                        outline: 'none',
                                        fontSize: '0.8rem',
                                        appearance: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value="all">All Sources</option>
                                    <option value="local">SDR (Local)</option>
                                    <option value="aisstream">STR (Stream)</option>
                                    <option value="udp">UDP (Network)</option>
                                </select>
                                <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.5 }} />
                            </div>

                            <div style={{ position: 'relative', width: '180px' }}>
                                <select
                                    value={dbFilterType}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setDbFilterType(val === 'all' ? 'all' : parseInt(val));
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '8px 30px 8px 10px',
                                        borderRadius: '6px',
                                        background: colors.bgApp,
                                        border: `1px solid ${colors.border}`,
                                        color: colors.textMain,
                                        outline: 'none',
                                        fontSize: '0.8rem',
                                        appearance: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value="all">All Ship Types</option>
                                    {aisShipTypes.map(t => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>
                                <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.5 }} />
                            </div>
                        </div>

                        <div style={{ width: '1px', height: '24px', background: colors.border, margin: '0 5px' }} />

                        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: colors.textMuted, cursor: 'pointer', padding: '8px', borderRadius: '50%', transition: 'all 0.2s' }}>
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div 
                    className="modal-body"
                    ref={scrollRef}
                    onScroll={handleScroll}
                    style={{ flex: 1, overflowY: 'auto' }}
                >
                    <table className="db-table-compact" style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: colors.bgCard }}>
                            <tr style={{ background: colors.bgApp }}>
                                <th style={{ width: '60px', padding: '10px 15px', textAlign: 'left', borderBottom: `2px solid ${colors.border}`, fontSize: '0.7rem', textTransform: 'uppercase', color: colors.textMuted, fontWeight: 700 }}>Img</th>
                                <th style={{ width: '100px', padding: '10px 15px', textAlign: 'left', borderBottom: `2px solid ${colors.border}`, fontSize: '0.7rem', textTransform: 'uppercase', color: colors.textMuted, fontWeight: 700, cursor: 'pointer' }} onClick={() => handleSort('mmsi')}>MMSI {renderSortIcon('mmsi')}</th>
                                <th style={{ padding: '10px 15px', textAlign: 'left', borderBottom: `2px solid ${colors.border}`, fontSize: '0.7rem', textTransform: 'uppercase', color: colors.textMuted, fontWeight: 700, cursor: 'pointer' }} onClick={() => handleSort('name')}>Name {renderSortIcon('name')}</th>
                                <th style={{ width: '150px', padding: '10px 15px', textAlign: 'left', borderBottom: `2px solid ${colors.border}`, fontSize: '0.7rem', textTransform: 'uppercase', color: colors.textMuted, fontWeight: 700, cursor: 'pointer' }} onClick={() => handleSort('type')}>Type {renderSortIcon('type')}</th>
                                <th style={{ width: '100px', padding: '10px 15px', textAlign: 'left', borderBottom: `2px solid ${colors.border}`, fontSize: '0.7rem', textTransform: 'uppercase', color: colors.textMuted, fontWeight: 700 }}>IMO/Call</th>
                                <th style={{ width: '100px', padding: '10px 15px', textAlign: 'left', borderBottom: `2px solid ${colors.border}`, fontSize: '0.7rem', textTransform: 'uppercase', color: colors.textMuted, fontWeight: 700 }}>Dim/Dr</th>
                                <th style={{ width: '60px', padding: '10px 15px', textAlign: 'center', borderBottom: `2px solid ${colors.border}`, fontSize: '0.7rem', textTransform: 'uppercase', color: colors.textMuted, fontWeight: 700, cursor: 'pointer' }} onClick={() => handleSort('registration_count')}>Seen {renderSortIcon('registration_count')}</th>
                                <th style={{ width: '160px', padding: '10px 15px', textAlign: 'left', borderBottom: `2px solid ${colors.border}`, fontSize: '0.7rem', textTransform: 'uppercase', color: colors.textMuted, fontWeight: 700, cursor: 'pointer' }} onClick={() => handleSort('last_seen')}>Last Seen {renderSortIcon('last_seen')}</th>
                                <th style={{ width: '120px', padding: '10px 15px', textAlign: 'left', borderBottom: `2px solid ${colors.border}`, fontSize: '0.7rem', textTransform: 'uppercase', color: colors.textMuted, fontWeight: 700 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {databaseShips.map((ship: any, idx: number) => {
                                return (
                                    <tr 
                                        key={ship.mmsi} 
                                        onDoubleClick={() => handleEditStart(ship)}
                                        onClick={() => onSelectVessel(ship)}
                                        style={{ 
                                            borderBottom: `1px solid ${colors.border}`, 
                                            cursor: 'pointer', 
                                            background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                                            transition: 'background 0.1s' 
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(68,170,255,0.05)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'; }}
                                    >
                                        <td style={{ padding: '6px 15px' }}>
                                            <div 
                                                style={{ width: '40px', height: '28px', borderRadius: '4px', background: '#0a0a0a', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${colors.border}`, cursor: ship.imageUrl ? 'zoom-in' : 'default' }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (ship.imageUrl && ship.imageUrl !== "/images/0.jpg") {
                                                        setSelectedImage(ship.imageUrl);
                                                    }
                                                }}
                                            >
                                                {ship.imageUrl && ship.imageUrl !== "/images/0.jpg" ? (
                                                    <img src={ship.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : (
                                                    <Ship size={14} color={colors.textMuted} style={{ opacity: 0.3 }} />
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ padding: '6px 15px' }}>
                                            <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.8rem', color: colors.textMain }}>{ship.mmsi}</div>
                                            <div style={{ fontSize: '0.65rem', color: colors.textMuted, opacity: 0.6 }}>{ship.source?.toUpperCase() || 'LOCAL'}</div>
                                        </td>
                                        <td style={{ padding: '6px 15px' }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: colors.textMain, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ship.name || 'Unknown Vessel'}</div>
                                        </td>
                                        <td style={{ padding: '6px 15px' }}>
                                            <div style={{ fontSize: '0.75rem', color: colors.textMain }}>
                                                {ship.ship_type_text || (ship.type ? `Type ${ship.type}` : 'Other')}
                                            </div>
                                        </td>
                                        <td style={{ padding: '6px 15px' }}>
                                            <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>
                                                <div>{ship.imo || '--'}</div>
                                                <div>{ship.callsign || '--'}</div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '6px 15px' }}>
                                            <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>
                                                <div>{ship.length && ship.width ? `${ship.length}×${ship.width}m` : '--'}</div>
                                                {ship.draught ? <div>{ship.draught}m dist</div> : null}
                                            </div>
                                        </td>
                                        <td style={{ padding: '6px 15px', textAlign: 'center' }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#10b981' }}>{ship.registration_count || 1}</div>
                                        </td>
                                        <td style={{ padding: '6px 15px' }}>
                                            <div style={{ fontWeight: 700, color: '#44aaff', fontSize: '0.75rem' }}>{getTimeAgo(getTimeStampFromStr(ship.last_seen))} ago</div>
                                            <div style={{ fontSize: '0.65rem', color: colors.textMuted, opacity: 0.7 }}>{ship.last_seen || '--'}</div>
                                        </td>
                                        <td style={{ padding: '6px 15px' }}>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleEditStart(ship); }}
                                                style={{ padding: '4px 8px', background: 'rgba(68,170,255,0.1)', color: '#44aaff', border: 'none', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}
                                            >
                                                EDIT
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    
                    {loading && (
                        <div style={{ textAlign: 'center', padding: '40px', color: colors.textMuted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                            <div className="loading-spinner" style={{ width: '24px', height: '24px', border: '2px solid rgba(68,170,255,0.1)', borderTopColor: '#44aaff', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', opacity: 0.5 }}>Syncing logs...</span>
                        </div>
                    )}
                    
                    {!loading && databaseShips.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '100px 0', color: colors.textMuted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                            <Database size={40} style={{ opacity: 0.1 }} />
                            <div style={{ fontSize: '1rem', fontWeight: 600, opacity: 0.4 }}>No data matched your filters</div>
                        </div>
                    )}
                    
                    {!loading && hasMore && databaseShips.length > 0 && (
                        <div style={{ textAlign: 'center', padding: '20px' }}>
                            <button 
                                onClick={() => fetchMore()}
                                style={{ background: 'rgba(68, 170, 255, 0.1)', color: '#44aaff', border: '1px solid rgba(68, 170, 255, 0.3)', padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, transition: 'all 0.2s' }}
                            >
                                LOAD MORE VESSELS
                            </button>
                        </div>
                    )}
                </div>

                <div className="db-pagination-info" style={{ background: colors.bgApp, borderTop: `1px solid ${colors.border}`, color: colors.textMain, padding: '15px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.85rem' }}>
                        Showing <strong>{databaseShips.length}</strong> of <strong>{dbTotal || databaseShips.length}</strong> historical records
                    </div>
                    <div style={{ opacity: 0.5, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        <Wifi size={14} />
                        <span>Live Database Synchronization Active</span>
                    </div>
                </div>

                {selectedImage && (
                    <div 
                        className="settings-modal-overlay" 
                        onClick={() => setSelectedImage(null)} 
                        style={{ zIndex: 2000, background: 'rgba(0,0,0,0.9)' }}
                    >
                        <div 
                            style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}
                            onClick={e => e.stopPropagation()}
                        >
                            <img 
                                src={selectedImage} 
                                alt="Vessel High-Res" 
                                style={{ width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '90vh', borderRadius: '8px', boxShadow: '0 30px 60px rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)' }} 
                            />
                            <button 
                                onClick={() => setSelectedImage(null)}
                                style={{ position: 'absolute', top: '15px', right: '15px', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* Vessel Edit Modal */}
        {isEditModalOpen && shipToEdit && (
            <VesselEditModal
                ship={shipToEdit}
                isOpen={isEditModalOpen}
                onClose={() => { setIsEditModalOpen(false); setShipToEdit(null); }}
                onSave={handleEditSave}
                onDelete={handleDeleteShip}
                colors={colors}
                isDark={isDark}
            />
        )}
        </>
    );
}

