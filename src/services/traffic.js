// Pedestrian traffic / congestion estimates (free heuristic — no paid API).
// Foot routing ignores vehicle traffic; this surfaces area-busyness for UX parity.

const LK_URBAN_BBOX = { minLat: 6.7, maxLat: 7.1, minLon: 79.8, maxLon: 80.0 }

function isUrbanSriLanka(lat, lon) {
  return (
    lat >= LK_URBAN_BBOX.minLat &&
    lat <= LK_URBAN_BBOX.maxLat &&
    lon >= LK_URBAN_BBOX.minLon &&
    lon <= LK_URBAN_BBOX.maxLon
  )
}

function rushHourFactor(date = new Date()) {
  const h = date.getHours()
  const weekday = date.getDay()
  const isWeekday = weekday >= 1 && weekday <= 5
  if (!isWeekday) return 1
  if ((h >= 7 && h <= 9) || (h >= 17 && h <= 19)) return 1.35
  if ((h >= 12 && h <= 14) || (h >= 15 && h <= 16)) return 1.15
  return 1
}

export function estimateTraffic({ latitude, longitude, durationSeconds, distanceMeters }) {
  const urban = isUrbanSriLanka(latitude, longitude)
  const factor = urban ? rushHourFactor() : 1
  const baseDuration = durationSeconds || (distanceMeters / 1000 / 4.5) * 3600
  const adjusted = baseDuration * factor

  let level = 'clear'
  let label = 'Clear for walking'
  if (factor >= 1.3) {
    level = 'moderate'
    label = urban ? 'Moderate foot traffic — busy roads nearby' : 'Moderate conditions'
  } else if (factor >= 1.1) {
    level = 'light'
    label = 'Light congestion in the area'
  }

  return {
    level,
    label,
    delaySeconds: Math.round(adjusted - baseDuration),
    adjustedDurationSeconds: Math.round(adjusted),
    factor,
  }
}

// GeoJSON line segments colored by estimated congestion along the route.
export function trafficOverlaySegments(coordinates, { level = 'clear' } = {}) {
  if (!coordinates?.length || coordinates.length < 2) return []
  const color =
    level === 'moderate' ? '#e5534b' : level === 'light' ? '#e3b341' : '#34d399'
  const features = []
  for (let i = 0; i < coordinates.length - 1; i++) {
    features.push({
      type: 'Feature',
      properties: { color, congestion: level },
      geometry: { type: 'LineString', coordinates: [coordinates[i], coordinates[i + 1]] },
    })
  }
  return features
}

export function streetViewUrl(latitude, longitude) {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${latitude},${longitude}`
}

export function streetViewEmbedUrl(latitude, longitude) {
  return `https://maps.google.com/maps?q=&layer=c&cbll=${latitude},${longitude}&cbp=11,0,0,0,0&output=svembed`
}
