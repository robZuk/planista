# Multi-stage: baza zaleznosci -> dev (vite HMR) / build (statyki) / runner (nginx).
# Frontend to SPA — w prod nie ma wlasnego serwera Node, statyki podaje nginx.

# ---- baza: zaleznosci ----
FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---- dev: kod montowany przez compose, vite z HMR ----
FROM base AS dev
# --host => vite nasluchuje na 0.0.0.0, inaczej z hosta go nie widac.
CMD ["npm", "run", "dev", "--", "--host"]

# ---- build: produkcyjny build SPA -> dist/ ----
FROM base AS build
# Zmienne VITE_* wpiekaja sie do bundla przy `vite build` -> musza byc TU (build-time),
# przekazane jako build-arg z CI. VITE_SENTRY_DSN jest publiczny (widoczny w bundlu) —
# to nie sekret. Brak = error-tracking frontendu wylaczony.
ARG VITE_SENTRY_DSN
ARG VITE_GIT_SHA
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_GIT_SHA=$VITE_GIT_SHA
COPY . .
RUN npm run build

# ---- runner (prod): nginx serwuje statyki + proxuje /api na backend ----
# Obraz "unprivileged" — nginx dziala jako nie-root (uid 101), stad listen 8080
# (nie-root nie zbinduje portu <1024). Least privilege dla warstwy frontu.
FROM nginxinc/nginx-unprivileged:alpine AS runner
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
