// Thin wrappers around the browser Geolocation API + Permissions API.
// No native modules, no offline fallback — pure web app.

const GEO_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0,
}

// Query the current permission state via the Permissions API when available.
// Resolves to 'granted' | 'denied' | 'prompt' | 'unknown'.
export async function queryPermissionState() {
  if (!('permissions' in navigator) || !navigator.permissions?.query) {
    return 'unknown'
  }
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' })
    return status.state // 'granted' | 'denied' | 'prompt'
  } catch {
    return 'unknown'
  }
}

// Subscribe to permission-state changes. Returns an unsubscribe function.
export async function onPermissionChange(callback) {
  if (!('permissions' in navigator) || !navigator.permissions?.query) {
    return () => {}
  }
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' })
    const handler = () => callback(status.state)
    status.addEventListener('change', handler)
    return () => status.removeEventListener('change', handler)
  } catch {
    return () => {}
  }
}

// One-shot current position. Rejects with the GeolocationPositionError.
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation is not supported by this browser'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, GEO_OPTIONS)
  })
}

// Start watching position. Returns the watch id for clearWatch().
export function watchPosition(onUpdate, onError) {
  return navigator.geolocation.watchPosition(onUpdate, onError, GEO_OPTIONS)
}

export function clearWatch(watchId) {
  if (watchId != null) navigator.geolocation.clearWatch(watchId)
}

// Normalize a GeolocationPosition into a plain object.
export function toPoint(position) {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy, // meters
    heading: position.coords.heading, // may be null
    timestamp: position.timestamp,
  }
}
