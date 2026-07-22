// Shown after a saved location is selected. Offers the two tracking modes.
// "Follow Previous Path" is only enabled when a recorded route exists.
export default function RouteChoiceDialog({
  location,
  hasPrevious,
  onFollowPrevious,
  onShortest,
  onCancel,
}) {
  return (
    <div className="panel-card">
      <h3 style={{ marginTop: 0 }}>
        Navigate to {location.name || `Location #${location.id}`}
      </h3>
      <p style={{ color: 'var(--muted)' }}>Choose how to get there:</p>

      <div className="choice-buttons">
        <button
          onClick={onFollowPrevious}
          title={
            hasPrevious
              ? 'Replay the breadcrumb trail recorded on a previous trip'
              : 'No previously recorded path to this location yet'
          }
        >
          <strong>Follow Previous Path</strong>
          <span>
            {hasPrevious
              ? 'Replay the recorded breadcrumb trail'
              : 'No recorded path yet'}
          </span>
        </button>

        <button className="primary" onClick={onShortest}>
          <strong>Use Shortest Path</strong>
          <span>Fetch the shortest route from OSRM</span>
        </button>
      </div>

      <div className="row-buttons">
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
