# Canonical Pulse Work-Item Design

## Boundary and non-redundancy decision

SavvyOS already has both general platform `tasks` and a project-oriented Work module (`work_tasks`, projects, memberships, assignees, and stories). Neither model has Pulse Scope ownership, immutable Pulse session provenance, normalized placement, or policy-led cross-scope visibility. The new tables are therefore **Pulse-specific canonical operating work**; this implementation does not mutate or repurpose existing CRM or Work-project tasks.

## Base and extensions

`pulse_work_items` is an intentionally subtype-neutral base. It holds one primary Scope, current assignee, current status, immutable creation provenance, current source-quality fields, and latest transition enforcement state. It uses `itemType` values `todo` and `issue`; an additional subtype can be added by adding an extension table and enum value without changing the base’s ownership, access, activity, comment, mention, placement, or notification contracts.

| Table | Responsibility |
|---|---|
| `pulse_work_items` | Shared identity, title/body, current primary scope, assignee, status, immutable creation provenance, current transition validation fields |
| `pulse_work_item_placements` | Explicit additional Scope placements; no routing strings or comma-separated fields |
| `pulse_todos` | Todo-only due date, priority, flag, recurrence link, and completion note |
| `pulse_issues` | Issue-only priority, timeframe, and resolution |
| `pulse_issue_votes` | Normalized issue votes with optional meeting-session provenance |
| `pulse_work_item_recurrences` | Recurrence contract referenced by Todo extension |
| `pulse_work_item_activity` | Typed append-only item history, including move and status events |
| `pulse_work_item_comments` | Shared comments |
| `pulse_work_item_mentions` | Shared normalized mentions |
| `pulse_work_item_notification_intents` | Shared notification contract; a future delivery worker must call `canDeliver` before composition and delivery |

## Scope and provenance rules

Every item has `primary_scope_id`. Additional placement is an intentional relation in `pulse_work_item_placements`. A private item always has a primary scope whose type is `private`; it never uses a blank or “general” routing value.

Creation provenance is immutable: `created_by_person_id`, `created_at`, `created_in_session_id`, and `created_in_scope_id` never change. Present-day `primary_scope_id` and `assignee_person_id` are independent fields. Moving an item validates the target scope through centralized policy, updates only the current primary scope, and writes typed move activity plus a Pulse domain event. Creating an item in one Scope from a session in another records that provenance at creation; it is not treated as a move.

## Status transitions

The canonical status set is `not_started`, `in_progress`, `blocked`, `complete`, and `skipped`. Application transitions write a substantive activity note. Database triggers also reject changed statuses without a substantive latest transition note. `blocked` requires a structured blocker type and, if the type is `person`, a blocker person. The only note exemption is the future meeting runner’s explicit `runner_bulk_completion` mode, and it is only valid for `complete`.

## Access, queries, and source labels

The current Pulse policy service gains `canViewWorkItem`. It evaluates active Scope access via the item’s primary scope or an intentional active placement; no page reimplements this logic. `myWork`, `scopeWork`, and `notificationWork` all call a single enriched query that returns the same owner, status, activity, access outcome, and source label.

Source labels are deterministic. For current work seen outside its own Scope, the item shows the scope’s canonical name using Scope semantics: L10/meeting name, team name, `1:1 with [person]`, or `Personal`. If immutable provenance lacks a resolvable active scope, it returns a visible label such as `Data quality: missing creation scope`; it never returns a generic fallback label.

## Acceptance slice

A rollback-only integration test creates a Todo with immutable provenance and explicit secondary placement. It verifies same-source/owner/activity/access output from personal, Scope, and notification query contracts; validates an item move leaves provenance unchanged; confirms blocked-state rules; and proves a private Scope is represented explicitly rather than through empty routing.
