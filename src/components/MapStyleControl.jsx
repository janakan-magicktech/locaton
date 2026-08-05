// Map layer toggle: standard vector vs satellite imagery.
export default function MapStyleControl({ mapStyle, onChange }) {
  return (
    <div className="map-style-control">
      <button
        type="button"
        className={mapStyle === 'standard' ? 'active' : ''}
        onClick={() => onChange('standard')}
        title="Standard map"
      >
        Map
      </button>
      <button
        type="button"
        className={mapStyle === 'satellite' ? 'active' : ''}
        onClick={() => onChange('satellite')}
        title="Satellite imagery"
      >
        Satellite
      </button>
    </div>
  )
}
