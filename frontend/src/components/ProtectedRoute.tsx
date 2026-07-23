import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import type { Role } from '@/types';

interface Props {
  children: ReactNode;
  /** Jesli podane — tylko te role maja wstep. Brak = wystarczy byc zalogowanym. */
  roles?: Role[];
}

/**
 * Straznik trasy. Niezalogowanych odsyla na /login (zapamietujac, dokad szli),
 * zalogowanych bez wymaganej roli — na strone glowna.
 */
export default function ProtectedRoute({ children, roles }: Props) {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const location = useLocation();

  if (!accessToken || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
