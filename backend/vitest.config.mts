import { defineConfig } from 'vitest/config';

// Testy jednostkowe backendu. Prisma jest mockowana (vi.mock), wiec testy NIE
// wymagaja bazy danych ani zmiennych srodowiskowych — biegna czysto w pamieci.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
