import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearWatch,
  getCurrentPosition,
  onPermissionChange,
  queryPermissionState,
  toPoint,
  watchPosition,
} from '../services/geolocation.js'

// Manages geolocation permission state, one-shot position, and live watching.
//
// Returns:
//   permission   'granted' | 'denied' | 'prompt' | 'unknown'
//   position     latest normalized point ({latitude, longitude, accuracy,...})
//   error        last GeolocationPositionError (or null)
//   requestOnce  ask for a single position (triggers the browser prompt)
//   startWatch(onEach)  begin watchPosition; onEach(point) fires per update
//   stopWatch    clearWatch cleanly
export function useGeolocation() {
  const [permission, setPermission] = useState('unknown')
  const [position, setPosition] = useState(null)
  const [error, setError] = useState(null)
  const watchIdRef = useRef(null)

  // Track permission state reactively.
  useEffect(() => {
    let unsub = () => {}
    queryPermissionState().then(setPermission)
    onPermissionChange(setPermission).then((fn) => {
      unsub = fn
    })
    return () => unsub()
  }, [])

  const requestOnce = useCallback(async () => {
    setError(null)
    try {
      const pos = await getCurrentPosition()
      const point = toPoint(pos)
      setPosition(point)
      setPermission('granted')
      return point
    } catch (err) {
      setError(err)
      // PERMISSION_DENIED === 1
      if (err && err.code === 1) setPermission('denied')
      throw err
    }
  }, [])

  const startWatch = useCallback((onEach) => {
    // Guard against duplicate watchers.
    if (watchIdRef.current != null) clearWatch(watchIdRef.current)
    watchIdRef.current = watchPosition(
      (pos) => {
        const point = toPoint(pos)
        setPosition(point)
        setError(null)
        if (onEach) onEach(point)
      },
      (err) => {
        setError(err)
        if (err && err.code === 1) setPermission('denied')
      },
    )
  }, [])

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null) {
      clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  // Cleanup on unmount.
  useEffect(() => () => stopWatch(), [stopWatch])

  return { permission, position, error, requestOnce, startWatch, stopWatch }
}
