import { randomUUID } from 'node:crypto';
import pinoHttp from 'pino-http';
import { logger } from '../lib/logger';

/**
 * Middleware logujacy KAZDE zadanie HTTP (pino-http). Dla kazdego zadania:
 *  - nadaje `request-id` (i zwraca go w naglowku `x-request-id`) — wszystkie logi
 *    z jednego zadania maja ten sam id, wiec da sie je przesledzic end-to-end,
 *  - loguje na koniec: metoda, URL, status i CZAS odpowiedzi,
 *  - udostepnia `req.log` (child logger z req-id) do logowania w trakcie zadania.
 *
 * Poziom logu zalezy od wyniku: 5xx/blad -> error, 4xx -> warn, reszta -> info.
 * Health-check i Swagger pomijamy (czeste pingi = szum).
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (_req, res) => {
    const id = randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  autoLogging: {
    ignore: (req) => req.url === '/health' || (req.url?.startsWith('/api/docs') ?? false),
  },
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Domyslnie pino-http wrzuca cale naglowki req/res — za duzo szumu. Logujemy tylko
  // to, co istotne: metoda + URL + status (request-id i tak jest w logu z pino-http).
  serializers: {
    req: (req) => ({ method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
