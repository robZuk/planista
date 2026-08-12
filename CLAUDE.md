# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Wskazówki dla Claude Code przy pracy w tym repozytorium. Szczegóły domenowe
(model danych, semantyka pól) są w `docs/model-danych.md` i w `README.md`.

## Czym jest projekt

Planista 7 — system układania planu zajęć dla uczelni. Backend przeniesiony
z planista6 bez zmiany logiki; frontend napisany od nowa. Porty są celowo inne
niż w planista6 (4000/5433/5173), więc oba projekty mogą działać równolegle.

- **Backend:** Node.js + Express + TypeScript, ORM Prisma — port **4001**
- **Baza:** PostgreSQL 16 w Dockerze — host port **5434**
- **Frontend:** React 19 + Vite + TypeScript + Tailwind 4 + shadcn/ui — port **5174** (`strictPort`)

## Uruchamianie (dev)

```bash
# 1. Baza (katalog główny) — kontener planista7_db, Postgres na :5434
docker compose up -d

# 2. Backend (:4001)
cd backend
cp .env.example .env        # przy pierwszym uruchomieniu
npm install
npx prisma migrate deploy   # albo: npm run prisma:migrate
npm run db:seed
npm run dev

# 3. Frontend (:5174, drugi terminal)
cd frontend
npm install
npm run dev
```

Health-check backendu: `GET http://localhost:4001/health` (poza prefiksem
`/api`). Wszystkie właściwe endpointy są pod `/api/*` i wymagają tokenu JWT.

Port frontu jest ustawiony na sztywno (`strictPort`) — jeśli 5174 jest zajęty,
Vite zatrzyma się z błędem zamiast przejść na kolejny wolny port (inaczej łatwo
pomylić planista7 z uruchomioną obok planista6).

## Polecenia

**Backend** (`backend/`)
- `npm run dev` — serwer z hot-reloadem (`tsx watch`)
- `npm run build` — `tsc` (kompilacja do `dist/`)
- `npm run db:seed` — seed bazy (`prisma/seed.ts`)
- `npm run prisma:migrate` / `prisma:generate` / `prisma:studio`

**Frontend** (`frontend/`)
- `npm run dev` — Vite dev server
- `npm run build` — `tsc -b && vite build` (typecheck + build produkcyjny)
- `npm run lint` — `oxlint`
- `npm run preview` — podgląd builda

> **Brak jednego polecenia „test all".** Uruchamiaj polecenia w katalogu
> `backend/` lub `frontend/`, nie w katalogu głównym (root nie ma `package.json`).

## Testy

Testy jednostkowe stoją na **Vitest**, **osobno per pakiet** (root nie ma
`package.json`) — uruchamiaj `npm test` w `backend/` albo w `frontend/`, nie w
katalogu głównym. Wspólny jest tylko runner, nie konfiguracja.

- **Backend** (`backend/`): `npm test` / `npm run test:watch`. Config w
  `vitest.config.mts` (`environment: node`). Prisma jest **mockowana** przez
  `vi.mock('../lib/prisma')`, więc testy nie wymagają bazy ani zmiennych
  środowiskowych. Pliki `*.test.ts` są wykluczone z builda `tsc` (patrz
  `exclude` w `tsconfig.json`), więc nie trafiają do `dist/`. Pokryte:
  `services/scheduleValidation`, `lib/scheduleTime`, `lib/semester`.
- **Frontend** (`frontend/`): `npm test` / `npm run test:watch`. Config w
  `vitest.config.ts` (osobny od `vite.config.ts`, z tym samym aliasem `@`).
  Pierwsza iteracja to **czysta logika** z `src/lib` (bez DOM): `semester`,
  `scheduleConflicts`, `planScope`, `unplannedItems`.

Zakres startowy to wyłącznie czysta logika domenowa — **nie ma** jeszcze testów
komponentów React ani tras Express (supertest). `createApp()` w
`backend/src/index.ts` jest wyeksportowane właśnie pod przyszłe testy API bez
nasłuchiwania na porcie (serwer startuje tylko przy `require.main === module`).

Weryfikacja zmian UI wciąż idzie przez uruchomienie aplikacji (skill `/verify`).

## Architektura

**Backend** — klasyczny podział warstwowy:
- `src/routes/*` — definicje tras Express (montowane pod `/api/*` w `index.ts`)
- `src/controllers/*` — obsługa żądań (walidacja wejścia, wywołanie logiki, odpowiedź)
- `src/services/*` — logika domenowa (m.in. `scheduleValidation.ts`)
- `src/lib/*` — współdzielone helpery czyste i dostęp do zasobów:
  - `prisma.ts` — **singleton PrismaClient**; nigdy nie rób `new PrismaClient()`, importuj `prisma` stąd
  - `scheduleTime.ts` — logika czasowa planu (bloki, nakładanie zakresów, okna trybu studiów)
  - `semester.ts` — typ semestru (zimowy/letni) liczony od semestru startowego programu
  - `groupFamily.ts` — rodzina grup (wykład → ćwiczenia → lab)
- `src/middleware/authenticate.ts` — weryfikacja JWT; role w enumie `Role`
- `prisma/schema.prisma` — źródło prawdy o modelu danych (17 modeli, m.in.
  `ScheduleTemplate`, `ScheduleEntry`, `CurriculumEntry`, `SemesterCalendar`)

**Frontend** — React 19 + Vite:
- `src/pages/*` — strony (routing `react-router-dom`)
- `src/api/*` — klienci HTTP per zasób (axios, `src/lib/api.ts`)
- `src/store/*` — stan globalny współdzielony między stronami (**zustand**):
  `authStore`, `academicYearStore`, `facultyStore`, `fieldFilterStore`
- `src/lib/*` — logika czysta wielokrotnego użytku (`planScope`, `scheduleDisplay`,
  `unplannedItems`, `semester`, `scheduleConflicts`)
- Dane serwera przez **TanStack Query**; formularze przez react-hook-form + zod;
  drag & drop planu przez dnd-kit; UI to shadcn/ui (preset `nova`, baza Radix)

### Rozdział „Wzorzec" vs „Kalendarz"

Kluczowa reguła domenowa: **wzorzec tygodnia i kalendarz semestru to dwa
rozdzielone światy.**
- `validateTemplate` patrzy WYŁĄCZNIE na inne wzorce (`ScheduleTemplate`),
  `validateEntry` wyłącznie na inne terminy (`ScheduleEntry`).
- Spotykają się dopiero przy generowaniu semestru (tam konflikty liczy generator).
- **Nie** „naprawiaj" tego, dokładając zapytań o `ScheduleEntry` w walidacji wzorca.

Typ semestru (zimowy/letni) liczy się naprzemiennie od `CurriculumVersion.startSemesterType`,
a **nie** z parzystości numeru — przy naborze lutowym semestr 1 jest letni.
Zajęcia różnych typów semestru nigdy nie kolidują (mogą dzielić salę/prowadzącego/slot).

Filtry wyświetlania w widoku Plan zajęć są **lokalne** (`useState`) — resetują się
po wyjściu z widoku i powrocie. Rok akademicki, wydział i kierunek mają osobne
store'y zustand (współdzielone między stronami).

## Konwencje

- **Język:** komentarze, komunikaty i wiadomości commitów po polsku, zwykle
  **bez znaków diakrytycznych** (`walidacja`, `konflikt`, `poludnie UTC`).
- **Commity:** format `Obszar: opis` (np. `Kalendarz: usuwanie terminu honoruje
  zakres serii (ONE/ALL)`). Po polsku, bez diakrytyków.
- **Praca na gałęziach:** nie commituj bezpośrednio na `main` — załóż gałąź.
- **Scalanie (zasada hybrydowa):** sposób merge'a zależy od liczby commitów na gałęzi:
  - **jeden commit** → fast-forward albo rebase na `main` (bez merge-commita) —
    historia zostaje liniowa, bez pustych `Merge branch 'x'`.
  - **kilka commitów tworzących jeden feature** → `--no-ff` (merge-commit grupuje
    całość, umożliwia `revert -m`), albo `--squash` gdy ma zostać jeden wpis w `main`.
- **Czas w planie:** wyrażany blokami 1-godzinnymi (`TimeBlock.order`), nie
  stringami godzin. Konflikt czasu = nakładanie zakresów `order` (`rangesOverlap`).
- **Daty semestru:** generator używa **południa UTC** (odporność na DST).
- **TypeScript:** `strict` po obu stronach; backend CommonJS, frontend ESM.

## Uwaga o strefie sieci

Aplikacja wymaga zalogowania (JWT). Endpointy `/api/*` bez ważnego tokenu zwracają
401 — dlatego ręczny `curl` do API bez nagłówka `Authorization` zawsze da
„Brak tokenu uwierzytelniajacego". Do weryfikacji przechodź przez UI (które loguje).
