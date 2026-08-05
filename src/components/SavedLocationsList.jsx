import { formatDistance, haversineMeters } from '../utils/geo.js'

// List of all saved locations. Clicking an entry starts tracking to it.
export default function SavedLocationsList({
  locations,
  currentPoint,
  onSelect,
  onDelete,
}) {
  if (!locations.length) {
    return (
      <p style={{ color: 'var(--muted)' }}>
        No saved locations yet. Pin your current spot or click the map to add
        one.
      </p>
    )
  }

  return (
    <ul className="saved-list">
      {[...locations]
        .sort((a, b) => {
          if (!currentPoint) return 0
          const da = haversineMeters(
            currentPoint.latitude,
            currentPoint.longitude,
            a.latitude,
            a.longitude,
          )
          const db = haversineMeters(
            currentPoint.latitude,
            currentPoint.longitude,
            b.latitude,
            b.longitude,
          )
          return da - db
        })
        .map((loc) => {
        const distance = currentPoint
          ? haversineMeters(
              currentPoint.latitude,
              currentPoint.longitude,
              loc.latitude,
              loc.longitude,
            )
          : null
        return (
          <li key={loc.id} className="saved-item">
            <button className="saved-item-main" onClick={() => onSelect(loc)}>
              <div className="saved-item-name">
                {loc.name || `Location #${loc.id}`}
              </div>
              <div className="saved-item-meta">
                {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                {distance != null && ` · ${formatDistance(distance)} away`}
              </div>
              {loc.notes && (
                <div className="saved-item-notes">{loc.notes}</div>
              )}
            </button>
            <button
              className="saved-item-delete"
              title="Delete"
              onClick={() => onDelete(loc.id)}
            >
              ✕
            </button>
          </li>
        )
      })}
    </ul>
  )
}
