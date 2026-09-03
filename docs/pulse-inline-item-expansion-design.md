# Pulse Inline Item Expansion Design

## Objective

Replace modal-only viewing and editing of Pulse To-Dos and Issues with an inline, expandable record view. Creation remains a focused form, while opening an existing item expands it in place without interrupting the meeting or My EOS context.

## Interaction model

A collapsed row remains concise and shows the item’s title, status, assignee, due date, priority, and meeting home. It also displays count badges for **comments**, **documents**, and **linked sub-To-Dos** when those records exist. Selecting the row’s expand control opens an inline detail region directly below the row; selecting it again collapses the region.

The expanded region is the one shared record experience for existing To-Dos and Issues. It shows rich-text details, blue-highlighted working links, document links with file metadata, comments, and linked sub-To-Dos. The item fields are edited in the same expanded region, with status changed from the item itself. Rocks retain their dedicated global Rock workflow.

## Data model and APIs

Existing comment records, attachment records, and `pulse_issue_resulting_todos` provide the required activity model. The item detail response will add linked resulting To-Dos. List responses will include inexpensive aggregate counts for comments, documents, and linked sub-To-Dos so collapsed rows can indicate available detail before expansion.

The shared item editor becomes a reusable field form rather than the only container. A new inline item panel owns fetching, expansion, and comments, and embeds the form fields without a dialog. This preserves one set of field behavior and one save contract across My EOS, the L10 dashboard, and Run Meeting.

## Rich details

The rich-text area keeps Tiptap controls, but toolbar buttons preserve selection on mouse-down before issuing commands. Explicit content styling restores disc and decimal markers under the application’s CSS reset. Saved anchors use a bright blue, underlined treatment with a subtle blue glow; expanded-item rendering preserves that treatment and opens links safely in a new tab.

## Acceptance criteria

An agent can expand an existing To-Do or Issue in My EOS, meeting tabs, and Run Meeting without opening a modal. The expanded panel visibly exposes saved rich links and documents. Bulleted and numbered lists render correctly both while editing and after saving. Collapsed rows show comments, documents, and linked sub-To-Do indicators only when counts are nonzero. Existing access, membership, destination, and item-audit behavior remain unchanged.
