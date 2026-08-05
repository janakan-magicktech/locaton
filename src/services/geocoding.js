// -----------------------------------------------------------------------------
// Forward geocoding tuned for Sri Lanka.
//
// Two open providers are queried and their results merged:
//
//   1. Photon (https://photon.komoot.io/api) — built for as-you-type search.
//      Handles partial words and typos, accepts a `bbox` + `lat`/`lon` bias.
//      Docs: https://github.com/komoot/photon#search
//
//   2. Nominatim (https://nominatim.openstreetmap.org/search) — stronger on
//      full addresses and administrative names, accepts `countrycodes` and a
//      `viewbox` bias.
//      Docs: https://nominatim.org/release-docs/latest/api/Search/
//
// Why both: Nominatim alone misses a lot of Sri Lankan queries because it wants
// a fairly complete string and ranks by global "importance", so small towns,
// junctions and shops lose out to same-named places abroad. Photon fills those
// in; Nominatim keeps address lookups sharp.
//
// Accuracy comes from four things layered on top of the raw providers:
//   * Sri Lanka is the default search area (country filter + bbox + centre
//     bias), with an automatic worldwide retry so foreign searches still work.
//   * Local shorthand is expanded before searching ("Trinco", "Colombo 7",
//     "BIA", Tamil/Sinhala transliterations — see LOCAL_ALIASES / COLOMBO_ZONES).
//   * Raw "lat, lon" input is resolved directly, no network call.
//   * Candidates are de-duplicated and re-ranked by name match, place type and
//     distance from the user, instead of trusting each provider's own order.
//
// Nominatim's usage policy allows ~1 request/second, so it is only queried on
// an explicit submit. While typing, suggestions come from Photon alone (its
// public instance is intended for autocomplete). Results are cached per query
// so backspacing does not re-hit either API.
// -----------------------------------------------------------------------------

import { haversineMeters } from '../utils/geo.js'

const PHOTON_BASE = 'https://photon.komoot.io/api'
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search'

// Bounding box covering Sri Lanka (incl. Jaffna peninsula and the south coast).
const LK_BBOX = { minLon: 79.35, minLat: 5.7, maxLon: 82.1, maxLat: 10.0 }
// Rough geographic centre, used to bias results when we have no user position.
const LK_CENTER = { latitude: 7.8731, longitude: 80.7718 }
const LK_COUNTRY_CODE = 'lk'

// Everyday shorthand, abbreviations and alternate transliterations that the
// providers do not resolve on their own. Keys are matched against the whole
// normalized query first, then against individual words.
const LOCAL_ALIASES = {
  trinco: 'Trincomalee',
  batti: 'Batticaloa',
  mannar: 'Mannar',
  hikka: 'Hikkaduwa',
  negombo: 'Negombo',
  'nuwara eliya': 'Nuwara Eliya',
  nuwaraeliya: 'Nuwara Eliya',
  'newara eliya': 'Nuwara Eliya',
  kotte: 'Sri Jayawardenepura Kotte',
  'sri jayawardenepura': 'Sri Jayawardenepura Kotte',
  'mount lavinia': 'Mount Lavinia, Dehiwala-Mount Lavinia',
  'mt lavinia': 'Mount Lavinia, Dehiwala-Mount Lavinia',
  bia: 'Bandaranaike International Airport, Katunayake',
  cmb: 'Bandaranaike International Airport, Katunayake',
  'colombo airport': 'Bandaranaike International Airport, Katunayake',
  'katunayake airport': 'Bandaranaike International Airport, Katunayake',
  'mattala airport': 'Mattala Rajapaksa International Airport',
  'ratmalana airport': 'Ratmalana Airport, Colombo',
  'jaffna airport': 'Jaffna International Airport, Palaly',
  'palaly airport': 'Jaffna International Airport, Palaly',
  yaalpanam: 'Jaffna',
  yalpanam: 'Jaffna',
  yazhpanam: 'Jaffna',
  'kandy town': 'Kandy',
  mahanuwara: 'Kandy',
  'sri pada': 'Adams Peak, Sri Pada',
  'adams peak': 'Adams Peak, Sri Pada',
  sigiriya: 'Sigiriya Rock, Sigiriya',
  'lion rock': 'Sigiriya Rock, Sigiriya',
  'temple of the tooth': 'Sri Dalada Maligawa, Kandy',
  'dalada maligawa': 'Sri Dalada Maligawa, Kandy',
  pettah: 'Pettah, Colombo',
  'fort station': 'Colombo Fort Railway Station, Colombo',
  'colombo fort': 'Colombo Fort, Colombo',
  'kelani valley': 'Kelani Valley, Colombo',
  'galle fort': 'Galle Fort, Galle',
  'lotus tower': 'Colombo Lotus Tower, Colombo',
  'port city': 'Port City Colombo, Colombo',
  'one galle face': 'One Galle Face, Colombo',
  'galle face': 'Galle Face Green, Colombo',
  'independence square': 'Independence Square, Colombo',
  'viharamahadevi park': 'Viharamahadevi Park, Colombo',
  'colombo uni': 'University of Colombo, Colombo',
  peradeniya: 'University of Peradeniya, Peradeniya',
  jaypura: 'Sri Jayawardenepura Kotte',
}

// Colombo's postal zones are written as "Colombo 7" locally but mapped in OSM
// under their neighbourhood names, so "Colombo 7" alone geocodes poorly.
const COLOMBO_ZONES = {
  1: 'Fort',
  2: 'Slave Island',
  3: 'Kollupitiya',
  4: 'Bambalapitiya',
  5: 'Havelock Town',
  6: 'Wellawatte',
  7: 'Cinnamon Gardens',
  8: 'Borella',
  9: 'Dematagoda',
  10: 'Maradana',
  11: 'Pettah',
  12: 'Hulftsdorp',
  13: 'Kotahena',
  14: 'Grandpass',
  15: 'Modara',
}

// Place types worth surfacing above raw address rows for a navigation target.
const TYPE_BOOSTS = {
  city: 26,
  town: 22,
  village: 16,
  suburb: 14,
  neighbourhood: 10,
  hamlet: 8,
  administrative: 12,
  aerodrome: 20,
  railway: 12,
  station: 12,
  bus_station: 12,
  hospital: 12,
  university: 10,
  school: 6,
  attraction: 10,
  hotel: 6,
  supermarket: 6,
  house: -8,
  residential: -6,
  road: -4,
  street: -4,
}

// Small in-memory cache so re-typing/backspacing does not re-hit the providers.
const cache = new Map()
const CACHE_LIMIT = 60

const normalize = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Expand local shorthand so the providers see a name they actually hold.
// Returns the query to search with (unchanged when nothing matches).
export function expandLocalQuery(query) {
  const raw = query.trim()
  const key = normalize(raw)
  if (!key) return raw

  // "Colombo 7" / "Colombo 07" / "col 7" -> "Cinnamon Gardens, Colombo"
  const zone = key.match(/^(?:colombo|col|cmb)\s*0*(\d{1,2})$/)
  if (zone) {
    const name = COLOMBO_ZONES[Number.parseInt(zone[1], 10)]
    if (name) return `${name}, Colombo`
  }

  if (LOCAL_ALIASES[key]) return LOCAL_ALIASES[key]

  // Word-level expansion, e.g. "trinco beach" -> "Trincomalee beach".
  const words = key.split(' ')
  if (words.length > 1) {
    let touched = false
    const rebuilt = words.map((w) => {
      const hit = LOCAL_ALIASES[w]
      if (hit && /^[a-z]+$/.test(w)) {
        touched = true
        // Use only the leading name of the alias, not its ", Colombo" context.
        return hit.split(',')[0]
      }
      return w
    })
    if (touched) return rebuilt.join(' ')
  }

  return raw
}

// Recognise a raw coordinate pair: "6.9271, 79.8612", "6.9271 79.8612",
// "6.9271N 79.8612E". Returns a result object or null.
function parseCoordinates(query) {
  const m = query
    .trim()
    .match(
      /^([+-]?\d{1,2}(?:\.\d+)?)\s*°?\s*([NnSs])?\s*[,;\s]\s*([+-]?\d{1,3}(?:\.\d+)?)\s*°?\s*([EeWw])?$/,
    )
  if (!m) return null

  let lat = Number.parseFloat(m[1])
  let lon = Number.parseFloat(m[3])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (/[Ss]/.test(m[2] || '')) lat = -lat
  if (/[Ww]/.test(m[4] || '')) lon = -lon
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null

  return {
    label: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    context: 'Coordinates',
    latitude: lat,
    longitude: lon,
    source: 'coords',
    score: 1000,
  }
}

// --- label building ---------------------------------------------------------

// Join context parts, dropping blanks, repeats and a redundant "Sri Lanka".
function buildContext(parts, { inSriLanka }) {
  const seen = new Set()
  const out = []
  for (const p of parts) {
    if (!p) continue
    const k = normalize(p)
    if (!k || seen.has(k)) continue
    if (inSriLanka && k === 'sri lanka') continue
    seen.add(k)
    out.push(p)
  }
  return out.slice(0, 3).join(', ')
}

// --- providers --------------------------------------------------------------

async function fetchPhoton(query, { origin, limit, restrictToLK, signal }) {
  const bias = origin || LK_CENTER
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    lang: 'en',
    lat: String(bias.latitude),
    lon: String(bias.longitude),
  })
  if (restrictToLK) {
    params.set(
      'bbox',
      `${LK_BBOX.minLon},${LK_BBOX.minLat},${LK_BBOX.maxLon},${LK_BBOX.maxLat}`,
    )
  }

  const res = await fetch(`${PHOTON_BASE}?${params.toString()}`, { signal })
  if (!res.ok) throw new Error(`Place search failed (HTTP ${res.status})`)
  const data = await res.json()

  return (data?.features || [])
    .map((f, i) => {
      const p = f.properties || {}
      const [lon, lat] = f.geometry?.coordinates || []
      const inSriLanka = (p.countrycode || '').toLowerCase() === LK_COUNTRY_CODE
      const street = [p.street, p.housenumber].filter(Boolean).join(' ')
      const name = p.name || street || p.city || p.district || p.state
      if (!name) return null
      return {
        label: name,
        context: buildContext(
          [
            p.name && street ? street : null,
            p.district,
            p.city || p.county,
            p.state,
            p.country,
          ],
          { inSriLanka },
        ),
        latitude: lat,
        longitude: lon,
        inSriLanka,
        placeType: p.osm_value || p.type,
        source: 'photon',
        rank: i,
      }
    })
    .filter(Boolean)
}

async function fetchNominatim(query, { limit, restrictToLK, signal }) {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    namedetails: '1',
    dedupe: '1',
    limit: String(limit),
  })
  if (restrictToLK) {
    params.set('countrycodes', LK_COUNTRY_CODE)
    params.set(
      'viewbox',
      `${LK_BBOX.minLon},${LK_BBOX.maxLat},${LK_BBOX.maxLon},${LK_BBOX.minLat}`,
    )
  }

  const res = await fetch(`${NOMINATIM_BASE}?${params.toString()}`, {
    signal,
    headers: { 'Accept-Language': 'en' },
  })
  if (!res.ok) throw new Error(`Address lookup failed (HTTP ${res.status})`)
  const data = await res.json()
  if (!Array.isArray(data)) return []

  return data
    .map((item, i) => {
      const a = item.address || {}
      const inSriLanka = (a.country_code || '').toLowerCase() === LK_COUNTRY_CODE
      const street = [a.road, a.house_number].filter(Boolean).join(' ')
      const name =
        item.name ||
        item.namedetails?.name ||
        street ||
        (item.display_name || '').split(',')[0]
      if (!name) return null
      return {
        label: name,
        context: buildContext(
          [
            item.name && street ? street : null,
            a.suburb || a.neighbourhood || a.village || a.hamlet,
            a.city || a.town || a.municipality,
            a.state || a.state_district || a.county,
            a.country,
          ],
          { inSriLanka },
        ),
        latitude: Number.parseFloat(item.lat),
        longitude: Number.parseFloat(item.lon),
        inSriLanka,
        placeType: item.type || item.addresstype,
        importance: Number.parseFloat(item.importance) || 0,
        source: 'nominatim',
        rank: i,
      }
    })
    .filter(Boolean)
}

// --- merge, rank, dedupe ----------------------------------------------------

// How well the result's own name matches what was typed. This dominates the
// ranking: a provider's fuzzy match on an unrelated nearby name must never beat
// an exact match further away (otherwise "Chennai" resolves to "Chenaikudirippu"
// simply because it is in Sri Lanka).
function nameScore(r, queryKey, queryTokens) {
  const name = normalize(r.label)
  const full = `${name} ${normalize(r.context)}`

  if (name === queryKey) return 90
  if (name.startsWith(queryKey)) return 55
  if (name.includes(queryKey)) return 30
  // Every typed word present, in any order — "Jaffna bus stand" vs
  // "Jaffna Central Bus Stand", or a shop matched via its town in the context.
  if (queryTokens.every((t) => name.includes(t))) return 40
  if (queryTokens.every((t) => full.includes(t))) return 20

  const hit = queryTokens.filter((t) => full.includes(t)).length
  if (!hit) return -30 // fuzzy-only match: no typed word appears at all
  return Math.round((hit / queryTokens.length) * 10) - 20
}

function scoreResult(r, { queryKey, queryTokens, origin }) {
  let score = 100 - r.rank * 4

  score += nameScore(r, queryKey, queryTokens)
  if (r.inSriLanka) score += 25
  score += TYPE_BOOSTS[r.placeType] ?? 0
  score += (r.importance || 0) * 25

  // Prefer nearby matches: no penalty within ~10 km, growing slowly after.
  const from = origin || LK_CENTER
  const km = haversineMeters(from.latitude, from.longitude, r.latitude, r.longitude) / 1000
  score -= Math.min(45, Math.max(0, Math.log2(Math.max(km, 10) / 10) * 7))

  return score
}

// Collapse the two providers' overlapping hits: same place name within 250 m,
// or effectively identical coordinates, counts as one entry.
function dedupe(results) {
  const kept = []
  for (const r of results) {
    const name = normalize(r.label)
    const dupe = kept.find((k) => {
      const d = haversineMeters(k.latitude, k.longitude, r.latitude, r.longitude)
      return d < 25 || (d < 250 && normalize(k.label) === name)
    })
    if (!dupe) {
      kept.push(r)
      continue
    }
    // Keep the richer context when merging.
    if (!dupe.context && r.context) dupe.context = r.context
  }
  return kept
}

function cacheGet(key) {
  if (!cache.has(key)) return null
  const value = cache.get(key)
  // Refresh recency.
  cache.delete(key)
  cache.set(key, value)
  return value
}

function cacheSet(key, value) {
  cache.set(key, value)
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value)
}

// Run one pass of the providers, either Sri Lanka-restricted or worldwide.
async function runPass(query, { origin, limit, signal, suggest, restrictToLK }) {
  const providers = [
    fetchPhoton(query, { origin, limit: limit + 5, restrictToLK, signal }),
  ]
  // Nominatim only on explicit submit — its public instance is rate limited.
  if (!suggest) {
    providers.push(fetchNominatim(query, { limit, restrictToLK, signal }))
  }

  const settled = await Promise.allSettled(providers)
  const ok = settled.filter((s) => s.status === 'fulfilled')
  if (!ok.length) {
    const first = settled[0]
    throw first?.reason instanceof Error
      ? first.reason
      : new Error('Place search failed')
  }
  return ok.flatMap((s) => s.value)
}

// Geocode a free-text destination into candidate locations, biased to Sri Lanka.
//
//   query   raw string the user typed
//   origin  optional {latitude, longitude} of the user, used for distance bias
//   limit   max results to return (default 8)
//   signal  optional AbortSignal so a stale keystroke can be cancelled
//   suggest true while the user is still typing — Photon only, keeps Nominatim
//           within its rate limit
//
// Returns [{ label, context, latitude, longitude }, ...] (possibly empty).
export async function geocodeDestination(query, options = {}) {
  const { origin = null, limit = 8, signal, suggest = false } = options
  const raw = (query || '').trim()
  if (!raw) return []

  const coords = parseCoordinates(raw)
  if (coords) return [coords]

  const searchText = expandLocalQuery(raw)
  const queryKey = normalize(searchText)
  const queryTokens = queryKey.split(' ').filter(Boolean)
  const cacheKey = `${suggest ? 's' : 'f'}|${limit}|${queryKey}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  let hits = await runPass(searchText, {
    origin,
    limit,
    signal,
    suggest,
    restrictToLK: true,
  })

  // Widen to a worldwide search when Sri Lanka yielded little, or only fuzzy
  // near-misses. Without the second test a query like "Chennai" would stop at
  // the loosely-similar Sri Lankan names the providers offer.
  const strongLocalMatch = hits.some((r) => {
    const n = normalize(r.label)
    return n === queryKey || n.startsWith(queryKey) || queryTokens.every((t) => n.includes(t))
  })
  if (hits.length < 3 || !strongLocalMatch) {
    try {
      const global = await runPass(searchText, {
        origin,
        limit,
        signal,
        suggest,
        restrictToLK: false,
      })
      hits = hits.concat(global)
    } catch {
      // Keep whatever the restricted pass found.
    }
  }

  const ranked = dedupe(
    hits
      .filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
      .map((r) => ({ ...r, score: scoreResult(r, { queryKey, queryTokens, origin }) }))
      .sort((a, b) => b.score - a.score),
  ).slice(0, limit)

  cacheSet(cacheKey, ranked)
  return ranked
}

// Convenience wrapper for as-you-type suggestions.
export function suggestDestinations(query, options = {}) {
  return geocodeDestination(query, { ...options, suggest: true })
}
