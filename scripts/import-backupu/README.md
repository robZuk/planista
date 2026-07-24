# Import danych z `backup.sql`

Kopia `backup.sql` pochodzi ze **starszej wersji schematu** Planisty, więc nie da się
jej wgrać wprost — trzeba ją najpierw dopasować. Różnice:

| Obszar | Kopia (stary schemat) | planista7 |
|---|---|---|
| Godziny zajęć | teksty `startTime` / `endTime` + `academicHours` | `startBlockId` / `endBlockId` → `TimeBlock` |
| Siatka godzin | brak | `startSemesterType` (nabór zimowy/letni) |
| Grupy | kolumna `semester` | brak — semestr należy do planu, nie do grupy |
| Bloki czasowe | brak tabeli | `TimeBlock` (13 bloków 07:00–20:00) |

Wszystkie godziny w kopii są pełne (07:00–20:00, zajęcia 1 h albo 2 h), więc mapują się
na bloki bez reszty: `startBlock` po `startTime`, `endBlock` po `endTime`.

## Procedura

Skrypty zakładają działający kontener `planista7_db` i kopię w katalogu głównym projektu.

```bash
# 1. Wgraj kopię do bazy roboczej (nie ruszamy jeszcze planista7).
#    Linie \restrict / \unrestrict z pg_dump 16.10 trzeba usunąć.
sed -e '1s/^\xEF\xBB\xBF//' -e '/restrict /d' backup.sql > /tmp/legacy.sql
docker exec planista7_db psql -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS planista7_legacy;" -c "CREATE DATABASE planista7_legacy;"
docker exec -i planista7_db psql -U postgres -d planista7_legacy < /tmp/legacy.sql

# 2. Zbuduj tabelę mapowania godzin na PRAWDZIWE id blokow z planista7.
docker exec planista7_db psql -U postgres -d planista7 -At -F'|' \
  -c 'SELECT "startTime", "endTime", id FROM "TimeBlock" ORDER BY "order";' \
  | awk -F'|' 'BEGIN{print "CREATE TABLE tb_map(start_time text PRIMARY KEY, end_time text, id text);"; print "INSERT INTO tb_map VALUES"} {printf "%s(\x27%s\x27,\x27%s\x27,\x27%s\x27)", (NR>1?",":""), $1,$2,$3} END{print ";"}' \
  | docker exec -i planista7_db psql -U postgres -d planista7_legacy

# 3. Dopasuj schemat kopii do planista7 (przerwie się, jeśli któraś godzina
#    nie trafi w blok czasowy).
docker exec -i planista7_db psql -U postgres -d planista7_legacy -v ON_ERROR_STOP=1 \
  < scripts/import-backupu/2-dopasuj-schemat.sql

# 4. Zrzuć same dane (bez User, RefreshToken i _prisma_migrations).
docker exec planista7_db pg_dump -U postgres -d planista7_legacy --data-only \
  -t '"Faculty"' -t '"FieldOfStudy"' -t '"Specialization"' -t '"Building"' -t '"Room"' \
  -t '"Instructor"' -t '"Subject"' -t '"CurriculumVersion"' -t '"CurriculumEntry"' \
  -t '"StudentGroup"' -t '"ScheduleTemplate"' -t '"ScheduleEntry"' \
  -t '"SemesterCalendar"' -t '"PublicHoliday"' > /tmp/dane.sql

# 5. ZRÓB KOPIĘ BEZPIECZEŃSTWA, wyczyść dane dziedzinowe i wgraj nowe.
docker exec planista7_db pg_dump -U postgres -d planista7 > /tmp/planista7-przed-importem.sql
docker exec -i planista7_db psql -U postgres -d planista7 -v ON_ERROR_STOP=1 \
  < scripts/import-backupu/3-wyczysc-planista7.sql
```

Zrzut z kroku 4 wgrywa się w transakcji z `SET session_replication_role = replica;`
(grupy mają odwołanie same do siebie, więc kolejność wstawiania nie może się udać
przy włączonych kluczach obcych). Po wgraniu trzeba **sprawdzić spójność ręcznie** —
wyłączone klucze obce nic nie walidują.

Na końcu odtwarzamy powiązania kont, których kopia nie niesie:

```sql
UPDATE "User" u SET "instructorId" = i.id FROM "Instructor" i
 WHERE u.email = 'prowadzacy@umg.edu.pl' AND i.email = 'j.kowalski@umg.edu.pl';
```

oraz członkostwa studenta w grupach (w kopii: `DUT-1-W`, `DUT-1-C-A`, `DUT-1-L-A1`).

## Czego import NIE rusza

- **kont użytkowników** — kopia ma te same cztery adresy, ale inne hashe haseł;
  zostawiamy konta z planista7, żeby nie zmieniać haseł do logowania,
- **tokenów odświeżania** — sesje ze starego systemu są bezużyteczne,
- **bloków czasowych** — to na nie mapujemy godziny,
- **`_prisma_migrations`** — historia migracji planista7 musi zostać nietknięta.
