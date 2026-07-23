/**
 * Logika blokow czasowych: parsowanie "HH:MM", wyliczanie konca (zawsze +1h,
 * bo siatka jest wylacznie 1-godzinna) i etykiety. Uzywane przez kontroler
 * TimeBlock, zeby wymusic regule "kazdy blok trwa dokladnie 1h".
 */

const TIME_RE = /^([01]\d|2[0-3]):00$/; // tylko pelne godziny, np. "07:00", "19:00"

/** Sprawdza format "HH:00" (pelna godzina). */
export function isValidHour(time: string): boolean {
  return TIME_RE.test(time);
}

/** Zwraca godzine konca (startTime + 1h), np. "07:00" -> "08:00". */
export function addOneHour(startTime: string): string {
  const hour = Number(startTime.slice(0, 2));
  const nextHour = (hour + 1) % 24;
  return `${String(nextHour).padStart(2, '0')}:00`;
}

export function blockLabel(startTime: string, endTime: string): string {
  return `${startTime}-${endTime}`;
}
