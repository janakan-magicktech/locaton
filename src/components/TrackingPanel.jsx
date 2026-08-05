import { useMemo, useState } from 'react'
import { compassLabel, formatDistance } from '../utils/geo.js'
import {
  currentStepFromPosition,
  distanceToStepEnd,
  formatStepInstruction,
} from '../services/navigation.js'
import { useVoiceGuidance, stepForVoice } from '../hooks/useVoiceGuidance.js'

function formatEta(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '—'
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

export default function TrackingPanel({
  location,
  mode,
  remaining,
  accuracy,
  bearing,
  reached,
  onStop,
  position,
  steps,
  fullRouteCoordinates,
  routeDuration,
  trafficInfo,
}) {
  const [voiceOn, setVoiceOn] = useState(true)

  const stepState = useMemo(() => {
    if (mode !== 'shortest' || !steps?.length || !position || !fullRouteCoordinates) {
      return null
    }
    const { index, progressMeters } = currentStepFromPosition(
      steps,
      fullRouteCoordinates,
      position.latitude,
      position.longitude,
    )
    const current = steps[index]
    const next = steps[index + 1] || null
    return {
      index,
      progressMeters,
      instruction: formatStepInstruction(current),
      nextInstruction: next ? formatStepInstruction(next) : null,
      distanceToEnd: distanceToStepEnd(steps, index, progressMeters),
    }
  }, [mode, steps, position, fullRouteCoordinates])

  const voiceStep = stepForVoice(steps, stepState?.index ?? 0)
  const voiceNext =
    stepState?.nextInstruction && stepState?.distanceToEnd != null
      ? {
          index: (stepState.index ?? 0) + 1,
          instruction: stepState.nextInstruction,
          distanceToEnd: stepState.distanceToEnd,
        }
      : null

  useVoiceGuidance({
    enabled: voiceOn && mode === 'shortest' && !reached,
    step: voiceStep,
    nextStep: voiceNext,
  })

  if (reached) {
    return (
      <div className="panel-card success-card">
        <div style={{ fontSize: 40 }}>✅</div>
        <h3 style={{ margin: '8px 0' }}>
          You have reached your saved location successfully.
        </h3>
        <button className="primary" onClick={onStop}>
          Done
        </button>
      </div>
    )
  }

  return (
    <div className="panel-card">
      <div className="tracking-header">
        <h3 style={{ margin: 0 }}>
          → {location.name || `Location #${location.id}`}
        </h3>
        <span className="mode-badge">
          {mode === 'previous' ? 'Previous path' : 'Shortest path'}
        </span>
      </div>

      {mode === 'shortest' && stepState && (
        <div className="turn-panel">
          <div className="turn-instruction">{stepState.instruction}</div>
          {stepState.nextInstruction && (
            <div className="turn-next hint">
              Then: {stepState.nextInstruction}
              {stepState.distanceToEnd != null && (
                <> · in {formatDistance(stepState.distanceToEnd)}</>
              )}
            </div>
          )}
          <label className="voice-toggle">
            <input
              type="checkbox"
              checked={voiceOn}
              onChange={(e) => setVoiceOn(e.target.checked)}
            />
            Voice guidance
          </label>
        </div>
      )}

      {trafficInfo && (
        <p className={`traffic-badge traffic-${trafficInfo.level}`}>
          🚦 {trafficInfo.label}
          {trafficInfo.delaySeconds > 0 && (
            <> · +{Math.round(trafficInfo.delaySeconds / 60)} min est.</>
          )}
        </p>
      )}

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Remaining</div>
          <div className="stat-value">{formatDistance(remaining)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">ETA</div>
          <div className="stat-value">
            {formatEta(trafficInfo?.adjustedDurationSeconds ?? routeDuration)}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Heading</div>
          <div className="stat-value">
            {bearing != null
              ? `${compassLabel(bearing)} ${Math.round(bearing)}°`
              : '—'}
          </div>
        </div>
      </div>

      {accuracy != null && (
        <p className="hint">GPS accuracy: ±{Math.round(accuracy)} m</p>
      )}

      <button className="danger" onClick={onStop} style={{ width: '100%' }}>
        Stop tracking
      </button>
    </div>
  )
}
