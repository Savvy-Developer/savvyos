# SavvyOS Admin Dashboard Data Audit

**Audited:** 2026-08-20 UTC. This internal inventory covers the live SavvyOS MySQL database, the current React/tRPC implementation, the existing analytics layer, permission model, and the incumbent Admin Dashboard.

## Reliable data available for the command center

| Domain | Primary tables / fields | Reliability decision | Date basis and attribution |
|---|---|---|---|
| Closed production | `transactions.status`, `closingDate`, `purchasePrice`, `grossCommissionIncome`, `agentId`, `primaryContactId`, `transactionType` | Reliable. All 434 closed records have closing date, volume, GCI, and owner. | Closed production uses `closingDate`; agent uses `transactions.agentId`; source uses the primary contact’s `leadSourceId`; market uses the transaction agent’s `users.marketProfileId`. |
| Active contracts and forward production | `transactions.status = under_contract`, `closingDate`, `contractDate`, value fields | Reliable for scheduled forecasts. One active contract lacks closing date; 3 lack GCI and 2 lack volume, which should surface as data-quality/risk alerts. | Forward forecast uses under-contract `closingDate` in the next 30, 60, or 90 days. |
| Transaction operations | `transactions`, related `tasks`, payout integrity flag | Reliable. Tasks can link directly to transactions; incomplete dates and financial fields are identifiable. | Current state, with due date / closing date used for urgency. |
| Contact cohorts | `contacts.createdAt`, `archived_at`, `doNotContact`, `leadSourceId`, `assignedIsaId` | Reliable for new-lead counts and data-quality exceptions. ISA assignment is sparse, so ISA-attributed views must be labelled and limited to assigned records. | New leads use `contacts.createdAt`, exclude archived and do-not-contact records. |
| Agent pipeline | `agent_connections.pipelineStatus`, `agingUpdatedAt`, `appointmentSet`, `agentId`, `contactId` | Reliable for current-state pipeline, appointment-set flag, and aging. There is no canonical stage-history table, so stage entry, stage-to-stage progression, response-time, and true historical conversion cannot be asserted. | Current-state connection status; aging uses `agingUpdatedAt`, falling back to `updatedAt`. |
| Tasks | `tasks.status`, `dueDate`, `priority`, linked contact/transaction/connection IDs | Reliable for overdue work and transaction-linked exceptions. | Current overdue state uses incomplete task status and `dueDate < now`. |
| Users, markets, goals | `users`, `market_profiles`, `market_agent_assignments`, `agent_goals` | User-level market and annual agent goals are available. Market capacity assignments and agent-goal coverage are incomplete, so capacity and company goal must show coverage/limitations. | Market follows the assigned agent’s primary `users.marketProfileId`; agent goals use `agent_goals` annual rows. |
| Lead sources | `lead_sources`, `contacts.leadSourceId`, transaction primary contact | Reliable for source attribution of lead cohorts and closed production, subject to lead-cycle timing. | Leads use contact creation date; closed value uses transaction closing date; each measure is labelled with its own date field. |
| Super Permissions / simulation | `admin_permissions`, `canAdminUsePermission`, simulated `ctx.user` | Reliable. Existing simulation changes the contextual user, enabling exact permission enforcement for a simulated admin. | Every command-center endpoint must check the effective contextual user and withhold restricted sections server-side. |

## Availability and reliability constraints

| Requested capability | Audit outcome | Dashboard behavior |
|---|---|---|
| Appointment held / disposition | No appointment table or canonical held/disposition field exists. | Omit the metric and surface only the reliable `appointmentSet` signal. |
| Stage histories, stage-entry counts, true stage conversion, median stage time | No stage-history table exists. | Use a current-state pipeline aging distribution and a clearly labelled lead-cohort outcome funnel; do not claim stage progression history. |
| Contact attempts, successful-contact speed, activity SLA | Activity and call modules exist but do not provide a complete canonical contact-attempt chain across all contacts. | Do not calculate response-time or contact-rate claims. Use deterministic new-lead unworked exceptions only where a reliable current-state rule exists. |
| Company goals | No company-wide annual goal table exists. Existing agent goals cover 22 of 58 active agents; market profiles only store annual GCI. | Add an explicit admin-configured command-center goals record. Until configured, show “Goal not configured” and link to dashboard goal settings. |
| Market capacity | `market_agent_assignments` contains only 2 configured assignments, while 54 active agents have a primary market. | Show capacity only for markets with a configured capacity record; otherwise report that capacity coverage is incomplete. |
| Loan, insurance, recruiting, or other ecosystem revenue | No reliable operational data model was identified for the requested end-to-end referral funnels. | Omit from the first command-center release rather than display placeholders. |
| Company fall-through rate by contract date | Most closed and terminated records lack `contractDate`. | Use all recorded terminal transaction statuses only as a transparent historical scenario rate; do not present a dated contract-cohort fall-through rate. |

## Live-data completeness snapshot

The live database contains 52,676 contacts, 3,627 agent connections, 654 transactions, 879 tasks, 109 users, 58 active agents, 5 active ISAs, 71 active lead sources, and 55 market profiles. Closed transactions are complete for the core closing, GCI, volume, and owner fields. Contact ISA attribution and ISA status are incomplete for most contacts, which materially limits ISA and contact-stage reporting. The dashboard will expose these as data-quality coverage issues rather than treating missing values as operational outcomes.

## Leading versus lagging signals used

Leading operational signals are new-lead SLA exceptions, current pipeline aging, appointment-set flags, overdue tasks, incomplete under-contract records, approaching closings, and lead-source cohort volume. Lagging outcomes are closed units, closed volume, closed GCI, transaction fall-through, and transaction cycle time where both contract and closing date are present. The dashboard labels forecast and operational-risk signals as estimates or operational risks; it does not make causal or failure predictions.

## Existing implementation assessment

The incumbent `client/src/pages/admin/AdminDashboard.tsx` displays all-time totals, recent records, raw pipeline counts, and generic rankings. Existing analytics endpoints include executive, funnel, source, pipeline-health, market, ISA, reporting-suite, and insights capabilities, but they are fragmented and have inconsistent filter/permission handling. The replacement should use a single command-center metrics endpoint and a central date/filter model, while retaining detailed report routes for navigation.
