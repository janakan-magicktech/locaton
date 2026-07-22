import { useEffect, useState } from 'react'
import { initDb } from '../services/db.js'

// Initializes sql.js (wasm) + IndexedDB persistence once on mount.
export function useDatabase() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    initDb()
      .then(() => !cancelled && setReady(true))
      .catch((err) => !cancelled && setError(err))
    return () => {
      cancelled = true
    }
  }, [])

  return { ready, error }
}
