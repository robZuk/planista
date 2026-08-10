import axios from 'axios';
import { CLASS_FULL_LABELS } from '@/lib/scheduleDisplay';
import { ROOM_TYPE_LABELS } from '@/lib/labels';
import type { ClassType, RoomType } from '@/types';

/**
 * Walidacja planu zwraca KOD bledu (np. "ROOM_CONFLICT") plus szczegoly, a nie
 * gotowy komunikat — bo backend nie zna jezyka interfejsu. Tu zamieniamy to na
 * zdanie, ktore mowi uzytkownikowi, co dokladnie stoi na przeszkodzie.
 */

interface ConflictDetails {
  conflictId: string;
  label: string;
  blockRange: string;
  when: string;
}

interface ErrorPayload {
  error?: string;
  details?: unknown;
}

const DAY_NAMES: Record<string, string> = {
  MONDAY: 'poniedzialek',
  TUESDAY: 'wtorek',
  WEDNESDAY: 'sroda',
  THURSDAY: 'czwartek',
  FRIDAY: 'piatek',
  SATURDAY: 'sobota',
  SUNDAY: 'niedziela',
};

/** "MONDAY" -> "poniedzialek"; data albo cokolwiek innego zostaje bez zmian. */
function humanWhen(when: string): string {
  return DAY_NAMES[when] ?? when;
}

function conflictSentence(subject: string, details: ConflictDetails): string {
  return `${subject} ma juz zajecia w ${humanWhen(details.when)} ${details.blockRange} (${details.label}).`;
}

/**
 * Zamienia blad z API planu na czytelny komunikat.
 * Kody nieznane (albo zwykle bledy sieci) trafiaja do ogolnej obslugi.
 */
export function getScheduleErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return 'Nieznany blad';

  const payload = error.response?.data as ErrorPayload | undefined;
  const code = payload?.error;
  const details = payload?.details as Record<string, unknown> | undefined;

  switch (code) {
    case 'ROOM_CONFLICT':
      return conflictSentence('Sala', details as unknown as ConflictDetails);
    case 'INSTRUCTOR_CONFLICT':
      return conflictSentence('Prowadzacy', details as unknown as ConflictDetails);
    case 'GROUP_CONFLICT':
      return conflictSentence('Grupa', details as unknown as ConflictDetails);

    case 'WRONG_ROOM_TYPE': {
      const roomType = details?.roomType as RoomType | undefined;
      const classType = details?.classType as ClassType | undefined;
      const allowed = (details?.allowed as RoomType[] | undefined) ?? [];
      const allowedNames = allowed.map((type) => ROOM_TYPE_LABELS[type]).join(', ');
      return `Sala typu "${roomType ? ROOM_TYPE_LABELS[roomType] : '?'}" nie nadaje sie na ${
        classType ? CLASS_FULL_LABELS[classType].toLowerCase() : 'te zajecia'
      }. Dozwolone: ${allowedNames || 'brak'}.`;
    }

    case 'INSUFFICIENT_ROOM_CAPACITY':
      return `Sala miesci ${details?.roomCapacity ?? '?'} osob, a grupa liczy ${
        details?.groupSize ?? '?'
      }.`;

    case 'HOURS_EXCEEDED': {
      const classType = details?.classType as ClassType | undefined;
      return `Przekroczony limit godzin${
        classType ? ` (${CLASS_FULL_LABELS[classType].toLowerCase()})` : ''
      }: siatka przewiduje ${details?.limit ?? '?'} h, zaplanowano juz ${
        details?.alreadyPlanned ?? '?'
      } h, probujesz dodac ${details?.requested ?? '?'} h. Zostalo ${details?.remaining ?? 0} h.`;
    }

    case 'DATE_OUTSIDE_SEMESTER':
      return `Termin wypada poza zakresem semestru (${details?.startDate ?? '?'} – ${
        details?.endDate ?? '?'
      }). Wybierz date w tym przedziale.`;

    case 'TIME_WINDOW_VIOLATION':
    case 'BAD_BLOCK_RANGE':
      return String(details?.message ?? 'Nieprawidlowy termin zajec');

    default:
      // Zwykle bledy API zwracaja gotowy tekst w polu `error`.
      return code ?? 'Blad polaczenia z serwerem';
  }
}
