// Geospatial math utilities. Coordinates are [lng, lat] where noted (MapLibre
// order) or passed as separate lat/lng numbers (function signatures make this
// explicit).

const R = 6371000 // Earth mean radius in meters

const toRad = (deg) => (deg * Math.PI) / 180
const toDeg = (rad) => (rad * 180) / Math.PI

// Haversine great-circle distance between two lat/lng points, in METERS.
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// Initial bearing (compass heading, 0-360°, 0 = North) from point 1 to point 2.
export function bearingDegrees(lat1, lng1, lat2, lng2) {
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const Δλ = toRad(lng2 - lng1)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

// 16-point compass label for a bearing, e.g. 47 -> "NE".
export function compassLabel(bearing) {
  const dirs = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
  ]
  return dirs[Math.round(bearing / 22.5) % 16]
}

// Format a distance in meters for display.
export function formatDistance(meters) {
  if (meters == null || Number.isNaN(meters)) return '—'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(2)} km`
}
