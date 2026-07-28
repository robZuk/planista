-- Wydzial jako jednostka organizacyjna planu zajec.
--
-- 1. ScheduleTemplate i ScheduleEntry dostaja facultyId (NOT NULL, backfill z siatki).
-- 2. SemesterCalendar dostaje opcjonalny facultyId (null = ogolnouczelniany).
-- 3. Usuniecie wzorca przestaje kasowac terminy — templateId przechodzi na ON DELETE SET NULL.
-- 4. ScheduleEntry.originalDate znika: sluzylo wylacznie idempotencji generatora,
--    ktora przestaje istniec (generowanie nadpisuje kalendarz wydzialu w calosci).

-- ─── 1. Nowe kolumny (na razie nullable, zeby zrobic backfill) ───
ALTER TABLE "ScheduleTemplate" ADD COLUMN "facultyId" TEXT;
ALTER TABLE "ScheduleEntry"    ADD COLUMN "facultyId" TEXT;
ALTER TABLE "SemesterCalendar" ADD COLUMN "facultyId" TEXT;

-- ─── 2. Backfill z lancucha siatki ───
-- CurriculumEntry -> CurriculumVersion -> Specialization -> FieldOfStudy.facultyId
-- Wszystkie klucze obce po drodze sa wymagane, wiec kazdy wiersz dostanie wartosc.
UPDATE "ScheduleTemplate" t
SET "facultyId" = f."facultyId"
FROM "CurriculumEntry" ce
JOIN "CurriculumVersion" cv ON cv."id" = ce."curriculumVersionId"
JOIN "Specialization"    s  ON s."id"  = cv."specializationId"
JOIN "FieldOfStudy"      f  ON f."id"  = s."fieldOfStudyId"
WHERE ce."id" = t."curriculumEntryId";

UPDATE "ScheduleEntry" e
SET "facultyId" = f."facultyId"
FROM "CurriculumEntry" ce
JOIN "CurriculumVersion" cv ON cv."id" = ce."curriculumVersionId"
JOIN "Specialization"    s  ON s."id"  = cv."specializationId"
JOIN "FieldOfStudy"      f  ON f."id"  = s."fieldOfStudyId"
WHERE ce."id" = e."curriculumEntryId";

-- Bramka: jesli backfill czegos nie pokryl, migracja ma paść tutaj, a nie przy SET NOT NULL.
DO $$
DECLARE braki INT;
BEGIN
  SELECT (SELECT count(*) FROM "ScheduleTemplate" WHERE "facultyId" IS NULL)
       + (SELECT count(*) FROM "ScheduleEntry"    WHERE "facultyId" IS NULL)
  INTO braki;
  IF braki > 0 THEN
    RAISE EXCEPTION 'Backfill facultyId niekompletny: % wierszy bez wydzialu', braki;
  END IF;
END $$;

-- ─── 3. NOT NULL + klucze obce + indeksy ───
ALTER TABLE "ScheduleTemplate" ALTER COLUMN "facultyId" SET NOT NULL;
ALTER TABLE "ScheduleEntry"    ALTER COLUMN "facultyId" SET NOT NULL;

ALTER TABLE "ScheduleTemplate" ADD CONSTRAINT "ScheduleTemplate_facultyId_fkey"
  FOREIGN KEY ("facultyId") REFERENCES "Faculty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_facultyId_fkey"
  FOREIGN KEY ("facultyId") REFERENCES "Faculty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SemesterCalendar" ADD CONSTRAINT "SemesterCalendar_facultyId_fkey"
  FOREIGN KEY ("facultyId") REFERENCES "Faculty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ScheduleTemplate_facultyId_academicYear_semester_studyMode_idx"
  ON "ScheduleTemplate"("facultyId", "academicYear", "semester", "studyMode");
CREATE INDEX "ScheduleEntry_facultyId_date_idx"
  ON "ScheduleEntry"("facultyId", "date");

-- ─── 4. Usuniecie wzorca nie kasuje juz terminow ───
ALTER TABLE "ScheduleEntry" DROP CONSTRAINT "ScheduleEntry_templateId_fkey";
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "ScheduleTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 5. originalDate juz do niczego nie sluzy ───
ALTER TABLE "ScheduleEntry" DROP COLUMN "originalDate";

-- ─── 6. Kalendarz semestru schodzi na poziom wydzialu ───
DROP INDEX "SemesterCalendar_academicYear_semesterType_studyMode_key";
CREATE UNIQUE INDEX "SemesterCalendar_academicYear_semesterType_studyMode_facultyId_key"
  ON "SemesterCalendar"("academicYear", "semesterType", "studyMode", "facultyId");
