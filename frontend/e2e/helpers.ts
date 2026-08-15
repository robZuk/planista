import { expect, type Page } from '@playwright/test';

/** Konto ADMIN z seeda (prisma/seed.ts). Read-only scenariusze, wiec haslo moze byc tu wprost. */
export const ADMIN = { email: 'admin@umg.edu.pl', password: 'Admin1234!' };

/**
 * Loguje przez prawdziwy formularz i czeka az wejdziemy do aplikacji.
 * Sukces poznajemy po linku "Panel glowny" w sidebarze (AppShell) — stabilniejsze
 * niz toast, ktory znika.
 */
export async function login(page: Page, email = ADMIN.email, password = ADMIN.password) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Zaloguj sie' }).click();
  // Sukces = ProtectedRoute wpuscil nas na panel glowny (/). Stabilniejsze niz toast
  // (znika) czy konkretny element sidebaru (zalezny od roli/layoutu).
  await expect(page).toHaveURL(/\/$/);
}
