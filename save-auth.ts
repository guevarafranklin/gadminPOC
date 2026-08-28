import { chromium } from '@playwright/test';

/**
 * Step 1 — run ONCE (and again whenever the session expires):
 *   npm run auth
 *
 * A real Chrome window opens. YOU log in manually — username, password, 2FA.
 * When you can see the Admin console, come back to the terminal and press Enter.
 * The session (cookies) is saved to .auth/google.json and reused by the
 * automation script. Your password is never stored or typed by Playwright.
 */
const browser = await chromium.launch({
  headless: false,
  channel: 'chrome', // real Chrome looks less like a bot than bundled Chromium
});
const context = await browser.newContext();
const page = await context.newPage();

await page.goto('https://admin.google.com');

console.log('\nLog in manually in the browser window (including 2FA).');
console.log('When the Admin console dashboard is visible, press Enter here...');
await new Promise<void>((resolve) => process.stdin.once('data', () => resolve()));

await context.storageState({ path: '.auth/google.json' });
console.log('Session saved to .auth/google.json');
await browser.close();
