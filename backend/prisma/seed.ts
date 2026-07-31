import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ACADEMIC_YEAR = '2024/2025'; // rok "biezacy" — do niego przypisani sa uzytkownicy testowi
const ACADEMIC_YEARS = ['2023/2024', ACADEMIC_YEAR, '2025/2026']; // dodatkowe lata do testow przelacznika

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
  // Kalendarze semestru zakladamy nizej dla kazdego wydzialu osobno.
  const allFaculties = await prisma.faculty.findMany({ select: { id: true } });

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

  // ─── Przedmioty (slownik wspolny dla calej uczelni) ───────────
  console.log('📚 Przedmioty...');
  const subjects = await Promise.all([
    prisma.subject.create({ data: { name: 'Matematyka I', code: 'EDST-101' } }),
    prisma.subject.create({ data: { name: 'Fizyka', code: 'EDST-102' } }),
    prisma.subject.create({
      data: { name: 'Podstawy Diagnostyki Technicznej', code: 'EDST-103' },
    }),
  ]);

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

  // ─── Grupy studenckie (wyklad + cwiczenia, rok 1, po jednej kohorcie na rok) ─
  console.log('👥 Grupy studenckie...');
  type Group = Awaited<ReturnType<typeof prisma.studentGroup.create>>;
  const groupsByYear = new Map<string, { lecture: Group; exercise: Group }>();

  for (const year of ACADEMIC_YEARS) {
    const lecture = await prisma.studentGroup.create({
      data: {
        name: 'EDST-1-W',
        fieldOfStudyId: edst.id,
        studyYear: 1,
        academicYear: year,
        type: 'LECTURE',
        size: 60,
      },
    });

    const exercise = await prisma.studentGroup.create({
      data: {
        name: 'EDST-1-C-A',
        fieldOfStudyId: edst.id,
        studyYear: 1,
        academicYear: year,
        type: 'EXERCISE',
        size: 30,
        parentGroupId: lecture.id, // cwiczenia sa dzieckiem wykladu
      },
    });

    groupsByYear.set(year, { lecture, exercise });
  }

  const { lecture: groupLecture, exercise: groupExercise } = groupsByYear.get(ACADEMIC_YEAR)!;

  // ─── Kalendarz semestru + siatki godzin (kazdy z ACADEMIC_YEARS) ─
  console.log('📅 Kalendarz semestru i siatki godzin (wiele lat)...');
  for (const year of ACADEMIC_YEARS) {
    const startYear = Number(year.split('/')[0]);

    // Kalendarz nalezy do wydzialu — wspolne daty uczelni to wiersz na kazdy wydzial,
    // dokladnie tak, jak zaklada je UI opcja "wszystkie wydzialy".
    await prisma.semesterCalendar.createMany({
      data: allFaculties.flatMap((faculty) => [
        {
          academicYear: year,
          semesterType: 'WINTER' as const,
          studyMode: 'FULL_TIME' as const,
          facultyId: faculty.id,
          startDate: new Date(`${startYear}-10-01`),
          endDate: new Date(`${startYear + 1}-02-02`),
          teachingWeeks: 15,
        },
        {
          academicYear: year,
          semesterType: 'SUMMER' as const,
          studyMode: 'FULL_TIME' as const,
          facultyId: faculty.id,
          startDate: new Date(`${startYear + 1}-02-17`),
          endDate: new Date(`${startYear + 1}-06-22`),
          teachingWeeks: 15,
        },
      ]),
    });

    const version = await prisma.curriculumVersion.create({
      data: {
        academicYear: year,
        studyMode: 'FULL_TIME',
        degreeLevel: 'BACHELOR',
        totalSemesters: 7,
        startSemesterType: 'WINTER',
        isActive: year === ACADEMIC_YEAR,
        specializationId: dut.id,
      },
    });

    await prisma.curriculumEntry.createMany({
      data: subjects.map((subject, i) => ({
        curriculumVersionId: version.id,
        subjectId: subject.id,
        instructorId: kowalski.id,
        semester: 1,
        orderInSemester: i + 1,
        hoursLecture: 30,
        hoursExercise: i === 0 ? 15 : 0,
        hoursLab: i === 2 ? 15 : 0,
        ects: 5,
        assessmentType: i === 0 ? ('EXAM' as const) : ('CREDIT' as const),
      })),
    });
  }

  console.log('🎉 Dni wolne...');
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
