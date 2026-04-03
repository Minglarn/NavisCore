import React, { useEffect } from 'react';

export default function ContextMenu({ x, y, options, onClose, colors, isDark }: any) {
    useEffect(() => {
        const handleClick = () => onClose();
        window.addEventListener('click', handleClick);
        window.addEventListener('scroll', handleClick);
        return () => {
            window.removeEventListener('click', handleClick);
            window.removeEventListener('scroll', handleClick);
        };
    }, [onClose]);

    return (
        <div 
            style={{
                position: 'fixed',
                left: x,
                top: y,
                background: colors.bgCard,
                border: `1px solid ${colors.border}`,
                borderRadius: '10px',
                padding: '6px 0',
                zIndex: 10000,
                boxShadow: isDark ? '0 10px 25px rgba(0,0,0,0.6)' : '0 10px 25px rgba(0,0,0,0.15)',
                minWidth: '180px',
                backdropFilter: 'blur(10px)',
                animation: 'contextFadeIn 0.15s ease-out'
            }}
            onClick={e => e.stopPropagation()}
        >
            {options.map((opt: any, i: number) => (
                <div
                    key={i}
                    onClick={() => { opt.onClick(); onClose(); }}
                    style={{
                        padding: '10px 16px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        fontSize: '0.9rem',
                        color: opt.danger ? '#ff5555' : colors.textMain,
                        transition: 'background 0.2s',
                        borderBottom: opt.separator ? `1px solid ${colors.border}` : 'none',
                        marginBottom: opt.separator ? '6px' : '0'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                    <span style={{ color: opt.danger ? '#ff5555' : colors.accent, display: 'flex' }}>{opt.icon}</span>
                    <span style={{ fontWeight: 500 }}>{opt.label}</span>
                </div>
            ))}
        </div>
    );
}
