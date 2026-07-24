-- Dopasowanie kopii starej bazy (planista7_legacy) do schematu planista7.
-- Roznice: bloki czasowe zamiast tekstowych godzin, startSemesterType w siatce,
-- brak kolumny semester w grupach.

\set ON_ERROR_STOP on
BEGIN;

-- ── 1. Wzorce tygodnia: godziny -> bloki czasowe ──────────────────────────
ALTER TABLE "ScheduleTemplate" ADD COLUMN "startBlockId" text;
ALTER TABLE "ScheduleTemplate" ADD COLUMN "endBlockId" text;

UPDATE "ScheduleTemplate" t
   SET "startBlockId" = b.id
  FROM tb_map b
 WHERE b.start_time = t."startTime";

UPDATE "ScheduleTemplate" t
   SET "endBlockId" = b.id
  FROM tb_map b
 WHERE b.end_time = t."endTime";

-- ── 2. Konkretne terminy: godziny -> bloki czasowe ────────────────────────
ALTER TABLE "ScheduleEntry" ADD COLUMN "startBlockId" text;
ALTER TABLE "ScheduleEntry" ADD COLUMN "endBlockId" text;

UPDATE "ScheduleEntry" e
   SET "startBlockId" = b.id
  FROM tb_map b
 WHERE b.start_time = e."startTime";

UPDATE "ScheduleEntry" e
   SET "endBlockId" = b.id
  FROM tb_map b
 WHERE b.end_time = e."endTime";

-- Zaden rekord nie moze zostac bez bloku — jesli tak, import trzeba przerwac.
DO $$
DECLARE missing int;
BEGIN
  SELECT (SELECT count(*) FROM "ScheduleTemplate" WHERE "startBlockId" IS NULL OR "endBlockId" IS NULL)
       + (SELECT count(*) FROM "ScheduleEntry"    WHERE "startBlockId" IS NULL OR "endBlockId" IS NULL)
    INTO missing;
  IF missing > 0 THEN
    RAISE EXCEPTION 'Nie udalo sie zmapowac % rekordow na bloki czasowe', missing;
  END IF;
END $$;

ALTER TABLE "ScheduleTemplate" ALTER COLUMN "startBlockId" SET NOT NULL;
ALTER TABLE "ScheduleTemplate" ALTER COLUMN "endBlockId"   SET NOT NULL;
ALTER TABLE "ScheduleEntry"    ALTER COLUMN "startBlockId" SET NOT NULL;
ALTER TABLE "ScheduleEntry"    ALTER COLUMN "endBlockId"   SET NOT NULL;

-- Kolumny, ktorych planista7 juz nie ma.
ALTER TABLE "ScheduleTemplate" DROP COLUMN "startTime", DROP COLUMN "endTime", DROP COLUMN "academicHours";
ALTER TABLE "ScheduleEntry"    DROP COLUMN "startTime", DROP COLUMN "endTime", DROP COLUMN "academicHours";

-- ── 3. Siatka godzin: typ semestru startowego ─────────────────────────────
-- Cale dane to rok 2024/2025 z kalendarzem WINTER jako pierwszym semestrem,
-- wiec nabor pazdziernikowy dla wszystkich wersji.
ALTER TABLE "CurriculumVersion" ADD COLUMN "startSemesterType" text NOT NULL DEFAULT 'WINTER';

-- ── 4. Grupy: semestr jest teraz wlasciwoscia planu, nie grupy ────────────
ALTER TABLE "StudentGroup" DROP COLUMN semester;

COMMIT;
