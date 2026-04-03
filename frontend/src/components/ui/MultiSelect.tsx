import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export const MultiSelect = ({ label, options, selected, onChange, colors, isDark }: { 
    label: string, 
    options: { value: string, label: string }[], 
    selected: string[], 
    onChange: (values: string[]) => void,
    colors: any,
    isDark: boolean
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };


        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const isAllSelected = selected.includes('all') || (selected.length === options.length - 1 && !selected.includes('all'));

    const toggleOption = (val: string) => {
        if (val === 'all') {
            if (isAllSelected) {
                onChange([]); // Deselect all
            } else {
                onChange(['all']); // Select all (using virtual 'all')
            }
        } else {
            let newSelected: string[];
            if (selected.includes('all')) {
                // If 'all' is active, and we click an individual item, 
                // it means we want all EXCEPT that item.
                newSelected = options
                    .map(o => o.value)
                    .filter(v => v !== 'all' && v !== val);
            } else {
                newSelected = [...selected];
                if (newSelected.includes(val)) {
                    newSelected = newSelected.filter(v => v !== val);
                } else {
                    newSelected.push(val);
                }
                
                // If we've manually checked everything, switch back to 'all' for clean state
                if (newSelected.length === options.length - 1) {
                    newSelected = ['all'];
                }
            }
            onChange(newSelected);
        }
    };

    const selectOnly = (e: React.MouseEvent, val: string) => {
        e.stopPropagation();
        onChange([val]);
    };

    const displayText = selected.includes('all') 
        ? label 
        : (selected.length === 0
            ? 'None selected'
            : (selected.length === 1 
                ? options.find(o => o.value === selected[0])?.label 
                : `${selected.length} selected`));

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
            <div 
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    background: isDark ? 'rgba(0,0,0,0.2)' : '#fff',
                    color: (selected.includes('all') || selected.length === 0) ? colors.textMuted : colors.textMain,
                    border: `1px solid ${isOpen ? '#44aaff' : colors.border}`,
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.2s',
                    minHeight: '32px',
                    boxSizing: 'border-box'
                }}
            >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayText}</span>
                <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
            </div>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 1050,
                    marginTop: '4px',
                    background: isDark ? '#1a1a2e' : '#fff',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '8px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                    maxHeight: '350px',
                    overflowY: 'auto',
                    padding: '4px'
                }}>
                    {options.map((opt, idx) => {
                        const isChecked = selected.includes('all') || selected.includes(opt.value);
                        return (
                            <div 
                                key={opt.value}
                                onClick={() => toggleOption(opt.value)}
                                className="multiselect-option"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '8px 10px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    background: isChecked ? (isDark ? 'rgba(68,170,255,0.15)' : '#f0f9ff') : 'transparent',
                                    color: isChecked ? '#44aaff' : colors.textMain,
                                    fontSize: '0.8rem',
                                    transition: 'all 0.1s',
                                    group: 'option'
                                } as any}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                    <div style={{
                                        width: '14px',
                                        height: '14px',
                                        borderRadius: '3px',
                                        border: `1.5px solid ${isChecked ? '#44aaff' : colors.textMuted}`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: isChecked ? '#44aaff' : 'transparent',
                                        transition: 'all 0.1s',
                                        flexShrink: 0
                                    }}>
                                        {isChecked && <Check size={10} color="#fff" strokeWidth={4} />}
                                    </div>
                                    <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                        {opt.value === 'all' ? `(Select All)` : opt.label}
                                    </span>
                                </div>
                                {opt.value !== 'all' && (
                                    <button
                                        onClick={(e) => selectOnly(e, opt.value)}
                                        className="only-button"
                                        style={{
                                            fontSize: '0.65rem',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                            border: 'none',
                                            color: colors.textMuted,
                                            cursor: 'pointer',
                                            opacity: 0,
                                            transition: 'opacity 0.2s'
                                        }}
                                    >
                                        Only
                                    </button>
                                )}
                            </div>
                        );
                    })}
                    <style>{`
                        .multiselect-option:hover .only-button { opacity: 1 !important; }
                        .only-button:hover { background: #44aaff !important; color: white !important; }
                    `}</style>
                </div>
            )}
        </div>
    );
};

