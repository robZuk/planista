import type { ComponentType } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from '@/pages/LoginPage';
import FacultiesPage from '@/pages/FacultiesPage';
import BuildingsPage from '@/pages/BuildingsPage';
import InstructorsPage from '@/pages/InstructorsPage';
import TimeBlocksPage from '@/pages/TimeBlocksPage';
import CurriculumPage from '@/pages/CurriculumPage';
import CurriculumVersionPage from '@/pages/curriculum/CurriculumVersionPage';
import GroupsPage from '@/pages/GroupsPage';
import SchedulePage from '@/pages/SchedulePage';
import HolidaysPage from '@/pages/HolidaysPage';
import SemesterCalendarsPage from '@/pages/SemesterCalendarsPage';
import DashboardPage from '@/pages/DashboardPage';
import UsersPage from '@/pages/UsersPage';
import ProtectedRoute from '@/components/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { NAV_ITEMS } from '@/lib/navigation';

/** Strony podpiete pod trasy z NAV_ITEMS. */
const PAGES: Record<string, ComponentType> = {
  '/': DashboardPage,
  '/curriculum': CurriculumPage,
  '/groups': GroupsPage,
  '/schedule': SchedulePage,
  '/holidays': HolidaysPage,
  '/semester-calendars': SemesterCalendarsPage,
  '/faculties': FacultiesPage,
  '/buildings': BuildingsPage,
  '/instructors': InstructorsPage,
  '/time-blocks': TimeBlocksPage,
  '/users': UsersPage,
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
                  <Page />
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
