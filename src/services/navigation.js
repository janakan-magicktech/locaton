// Turn-by-turn helpers — independent of route-line consumption logic.
import { haversineMeters, routeProgressMeters, snapToRoute } from '../utils/geo.js'

const MANEUVER_LABELS = {
  depart: 'Head',
  arrive: 'Arrive at',
  turn: 'Turn',
  'new name': 'Continue on',
  continue: 'Continue',
  merge: 'Merge',
  'on ramp': 'Take the ramp',
  'off ramp': 'Take the exit',
  fork: 'At the fork',
  end_of_road: 'At the end of the road',
  roundabout: 'At the roundabout',
  rotary: 'At the rotary',
  'roundabout turn': 'At the roundabout',
  notification: 'Continue',
  'exit roundabout': 'Exit the roundabout',
  'exit rotary': 'Exit the rotary',
}

const MODIFIER_LABELS = {
  straight: 'straight',
  slight: 'slight',
  sharp: 'sharp',
  right: 'right',
  left: 'left',
  'slight right': 'slightly right',
  'slight left': 'slightly left',
  'sharp right': 'sharply right',
  'sharp left': 'sharply left',
  uturn: 'make a U-turn',
}

// Build a human-readable instruction from one OSRM step.
export function formatStepInstruction(step) {
  if (!step) return ''
  const m = step.maneuver || {}
  const type = m.type || 'continue'
  const mod = m.modifier || ''
  const street = step.name && step.name !== '-' ? step.name : ''
  const base = MANEUVER_LABELS[type] || 'Continue'

  if (type === 'depart') {
    return street ? `${base} ${MODIFIER_LABELS[mod] || 'straight'} on ${street}` : `${base} ${MODIFIER_LABELS[mod] || 'straight'}`
  }
  if (type === 'arrive') {
    return street ? `${base} ${street}` : `${base} your destination`
  }
  if (type === 'roundabout' || type === 'rotary') {
    const exit = step.rotary_name || step.exit || ''
    return exit ? `${base}, take exit ${exit}` : `${base}, take the ${MODIFIER_LABELS[mod] || 'correct'} exit`
  }
  if (mod && MODIFIER_LABELS[mod]) {
    return street ? `${base} ${MODIFIER_LABELS[mod]} onto ${street}` : `${base} ${MODIFIER_LABELS[mod]}`
  }
  return street ? `${base} on ${street}` : base
}

// Find which step the user is on given route progress in meters.
export function stepIndexAtProgress(steps, progressMeters) {
  if (!steps?.length) return 0
  let acc = 0
  for (let i = 0; i < steps.length; i++) {
    acc += steps[i].distance || 0
    if (progressMeters < acc - 5) return i
  }
  return steps.length - 1
}

// Live step index from GPS position + full route geometry + steps.
export function currentStepFromPosition(steps, routeCoordinates, lat, lng) {
  if (!steps?.length || !routeCoordinates?.length) return { index: 0, progressMeters: 0 }
  const snap = snapToRoute(routeCoordinates, lat, lng, 0)
  const progress = snap ? routeProgressMeters(routeCoordinates, snap) : 0
  return { index: stepIndexAtProgress(steps, progress), progressMeters: progress }
}

// Distance remaining until the end of the current step (meters).
export function distanceToStepEnd(steps, stepIndex, progressMeters) {
  if (!steps?.length) return null
  let acc = 0
  for (let i = 0; i <= stepIndex && i < steps.length; i++) {
    acc += steps[i].distance || 0
  }
  return Math.max(0, acc - progressMeters)
}

// Should announce the next step? (within threshold meters of step end)
export function shouldAnnounceStep(steps, stepIndex, progressMeters, thresholdM = 25) {
  const remaining = distanceToStepEnd(steps, stepIndex, progressMeters)
  return remaining != null && remaining <= thresholdM
}

// Straight-line distance from user to destination (for sanity checks).
export function distanceToPoint(lat1, lng1, lat2, lng2) {
  return haversineMeters(lat1, lng1, lat2, lng2)
}
