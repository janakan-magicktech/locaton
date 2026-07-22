import { useState } from 'react'
import { geocodeDestination } from '../services/geocoding.js'

// Lets the user type a destination manually. On submit it geocodes the text
// and shows candidate matches; picking one calls onPick({label, latitude,
// longitude}) so the parent can drop a pin the map auto-marks.
export default function DestinationSearch({ onPick }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null) // null = not searched yet
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)

  const search = async (e) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setError(null)
    setResults(null)
    try {
      const matches = await geocodeDestination(q)
      setResults(matches)
    } catch (err) {
      setError(err.message || 'Address lookup failed')
    } finally {
      setSearching(false)
    }
  }

  const pick = (r) => {
    onPick(r)
    // Reset so the box is clean if the user comes back to it.
    setQuery('')
    setResults(null)
    setError(null)
  }

  return (
    <form className="destination-search" onSubmit={search}>
      <label>
        Enter a destination
        <div className="row-buttons">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Bengaluru Airport, or an address"
          />
          <button type="submit" className="primary" disabled={searching}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
      </label>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {results && results.length === 0 && (
        <p className="hint">No matches — try a more specific address.</p>
      )}

      {results && results.length > 0 && (
        <ul className="search-results">
          {results.map((r, i) => (
            <li key={`${r.latitude},${r.longitude},${i}`}>
              <button type="button" onClick={() => pick(r)} title={r.label}>
                📍 {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  )
}
