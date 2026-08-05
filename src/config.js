// Optional Geoapify key unlocks Google Maps–style place search + fresher map tiles.
// Free tier: 3,000 requests/day — sign up at https://www.geoapify.com/
export const GEOAPIFY_API_KEY = (import.meta.env.VITE_GEOAPIFY_API_KEY || '').trim()

export const HAS_ENHANCED_SEARCH = Boolean(GEOAPIFY_API_KEY)

export const MAP_STYLE = GEOAPIFY_API_KEY
  ? `https://maps.geoapify.com/v1/styles/osm-bright/style.json?apiKey=${GEOAPIFY_API_KEY}`
  : 'https://tiles.openfreemap.org/styles/liberty'

export const MAP_ATTRIBUTION = GEOAPIFY_API_KEY
  ? '© OpenStreetMap © Geoapify'
  : '© OpenStreetMap © OpenFreeMap'
