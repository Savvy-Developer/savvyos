# Pulse Work Items Browser Verification Notes

## Local setup

The local SavvyOS instance on `http://localhost:3002` rendered the standard sign-in screen successfully. The screen showed the expected email and password fields and a visible **Sign in** control. The browser verification will use the clearly marked, reversible `pulse_foundation_seed_four@savvy.test` account, which belongs to four seeded Pulse meetings.

## Four-meeting member verification

The focused Pulse navigation rendered the five allowed destinations: Home, My Work, My Inputs, Meetings, and Settings. In **My Work**, the raw verification list rendered the seeded to-do, issue, and rocks, each with its meeting name. The list exposed the required filters for type, status, assignee, and meeting; displayed overdue state; and used visible inline controls for to-do completion and rock status/progress.

Opening a to-do did not navigate away. It rendered an in-place detail panel with editable name, description, due date, destination move control with an optional reason, comments, active meeting-member-only mention choices, and activity history. The panel showed the existing valid comment mention while retaining the meeting boundary.

## Rock detail verification

Opening the rollover verification rock preserved the in-place detail panel. The panel showed milestone controls, a manual-progress fallback when no milestones exist, a meeting-only move control, comments, and history. The completed quarter choice appeared in history as **Carried to Q3 2026**, confirming that the one-time prompt resolves to an auditable work-item update rather than a silent automatic move.
