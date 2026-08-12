import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Testy jednostkowe frontendu — osobny config od vite.config.ts (build), zeby
// nie ciagnac do testow proxy/tailwind. Pierwsza iteracja to czysta logika z
// src/lib (bez DOM), stad environment 'node'; jsdom jest w zaleznosciach pod
// przyszle testy komponentow.
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Ten sam alias co w vite.config.ts i tsconfig — inaczej importy '@/...' padaja.
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
