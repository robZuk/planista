-- Czysci dane dziedzinowe planista7 przed importem kopii.
-- ZOSTAJA: konta uzytkownikow (te same adresy co w kopii, ale znane hasla),
-- tokeny odswiezania i bloki czasowe (na nie mapujemy godziny z kopii).

\set ON_ERROR_STOP on
BEGIN;
SET session_replication_role = replica;

DELETE FROM "_StudentGroupMembers";
DELETE FROM "ScheduleEntry";
DELETE FROM "ScheduleTemplate";
DELETE FROM "StudentGroup";
DELETE FROM "CurriculumEntry";
DELETE FROM "CurriculumVersion";
DELETE FROM "Subject";
DELETE FROM "Specialization";
DELETE FROM "FieldOfStudy";

-- Powiazanie konta z prowadzacym trzeba zdjac przed usunieciem prowadzacych.
UPDATE "User" SET "instructorId" = NULL;
DELETE FROM "Instructor";

DELETE FROM "Room";
DELETE FROM "Building";
DELETE FROM "Faculty";
DELETE FROM "SemesterCalendar";
DELETE FROM "PublicHoliday";

COMMIT;
