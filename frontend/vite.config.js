import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, /api is proxied to the local Kalshi HTTP API (win-prediction/http_api.py).
// In production, set VITE_API_BASE_URL to the API Gateway URL instead.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
});
