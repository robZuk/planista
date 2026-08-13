# Multi-stage: wspolna baza zaleznosci -> dev (hot-reload) / build / runner (prod).
# Backend to CommonJS (node dist), laczy sie z baza przez DATABASE_URL.
#
# Uzywamy node:22-slim (Debian), nie alpine — silnik zapytan Prisma wymaga OpenSSL,
# a na alpine (musl) sprawia klopoty. openssl doinstalowujemy jawnie dla pewnosci.

# ---- baza: zaleznosci + wygenerowany klient Prisma ----
FROM node:22-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
# Najpierw manifesty — dopoki sie nie zmienia, warstwa npm ci jest z cache.
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate

# ---- dev: kod montowany przez compose, tsx watch restartuje przy zmianie ----
FROM base AS dev
# Komenda i tak przychodzi z compose (npm run dev); tu jako sensowny domyslny.
CMD ["npm", "run", "dev"]

# ---- build: kompilacja TypeScript -> dist/ ----
FROM base AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runner (prod): tylko prod-deps (prisma jest teraz dependency) + dist ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/dist ./dist

# Healthcheck: pyta /health przez node'a (slim nie ma curl/wget). Docker/orchestrator
# wie wtedy, czy zyje sama APLIKACJA, a nie tylko proces. start-period daje czas na
# migrate deploy + start serwera, zanim zaczniemy liczyc niepowodzenia.
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||4001)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Na starcie: najpierw dogonienie migracji, potem serwer.
# `exec` -> node zastepuje sh i staje sie PID 1, wiec dostaje SIGTERM bezposrednio
# (czyste zamkniecie przy docker stop, bez czekania na SIGKILL).
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/index.js"]
