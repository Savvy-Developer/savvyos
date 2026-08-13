# Pulse Team Scope and Dashboard Foundation

## Team as a Scope

A Team remains `scope_type = team` and uses ordinary explicit Scope membership. It gains `pulse_team_scope_links` only for named, directional relationships to L10 Scopes:

| Relationship | Meaning | Does not imply |
|---|---|---|
| `reports_to` | Organizational / reporting relationship to an L10 | Cascade recipients or work inclusion |
| `receives_cascades_from` | Permits that L10 to explicitly target the Team for cascades | Work visibility or issue inclusion |
| `work_rollup_from` | Allows Team To-Dos to include qualifying L10 meeting-origin work | Cascade audience, team membership, or issue inclusion |

No relationship causes implicit membership, access, or audience expansion. Every panel begins with `canView(teamScope, actor)` and every linked L10 source is separately archive-checked through the Scope policy.

## Independent content policies

`teamTodos` is the union of two independently named predicates: `direct_team_todos` (Todo primary Scope is the Team) and `linked_meeting_origin_todos` (Todo is created from a session whose active L10 Scope is connected by `work_rollup_from`). The second condition is source provenance, not a move, placement, or membership grant.

`teamIssues` is one distinct predicate: `direct_team_issues` (Issue primary Scope is the Team). It does not inspect a Team-to-L10 relationship, session provenance, or cascade relationship. This prevents the common defect of making Issue visibility piggyback on To-Do linkage.

## One scoped dashboard projection

`getTeamDashboard` is the only server-side Team read contract. Overview, To-Dos, Rocks, Workload, Productivity, and Issues tabs render slices of that single projection. Thus every count and row in Overview is drawn from data that is discoverable in its dedicated tab.

Workload uses the canonical calendar service for operating-week windows and provides a per-person urgency stack plus a person-by-week assigned/completed heatmap. It is labeled as capacity data, not performance evaluation. Productivity describes the Team: completed count, net flow, overdue, median completion time, carryover, aging, and capture quality. Skipped recurring items are excluded before all workload/productivity calculations.

## Acceptance slice

A rollback-only test creates a Team, linked L10, direct Team Todo/Issue, L10-session-origin Todo/Issue, and `work_rollup_from` relationship. It proves To-Dos include direct + linked L10-origin Todo while Issues remain direct-only, validates relationship types do not expand Scope access, checks all dashboard panels derive from one projection, and verifies skipped recurring items never enter workload or productivity metrics.
