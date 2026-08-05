import { useCallback, useEffect, useRef, useState } from 'react'
import MapView from './components/MapView.jsx'
import OfflineGate from './components/OfflineGate.jsx'
import PermissionGate from './components/PermissionGate.jsx'
import SaveLocationForm from './components/SaveLocationForm.jsx'
import SavedLocationsList from './components/SavedLocationsList.jsx'
import DestinationSearch from './components/DestinationSearch.jsx'
import RouteChoiceDialog from './components/RouteChoiceDialog.jsx'
import TrackingPanel from './components/TrackingPanel.jsx'
import { useOnlineStatus } from './hooks/useOnlineStatus.js'
import { useDatabase } from './hooks/useDatabase.js'
import { useGeolocation } from './hooks/useGeolocation.js'
import {
  clearRecordedRoute,
  deleteSavedLocation,
  getRecordedRoute,
  getSavedLocations,
  hasRecordedRoute,
  recordRoutePoint,
  saveLocation,
} from './services/db.js'
import { fetchShortestRoute } from './services/routing.js'
import {
  bearingDegrees,
  haversineMeters,
  routeAhead,
  routeProgressMeters,
  snapToRoute,
} from './utils/geo.js'
import './App.css'

// Distance (meters) below which we consider the destination "reached".
// User-selectable; detection is pure Haversine distance, so it is independent
// of walking vs driving and works at any of these thresholds.
const THRESHOLD_OPTIONS = [10, 20, 50]
const DEFAULT_THRESHOLD_M = 10

// How far off the drawn route (meters) a fix may be and still count as being
// "on" it. Beyond this the user has left the route (or the fix is bad), so we
// stop consuming the line rather than snapping to some far-off segment and
// erasing most of it in one jump.
//
// Walking needs this scaled to the reported GPS accuracy rather than fixed: a
// pedestrian genuinely walks within a few meters of the footway, so a loose
// fixed value would keep consuming the line even after you wander off, while a
// tight one would stall on any urban fix with a ±30 m error circle.
const OFF_ROUTE_MIN_M = 25
const offRouteLimit = (accuracy) =>
  Math.max(OFF_ROUTE_MIN_M, (accuracy || 0) * 2)

// Segments to re-search behind the last match. Forward-only snapping would
// otherwise let one jittery fix around a corner strand progress on the wrong
// segment permanently; a small look-back lets it recover.
const ROUTE_LOOKBACK_SEGMENTS = 3

// Minimum ground distance (meters) between the two fixes used for a heading.
// At a walking pace of ~1.3 m/s, consecutive watchPosition fixes are barely a
// meter apart — well inside GPS noise — so deriving a bearing from them yields
// a randomly spinning compass. Holding the previous anchor until the user has
// actually covered this much makes the heading stable.
//
// Scaled by accuracy for the same reason as offRouteLimit: with a +/-20 m error
// circle, two fixes taken standing still routinely differ by more than a fixed
// 12 m, so a constant gate stops filtering anything exactly when the signal is
// worst.
const MIN_BEARING_MOVE_M = 12
const bearingMoveLimit = (accuracy) =>
  Math.max(MIN_BEARING_MOVE_M, (accuracy || 0) * 1.5)

export default function App() {
  const { online, recheck } = useOnlineStatus()
  const { ready: dbReady, error: dbError } = useDatabase()
  const {
    permission,
    position,
    error: geoError,
    requestOnce,
    startWatch,
    stopWatch,
  } = useGeolocation()

  // UI/data state.
  const [locations, setLocations] = useState([])
  const [pendingPin, setPendingPin] = useState(null) // {latitude, longitude, isCurrent, label?}
  const [flyTo, setFlyTo] = useState(null) // [lng, lat] the map should recenter on
  const [selectedForRoute, setSelectedForRoute] = useState(null) // saved location awaiting mode choice
  const [routeError, setRouteError] = useState(null)
  const [loadingRoute, setLoadingRoute] = useState(false)

  // Reached threshold (meters). A ref mirrors it so the long-lived
  // watchPosition callback always reads the current value without re-binding.
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD_M)
  const thresholdRef = useRef(threshold)
  useEffect(() => {
    thresholdRef.current = threshold
  }, [threshold])

  // Active tracking session.
  const [tracking, setTracking] = useState(null)
  // tracking shape:
  // { location, mode, routeCoordinates, remaining, bearing, reached }
  const prevPointRef = useRef(null) // for bearing calc between updates
  // False until the first new breadcrumb of a recording trip has replaced the
  // old trail. Deferring the wipe to the first fix means a trip that never
  // gets a GPS fix leaves any existing saved path intact.
  const trailClearedRef = useRef(false)
  // How far along the route the user has been confirmed to travel:
  // { index } is the matched segment, { meters } the distance from the route
  // start. Kept as a ratchet — see the commit check in onPositionDuringTracking.
  const routeProgressRef = useRef({ index: 0, meters: -1 })
  // Bumped once per navigation session. MapView fits the viewport to the route
  // when this changes — not when the coordinates change, which is now every
  // single GPS fix.
  const routeKeyRef = useRef(0)

  const refreshLocations = useCallback(() => {
    if (dbReady) setLocations(getSavedLocations())
  }, [dbReady])

  useEffect(() => {
    refreshLocations()
  }, [refreshLocations])

  // Live "you" marker: as soon as permission is granted, watch position
  // continuously so the blue dot follows real movement — not just during a
  // navigation session. A tracking session installs its own watch (which
  // replaces this one and still updates `position`); stopTracking() resumes
  // this background watch afterwards.
  //
  // `tracking` is intentionally NOT a dependency: tracking manages the watch
  // itself, and re-running this effect on tracking changes would tear down the
  // tracking watch mid-session.
  useEffect(() => {
    if (permission !== 'granted') return
    startWatch()
    return () => stopWatch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission, startWatch, stopWatch])

  // --- pin / save -----------------------------------------------------------

  const pinCurrentLocation = async () => {
    try {
      const point = await requestOnce()
      setPendingPin({ ...point, isCurrent: true })
    } catch {
      /* handled via geoError / permission gate */
    }
  }

  const handleMapClick = useCallback(
    (lngLat) => {
      if (tracking) return // don't hijack clicks while navigating
      setPendingPin({
        latitude: lngLat.lat,
        longitude: lngLat.lng,
        isCurrent: false,
      })
    },
    [tracking],
  )

  // A destination the user typed and picked from search results. Drop it as a
  // pending pin (the map auto-marks it via the `destination` prop) and fly the
  // map to it so the auto-placed marker is visible.
  const handleManualDestination = useCallback((result) => {
    setPendingPin({
      latitude: result.latitude,
      longitude: result.longitude,
      isCurrent: false,
      label: result.label,
    })
    setFlyTo([result.longitude, result.latitude])
  }, [])

  const handleSave = async ({ name, notes }) => {
    await saveLocation({
      name,
      notes,
      latitude: pendingPin.latitude,
      longitude: pendingPin.longitude,
    })
    setPendingPin(null)
    refreshLocations()
  }

  const handleDelete = async (id) => {
    await deleteSavedLocation(id)
    refreshLocations()
  }

  // --- tracking orchestration ------------------------------------------------

  // Compute derived tracking values for a new position + record breadcrumb.
  const onPositionDuringTracking = useCallback(
    (point, session) => {
      const { location, savedLocationId, mode } = session

      // Remaining distance via Haversine.
      const remaining = haversineMeters(
        point.latitude,
        point.longitude,
        location.latitude,
        location.longitude,
      )

      // Bearing from the last anchor to the current point (travel direction).
      // The anchor only advances once the user has actually moved
      // MIN_BEARING_MOVE_M; until then we keep showing the previous heading
      // rather than recomputing one from pure GPS jitter.
      let bearing = null
      const prev = prevPointRef.current
      if (prev) {
        const moved = haversineMeters(
          prev.latitude,
          prev.longitude,
          point.latitude,
          point.longitude,
        )
        if (moved >= bearingMoveLimit(point.accuracy)) {
          bearing = bearingDegrees(
            prev.latitude,
            prev.longitude,
            point.latitude,
            point.longitude,
          )
          prevPointRef.current = point
        }
      } else {
        prevPointRef.current = point
      }

      // Log the breadcrumb for future "Follow Previous Path" — only while on a
      // real outbound trip. Replaying a saved path ('previous') must NOT
      // re-record, or the stored trail gets polluted with every replay.
      if (mode !== 'previous') {
        // First fix of this trip replaces the old trail so the saved path is
        // exactly the most recent journey, not a mix of every trip.
        if (!trailClearedRef.current) {
          clearRecordedRoute(savedLocationId)
          trailClearedRef.current = true
        }
        recordRoutePoint({
          savedLocationId,
          latitude: point.latitude,
          longitude: point.longitude,
        })
      }

      // Consume the travelled part of the route so the drawn line shrinks
      // behind the dot, leaving only the road still ahead — the same way a
      // turn-by-turn app eats its route line as you drive it.
      let ahead = null
      const full = session.routeCoordinates
      if (full && full.length > 1) {
        const from = Math.max(
          0,
          routeProgressRef.current.index - ROUTE_LOOKBACK_SEGMENTS,
        )
        const snap = snapToRoute(full, point.latitude, point.longitude, from)
        if (snap && snap.distanceMeters <= offRouteLimit(point.accuracy)) {
          // Ratchet: commit only forward movement. At walking pace the
          // traveller lingers near a segment boundary for many fixes, and GPS
          // noise makes the nearest-segment match oscillate across it — without
          // this guard the drawn line visibly grows back a few meters between
          // fixes. Progress is derived from the absolute position each time
          // (not accumulated), so the ratchet can lead reality by at most the
          // along-track GPS error, and never drifts further.
          const progressed = routeProgressMeters(full, snap)
          if (progressed > routeProgressRef.current.meters) {
            routeProgressRef.current = { index: snap.index, meters: progressed }
            ahead = routeAhead(full, snap)
          }
        }
      }

      const reached = remaining <= thresholdRef.current

      setTracking((t) =>
        t
          ? {
              ...t,
              remaining,
              // Keep the last good heading while the user is between anchors.
              bearing: bearing ?? t.bearing,
              accuracy: point.accuracy,
              reached,
              ...(ahead ? { routeCoordinates: ahead } : null),
            }
          : t,
      )

      // Destination reached: stop the watch cleanly.
      if (reached) {
        stopWatch()
      }
    },
    [stopWatch],
  )

  const beginTracking = useCallback(
    (location, mode, routeCoordinates) => {
      prevPointRef.current = null
      trailClearedRef.current = false
      routeProgressRef.current = { index: 0, meters: -1 }
      routeKeyRef.current += 1
      const session = {
        location,
        savedLocationId: location.id,
        mode,
        routeCoordinates, // pristine full route; the drawn copy gets trimmed
      }

      // Trim once up front so a replayed trail that starts somewhere behind the
      // user doesn't draw a leading stub before the first fix arrives.
      let initialRoute = routeCoordinates
      if (position && routeCoordinates?.length > 1) {
        const snap = snapToRoute(
          routeCoordinates,
          position.latitude,
          position.longitude,
        )
        if (snap && snap.distanceMeters <= offRouteLimit(position.accuracy)) {
          routeProgressRef.current = {
            index: snap.index,
            meters: routeProgressMeters(routeCoordinates, snap),
          }
          initialRoute = routeAhead(routeCoordinates, snap)
        }
      }

      setTracking({
        location,
        mode,
        routeCoordinates: initialRoute,
        routeKey: routeKeyRef.current,
        remaining: position
          ? haversineMeters(
              position.latitude,
              position.longitude,
              location.latitude,
              location.longitude,
            )
          : null,
        bearing: null,
        accuracy: position?.accuracy ?? null,
        reached: false,
      })
      startWatch((point) => onPositionDuringTracking(point, session))
    },
    [position, startWatch, onPositionDuringTracking],
  )

  const handleFollowPrevious = () => {
    const loc = selectedForRoute
    const recorded = getRecordedRoute(loc.id) // [{latitude, longitude,...}]
    if (recorded.length < 2) {
      setRouteError(
        'No usable trail yet — a previous path is built from the GPS breadcrumbs ' +
          'recorded while you actually travel here. Navigate here once with ' +
          '“Use Shortest Path” and move along the route to record a trail, then ' +
          'this option will replay it.',
      )
      return
    }
    const coords = recorded.map((p) => [p.longitude, p.latitude])
    setRouteError(null)
    setSelectedForRoute(null)
    beginTracking(loc, 'previous', coords)
  }

  const handleShortest = async () => {
    const loc = selectedForRoute
    setRouteError(null)
    setLoadingRoute(true)
    try {
      const current = position || (await requestOnce())
      const route = await fetchShortestRoute(current, loc)
      setSelectedForRoute(null)
      beginTracking(loc, 'shortest', route.coordinates)
    } catch (err) {
      setRouteError(err.message || 'Could not fetch route')
    } finally {
      setLoadingRoute(false)
    }
  }

  const stopTracking = () => {
    prevPointRef.current = null
    routeProgressRef.current = { index: 0, meters: -1 }
    setTracking(null)
    refreshLocations()
    // Resume the live background watch so the "you" marker keeps following the
    // user after navigation ends (instead of freezing at the last fix).
    if (permission === 'granted') startWatch()
    else stopWatch()
  }

  // --- render gates ----------------------------------------------------------

  if (!online) return <OfflineGate onRetry={recheck} />

  if (dbError) {
    return (
      <div className="fullscreen-center">
        <h1>Storage error</h1>
        <p style={{ color: 'var(--danger)' }}>{dbError.message}</p>
      </div>
    )
  }

  if (!dbReady) {
    return (
      <div className="fullscreen-center">
        <div className="spinner" />
        <p>Loading local database…</p>
      </div>
    )
  }

  if (permission !== 'granted' || !position) {
    return (
      <PermissionGate
        permission={permission}
        error={geoError}
        onRequest={pinCurrentLocation}
      />
    )
  }

  // --- main app --------------------------------------------------------------

  const mapCenter = [position.longitude, position.latitude]

  return (
    <div className="app-layout">
      <MapView
        center={mapCenter}
        currentPoint={position}
        destination={tracking?.location || selectedForRoute || pendingPin}
        routeCoordinates={tracking?.routeCoordinates}
        routeKey={tracking?.routeKey}
        routeColor={tracking?.mode === 'previous' ? '#a371f7' : '#2f81f7'}
        flyTo={flyTo}
        onMapClick={handleMapClick}
      />

      <aside className="sidebar">
        <header className="sidebar-header">
          <h2>Find My Location</h2>
          <span className="online-dot" title="Online">
            ● online
          </span>
        </header>

        {tracking ? (
          <TrackingPanel
            location={tracking.location}
            mode={tracking.mode}
            remaining={tracking.remaining}
            accuracy={tracking.accuracy}
            bearing={tracking.bearing}
            reached={tracking.reached}
            onStop={stopTracking}
          />
        ) : selectedForRoute ? (
          <>
            <RouteChoiceDialog
              location={selectedForRoute}
              hasPrevious={hasRecordedRoute(selectedForRoute.id)}
              onFollowPrevious={handleFollowPrevious}
              onShortest={handleShortest}
              onCancel={() => {
                setSelectedForRoute(null)
                setRouteError(null)
              }}
            />
            {loadingRoute && <p>Fetching route…</p>}
            {routeError && (
              <p style={{ color: 'var(--danger)' }}>{routeError}</p>
            )}
          </>
        ) : pendingPin ? (
          <SaveLocationForm
            pin={pendingPin}
            isCurrent={pendingPin.isCurrent}
            onSave={handleSave}
            onCancel={() => setPendingPin(null)}
          />
        ) : (
          <>
            <div className="action-bar">
              <button className="primary" onClick={pinCurrentLocation}>
                📍 Pin current location
              </button>
              <p className="hint">…or click anywhere on the map to pin a point.</p>

              <DestinationSearch
                onPick={handleManualDestination}
                origin={position}
              />

              <label className="threshold-control">
                Arrival threshold
                <div className="threshold-options">
                  {THRESHOLD_OPTIONS.map((m) => (
                    <button
                      key={m}
                      className={threshold === m ? 'primary' : ''}
                      onClick={() => setThreshold(m)}
                    >
                      {m} m
                    </button>
                  ))}
                </div>
              </label>
              {threshold <= 10 && (
                <p className="hint warn">
                  ⚠ 10 m needs good GPS — if accuracy is worse than 10 m,
                  arrival may not trigger reliably.
                </p>
              )}
            </div>
            <h3>Saved locations</h3>
            <SavedLocationsList
              locations={locations}
              currentPoint={position}
              onSelect={(loc) => {
                setRouteError(null)
                setSelectedForRoute(loc)
              }}
              onDelete={handleDelete}
            />
          </>
        )}
      </aside>
    </div>
  )
}
