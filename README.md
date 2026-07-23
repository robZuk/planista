# Planista 7

System układania planu zajęć dla uczelni. **Backend przeniesiony z planista6 bez zmian
logiki**, frontend napisany od nowa w oparciu o shadcn/ui (preset Nova, baza Radix).

## Stack

- **Backend:** Node.js + Express + TypeScript (port **4001**)
- **Baza:** PostgreSQL 16 w Dockerze (host port **5434**), ORM Prisma
- **Frontend:** React 19 + Vite + TypeScript + Tailwind 4 + shadcn/ui (port **5174**)

Porty są inne niż w planista6 (4000/5433/5173), więc **oba projekty mogą działać równolegle**.

### Biblioteki frontu

| Obszar | Wybór |
|---|---|
| Komponenty UI | shadcn/ui (preset `nova`, base `radix`), ikony lucide |
| Layout | shadcn `Sidebar` (zwijany, mobile jako Sheet) + `Breadcrumb` |
| Tabele | TanStack Table + shadcn `Table` (sortowanie, filtr, paginacja) |
| Formularze | react-hook-form + zod + shadcn `Field` |
| Dane serwera | TanStack Query + axios |
| Stan lokalny | zustand |
| Powiadomienia | sonner (`toast`) |
| Wykresy | shadcn `Chart` (recharts) |
| Paleta poleceń | shadcn `Command` (Ctrl+K) |
| Drag & drop planu | dnd-kit |
| Motyw jasny/ciemny | next-themes |

## Uruchomienie (dev)

```bash
# 1. Baza danych (w katalogu głównym)
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env      # przy pierwszym uruchomieniu
npm install
npx prisma migrate deploy # albo: npm run prisma:migrate
npm run db:seed
npm run dev               # http://localhost:4001

# 3. Frontend (w drugim terminalu)
cd frontend
npm install
npm run dev               # http://localhost:5174
```

> Port frontu jest ustawiony na sztywno (`strictPort`). Jeśli 5174 jest zajęty, Vite
> **zatrzyma się z błędem** zamiast po cichu przejść na kolejny wolny port — inaczej
> łatwo pomylić planista7 z uruchomioną obok planista6.

### Konta testowe (po seedzie)

| Rola        | Email                   | Hasło            |
|-------------|-------------------------|------------------|
| ADMIN       | admin@umg.edu.pl        | `Admin1234!`     |
| DEAN_OFFICE | dziekanat@umg.edu.pl    | `Dziekanat1234!` |
| INSTRUCTOR  | prowadzacy@umg.edu.pl   | `Prowadzacy1234!`|
| STUDENT     | student@umg.edu.pl      | `Student1234!`   |

## Postęp (fazy)

- [x] **Faza 0** — Fundamenty: kopia backendu (porty 4001/5434), szkielet Vite + Tailwind 4 + shadcn, motyw granatowy, `/health`
- [x] **Faza 1** — Layout: AppShell na shadcn Sidebar (zwijany, grupy sekcji), breadcrumbs, menu użytkownika z wyborem motywu
- [x] **Faza 2** — Auth: logowanie (rhf + zod), store zustand, `ProtectedRoute`, interceptor odświeżania tokenu
- [x] **Faza 3** — Generyczny `DataTable` (TanStack Table) + zasoby: wydziały, budynki/sale (Accordion), prowadzący, bloki czasowe — pełny CRUD z `AlertDialog` przy usuwaniu
- [x] **Faza 4** — Siatka godzin: zakładki (siatki / kierunki i specjalności / przedmioty), edytor wersji z semestrami w Accordionie, Combobox przedmiotów z wyszukiwaniem po kodzie
- [x] **Faza 5** — Grupy: dwustopniowy kreator (parametry → podgląd propozycji → zapis), drzewo hierarchii z wcięciami, edycja i kasowanie rocznika
- [x] **Faza 6** — Plan zajęć: wzorzec tygodnia (siatka dzień × godzina, drag&drop, dialog zajęć, bilans terminów, komunikaty konfliktów po polsku)
- [x] **Faza 7** — Plan zajęć: kalendarz tygodniowy z datami, generator terminów, odwoływanie i przenoszenie zajęć (jeden termin / cała seria), dni wolne
- [ ] **Faza 8** — Dashboardy per rola + wykresy
- [ ] **Faza 9** — Użytkownicy, impersonacja, paleta poleceń Ctrl+K
