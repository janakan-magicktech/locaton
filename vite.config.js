import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// sql.js is a UMD/CommonJS module, so let Vite pre-bundle it (esbuild converts
// CJS -> ESM). Its .wasm binary is imported as a bundled asset URL in
// src/services/db.js (via `?url`), so the wasm version always matches the
// installed package. No CDN needed.
export default defineConfig({
  plugins: [react()],
})
