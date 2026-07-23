import axios, { type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/authStore';

/**
 * Klient HTTP do backendu. baseURL '/api' -> proxy Vite przekazuje na :4001.
 *
 * Dwa interceptory:
 *  - request: dokleja Authorization: Bearer <accessToken>.
 *  - response: przy 401 probuje RAZ odswiezyc access token (refresh) i ponowic zadanie.
 *    Jesli refresh sie nie uda -> czysci sesje.
 */
export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Osobna instancja do refresh, zeby nie zapetlic interceptorow.
const bareClient = axios.create({ baseURL: '/api' });

let refreshing: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const { refreshToken, setAccessToken, clearAuth } = useAuthStore.getState();
  if (!refreshToken) {
    clearAuth();
    throw new Error('Brak refresh tokenu');
  }
  try {
    const res = await bareClient.post('/auth/refresh', { refreshToken });
    const newAccess: string = res.data.data.accessToken;
    setAccessToken(newAccess);
    return newAccess;
  } catch (err) {
    clearAuth();
    throw err;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };
    const status = error.response?.status;

    // Odswiezaj tylko raz i tylko dla 401 (nie dla samego /auth/refresh).
    if (status === 401 && original && !original._retried && !original.url?.includes('/auth/refresh')) {
      original._retried = true;
      try {
        // Wspoldzielony refresh: rownolegle 401 czekaja na to samo odswiezenie.
        refreshing ??= refreshAccessToken().finally(() => {
          refreshing = null;
        });
        const newAccess = await refreshing;
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      } catch {
        // fallthrough -> odrzuc ponizej
      }
    }
    return Promise.reject(error);
  },
);
