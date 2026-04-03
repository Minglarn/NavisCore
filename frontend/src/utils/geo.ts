export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const toRad = (x: number) => x * Math.PI / 180;
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
    const toRad = (x: number) => x * Math.PI / 180;
    const toDeg = (x: number) => x * 180 / Math.PI;

    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
        Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    let brng = toDeg(Math.atan2(y, x));
    return (brng + 360) % 360;
}

// Unit Helpers
export function formatSpeed(knots: number | undefined, units: string) {
    if (knots === undefined || knots === null) return '--';
    if (units === 'metric') {
        return `${(knots * 1.852).toFixed(1)} km/h`;
    }
    return `${knots.toFixed(1)} kn`;
}

export function formatDistance(km: number | undefined, units: string) {
    if (km === undefined || km === null) return '--';
    if (units === 'metric') {
        return `${km.toFixed(1)} km`;
    }
    return `${(km / 1.852).toFixed(1)} nm`;
}

export function getTimeAgo(timestamp: number) {
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Now';
    if (diffMins < 60) return `${diffMins}min`;
    const diffHours = Math.floor(diffMins / 60);
    const remainingMins = diffMins % 60;
    if (diffHours < 24) return `${diffHours}h ${remainingMins}m`;
    return `${Math.floor(diffHours / 24)}d`;
}


export function calculateDestinationPoint(lat: number, lon: number, distance: number, bearing: number) {
    const toRad = (x: number) => x * Math.PI / 180;
    const toDeg = (x: number) => x * 180 / Math.PI;
    const R = 6371; // km

    const d = distance / R;
    const brng = toRad(bearing);
    const lat1 = toRad(lat);
    const lon1 = toRad(lon);

    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) +
        Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
    const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
        Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));

    return [toDeg(lat2), toDeg(lon2)];
}
