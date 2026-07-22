// Screen shown when location permission is not yet granted.
// Handles the three browser permission states: prompt, denied, granted.
export default function PermissionGate({ permission, onRequest, error }) {
  if (permission === 'denied') {
    return (
      <div className="fullscreen-center">
        <div style={{ fontSize: 48 }}>🔒</div>
        <h1>Location access is required</h1>
        <p style={{ color: 'var(--muted)', maxWidth: 460 }}>
          You have blocked location access. This app cannot work without your
          location. To enable it:
        </p>
        <ol
          style={{
            color: 'var(--muted)',
            textAlign: 'left',
            maxWidth: 460,
            lineHeight: 1.6,
          }}
        >
          <li>Click the lock / site-info icon in your browser's address bar.</li>
          <li>Find the <strong>Location</strong> permission for this site.</li>
          <li>Change it to <strong>Allow</strong>.</li>
          <li>Reload the page.</li>
        </ol>
        <button className="primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }

  // 'prompt' | 'unknown' | (granted but no fix yet)
  return (
    <div className="fullscreen-center">
      <div style={{ fontSize: 48 }}>📍</div>
      <h1>Find My Location</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 460 }}>
        This app needs access to your location to pin places and navigate back
        to them. Your location never leaves your device.
      </p>
      <button className="primary" onClick={onRequest}>
        Enable location access
      </button>
      {error && (
        <p style={{ color: 'var(--danger)' }}>
          {error.message || 'Could not get your location.'}
        </p>
      )}
    </div>
  )
}
