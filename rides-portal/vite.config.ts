import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const buildDate = process.env.VITE_BUILD_DATE || process.env.BUILD_DATE || new Date().toISOString();
const buildShaRaw = process.env.VITE_GIT_SHA || process.env.GIT_SHA || process.env.COMMIT_SHA || 'unknown';
const buildSha = buildShaRaw === 'unknown' ? buildShaRaw : buildShaRaw.slice(0, 7);
const buildNumber = process.env.VITE_BUILD_NUMBER || process.env.BUILD_NUMBER || process.env.RELEASE_NUMBER || process.env.RELEASE_VERSION || 'dev';

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_BUILD_DATE': JSON.stringify(buildDate),
    'import.meta.env.VITE_GIT_SHA': JSON.stringify(buildSha),
    'import.meta.env.VITE_BUILD_NUMBER': JSON.stringify(buildNumber),
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
