import type { ComponentType } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from '@/pages/LoginPage';
import PlaceholderPage from '@/pages/PlaceholderPage';
import FacultiesPage from '@/pages/FacultiesPage';
import BuildingsPage from '@/pages/BuildingsPage';
import InstructorsPage from '@/pages/InstructorsPage';
import TimeBlocksPage from '@/pages/TimeBlocksPage';
import CurriculumPage from '@/pages/CurriculumPage';
import CurriculumVersionPage from '@/pages/curriculum/CurriculumVersionPage';
import GroupsPage from '@/pages/GroupsPage';
import SchedulePage from '@/pages/SchedulePage';
import ProtectedRoute from '@/components/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { NAV_ITEMS } from '@/lib/navigation';

/** Gotowe strony — reszta tras dostaje zaslepke z numerem fazy. */
const PAGES: Record<string, ComponentType> = {
  '/curriculum': CurriculumPage,
  '/groups': GroupsPage,
  '/schedule': SchedulePage,
  '/faculties': FacultiesPage,
  '/buildings': BuildingsPage,
  '/instructors': InstructorsPage,
  '/time-blocks': TimeBlocksPage,
};

/** W ktorej fazie powstanie strona, ktorej jeszcze nie ma. */
const PHASE_OF: Record<string, number> = {
  '/': 8,
  '/holidays': 7,
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
        {NAV_ITEMS.map((item) => {
          const Page = PAGES[item.to];
          return (
            <Route
              key={item.to}
              path={item.to}
              element={
                <ProtectedRoute roles={item.roles}>
                  {Page ? (
                    <Page />
                  ) : (
                    <PlaceholderPage title={item.label} phase={PHASE_OF[item.to] ?? 0} />
                  )}
                </ProtectedRoute>
              }
            />
          );
        })}

        {/* Podstrona edytora konkretnej siatki — poza NAV_ITEMS, bo nie ma wlasnej
            pozycji w menu, ale breadcrumb i podswietlenie dziala przez prefiks /curriculum. */}
        <Route
          path="/curriculum/:versionId"
          element={
            <ProtectedRoute roles={['ADMIN', 'DEAN_OFFICE', 'INSTRUCTOR']}>
              <CurriculumVersionPage />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Nieznana sciezka -> strona startowa */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
