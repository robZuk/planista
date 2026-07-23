import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const entryInclude = {
  room: { select: { number: true, building: { select: { name: true } } } },
  instructor: { select: { firstName: true, lastName: true, title: true } },
  studentGroup: { select: { id: true, name: true } },
  curriculumEntry: { select: { subject: { select: { name: true } } } },
  startBlock: { select: { order: true, startTime: true } },
  endBlock: { select: { order: true, endTime: true } },
};

/**
 * Statystyki dashboardu — jeden endpoint dla wszystkich rol, frontend
 * wybiera i komponuje dane wg roli zalogowanego uzytkownika.
 */
export async function getStats(_req: Request, res: Response): Promise<void> {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      usersByRole,
      instructorCount,
      groupCount,
      studentCount,
      roomCount,
      buildingCount,
      templateCount,
      entriesByStatus,
      entriesToday,
      upcomingHolidays,
      recentUsers,
      facultyCount,
      subjectCount,
      calendarCount,
    ] = await Promise.all([
      prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      prisma.instructor.count(),
      prisma.studentGroup.count(),
      prisma.user.count({ where: { role: 'STUDENT' } }),
      prisma.room.count(),
      prisma.building.count(),
      prisma.scheduleTemplate.count(),
      prisma.scheduleEntry.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.scheduleEntry.findMany({
        where: { date: { gte: todayStart, lt: todayEnd } },
        include: entryInclude,
        orderBy: [{ startBlock: { order: 'asc' } }],
        take: 30,
      }),
      prisma.publicHoliday.findMany({
        where: { date: { gte: todayStart, lte: weekEnd } },
        orderBy: { date: 'asc' },
      }),
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      }),
      prisma.faculty.count(),
      prisma.subject.count(),
      prisma.semesterCalendar.count(),
    ]);

    const byRole = Object.fromEntries(usersByRole.map((r) => [r.role, r._count._all])) as Record<string, number>;
    const byStatus = Object.fromEntries(entriesByStatus.map((r) => [r.status, r._count._all])) as Record<string, number>;

    res.json({
      data: {
        users: {
          total: Object.values(byRole).reduce((s, v) => s + v, 0),
          byRole: {
            ADMIN: byRole.ADMIN ?? 0,
            DEAN_OFFICE: byRole.DEAN_OFFICE ?? 0,
            INSTRUCTOR: byRole.INSTRUCTOR ?? 0,
            STUDENT: byRole.STUDENT ?? 0,
          },
        },
        instructors: { total: instructorCount },
        groups: { total: groupCount },
        students: { total: studentCount },
        rooms: { total: roomCount },
        buildings: { total: buildingCount },
        templates: { total: templateCount },
        entries: {
          scheduled: byStatus.SCHEDULED ?? 0,
          cancelled: byStatus.CANCELLED ?? 0,
          makeup: byStatus.MAKEUP ?? 0,
          total: Object.values(byStatus).reduce((s, v) => s + v, 0),
          todayCount: entriesToday.length,
        },
        faculties: { total: facultyCount },
        subjects: { total: subjectCount },
        calendars: { total: calendarCount },
        todayEntries: entriesToday,
        upcomingHolidays,
        recentUsers,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}
