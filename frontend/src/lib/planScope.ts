/**
 * Zakres operacji na planie: kierunek / specjalnosc / numer semestru.
 *
 * To NIE jest filtr widoku. Ta sama trojka jedzie na serwer i wyznacza, co zostanie
 * skasowane przed rozpisaniem (generator) albo wyczyszczone (usuwanie planu) — zakres
 * kasowania i zakres tworzenia musza byc tym samym zbiorem, inaczej rozpisanie jednego
 * semestru kasuje plan calego wydzialu.
 *
 * Okna planu nie maja wlasnych selektorow: biora zakres z paska filtrow widoku, zeby
 * nie bylo dwoch miejsc ustawiania tego samego.
 */
export interface PlanScope {
  /** 'all' = bez zawezenia. */
  fieldOfStudyId: string;
  /** 'all' = bez zawezenia. Wygrywa nad kierunkiem, bo jest wezsza. */
  specializationId: string;
  semester: number | 'all';
}

export const FULL_SCOPE: PlanScope = {
  fieldOfStudyId: 'all',
  specializationId: 'all',
  semester: 'all',
};

export function isScoped(scope: PlanScope): boolean {
  return (
    scope.fieldOfStudyId !== 'all' || scope.specializationId !== 'all' || scope.semester !== 'all'
  );
}

/** Ksztalt wysylany do API — pola 'all' po prostu znikaja. */
export function scopePayload(scope: PlanScope): {
  fieldOfStudyId?: string;
  specializationId?: string;
  semester?: number;
} {
  return {
    ...(scope.fieldOfStudyId !== 'all' ? { fieldOfStudyId: scope.fieldOfStudyId } : {}),
    ...(scope.specializationId !== 'all' ? { specializationId: scope.specializationId } : {}),
    ...(scope.semester !== 'all' ? { semester: scope.semester } : {}),
  };
}

/** Parametry zawezajace liste wzorcow po stronie serwera (semestr filtrujemy u klienta). */
export function templateScopeParams(scope: PlanScope): {
  fieldOfStudyId?: string;
  specializationId?: string;
} {
  if (scope.specializationId !== 'all') return { specializationId: scope.specializationId };
  if (scope.fieldOfStudyId !== 'all') return { fieldOfStudyId: scope.fieldOfStudyId };
  return {};
}

/** Opis zakresu do UI, np. "Eksploatacja i Diagnostyka · semestr 3". */
export function describeScope(
  scope: PlanScope,
  names: { fieldName?: string; specializationName?: string },
): string {
  const parts = [
    scope.specializationId !== 'all'
      ? (names.specializationName ?? 'wybrana specjalnosc')
      : scope.fieldOfStudyId !== 'all'
        ? (names.fieldName ?? 'wybrany kierunek')
        : null,
    scope.semester !== 'all' ? `semestr ${scope.semester}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'caly wydzial';
}
