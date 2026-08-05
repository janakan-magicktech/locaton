// Soft offline banner — app continues with cached tiles and saved routes.
export default function OfflineBanner({ onRetry, cacheStats }) {
  return (
    <div className="offline-banner" role="status">
      <span>
        📡 Offline — using cached maps
        {cacheStats?.tiles ? ` (${cacheStats.tiles} tiles)` : ''}. New routes and search need
        internet.
      </span>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}
