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

// Fetch the fastest driving route between two points.
//
// OSRM's cost model already minimizes *travel time* across the whole road
// network — it will route through smaller lanes/side roads when they are
// quicker, not just along main roads. We additionally ask for `alternatives`
// so OSRM proposes a few distinct routes, then explicitly pick the one with the
// lowest `duration` (fastest), returning the rest so the UI can offer choices.
//
// NOTE: the free public OSRM demo uses *static* free-flow speeds — it has no
// live traffic data. Genuinely traffic-aware "avoid congestion" routing needs a
// keyed provider (Mapbox driving-traffic, TomTom, HERE); swapping providers is
// a single-file change here.
//
// `from` and `to` are { latitude, longitude }.
// Returns:
//   {
//     coordinates: [[lng,lat],...],  // fastest route geometry (for MapLibre)
//     distance,                      // meters
//     duration,                      // seconds (estimated travel time)
//     alternatives: [{ coordinates, distance, duration }, ...]  // slower options
//   }
export async function fetchShortestRoute(from, to) {
  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`
  const url =
    `${OSRM_BASE}/${coords}` +
    `?overview=full&geometries=geojson&steps=false` +
    `&alternatives=3&annotations=duration,distance`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Routing request failed (HTTP ${res.status})`)
  }

  const data = await res.json()
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(`No route found (OSRM code: ${data.code})`)
  }

  // Sort every proposed route by estimated travel time (fastest first) so we
  // always navigate the least-time option, regardless of which order OSRM
  // returned them in.
  const ranked = [...data.routes].sort((a, b) => a.duration - b.duration)
  const [fastest, ...rest] = ranked

  const toRoute = (r) => ({
    coordinates: r.geometry.coordinates, // [lng, lat] pairs
    distance: r.distance, // meters
    duration: r.duration, // seconds
  })

  return {
    ...toRoute(fastest),
    alternatives: rest.map(toRoute),
  }
}
