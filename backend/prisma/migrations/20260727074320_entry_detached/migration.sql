-- AlterTable
ALTER TABLE "ScheduleEntry" ADD COLUMN     "detached" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "originalDate" TIMESTAMP(3);
