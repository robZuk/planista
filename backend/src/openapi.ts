import { z, type ZodType } from 'zod';
import { loginSchema, refreshSchema } from './schemas/auth';
import { facultyCreateSchema, facultyUpdateSchema } from './schemas/faculty';
import { subjectCreateSchema } from './schemas/subject';
import { fieldOfStudyCreateSchema } from './schemas/fieldOfStudy';
import { specializationCreateSchema } from './schemas/specialization';
import { timeBlockCreateSchema } from './schemas/timeBlock';
import { instructorCreateSchema, instructorUpdateSchema } from './schemas/instructor';
import {
  buildingCreateSchema,
  buildingUpdateSchema,
  roomCreateSchema,
  roomUpdateSchema,
} from './schemas/building';
import { publicHolidayCreateSchema } from './schemas/publicHoliday';
import { userCreateSchema, userUpdateSchema } from './schemas/user';

/**
 * Specyfikacja OpenAPI 3.1 serwowana przez Swagger UI (/api/docs).
 *
 * JEDNO ZRODLO PRAWDY: schematy request body sa te SAME co w walidacji wejscia
 * (middleware/validate.ts) — konwertowane do JSON Schema przez wbudowane w zod 4
 * `z.toJSONSchema`. Zmiana schematu zod = automatyczna zmiana w dokumentacji, bez dryfu.
 */

// zod -> JSON Schema; usuwamy klucz $schema, ktorego OpenAPI components nie potrzebuje.
function toJson(schema: ZodType): Record<string, unknown> {
  const s = z.toJSONSchema(schema) as Record<string, unknown>;
  delete s.$schema;
  return s;
}

const schemas = {
  LoginRequest: toJson(loginSchema),
  RefreshRequest: toJson(refreshSchema),
  FacultyCreate: toJson(facultyCreateSchema),
  FacultyUpdate: toJson(facultyUpdateSchema),
  SubjectCreate: toJson(subjectCreateSchema),
  FieldOfStudyCreate: toJson(fieldOfStudyCreateSchema),
  SpecializationCreate: toJson(specializationCreateSchema),
  TimeBlockCreate: toJson(timeBlockCreateSchema),
  InstructorCreate: toJson(instructorCreateSchema),
  InstructorUpdate: toJson(instructorUpdateSchema),
  BuildingCreate: toJson(buildingCreateSchema),
  BuildingUpdate: toJson(buildingUpdateSchema),
  RoomCreate: toJson(roomCreateSchema),
  RoomUpdate: toJson(roomUpdateSchema),
  PublicHolidayCreate: toJson(publicHolidayCreateSchema),
  UserCreate: toJson(userCreateSchema),
  UserUpdate: toJson(userUpdateSchema),
  // Wspolny ksztalt bledu z centralnego errorHandler.
  ErrorResponse: {
    type: 'object',
    properties: {
      error: { type: 'string', description: 'Komunikat lub kod bledu' },
      details: { type: 'object', additionalProperties: true, description: 'Opcjonalne szczegoly (np. konflikt)' },
    },
    required: ['error'],
  },
} as const;

// ─── Helpery skracajace definicje sciezek ────────────────────
const ref = (name: keyof typeof schemas) => ({ $ref: `#/components/schemas/${name}` });
const jsonBody = (name: keyof typeof schemas) => ({
  required: true,
  content: { 'application/json': { schema: ref(name) } },
});
const dataResp = (description: string) => ({
  description,
  content: {
    'application/json': {
      schema: { type: 'object', properties: { data: {}, message: { type: 'string' } } },
    },
  },
});
const errResp = (description: string) => ({
  description,
  content: { 'application/json': { schema: ref('ErrorResponse') } },
});
const bearer = [{ bearerAuth: [] as string[] }];
const pathId = (name = 'id') => ({ name, in: 'path', required: true, schema: { type: 'string' } });

/** Standardowe 401/403 dla tras chronionych. */
const authErrors = { 401: errResp('Brak lub niewazny token'), 403: errResp('Brak uprawnien') };

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Planista API',
    version: '1.0.0',
    description:
      'API systemu ukladania planu zajec. Wszystkie trasy pod `/api/*` wymagaja tokenu JWT ' +
      '(naglowek `Authorization: Bearer <token>`) — uzyj "Authorize" powyzej. Schematy request ' +
      'body sa generowane z tych samych schematow zod, ktore waliduja wejscie.',
  },
  servers: [{ url: '/', description: 'Ten sam origin co aplikacja' }],
  tags: [
    { name: 'Auth', description: 'Logowanie, odswiezanie tokenu, dane zalogowanego' },
    { name: 'Zasoby', description: 'Wydzialy, budynki, sale, prowadzacy, bloki czasowe' },
    { name: 'Program', description: 'Kierunki, specjalnosci, przedmioty, siatki godzin' },
    { name: 'Grupy', description: 'Grupy studenckie i ich hierarchia' },
    { name: 'Plan', description: 'Wzorce tygodnia, terminy, generator, kalendarz, dni wolne' },
    { name: 'Uzytkownicy', description: 'Konta i impersonacja (ADMIN)' },
    { name: 'System', description: 'Health-check' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas,
  },
  paths: {
    // ─── System ──────────────────────────────────────────────
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health-check (poza /api, bez tokenu)',
        security: [],
        responses: { 200: dataResp('Serwer zyje') },
      },
    },

    // ─── Auth ────────────────────────────────────────────────
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Logowanie — zwraca access + refresh token',
        security: [],
        requestBody: jsonBody('LoginRequest'),
        responses: {
          200: dataResp('Tokeny i dane uzytkownika'),
          400: errResp('Blad walidacji (np. zly format email)'),
          401: errResp('Nieprawidlowy email lub haslo'),
          429: errResp('Za duzo prob logowania (rate-limit)'),
        },
      },
    },
    '/api/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Wymiana refresh tokenu na nowy access token',
        security: [],
        requestBody: jsonBody('RefreshRequest'),
        responses: { 200: dataResp('Nowy access token'), 400: errResp('Brak pola'), 401: errResp('Token niewazny') },
      },
    },
    '/api/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Uniewaznienie refresh tokenu',
        security: [],
        requestBody: {
          required: false,
          content: { 'application/json': { schema: { type: 'object', properties: { refreshToken: { type: 'string' } } } } },
        },
        responses: { 200: dataResp('Wylogowano') },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Dane zalogowanego uzytkownika',
        security: bearer,
        responses: { 200: dataResp('Profil uzytkownika'), 401: errResp('Brak lub niewazny token') },
      },
    },

    // ─── Zasoby: Wydzialy ────────────────────────────────────
    '/api/faculties': {
      get: { tags: ['Zasoby'], summary: 'Lista wydzialow', security: bearer, responses: { 200: dataResp('Wydzialy'), ...authErrors } },
      post: {
        tags: ['Zasoby'],
        summary: 'Utworz wydzial (ADMIN)',
        security: bearer,
        requestBody: jsonBody('FacultyCreate'),
        responses: { 201: dataResp('Utworzony'), 400: errResp('Blad walidacji'), 409: errResp('Duplikat'), ...authErrors },
      },
    },
    '/api/faculties/{id}': {
      get: { tags: ['Zasoby'], summary: 'Wydzial po id', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Wydzial'), 404: errResp('Nie znaleziono'), ...authErrors } },
      put: {
        tags: ['Zasoby'],
        summary: 'Aktualizuj wydzial (ADMIN)',
        security: bearer,
        parameters: [pathId()],
        requestBody: jsonBody('FacultyUpdate'),
        responses: { 200: dataResp('Zaktualizowany'), 404: errResp('Nie znaleziono'), ...authErrors },
      },
      delete: { tags: ['Zasoby'], summary: 'Usun wydzial (ADMIN)', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Usuniety'), 409: errResp('W uzyciu'), ...authErrors } },
    },

    // ─── Zasoby: Budynki i sale ──────────────────────────────
    '/api/buildings': {
      get: { tags: ['Zasoby'], summary: 'Lista budynkow', security: bearer, responses: { 200: dataResp('Budynki'), ...authErrors } },
      post: { tags: ['Zasoby'], summary: 'Utworz budynek (ADMIN)', security: bearer, requestBody: jsonBody('BuildingCreate'), responses: { 201: dataResp('Utworzony'), 400: errResp('Blad walidacji'), ...authErrors } },
    },
    '/api/buildings/{id}': {
      get: { tags: ['Zasoby'], summary: 'Budynek po id', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Budynek'), 404: errResp('Nie znaleziono'), ...authErrors } },
      put: { tags: ['Zasoby'], summary: 'Aktualizuj budynek (ADMIN)', security: bearer, parameters: [pathId()], requestBody: jsonBody('BuildingUpdate'), responses: { 200: dataResp('Zaktualizowany'), ...authErrors } },
      delete: { tags: ['Zasoby'], summary: 'Usun budynek (ADMIN)', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Usuniety'), 409: errResp('Ma sale'), ...authErrors } },
    },
    '/api/buildings/{id}/rooms': {
      get: { tags: ['Zasoby'], summary: 'Sale w budynku', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Sale'), ...authErrors } },
      post: { tags: ['Zasoby'], summary: 'Utworz sale (ADMIN)', security: bearer, parameters: [pathId()], requestBody: jsonBody('RoomCreate'), responses: { 201: dataResp('Utworzona'), 400: errResp('Blad walidacji'), ...authErrors } },
    },
    '/api/buildings/{id}/rooms/{roomId}': {
      put: { tags: ['Zasoby'], summary: 'Aktualizuj sale (ADMIN)', security: bearer, parameters: [pathId(), pathId('roomId')], requestBody: jsonBody('RoomUpdate'), responses: { 200: dataResp('Zaktualizowana'), ...authErrors } },
      delete: { tags: ['Zasoby'], summary: 'Usun sale (ADMIN)', security: bearer, parameters: [pathId(), pathId('roomId')], responses: { 200: dataResp('Usunieta'), 409: errResp('W planie'), ...authErrors } },
    },

    // ─── Zasoby: Prowadzacy ──────────────────────────────────
    '/api/instructors': {
      get: { tags: ['Zasoby'], summary: 'Lista prowadzacych', security: bearer, parameters: [{ name: 'facultyId', in: 'query', schema: { type: 'string' } }], responses: { 200: dataResp('Prowadzacy'), ...authErrors } },
      post: { tags: ['Zasoby'], summary: 'Utworz prowadzacego (ADMIN)', security: bearer, requestBody: jsonBody('InstructorCreate'), responses: { 201: dataResp('Utworzony'), 400: errResp('Blad walidacji'), 409: errResp('Email zajety'), ...authErrors } },
    },
    '/api/instructors/{id}': {
      get: { tags: ['Zasoby'], summary: 'Prowadzacy po id', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Prowadzacy'), 404: errResp('Nie znaleziono'), ...authErrors } },
      put: { tags: ['Zasoby'], summary: 'Aktualizuj prowadzacego (ADMIN)', security: bearer, parameters: [pathId()], requestBody: jsonBody('InstructorUpdate'), responses: { 200: dataResp('Zaktualizowany'), ...authErrors } },
      delete: { tags: ['Zasoby'], summary: 'Usun prowadzacego (ADMIN)', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Usuniety'), 409: errResp('W planie'), ...authErrors } },
    },

    // ─── Zasoby: Bloki czasowe ───────────────────────────────
    '/api/time-blocks': {
      get: { tags: ['Zasoby'], summary: 'Lista blokow czasowych', security: bearer, responses: { 200: dataResp('Bloki'), ...authErrors } },
      post: { tags: ['Zasoby'], summary: 'Utworz blok (ADMIN)', security: bearer, requestBody: jsonBody('TimeBlockCreate'), responses: { 201: dataResp('Utworzony'), 400: errResp('Zla godzina'), 409: errResp('Duplikat'), ...authErrors } },
    },
    '/api/time-blocks/{id}': {
      delete: { tags: ['Zasoby'], summary: 'Usun blok (ADMIN)', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Usuniety'), 409: errResp('W planie'), ...authErrors } },
    },

    // ─── Program: Kierunki / specjalnosci / przedmioty ───────
    '/api/fields-of-study': {
      get: { tags: ['Program'], summary: 'Lista kierunkow', security: bearer, parameters: [{ name: 'facultyId', in: 'query', schema: { type: 'string' } }], responses: { 200: dataResp('Kierunki'), ...authErrors } },
      post: { tags: ['Program'], summary: 'Utworz kierunek (ADMIN)', security: bearer, requestBody: jsonBody('FieldOfStudyCreate'), responses: { 201: dataResp('Utworzony'), 400: errResp('Blad walidacji'), ...authErrors } },
    },
    '/api/fields-of-study/{id}': {
      delete: { tags: ['Program'], summary: 'Usun kierunek (ADMIN)', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Usuniety'), 409: errResp('W uzyciu'), ...authErrors } },
    },
    '/api/specializations': {
      get: { tags: ['Program'], summary: 'Lista specjalnosci', security: bearer, parameters: [{ name: 'fieldOfStudyId', in: 'query', schema: { type: 'string' } }], responses: { 200: dataResp('Specjalnosci'), ...authErrors } },
      post: { tags: ['Program'], summary: 'Utworz specjalnosc (ADMIN)', security: bearer, requestBody: jsonBody('SpecializationCreate'), responses: { 201: dataResp('Utworzona'), 400: errResp('Blad walidacji'), ...authErrors } },
    },
    '/api/specializations/{id}': {
      delete: { tags: ['Program'], summary: 'Usun specjalnosc (ADMIN)', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Usunieta'), 409: errResp('W uzyciu'), ...authErrors } },
    },
    '/api/subjects': {
      get: { tags: ['Program'], summary: 'Lista przedmiotow', security: bearer, parameters: [{ name: 'search', in: 'query', schema: { type: 'string' } }], responses: { 200: dataResp('Przedmioty'), ...authErrors } },
      post: { tags: ['Program'], summary: 'Utworz przedmiot (ADMIN)', security: bearer, requestBody: jsonBody('SubjectCreate'), responses: { 201: dataResp('Utworzony'), 400: errResp('Blad walidacji'), 409: errResp('Duplikat'), ...authErrors } },
    },
    '/api/subjects/{id}': {
      delete: { tags: ['Program'], summary: 'Usun przedmiot (ADMIN)', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Usuniety'), 409: errResp('W siatce'), ...authErrors } },
    },

    // ─── Program: Siatki godzin (curriculum) ─────────────────
    '/api/curriculum/academic-years': {
      get: { tags: ['Program'], summary: 'Lata akademickie siatek', security: bearer, responses: { 200: dataResp('Lista lat'), ...authErrors } },
    },
    '/api/curriculum/versions': {
      get: { tags: ['Program'], summary: 'Lista wersji siatek', security: bearer, responses: { 200: dataResp('Wersje'), ...authErrors } },
      post: { tags: ['Program'], summary: 'Utworz wersje siatki (ADMIN)', security: bearer, responses: { 201: dataResp('Utworzona'), 400: errResp('Brak pol'), ...authErrors } },
    },
    '/api/curriculum/versions/{id}': {
      put: { tags: ['Program'], summary: 'Aktualizuj wersje (ADMIN)', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Zaktualizowana'), ...authErrors } },
      delete: { tags: ['Program'], summary: 'Usun wersje siatki (ADMIN)', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Usunieta'), 404: errResp('Nie znaleziono'), ...authErrors } },
    },
    '/api/curriculum/versions/{id}/entries': {
      get: { tags: ['Program'], summary: 'Wpisy siatki (po semestrach)', security: bearer, parameters: [pathId(), { name: 'semester', in: 'query', schema: { type: 'integer' } }], responses: { 200: dataResp('Wpisy'), 404: errResp('Nie znaleziono'), ...authErrors } },
      post: { tags: ['Program'], summary: 'Dodaj przedmiot do siatki (ADMIN)', security: bearer, parameters: [pathId()], responses: { 201: dataResp('Dodany'), 400: errResp('Brak pol / zly semestr'), ...authErrors } },
    },
    '/api/curriculum/entries/{id}': {
      put: { tags: ['Program'], summary: 'Aktualizuj wpis siatki (ADMIN)', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Zaktualizowany'), ...authErrors } },
      delete: { tags: ['Program'], summary: 'Usun wpis siatki (ADMIN)', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Usuniety'), 409: errResp('W planie'), ...authErrors } },
    },

    // ─── Grupy ───────────────────────────────────────────────
    '/api/groups': {
      get: {
        tags: ['Grupy'],
        summary: 'Lista grup (z filtrami)',
        security: bearer,
        parameters: [
          { name: 'fieldOfStudyId', in: 'query', schema: { type: 'string' } },
          { name: 'specializationId', in: 'query', schema: { type: 'string' } },
          { name: 'studyYear', in: 'query', schema: { type: 'integer' } },
          { name: 'academicYear', in: 'query', schema: { type: 'string' } },
          { name: 'studyMode', in: 'query', schema: { type: 'string', enum: ['FULL_TIME', 'PART_TIME'] } },
        ],
        responses: { 200: dataResp('Grupy'), ...authErrors },
      },
      post: { tags: ['Grupy'], summary: 'Utworz grupe', security: bearer, responses: { 201: dataResp('Utworzona'), 400: errResp('Brak pol'), 422: errResp('Zla hierarchia'), ...authErrors } },
      delete: { tags: ['Grupy'], summary: 'Usun grupy (opcjonalnie po roku)', security: bearer, parameters: [{ name: 'academicYear', in: 'query', schema: { type: 'string' } }], responses: { 200: dataResp('Usunieto N grup'), ...authErrors } },
    },
    '/api/groups/{id}': {
      get: { tags: ['Grupy'], summary: 'Grupa po id', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Grupa'), 404: errResp('Nie znaleziono'), ...authErrors } },
      put: { tags: ['Grupy'], summary: 'Aktualizuj grupe', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Zaktualizowana'), ...authErrors } },
      delete: { tags: ['Grupy'], summary: 'Usun grupe', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Usunieta'), 409: errResp('W planie / ma podgrupy'), ...authErrors } },
    },
    '/api/groups/copy-to-next-year': {
      post: { tags: ['Grupy'], summary: 'Skopiuj rocznik na kolejny rok', security: bearer, responses: { 201: dataResp('Skopiowano'), 409: errResp('Rok docelowy nie jest pusty'), 422: errResp('Zly format roku'), ...authErrors } },
    },

    // ─── Plan: Wzorce tygodnia ───────────────────────────────
    '/api/schedule/templates': {
      get: { tags: ['Plan'], summary: 'Wzorce tygodnia (z filtrami)', security: bearer, responses: { 200: dataResp('Wzorce'), ...authErrors } },
      post: { tags: ['Plan'], summary: 'Dodaj wzorzec', security: bearer, responses: { 201: dataResp('Dodany'), 400: errResp('Brak pol'), 409: errResp('Konflikt'), ...authErrors } },
      delete: { tags: ['Plan'], summary: 'Usun wiele wzorcow (lista ids)', security: bearer, responses: { 200: dataResp('Usunieto'), 400: errResp('Brak ids'), ...authErrors } },
    },
    '/api/schedule/templates/{id}': {
      put: { tags: ['Plan'], summary: 'Aktualizuj wzorzec', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Zaktualizowany'), 404: errResp('Nie znaleziono'), 409: errResp('Konflikt'), ...authErrors } },
      delete: { tags: ['Plan'], summary: 'Usun wzorzec', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Usuniety'), 404: errResp('Nie znaleziono'), ...authErrors } },
    },
    '/api/schedule/templates/summary/{curriculumVersionId}': {
      get: { tags: ['Plan'], summary: 'Bilans pokrycia godzin', security: bearer, parameters: [pathId('curriculumVersionId')], responses: { 200: dataResp('Bilans'), 404: errResp('Pusta siatka'), ...authErrors } },
    },
    '/api/schedule/generate': {
      post: { tags: ['Plan'], summary: 'Generuj terminy semestru (nadpisuje kalendarz wydzialu)', security: bearer, responses: { 200: dataResp('Podsumowanie generowania'), 400: errResp('Brak pol / wydzialu'), ...authErrors } },
    },

    // ─── Plan: Terminy (kalendarz) ───────────────────────────
    '/api/schedule/entries': {
      get: {
        tags: ['Plan'],
        summary: 'Terminy (kalendarz semestru)',
        security: bearer,
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'studentGroupId', in: 'query', schema: { type: 'string' } },
          { name: 'instructorId', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: dataResp('Terminy'), ...authErrors },
      },
      post: { tags: ['Plan'], summary: 'Dodaj termin recznie', security: bearer, responses: { 201: dataResp('Dodany'), 400: errResp('Brak pol / poza semestrem'), 409: errResp('Konflikt'), ...authErrors } },
      delete: { tags: ['Plan'], summary: 'Wyczysc kalendarz wydzialu', security: bearer, responses: { 200: dataResp('Wyczyszczono'), 400: errResp('Brak pol / wydzialu'), ...authErrors } },
    },
    '/api/schedule/entries/{id}': {
      delete: { tags: ['Plan'], summary: 'Usun termin (scope ONE/ALL)', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Usuniety'), 404: errResp('Nie znaleziono'), ...authErrors } },
    },
    '/api/schedule/entries/{id}/status': {
      put: { tags: ['Plan'], summary: 'Zmien status terminu (np. odwolaj)', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Zaktualizowany'), 400: errResp('Brak statusu'), 404: errResp('Nie znaleziono'), ...authErrors } },
    },
    '/api/schedule/entries/{id}/move': {
      post: { tags: ['Plan'], summary: 'Przenies termin (drag&drop, ONE/ALL)', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Przeniesiony'), 400: errResp('Brak pol / poza semestrem'), 409: errResp('Konflikt'), ...authErrors } },
    },

    // ─── Plan: Kalendarz semestru i dni wolne ────────────────
    '/api/schedule/calendars': {
      get: { tags: ['Plan'], summary: 'Kalendarze semestru', security: bearer, responses: { 200: dataResp('Kalendarze'), ...authErrors } },
      post: { tags: ['Plan'], summary: 'Utworz kalendarz semestru', security: bearer, responses: { 201: dataResp('Utworzony'), 400: errResp('Blad walidacji'), 409: errResp('Duplikat'), ...authErrors } },
    },
    '/api/schedule/calendars/{id}': {
      put: { tags: ['Plan'], summary: 'Aktualizuj kalendarz', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Zaktualizowany'), 404: errResp('Nie znaleziono'), 409: errResp('Zajecia poza zakresem'), ...authErrors } },
      delete: { tags: ['Plan'], summary: 'Usun kalendarz', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Usuniety'), 404: errResp('Nie znaleziono'), ...authErrors } },
    },
    '/api/schedule/holidays': {
      get: { tags: ['Plan'], summary: 'Dni wolne', security: bearer, parameters: [{ name: 'from', in: 'query', schema: { type: 'string', format: 'date' } }, { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } }], responses: { 200: dataResp('Dni wolne'), ...authErrors } },
      post: { tags: ['Plan'], summary: 'Dodaj dzien wolny', security: bearer, requestBody: jsonBody('PublicHolidayCreate'), responses: { 201: dataResp('Dodany'), 400: errResp('Blad walidacji'), 409: errResp('Duplikat'), ...authErrors } },
    },
    '/api/schedule/holidays/{id}': {
      delete: { tags: ['Plan'], summary: 'Usun dzien wolny', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Usuniety'), ...authErrors } },
    },

    // ─── Uzytkownicy ─────────────────────────────────────────
    '/api/users': {
      get: { tags: ['Uzytkownicy'], summary: 'Lista uzytkownikow (ADMIN)', security: bearer, responses: { 200: dataResp('Uzytkownicy'), ...authErrors } },
      post: { tags: ['Uzytkownicy'], summary: 'Utworz uzytkownika (ADMIN)', security: bearer, requestBody: jsonBody('UserCreate'), responses: { 201: dataResp('Utworzony'), 400: errResp('Blad walidacji'), 409: errResp('Email zajety'), ...authErrors } },
    },
    '/api/users/{id}': {
      put: { tags: ['Uzytkownicy'], summary: 'Aktualizuj uzytkownika (ADMIN)', security: bearer, parameters: [pathId()], requestBody: jsonBody('UserUpdate'), responses: { 200: dataResp('Zaktualizowany'), 404: errResp('Nie znaleziono'), ...authErrors } },
      delete: { tags: ['Uzytkownicy'], summary: 'Usun uzytkownika (ADMIN)', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Usuniety'), 400: errResp('Nie mozesz usunac siebie'), ...authErrors } },
    },
    '/api/users/{id}/impersonate': {
      post: { tags: ['Uzytkownicy'], summary: 'Podglad jako inny uzytkownik (ADMIN)', security: bearer, parameters: [pathId()], responses: { 200: dataResp('Token podgladowy'), 400: errResp('Nie mozesz podszyc sie pod siebie'), 404: errResp('Nie znaleziono'), ...authErrors } },
    },

    // ─── Dashboard ───────────────────────────────────────────
    '/api/dashboard/stats': {
      get: { tags: ['System'], summary: 'Statystyki dashboardu', security: bearer, responses: { 200: dataResp('Statystyki'), ...authErrors } },
    },
  },
};
