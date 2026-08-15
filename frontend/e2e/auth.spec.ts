import { test, expect } from '@playwright/test';
import { login, ADMIN } from './helpers';

test.describe('Uwierzytelnianie', () => {
  test('logowanie poprawnymi danymi wchodzi do aplikacji', async ({ page }) => {
    await login(page);
    // Po zalogowaniu jestesmy na panelu glownym (/), a nie na /login.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: 'Plan zajec' })).toBeVisible();
  });

  test('bledne haslo pokazuje blad i zostaje na logowaniu', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(ADMIN.email);
    await page.locator('#password').fill('zle-haslo');
    await page.getByRole('button', { name: 'Zaloguj sie' }).click();

    // Backend zwraca ten sam komunikat dla zlego emaila i hasla.
    await expect(page.getByText(/Nieprawidlowy email lub haslo/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('zly format emaila blokuje wyslanie (walidacja klienta)', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill('to-nie-email');
    await page.locator('#password').fill('cokolwiek');
    await page.getByRole('button', { name: 'Zaloguj sie' }).click();

    // Formularz ma noValidate — walidacja zod (react-hook-form) zatrzymuje wyslanie.
    await expect(page.getByText(/To nie wyglada na adres email/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('wejscie bez logowania przekierowuje na /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    // "Zaloguj sie" to CardTitle (nie naglowek) — asercja na stabilne pole formularza.
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
  });
});
