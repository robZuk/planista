/*
  Warnings:

  - You are about to drop the column `academicHours` on the `ScheduleEntry` table. All the data in the column will be lost.
  - You are about to drop the column `endTime` on the `ScheduleEntry` table. All the data in the column will be lost.
  - You are about to drop the column `startTime` on the `ScheduleEntry` table. All the data in the column will be lost.
  - You are about to drop the column `academicHours` on the `ScheduleTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `endTime` on the `ScheduleTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `startTime` on the `ScheduleTemplate` table. All the data in the column will be lost.
  - Added the required column `endBlockId` to the `ScheduleEntry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startBlockId` to the `ScheduleEntry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `endBlockId` to the `ScheduleTemplate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startBlockId` to the `ScheduleTemplate` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ScheduleEntry" DROP COLUMN "academicHours",
DROP COLUMN "endTime",
DROP COLUMN "startTime",
ADD COLUMN     "endBlockId" TEXT NOT NULL,
ADD COLUMN     "startBlockId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ScheduleTemplate" DROP COLUMN "academicHours",
DROP COLUMN "endTime",
DROP COLUMN "startTime",
ADD COLUMN     "endBlockId" TEXT NOT NULL,
ADD COLUMN     "startBlockId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "TimeBlock" (
    "id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TimeBlock_order_key" ON "TimeBlock"("order");

-- CreateIndex
CREATE UNIQUE INDEX "TimeBlock_startTime_key" ON "TimeBlock"("startTime");

-- CreateIndex
CREATE UNIQUE INDEX "TimeBlock_endTime_key" ON "TimeBlock"("endTime");

-- AddForeignKey
ALTER TABLE "ScheduleTemplate" ADD CONSTRAINT "ScheduleTemplate_startBlockId_fkey" FOREIGN KEY ("startBlockId") REFERENCES "TimeBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleTemplate" ADD CONSTRAINT "ScheduleTemplate_endBlockId_fkey" FOREIGN KEY ("endBlockId") REFERENCES "TimeBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_startBlockId_fkey" FOREIGN KEY ("startBlockId") REFERENCES "TimeBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_endBlockId_fkey" FOREIGN KEY ("endBlockId") REFERENCES "TimeBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
