import { compassLabel, formatDistance } from '../utils/geo.js'

// Live tracking HUD: remaining distance, GPS accuracy, bearing, and controls.
// Shows the "reached" success message when `reached` is true.
export default function TrackingPanel({
  location,
  mode, // 'shortest' | 'previous'
  remaining, // meters | null
  accuracy, // meters | null
  bearing, // degrees | null
  reached,
  onStop,
}) {
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

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Remaining</div>
          <div className="stat-value">{formatDistance(remaining)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">GPS accuracy</div>
          <div className="stat-value">
            {accuracy != null ? `±${Math.round(accuracy)} m` : '—'}
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

      <button className="danger" onClick={onStop} style={{ width: '100%' }}>
        Stop tracking
      </button>
    </div>
  )
}
