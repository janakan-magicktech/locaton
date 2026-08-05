// Place details, photos, and summaries — free sources (no Geoapify required).
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse'
const WIKI_API = 'https://en.wikipedia.org/w/api.php'
const USER_AGENT = 'find-my-location/1.0 (place details)'

export async function fetchPlaceDetails({ latitude, longitude, label }, signal) {
  const [nominatim, wiki] = await Promise.allSettled([
    fetchNominatimDetails(latitude, longitude, signal),
    fetchWikipediaSummary(label, latitude, longitude, signal),
  ])

  const osm = nominatim.status === 'fulfilled' ? nominatim.value : null
  const wp = wiki.status === 'fulfilled' ? wiki.value : null

  return {
    label: label || osm?.name || wp?.title || null,
    address: osm?.address || null,
    category: osm?.category || wp?.type || null,
    openingHours: osm?.openingHours || null,
    phone: osm?.phone || null,
    website: osm?.website || null,
    description: wp?.extract || osm?.description || null,
    photoUrl: wp?.thumbnail || osm?.photoUrl || null,
    photoCredit: wp?.thumbnail ? 'Wikipedia' : osm?.photoCredit || null,
    rating: osm?.rating || null,
    reviews: wp?.extract ? [{ text: wp.extract.slice(0, 280), source: 'Wikipedia' }] : [],
    wikipediaUrl: wp?.url || null,
    coordinates: { latitude, longitude },
  }
}

async function fetchNominatimDetails(lat, lon, signal) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: 'jsonv2',
    addressdetails: '1',
    extratags: '1',
    namedetails: '1',
    zoom: '18',
  })
  const res = await fetch(`${NOMINATIM_REVERSE}?${params}`, {
    signal,
    headers: { 'Accept-Language': 'en', 'User-Agent': USER_AGENT },
  })
  if (!res.ok) return null
  const data = await res.json()
  const a = data?.address || {}
  const tags = data?.extratags || {}
  const address = [
    [a.house_number, a.road].filter(Boolean).join(' '),
    a.suburb || a.neighbourhood,
    a.city || a.town || a.village,
    a.state,
    a.country,
  ]
    .filter(Boolean)
    .join(', ')

  return {
    name: data?.name || data?.display_name?.split(',')[0],
    address,
    category: data?.type || data?.category,
    openingHours: tags.opening_hours || tags['opening_hours'] || null,
    phone: tags.phone || tags['contact:phone'] || null,
    website: tags.website || tags['contact:website'] || null,
    description: tags.description || tags['description:en'] || null,
    photoUrl: tags.image || tags.wikimedia_commons || null,
    photoCredit: tags.image ? 'OpenStreetMap' : null,
    rating: tags.stars ? Number.parseFloat(tags.stars) : null,
  }
}

async function fetchWikipediaSummary(label, lat, lon, signal) {
  // Try geosearch near coordinates first, then label search.
  let title = null
  const geoParams = new URLSearchParams({
    action: 'query',
    list: 'geosearch',
    gscoord: `${lat}|${lon}`,
    gsradius: 500,
    gslimit: '3',
    format: 'json',
    origin: '*',
  })
  try {
    const geoRes = await fetch(`${WIKI_API}?${geoParams}`, { signal })
    const geoData = await geoRes.json()
    title = geoData?.query?.geosearch?.[0]?.title
  } catch {
    /* ignore */
  }

  if (!title && label) {
    const searchParams = new URLSearchParams({
      action: 'opensearch',
      search: label,
      limit: '1',
      format: 'json',
      origin: '*',
    })
    try {
      const sRes = await fetch(`${WIKI_API}?${searchParams}`, { signal })
      const sData = await sRes.json()
      title = sData?.[1]?.[0] || null
    } catch {
      /* ignore */
    }
  }

  if (!title) return null

  const summaryParams = new URLSearchParams({
    action: 'query',
    prop: 'extracts|pageimages',
    exintro: '1',
    explaintext: '1',
    piprop: 'thumbnail',
    pithumbsize: '320',
    titles: title,
    format: 'json',
    origin: '*',
  })
  const res = await fetch(`${WIKI_API}?${summaryParams}`, { signal })
  if (!res.ok) return null
  const data = await res.json()
  const page = Object.values(data?.query?.pages || {})[0]
  if (!page || page.missing) return null

  return {
    title: page.title,
    extract: page.extract || null,
    thumbnail: page.thumbnail?.source || null,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    type: 'Wikipedia',
  }
}
