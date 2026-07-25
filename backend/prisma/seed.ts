import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ACADEMIC_YEAR = '2024/2025';

/**
 * Seed — dane startowe do developmentu.
 *
 * Wzorzec "wyczysc i wstaw": najpierw kasujemy dane w kolejnosci odwrotnej do
 * zaleznosci (najpierw dzieci, potem rodzice), potem tworzymy od nowa.
 * Dzieki temu seed jest idempotentny — mozna go uruchamiac wielokrotnie.
 */
async function main() {
  console.log('🌱 Seed: czyszczenie...');
  // Kolejnosc kasowania ma znaczenie ze wzgledu na klucze obce.
  await prisma.scheduleEntry.deleteMany();
  await prisma.scheduleTemplate.deleteMany();
  await prisma.timeBlock.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.curriculumEntry.deleteMany();
  await prisma.curriculumVersion.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.semesterCalendar.deleteMany();
  await prisma.publicHoliday.deleteMany();
  await prisma.user.deleteMany();
  await prisma.studentGroup.deleteMany();
  await prisma.room.deleteMany();
  await prisma.building.deleteMany();
  await prisma.instructor.deleteMany();
  await prisma.specialization.deleteMany();
  await prisma.fieldOfStudy.deleteMany();
  await prisma.faculty.deleteMany();

  // ─── Bloki czasowe (siatka 07:00-20:00, kroki co 1h) ─────────
  console.log('⏰ Bloki czasowe...');
  const FIRST_HOUR = 7; // 07:00
  const LAST_HOUR = 20; // ostatni blok konczy sie o 20:00
  const pad = (n: number) => String(n).padStart(2, '0');
  const timeBlocks = [];
  for (let hour = FIRST_HOUR; hour < LAST_HOUR; hour++) {
    const start = `${pad(hour)}:00`;
    const end = `${pad(hour + 1)}:00`;
    timeBlocks.push({
      order: hour - FIRST_HOUR + 1, // 1, 2, 3, ...
      startTime: start,
      endTime: end,
      label: `${start}-${end}`,
    });
  }
  await prisma.timeBlock.createMany({ data: timeBlocks });

  // ─── Struktura uczelni ───────────────────────────────────────
  console.log('🏛️  Struktura uczelni...');
  const wm = await prisma.faculty.create({
    data: { name: 'Wydzial Mechaniczny', shortName: 'WM' },
  });
  await prisma.faculty.create({
    data: { name: 'Wydzial Elektryczny', shortName: 'WE' },
  });
  await prisma.faculty.create({
    data: { name: 'Wydzial Nawigacyjny', shortName: 'WN' },
  });
  await prisma.faculty.create({
    data: { name: 'Wydzial Zarzadzania i Nauk o Jakosci', shortName: 'WZNJ' },
  });

  const edst = await prisma.fieldOfStudy.create({
    data: {
      name: 'Eksploatacja i Diagnostyka Systemow Technicznych',
      shortName: 'EDST',
      facultyId: wm.id,
    },
  });

  const dut = await prisma.specialization.create({
    data: {
      name: 'Diagnostyka Urzadzen Technicznych',
      shortName: 'DUT',
      fieldOfStudyId: edst.id,
    },
  });

  // ─── Budynki i sale ──────────────────────────────────────────
  console.log('🏢 Budynki i sale...');
  const buildingA = await prisma.building.create({
    data: {
      name: 'Budynek A',
      address: 'ul. Morska 81-87',
      facultyId: wm.id,
      rooms: {
        create: [
          { number: '101', type: 'LECTURE', capacity: 120 },
          { number: '102', type: 'EXERCISE', capacity: 30 },
          { number: '201', type: 'LAB', capacity: 16 },
        ],
      },
    },
    include: { rooms: true },
  });

  // ─── Prowadzacy ──────────────────────────────────────────────
  console.log('👨‍🏫 Prowadzacy...');
  const kowalski = await prisma.instructor.create({
    data: {
      firstName: 'Jan',
      lastName: 'Kowalski',
      email: 'jan.kowalski@umg.edu.pl',
      title: 'prof. dr hab.',
      facultyId: wm.id,
    },
  });

  await prisma.instructor.create({
    data: {
      firstName: 'Anna',
      lastName: 'Nowak',
      email: 'anna.nowak@umg.edu.pl',
      title: 'dr inz.',
      facultyId: wm.id,
    },
  });

  // ─── Grupy studenckie (wyklad + cwiczenia, rok 1) ────────────
  console.log('👥 Grupy studenckie...');
  const groupLecture = await prisma.studentGroup.create({
    data: {
      name: 'EDST-1-W',
      fieldOfStudyId: edst.id,
      studyYear: 1,
      academicYear: ACADEMIC_YEAR,
      type: 'LECTURE',
      size: 60,
    },
  });

  const groupExercise = await prisma.studentGroup.create({
    data: {
      name: 'EDST-1-C-A',
      fieldOfStudyId: edst.id,
      studyYear: 1,
      academicYear: ACADEMIC_YEAR,
      type: 'EXERCISE',
      size: 30,
      parentGroupId: groupLecture.id, // cwiczenia sa dzieckiem wykladu
    },
  });

  // ─── Kalendarz semestru + dni wolne ──────────────────────────
  console.log('📅 Kalendarz semestru i dni wolne...');
  await prisma.semesterCalendar.create({
    data: {
      academicYear: ACADEMIC_YEAR,
      semesterType: 'WINTER',
      studyMode: 'FULL_TIME',
      startDate: new Date('2024-10-01'),
      endDate: new Date('2025-02-02'),
      teachingWeeks: 15,
    },
  });

  await prisma.publicHoliday.createMany({
    data: [
      { date: new Date('2024-11-01'), name: 'Wszystkich Swietych' },
      { date: new Date('2024-11-11'), name: 'Narodowe Swieto Niepodleglosci' },
      { date: new Date('2024-12-25'), name: 'Boze Narodzenie' },
    ],
  });

  // ─── Uzytkownicy (hasla hashowane bcryptem) ──────────────────
  console.log('🔐 Uzytkownicy...');
  const hash = (plain: string) => bcrypt.hashSync(plain, 10);

  await prisma.user.create({
    data: {
      email: 'admin@umg.edu.pl',
      password: hash('Admin1234!'),
      role: 'ADMIN',
      name: 'Administrator',
    },
  });

  await prisma.user.create({
    data: {
      email: 'dziekanat@umg.edu.pl',
      password: hash('Dziekanat1234!'),
      role: 'DEAN_OFFICE',
      name: 'Dziekanat WM',
    },
  });

  // Konto prowadzacego powiazane z rekordem Instructor (Jan Kowalski).
  await prisma.user.create({
    data: {
      email: 'prowadzacy@umg.edu.pl',
      password: hash('Prowadzacy1234!'),
      role: 'INSTRUCTOR',
      name: 'Jan Kowalski',
      instructorId: kowalski.id,
    },
  });

  // Konto studenta przypisane do grupy wykladowej i cwiczeniowej.
  await prisma.user.create({
    data: {
      email: 'student@umg.edu.pl',
      password: hash('Student1234!'),
      role: 'STUDENT',
      name: 'Student Testowy',
      studentGroups: {
        connect: [{ id: groupLecture.id }, { id: groupExercise.id }],
      },
    },
  });

  console.log('✅ Seed zakonczony.');
  console.log(`   Sale w ${buildingA.name}: ${buildingA.rooms.map((r) => r.number).join(', ')}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed nieudany:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
