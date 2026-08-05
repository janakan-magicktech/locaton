import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import {
  MAP_ATTRIBUTION,
  MAP_STYLE_SATELLITE,
  MAP_STYLE_STANDARD,
} from '../config.js'
import MapStyleControl from './MapStyleControl.jsx'
import { trafficOverlaySegments } from '../services/traffic.js'

const ROUTE_SOURCE = 'route-line'
const ROUTE_LAYER = 'route-line-layer'
const TRAFFIC_SOURCE = 'traffic-overlay'
const TRAFFIC_LAYER = 'traffic-overlay-layer'

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
  mapStyle = 'standard',
  onMapStyleChange,
  showTraffic = false,
  trafficLevel = 'clear',
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
  const mapStyleRef = useRef(mapStyle)

  useEffect(() => {
    onMapClickRef.current = onMapClick
  }, [onMapClick])

  useEffect(() => {
    const style = mapStyle === 'satellite' ? MAP_STYLE_SATELLITE : MAP_STYLE_STANDARD
    mapStyleRef.current = mapStyle
    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center,
      zoom: 14,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: mapStyle === 'satellite' ? '© Esri © OpenStreetMap' : MAP_ATTRIBUTION,
      }),
      'bottom-right',
    )

    const setupLayers = () => {
      loadedRef.current = true
      if (!map.getSource(TRAFFIC_SOURCE)) {
        map.addSource(TRAFFIC_SOURCE, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.addLayer({
          id: TRAFFIC_LAYER,
          type: 'line',
          source: TRAFFIC_SOURCE,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 6,
            'line-opacity': 0.55,
          },
        })
      }
      if (!map.getSource(ROUTE_SOURCE)) {
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
      }
    }

    map.on('load', setupLayers)
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

  // Switch map style without reinitializing markers logic.
  useEffect(() => {
    const map = mapRef.current
    if (!map || mapStyleRef.current === mapStyle) return
    mapStyleRef.current = mapStyle
    const style = mapStyle === 'satellite' ? MAP_STYLE_SATELLITE : MAP_STYLE_STANDARD
    const centerNow = map.getCenter()
    const zoom = map.getZoom()
    const bearing = map.getBearing()
    const pitch = map.getPitch()
    map.setStyle(style)
    map.once('style.load', () => {
      loadedRef.current = true
      map.setCenter(centerNow)
      map.setZoom(zoom)
      map.setBearing(bearing)
      map.setPitch(pitch)
      if (!map.getSource(TRAFFIC_SOURCE)) {
        map.addSource(TRAFFIC_SOURCE, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.addLayer({
          id: TRAFFIC_LAYER,
          type: 'line',
          source: TRAFFIC_SOURCE,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 6,
            'line-opacity': 0.55,
          },
        })
      }
      if (!map.getSource(ROUTE_SOURCE)) {
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
      }
    })
  }, [mapStyle, routeColor])

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
      if (el) el.className = showNav ? 'marker-nav-puck' : 'marker-heading'
    }
  }, [currentPoint, myLocationPin, isNavigating, heading])

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

  useEffect(() => {
    const map = mapRef.current
    if (!map || !currentPoint) return

    if (isNavigating) {
      map.easeTo({
        center: [currentPoint.longitude, currentPoint.latitude],
        zoom: 18,
        pitch: 52,
        bearing: heading ?? map.getBearing(),
        duration: 220,
        essential: true,
        padding: { top: 60, bottom: 240, left: 0, right: 0 },
      })
      return
    }

    if (followHeading && heading != null) {
      map.easeTo({
        center: [currentPoint.longitude, currentPoint.latitude],
        bearing: heading,
        pitch: 0,
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
        duration: 280,
        essential: true,
      })
    }
  }, [currentPoint, isNavigating, followHeading, heading])

  useEffect(() => {
    const map = mapRef.current
    if (!map || isNavigating || followHeading) return
    if (map.getPitch() > 1 || Math.abs(map.getBearing()) > 0.5) {
      map.easeTo({
        pitch: 0,
        bearing: 0,
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
        duration: 450,
      })
    }
  }, [isNavigating, followHeading])

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
      myLocationMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(lngLat)
        .addTo(map)
    } else {
      myLocationMarkerRef.current.setLngLat(lngLat)
    }
  }, [myLocationPin])

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

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      const src = map.getSource(ROUTE_SOURCE)
      if (!src) return
      src.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: routeCoordinates || [] },
      })
      if (map.getLayer(ROUTE_LAYER)) {
        map.setPaintProperty(ROUTE_LAYER, 'line-color', routeColor)
      }
      if (
        !isNavigating &&
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
  }, [routeCoordinates, routeKey, routeColor, isNavigating])

  // Traffic overlay along the active route.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      const src = map.getSource(TRAFFIC_SOURCE)
      if (!src) return
      const features =
        showTraffic && routeCoordinates?.length > 1
          ? trafficOverlaySegments(routeCoordinates, { level: trafficLevel })
          : []
      src.setData({ type: 'FeatureCollection', features })
    }
    if (loadedRef.current) apply()
    else map.once('load', apply)
  }, [routeCoordinates, showTraffic, trafficLevel])

  return (
    <div className="map-wrap">
      <div ref={containerRef} className="map-container" />
      {onMapStyleChange && (
        <MapStyleControl mapStyle={mapStyle} onChange={onMapStyleChange} />
      )}
    </div>
  )
}
