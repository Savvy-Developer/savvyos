# SavvyOS Reporting Suite — Replacement Specification

## Purpose

The existing analytics surfaces are being replaced by a reporting suite designed for management decisions, coaching conversations, operational follow-up, and transaction quality control. The suite begins with three administrator-facing reports: **Agent Performance**, **Group Leader Review**, and **Transaction Statistics**. Each report must own a precise metric grain, filtering model, chart layer, and operational evidence path.

## Shared reporting conventions

| Concept | Contract |
|---|---|
| Date scope | Transaction production metrics use `closingDate`; operational flags use current live status and are displayed independently from closed-period production. |
| Gross commission | Sum of `transactions.grossCommissionIncome` within the selected transaction scope. |
| Savvy net | Sum of `transaction_payout_items.amount` where `payeeType = savvy_str_agents`, within the selected transaction scope. |
| Units | Count of transactions in the selected scope. |
| Volume | Sum of `transactions.purchasePrice` in the selected scope. |
| Expected-close flags | Open (`under_contract`) transactions with a closing date before today are overdue; open transactions with no closing date are missing an expected close date. |
| Commission flags | Transactions with `payoutIntegrityFlag = true`. |
| Overdue tasks | Tasks whose status is not `completed` or `cancelled`, whose due date is before today, and that are assigned to the selected person or group scope. |
| Evidence | Every flag or ranking must link to the filtered Transactions or Tasks view, preserving the report scope in URL parameters. |

## Report 1 — Agent Performance

The report answers: **Which agents are producing, what is changing, and where does operational follow-up need to happen?** It includes a global or selected-agent date scope, agent and group-leader filters, status-sensitive operational flags, and a ranked agent table.

| Section | Measures and interaction |
|---|---|
| Performance pulse | Closings, closed volume, gross commission, Savvy net, average GCI per closing, and month-over-month direction. |
| Operational attention | Overdue tasks, commission flags, past expected close dates, and missing expected close dates; each tile opens the matching evidence list. |
| Momentum | Monthly closings and volume trend, plus a gross-commission versus Savvy-net trend. |
| Agent comparison | Closings, volume, gross commission, Savvy net, average commission, under-contract units, overdue tasks, and flags by agent. |
| Action queue | High-priority flagged transactions and overdue tasks, capped and sorted by urgency to keep the page responsive. |

## Report 2 — Group Leader Review

The report answers: **What should a group leader discuss with each agent this week?** It is filtered by a group-leader dropdown and summarizes the selected leader's group. It intentionally foregrounds coaching cues instead of only aggregate production.

| Section | Measures and interaction |
|---|---|
| Group snapshot | Team closings, volume, gross commission, Savvy net, active under-contract units, and current operational flags. |
| Coaching queue | Agents with overdue tasks, stalled expected close dates, missing close dates, commission flags, or no closed production in the selected period. |
| Team momentum | Monthly group volume and closings; trend movement compared with the prior equivalent period. |
| Agent scorecard | Per-agent production, pipeline, follow-up debt, active close-date hygiene, and financial quality indicators. |
| Conversation prompts | Deterministic, evidence-linked prompts describing the most actionable management topic for each at-risk agent. |

## Report 3 — Transaction Statistics

The report answers: **What is being produced, how is it converting, and where are financial or process risks accumulating?** It uses filters for date range, agent, group leader, transaction type (buyer/seller/dual), and status (all/closed/under contract/terminated).

| Section | Measures and interaction |
|---|---|
| Transaction performance | Units, volume, gross commission, Savvy net, average GCI, average purchase price, and average days from contract to close. |
| Health and outcomes | Termination rate, under-contract count, commission flags, past expected close dates, and missing expected close dates. |
| Mix | Buyer, seller, and dual transaction distribution with volume and commission contribution. |
| Monthly trends | Monthly units, volume, gross commission, and Savvy net with comparable-period direction. |
| Transaction evidence | Filtered, paginated transaction rows with type, status, agent, dates, volume, GCI, Savvy net, and explicit flags. |

## Implementation architecture

A new `server/analytics/reportingSuite.ts` service will aggregate the reporting data under server-side access control. A `analytics.reportingFilters`, `analytics.agentReport`, `analytics.groupLeaderReport`, and `analytics.transactionStatisticsReport` procedure set will provide typed contracts. The client will use one `ReportsPage` shell with report tabs/routes, shared URL-backed filters, responsive Recharts visualizations, summary KPI cards, and evidence links. Legacy analytics routes will redirect to the new report suite rather than remain primary navigation.

## Data audit findings — 2026-07-28

Production data supports all requested core indicators. At audit time, the application contained 360 closed transactions, 116 under-contract transactions, 105 terminated transactions, 29 commission-integrity flags, one open transaction past its expected close date, zero open transactions without an expected close date, 88 overdue tasks, and seven configured groups with group leaders. Payout data contains separate agent, Savvy, group-leader, and referral-partner payee types, allowing Savvy net to be calculated from the Savvy payout item rather than inferred from a split.
