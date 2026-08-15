/**
 * Blad domenowy/HTTP rzucany z kontrolerow. Centralny errorHandler tlumaczy go
 * na odpowiedz { error } z wlasciwym statusem. Dzieki temu kontrolery nie musza
 * powtarzac try/catch + res.status — wystarczy `throw new AppError(404, '...')`.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
