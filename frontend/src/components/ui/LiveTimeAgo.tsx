import React, { useState, useEffect } from 'react';

export const LiveTimeAgo = ({ timestamp, colors, style = {} }: { timestamp: number, colors: any, style?: React.CSSProperties }) => {
    const [now, setNow] = useState(Date.now());
    
    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 10000);
        return () => clearInterval(interval);
    }, [timestamp]);

    const diff = Math.max(0, now - timestamp);
    const seconds = Math.floor(diff / 1000);
    
    if (seconds < 5) return <span style={{ color: '#10b981', fontWeight: 'bold', ...style }}>Now</span>;
    
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    
    if (m >= 60) return <span style={style}>{Math.floor(m / 60)}h {m % 60}m</span>;
    
    return <span style={style}>{m > 0 ? `${m}m ` : ''}{s}s</span>;
};
