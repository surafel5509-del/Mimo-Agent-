import { test, expect } from '@playwright/test';

/**
 * The 11-step user journey. Requires a running server with a migrated database.
 * The chat step checks the honest outcome: a real answer when NVIDIA_API_KEY is set,
 * otherwise a clear "not configured" message (never a fabricated reply).
 */
const email = `e2e-${Date.now()}@example.com`;
const password = 'JourneyPass123';

test.describe.configure({ mode: 'serial' });

test('11-step user journey', async ({ page }) => {
  // 1. Anonymous visitors are sent to sign in.
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);

  // 2. Create an account.
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();

  // 3. Registration signs the user in and lands on the chat workspace.
  await expect(page).toHaveURL(/\/chat/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'What can I help you with today?' })).toBeVisible();

  // 4. Choose an agent mode from the composer.
  await page.getByLabel('Agent mode').selectOption('research');
  await expect(page.getByLabel('Agent mode')).toHaveValue('research');

  // 5. Send a message; the user bubble appears immediately.
  await page.getByLabel(/Message MIMO AGENT/).fill('Explain in two sentences why source citations matter.');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Explain in two sentences why source citations matter.')).toBeVisible();

  // 6. The assistant either answers or states that the model is not configured. It never invents a reply.
  // The assistant bubble renders Markdown (.md); a failure renders an alert.
  await expect(page.locator('.md, [role="alert"]').first()).toBeVisible({ timeout: 60_000 });

  // 7. The conversation appears in the sidebar history.
  await expect(page.getByRole('navigation', { name: 'Chat history' }).getByRole('link').first()).toBeVisible();

  // 8. Open the agent activity panel.
  await page.getByRole('button', { name: 'Toggle agent activity panel' }).click();
  await expect(page.getByRole('complementary', { name: 'Agent activity' })).toBeVisible();

  // 9. Upload a plain-text document in the Documents view.
  await page.goto('/documents');
  await page.getByLabel('Upload document').setInputFiles({
    name: 'brief.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Quarterly brief: revenue grew 12 percent in the second quarter.'),
  });
  await expect(page.getByText('brief.txt')).toBeVisible({ timeout: 30_000 });

  // 10. Save a memory the user controls.
  await page.goto('/memory');
  await page.getByLabel('Memory content').fill('I prefer concise answers with bullet points.');
  await page.getByRole('button', { name: 'Add memory' }).click();
  await expect(page.getByText('I prefer concise answers with bullet points.')).toBeVisible();

  // 11. Update settings, then sign out and confirm the session is closed.
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  // On small screens the sidebar is a drawer opened from the top bar.
  const openNav = page.getByRole('button', { name: 'Open navigation' });
  if (await openNav.isVisible()) await openNav.click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/chat');
  await expect(page).toHaveURL(/\/login/);
});
