# Pulse V2 Foundation — Schema and Access Summary

Pulse is a meeting-operating module within SavvyOS. It has **no Pulse team, group, department, circle, or team-to-meeting entity**. A person’s active membership in a meeting is the only path to that meeting and its meeting-scoped data.

## Schema

| Table | Primary key | Purpose | Key relationships and safeguards |
|---|---|---|---|
| `pulse_profiles` | `userId` → `users.id` | Adds Pulse-only platform role, timezone, and notification preferences without changing the SavvyOS people model. | A profile extends an existing SavvyOS user. `platformRole` governs administrative capability only; it never grants meeting visibility. |
| `pulse_meetings` | UUID `id` | Stores every Level 10, one-on-one, and other meeting in the same table. | `ownerId` and `administratorId` reference `users`. `label` is only used for list grouping and creation defaults. Section configuration is independent of the label. |
| `pulse_meeting_members` | UUID `id` | Defines who can see a meeting. | Joins one user to one meeting; unique on `(meetingId, personId)`. Soft removal uses `removedAt` and preserves history. |
| `pulse_work_items` | UUID `id` | Stores to-dos, issues, and rocks in one table. | Exactly one of `meetingId` or `ownerPersonId` is required by `pulse_work_items_exactly_one_owner`. `isPersonal` is generated from `meetingId`. |
| `pulse_work_item_moves` | UUID `id` | Preserves work-item movement history. | Records the previous and new meeting when a work item is moved through the Pulse API. |
| `pulse_work_item_status_notes` | UUID `id` | Preserves a note whenever a work item’s status changes. | References the work item and the person who supplied the note. |
| `pulse_activity_log` | UUID `id` | Keeps append-only Pulse field and access history. | Records creates, updates, access grants or revocations, status changes, and moves without changing SavvyOS’s shared CRM activity log. |
| `pulse_glossary` | UUID `id` | Centralizes plain-language definitions of Pulse terms. | Seeds **Rocks**, **Level 10**, and **Segue** so visible UI terms can use one shared gloss. |
| `pulse_meetings_archive` | UUID `id` | Stores a per-occurrence record from a future meeting Run view. | Holds occurrence date, attendees, duration, to-do and issue counts, rating, and notes. It is data-only in this foundation release. |

All Pulse records use soft deletion where a user-facing deletion can occur. All timestamps are stored as UTC timestamps by MySQL and are ready to be rendered in the viewer’s timezone.

## Meeting visibility call sites

> `visible_meeting_ids(personId)` is defined once in `server/pulse/access.ts`. It is the first operation used by every meeting-scoped query path in the Pulse router.

| File | Function or procedure | How visibility is enforced |
|---|---|---|
| `server/pulse/access.ts` | `visible_meeting_ids` | Returns only active `pulse_meeting_members` rows for the requesting person. |
| `server/pulse/access.ts` | `require_visible_meeting` | Calls `visible_meeting_ids` before resolving a meeting. Missing or inaccessible records return “This meeting no longer exists. Go to your meetings.” |
| `server/routers/pulse.ts` | `listVisibleMeetings` | Starts from `visible_meeting_ids` and joins the caller’s active membership. |
| `server/routers/pulse.ts` | `getVisibleMeetingWorkItems` | Resolves the meeting through `require_visible_meeting` and bounds work items to the visible meeting IDs. |
| `server/routers/pulse.ts` | `pulse.visibleMeetingIds` | Exposes only the caller’s own visible meeting identifiers for diagnostic and shell use. |
| `server/routers/pulse.ts` | `pulse.search` | Bounds all searched work items to the caller’s visible meeting IDs. |
| `server/routers/pulse.ts` | `pulse.moveWorkItem` | Verifies visibility of both the source and destination meeting before changing an item and writing `pulse_work_item_moves`. |

The `pulse.get` member response is deliberately shaped so that member payloads **do not contain** configuration, Run, archive, or effectiveness fields. Those keys are absent instead of being sent as disabled or false values.

## Foundation shell

Pulse uses the SavvyOS application shell and authentication system. When users enter Pulse, the left navigation is capped at five destinations. A member in one meeting sees **Home**, **My Inputs**, and that meeting. A person in several meetings sees **Home**, **My Work**, **My Inputs**, and **Meetings**; **Settings** is present only when they own or administer a meeting, or qualify for the future super-admin reporting surface.

The foundation shell supplies plain-language home, work, inputs, meetings, meeting-detail, and settings routes. It includes responsive cards, 44px-or-larger interactive rows and buttons, semantic headings, native controls, visible focus styles inherited from SavvyOS, and no modal chains.
