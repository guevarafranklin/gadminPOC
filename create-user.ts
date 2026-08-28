import { chromium } from '@playwright/test';

/**
 * Step 2 — the actual automation:
 *   npm run create-user -- --first Ana --last Torres --email ana.torres
 *
 * Reuses the session captured by save-auth.ts. Same pattern as the ERP tool:
 * role/label-based selectors, explicit waits on the app's own signals,
 * and a review pause before the irreversible click.
 */

// --- tiny arg parsing ---------------------------------------------------
function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing --${name}`);
}
const first = arg('first');
const last = arg('last');
const email = arg('email'); // local part only; domain comes from your workspace

// --- run ----------------------------------------------------------------
const browser = await chromium.launch({ headless: false, channel: 'chrome' });
const context = await browser.newContext({ storageState: '.auth/google.json' });
const page = await context.newPage();

// Go straight to Directory > Users
await page.goto('https://admin.google.com/ac/users');

// If we got bounced to a login page, the saved session expired.
if (page.url().includes('accounts.google.com')) {
  console.error('Session expired — run `npm run auth` again.');
  await browser.close();
  process.exit(1);
}

// Open the "Add new user" dialog.
// Google's DOM classes are obfuscated, so we anchor on visible text/roles.
await page.getByText('Add new user', { exact: false }).first().click();

// Fill the form using its labels.
const dialog = page.getByRole('dialog');
await dialog.getByLabel(/first name/i).fill(first);
await dialog.getByLabel(/last name/i).fill(last);
await dialog.getByLabel(/primary email/i).fill(email);

// console.log(`Form filled: ${first} ${last} <${email}@…>`);
// console.log('Review the dialog in the browser. Press Enter to submit, Ctrl+C to abort...');
// await new Promise<void>((resolve) => process.stdin.once('data', () => resolve()));

// await dialog.getByRole('button', { name: /add new user/i }).click();
console.log(`Form filled: ${first} ${last} <${email}@…>`);

const autoSubmit = process.argv.includes('--yes');
if (!autoSubmit) {
  console.log('Press Enter to submit, Ctrl+C to abort (or pass --yes to skip this)...');
  await new Promise<void>((resolve) => process.stdin.once('data', () => resolve()));
}

await dialog.getByRole('button', { name: /add new user/i }).click();

// Wait for Google's own confirmation instead of a blind timeout.
await page.getByText(/user added|has been added/i).waitFor({ timeout: 15_000 });
console.log('User created ✔');

await browser.close();
