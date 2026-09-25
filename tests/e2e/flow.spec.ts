import { expect, test } from '@playwright/test';

/**
 * The whole journey with the scripted mock DM: admin invites a player, the
 * player registers, starts a bundled one-shot, plays two turns, and resumes
 * after a reload. Needs `npm run build` first.
 */
test('invite → register → play → resume', async ({ page, browser, request }) => {
  // Admin signs in and sets scene images to the placeholder generator.
  await page.goto('/play');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('e2e-admin-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a one-shot' })).toBeVisible();

  await page.goto('/admin');
  await page.getByRole('combobox').filter({ hasText: 'No images' }).selectOption('mock');
  await page.getByRole('button', { name: 'Save image settings' }).click();
  await expect(page.getByText('Image settings saved.')).toBeVisible();

  await page.getByPlaceholder('e.g. Sam from work').fill('Player One');
  await page.getByRole('button', { name: 'Create invite link' }).click();
  const inviteUrl = (await page.getByTestId('invite-url').textContent())!.trim();
  expect(inviteUrl).toMatch(/\/register\/[\w-]+$/);

  // Registration without a token doesn't exist.
  expect((await request.get('/register')).status()).toBe(404);

  // The player registers in a fresh browser context.
  const ctx = await browser.newContext();
  const player = await ctx.newPage();
  await player.goto(inviteUrl);
  await player.getByLabel('Username').fill('player1');
  await player.getByLabel(/^Password/).fill('player-one-password');
  await player.getByLabel('Confirm password').fill('player-one-password');
  await player.getByRole('button', { name: 'Create account' }).click();
  await expect(player.getByRole('heading', { name: 'Choose a one-shot' })).toBeVisible();

  // The same invite can't be used twice.
  const again = await ctx.newPage();
  await again.goto(inviteUrl);
  await expect(again.getByText('This invite has faded')).toBeVisible();
  await again.close();

  // Players don't see the admin area.
  expect((await player.request.get('/api/admin/users')).status()).toBe(403);

  // Start The Drowned Bell with a ready-made hero.
  await player.getByRole('link', { name: 'Begin The Drowned Bell' }).click();
  await expect(player.getByRole('heading', { name: 'The Drowned Bell' })).toBeVisible();
  await player.getByRole('button', { name: /Brenna Ironhollow/ }).click();
  await player.getByRole('button', { name: 'Begin the adventure' }).click();

  // Enter the story → the DM sets the scene and narrates.
  await player.getByRole('button', { name: 'Enter the story' }).click();
  await expect(player.getByText(/Rain drums on the slate roof/)).toBeVisible({ timeout: 20_000 });
  await expect(player.getByRole('heading', { name: 'The Gilded Gull' })).toBeVisible();
  await expect(player.getByRole('img', { name: 'The Gilded Gull' })).toBeVisible({ timeout: 15_000 });

  // An attack shows a dice chip with the roll.
  await player.getByLabel('Your action').fill('I attack the bandit!');
  await player.getByRole('button', { name: 'Act' }).click();
  await expect(player.getByText('Longsword vs Bandit')).toBeVisible({ timeout: 20_000 });
  await expect(player.getByText(/Steel rings against steel/)).toBeVisible();

  // Reload resumes the same story.
  await player.reload();
  await player.getByRole('button', { name: 'Continue' }).click();
  await expect(player.getByText(/Rain drums on the slate roof/)).toBeVisible();
  await expect(player.getByText('Longsword vs Bandit')).toBeVisible();

  // It's listed under "Continue your tale".
  await player.goto('/play');
  await expect(player.getByRole('heading', { name: 'Continue your tale' })).toBeVisible();

  await ctx.close();
});
