import axios from 'axios';

/** Wyciaga czytelny komunikat bledu z odpowiedzi API ({ error: string }). */
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error ?? 'Blad polaczenia z serwerem';
  }
  return 'Nieznany blad';
}
