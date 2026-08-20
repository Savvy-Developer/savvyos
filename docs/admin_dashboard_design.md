# Admin Dashboard Command Center — Implementation Design

## Scope of the first reliable release

The Admin Dashboard will replace all-time vanity totals and recency lists with a company-wide command center that defaults to **month-to-date** production. A persistent filter bar will provide common date presets, custom dates, market, agent, ISA, lead source, buyer/seller, pipeline stage, and transaction status. The filter state will be held in the URL, so reports and drilldowns retain the user’s view and return cleanly.

A centralized `adminCommandCenter` analytics procedure will return the dashboard payload. It will not expose a raw cross-company data set to the browser. Instead, it will calculate metrics with one filter contract, one date-boundary implementation, and server-side Super Permission enforcement based on the effective `ctx.user` (which includes simulated users).

## Dashboard sections

| Section | Data shown | Primary action / drilldown |
|---|---|---|
| Executive performance snapshot | Selected-period closed volume, GCI, units; active under-contract value; next 30/60/90-day scheduled closing forecast; goal pace when configured; comparison delta; trend sparkline. | Transaction Reporting with date/status filters, or command-center goal settings. |
| Executive brief | Deterministic, prioritized insights based on verifiable wins, risks, data-quality exceptions, capacity coverage, and trend deltas. | Each insight has a route to the resolved work list or report. |
| Needs attention now | Under-contracts missing key fields, near-term closing data gaps, overdue transaction work, stale active client connections, overdue tasks, and incomplete new-lead records. | Direct record/task/transaction route. |
| Revenue and forecast | Closed production trend, prior-equivalent comparison, current under-contract value, scheduled closings, goal pace, and transparent scheduled-close forecast. | Transaction reporting and filtered transaction lists. |
| Lead-to-close operating funnel | Current agent-connection state by canonical configured pipeline status; counts and aging; contact-cohort outcomes where data permits. | Pipeline filtered by stage. |
| Lead source performance | Leads created, closed production, GCI per lead, close rate, and comparative trend with explicit separate lead/close date bases. | Reporting suite source filter. |
| Agent health | 30/60/90-day close production, active pipeline, current active-client load, stale-client count, goal pace, and capacity coverage. | Agent profile / filtered reports. |
| ISA and market coverage | Assigned-lead and appointment-set signals only when attribution is present; agent-market assignments, production by agent market, and capacity configuration coverage. | User, market, or reporting routes. |
| Transaction health and data quality | Under-contract risk indicators, closing calendar, failed/incomplete fields, data quality summary. | Transactions or filtered reporting. |

## Metric policy

The implementation never substitutes incomplete data with placeholders. The forecast is explicitly named **Scheduled close forecast** and is the sum/count of active under-contract transactions with a non-null `closingDate` in each 30/60/90-day window. It is not a prediction of uncontracted lead conversion.

The first release introduces **company command-center goals** for GCI, sales volume, and units. Goals are admin-configured for a calendar year; KPI cards show `Goal not configured` until each value is set. The existing `agent_goals` table remains the source for agent-level pace, and market profile annual GCI is used only when configured.

Potentially sensitive views are only included if their corresponding Super Permission is granted to the effective user. The server returns feature availability flags and nulls restricted data rather than sending it and hiding it only in React. The `canViewDashboard` permission is required for the command-center endpoint, while financial, transaction, contact, task, market, reporting, and user-specific sections require their existing associated permissions.

## Explicitly omitted or demoted in this release

Appointment-held rate, stage progression, speed to first contact, call attempts, true stage conversion, comprehensive ISA activity, loan/insurance performance, recruiting, and company fall-through by contract cohort are omitted because the audited source tables cannot support them reliably. The dashboard will surface the missing coverage as data-quality context rather than making unsupported claims.

## Alert rules and severity

| Rule | Severity | Estimated impact | Why it is safe |
|---|---|---|---|
| Under-contract record missing closing date, price, GCI, or owner | High | Sum of available purchase price / GCI when present | Direct field completeness check. |
| Closing within 7 days with missing financial/date data or overdue transaction task | High | Transaction value where available | Direct operational risk check, not failure prediction. |
| Overdue task | High / medium based on priority | Task urgency only; no fabricated dollar amount | Direct due-date check. |
| Active client connection with no qualifying activity for at least 14 days | Medium | Connection count, plus linked pipeline where available | Uses the established `agingUpdatedAt` operational clock. |
| New lead connection with no activity for at least 24 hours | Medium | Connection count | Current-state SLA exception; excludes terminal statuses. |
| Contact missing lead source or contact method | Low / medium | Record count | Direct completeness check. |

Alerts are reviewed/snoozed through a new lightweight dashboard review table keyed by viewer and deterministic alert key. The underlying risk is never deleted or hidden from another admin; only the current viewer’s acknowledgement is recorded.

## Engineering strategy

The dashboard will add `dashboard_settings` (company yearly goals and configurable thresholds) and `dashboard_alert_reviews` (per-user acknowledgement/snooze state), with appropriate indexes. The query layer will fetch only aggregate results and at most a capped prioritized exception list. It will use independent query groups with `Promise.all` so a non-critical widget can safely degrade without blocking the entire command center. The dashboard page will use section-level loading, empty, and error states.
