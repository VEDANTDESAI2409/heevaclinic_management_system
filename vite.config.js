import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: { host: true, port: 5173, allowedHosts: true, proxy: { '/api': 'http://localhost:3001' } },
  preview: { host: true, port: 4173, allowedHosts: true },
  build: { chunkSizeWarningLimit: 2000 },
});
