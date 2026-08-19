# Pulse Foundation Browser Verification Notes

- Local SavvyOS instance started successfully at `http://localhost:3001`.
- The `/login` route rendered the SavvyOS email/password sign-in form after the development bundle completed loading.
- Verification will use the clearly labeled, reversible Pulse foundation seed accounts created by `scripts/pulse-foundation-seed.ts`.

The local login form accepted the marked test-account credentials, but the server could not issue a session because the local environment lacked the JWT signing secret. The local server must be restarted with the existing SavvyOS JWT secret before browser verification can continue.

After restarting the local server with its JWT signing secret, the SavvyOS login form rendered correctly and was ready for the dedicated Pulse test accounts.

The dedicated single-meeting test member submitted the local sign-in form successfully. The page transitioned while the authenticated application loaded.

The one-meeting verification account was entered again after the local session configuration was completed and was ready for sign-in.

The single-meeting member signed in successfully and opened Pulse. The left navigation contained exactly three Pulse destinations: Home, My Inputs, and the member’s one meeting, “Pulse Test — Leadership L10.” The home screen rendered the plain-language question “What needs me right now?” and one accessible meeting card.

The single-meeting view was visually inspected in the browser and the test account was then signed out, ready for the separate multi-meeting scenario.

The four-meeting test member authenticated successfully and was ready to open Pulse for the five-destination navigation check.

The revised test fixtures were loaded and the browser returned to the local sign-in page for the administrator-enabled four-meeting navigation check.

The refreshed four-meeting account authenticated successfully after the fixture adjustment and was ready for the final five-destination Pulse navigation check.

The administrator-enabled four-meeting member opened Pulse and the browser displayed exactly five destinations: Home, My Work, My Inputs, Meetings, and Settings. This completed the required five-destination verification for the multi-meeting test person.
