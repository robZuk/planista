import pino from 'pino';

/**
 * Centralny logger (pino). Jedno miejsce konfiguracji poziomu i formatu.
 *
 * - PROD (`NODE_ENV=production`): surowy JSON na stdout — maszynowo-czytelny,
 *   gotowy pod `docker logs` / ewentualna agregacje (Loki/ELK). `pino-pretty`
 *   jest devDependency i na prod go NIE ma, wiec tu nie moze zostac uzyty.
 * - DEV: czytelne, kolorowe linie przez `pino-pretty`.
 *
 * Poziom sterowany `LOG_LEVEL` (domyslnie `info` na prod, `debug` w dev).
 */
const isProd = process.env.NODE_ENV === 'production';
// W testach cisza — zeby logi zadan (supertest) nie zasmiecaly outputu i nie odpalac
// workera pino-pretty. Bez transportu, poziom 'silent'.
const isTest = process.env.NODE_ENV === 'test';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isTest ? 'silent' : isProd ? 'info' : 'debug'),
  ...(isProd || isTest
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
});
