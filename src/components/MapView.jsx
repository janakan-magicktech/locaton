import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { MAP_ATTRIBUTION, MAP_STYLE } from '../config.js'

// Vector map — OpenFreeMap (free) or Geoapify OSM Bright when API key is set.

const ROUTE_SOURCE = 'route-line'
const ROUTE_LAYER = 'route-line-layer'

// Props:
//   center            [lng, lat] initial center
//   currentPoint      { latitude, longitude } | null  -> live GPS dot
//   myLocationPin     { latitude, longitude } | null  -> red "you are here" pin
//   destination       { latitude, longitude } | null  -> destination marker
//   routeCoordinates  [[lng,lat],...] | null           -> route/breadcrumb line
//   routeKey          id that changes once per route; the viewport is fitted
//                     only when it changes, since routeCoordinates now shrinks
//                     on every GPS fix as the travelled part is consumed
//   routeColor        line color (differs for shortest vs recorded path)
//   flyTo             [lng, lat] | null -> recenter the map when this changes
//   followHeading     rotate map so the user's heading points up (Google Maps style)
//   heading           compass/GPS bearing in degrees (0 = north), or null
//   isNavigating      true while en route — map follows you, triangle always visible
//   onMapClick        (lngLat) => void  fired when the user clicks the map
export default function MapView({
  center = [0, 0],
  currentPoint,
  myLocationPin,
  destination,
  routeCoordinates,
  routeKey,
  routeColor = '#2f81f7',
  flyTo,
  followHeading = false,
  heading = null,
  isNavigating = false,
  onMapClick,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const currentMarkerRef = useRef(null)
  const myLocationMarkerRef = useRef(null)
  const destMarkerRef = useRef(null)
  const onMapClickRef = useRef(onMapClick)
  const loadedRef = useRef(false)
  const lastFitKeyRef = useRef(null)
  const headingMarkerElRef = useRef(null)

  // Keep the latest click handler without re-binding the map listener.
  useEffect(() => {
    onMapClickRef.current = onMapClick
  }, [onMapClick])

  // Initialize the map once.
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center,
      zoom: 14,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: MAP_ATTRIBUTION }),
      'bottom-right',
    )

    map.on('load', () => {
      loadedRef.current = true
      map.addSource(ROUTE_SOURCE, {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } },
      })
      map.addLayer({
        id: ROUTE_LAYER,
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': routeColor, 'line-width': 5, 'line-opacity': 0.85 },
      })
    })

    map.on('click', (e) => {
      if (onMapClickRef.current) onMapClickRef.current(e.lngLat)
    })

    return () => {
      map.remove()
      mapRef.current = null
      loadedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live GPS — Google Maps-style blue triangle; always visible while moving/navigating.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !currentPoint || myLocationPin) {
      if (currentMarkerRef.current) {
        currentMarkerRef.current.remove()
        currentMarkerRef.current = null
        headingMarkerElRef.current = null
      }
      return
    }
    const lngLat = [currentPoint.longitude, currentPoint.latitude]
    const showNav = isNavigating || heading != null
    if (!currentMarkerRef.current) {
      const el = document.createElement('div')
      el.className = showNav ? 'marker-nav-puck' : 'marker-heading'
      el.innerHTML = showNav
        ? '<span class="marker-nav-cone" aria-hidden="true"></span>' +
          '<span class="marker-nav-dot" aria-hidden="true"></span>'
        : '<span class="marker-heading-beam" aria-hidden="true"></span>' +
          '<span class="marker-heading-dot" aria-hidden="true"></span>'
      headingMarkerElRef.current = el
      currentMarkerRef.current = new maplibregl.Marker({
        element: el,
        anchor: 'center',
        rotationAlignment: 'viewport',
        pitchAlignment: 'viewport',
      })
        .setLngLat(lngLat)
        .addTo(map)
    } else {
      currentMarkerRef.current.setLngLat(lngLat)
      const el = headingMarkerElRef.current
      if (el) {
        el.className = showNav ? 'marker-nav-puck' : 'marker-heading'
      }
    }
  }, [currentPoint, myLocationPin, isNavigating, heading])

  // Rotate triangle: compass mode rotates map so triangle points up; otherwise rotate triangle.
  useEffect(() => {
    const el = headingMarkerElRef.current
    if (!el) return
    const hasHeading = heading != null && !Number.isNaN(heading)
    if ((followHeading || isNavigating) && hasHeading) {
      el.style.transform = 'rotate(0deg)'
    } else if (hasHeading) {
      el.style.transform = `rotate(${heading}deg)`
    } else {
      el.style.transform = 'rotate(0deg)'
    }
  }, [heading, followHeading, isNavigating])

  // Navigation / compass — keep you centered; rotate map when heading is known.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !currentPoint) return
    if (!isNavigating && !followHeading) return

    const opts = {
      center: [currentPoint.longitude, currentPoint.latitude],
      duration: isNavigating ? 200 : 280,
      essential: true,
    }
    if (isNavigating) {
      opts.zoom = Math.max(map.getZoom(), 17)
    }
    if ((followHeading || isNavigating) && heading != null) {
      opts.bearing = heading
    }
    map.easeTo(opts)
  }, [currentPoint, followHeading, isNavigating, heading])

  // Return to north-up when compass mode is turned off (not while navigating).
  useEffect(() => {
    const map = mapRef.current
    if (!map || followHeading || isNavigating) return
    const b = map.getBearing()
    if (Math.abs(b) > 0.5) {
      map.easeTo({ bearing: 0, duration: 400 })
    }
  }, [followHeading, isNavigating])

  // Pinned "you are here" marker — red arrow shown when user clicks Pin current location.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!myLocationPin) {
      if (myLocationMarkerRef.current) {
        myLocationMarkerRef.current.remove()
        myLocationMarkerRef.current = null
      }
      return
    }
    const lngLat = [myLocationPin.longitude, myLocationPin.latitude]
    if (!myLocationMarkerRef.current) {
      const el = document.createElement('div')
      el.className = 'marker-my-location'
      el.innerHTML =
        '<span class="marker-my-location-label">You are here</span>' +
        '<span class="marker-my-location-arrow" aria-hidden="true"></span>'
      myLocationMarkerRef.current = new maplibregl.Marker({
        element: el,
        anchor: 'bottom',
      })
        .setLngLat(lngLat)
        .addTo(map)
    } else {
      myLocationMarkerRef.current.setLngLat(lngLat)
    }
  }, [myLocationPin])

  // Destination pin — hidden during navigation (triangle shows your position instead).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!destination || isNavigating) {
      if (destMarkerRef.current) {
        destMarkerRef.current.remove()
        destMarkerRef.current = null
      }
      return
    }
    const lngLat = [destination.longitude, destination.latitude]
    if (!destMarkerRef.current) {
      destMarkerRef.current = new maplibregl.Marker({ color: '#e5534b' })
        .setLngLat(lngLat)
        .addTo(map)
    } else {
      destMarkerRef.current.setLngLat(lngLat)
    }
  }, [destination, isNavigating])

  // Recenter the map when asked to (e.g. after a manual destination search).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !flyTo) return
    map.flyTo({
      center: flyTo,
      zoom: 15,
      bearing: followHeading && heading != null ? heading : 0,
      duration: 800,
    })
  }, [flyTo, followHeading, heading])

  // Route line updates.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      const src = map.getSource(ROUTE_SOURCE)
      if (!src) return
      src.setData({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: routeCoordinates || [],
        },
      })
      if (map.getLayer(ROUTE_LAYER)) {
        map.setPaintProperty(ROUTE_LAYER, 'line-color', routeColor)
      }
      // Fit the map to the route once per route. Guarding on routeKey rather
      // than the coordinates matters now that the line is re-trimmed on every
      // position fix — fitting each time would yank the viewport continuously
      // and zoom ever tighter as the remaining route shrinks.
      if (
        routeKey != null &&
        routeKey !== lastFitKeyRef.current &&
        routeCoordinates &&
        routeCoordinates.length > 1
      ) {
        lastFitKeyRef.current = routeKey
        const bounds = routeCoordinates.reduce(
          (b, c) => b.extend(c),
          new maplibregl.LngLatBounds(routeCoordinates[0], routeCoordinates[0]),
        )
        map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 600 })
      }
    }
    if (loadedRef.current) apply()
    else map.once('load', apply)
  }, [routeCoordinates, routeKey, routeColor])

  return <div ref={containerRef} className="map-container" />
}
