# Pulse Canonical Completed and Resolved History Design

## Principle

Completion is a **state change**, not an archive move. Every Pulse To-Do and Issue remains in `pulse_work_items`, with its existing meeting or personal destination, assignee, rich details, attachments, comments, status notes, moves, and activity records intact. The active lists are simply filtered to exclude `status = completed`.

| View | Default content | Recall control | Scope |
|---|---|---|---|
| My EOS | Active owned To-Dos and Issues | Completed / Resolved history, search, date range | Selected L10, one-on-one, other meeting, or all accessible workspaces |
| Meeting To-Dos / Issues | Active items for that meeting | Completed / Resolved history, search, date range | Exact current meeting only |
| Run Meeting | Active commitments and IDS issues | Completed / Resolved history, search, date range | Exact active L10 only |
| Meeting archive and reporting | Existing session reports plus canonical completed / resolved recall | Search and date range | Exact meeting only |

## Canonical history contract

The history query reads the same `pulse_work_items` record and joins the existing append-only tables:

- `pulse_work_item_status_notes` provides each status transition, including definition of done or issue resolution.
- `pulse_work_item_comments` provides the comment history.
- `pulse_work_item_attachments` provides documents.
- `pulse_work_item_moves` provides original and later meeting/personal routing, mover, reason, and time.
- `pulse_activity_log` provides creation, edit, attachment, move, assignment, completion, and reopening events.

The query is always permission-scoped through the item’s current canonical destination. It never grants access to a historical meeting merely because that meeting appears in the move history.

## Completion and reopening

When a To-Do is completed or an Issue is resolved, it receives `status = completed`, `completedAt`, `completedById`, a required status note, and immutable status/activity events. It immediately leaves active lists.

Reopen changes only the existing record’s workflow state, typically to `not_started`, clears its active completion timestamp, and appends a status note plus `reopened` activity event with the caller’s reason. It does not change `meetingId`, `ownerPersonId`, assignee, parent relationship, comments, documents, or move history. No new item is created.

## Historical labels

To-Dos are labelled **Completed** and Issues are labelled **Resolved** in the interface. The shared canonical status remains `completed` for both types, preserving the existing status model and server constraints.

## Reporting

Meeting session reports remain immutable snapshots. Their existing resolved-issue snapshot is retained. Canonical history recall is added alongside reports so later completion or reopening does not rewrite past session snapshots.
