# Pulse L10 and 1:1 Runner Foundation

## Terminology and lifecycle

Pulse uses three distinct records. A **meeting registry entry** is durable configuration tied to one active `l10` or `one_on_one` Scope. It has an immutable ID, an editable display name, schedule, timezone, expected duration, configurable step visibility, and an explicit `isActive` state. Deactivation is a reversible configuration state transition named **deactivate meeting**.

A **session** is a single execution record created from an active registry entry. It stores its own agenda state, timing, attendee snapshots, votes, ratings, session-local presentation entries, and completion data. It does not own work items, current assignment, current Scope, or present-day access. Its lifecycle is **in progress**, **complete session**, or automated closure classifications.

A **report** is one immutable serialized snapshot created only at completion. It records the registry and session configuration at conclusion, time boundaries, duration/classification, step/rating/vote summaries, IDS issue count, session capture events, and selected session snapshots. It is exposed through **view history**; it is not called an archive and cannot become a current operational source.

## Runner grammar

The L10 grammar uses the nine ordered, hideable steps from the functional specification: Segue, Cascaded to Us, Headlines, Scorecard, Rock Review, To-Do List, IDS, Conclude, and Closing Snapshot. The 1:1 grammar uses the same record and runner contracts but omits **Scorecard** and **Cascaded to Us** by default. Any step may be disabled in the registry entry without deleting its historical session snapshot.

## Scope and policy boundaries

Registry and session reads begin with the central, archive-first `canView(scope, actor)` decision. Management calls use `canManageMeeting(scope, actor)` and support only `l10` and `one_on_one` Scope types. The policy layer does not accept a session ID and does not make present-day access decisions from session participation, provenance, or report contents.

The runner may create a canonical Todo or Issue through the existing work-item service. The work item receives `createdInSessionId` as historical provenance and may target any active Scope the actor may manage. It is not moved merely because the current session Scope differs. The session records a `session_capture` event pointing to the destination, and the UI shows a destination confirmation.

## Session classification

Duration is calculated exclusively from `startedAt` and `endedAt`. Completed sessions are `valid` if they meet a configurable minimum duration, otherwise `too_short`; administrative/scheduled closure is `auto_closed`; expired unfinished execution is `stuck`; and a live session is `in_progress`. IDS issue count is snapshotted exactly when the runner enters IDS.

## Acceptance slice

The regression slice must prove one active L10 registry can create a session, enter IDS and snapshot its issue count, cast an allowed issue vote, create a Todo in another Scope while retaining L10 session provenance, record the destination capture, complete cleanly, and generate a report whose payload cannot be updated or deleted.
