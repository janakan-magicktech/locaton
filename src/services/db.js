// -----------------------------------------------------------------------------
// sql.js (SQLite compiled to WebAssembly) running in-browser, with the whole
// database file persisted to IndexedDB so data survives page reloads.
//
// Flow:
//   initDb()  -> load sql.js wasm, restore bytes from IndexedDB (if any),
//                open the DB, create tables if missing.
//   persist() -> export the DB to a Uint8Array and store it in IndexedDB.
//                Called after every write.
// -----------------------------------------------------------------------------
import initSqlJs from 'sql.js'
// Bundled wasm asset URL — guarantees the wasm matches the installed sql.js
// version. Vite rewrites this to the correct hashed asset path at build time.
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

const IDB_NAME = 'find-my-location'
const IDB_STORE = 'sqlite'
const IDB_KEY = 'db-file'

let SQL = null // the sql.js module (constructor namespace)
let db = null // the active Database instance

// --- tiny IndexedDB helpers (single key/value store holding the DB file) -----

function openIndexedDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => {
      const idb = req.result
      if (!idb.objectStoreNames.contains(IDB_STORE)) {
        idb.createObjectStore(IDB_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(key) {
  const idb = await openIndexedDb()
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readonly')
    const req = tx.objectStore(IDB_STORE).get(key)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(key, value) {
  const idb = await openIndexedDb()
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// --- schema ------------------------------------------------------------------

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS saved_locations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT,
    latitude   REAL NOT NULL,
    longitude  REAL NOT NULL,
    notes      TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recorded_routes (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    saved_location_id INTEGER NOT NULL,
    latitude          REAL NOT NULL,
    longitude         REAL NOT NULL,
    timestamp         TEXT NOT NULL,
    FOREIGN KEY (saved_location_id) REFERENCES saved_locations(id)
  );

  CREATE INDEX IF NOT EXISTS idx_recorded_routes_loc
    ON recorded_routes(saved_location_id, id);
`

// --- lifecycle ---------------------------------------------------------------

export async function initDb() {
  if (db) return db

  SQL = await initSqlJs({
    // Point sql.js at the bundled, version-matched wasm asset.
    locateFile: () => sqlWasmUrl,
  })

  const stored = await idbGet(IDB_KEY)
  db = stored ? new SQL.Database(new Uint8Array(stored)) : new SQL.Database()

  db.run(SCHEMA)
  await persist()
  return db
}

// Export the in-memory DB and write the bytes to IndexedDB. Call after writes.
export async function persist() {
  if (!db) return
  const data = db.export() // Uint8Array
  await idbPut(IDB_KEY, data)
}

// --- query helpers -----------------------------------------------------------

// Convert a sql.js exec() result into an array of row objects.
function rows(execResult) {
  if (!execResult.length) return []
  const { columns, values } = execResult[0]
  return values.map((row) =>
    Object.fromEntries(row.map((val, i) => [columns[i], val])),
  )
}

// --- saved_locations ---------------------------------------------------------

export async function saveLocation({ name, latitude, longitude, notes }) {
  const createdAt = new Date().toISOString()
  db.run(
    `INSERT INTO saved_locations (name, latitude, longitude, notes, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [name || null, latitude, longitude, notes || null, createdAt],
  )
  const id = rows(db.exec('SELECT last_insert_rowid() AS id'))[0].id
  await persist()
  return { id, name, latitude, longitude, notes, created_at: createdAt }
}

export function getSavedLocations() {
  return rows(
    db.exec('SELECT * FROM saved_locations ORDER BY created_at DESC'),
  )
}

export async function deleteSavedLocation(id) {
  db.run('DELETE FROM recorded_routes WHERE saved_location_id = ?', [id])
  db.run('DELETE FROM saved_locations WHERE id = ?', [id])
  await persist()
}

// --- recorded_routes ---------------------------------------------------------

// Log one breadcrumb point during a tracking session.
export async function recordRoutePoint({ savedLocationId, latitude, longitude }) {
  db.run(
    `INSERT INTO recorded_routes (saved_location_id, latitude, longitude, timestamp)
     VALUES (?, ?, ?, ?)`,
    [savedLocationId, latitude, longitude, new Date().toISOString()],
  )
  await persist()
}

// Remove all recorded breadcrumbs for a destination (start a fresh trail).
export async function clearRecordedRoute(savedLocationId) {
  db.run('DELETE FROM recorded_routes WHERE saved_location_id = ?', [
    savedLocationId,
  ])
  await persist()
}

// Return the previously recorded breadcrumb path for a destination, ordered.
export function getRecordedRoute(savedLocationId) {
  return rows(
    db.exec(
      `SELECT latitude, longitude, timestamp
       FROM recorded_routes
       WHERE saved_location_id = ?
       ORDER BY id ASC`,
      [savedLocationId],
    ),
  )
}

// True only when a *usable* trail exists. A single breadcrumb is not a path
// (it draws no line and can't be fit to bounds), so we require at least two
// points before offering "Follow Previous Path".
export function hasRecordedRoute(savedLocationId) {
  const r = rows(
    db.exec(
      'SELECT COUNT(*) AS c FROM recorded_routes WHERE saved_location_id = ?',
      [savedLocationId],
    ),
  )
  return (r[0]?.c || 0) >= 2
}
