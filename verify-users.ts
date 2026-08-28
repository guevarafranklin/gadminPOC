import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

/**
 * Verify suite — asserts every user in the spec actually exists in the directory.
 *   npm run verify-users -- --spec specs/users.yaml
 *
 * Exit code 0 = environment matches spec. Non-zero = drift (missing/mismatched
 * users), which makes this usable as a CI gate later.
 */

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
const spec = parse(readFileSync(specPath, 'utf-8')) as Spec;
if (!Array.isArray(spec.users) || spec.users.length === 0) {
  throw new Error(`${specPath}: "users" must be a non-empty list`);
}
console.log(`Verifying ${spec.users.length} user(s) from ${specPath}\n`);

const browser = await chromium.launch({ headless: false, channel: 'chrome' });
const context = await browser.newContext({ storageState: '.auth/google.json' });
const page = await context.newPage();

await page.goto('https://admin.google.com/ac/users');
if (page.url().includes('accounts.google.com')) {
  console.error('Session expired — run `npm run auth` again.');
  await browser.close();
  process.exit(1);
}

const results: Record<string, 'ok' | 'missing' | 'name-mismatch'> = {};

// The users list has a search/filter box. Anchor on its accessible name;
// if this locator misses on your console, run `npx playwright codegen`
// and adjust — this is the one selector most likely to need tuning.
// Only visible <input> elements whose label/placeholder mentions "search" —
// this excludes Google's hidden "Close search" button that also matches /search/i.
const searchBox = page
  .locator(
    'input[aria-label*="search" i]:visible, input[placeholder*="search" i]:visible'
  )
  .first();

for (const user of spec.users) {
  const fullName = `${user.firstName} ${user.lastName}`;

  await searchBox.click();
  await searchBox.fill(user.email);
  await page.keyboard.press('Enter');
  // Wait for the results region to settle on something matching or a "no results" state.
  await page.waitForTimeout(1500); // search-as-you-type UI; small settle is pragmatic here

  const row = page.getByText(fullName, { exact: false }).first();
  const emailHit = page.getByText(user.email, { exact: false }).first();

  if (await row.isVisible().catch(() => false)) {
    results[user.email] = 'ok';
    console.log(`  ✔ ${user.email} → found as "${fullName}"`);
  } else if (await emailHit.isVisible().catch(() => false)) {
    // The account exists but the display name doesn't match the spec.
    results[user.email] = 'name-mismatch';
    console.log(`  ✘ ${user.email} → exists, but name doesn't match "${fullName}"`);
  } else {
    results[user.email] = 'missing';
    console.log(`  ✘ ${user.email} → NOT FOUND`);
  }

  await searchBox.fill(''); // reset for the next lookup
}

await browser.close();

// --- summary + exit code -------------------------------------------------
const failures = Object.entries(results).filter(([, s]) => s !== 'ok');
console.log(`\nVerify summary: ${spec.users.length - failures.length}/${spec.users.length} match the spec.`);
if (failures.length > 0) {
  console.log('Drift detected:');
  for (const [email, status] of failures) console.log(`  ${email}: ${status}`);
  process.exit(1);
}
