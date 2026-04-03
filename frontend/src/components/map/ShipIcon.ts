import L from 'leaflet';
import { getShipColor } from '../../utils/ais';

export function ShipIcon(sog: number | undefined, cog: number | undefined, mmsi: string, type?: number, shouldFlash?: boolean, shipScale: number = 1.0, circleScale: number = 1.0, isMeteo?: boolean, isAton?: boolean, atonType?: number, isEmergency?: boolean, virtualAton?: boolean, isNew?: boolean, isDark?: boolean, statusText?: string, hasAlert?: boolean, sartMode?: string | null, emergencyType?: string | null) {
    const isStationaryStatus = statusText && (statusText.toLowerCase().includes('anchor') || statusText.toLowerCase().includes('moored'));
    const isMoving = sog !== undefined && sog > 1.0 && cog !== undefined && !isStationaryStatus;
    const isAircraft = type === 9;

    // SART/MOB/EPIRB detection: check MMSI prefix OR explicit emergency flag
    const isSartDevice = emergencyType === 'AIS-SART' || emergencyType === 'MOB' || emergencyType === 'EPIRB' || mmsi.startsWith('970') || mmsi.startsWith('972') || mmsi.startsWith('974');

    const color = getShipColor(mmsi, type, isMeteo, isAton, isEmergency);
    const borderColor = '#000000';
    const strokeDash = virtualAton ? 'stroke-dasharray="2,2"' : '';
    const emergencyClass = isEmergency ? 'svg-emergency-pulse' : '';

    let svg = '';
    const baseHitArea = 24;
    const hitAreaSize = baseHitArea * Math.max(shipScale, circleScale, 1);

    if (isSartDevice) {
        // SART/MOB/EPIRB Icon: Red circle with cross (IMO standard)
        // Color: orange for TEST, blinking red for ACTIVE, red for default
        const sartColor = sartMode === 'test' ? '#f59e0b' : '#ff0000';
        const sartClass = sartMode === 'active' ? 'svg-emergency-pulse' : (sartMode === 'test' ? '' : 'svg-emergency-pulse');
        const size = 32 * shipScale;
        svg = `<svg width="${size}" height="${size}" viewBox="0 0 32 32" class="${sartClass}">
                 <circle cx="16" cy="16" r="14" fill="${sartColor}" stroke="#ffffff" stroke-width="2.5" />
                 <line x1="8" y1="8" x2="24" y2="24" stroke="#ffffff" stroke-width="3" stroke-linecap="round" />
                 <line x1="24" y1="8" x2="8" y2="24" stroke="#ffffff" stroke-width="3" stroke-linecap="round" />
               </svg>`;
    } else if (isAton) {
        // AtoN Icon: Lighthouse for fixed structures (1, 3, 5-20), Buoy for floating (21-31)
        const isFloating = atonType && atonType >= 21 && atonType <= 31;
        const size = (isFloating ? 24 : 32) * shipScale;
        if (isFloating) {
            // High-quality Buoy Icon
            svg = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" class="${emergencyClass}">
                     <filter id="buoy-shadow" x="-20%" y="-20%" width="140%" height="140%">
                       <feGaussianBlur in="SourceAlpha" stdDeviation="0.5" />
                       <feOffset dx="0.5" dy="0.5" result="offsetblur" />
                       <feComponentTransfer><feFuncA type="linear" slope="0.5"/></feComponentTransfer>
                       <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                     </filter>
                     <path d="M12,4 L15,8 L16,18 L8,18 L9,8 Z" fill="${color}" stroke="${borderColor}" stroke-width="1.2" ${strokeDash} filter="url(#buoy-shadow)" />
                     <path d="M6,18 L18,18" stroke="${borderColor}" stroke-width="2.5" stroke-linecap="round" />
                     <path d="M7,19 L17,19" stroke="${isDark ? '#444' : '#ccc'}" stroke-width="1" stroke-linecap="round" />
                     <circle cx="12" cy="4" r="2.5" fill="yellow" stroke="${borderColor}" stroke-width="0.5" class="svg-pulse" style="filter: drop-shadow(0 0 3px yellow);" />
                   </svg>`;
        } else {
            // High-quality Lighthouse Icon
            svg = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" class="${emergencyClass}">
                     <defs>
                       <linearGradient id="beam" x1="0%" y1="50%" x2="100%" y2="50%">
                         <stop offset="0%" style="stop-color:yellow;stop-opacity:0.6" />
                         <stop offset="100%" style="stop-color:yellow;stop-opacity:0" />
                       </linearGradient>
                     </defs>
                     <path d="M9,22 L15,22 L13,6 L11,6 Z" fill="${color}" stroke="${borderColor}" stroke-width="1.2" ${strokeDash} />
                     <rect x="10" y="4" width="4" height="3" fill="#333" stroke="${borderColor}" stroke-width="0.8" />
                     <path d="M12,2 L12,4" stroke="yellow" stroke-width="1.5" stroke-linecap="round" />
                     <circle cx="12" cy="5.5" r="1.5" fill="white" class="svg-pulse" />
                     <path d="M12,5.5 L20,3 L20,8 Z" fill="url(#beam)" class="svg-rotate-slow" style="transform-origin: 12px 5.5px;" />
                   </svg>`;
        }
    } else if (isMeteo) {
        // Weather Icon (Vindstrut/Wind sock)
        const size = 28 * shipScale;
        svg = `<svg width="${size}" height="${size}" viewBox="0 0 24 24">
                 <path d="M12,2 L12,22 M12,2 L21,5 L21,9 L12,12 M12,5 L19,6.2 L19,7.8 L12,9" fill="${color}" stroke="${borderColor}" stroke-width="1.5" stroke-linecap="round" />
                 <circle cx="12" cy="2" r="1.5" fill="${borderColor}" />
               </svg>`;
    } else if (isAircraft) {
        const rotation = cog !== undefined ? cog : 0;
        const size = 24 * shipScale;
        svg = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="transform: rotate(${rotation}deg);">
                 <circle cx="12" cy="12" r="11" fill="rgba(255, 0, 0, 0.8)" stroke="white" stroke-width="1.5" />
                 <path d="M21,16 L21,14 L14,10 L14,3.5 C14,2.67 13.33,2 12.5,2 C11.67,2 11,2.67 11,3.5 L11,10 L4,14 L4,16 L11,14 L11,19 L9,20.5 L9,22 L12.5,21 L16,22 L16,20.5 L14,19 L14,14 L21,16 Z" fill="white" />
               </svg>`;
    } else if (isMoving) {
        const size = 26 * shipScale;
        svg = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="transform: rotate(${cog}deg);" class="${emergencyClass}">
                 <polygon points="12,2 19,10 17,22 7,22 5,10" fill="${color}" stroke="${borderColor}" stroke-width="1.5"
                           />
               </svg>`;
    } else {
        const size = 16 * circleScale;
        svg = `<svg width="${size}" height="${size}" viewBox="0 0 16 16" class="${emergencyClass}">
                 <circle cx="8" cy="8" r="6" fill="${color}" stroke="${borderColor}" stroke-width="1.5"
                          />
               </svg>`;
    }

    // SART devices get highest z-index
    const zIndexStyle = isSartDevice ? 'z-index: 9999;' : '';

    return L.divIcon({
        html: `<div class="ship-custom-icon" style="display:flex; justify-content:center; align-items:center; width: 100%; height: 100%; position: relative; ${zIndexStyle}">
                 ${shouldFlash ? `<div class="ship-update-flash"></div>` : ''}
                 ${isNew ? `<div class="new-vessel-ping"></div>` : ''}
                 ${hasAlert ? `
                   <div style="position: absolute; top: -18px; left: 50%; transform: translateX(-50%); z-index: 20; animation: warning-flash 0.5s infinite alternate;">
                     <svg width="28" height="28" viewBox="0 0 24 24" fill="#ff0000" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 5px rgba(255,0,0,0.8));">
                       <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                       <line x1="12" y1="9" x2="12" y2="13" stroke="white"></line>
                       <line x1="12" y1="17" x2="12.01" y2="17" stroke="white"></line>
                     </svg>
                   </div>
                 ` : ''}
                 <div style="z-index: 1; display:flex;">${svg}</div>
               </div>`,
        className: 'ship-custom-icon-container',
        iconSize: [hitAreaSize, hitAreaSize],
        iconAnchor: [hitAreaSize / 2, hitAreaSize / 2],
        mmsi: mmsi
    } as any);
}

// Injected css
export const extraStyles = `
/* Custom Marker Cluster Styles */
.marker-cluster-small {
    background-color: rgba(0, 229, 255, 0.4);
}
.marker-cluster-small div {
    background-color: rgba(0, 229, 255, 0.8);
    color: #fff;
    font-weight: bold;
}

/* Pulse Highlight for Selected Ship */
@keyframes ship-pulse-anim {
    0% { transform: scale(1); opacity: 1; stroke-width: 2px; }
    50% { transform: scale(1.5); opacity: 0.5; stroke-width: 4px; }
    100% { transform: scale(2); opacity: 0; stroke-width: 1px; }
}
.ship-selection-pulse {
    animation: ship-pulse-anim 1.5s infinite;
    pointer-events: none;
}

.sidebar-selected-item {
    background: rgba(68, 170, 255, 0.15) !important;
    border-color: #44aaff !important;
    box-shadow: 0 0 10px rgba(68, 170, 255, 0.2);
}

.marker-cluster-medium {
    background-color: rgba(255, 171, 64, 0.4);
}
.marker-cluster-medium div {
    background-color: rgba(255, 171, 64, 0.8);
    color: #fff;
    font-weight: bold;
}
.marker-cluster-large {
    background-color: rgba(255, 82, 82, 0.4);
}
.marker-cluster-large div {
    background-color: rgba(255, 82, 82, 0.8);
    color: #fff;
    font-weight: bold;
}
.marker-cluster {
    background-clip: padding-box;
    border-radius: 20px;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    transition: all 0.3s ease-in-out;
}
.marker-cluster div {
    width: 30px;
    height: 30px;
    margin-left: 5px;
    margin-top: 5px;
    text-align: center;
    border-radius: 15px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
}
.leaflet-cluster-anim .marker-cluster {
    transition: transform 0.2s ease-out, opacity 0.2s ease-in;
}
.cluster-update-pulse {
    animation: cluster-pulse-anim 0.8s ease-out;
}
@keyframes cluster-pulse-anim {
    0% { box-shadow: 0 0 0px #00e5ff; border: 0px solid #00e5ff; }
    50% { box-shadow: 0 0 20px #00e5ff; border: 2px solid #00e5ff; }
    100% { box-shadow: 0 0 0px #00e5ff; border: 0px solid #00e5ff; }
}

.ship-custom-icon-container { background: transparent; border: none; }
.ship-custom-icon svg { filter: drop-shadow(0px 2px 3px rgba(0,0,0,0.4)); }

/* New Vessel Ping - Flash every 10s */
.new-vessel-ping {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 24px;
    height: 24px;
    margin-top: -12px;
    margin-left: -12px;
    border-radius: 50%;
    border: 3px solid #ffea00;
    box-sizing: border-box;
    animation: new-vessel-ping-anim 10s infinite;
    pointer-events: none;
    z-index: -1;
}

@keyframes new-vessel-ping-anim {
    0% { transform: scale(0.5); opacity: 0; border-width: 6px; }
    2% { transform: scale(0.5); opacity: 1; border-width: 6px; }
    10% { transform: scale(3.5); opacity: 0; border-width: 1px; }
    100% { transform: scale(3.5); opacity: 0; border-width: 1px; }
}

.ship-name-label {
    background: rgba(15, 15, 26, 0.8) !important;
    border: none !important;
    border-radius: 4px !important;
    box-shadow: 0 1px 3px rgba(0,0,0,0.5) !important;
    color: #fff !important;
    padding: 2px 6px !important;
    pointer-events: none !important;
}

/* Vessel Database Table Styles - Premium Revamp */
.db-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    margin-top: 5px;
}
.db-table th {
    text-align: left;
    padding: 14px 15px;
    background: linear-gradient(to bottom, rgba(30, 30, 45, 0.8), rgba(20, 20, 30, 0.9));
    color: rgba(255, 255, 255, 0.8);
    font-weight: 800;
    text-transform: uppercase;
    font-size: 0.65rem;
    letter-spacing: 1.5px;
    position: sticky;
    top: 0;
    z-index: 10;
    cursor: pointer;
    user-select: none;
    transition: all 0.2s;
    border-bottom: 1px solid rgba(68, 170, 255, 0.2);
}
.db-table th:hover {
    background: linear-gradient(to bottom, rgba(45, 45, 65, 0.9), rgba(30, 30, 45, 1));
    color: #44aaff;
}
.db-table td {
    padding: 12px 15px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.85rem;
}
.db-table tr:nth-child(even) {
    background: rgba(68, 170, 255, 0.05);
}
.db-table tr:hover {
    background: rgba(68, 170, 255, 0.12);
    backdrop-filter: blur(4px);
}
.light-theme .db-table th {
    background: linear-gradient(to bottom, #f1f5f9, #e2e8f0);
    color: #475569;
    border-bottom-color: #cbd5e1;
}
.light-theme .db-table tr:nth-child(even) {
    background: rgba(0, 102, 204, 0.06);
}
.light-theme .db-table td {
    color: #1e293b;
    border-bottom-color: #f1f5f9;
}
.db-sort-icon {
    display: inline-flex;
    margin-left: 6px;
    vertical-align: middle;
    transition: transform 0.2s;
}

/* Premium Badges */
.ship-badge {
    padding: 4px 10px;
    border-radius: 100px;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: inline-block;
}
.badge-type { background: rgba(68, 170, 255, 0.15); color: #44aaff; border: 1px solid rgba(68, 170, 255, 0.3); }
.badge-obs { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
.badge-mmsi { font-family: 'JetBrains Mono', monospace; background: rgba(255, 255, 255, 0.05); color: rgba(255,255,255,0.6); border: 1px solid rgba(255,255,255,0.1); }

.light-theme .badge-type { background: rgba(68, 170, 255, 0.1); color: #0066cc; border-color: rgba(68, 170, 255, 0.2); }
.light-theme .badge-obs { background: rgba(0, 153, 51, 0.1); color: #008822; border-color: rgba(0, 153, 51, 0.2); }
.light-theme .badge-mmsi { background: rgba(0, 0, 0, 0.05); color: rgba(0, 0, 0, 0.5); border-color: rgba(0, 0, 0, 0.1); }
.badge-mmsi { font-family: 'JetBrains Mono', monospace; background: rgba(255, 255, 255, 0.05); color: rgba(255,255,255,0.6); border: 1px solid rgba(255,255,255,0.1); }

.db-pagination-info {
    padding: 15px 30px;
    border-top: 1px solid rgba(255,255,255,0.05);
    color: rgba(255,255,255,0.5);
    font-size: 0.75rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

/* Detailed Custom Popup Styles */
.custom-detailed-popup .leaflet-popup-content-wrapper {
    padding: 0;
    overflow: hidden;
    border-radius: 8px;
    background: var(--bg-card);
    color: var(--text-main);
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
}
.custom-detailed-popup .leaflet-popup-content {
    margin: 0;
    width: 460px !important;
}
.custom-detailed-popup .leaflet-popup-tip {
    background: var(--bg-card);
}
.styled-button {
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid var(--border-color);
    background: transparent;
    color: var(--text-main);
}
.styled-button.primary {
    background: #0066cc;
    color: white;
    border: none;
}
.ship-update-flash {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 24px;
    height: 24px;
    margin-top: -12px;
    margin-left: -12px;
    border-radius: 50%;
    border: 2px solid #00e5ff;
    box-sizing: border-box;
    animation: radar-ping 0.8s cubic-bezier(0, 0, 0.2, 1) forwards;
    pointer-events: none;
    z-index: 0;
}

@keyframes radar-ping {
    0% { transform: scale(0.5); opacity: 1; border-width: 4px; }
    100% { transform: scale(3.5); opacity: 0; border-width: 1px; }
}

.blink-source {
    animation: blink-anim 0.4s ease-in-out;
}

@keyframes blink-anim {
    0% { transform: scale(1); filter: brightness(1) drop-shadow(0 0 0px #10b981); }
    50% { transform: scale(1.3); filter: brightness(2) drop-shadow(0 0 8px #10b981); }
    100% { transform: scale(1); filter: brightness(1) drop-shadow(0 0 0px #10b981); }
}

@keyframes slideUpFade {
    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

@keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
}

.ship-flash {
    animation: side-flash-pop 0.8s ease-out;
}
@keyframes side-flash-pop {
    0% { background-color: rgba(255, 255, 0, 0.6) !important; }
    100% { background-color: transparent; }
}
.svg-pulse {
    animation: svg-pulse-anim 2s infinite ease-in-out;
}
@keyframes svg-pulse-anim {
    0% { opacity: 0.5; stroke-width: 1px; }
    50% { opacity: 1; stroke-width: 3px; }
    100% { opacity: 0.5; stroke-width: 1px; }
}
.svg-emergency-pulse {
    animation: svg-emergency-pulse-anim 1s infinite alternate;
}
@keyframes svg-emergency-pulse-anim {
    from { filter: drop-shadow(0 0 2px #ff0000) drop-shadow(0 0 5px #ff0000); }
    to { filter: drop-shadow(0 0 8px #ff0000) drop-shadow(0 0 15px #ff0000); }
}
@keyframes emergency-flash {
    from { background-color: #ff0000; }
    to { background-color: #880000; }
}

/* Settings Modal Overhaul - REFINED */
.settings-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(15px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.3s ease-out;
}

.settings-modal {
    width: 1400px;
    height: 900px;
    max-width: 98vw;
    max-height: 95vh;
    background: #0f0f1a;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 24px;
    display: flex;
    overflow: hidden;
    box-shadow: 0 40px 80px -12px rgba(0, 0, 0, 0.9), 0 0 30px rgba(0, 240, 255, 0.15);
    animation: modalSlideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    color: #e0e0e0;
}

.settings-sidebar {
    width: 320px;
    background: #0a0a14;
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    padding: 28px 0;
}

.settings-sidebar-header {
    padding: 0 30px 20px 30px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    margin-bottom: 18px;
}

.settings-sidebar-title {
    font-size: 1.35rem;
    font-weight: 900;
    color: #44aaff;
    letter-spacing: -0.5px;
}

.settings-tab-sidebar-btn {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 30px;
    width: 100%;
    border: none;
    background: transparent;
    color: #8892b0;
    font-weight: 700;
    font-size: 0.95rem;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
}

.settings-tab-sidebar-btn:hover {
    background: rgba(255, 255, 255, 0.04);
    color: #fff;
}

.settings-tab-sidebar-btn.active {
    background: rgba(0, 240, 255, 0.1);
    color: #44aaff;
    border-right: 5px solid #44aaff;
}

.settings-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: #0f0f1a;
    overflow: hidden;
}

.settings-header {
    padding: 28px 42px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.01);
}

.settings-header-title {
    font-size: 1.85rem;
    font-weight: 900;
    margin: 0;
    color: #fff;
    letter-spacing: -1px;
}

.settings-header-desc {
    font-size: 0.95rem;
    color: #8892b0;
    margin-top: 8px;
}

.settings-scroll-area {
    flex: 1;
    padding: 28px 42px;
    overflow-y: auto;
}

.settings-card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 20px;
    padding: 24px;
    margin-bottom: 28px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
}

.settings-card-title {
    font-size: 0.75rem;
    font-weight: 900;
    text-transform: uppercase;
    color: #44aaff;
    letter-spacing: 2.5px;
    margin-bottom: 30px;
    display: flex;
    align-items: center;
    gap: 12px;
}

.settings-grid { display: grid; grid-template-columns: 1fr; gap: 30px; }
.settings-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }

.settings-footer {
    padding: 20px 42px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    justify-content: flex-end;
    gap: 18px;
    background: rgba(0, 0, 0, 0.3);
}

.btn-cancel-premium {
    background: transparent;
    border: 1.5px solid rgba(255, 255, 255, 0.2);
    color: #fff;
    padding: 12px 30px;
    border-radius: 10px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
}

.btn-cancel-premium:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.4);
}

.form-group-premium {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    padding-bottom: 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.form-group-premium:last-child { border-bottom: none; padding-bottom: 0; }
.form-group-premium.vertical { 
    flex-direction: column; 
    align-items: flex-start; 
    gap: 10px; 
}

.form-group-grid-item {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 0;
    border: none;
}

.label-desc-container {
    min-height: 40px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    width: 100%;
}

.form-group-premium label { font-size: 0.95rem; font-weight: 700; color: #fff; }
.form-group-premium .description { font-size: 0.75rem; color: #8892b0; margin-top: 6px; max-width: 600px; }

.input-premium, .select-premium {
    width: 300px;
    padding: 10px 16px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    font-size: 0.9rem;
    transition: all 0.2s;
}

/* Light Theme Overrides */
.settings-modal.light-theme { background: #fff; color: #1a1a2e; border-color: #e2e8f0; box-shadow: 0 40px 80px -12px rgba(0,0,0,0.1); }
.settings-modal.light-theme .settings-sidebar { background: #f8fafc; border-right-color: #e2e8f0; }
.settings-modal.light-theme .settings-tab-sidebar-btn { color: #64748b; }
.settings-modal.light-theme .settings-tab-sidebar-btn:hover { background: #f1f5f9; color: #0f172a; }
.settings-modal.light-theme .settings-tab-sidebar-btn.active { background: #e0f2fe; color: #0284c7; border-right-color: #0284c7; }
.settings-modal.light-theme .settings-main { background: #fff; }
.settings-modal.light-theme .settings-header { background: #fcfdfe; border-bottom-color: #e2e8f0; }
.settings-modal.light-theme .settings-header-title { color: #0f172a; }
.settings-modal.light-theme .settings-card { background: #fdfdfe; border-color: #cbd5e1; box-shadow: 0 4px 15px rgba(0,0,0,0.08); }
.settings-modal.light-theme .input-premium, .settings-modal.light-theme .select-premium { background: #ffffff; border-color: #94a3b8; color: #0f172a; }
.settings-modal.light-theme .form-group-premium label { color: #0f172a; }
.settings-modal.light-theme .settings-header-desc, .settings-modal.light-theme .description { color: #475569; }
.settings-modal.light-theme .settings-footer { background: #f1f5f9; border-top-color: #cbd5e1; }
.settings-modal.light-theme .btn-cancel-premium { color: #334155; border-color: #94a3b8; }
.settings-modal.light-theme .btn-cancel-premium:hover { background: #e2e8f0; border-color: #64748b; }

/* Toggle Switch */
.switch { position: relative; display: inline-block; width: 54px; height: 30px; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider {
    position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
    background-color: #222; transition: .4s; border-radius: 30px;
}
.light-theme .slider { background-color: #cbd5e1; }
.slider:before {
    position: absolute; content: ""; height: 24px; width: 24px; left: 3px; bottom: 3px;
    background-color: white; transition: .4s; border-radius: 50%;
}
input:checked + .slider { background-color: #44aaff; }
.light-theme input:checked + .slider { background-color: #0284c7; }
input:checked + .slider:before { transform: translateX(24px); }

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes modalSlideUp { from { transform: translateY(60px) scale(0.97); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }

@keyframes emergency-flash-alt {
    from { background: #ff0000; box-shadow: 0 0 5px #ff0000; }
    to { background: #990000; box-shadow: 0 0 20px #ff0000; }
}
@keyframes pulse-angry-red {
    0% { background: #ff0000; transform: scale(1); box-shadow: 0 0 0px #ff0000; }
    50% { background: #ff5555; transform: scale(1.05); box-shadow: 0 0 15px #ff0000; }
    100% { background: #ff0000; transform: scale(1); box-shadow: 0 0 0px #ff0000; }
}
`;

