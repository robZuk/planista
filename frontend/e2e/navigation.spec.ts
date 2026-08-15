import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Nawigacja po zalogowaniu', () => {
  test('przejscie do Wydzialow laduje widok z lista', async ({ page }) => {
    await login(page);

    // Klikamy link w sidebarze (routing po stronie klienta — bez przeladowania).
    await page.getByRole('link', { name: 'Wydzialy' }).click();
    await expect(page).toHaveURL(/\/faculties$/);
    await expect(page.getByRole('heading', { name: /Wydzia/i })).toBeVisible();
  });
});
