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
import { bearingDegrees, haversineMeters } from './utils/geo.js'
import './App.css'

// Distance (meters) below which we consider the destination "reached".
// User-selectable; detection is pure Haversine distance, so it is independent
// of walking vs driving and works at any of these thresholds.
const THRESHOLD_OPTIONS = [10, 20, 50]
const DEFAULT_THRESHOLD_M = 10

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

      // Bearing from previous point to current (travel direction).
      let bearing = null
      const prev = prevPointRef.current
      if (prev) {
        bearing = bearingDegrees(
          prev.latitude,
          prev.longitude,
          point.latitude,
          point.longitude,
        )
      }
      prevPointRef.current = point

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

      const reached = remaining <= thresholdRef.current

      setTracking((t) =>
        t
          ? {
              ...t,
              remaining,
              bearing,
              accuracy: point.accuracy,
              reached,
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
      const session = { location, savedLocationId: location.id, mode }
      setTracking({
        location,
        mode,
        routeCoordinates,
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
    if (recorded.length === 0) {
      setRouteError(
        'No recorded path yet — navigate here once with “Use Shortest Path” to record a trail.',
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

              <DestinationSearch onPick={handleManualDestination} />

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
