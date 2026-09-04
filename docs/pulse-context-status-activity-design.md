# Pulse Context, Status, and Activity Design

## Read-only expansion and explicit editing

Selecting a collapsed Pulse To-Do or Issue opens a compact **context view**, not an editor. It presents the full rendered detail, saved links, documents, sub-To-Dos, comments, key ownership and schedule information, and the activity timeline. The context header contains an explicit pencil **Edit item** control. Only that control opens the common item editor.

## Parent and sub-To-Dos

Every eligible Pulse parent row has a visible **Add sub-To-Do** action, adjacent to its hierarchy-count icon. The action is not hidden in expanded details. Child creation always preselects the parent’s destination and passes the parent ID to the shared save contract. A child To-Do stays in the same destination as its parent, cannot be nested further, and is rendered under the parent rather than in the top-level list.

## Saved links

A successful save normalizes every valid URL in the rich details into a visible **Links** section appended at the bottom of the rendered details/context. Links use the saved blue treatment and remain functional. The original rich text remains authoritative; the bottom section is an extracted presentation of the stored links.

## Status updates

Pulse To-Dos and Issues use one shared workflow status vocabulary: **Not Started** (default), **In Progress**, **Blocked**, and **Completed**. Status is changed from an inline control in context. Changing status opens a required status-update dialog. The dialog captures a narrative update. When setting Completed, the prompt specifically asks what completed looks like. Status and narrative are written together to the status-note and activity records.

## Activity timeline

Every expanded context includes a reverse-chronological Activity timeline. It has normalized, readable entries for creation; regular edits; assignments; due date, priority, and details changes; attachments; comments; status changes and status-update narrative; moves with origin, destination, mover, and timestamp; and sub-To-Do creation. The existing immutable activity log, status-note records, move records, comments, and attachment records remain the authoritative audit sources.
