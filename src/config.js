// Optional Geoapify key unlocks Google Maps–style place search + fresher map tiles.
// Free tier: 3,000 requests/day — sign up at https://www.geoapify.com/
export const GEOAPIFY_API_KEY = (import.meta.env.VITE_GEOAPIFY_API_KEY || '').trim()

export const HAS_ENHANCED_SEARCH = Boolean(GEOAPIFY_API_KEY)

export const MAP_STYLE_STANDARD = GEOAPIFY_API_KEY
  ? `https://maps.geoapify.com/v1/styles/osm-bright/style.json?apiKey=${GEOAPIFY_API_KEY}`
  : 'https://tiles.openfreemap.org/styles/liberty'

// Satellite raster style (Esri World Imagery — free for display with attribution).
export const MAP_STYLE_SATELLITE = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: '© Esri',
    },
    labels: {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
    },
  },
  layers: [
    { id: 'satellite', type: 'raster', source: 'satellite' },
    { id: 'labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.85 } },
  ],
}

export const MAP_STYLE = MAP_STYLE_STANDARD

export const MAP_ATTRIBUTION = GEOAPIFY_API_KEY
  ? '© OpenStreetMap © Geoapify'
  : '© OpenStreetMap © OpenFreeMap'

export const MAP_STYLE_TYPES = {
  standard: 'standard',
  satellite: 'satellite',
}
