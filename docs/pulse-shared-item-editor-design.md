# Pulse V2 shared To-Do and Issue editor

## Purpose

Pulse will use one shared editor for every To-Do and Issue creation or editing context. A context may supply a default destination and source session, but it must not change the available fields, validation, ownership rules, or saved record behavior.

| Field | To-Do | Issue | Persistence |
|---|---|---|---|
| Title | Required | Required | `pulse_work_items.title` |
| Rich details | Optional | Optional | Sanitized HTML in `pulse_work_items.description` |
| Assignee | Required, defaults to creator | Required, defaults to creator | `assigneeId` |
| Due date | Required, defaults to seven days ahead | Required, defaults to seven days ahead | `dueDate` |
| Priority | Required, default **Medium** | Required, default **Medium** | new `priorityLevel` |
| Status | Open, Done, Dropped | Open, Discussing, Solved, Dropped | existing `status` |
| Destination | Required: an accessible meeting or the creator’s personal work | Same | existing `meetingId` / `ownerPersonId` |
| Timeframe | Not applicable | Required: short-term or long-term | new `issueTimeframe` |
| Documents | Optional, many | Optional, many | new attachment table |

## Destination and access rules

The editor shows **Personal work** plus meetings that the person can access. Context (an L10 tab, overview action, or active meeting session) preselects the originating meeting. A destination change is deliberate: it is routed through the existing move-and-audit mechanism for an existing record, and stores the requested destination directly for a new record.

The assignee selector groups active people **with access to the selected destination** first, ordered alphabetically. Other active SavvyOS users remain visible but disabled with an explanation that selecting them would require a separate membership change; saving an item never modifies membership or access.

## Rich text and attachments

The details control is a focused Tiptap editor that supports bold, italics, bullet lists, numbered lists, paragraph breaks, and HTTPS hyperlinks. Content is sanitized on the server and stored as rich HTML. Attachments upload through the existing SavvyOS document storage route to S3, then an attachment record stores only file metadata and the public storage reference. The server checks item visibility before associating a completed upload with an item.

## Integration

The same component is used by the L10 To-Dos tab, Issues tab, Overview actions, full-screen Run Meeting, and My EOS. It receives only context defaults—`destinationId`, an optional `sourceSessionId`, and an optional existing work item ID. It invokes the same Pulse work-item procedures in every context and invalidates relevant views after save.
