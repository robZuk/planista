import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Alias "@" -> katalog src (konwencja shadcn/ui). Import: import x from '@/lib/x'
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    // Bez tego Vite po cichu przeskakuje na wolny port, gdy 5174 jest zajety
    // (np. przez uruchomiona planista6) — i latwo testowac nie ten projekt.
    strictPort: true,
    // Proxy: zadania z frontendu na /api ida do backendu na 4001.
    // Dzieki temu w kodzie frontu wolamy po prostu fetch('/api/...').
    proxy: {
      '/api': 'http://localhost:4001',
      '/health': 'http://localhost:4001',
    },
  },
});
