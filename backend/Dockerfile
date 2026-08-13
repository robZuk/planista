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
# Na starcie: najpierw dogonienie migracji, potem serwer.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
