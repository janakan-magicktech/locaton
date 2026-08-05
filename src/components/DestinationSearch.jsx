import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { geocodeDestination, HAS_ENHANCED_SEARCH } from '../services/geocoding.js'
import { getUserLocation } from '../services/userLocation.js'
import { formatDistance } from '../utils/geo.js'

// Lets the user type a destination manually. Suggestions appear as they type
// (debounced) from Photon, Nominatim and local OpenStreetMap POI lookup.
// Picking a result calls onPick({label, latitude, longitude}) so the parent
// can drop a pin the map auto-marks.
//
// `origin` is the user's current position when known; results are ranked
// nearest-first for the same place name (Pick Me style).
const DEBOUNCE_MS = 450
const MIN_SUGGEST_CHARS = 2
const SEARCH_LIMIT = 20

export default function DestinationSearch({ onPick, origin = null, areaLabel = null }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null) // null = nothing to show yet
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)
  const [active, setActive] = useState(-1) // keyboard-highlighted row

  // Always use the latest stored GPS fix for search bias (Pick Me / Uber style).
  const originRef = useRef(origin)
  originRef.current = origin ?? getUserLocation()

  const nearestIndex = useMemo(() => {
    if (!results?.length) return -1
    let best = 0
    for (let i = 1; i < results.length; i++) {
      const d = results[i].distanceMeters
      const b = results[best].distanceMeters
      if (d != null && b != null && d < b) best = i
    }
    return best
  }, [results])

  // Tracks the in-flight request so a stale response cannot overwrite a newer
  // one, and so an abandoned keystroke is cancelled rather than left running.
  const abortRef = useRef(null)
  // Set while the user is picking a result, to suppress the suggestion refetch
  // the resulting setQuery('') would otherwise trigger.
  const skipSuggestRef = useRef(false)

  const runSearch = useCallback(
    async (text, { suggest }) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      if (!suggest) setSearching(true)
      setError(null)
      try {
        const searchOrigin = originRef.current
        const matches = await geocodeDestination(text, {
          origin: searchOrigin,
          suggest,
          limit: SEARCH_LIMIT,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setResults(matches)
        setActive(-1)
      } catch (err) {
        if (controller.signal.aborted || err?.name === 'AbortError') return
        // A failed suggestion is not worth an error message — the user is still
        // typing, and Search will report a real failure.
        if (!suggest) setError(err.message || 'Address lookup failed')
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        if (!suggest) setSearching(false)
      }
    },
    [origin],
  )

  // As-you-type suggestions.
  useEffect(() => {
    if (skipSuggestRef.current) {
      skipSuggestRef.current = false
      return
    }
    const q = query.trim()
    if (q.length < MIN_SUGGEST_CHARS) {
      abortRef.current?.abort()
      setResults(null)
      return
    }
    const timer = setTimeout(() => runSearch(q, { suggest: true }), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, runSearch])

  useEffect(() => () => abortRef.current?.abort(), [])

  const submit = (e) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    if (active >= 0 && results?.[active]) {
      pick(results[active])
      return
    }
    runSearch(q, { suggest: false })
  }

  const pick = (r) => {
    abortRef.current?.abort()
    onPick(r)
    // Reset so the box is clean if the user comes back to it.
    skipSuggestRef.current = true
    setQuery('')
    setResults(null)
    setError(null)
    setActive(-1)
  }

  const onKeyDown = (e) => {
    if (!results?.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1))
    } else if (e.key === 'Escape') {
      setResults(null)
      setActive(-1)
    }
  }

  return (
    <form className="destination-search" onSubmit={submit}>
      <label>
        Enter a destination
        {originRef.current && (
          <span className="search-near-you">
            {' '}
            · searching near {areaLabel || 'your location'} — nearest first
            {HAS_ENHANCED_SEARCH ? ' · enhanced places' : ''}
          </span>
        )}
      </label>

      {!HAS_ENHANCED_SEARCH && (
        <p className="hint search-upgrade-hint">
          Enhanced free search: OpenStreetMap + Open-Meteo + local POIs. Optional Geoapify key
          adds even richer results — see <code>.env.example</code>.
        </p>
      )}

      <label className="search-input-row">
        <div className="row-buttons">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="e.g. Venus Hospital, Kandy, Colombo 7"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="primary" disabled={searching}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
      </label>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {results && results.length === 0 && !searching && (
        <p className="hint">
          No matches — try adding the town or district, e.g. “Main Street, Jaffna”.
        </p>
      )}

      {results && results.length > 0 && (
        <ul className="search-results">
          {results.map((r, i) => (
            <li key={`${r.latitude},${r.longitude},${i}`}>
              <button
                type="button"
                className={i === active ? 'active' : ''}
                onClick={() => pick(r)}
                onMouseEnter={() => setActive(i)}
                title={r.context ? `${r.label} — ${r.context}` : r.label}
              >
                <span className="result-row">
                  <span className="result-name">📍 {r.label}</span>
                  {originRef.current && r.distanceMeters != null && (
                    <span className="result-distance">
                      {i === nearestIndex ? 'Nearest · ' : ''}
                      {formatDistance(r.distanceMeters)}
                    </span>
                  )}
                </span>
                {r.context && <span className="result-context">{r.context}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  )
}
