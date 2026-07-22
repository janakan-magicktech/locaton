import { useState } from 'react'

// Form to save a pinned point. `pin` is { latitude, longitude } (either the
// user's current location or a clicked map point). Calls onSave({name,notes}).
export default function SaveLocationForm({ pin, onSave, onCancel, isCurrent }) {
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({ name: name.trim(), notes: notes.trim() })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="panel-card" onSubmit={submit}>
      <h3 style={{ marginTop: 0 }}>
        {isCurrent ? 'Pin current location' : 'Save selected point'}
      </h3>
      {pin.label && <p className="resolved-address">{pin.label}</p>}
      <p className="coords">
        {pin.latitude.toFixed(6)}, {pin.longitude.toFixed(6)}
      </p>

      <label>
        Name (optional)
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Home, Office, Trailhead"
          autoFocus
        />
      </label>

      <label>
        Notes (optional)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Anything worth remembering about this spot"
        />
      </label>

      <div className="row-buttons">
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save location'}
        </button>
      </div>
    </form>
  )
}
