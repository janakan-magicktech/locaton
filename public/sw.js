const CACHE = 'find-my-location-v1'
const TILE_HOSTS = [
  'tiles.openfreemap.org',
  'maps.geoapify.com',
  'tile.openstreetmap.org',
  'server.arcgisonline.com',
  'basemaps.cartocdn.com',
]

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  )
  self.clients.claim()
})

function isTile(url) {
  return TILE_HOSTS.some((h) => url.includes(h))
}

function isRoute(url) {
  return url.includes('routing.openstreetmap.de')
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = request.url
  if (!isTile(url) && !isRoute(url)) return

  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(request, copy))
        }
        return res
      })
      .catch(() =>
        caches.open(CACHE).then((c) => c.match(request)).then((m) => m || Response.error()),
      ),
  )
})
