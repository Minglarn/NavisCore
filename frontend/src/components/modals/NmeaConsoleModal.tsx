import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Radio, Search, Ship, Terminal, X } from 'lucide-react';
import { getAisMsgTypeName } from '../../utils/ais';

export default function NmeaConsoleModal({ isOpen, onClose, logs, colors }: any) {
    const [expandedIds, setExpandedIds] = useState<Set<any>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'live' | 'grouped'>('live'); // 'live' or 'grouped'

    const filteredLogs = useMemo(() => {
        return logs.filter((log: any) => {
            const query = searchQuery.toLowerCase();
            if (!query) return true;
            
            const rawMatch = log.raw.toLowerCase().includes(query);
            const mmsiMatch = log.decoded?.mmsi?.toString().includes(query);
            const displayName = log.decoded?.name || 'Unknown';
            const nameMatch = displayName.toLowerCase().includes(query);
            
            return rawMatch || mmsiMatch || nameMatch;
        });
    }, [logs, searchQuery]);

    const groupedLogs = useMemo(() => {
        if (viewMode !== 'grouped') return [];
        
        const groups: Record<string, any[]> = {};
        filteredLogs.forEach((log: any) => {
            // Group primarily by MMSI to ensure uniqueness
            const mmsi = log.decoded?.mmsi?.toString();
            // If no MMSI, use name as fallback, else 'Unknown'
            const key = mmsi || log.decoded?.name || 'Unknown';
            
            if (!groups[key]) groups[key] = [];
            groups[key].push(log);
        });
        
        return Object.entries(groups).map(([id, items]) => {
            // Pick most frequent name for the group
            const names = items.map(i => i.decoded?.name).filter(Boolean);
            const name = names.length > 0 ? names[0] : 'Unknown';
            const mmsi = items.find(i => i.decoded?.mmsi)?.decoded?.mmsi;
            
            return {
                id, // Use the key as a stable ID for expanded state
                name,
                mmsi,
                items: items.sort((a, b) => b.timestamp - a.timestamp)
            };
        }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [filteredLogs, viewMode]);

    if (!isOpen) return null;

    const toggleExpand = (id: any) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <div className="settings-modal-overlay" onClick={onClose} style={{ zIndex: 3000 }}>
            <div className="settings-modal" onClick={e => e.stopPropagation()} style={{ 
                width: '90%', 
                height: '90%', 
                maxWidth: '1600px',
                padding: '0',
                display: 'flex',
                flexDirection: 'column',
                background: colors.bgMain,
                border: `1px solid ${colors.border}`,
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{ 
                    padding: '20px 30px', 
                    background: colors.bgCard, 
                    borderBottom: `1px solid ${colors.border}`, 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center' 
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ 
                            background: 'linear-gradient(135deg, #44aaff, #0072ff)', 
                            padding: '8px', 
                            borderRadius: '10px',
                            display: 'flex',
                            boxShadow: '0 0 15px rgba(0,240,255,0.3)'
                        }}>
                            <Terminal size={24} color="#000" />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, color: colors.textMain, letterSpacing: '-0.5px' }}>NMEA Info Browser</h2>
                            <div style={{ color: colors.textMuted, fontSize: '0.8rem', opacity: 0.8 }}>Real-time telemetry & protocol analysis</div>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: colors.textMuted, cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = '#ff5555'} onMouseLeave={e => e.currentTarget.style.color = colors.textMuted}>
                        <X size={28} />
                    </button>
                </div>

                {/* Toolbar */}
                <div style={{ 
                    padding: '12px 30px', 
                    background: colors.bgSidebar, 
                    borderBottom: `1px solid ${colors.border}`,
                    display: 'flex',
                    gap: '20px',
                    alignItems: 'center',
                    flexWrap: 'wrap'
                }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: colors.textMuted }} />
                        <input 
                            type="text" 
                            placeholder="Filter by MMSI, Name, or Raw Data..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{ 
                                width: '100%', 
                                background: colors.bgMain, 
                                border: `1px solid ${colors.border}`, 
                                borderRadius: '8px', 
                                padding: '8px 12px 8px 38px',
                                color: colors.textMain,
                                fontSize: '0.9rem',
                                outline: 'none'
                            }}
                        />
                    </div>
                    
                    <div style={{ display: 'flex', background: colors.bgMain, borderRadius: '8px', padding: '4px', border: `1px solid ${colors.border}` }}>
                        <button 
                            onClick={() => setViewMode('live')}
                            style={{ 
                                padding: '6px 16px', 
                                borderRadius: '6px', 
                                border: 'none', 
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                background: viewMode === 'live' ? '#44aaff' : 'transparent',
                                color: viewMode === 'live' ? '#000' : colors.textMuted,
                                transition: 'all 0.2s'
                            }}
                        >
                            Live Stream
                        </button>
                        <button 
                            onClick={() => setViewMode('grouped')}
                            style={{ 
                                padding: '6px 16px', 
                                borderRadius: '6px', 
                                border: 'none', 
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                background: viewMode === 'grouped' ? '#44aaff' : 'transparent',
                                color: viewMode === 'grouped' ? '#000' : colors.textMuted,
                                transition: 'all 0.2s'
                            }}
                        >
                            Grouped by Vessel
                        </button>
                    </div>
                </div>

                {/* Log View */}
                <div style={{ flex: 1, padding: '20px 30px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', fontFamily: "'JetBrains Mono', 'Fira Code', monospace", background: colors.bgMain }}>
                    {viewMode === 'live' ? (
                        filteredLogs.length === 0 ? (
                            <div style={{ padding: '60px', textAlign: 'center', color: colors.textMuted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                                <Radio size={48} style={{ opacity: 0.2 }} />
                                <div>Waiting for NMEA data matching your criteria...</div>
                            </div>
                        ) : filteredLogs.map((log: any) => (
                            <div key={log.id} style={{ 
                                display: 'flex', 
                                flexDirection: 'column', 
                                background: colors.bgCard, 
                                borderRadius: '6px', 
                                border: `1px solid ${colors.border}`,
                                transition: 'transform 0.1s, border-color 0.2s',
                                overflow: 'hidden',
                                flexShrink: 0
                            }}>
                                <div 
                                    onClick={() => log.decoded && toggleExpand(log.id)}
                                    style={{ 
                                        padding: '8px 15px', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '20px', 
                                        fontSize: '0.85rem',
                                        cursor: log.decoded ? 'pointer' : 'default'
                                    }}
                                    onMouseEnter={e => log.decoded && (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                                    onMouseLeave={e => log.decoded && (e.currentTarget.style.background = 'transparent')}
                                >
                                    <span style={{ color: colors.textMuted, minWidth: '85px', fontSize: '0.75rem', fontWeight: 600 }}>{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                    <span style={{ 
                                        color: colors.accent, 
                                        minWidth: '120px', 
                                        fontSize: '0.75rem', 
                                        fontWeight: 800, 
                                        textTransform: 'uppercase',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {log.decoded?.name || log.decoded?.mmsi || 'Unknown'}
                                    </span>
                                    <span style={{ color: colors.isDark ? '#00ff80' : '#00a854', flex: 1, wordBreak: 'break-all', letterSpacing: '0.5px', fontWeight: 500 }}>{log.raw}</span>
                                    {log.decoded ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ 
                                                background: '#44aaff', 
                                                color: '#000', 
                                                padding: '1px 8px', 
                                                borderRadius: '4px', 
                                                fontSize: '0.65rem', 
                                                fontWeight: 900, 
                                                boxShadow: '0 0 10px rgba(0,240,255,0.3)',
                                                textTransform: 'uppercase'
                                            }}>
                                                TYPE {log.decoded.msg_type ?? log.decoded.type} • {getAisMsgTypeName(log.decoded.msg_type ?? log.decoded.type)}
                                            </span>
                                            {expandedIds.has(log.id) ? <ChevronUp size={16} color={colors.textMuted} /> : <ChevronDown size={16} color={colors.textMuted} />}
                                        </div>
                                    ) : (
                                        <span style={{ color: colors.textMuted, fontSize: '0.65rem', opacity: 0.5, textTransform: 'uppercase', fontWeight: 800 }}>RAW</span>
                                    )}
                                </div>
                                
                                {expandedIds.has(log.id) && log.decoded && (
                                    <div style={{ 
                                        padding: '15px 20px 20px 50px', 
                                        background: colors.isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)', 
                                        borderTop: `1px solid ${colors.border}`,
                                        fontSize: '0.85rem',
                                        color: colors.textMain,
                                        overflow: 'auto',
                                        maxHeight: '400px'
                                    }}>
                                        <pre style={{ margin: 0, color: colors.isDark ? '#44aaff' : '#0066cc', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(log.decoded, null, 2)}</pre>
                                    </div>
                                )}
                            </div>
                        ))
                    ) : (
                        /* Grouped View */
                        groupedLogs.length === 0 ? (
                            <div style={{ padding: '60px', textAlign: 'center', color: colors.textMuted }}>No grouped data available.</div>
                        ) : groupedLogs.map((group: any) => (
                            <div key={group.id} style={{ 
                                background: colors.bgCard, 
                                borderRadius: '8px', 
                                border: `1px solid ${colors.border}`,
                                marginBottom: '10px',
                                overflow: 'hidden',
                                flexShrink: 0
                            }}>
                                <div 
                                    onClick={() => toggleExpand(`group-${group.id}`)}
                                    style={{ 
                                        padding: '12px 20px', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'space-between',
                                        cursor: 'pointer',
                                        background: colors.bgSidebar
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                        <Ship size={18} color={colors.accent} />
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontWeight: 800, color: colors.textMain }}>{group.name}</span>
                                            {group.mmsi && <span style={{ color: colors.textMuted, fontSize: '0.7rem', opacity: 0.8 }}>MMSI: {group.mmsi}</span>}
                                        </div>
                                        <span style={{ 
                                            background: colors.bgMain, 
                                            color: colors.textMuted, 
                                            padding: '2px 8px', 
                                            borderRadius: '12px', 
                                            fontSize: '0.7rem', 
                                            fontWeight: 700 
                                        }}>
                                            {group.items.length} msgs
                                        </span>
                                    </div>
                                    {expandedIds.has(`group-${group.id}`) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                </div>
                                
                                {expandedIds.has(`group-${group.id}`) && (
                                    <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {group.items.map((log: any) => (
                                            <div key={log.id} style={{ 
                                                background: colors.isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)',
                                                borderRadius: '4px',
                                                overflow: 'hidden',
                                                borderLeft: `3px solid ${log.decoded ? '#44aaff' : colors.border}`,
                                                marginLeft: '10px',
                                                flexShrink: 0
                                            }}>
                                                <div 
                                                    onClick={() => log.decoded && toggleExpand(log.id)}
                                                    style={{ 
                                                        padding: '8px 15px', 
                                                        fontSize: '0.8rem', 
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '15px',
                                                        cursor: log.decoded ? 'pointer' : 'default'
                                                    }}
                                                    onMouseEnter={e => log.decoded && (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                                                    onMouseLeave={e => log.decoded && (e.currentTarget.style.background = 'transparent')}
                                                >
                                                    <span style={{ color: colors.textMuted, fontSize: '0.75rem', minWidth: '70px' }}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                                                    <span style={{ color: colors.isDark ? '#00ff80' : '#00a854', flex: 1, wordBreak: 'break-all', fontFamily: 'monospace', fontWeight: 500 }}>{log.raw}</span>
                                                    {log.decoded ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span style={{ 
                                                                background: '#44aaff', 
                                                                color: '#000', 
                                                                padding: '1px 8px', 
                                                                borderRadius: '4px', 
                                                                fontSize: '0.65rem', 
                                                                fontWeight: 900, 
                                                                boxShadow: '0 0 10px rgba(0,240,255,0.3)'
                                                            }}>
                                                                TYPE {log.decoded.msg_type ?? log.decoded.type} • {getAisMsgTypeName(log.decoded.msg_type ?? log.decoded.type)}
                                                            </span>
                                                            {expandedIds.has(log.id) ? <ChevronUp size={14} color={colors.textMuted} /> : <ChevronDown size={14} color={colors.textMuted} />}
                                                        </div>
                                                    ) : (
                                                        <span style={{ color: colors.textMuted, fontSize: '0.65rem', opacity: 0.5 }}>RAW</span>
                                                    )}
                                                </div>
                                                {expandedIds.has(log.id) && log.decoded && (
                                                    <div style={{ 
                                                        padding: '15px 20px 20px 50px', 
                                                        background: colors.isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)', 
                                                        borderTop: `1px solid ${colors.border}`,
                                                        fontSize: '0.85rem',
                                                        color: colors.textMain,
                                                        overflow: 'auto',
                                                        maxHeight: '400px'
                                                    }}>
                                                        <pre style={{ margin: 0, color: colors.isDark ? '#44aaff' : '#0066cc', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(log.decoded, null, 2)}</pre>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                <div style={{ 
                    padding: '15px 30px', 
                    background: colors.bgCard, 
                    borderTop: `1px solid ${colors.border}`, 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    fontSize: '0.85rem', 
                    color: colors.textMuted 
                }}>
                    <div style={{ display: 'flex', gap: '20px' }}>
                        <span>Buffers: <b>{logs.length} / 200</b> msgs</span>
                        <span>Filtered: <b>{filteredLogs.length}</b></span>
                    </div>
                    <button 
                        onClick={onClose} 
                        style={{ 
                            padding: '10px 25px', 
                            background: '#44aaff', 
                            color: '#000', 
                            border: 'none', 
                            borderRadius: '8px', 
                            fontWeight: 900, 
                            cursor: 'pointer',
                            boxShadow: '0 4px 15px rgba(0,240,255,0.2)',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,240,255,0.4)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,240,255,0.2)';
                        }}
                    >
                        Close Browser
                    </button>
                </div>
            </div>
        </div>
    );
}

