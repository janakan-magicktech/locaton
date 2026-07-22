# Find My Location — Technical Workflow Report

## 1. Overview

**Find My Location** is an online-only, browser-based React application that lets a user pin geographic points, save them locally, and navigate back to them with live GPS tracking. It has no offline mode — map tiles, routing, and connectivity are all assumed to require the internet.

**Stack:** React + Vite · MapLibre GL JS (maps) · sql.js/SQLite-in-WebAssembly persisted to IndexedDB (storage) · OSRM public demo API (routing) · browser Geolocation + Permissions APIs (location).

---

## 2. Architecture (layered)

| Layer | Files | Responsibility |
|-------|-------|----------------|
| **Entry** | `main.jsx`, `index.html` | Mount React, load global CSS + MapLibre CSS |
| **Orchestration** | `App.jsx` | Holds all app state, decides which screen renders, drives the tracking loop |
| **Hooks** | `useOnlineStatus`, `useDatabase`, `useGeolocation` | Reusable stateful logic bound to browser APIs |
| **Services** | `db.js`, `routing.js`, `geolocation.js` | Side-effect boundaries (SQLite, OSRM fetch, GPS) |
| **Utils** | `geo.js` | Pure math — Haversine distance, bearing, formatting |
| **Components** | `MapView`, `OfflineGate`, `PermissionGate`, `SaveLocationForm`, `SavedLocationsList`, `RouteChoiceDialog`, `TrackingPanel` | Presentational UI |

The design principle is **one-directional flow**: browser APIs → hooks → `App.jsx` state → presentational components. Components never touch the database or GPS directly; they receive data and callbacks as props.

---

## 3. Startup gate sequence

`App.jsx` renders as a chain of guards, each blocking until satisfied. The app content never mounts until all pass:

```
1. Online?        NO → OfflineGate (blocking message + Retry)
       │ yes
2. DB ready?      ERROR → storage-error screen
       │          LOADING → spinner "Loading local database…"
       │ ready
3. Location       denied  → PermissionGate (address-bar instructions)
   granted +      prompt  → PermissionGate ("Enable location access")
   have a fix?
       │ yes
4. ── Main app (map + sidebar) ──
```

- **Connectivity** (`useOnlineStatus`) reads `navigator.onLine` and subscribes to `online`/`offline` events; the Retry button re-reads the flag.
- **Database** (`useDatabase`) runs `initDb()` once on mount.
- **Permission** (`useGeolocation`) uses the Permissions API to track `granted | denied | prompt` reactively, and `getCurrentPosition` to obtain the first fix.

---

## 4. Data persistence workflow (sql.js + IndexedDB)

SQLite runs entirely in the browser via WebAssembly; there is no server.

**Initialization (`initDb`):**
1. Load the sql.js wasm (bundled, version-matched asset via `?url`).
2. Read the saved database bytes from IndexedDB (key `db-file`), if any.
3. Open the DB from those bytes, or create a fresh one.
4. Run `CREATE TABLE IF NOT EXISTS` for the schema.

**Schema:**

| Table | Columns |
|-------|---------|
| `saved_locations` | `id, name, latitude, longitude, notes, created_at` |
| `recorded_routes` | `id, saved_location_id (FK), latitude, longitude, timestamp` |

**The persistence guarantee:** after *every* write (`saveLocation`, `recordRoutePoint`, `deleteSavedLocation`), `persist()` exports the whole DB to a `Uint8Array` and writes it back to IndexedDB. This is why data survives page reloads.

```
write → db.run(INSERT/DELETE) → db.export() → idbPut('db-file', bytes)
```

---

## 5. Pin & save workflow

Two entry points produce a `pendingPin` `{latitude, longitude, isCurrent}`:

- **"Pin current location"** → `getCurrentPosition()` returns the user's fix.
- **Clicking the map** → MapLibre's click event supplies `lngLat`.

The pin renders a marker and opens `SaveLocationForm` (name + notes, both optional). On submit → `saveLocation()` inserts a row, persists to IndexedDB, and the saved list refreshes.

---

## 6. Navigation start workflow

Selecting a saved location opens `RouteChoiceDialog` with two modes:

| Mode | Source | Line color |
|------|--------|-----------|
| **Follow Previous Path** | Replays the breadcrumb trail from `recorded_routes` (enabled only if `hasRecordedRoute` is true) | Purple |
| **Use Shortest Path** | Live fetch from OSRM | Blue |

**Shortest-path routing (`routing.js`):**
```
GET https://router.project-osrm.org/route/v1/driving/
    {lng1},{lat1};{lng2},{lat2}?overview=full&geometries=geojson
```
The response's `routes[0].geometry.coordinates` — an array of `[lng, lat]` pairs — feeds directly into the MapLibre route line source. (OSRM expects **longitude first**, which the service handles.)

---

## 7. Live tracking workflow

This is the core loop, orchestrated in `App.jsx`. `beginTracking()` seeds the session and calls `startWatch()`, which wraps `navigator.geolocation.watchPosition`. **On every position update:**

```
new GPS fix
   ├─ remaining = haversineMeters(current, destination)      // recalculated each tick
   ├─ bearing   = bearingDegrees(previousFix, current)       // travel direction
   ├─ accuracy  = position.coords.accuracy                   // GPS uncertainty
   ├─ recordRoutePoint(...)  → INSERT breadcrumb + persist   // feeds future replays
   ├─ update MapLibre: current marker, destination marker, route line
   └─ if remaining ≤ 20 m → REACHED
```

The `TrackingPanel` HUD shows remaining distance, GPS accuracy (±m), and heading (compass + degrees) in real time.

**Destination reached (threshold = 20 m):**
1. `stopWatch()` calls `clearWatch` to cleanly end the subscription.
2. The panel displays: *"You have reached your saved location successfully."*

Every fix logged during tracking becomes future "Follow Previous Path" data — so the second trip to a place can replay the exact recorded trail.

---

## 8. Key design decisions & trade-offs

- **Whole-DB export on each write** — simple and correct for this data scale; would need incremental persistence only at much larger volumes.
- **Bundled wasm over CDN** — guarantees the wasm version matches the installed `sql.js` (1.14.1). *This was the fix for the earlier white-screen bug:* excluding sql.js from Vite pre-bundling left it as un-transformed UMD, crashing module load before CSS applied.
- **Routing isolated in one service** — swapping OSRM for GraphHopper/OpenRouteService is a single-file change.
- **Presentational components are stateless** — all side effects live in hooks/services, making the UI easy to test and reason about.

---

## 9. Constraints

- **HTTPS required** in deployment — the Geolocation API only runs in a secure context (`localhost` is exempt for dev).
- **No offline capability** by design — no tile cache, no offline routing, no GPS-only fallback.
- **OSRM demo API** is rate-limited and not for production traffic.
