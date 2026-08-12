-- Kalendarz semestru zawsze nalezy do wydzialu.
--
-- Wariant ogolnouczelniany (facultyId = null) znika. Istniejace wiersze globalne
-- rozpisujemy najpierw na wydzialy, ktore nie maja jeszcze wlasnego kalendarza dla
-- tej samej czworki [rok, typ semestru, tryb, wydzial] — dzieki temu daty obowiazujace
-- dotad przez fallback zostaja zachowane co do dnia, a wydzialy z wlasnym kalendarzem
-- nie dostaja duplikatu.

INSERT INTO "SemesterCalendar" (
  "id", "academicYear", "semesterType", "studyMode",
  "startDate", "endDate", "teachingWeeks", "createdAt", "facultyId"
)
SELECT
  gen_random_uuid(),
  g."academicYear", g."semesterType", g."studyMode",
  g."startDate", g."endDate", g."teachingWeeks", g."createdAt",
  f."id"
FROM "SemesterCalendar" g
CROSS JOIN "Faculty" f
WHERE g."facultyId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "SemesterCalendar" own
    WHERE own."facultyId" = f."id"
      AND own."academicYear" = g."academicYear"
      AND own."semesterType" = g."semesterType"
      AND own."studyMode" = g."studyMode"
  );

DELETE FROM "SemesterCalendar" WHERE "facultyId" IS NULL;

ALTER TABLE "SemesterCalendar" ALTER COLUMN "facultyId" SET NOT NULL;
