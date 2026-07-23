import { PrismaClient } from '@prisma/client';

/**
 * Singleton PrismaClient — jedyna instancja w calej aplikacji.
 *
 * Dlaczego singleton?
 * Kazdy `new PrismaClient()` otwiera wlasna pule polaczen do bazy. W trybie dev,
 * gdzie ts-node-dev przeladowuje moduly przy kazdej zmianie, latwo bez tego
 * wyczerpac limit polaczen Postgresa. Trzymamy wiec jedna instancje na
 * `globalThis`, aby przetrwala przeladowania.
 *
 * ZASADA: nigdzie w kodzie nie robimy `new PrismaClient()` — importujemy `prisma` stad.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
