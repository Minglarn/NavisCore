import React, { useState, useEffect, useMemo } from 'react';
import { PolarArea, Line, Bar, Doughnut } from 'react-chartjs-2';
import { BarChart2, Calendar, ChevronLeft, ChevronRight, TrendingUp, X } from 'lucide-react';
import { getShipTypeName, getShipColor } from '../../utils/ais';
import { getCountryName, getFlagEmoji } from '../../utils/countries';
import { formatDistance, formatSpeed, getTimeAgo } from '../../utils/geo';

function ChartCard({ title, children, colors }: any) {
    return (
        <div style={{ 
            background: colors.bgCard, 
            borderRadius: '16px', 
            padding: '24px', 
            border: `1px solid ${colors.border}`, 
            display: 'flex', 
            flexDirection: 'column', 
            boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
            height: '100%',
            overflow: 'hidden'
        }}>
            <h3 style={{ 
                margin: '0 0 20px 0', 
                fontSize: '1.1rem', 
                fontWeight: 800, 
                color: colors.textMain,
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
            }}>
                {title}
            </h3>
            <div style={{ width: '100%', flex: 1, position: 'relative', minHeight: '250px' }}>
                {children}
            </div>
        </div>
    );
}


export default function StatisticsModal({ isOpen, onClose, colors, isMobile }: any) {
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [timeRange, setTimeRange] = useState<'7d' | '30d' | '1y'>('30d');
    const [stats, setStats] = useState<any>(null);
    const [channelStats, setChannelStats] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            const isDev = window.location.port === '5173';
            const statsPath = isDev ? `http://127.0.0.1:8080/api/statistics?date=${selectedDate}` : `/api/statistics?date=${selectedDate}`;
            const channelPath = isDev ? `http://127.0.0.1:8080/api/channel_stats` : `/api/channel_stats`;

            Promise.all([
                fetch(statsPath).then(r => r.json()),
                fetch(channelPath).then(r => r.json())
            ])
            .then(([statsData, channelData]) => {
                setStats(statsData);
                setChannelStats(channelData);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch statistics", err);
                setLoading(false);
            });
        }
    }, [isOpen, selectedDate]);

    if (!isOpen) return null;

    const allHistory = stats?.history_30d || [];
    const historyFiltered = timeRange === '7d' 
        ? allHistory.slice(-7) 
        : timeRange === '1y' 
            ? allHistory 
            : allHistory.slice(-30);
            
    const hourlyBreakdown = stats?.hourly_breakdown || [];
    const typeBreakdown = stats?.type_breakdown || [];

    // Summary Card colors
    const chartColors = [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', 
        '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9', '#ec4899'
    ];

    // 1. History (Messages & Vessels)
    const historyData = {
        labels: historyFiltered.map((h: any) => h.date.split('-').slice(1).join('/')),
        datasets: [
            {
                label: 'Vessels',
                data: historyFiltered.map((h: any) => h.unique_ships),
                backgroundColor: '#36A2EB',
                borderRadius: 4,
                yAxisID: 'y',
            },
            {
                label: 'Messages',
                data: historyFiltered.map((h: any) => h.total_messages),
                backgroundColor: '#4BC0C088',
                borderRadius: 4,
                yAxisID: 'y1',
            }
        ]
    };

    const historyOptions: any = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { 
            legend: { 
                position: 'top' as const,
                labels: { color: colors.textMain, usePointStyle: true, boxWidth: 8 }
            } 
        },
        scales: { 
            y: { 
                type: 'linear' as const, display: true, position: 'left' as const,
                title: { display: true, text: 'Vessels', color: colors.textMuted },
                grid: { color: colors.border }, ticks: { color: colors.textMuted } 
            },
            y1: { 
                type: 'linear' as const, display: true, position: 'right' as const,
                title: { display: true, text: 'Messages', color: colors.textMuted },
                grid: { drawOnChartArea: false }, ticks: { color: colors.textMuted } 
            },
            x: { grid: { display: false }, ticks: { color: colors.textMuted } } 
        }
    };

    // 2. Ship Type Breakdown (Doughnut)
    const typeData = {
        labels: typeBreakdown.map((t: any) => t.label),
        datasets: [{
            data: typeBreakdown.map((t: any) => t.count),
            backgroundColor: chartColors,
            borderWidth: 0,
            hoverOffset: 15
        }]
    };

    const doughnutOptions: any = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
            legend: {
                position: 'right' as const,
                labels: {
                    color: colors.textMain,
                    padding: 20,
                    font: { size: 11 },
                    usePointStyle: true
                }
            }
        }
    };

    // 3. Hourly Messages (Area Chart)
    const hourlyData = {
        labels: hourlyBreakdown.map((h: any) => `${h.hour}:00`),
        datasets: [{
            label: 'Messages',
            data: hourlyBreakdown.map((h: any) => h.count),
            borderColor: '#0ea5e9',
            backgroundColor: 'rgba(14, 165, 233, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: '#0ea5e9'
        }]
    };

    const hourlyOptions: any = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { 
            y: { beginAtZero: true, grid: { color: colors.border }, ticks: { color: colors.textMuted } },
            x: { grid: { display: false }, ticks: { color: colors.textMuted } }
        }
    };
    
    // 4. Station Range (Area Chart)
    const rangeData = {
        labels: historyFiltered.map((h: any) => h.date.split('-').slice(1).join('/')),
        datasets: [{
            label: 'Station Max Range (nm)',
            data: historyFiltered.map((h: any) => (Number(h.max_range_km || 0) * 0.539957).toFixed(1)),
            borderColor: '#ff00ff',
            backgroundColor: 'rgba(255, 0, 255, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: '#ff00ff'
        }]
    };

    const rangeOptions: any = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { 
            y: { 
                beginAtZero: true, 
                title: { display: true, text: 'Nautical Miles (nm)', color: colors.textMuted },
                grid: { color: colors.border }, ticks: { color: colors.textMuted } 
            },
            x: { grid: { display: false }, ticks: { color: colors.textMuted } }
        }
    };

    return (
        <div className="settings-modal-overlay" onClick={onClose} style={{ zIndex: 3000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
            <div className="settings-modal" onClick={e => e.stopPropagation()} style={{ 
                width: isMobile ? '100vw' : '95vw', 
                height: isMobile ? '100vh' : '92vh',
                maxWidth: '1400px',
                padding: '0',
                display: 'flex',
                flexDirection: 'column',
                background: colors.bgMain === '#ffffff' ? '#f8fafc' : colors.bgMain, // Light blue-ish background for depth
                border: `1px solid ${colors.border}`,
                borderRadius: '24px',
                overflow: 'hidden'
            }}>
                {/* Header Area */}
                <div className="modal-header" style={{ background: colors.bgCard, borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 className="modal-title" style={{ margin: 0, fontWeight: 900, color: colors.textMain, letterSpacing: '-0.5px' }}>Statistics & Analysis</h1>
                        <div className="modal-sub-title" style={{ color: colors.textMuted, fontSize: '1rem', marginTop: '4px' }}>Analyze historical data and system performance metrics.</div>
                    </div>
                    
                    <button onClick={onClose} style={{ background: colors.bgMain, border: `1px solid ${colors.border}`, cursor: 'pointer', padding: '12px', borderRadius: '12px', color: colors.textMuted, transition: 'all 0.2s' }}>
                        <X size={24} />
                    </button>
                </div>
                
                {/* Dashboard Scroll View */}
                <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                        
                        {/* Controls Row */}
                        <div className="stats-controls-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '20px' }}>
                            {/* Time Range Selector */}
                            <div className="stats-control-card" style={{ background: colors.bgCard, padding: '24px', borderRadius: '16px', border: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: colors.textMain }}>History Range</h2>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: colors.textMuted }}>For trending charts</p>
                                </div>
                                <div style={{ display: 'flex', background: colors.bgApp, borderRadius: '8px', padding: '4px' }}>
                                    {[ {v:'7d', l:'Week'}, {v:'30d', l:'Month'}, {v:'1y', l:'Year'} ].map(t => (
                                        <button 
                                            key={t.v}
                                            onClick={() => setTimeRange(t.v as any)}
                                            style={{
                                                background: timeRange === t.v ? 'rgba(68,170,255,0.2)' : 'transparent',
                                                color: timeRange === t.v ? '#44aaff' : colors.textMuted,
                                                border: 'none', padding: '8px 16px', borderRadius: '6px',
                                                cursor: 'pointer', fontWeight: 700, transition: 'all 0.2s'
                                            }}
                                        >
                                            {t.l}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Select Date Card */}
                            <div className="stats-control-card" style={{ background: colors.bgCard, padding: '24px', borderRadius: '16px', border: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: colors.textMain }}>Select Date</h2>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: colors.textMuted }}>Viewing data for {selectedDate}</p>
                                </div>
                                <div style={{ position: 'relative', width: '220px' }}>
                                    <Calendar size={18} style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', color: colors.textMuted, pointerEvents: 'none' }} />
                                    <input 
                                        type="date" 
                                        value={selectedDate}
                                        onChange={(e) => setSelectedDate(e.target.value)}
                                        style={{ 
                                            width: '100%',
                                            padding: '12px 45px 12px 15px', borderRadius: '12px',
                                            border: `1px solid ${colors.border}`, fontSize: '1rem', outline: 'none', 
                                            color: colors.textMain, background: colors.bgMain,
                                            cursor: 'pointer',
                                            fontWeight: 600
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '100px 0', flex: 1 }}>
                                <div className="spinner"></div>
                                <div style={{ marginTop: '20px', color: colors.textMuted, fontSize: '1.1rem' }}>Aggregating data...</div>
                            </div>
                        ) : (
                            <>
                                {/* Middle Row Grid */}
                                <div className="stats-charts-grid" style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr', gap: '30px' }}>
                                    <ChartCard title="Messages & Vessels History" colors={colors}>
                                        <Bar data={historyData} options={historyOptions} />
                                    </ChartCard>
                                    
                                    <ChartCard title="Ship types (Total)" colors={colors}>
                                        {typeBreakdown.length > 0 ? (
                                            <Doughnut data={typeData} options={doughnutOptions} />
                                        ) : (
                                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.textMuted }}>
                                                No data available
                                            </div>
                                        )}
                                    </ChartCard>
                                </div>

                                {/* Bottom Row Wide Charts */}
                                <div className="stats-charts-grid-equal" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', minHeight: '350px' }}>
                                    <ChartCard title="Station Range History (nm)" colors={colors} style={{ height: '350px' }}>
                                        <Line data={rangeData} options={rangeOptions} />
                                    </ChartCard>
                                    
                                    <ChartCard title="Messages per Hour (Selected Day)" colors={colors} style={{ height: '350px' }}>
                                        <Line data={hourlyData} options={hourlyOptions} />
                                    </ChartCard>
                                </div>

                                {/* Range per Channel */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '30px' }}>
                                    <ChartCard title="Maximum Range per AIS Channel (All-time Record)" colors={colors}>
                                        <div className="stats-table-container" style={{ padding: '0 0', overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', color: colors.textMain, minWidth: '600px' }}>
                                                <thead>
                                                    <tr style={{ borderBottom: `2px solid ${colors.border}`, textAlign: 'left' }}>
                                                        <th style={{ padding: '12px 8px', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Channel</th>
                                                        <th style={{ padding: '12px 8px', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>MMSI</th>
                                                        <th style={{ padding: '12px 8px', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Ship Name</th>
                                                        <th style={{ padding: '12px 8px', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Ship Type</th>
                                                        <th style={{ padding: '12px 8px', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Max Range (nm)</th>
                                                        <th style={{ padding: '12px 8px', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Max Range (km)</th>
                                                        <th style={{ padding: '12px 8px', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Last Record Seen</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {channelStats.length > 0 ? (
                                                        channelStats.map((cs, idx) => (
                                                            <tr key={idx} style={{ borderBottom: `1px solid ${colors.border}44`, transition: 'background 0.2s' }}>
                                                                <td style={{ padding: '15px 8px', fontWeight: 800, color: '#44aaff' }}>{cs.channel_id}</td>
                                                                <td style={{ padding: '15px 8px', fontFamily: 'monospace', color: colors.textMuted }}>{cs.mmsi || 'N/A'}</td>
                                                                <td style={{ padding: '15px 8px', fontWeight: 700 }}>{cs.name || 'Unknown'}</td>
                                                                <td style={{ padding: '15px 8px', fontSize: '0.85rem', color: colors.textMuted }}>{getShipTypeName(String(cs.mmsi), cs.ship_type)}</td>
                                                                <td style={{ padding: '15px 8px', fontWeight: 700 }}>{(cs.max_range_km * 0.539957).toFixed(2)} nm</td>
                                                                <td style={{ padding: '15px 8px', color: colors.textMuted }}>{Number(cs.max_range_km).toFixed(2)} km</td>
                                                                <td style={{ padding: '15px 8px', fontSize: '0.9rem', color: colors.textMuted }}>{cs.last_seen}</td>
                                                            </tr>
                                                        ))
                                                    ) : (
                                                        <tr>
                                                            <td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: colors.textMuted }}>No channel range data available. Collecting records...</td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </ChartCard>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}


