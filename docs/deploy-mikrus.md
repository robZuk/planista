# Deploy na Mikrus 3.5

Runbook wdrożenia produkcyjnego Planisty na serwer Mikrus 3.5 (4 GB RAM / 25 GB,
LXC). Aplikacja jedzie w kontenerach (`docker-compose.prod.yml`): backend (Node),
frontend (nginx), Postgres — wszystko na jednym hoście.

> Miejsca oznaczone **[PANEL]** wymagają danych z panelu Mikrusa (ssp.mikr.us) —
> przydzielone porty, adres SSH, subdomena. Uzupełnij je u siebie.

## 0. Przed aktywacją (nic do zrobienia)
Kod jest już na GitHub: `github.com/robZuk/planista`. Deploy = sklonowanie repo
na serwerze i uruchomienie compose. Żadnych zmian w kodzie nie trzeba.

## 1. SSH na serwer
```bash
ssh root@srvXX.mikr.us -p PORT_SSH          # [PANEL] adres i port SSH
```

## 2. Docker + compose
```bash
curl -fsSL https://get.docker.com | sh       # instalacja Docker Engine + plugin compose
docker info | grep -i "Storage Driver"       # kontrola
```
> **Uwaga LXC:** jeśli Docker nie wstaje albo storage-driver zgłasza błąd, na LXC
> pomaga `fuse-overlayfs`: `apt-get install -y fuse-overlayfs`, potem w
> `/etc/docker/daemon.json` ustaw `{"storage-driver":"fuse-overlayfs"}` i
> `systemctl restart docker`.

## 3. Klon repo
```bash
git clone https://github.com/robZuk/planista.git
cd planista
```

## 4. Sekrety produkcyjne (.env.prod)
```bash
cp .env.prod.example .env.prod
# Wygeneruj mocne sekrety i wpisz do .env.prod:
openssl rand -base64 48    # -> JWT_ACCESS_SECRET
openssl rand -base64 48    # -> JWT_REFRESH_SECRET
# CORS_ORIGIN ustaw na publiczny adres (subdomena), np. https://planista.<...>   [PANEL]
```
`.env.prod` jest w `.gitignore` — nigdy nie trafia do repo.

## 5. Port publiczny
Ustaw `WEB_PORT` na jeden z **przydzielonych portów** Mikrusa **[PANEL]** — nginx
frontu będzie na nim nasłuchiwał. Domyślnie 8080 (lokalnie).
```bash
export WEB_PORT=XXXXX      # [PANEL] przydzielony port
```

## 6. Uruchomienie produkcyjne
```bash
WEB_PORT=$WEB_PORT docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
Backend na starcie robi `prisma migrate deploy` (tworzy schemat w pustej bazie).

## 7. Dane demo (pełny zbiór z repo)
Nowa baza jest pusta — wgraj oczyszczony zrzut (191 przedmiotów, 3327 terminów,
konta demo):
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec -T db psql -U postgres -d planista7 < db/planista7-dump.sql
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart backend
```
Konta demo (hasła w `README.md`): `admin@umg.edu.pl` / `Admin1234!` itd.

## 8. Weryfikacja (lokalnie na serwerze)
```bash
curl -s localhost:$WEB_PORT/health                          # {"data":{"status":"ok",...}}
curl -s localhost:$WEB_PORT | grep -o '<title>[^<]*</title>'  # <title>Planista</title>
```

## 9. Wystawienie na świat: subdomena + HTTPS
**[PANEL]** W panelu Mikrusa podepnij subdomenę / integrację Cloudflare do portu
`WEB_PORT`. Po podpięciu:
- HTTPS załatwia Mikrus/Cloudflare (nie trzeba certów w aplikacji),
- ustaw `CORS_ORIGIN` w `.env.prod` na finalny adres i zrób redeploy (krok 10).
> Dzięki temu, że front woła `/api` **relatywnie**, nie trzeba nigdzie wpisywać
> adresu backendu — działa pod każdą domeną.

## 10. Aktualizacja (redeploy)
```bash
cd planista && git pull
WEB_PORT=$WEB_PORT docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
Dane w bazie zostają (wolumen `planista_pgdata`). To docelowo zautomatyzuje CD
(GitHub Actions -> build obrazów -> deploy).

## Uwagi / hardening
- **Hasło bazy**: w compose jest `password` — baza NIE jest wystawiona na zewnątrz
  w prod (brak portu hosta dla `db`, dostęp tylko w sieci compose), ale do realnego
  prod warto je zmienić (w `docker-compose.yml` + `DATABASE_URL`).
- **Rate-limit** na logowaniu i `trust proxy` są już w kodzie.
- **Restart serwera**: `restart: unless-stopped` sprawia, że kontenery wstają same.
