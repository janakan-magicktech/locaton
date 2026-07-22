// Blocking screen shown whenever there is no internet connectivity.
// The app content (map, tracking) is never rendered behind this.
export default function OfflineGate({ onRetry }) {
  return (
    <div className="fullscreen-center">
      <div style={{ fontSize: 48 }}>📡</div>
      <h1>Internet connection required to use this app</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 420 }}>
        Find My Location needs an internet connection for map tiles and routing.
        Reconnect and press retry.
      </p>
      <button className="primary" onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}
