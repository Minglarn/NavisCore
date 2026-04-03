import React from 'react';

export default function Toggle({ checked, onChange }: { checked: boolean, onChange: (val: boolean) => void }) {
    return (
        <label className="switch">
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
            <span className="slider"></span>
        </label>
    );
}

