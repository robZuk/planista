import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

// Testy API na poziomie HTTP (supertest) — bez bazy. Prisma mockowana, wiec sprawdzamy
// wiring aplikacji (createApp), health, walidacje wejscia i straznika uwierzytelniania.
// Sciezki, ktore i tak nie dotykaja bazy (400, 401), oraz login z pustym userem (401).
vi.mock('./lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn().mockResolvedValue(null) }, // brak usera -> login 401
    refreshToken: { create: vi.fn() },
  },
}));

import { createApp } from './index';

const app = createApp();

describe('API — health', () => {
  it('GET /health -> 200 { data: { status: ok } }', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });
});

describe('API — logowanie', () => {
  it('POST /api/auth/login bez pol -> 400 (walidacja wejscia)', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it('POST /api/auth/login zle dane -> 401 (ten sam komunikat dla emaila i hasla)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ktos@umg.edu.pl', password: 'zle-haslo' });
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/login zly format emaila -> 400 (walidacja zod przez errorHandler)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'to-nie-email', password: 'cokolwiek' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });
});

describe('API — nieznana trasa', () => {
  it('GET /api/nie-ma-takiej -> 404 { error } (fallback + errorHandler)', async () => {
    const res = await request(app).get('/api/nie-ma-takiej');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });
});

describe('API — straznik uwierzytelniania', () => {
  it('GET /api/auth/me bez tokenu -> 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/token/i);
  });

  it('GET /api/auth/me z niewaznym tokenem -> 401', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer bez-sensu');
    expect(res.status).toBe(401);
  });
});
