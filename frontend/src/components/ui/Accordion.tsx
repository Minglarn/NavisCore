import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export function Accordion({ title, children, isOpen, setIsOpen, colors }: any) {
    return (
        <div style={{ borderBottom: `1px solid ${colors.border}` }}>
            <div 
                onClick={setIsOpen} 
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: colors.bgSidebar, cursor: 'pointer' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#44aaff', fontWeight: 800, fontSize: '0.85rem' }}>
                    {title}
                </div>
                {isOpen ? <ChevronUp size={18} color="#44aaff" /> : <ChevronDown size={18} color="#44aaff" />}
            </div>
            {isOpen && (
                <div style={{ padding: '0', background: colors.bgCard }}>
                    {children}
                </div>
            )}
        </div>
    );
}

export function AccordionRow({ label, value, labelIcon, colors, onDoubleClick }: any) {
    return (
        <div 
            onDoubleClick={onDoubleClick}
            style={{ display: 'flex', flexDirection: 'column', padding: '10px 16px', borderBottom: `1px solid ${colors.border}88`, cursor: onDoubleClick ? 'cell' : 'default' }}
        >
            <span style={{ fontSize: '0.65rem', color: colors.textMuted, fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                {labelIcon} {label}
            </span>
            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: colors.textMain }}>{value}</span>
        </div>
    );
}

