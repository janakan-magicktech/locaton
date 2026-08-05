import { useEffect, useMemo, useRef, useState } from 'react'
import { bearingDegrees, haversineMeters } from '../utils/geo.js'

const MIN_MOVE_M = 12
const MIN_MOVE_NAV_M = 3
const moveLimit = (accuracy, navigating) =>
  Math.max(navigating ? MIN_MOVE_NAV_M : MIN_MOVE_M, (accuracy || 0) * (navigating ? 0.8 : 1.5))

function readCompassHeading(event) {
  if (event.webkitCompassHeading != null && !Number.isNaN(event.webkitCompassHeading)) {
    return event.webkitCompassHeading
  }
  if (event.alpha != null && !Number.isNaN(event.alpha)) {
    return (360 - event.alpha) % 360
  }
  return null
}

// Device compass — used when GPS heading is unavailable (e.g. standing still).
function useCompassHeading(enabled) {
  const [heading, setHeading] = useState(null)

  useEffect(() => {
    if (!enabled) {
      setHeading(null)
      return
    }
    const onOrientation = (event) => {
      const h = readCompassHeading(event)
      if (h != null) setHeading(h)
    }
    window.addEventListener('deviceorientationabsolute', onOrientation, true)
    window.addEventListener('deviceorientation', onOrientation, true)
    return () => {
      window.removeEventListener('deviceorientationabsolute', onOrientation, true)
      window.removeEventListener('deviceorientation', onOrientation, true)
    }
  }, [enabled])

  return heading
}

// Best available facing direction: GPS heading → compass → movement bearing.
export function useUserHeading(position, { enabled = true, navigating = false } = {}) {
  const prevRef = useRef(null)
  const [movementHeading, setMovementHeading] = useState(null)
  const compassHeading = useCompassHeading(enabled)

  useEffect(() => {
    if (!enabled || !position) return
    const prev = prevRef.current
    if (!prev) {
      prevRef.current = position
      return
    }
    const moved = haversineMeters(
      prev.latitude,
      prev.longitude,
      position.latitude,
      position.longitude,
    )
    if (moved >= moveLimit(position.accuracy, navigating)) {
      setMovementHeading(
        bearingDegrees(
          prev.latitude,
          prev.longitude,
          position.latitude,
          position.longitude,
        ),
      )
      prevRef.current = position
    }
  }, [position, enabled, navigating])

  return useMemo(() => {
    if (!enabled || !position) return null
    const gps = position.heading
    if (gps != null && !Number.isNaN(gps) && gps >= 0) return gps
    if (compassHeading != null) return compassHeading
    return movementHeading
  }, [enabled, position, compassHeading, movementHeading])
}

// iOS 13+ requires a user gesture before compass events fire.
export async function requestCompassPermission() {
  if (typeof DeviceOrientationEvent === 'undefined') return false
  if (typeof DeviceOrientationEvent.requestPermission !== 'function') return true
  try {
    const state = await DeviceOrientationEvent.requestPermission()
    return state === 'granted'
  } catch {
    return false
  }
}
