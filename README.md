# Google Admin POC — Playwright users creation

## Run

```bash
npm install
npx playwright install chrome   # uses real Chrome, not bundled Chromium

# 1. Capture your session (manual login + 2FA, once)
npm run auth

# 2. Create a users
npm run create-user -- --spec specs/users.yaml --yes

# 3. Verify users creation
npm run verify-users -- --spec specs/users.yaml
```

## What this POC proves for the ERP tool

- **Auth reuse**: log in manually once, automate with the saved session (.auth/google.json).
  Never automate the login form itself.
- **Resilient selectors**: getByRole / getByLabel / visible text — survives Google's
  obfuscated, ever-changing CSS classes.
- **Human gate before irreversible actions**: the script pauses for review before
  clicking the final "Add new user" button.
- **Signal-based waits**: waits for the app's own success message, not sleep().

## Caveats

- .auth/google.json IS your session — treat it like a password. It's gitignored.
- Google sessions expire; re-run `npm run auth` when the script tells you to.
- Google may still challenge automated browsers. For real provisioning at scale,
  use the Admin SDK Directory API — this POC is for learning the UI pattern.
