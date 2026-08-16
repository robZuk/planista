import * as Sentry from '@sentry/node';
import { logger } from './logger';

/**
 * Error-tracking (Better Stack — SDK Sentry-kompatybilne).
 *
 * Wlaczane TYLKO gdy ustawiony `SENTRY_DSN` — dev/test bez DSN = wylaczone (no-op),
 * wiec `Sentry.captureException` w kodzie jest bezpieczne nawet bez konfiguracji.
 *
 * PRYWATNOSC: `beforeSend` USUWA `event.request`, wiec do zewnetrznego systemu NIE leca
 * dane zadania (body / naglowki / cookies) — chroni m.in. haslo z `/api/auth/login`.
 * Bezpieczny kontekst (metoda, URL, request-id) dokladamy jawnie w `captureException`
 * (trafia do tags/extra, nie do event.request, wiec przezywa czyszczenie).
 */
export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.GIT_SHA || undefined, // powiazanie bledu z konkretnym deployem
    tracesSampleRate: 0, // tylko bledy, bez performance/tracingu
    sendDefaultPii: false,
    beforeSend(event) {
      // Nie wysylamy zadnych danych zadania (moglyby zawierac dane wrazliwe / haslo).
      delete event.request;
      return event;
    },
  });
  logger.info('Error-tracking (Sentry-compatible) wlaczony');
  return true;
}

export { Sentry };
