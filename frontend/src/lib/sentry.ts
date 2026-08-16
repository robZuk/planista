import * as Sentry from '@sentry/react';

/**
 * Error-tracking frontendu (Better Stack — SDK Sentry-kompatybilne).
 *
 * Wlaczane TYLKO gdy ustawiony `VITE_SENTRY_DSN` — zmienna wpieka sie do bundla przy
 * `vite build` (build-arg z CI). Dev / lokalny build bez DSN = wylaczone (init pomijany),
 * a `Sentry.captureException` / `reactErrorHandler` staja sie no-op.
 *
 * DSN przegladarkowy jest PUBLICZNY z zalozenia (widoczny w bundlu) — to NIE sekret,
 * tylko rate-limitowany endpoint przyjmujacy zdarzenia.
 *
 * PRYWATNOSC: bez Session Replay (nagrywalby pola formularzy, w tym haslo);
 * `sendDefaultPii: false`. Lapiemy wylacznie bledy (uncaught JS, odrzucone promisy,
 * crash renderu React).
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_GIT_SHA || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0, // tylko bledy, bez performance/tracingu
  });
}

export { Sentry };
