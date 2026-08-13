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
COPY . .
RUN npm run build

# ---- runner (prod): nginx serwuje statyki + proxuje /api na backend ----
FROM nginx:alpine AS runner
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
