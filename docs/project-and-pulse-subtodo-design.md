# Project To-Do and Pulse Sub-To-Do Design

## Scope boundary

This change applies only to **To-Dos inside the Projects section** and to **Pulse To-Dos and Issues**. It does not modify, rename, migrate, or change behavior in any separate SavvyOS feature named **Tasks**. The existing `pmTasks` persistence layer is used only as the internal data source for the already-scoped Project To-Do experience.

## Parent/sub-To-Do model

Project To-Dos retain their existing two-level `parentTaskId` hierarchy. Their current creation form continues to create a child below the selected Project To-Do, but parent rows receive a shared, count-based hierarchy indicator and a visible **Add sub-To-Do** action.

Pulse gains a two-level self-reference: `parentWorkItemId`. A Pulse parent may be a To-Do or Issue; a child is always a To-Do and must stay in the exact same L10 or Personal-work destination as its parent. A child cannot become a parent. This retains the bounded-workspace model and ensures hierarchy never changes membership, access, or destination scope. Existing Issue-to-To-Do follow-ups are backfilled into this direct relationship, while their historical resolution link is retained.

## Common interaction system

A shared visual hierarchy component is used in Project To-Dos and Pulse. A parent shows a compact branch/checklist icon plus its live child count in collapsed state. The adjacent **Add sub-To-Do** action creates a child with the parent, destination, assignee, due date, and priority preselected. The new sub-To-Do can then be adjusted before saving. Children are visibly indented under the expanded parent.

## Compact Pulse layout

Pulse creation forms, collapsed rows, and expanded item panels use smaller vertical rhythm, control heights, and section padding. Collapsed items present a concise title, one meta line, and only meaningful indicators. Description excerpts move into the expanded panel, letting agents scan substantially more To-Dos and Issues at one time. The expanded panel keeps all full fields, documents, links, comments, and child To-Dos but uses tighter spacing.

## Acceptance criteria

Agents can create a sub-To-Do from a clearly labeled action on a Pulse To-Do or Issue, and from a Project To-Do. Parent rows show a sub-To-Do icon and current count when children exist. A Pulse sub-To-Do is stored in and displayed under the same destination as its parent. Project hierarchy continues to use Project To-Dos only. Pulse and Project UI show the same hierarchy cues, while all unrelated SavvyOS Tasks remain unchanged.
