import { useEffect, useState } from 'react'

// Tracks connectivity via navigator.onLine + online/offline events.
// `recheck` bumps a counter that forces re-read (used by the retry button).
export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  const recheck = () => setOnline(navigator.onLine)

  return { online, recheck }
}
