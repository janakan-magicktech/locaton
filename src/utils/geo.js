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

// Project a point onto the line segment A->B and return the closest point on
// it. Uses a local equirectangular approximation (longitude scaled by cos(lat))
// so the math is plain 2D geometry — accurate at the scale of a single route
// segment, which is all we need.
// Returns { t, lng, lat }, where t in [0,1] is how far along A->B the foot of
// the perpendicular falls (clamped to the segment's ends).
function projectOntoSegment(lng, lat, aLng, aLat, bLng, bLat) {
  const kx = Math.cos(toRad(lat)) // meters-per-degree ratio, lng vs lat
  // Segment endpoints relative to the query point.
  const ax = (aLng - lng) * kx
  const ay = aLat - lat
  const dx = (bLng - aLng) * kx
  const dy = bLat - aLat
  const lenSq = dx * dx + dy * dy
  // Minimize |A + t*D|^2  ->  t = -(A·D) / |D|^2
  let t = lenSq === 0 ? 0 : -(ax * dx + ay * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return { t, lng: aLng + (bLng - aLng) * t, lat: aLat + (bLat - aLat) * t }
}

// Snap a live GPS position onto a route polyline.
//
// `coords` is [[lng,lat],...]. `fromIndex` restricts the search to segments at
// or after that index, so progress only ever moves forward — without it, a
// route that doubles back near its own start can snap backwards and "un-travel"
// part of the line.
//
// Returns { index, point: [lng,lat], distanceMeters }, where `index` is the
// segment the position fell on. Null for a degenerate route.
export function snapToRoute(coords, lat, lng, fromIndex = 0) {
  if (!coords || coords.length < 2) return null
  const start = Math.max(0, Math.min(fromIndex, coords.length - 2))
  let best = null
  for (let i = start; i < coords.length - 1; i++) {
    const [aLng, aLat] = coords[i]
    const [bLng, bLat] = coords[i + 1]
    const p = projectOntoSegment(lng, lat, aLng, aLat, bLng, bLat)
    const d = haversineMeters(lat, lng, p.lat, p.lng)
    if (!best || d < best.distanceMeters) {
      best = { index: i, point: [p.lng, p.lat], distanceMeters: d }
    }
  }
  return best
}

// Cumulative ground distance (meters) from the route start to a snapped
// position. Collapses "where am I on this route" to a single scalar, which is
// what lets a caller keep progress strictly monotonic: comparing segment
// indices alone cannot tell forward drift from backward drift within one
// segment.
export function routeProgressMeters(coords, snap) {
  if (!snap || !coords?.length) return 0
  let m = 0
  for (let i = 0; i < snap.index; i++) {
    m += haversineMeters(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0])
  }
  const [aLng, aLat] = coords[snap.index]
  return m + haversineMeters(aLat, aLng, snap.point[1], snap.point[0])
}

// Total polyline length and remaining distance ahead of a snap — used to decide
// whether a freshly calculated route is shorter than the one being followed.
export function routeTotalMeters(coords) {
  if (!coords || coords.length < 2) return 0
  let m = 0
  for (let i = 0; i < coords.length - 1; i++) {
    m += haversineMeters(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0])
  }
  return m
}

export function routeRemainingMeters(coords, snap) {
  if (!coords || coords.length < 2) return Infinity
  if (!snap) return routeTotalMeters(coords)
  return Math.max(0, routeTotalMeters(coords) - routeProgressMeters(coords, snap))
}

// The part of `coords` still ahead of the traveller: the snapped position
// itself, followed by every vertex after the segment it landed on. Drawing this
// instead of the full route is what makes the line shrink behind the dot.
export function routeAhead(coords, snap) {
  if (!snap) return coords
  return [snap.point, ...coords.slice(snap.index + 1)]
}

// Format a distance in meters for display.
export function formatDistance(meters) {
  if (meters == null || Number.isNaN(meters)) return '—'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(2)} km`
}
