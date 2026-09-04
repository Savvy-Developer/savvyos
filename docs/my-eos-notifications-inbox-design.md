# My EOS Streamlining and Pulse Notifications Inbox

## Objective

My EOS prioritizes current Pulse work, then provides a compact, context-aware notifications inbox rather than a broad urgency dashboard. The inbox is a view over canonical Pulse notification records and work-item events; it does not create a second work-item history or alter meeting membership.

## Layout changes

| Surface | Change |
|---|---|
| Header | Remove the redundant `Add work to an L10` shortcut; work creation remains within My Work. |
| My Work | Keep as the primary section and retain its contextual creator. |
| Completed & Resolved | Keep canonical history, but reduce header, filter, and row padding. |
| Activity | Show a compact recent summary (six entries) with an explicit `View all activity` disclosure rather than rendering the full feed by default. |
| What needs me now | Remove this section and replace it with `Notifications inbox`. |

## Inbox notification classes

| Class | Trigger | Recipient | Context and action |
|---|---|---|---|
| Mention | A person is mentioned in a Pulse item comment. | Mentioned person. | Opens the canonical item in its original Pulse forum. |
| Comment | Someone comments on a Pulse To-Do or Issue the recipient owns or is assigned. | Accountable owner and assignee, except the commenter. | Opens the comment in item context. |
| Completion / resolution | A Pulse To-Do or Issue owned or assigned to the recipient is marked Completed by another person. | Accountable owner and assignee, except the completing person. | Opens the completed canonical item and its definition-of-done or solve note. |
| Blocker | A person marks a Pulse To-Do or Issue Blocked and identifies another Pulse-eligible person as the blocker. | Identified blocker. | Opens the blocked item and the required status-update note. |
| Existing delivery | Existing assignments, cascades, proposed issues, reminders, and overdue notices. | Existing recipient logic. | Retains the canonical notification action. |

## Data and access rules

`pulse_notifications` remains the primary persistent inbox record. New notification categories are stored as notification types with a canonical `sourceType`, `sourceId`, meeting context, and recipient. Entries appear only if the recipient retains access to the original meeting or permitted personal-work context. Clearing a notification affects only the recipient's inbox; it does not alter the underlying item, comment, meeting membership, or activity history.

A new optional `blockerPersonId` on the canonical Pulse work-item record captures who needs to unblock a work item. The status update dialog requires a blocker selection when transitioning to `Blocked`, restricted to eligible people in that item's destination. Changing status back from Blocked clears no history and appends the status event. Existing blocked items remain valid without a designated blocker.

## Event integrity

Notifications are created only after the owning transaction successfully persists the source item or comment. Work-item activity and status-note history remain append-only. The inbox is not a substitute for activity: an inbox entry contains the event summary and opens the full canonical context, where the underlying record, comment, status note, and audit trail are visible.

## Compact interaction

The inbox shows unread/current entries in reverse chronological order with a clear source label, event icon, relative context, timestamp, and explicit `Open` and `Clear` controls. Items may be read without forced dismissal. The default surface is intentionally limited; a `Show more` disclosure exposes additional entries without inflating the dashboard.

## Delivery criteria

1. My Work stays first; the global header no longer carries a duplicate work-creation button.
2. The obsolete `What needs me now` section is removed.
3. Activity and canonical completion history are dense by default and reveal detail on demand.
4. Mentions, comments, owner/assignee completions, and named blockers create permission-scoped inbox entries after successful source saves.
5. Inbox actions open the same canonical item in its original context and clearing only affects the recipient's notification state.
6. Existing notification classes remain available and no save changes meeting access or membership.
