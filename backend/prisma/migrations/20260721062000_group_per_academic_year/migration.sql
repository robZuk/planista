-- Grupy sa teraz przypiete do roku akademickiego (nie do semestru).
-- Usuwamy kolumne semester i przestawiamy klucz unikalny na [name, academicYear].

-- DropIndex
DROP INDEX "StudentGroup_name_semester_academicYear_key";

-- AlterTable
ALTER TABLE "StudentGroup" DROP COLUMN "semester";

-- CreateIndex
CREATE UNIQUE INDEX "StudentGroup_name_academicYear_key" ON "StudentGroup"("name", "academicYear");
