# Zrzut bazy `planista7`

`planista7-dump.sql` to pełny zrzut bazy (schemat + dane) z rokiem akademickim
2024/2025 — ten sam, który powstał z importu `backup.sql`. Plik jest **oczyszczony**,
więc może leżeć w repozytorium (zwykły `pg_dump` nie może — patrz niżej).

Zrzut zrobiony `pg_dump --clean --if-exists --no-owner --no-privileges`, więc
wgrywa się do dowolnej bazy i sam usuwa to, co w niej zastanie.

## Co zawiera

| Tabela | Wierszy |
|---|---|
| `ScheduleEntry` | 3327 |
| `ScheduleTemplate` | 243 |
| `CurriculumEntry` | 423 |
| `Subject` | 191 |
| `StudentGroup` | 81 |
| `Room` | 28 |
| `Instructor` | 21 |
| `TimeBlock` | 13 |
| `User` | 4 |
| `RefreshToken` | 0 |

`_prisma_migrations` (4 wpisy) jest w zrzucie, więc po wgraniu `prisma migrate status`
widzi bazę jako aktualną i nie próbuje migrować od zera.

## Czym różni się od stanu bazy roboczej

To jedyne dwie różnice — reszta danych jest 1:1:

- **`RefreshToken` jest pusty.** Tokeny sesji to sekrety, nie trafiają do gita.
  Po wgraniu trzeba się po prostu zalogować od nowa.
- **Hasła są przestawione na te z `backend/prisma/seed.ts`**, ze świeżymi solami
  bcrypt. Jeżeli w bazie roboczej zmieniłeś któreś hasło, w zrzucie go nie ma:

  | Konto | Hasło |
  |---|---|
  | `admin@umg.edu.pl` | `Admin1234!` |
  | `dziekanat@umg.edu.pl` | `Dziekanat1234!` |
  | `prowadzacy@umg.edu.pl` | `Prowadzacy1234!` |
  | `student@umg.edu.pl` | `Student1234!` |

To są hasła demonstracyjne i takie mają zostać. **Nie stawiaj na tym zrzucie
niczego wystawionego na świat** bez wcześniejszej zmiany haseł.

## Odtworzenie

```bash
docker compose up -d
docker exec -i planista7_db psql -U postgres -d planista7 -v ON_ERROR_STOP=1 < db/planista7-dump.sql
```

Do czystej bazy (gdyby `planista7` nie istniała):

```bash
docker exec planista7_db psql -U postgres -d postgres -c "CREATE DATABASE planista7;"
docker exec -i planista7_db psql -U postgres -d planista7 -v ON_ERROR_STOP=1 < db/planista7-dump.sql
```

## Odświeżenie zrzutu

`make-dump.sh` powtarza całą procedurę: kopiuje bazę roboczą, czyści kopię,
zrzuca ją i kasuje kopię. Baza `planista7` pozostaje nietknięta.

```bash
bash db/make-dump.sh
```

## Dlaczego nie zwykły `pg_dump`

`.gitignore` blokuje `backup.sql` i `*.sql.bak`, bo surowy zrzut niesie hashe haseł
i aktywne tokeny odświeżania (w bazie roboczej było ich 13). Ten plik przechodzi,
bo jednego i drugiego jest pozbawiony.
