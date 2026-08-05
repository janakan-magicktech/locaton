// Keeps the user's last known GPS fix in memory and sessionStorage so search
// always biases towards where they actually are (Pick Me / Uber style).

const STORAGE_KEY = 'find-my-location:last-position'
const MAX_AGE_MS = 30 * 60 * 1000 // 30 minutes

let memoryPosition = null
let memoryAreaLabel = null

export function setUserLocation(point) {
  if (!point?.latitude || !point?.longitude) return
  memoryPosition = {
    latitude: point.latitude,
    longitude: point.longitude,
    accuracy: point.accuracy ?? null,
    timestamp: point.timestamp ?? Date.now(),
  }
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...memoryPosition, areaLabel: memoryAreaLabel }),
    )
  } catch {
    /* private browsing / quota */
  }
}

export function setUserAreaLabel(label) {
  memoryAreaLabel = label || null
  if (memoryPosition) {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...memoryPosition, areaLabel: memoryAreaLabel }),
      )
    } catch {
      /* ignore */
    }
  }
}

export function getUserLocation() {
  if (memoryPosition) return memoryPosition
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.latitude || !parsed?.longitude) return null
    if (Date.now() - (parsed.timestamp || 0) > MAX_AGE_MS) return null
    memoryPosition = parsed
    memoryAreaLabel = parsed.areaLabel || null
    return parsed
  } catch {
    return null
  }
}

export function getUserAreaLabel() {
  if (memoryAreaLabel) return memoryAreaLabel
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    memoryAreaLabel = parsed.areaLabel || null
    return memoryAreaLabel
  } catch {
    return null
  }
}
