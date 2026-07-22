// -----------------------------------------------------------------------------
// Online routing via the OSRM public demo API.
//   Docs: https://project-osrm.org/docs/v5.24.0/api/
//   Endpoint used:
//     GET https://router.project-osrm.org/route/v1/driving/
//         {lng1},{lat1};{lng2},{lat2}?overview=full&geometries=geojson
//
// Note: OSRM expects coordinates as lng,lat (longitude first).
//
// Response shape (trimmed):
//   {
//     "code": "Ok",
//     "routes": [
//       {
//         "distance": 1234.5,          // meters
//         "duration": 320.1,           // seconds
//         "geometry": {                // GeoJSON LineString (geometries=geojson)
//           "type": "LineString",
//           "coordinates": [[lng, lat], [lng, lat], ...]
//         }
//       }
//     ],
//     "waypoints": [ ... ]
//   }
// -----------------------------------------------------------------------------

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving'

// Fetch the shortest driving route between two points.
// `from` and `to` are { latitude, longitude }.
// Returns { coordinates: [[lng,lat],...], distance, duration } for MapLibre.
export async function fetchShortestRoute(from, to) {
  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson&steps=false`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Routing request failed (HTTP ${res.status})`)
  }

  const data = await res.json()
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(`No route found (OSRM code: ${data.code})`)
  }

  const route = data.routes[0]
  return {
    coordinates: route.geometry.coordinates, // [lng, lat] pairs
    distance: route.distance, // meters
    duration: route.duration, // seconds
  }
}
