# Pulse Measurable and Strategy Foundation

## Canonical measurable contract

A measurable is one durable definition with a single owner, definition, unit, cadence, aggregation direction, target/warning/critical thresholds, active state, and alert settings. It has no routing string or single meeting field. `pulse_measurable_placements` places the same measurable in any number of active Pulse Scopes, and every scorecard query first applies `canView(scope, actor)` to its requested Scope.

`pulse_measurable_entries` provides exactly one value cell per measurable and calendar period. Its uniqueness key is `(measurableId, periodKey)`. Upserts are intentional last-write-wins updates: `submittedByPersonId`, `submittedAt`, and notes describe the latest submitter independently from the measurable owner. Owner changes apply only to the measurable definition and never alter historical entry submitter fields.

## Calendar and scorecard contract

The existing `resolvePulseCalendar` service remains the sole owner of local date, operating week, fiscal year, holiday, due-window, and reporting-period answers. The measurable service calls it to derive a period key and boundary object. Dashboard, Scope scorecard, analytics, and report endpoints return the exact same `period` object from this service; none calculate a week or fiscal boundary themselves.

Alert state is derived centrally from the entry, measurable thresholds, and direction. It is not stored as a separately editable KPI health copy. Alert records retain the evaluated period and observed value only when a derived state leaves normal.

## Strategy hierarchy and VTO view

One `pulse_strategy_nodes` hierarchy stores `vision`, `annual_goal`, `quarterly_rock`, and `milestone` nodes. VTO is a filtered planning projection of these same nodes, not a second VTO tree. A node’s base status is global. `pulse_strategy_scope_placements` controls Scope visibility and optional presentation-specific status; it never writes or replaces the underlying strategy-node status.

RACI assignments are normalized in `pulse_strategy_raci`. The service requires exactly one Accountable at node creation/update, and exactly one Responsible is used as the displayed owner. Any node without Responsible is explicitly grouped under **Unassigned**; no work disappears from rock list views. Query filters are applied to canonical nodes before owner grouping.

## Acceptance slice

A rollback-only integration test must create one placed measurable with one calendar-derived period entry and prove the same period object is returned from scorecard, dashboard, analytics, and report contracts. It must then create Vision → Annual goal → Quarterly Rock → Milestone with required RACI, change a per-Scope rock presentation status without changing the underlying rock, and prove filtered rock grouping returns both a Responsible-owner group and an Unassigned group.
