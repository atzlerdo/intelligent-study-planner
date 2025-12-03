import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

/**
 * Vite automatically loads environment variables in this order:
 * 1. .env - Default values (committed to git)
 * 2. .env.local - Local overrides (gitignored, use for actual credentials)
 * 3. .env.[mode] - Mode-specific (.env.development, .env.production)
 * 4. .env.[mode].local - Mode-specific local overrides
 */
export default defineConfig({
  plugins: [react(), tailwind()],
})
