import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from '@/pages/LoginPage';
import PlaceholderPage from '@/pages/PlaceholderPage';
import ProtectedRoute from '@/components/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { NAV_ITEMS } from '@/lib/navigation';

/** W ktorej fazie powstaje dana strona — do czasu jej napisania trasa pokazuje zaslepke. */
const PHASE_OF: Record<string, number> = {
  '/': 8,
  '/curriculum': 4,
  '/schedule': 6,
  '/groups': 5,
  '/faculties': 3,
  '/buildings': 3,
  '/instructors': 3,
  '/holidays': 7,
  '/time-blocks': 3,
  '/users': 9,
};

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        {/* Trasy generujemy z tej samej konfiguracji co sidebar — role nie moga sie rozjechac. */}
        {NAV_ITEMS.map((item) => (
          <Route
            key={item.to}
            path={item.to}
            element={
              <ProtectedRoute roles={item.roles}>
                <PlaceholderPage title={item.label} phase={PHASE_OF[item.to] ?? 0} />
              </ProtectedRoute>
            }
          />
        ))}
      </Route>

      {/* Nieznana sciezka -> strona startowa */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
