# Find My Location

An **online-only** browser web app (React + Vite) to pin, save, and navigate
back to locations. It renders maps with **MapLibre GL JS**, stores data locally
in **sql.js** (SQLite-in-WebAssembly) persisted to **IndexedDB**, and computes
routes with the **OSRM public demo API**.

> This is a pure web app. There is **no** offline map cache, **no** offline
> routing engine, and **no** GPS-only fallback — internet connectivity is
> always required.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to dist/
```

Geolocation requires a **secure context**: `localhost` works, and any deployed
copy must be served over **HTTPS**.

## How it works

### Connectivity gate
`useOnlineStatus` reads `navigator.onLine` and listens for `online`/`offline`
events. When offline, `OfflineGate` blocks the whole app with a retry button —
the map and tracking UI never mount without connectivity.

### Location permission
`useGeolocation` uses the Permissions API (`navigator.permissions.query`) to
track `granted | denied | prompt`, and `navigator.geolocation.getCurrentPosition`
to request a fix. On denial, `PermissionGate` explains how to re-enable access
via the browser's address-bar lock icon.

### Local storage (sql.js + IndexedDB)
`src/services/db.js` loads the sql.js wasm (from the CDN — online-only app),
restores the saved database bytes from IndexedDB, and creates two tables:

| table             | columns                                                        |
|-------------------|----------------------------------------------------------------|
| `saved_locations` | `id, name, latitude, longitude, notes, created_at`             |
| `recorded_routes` | `id, saved_location_id (FK), latitude, longitude, timestamp`   |

After **every write** the whole DB is exported to a `Uint8Array` and written
back to IndexedDB (`persist()`), so data survives page reloads.

### Map (MapLibre GL JS)
`MapView.jsx` uses an online **OSM raster** tile style. It renders a current
location marker, a destination marker, and a route line (GeoJSON source),
fitting bounds to the route.

### Routing (OSRM demo API)
`src/services/routing.js` calls:

```
GET https://router.project-osrm.org/route/v1/driving/{lng1},{lat1};{lng2},{lat2}?overview=full&geometries=geojson
```

Response (trimmed):

```json
{
  "code": "Ok",
  "routes": [
    { "distance": 1234.5, "duration": 320.1,
      "geometry": { "type": "LineString", "coordinates": [[lng, lat], ...] } }
  ]
}
```

`route.geometry.coordinates` (an array of `[lng, lat]`) feeds straight into the
MapLibre line source.

### Live tracking
Selecting a saved location opens `RouteChoiceDialog`:

- **Follow Previous Path** — replays the breadcrumb trail from `recorded_routes`
  (enabled only when one exists).
- **Use Shortest Path** — fetches a fresh OSRM route.

Tracking then uses `navigator.geolocation.watchPosition` to update in real time:
current marker, remaining distance (**Haversine**, `src/utils/geo.js`), GPS
accuracy, and bearing (from consecutive fixes). Every fix is inserted into
`recorded_routes` for future replays.

### Destination reached
When the Haversine remaining distance drops below **20 meters**, tracking stops
automatically via `clearWatch`, and the app shows:

> You have reached your saved location successfully.

## Project structure

```
src/
├── main.jsx                  app entry
├── App.jsx                   orchestration + render gates
├── App.css / index.css       styles
├── services/
│   ├── db.js                 sql.js + IndexedDB persistence + queries
│   ├── routing.js            OSRM demo API integration
│   └── geolocation.js        Geolocation + Permissions API wrappers
├── hooks/
│   ├── useOnlineStatus.js    connectivity
│   ├── useDatabase.js        DB init lifecycle
│   └── useGeolocation.js     permission + watchPosition
├── utils/
│   └── geo.js                Haversine, bearing, formatting
└── components/
    ├── OfflineGate.jsx
    ├── PermissionGate.jsx
    ├── MapView.jsx
    ├── SaveLocationForm.jsx
    ├── SavedLocationsList.jsx
    ├── RouteChoiceDialog.jsx
    └── TrackingPanel.jsx
```

## Configuration knobs

- **Reached threshold** — `REACHED_THRESHOLD_M` in `src/App.jsx` (default `20`).
- **Routing provider** — swap `src/services/routing.js` for GraphHopper /
  OpenRouteService if desired.
