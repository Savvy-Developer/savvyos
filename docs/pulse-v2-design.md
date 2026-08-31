# Pulse V2 implementation design

## Domain model

An **L10** is the recurring workspace (`pulse_meetings`). It owns scheduling, membership, configuration, the facilitator label, section preferences, linked scorecard metrics, and per-meeting Rock visibility. A **session** (`pulse_meeting_sessions`) is a dated occurrence of one L10. It owns runner state, attendance, elapsed time, agenda progress, ratings, and a durable closing report (`pulse_session_reports`).

| Concern | Authority and persistence |
|---|---|
| Meeting access | Active `pulse_meeting_members` membership is the sole data-visibility boundary for one L10. |
| Pulse actions | A row in `pulse_permissions` supplies the required Pulse capability; SavvyOS user roles are never checked for Pulse authority. |
| Facilitator | `pulse_meetings.facilitatorId` is a separate meeting-level label used for agenda and health reporting. It is not an OS role and does not by itself create access. |
| Bounded work | Meeting-created work remains on `pulse_work_items.meetingId`. Deliberate rerouting continues to write `pulse_work_item_moves` and an activity record. |
| Session provenance | Items and updates created during a runner receive `sourceSessionId`; an issue solved during a runner receives `resolvedInSessionId`. |
| Reporting | Closing creates a report snapshot of scorecard, Rocks, commitments, resolved issues, rating, attendance, and published cascading messages. |

## Pulse permission matrix

The matrix will contain Pulse-only capabilities. A person must have the matrix capability to view and administer the matrix; that holder can grant or revoke every other capability. A bootstrap migration explicitly grants this permission to the existing project owner rather than relying on the owner’s SavvyOS role.

| Capability | Allows |
|---|---|
| `manage_permission_matrix` | View the matrix and grant or revoke every other Pulse capability. |
| `manage_l10s` | Create L10s, configure the L10s the person belongs to, manage membership, map scorecard metrics and Rocks, and archive/reactivate L10s. |
| `run_l10s` | Start, pause, advance, and close sessions for L10s the person belongs to. |
| `view_all_l10_health` | Review aggregate rhythm health without granting item-level visibility outside a member’s meetings. |

## L10 configuration

For a Level 10 meeting, the editable sections are **Overview, Segue, Headlines, Scorecard, Rocks, To-Dos, Issues, and Archive**. A disabled section is excluded from the workspace navigation, the overview content, and runner payloads. The close step remains a required runner action, not a configurable dashboard tab.

The configuration form stores name, meeting day/time and time zone, facilitator, duration, participants, scorecard history window, metric-entry deadline, section visibility, and active/archived state. Archive preserves all data and blocks normal use; reactivation restores the same meeting and history.

## Session lifecycle

A facilitator is a label; executing a meeting uses `run_l10s` plus membership. Starting the runner creates or resumes one active session. Its hard-coded EOS agenda respects disabled review sections while preserving the close step:

1. Segue
2. Scorecard
3. Rock Review
4. Headlines
5. To-Do Recap
6. IDS
7. Conclude

The runner persists its active step, timer, attendance, records created, individual meeting ratings, issue resolutions, commitments, and cascade drafts. Closing generates the durable report and publishes only the cascade messages prepared within that session.

## Dashboard composition

The workspace headline answers the four requested questions at a glance: meeting identity/schedule, attention requiring action, prior session outcomes/commitments, and eight-session rhythm health. The tabs provide direct work between meetings while retaining a focused full-screen runner for the live session.
