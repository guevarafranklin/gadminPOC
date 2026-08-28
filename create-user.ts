import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

/**
 * Spec-driven user creation:
 *   npm run create-user -- --spec specs/users.yaml
 *   npm run create-user -- --spec specs/users.yaml --yes   (no confirmation pause)
 */

// --- args + spec loading ------------------------------------------------
function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing --${name}`);
}

interface UserSpec {
  firstName: string;
  lastName: string;
  email: string;
}
interface Spec {
  notes?: string;
  users: UserSpec[];
}

const specPath = arg('spec', 'specs/users.yaml');
const autoSubmit = process.argv.includes('--yes');
const spec = parse(readFileSync(specPath, 'utf-8')) as Spec;

// Minimal validation — fail before the browser ever opens.
if (!Array.isArray(spec.users) || spec.users.length === 0) {
  throw new Error(`${specPath}: "users" must be a non-empty list`);
}
for (const [i, u] of spec.users.entries()) {
  for (const field of ['firstName', 'lastName', 'email'] as const) {
    if (!u[field]) throw new Error(`${specPath}: users[${i}] is missing "${field}"`);
  }
  if (u.email.includes('@')) {
    throw new Error(`${specPath}: users[${i}].email should be the local part only (no @domain)`);
  }
}
console.log(`Loaded ${spec.users.length} user(s) from ${specPath}`);

// --- run ----------------------------------------------------------------
const browser = await chromium.launch({ headless: false, channel: 'chrome' });
const context = await browser.newContext({ storageState: '.auth/google.json' });
const page = await context.newPage();

await page.goto('https://admin.google.com/ac/users');
if (page.url().includes('accounts.google.com')) {
  console.error('Session expired — run `npm run auth` again.');
  await browser.close();
  process.exit(1);
}

const results: Record<string, string> = {};

for (const user of spec.users) {
  console.log(`\n→ Creating ${user.firstName} ${user.lastName} <${user.email}@…>`);

  await page.getByText('Add new user', { exact: false }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/first name/i).fill(user.firstName);
  await dialog.getByLabel(/last name/i).fill(user.lastName);
  await dialog.getByLabel(/primary email/i).fill(user.email);

  if (!autoSubmit) {
    console.log('  Review the dialog. Press Enter to submit, Ctrl+C to abort...');
    await new Promise<void>((resolve) => process.stdin.once('data', () => resolve()));
  }

  try {
    await dialog.getByRole('button', { name: /add new user/i }).click();
    await page.getByText(/user added|has been added/i).waitFor({ timeout: 15_000 });
    results[user.email] = 'created';
    console.log('  ✔ created');
    // Close the confirmation dialog so the next iteration starts clean.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } catch (err) {
    results[user.email] = `failed: ${(err as Error).message.split('\n')[0]}`;
    console.error(`  ✘ failed — likely already exists or the dialog changed. Skipping.`);
    await page.keyboard.press('Escape'); // recover and continue with the rest
    await page.waitForTimeout(500);
  }
}

// --- summary ------------------------------------------------------------
console.log('\nRun summary:');
for (const [email, status] of Object.entries(results)) {
  console.log(`  ${email}: ${status}`);
}

await browser.close();
