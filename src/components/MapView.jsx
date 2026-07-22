import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'

// Online raster tile style (OpenStreetMap tiles via MapLibre raster source).
// Purely online — no offline tile cache.
const MAP_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

const ROUTE_SOURCE = 'route-line'
const ROUTE_LAYER = 'route-line-layer'

// Props:
//   center            [lng, lat] initial center
//   currentPoint      { latitude, longitude } | null  -> "you" marker
//   destination       { latitude, longitude } | null  -> destination marker
//   routeCoordinates  [[lng,lat],...] | null           -> route/breadcrumb line
//   routeColor        line color (differs for shortest vs recorded path)
//   flyTo             [lng, lat] | null -> recenter the map when this changes
//   onMapClick        (lngLat) => void  fired when the user clicks the map
export default function MapView({
  center = [0, 0],
  currentPoint,
  destination,
  routeCoordinates,
  routeColor = '#2f81f7',
  flyTo,
  onMapClick,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const currentMarkerRef = useRef(null)
  const destMarkerRef = useRef(null)
  const onMapClickRef = useRef(onMapClick)
  const loadedRef = useRef(false)

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

  // Current-location marker (blue dot).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !currentPoint) return
    const lngLat = [currentPoint.longitude, currentPoint.latitude]
    if (!currentMarkerRef.current) {
      const el = document.createElement('div')
      el.className = 'marker-current'
      currentMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(lngLat)
        .addTo(map)
    } else {
      currentMarkerRef.current.setLngLat(lngLat)
    }
  }, [currentPoint])

  // Destination marker (red pin).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!destination) {
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
  }, [destination])

  // Recenter the map when asked to (e.g. after a manual destination search).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !flyTo) return
    map.flyTo({ center: flyTo, zoom: 15, duration: 800 })
  }, [flyTo])

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
      // Fit the map to the route when we have one.
      if (routeCoordinates && routeCoordinates.length > 1) {
        const bounds = routeCoordinates.reduce(
          (b, c) => b.extend(c),
          new maplibregl.LngLatBounds(routeCoordinates[0], routeCoordinates[0]),
        )
        map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 600 })
      }
    }
    if (loadedRef.current) apply()
    else map.once('load', apply)
  }, [routeCoordinates, routeColor])

  return <div ref={containerRef} className="map-container" />
}
