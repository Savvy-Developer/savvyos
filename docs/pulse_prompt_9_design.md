# Pulse V2 Prompt 9 — Design Contract

## Scope and boundary

Prompt 9 remains entirely inside **Pulse**. It adds no platform-wide navigation, Feature Update, Daily Report content, agent-email announcement, or integration into CRM, Agents, goals, market goals, or other SavvyOS modules. Existing SavvyOS tables are used only as sources of people, metrics, and company goals; Pulse remains the sole owner of meeting configuration, membership visibility, delivery preferences, archives, and effectiveness diagnostics.

## Authorization

| Capability | Authorization rule |
|---|---|
| Pulse Settings navigation | Included in the existing Pulse navigation only when the user owns or administers at least one visible meeting, or has the Pulse `super_admin` role. |
| Meeting configuration | The owner or administrator of that meeting, or a Pulse super admin. A super admin may configure a meeting without needing membership. |
| Meeting membership | An authorized configurator for the specific meeting. Membership remains the only route to meeting-scoped visibility. |
| Platform role changes | Pulse super admin only. A platform role is never used to add a meeting membership. |
| Email transparency | Pulse Settings users may manage their own Pulse delivery preferences and send tests only to their own verified account email. |
| Meeting effectiveness | Pulse super admin only. Procedures return a clear denial to others and members receive no effectiveness key in any meeting payload. |

## Existing data reuse

No Prompt 9 schema migration is required. `pulse_meetings` already stores the meeting basics, sections, durations, cadence, timezone, and reminder schedule. `pulse_meeting_members` already stores membership and owner/administrator/member roles. `meeting_scorecard_metrics`, `meeting_rocks`, and `meeting_goals` are the existing display mappings. `pulse_meetings_archive` already persists occurrence facts needed for the effectiveness diagnostic. `pulse_notification_preferences` already represents independent in-app and email choices.

The implementation will add Pulse-only contracts around these records rather than add a parallel team, role, meeting, or notification model.

## Configuration and permissioning contracts

The meeting configuration page will be one page, with immediate field saves. It will support meeting basics, people, the nine ordered section toggles and per-section minutes, metric/rock/goal placement, reminder settings, and manager-only occurrence history. Membership removal will commit immediately, show an eight-second Undo, and restore the same membership if undone. Deleting a meeting will require its exact name and soft-retire it only after confirmation.

The super-admin permissioning screen will source columns directly from active Pulse meetings. Its membership checkboxes will grant or remove access immediately, write through Pulse mutation auditing to `activity_log`, and offer the same eight-second Undo. Platform-role selection is independent, super-admin gated, and explicitly described as having no effect on meeting visibility.

## Email transparency contract

The existing seven Pulse templates are the source of truth: meeting reminder, to-do assignment, cascading message, overdue digest, mention, rock completed, and welcome. The transparency screen will render the exact live template with sample Pulse data, let a user send the real template only to their own email address, and present separate, visibly distinct delivery switches. It will state the current combination in plain language.

A shared Pulse delivery helper will respect both switches independently: `inApp` controls whether a Pulse notification is written; `email` controls whether the transactional email is sent. Test sends are explicitly requested by an authorized user and do not alter the user's normal settings.

## Meeting effectiveness contract

A Pulse-super-admin-only table will show one neutral row per active meeting: average actual versus scheduled duration, to-dos completed versus created, issues resolved, attendance, and average conclude rating. Each cell will use a trailing-eight-occurrence calculation with a small directional shape. The drill-down will return occurrence history only to Pulse super admins. It will avoid grades, colors that judge performance, ranks, and charts.

## Acceptance evidence

The Prompt 9 verifier will create and retire marked Pulse fixtures. It will prove settings-nav absence and URL denial for members, creation duration under sixty seconds, a dynamically created permissioning column, immediate membership visibility plus undo, role-change non-escalation, typed deletion confirmation, seven live-template previews and test sends, independently controlled delivery channels, super-admin-only effectiveness payloads, and the specified accessibility checks.

No platform-wide Feature Update will be created or published for Prompt 9 unless Tyler explicitly reverses the Pulse-only distribution instruction.
