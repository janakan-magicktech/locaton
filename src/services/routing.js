// -----------------------------------------------------------------------------
// Online WALKING routing via OSRM, hosted by FOSSGIS.
//   Docs: https://project-osrm.org/docs/v5.24.0/api/
//   Endpoint used:
//     GET https://routing.openstreetmap.de/routed-foot/route/v1/foot/
//         {lng1},{lat1};{lng2},{lat2}?overview=full&geometries=geojson
//
// Why not router.project-osrm.org? That public demo server hosts ONLY the car
// profile. Requesting /route/v1/foot/ there does not error — it silently
// returns the driving answer, so you get car geometry (one-ways obeyed,
// footpaths and pedestrian shortcuts ignored) and a car ETA. Measured on the
// same 1.9 km trip: the demo server reported 196 s (~35 km/h) for both
// profiles, while this foot server reports 1502 s (~4.5 km/h).
//
// FOSSGIS runs these servers for the OSM community free of charge under a fair
// use policy — fine for an app that routes on explicit user action, not for
// bulk querying.
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

const OSRM_BASE = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot'

// Fetch the fastest walking route between two points.
//
// The foot profile routes over footways, paths, steps and pedestrian areas, and
// ignores one-way restrictions that only bind vehicles — so it will happily
// send you down a lane a car would have to drive around. We ask for
// `alternatives` so OSRM proposes a few distinct routes, then explicitly pick
// the one with the lowest `duration`, returning the rest so the UI can offer
// choices.
//
// Durations assume a constant ~4.5 km/h walking pace: no traffic model, and no
// allowance for gradient, crowds or waiting at crossings. Treat the ETA as a
// flat-ground estimate.
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
    `?overview=full&geometries=geojson&steps=true` +
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

  const parseSteps = (route) =>
    (route.legs?.[0]?.steps || []).map((s) => ({
      distance: s.distance,
      duration: s.duration,
      name: s.name || '',
      maneuver: s.maneuver,
      rotary_name: s.rotary_name,
      exit: s.exit,
    }))

  const toRoute = (r) => ({
    coordinates: r.geometry.coordinates, // [lng, lat] pairs
    distance: r.distance, // meters
    duration: r.duration, // seconds
    steps: parseSteps(r),
  })

  return {
    ...toRoute(fastest),
    alternatives: rest.map(toRoute),
  }
}
