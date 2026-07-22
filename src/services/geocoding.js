// -----------------------------------------------------------------------------
// Online forward geocoding via the OpenStreetMap Nominatim API.
//   Docs: https://nominatim.org/release-docs/latest/api/Search/
//   Endpoint used:
//     GET https://nominatim.openstreetmap.org/search
//         ?q={query}&format=jsonv2&addressdetails=1&limit=5
//
// Turns a manually typed destination (address / place name) into one or more
// candidate points the map can auto-mark.
//
// Response shape (trimmed):
//   [
//     {
//       "place_id": 123,
//       "lat": "12.9716",           // strings, not numbers
//       "lon": "77.5946",
//       "display_name": "Bengaluru, Karnataka, India",
//       ...
//     },
//     ...
//   ]
//
// Nominatim's usage policy asks for an identifying value and no more than one
// request per second — this app searches only on explicit user submit, which
// stays well within that limit.
// -----------------------------------------------------------------------------

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search'

// Geocode a free-text destination into candidate locations.
// `query` is the raw string the user typed.
// Returns [{ label, latitude, longitude }, ...] (possibly empty).
export async function geocodeDestination(query) {
  const q = query.trim()
  if (!q) return []

  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '5',
  })
  const url = `${NOMINATIM_BASE}?${params.toString()}`

  const res = await fetch(url, {
    headers: {
      // Nominatim's policy requires identifying the application.
      'Accept-Language': navigator.language || 'en',
    },
  })
  if (!res.ok) {
    throw new Error(`Address lookup failed (HTTP ${res.status})`)
  }

  const data = await res.json()
  if (!Array.isArray(data)) return []

  return data
    .map((item) => ({
      label: item.display_name,
      latitude: Number.parseFloat(item.lat),
      longitude: Number.parseFloat(item.lon),
    }))
    .filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
}
