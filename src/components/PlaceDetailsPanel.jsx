import { useEffect, useState } from 'react'
import { fetchPlaceDetails } from '../services/placeDetails.js'
import { streetViewEmbedUrl, streetViewUrl } from '../services/traffic.js'

// Place photo, description, and Street View — shown when a destination is picked.
export default function PlaceDetailsPanel({ place, onClose }) {
  const [details, setDetails] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showStreetView, setShowStreetView] = useState(false)

  useEffect(() => {
    if (!place) {
      setDetails(null)
      setShowStreetView(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    fetchPlaceDetails(
      {
        latitude: place.latitude,
        longitude: place.longitude,
        label: place.label,
      },
      controller.signal,
    )
      .then(setDetails)
      .catch(() => setDetails(null))
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [place])

  if (!place) return null

  return (
    <div className="panel-card place-details">
      <div className="place-details-header">
        <h3 style={{ margin: 0 }}>{place.label || 'Destination'}</h3>
        {onClose && (
          <button type="button" className="icon-btn" onClick={onClose} title="Close">
            ✕
          </button>
        )}
      </div>

      {place.context && <p className="resolved-address">{place.context}</p>}

      {loading && <p className="hint">Loading place info…</p>}

      {!loading && details?.photoUrl && (
        <figure className="place-photo">
          <img src={details.photoUrl} alt={details.label || place.label} />
          {details.photoCredit && (
            <figcaption className="hint">Photo: {details.photoCredit}</figcaption>
          )}
        </figure>
      )}

      {!loading && details?.description && (
        <p className="place-description">{details.description}</p>
      )}

      {!loading && details?.rating != null && (
        <p className="place-rating">★ {details.rating.toFixed(1)}</p>
      )}

      {!loading && details?.openingHours && (
        <p className="hint">Hours: {details.openingHours}</p>
      )}

      {!loading && details?.reviews?.length > 0 && (
        <blockquote className="place-review">
          {details.reviews[0].text}
          <cite> — {details.reviews[0].source}</cite>
        </blockquote>
      )}

      <div className="place-actions">
        <button type="button" onClick={() => setShowStreetView((v) => !v)}>
          🛣 {showStreetView ? 'Hide Street View' : 'Street View'}
        </button>
        <a
          href={streetViewUrl(place.latitude, place.longitude)}
          target="_blank"
          rel="noopener noreferrer"
          className="link-btn"
        >
          Open in Google Maps ↗
        </a>
      </div>

      {showStreetView && (
        <iframe
          className="street-view-frame"
          title="Street View"
          src={streetViewEmbedUrl(place.latitude, place.longitude)}
          loading="lazy"
          allowFullScreen
        />
      )}
    </div>
  )
}
