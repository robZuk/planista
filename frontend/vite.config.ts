import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// Cel proxy /api: w kontenerze dev VITE_PROXY_TARGET=http://backend:4001,
// natywnie fallback na localhost:4001.
const proxyTarget = process.env.VITE_PROXY_TARGET ?? 'http://localhost:4001';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Alias "@" -> katalog src (konwencja shadcn/ui). Import: import x from '@/lib/x'
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // 0.0.0.0 — inaczej w kontenerze Vite slucha tylko na localhost i mapowanie
    // portu z hosta nie dociera. Natywnie nadal dostepne przez localhost.
    host: true,
    port: 5174,
    // Bez tego Vite po cichu przeskakuje na wolny port, gdy 5174 jest zajety
    // (np. przez uruchomiona planista6) — i latwo testowac nie ten projekt.
    strictPort: true,
    // Proxy: zadania z frontendu na /api ida do backendu.
    // Cel sterowany env-em: natywnie (npm run dev) -> localhost:4001,
    // w kontenerze dev -> http://backend:4001 (VITE_PROXY_TARGET z compose).
    proxy: {
      '/api': proxyTarget,
      '/health': proxyTarget,
    },
  },
});
