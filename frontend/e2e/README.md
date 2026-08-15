# Testy E2E (Playwright)

Testy end-to-end klikają po prawdziwym UI i uderzają w prawdziwe API, więc
wymagają **działającego całego stacku** (frontend + backend + Postgres z seedem).
Playwright sam bazy nie postawi.

## Uruchomienie lokalne

```bash
# 1. Postaw stack (z katalogu glownego repo) — front :5174, backend :4001, db :5434
docker compose up -d
#    (przy pierwszym razie backend zrobi migracje; seed: cd backend && npm run db:seed)

# 2. Zainstaluj przegladarki Playwright (jednorazowo)
cd frontend
npx playwright install chromium

# 3. Odpal testy
npm run e2e          # headless
npm run e2e:ui       # tryb UI (podglad krokow)
npm run e2e:report   # otworz raport HTML z ostatniego biegu
```

Adres aplikacji można nadpisać: `E2E_BASE_URL=http://localhost:8080 npm run e2e`
(np. żeby uderzyć w wersję produkcyjną z `docker-compose.prod.yml`).

## Zakres (iteracja 1)

Scenariusze są **read-only** — nie modyfikują danych, można je puszczać wielokrotnie
na tym samym seedzie. Konto: `admin@umg.edu.pl` / `Admin1234!` (z `prisma/seed.ts`).

- **`auth.spec.ts`** — logowanie poprawne (wejście do aplikacji), błędne hasło
  (komunikat + zostaje na `/login`), zła walidacja e-maila po stronie klienta,
  ochrona tras (wejście bez logowania → redirect na `/login`).
- **`navigation.spec.ts`** — po zalogowaniu przejście do widoku Wydziały.

## Do dołożenia później

Scenariusze mutujące dane (dodanie/edycja) i **wykrywanie konfliktów** przy drag&drop
w planie zajęć — wymagają dedykowanego setupu/teardownu danych (osobny seed testowy
lub czyszczenie po teście), żeby zostały deterministyczne.
