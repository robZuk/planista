-- Rezygnacja z flagi aktywnosci siatki godzin.
-- Wszystkie siatki sa odtad brane pod uwage (m.in. przy generowaniu grup).
ALTER TABLE "CurriculumVersion" DROP COLUMN "isActive";
