// Offline map tile + route caching via Cache API (no change to route consumption).
const CACHE_NAME = 'find-my-location-v1'
const TILE_PATTERNS = [
  /tiles\.openfreemap\.org/,
  /maps\.geoapify\.com/,
  /tile\.openstreetmap\.org/,
  /server\.arcgisonline\.com/,
  /basemaps\.cartocdn\.com/,
]
const ROUTE_PATTERN = /routing\.openstreetmap\.de/

export async function registerOfflineServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    return true
  } catch {
    return false
  }
}

export function isTileRequest(url) {
  return TILE_PATTERNS.some((re) => re.test(url))
}

export function isRouteRequest(url) {
  return ROUTE_PATTERN.test(url)
}

export async function cacheResponse(url, response) {
  if (!('caches' in window)) return
  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(url, response.clone())
  } catch {
    /* quota or privacy mode */
  }
}

export async function getCachedResponse(url) {
  if (!('caches' in window)) return null
  const cache = await caches.open(CACHE_NAME)
  return cache.match(url)
}

const ROUTE_STORE_KEY = 'fml_cached_routes'

export function saveRouteCache(key, payload) {
  try {
    const all = JSON.parse(localStorage.getItem(ROUTE_STORE_KEY) || '{}')
    all[key] = { ...payload, savedAt: Date.now() }
    localStorage.setItem(ROUTE_STORE_KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

export function loadRouteCache(key) {
  try {
    const all = JSON.parse(localStorage.getItem(ROUTE_STORE_KEY) || '{}')
    return all[key] || null
  } catch {
    return null
  }
}

export async function prefetchMapStyle(styleUrl) {
  try {
    const res = await fetch(styleUrl)
    if (res.ok) await cacheResponse(styleUrl, res)
  } catch {
    /* offline later */
  }
}

export async function getOfflineCacheStats() {
  if (!('caches' in window)) return { tiles: 0 }
  const cache = await caches.open(CACHE_NAME)
  const keys = await cache.keys()
  const tiles = keys.filter((r) => isTileRequest(r.url)).length
  return { tiles, total: keys.length }
}
