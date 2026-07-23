import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types';

/**
 * Stan uwierzytelnienia (Zustand + persist w localStorage).
 * Trzyma zalogowanego uzytkownika i oba tokeny, zeby przetrwaly odswiezenie strony.
 *
 * Impersonacja (Faza 9): admin moze podejrzec system jako inny uzytkownik. Oryginalna
 * sesja admina jest chowana w `originalAuth`, a na wierzchu ląduje krotki token
 * podgladowy. `partialize` zapisuje do localStorage TYLKO sesje oryginalna, wiec
 * odswiezenie strony bezpiecznie konczy podglad i wraca do admina.
 */
interface OriginalAuth {
  accessToken: string;
  refreshToken: string | null;
  user: User;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** Zachowana sesja admina, gdy trwa impersonacja (inaczej null). */
  originalAuth: OriginalAuth | null;

  /** Zapisuje sesje po zalogowaniu. */
  setAuth: (data: { user: User; accessToken: string; refreshToken: string }) => void;
  /** Podmienia sam access token (po odswiezeniu). */
  setAccessToken: (accessToken: string) => void;
  /** Aktualizuje dane uzytkownika (np. po GET /auth/me). */
  setUser: (user: User) => void;
  /** Wchodzi w tryb podgladu jako inny uzytkownik (chowa sesje admina). */
  impersonate: (accessToken: string, user: User) => void;
  /** Wraca do sesji admina. */
  stopImpersonating: () => void;
  /** Czysci sesje (wylogowanie). */
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      originalAuth: null,

      setAuth: ({ user, accessToken, refreshToken }) =>
        set({ user, accessToken, refreshToken, originalAuth: null }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setUser: (user) => set({ user }),

      impersonate: (accessToken, user) => {
        const { accessToken: origToken, refreshToken: origRefresh, user: origUser } = get();
        if (!origToken || !origUser) return;
        set({
          accessToken,
          user,
          // Token podgladowy jest nieodnawialny — brak refresh tokenu w trakcie podgladu.
          refreshToken: null,
          originalAuth: { accessToken: origToken, refreshToken: origRefresh, user: origUser },
        });
      },

      stopImpersonating: () => {
        const { originalAuth } = get();
        if (!originalAuth) return;
        set({
          accessToken: originalAuth.accessToken,
          refreshToken: originalAuth.refreshToken,
          user: originalAuth.user,
          originalAuth: null,
        });
      },

      clearAuth: () => set({ user: null, accessToken: null, refreshToken: null, originalAuth: null }),
    }),
    {
      name: 'planista7-auth',
      // Utrwalamy zawsze sesje oryginalna (admina), nigdy podgladowej.
      partialize: (state) => ({
        user: state.originalAuth ? state.originalAuth.user : state.user,
        accessToken: state.originalAuth ? state.originalAuth.accessToken : state.accessToken,
        refreshToken: state.originalAuth ? state.originalAuth.refreshToken : state.refreshToken,
      }),
    },
  ),
);
