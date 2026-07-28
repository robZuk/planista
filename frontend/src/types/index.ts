export type Role = 'ADMIN' | 'DEAN_OFFICE' | 'INSTRUCTOR' | 'STUDENT';

export interface StudentGroupRef {
  id: string;
  name: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  instructorId: string | null;
  facultyId: string | null;
  studentGroups: StudentGroupRef[];
}

/** Uzytkownik w widoku administracyjnym (lista /users) — bogatszy niz zalogowany User. */
export interface UserListItem {
  id: string;
  email: string;
  name: string;
  role: Role;
  instructorId: string | null;
  facultyId: string | null;
  createdAt: string;
  instructor: { id: string; firstName: string; lastName: string; title: string | null } | null;
  studentGroups: StudentGroupRef[];
}

export interface Faculty {
  id: string;
  name: string;
  shortName: string;
  createdAt: string;
}

export type RoomType = 'LECTURE' | 'EXERCISE' | 'LAB' | 'COMPUTER_LAB' | 'SEMINAR' | 'SPORTS';

export interface Room {
  id: string;
  number: string;
  type: RoomType;
  capacity: number;
  buildingId: string;
}

export interface Building {
  id: string;
  name: string;
  address: string | null;
  facultyId: string | null;
  faculty?: Faculty | null;
  rooms?: Room[];
  createdAt: string;
}

export interface Instructor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  title: string | null;
  facultyId: string | null;
  faculty?: Faculty | null;
  createdAt: string;
}

export interface TimeBlock {
  id: string;
  order: number;
  startTime: string;
  endTime: string;
  label: string;
  createdAt: string;
}

export interface FieldOfStudy {
  id: string;
  name: string;
  shortName: string;
  facultyId: string;
  faculty?: Faculty;
  createdAt: string;
}

export interface Specialization {
  id: string;
  name: string;
  shortName: string;
  fieldOfStudyId: string;
  fieldOfStudy?: FieldOfStudy & { faculty?: Faculty };
  createdAt: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string | null;
  createdAt: string;
}

export type StudyMode = 'FULL_TIME' | 'PART_TIME';
export type DegreeLevel = 'BACHELOR' | 'MASTER';
export type AssessmentType = 'EXAM' | 'CREDIT';
export type SemesterType = 'WINTER' | 'SUMMER';

export interface CurriculumVersion {
  id: string;
  academicYear: string;
  studyMode: StudyMode;
  degreeLevel: DegreeLevel;
  totalSemesters: number;
  startSemesterType: SemesterType;
  isActive: boolean;
  specializationId: string;
  specialization?: Specialization;
  _count?: { entries: number };
}

export interface InstructorRef {
  id: string;
  firstName: string;
  lastName: string;
  title: string | null;
}

export interface CurriculumEntry {
  id: string;
  orderInSemester: number;
  subject: { id: string; name: string; code: string | null };
  instructor: InstructorRef | null;
  hoursLecture: number;
  hoursExercise: number;
  hoursLab: number;
  hoursProject: number;
  hoursSeminar: number;
  totalHours: number;
  ects: number;
  assessmentType: AssessmentType;
}

export interface SemesterEntries {
  semester: number;
  totalEcts: number;
  entries: CurriculumEntry[];
}

export type GroupType = 'LECTURE' | 'EXERCISE' | 'LAB' | 'PROJECT' | 'SEMINAR';

export interface StudentGroup {
  id: string;
  name: string;
  type: GroupType;
  size: number;
  fieldOfStudyId: string;
  specializationId: string | null;
  studyYear: number;
  academicYear: string;
  studyMode: StudyMode;
  parentGroupId: string | null;
  preferredRoomId: string | null;
  subGroups?: StudentGroup[];
}

export interface GroupProposalItem {
  name: string;
  type: GroupType;
  size: number;
  parentName: string | null;
  studyYear: number;
}

export type ClassType = 'LECTURE' | 'EXERCISE' | 'LAB' | 'PROJECT' | 'SEMINAR';
export type WeekType = 'EVERY' | 'EVEN' | 'ODD';
export type EntryStatus = 'SCHEDULED' | 'CANCELLED' | 'MAKEUP';
export type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

export interface BlockRef {
  id: string;
  order: number;
  startTime: string;
  endTime: string;
  label: string;
}

export interface RoomRef {
  id: string;
  number: string;
  type: RoomType;
  capacity: number;
  building: { id: string; name: string };
}

export interface ScheduleTemplate {
  id: string;
  curriculumEntryId: string;
  /** Wydzial wyprowadzany z siatki po stronie serwera — niezmienny. */
  facultyId: string;
  curriculumEntry: { id: string; subject: { id: string; name: string } };
  classType: ClassType;
  room: RoomRef;
  instructor: InstructorRef & { id: string };
  studentGroup: { id: string; name: string; parentGroupId: string | null } | null;
  dayOfWeek: DayOfWeek;
  startBlock: BlockRef;
  endBlock: BlockRef;
  semester: number;
  academicYear: string;
  weekType: WeekType;
  studyMode: StudyMode;
}

export interface ScheduleEntry {
  id: string;
  date: string;
  status: EntryStatus;
  /** Recznie zmieniony pojedynczy termin — nie idzie za operacjami na calej serii. */
  detached: boolean;
  /** Wydzial terminu — takze dla terminow dodanych recznie (template = null). */
  facultyId: string;
  classType: ClassType;
  room: RoomRef;
  instructor: InstructorRef & { id: string };
  studentGroup: { id: string; name: string } | null;
  curriculumEntry: {
    id: string;
    semester: number;
    subject: { id: string; name: string };
    curriculumVersion: { specializationId: string };
  };
  template: { id: string; dayOfWeek: DayOfWeek; weekType: WeekType; studyMode: StudyMode } | null;
  startBlock: BlockRef;
  endBlock: BlockRef;
}

export interface SemesterCalendar {
  id: string;
  academicYear: string;
  semesterType: SemesterType;
  studyMode: StudyMode;
  startDate: string;
  endDate: string;
  teachingWeeks: number;
  /** null = kalendarz ogolnouczelniany; wydzialowy ma nad nim pierwszenstwo. */
  facultyId: string | null;
  faculty: { id: string; name: string; shortName: string } | null;
}

/** Skad wziely sie daty semestru uzyte przy generowaniu. */
export type SemesterRangeSource = 'FACULTY' | 'GLOBAL' | 'DERIVED';

export interface PublicHoliday {
  id: string;
  date: string;
  name: string;
}

export interface DashboardEntry {
  id: string;
  classType: ClassType;
  status: EntryStatus;
  date: string;
  room: { number: string; building: { name: string } };
  instructor: { firstName: string; lastName: string; title: string | null };
  studentGroup: { id: string; name: string } | null;
  curriculumEntry: { subject: { name: string } };
  startBlock: { order: number; startTime: string };
  endBlock: { order: number; endTime: string };
}

export interface DashboardStats {
  users: { total: number; byRole: Record<Role, number> };
  instructors: { total: number };
  groups: { total: number };
  students: { total: number };
  rooms: { total: number };
  buildings: { total: number };
  templates: { total: number };
  entries: { scheduled: number; cancelled: number; makeup: number; total: number; todayCount: number };
  faculties: { total: number };
  subjects: { total: number };
  calendars: { total: number };
  todayEntries: DashboardEntry[];
  upcomingHolidays: PublicHoliday[];
  recentUsers: { id: string; name: string; email: string; role: Role; createdAt: string }[];
}

/** Ksztalt odpowiedzi API: { data } lub { error }. */
export interface ApiOk<T> {
  data: T;
  message?: string;
}
export interface ApiError {
  error: string;
  details?: unknown;
}
