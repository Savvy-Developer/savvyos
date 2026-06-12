# Non-Functional / Placeholder Fields Audit

## Fields Removed in v8.3
1. **Follow-up Date** on Assign Agent dialog — was stored but never triggered any task or reminder. Removed from ContactDetail, ContactsPage, and ISADashboard assign forms. Replaced with "ISA follow up date (creates a task - optional)" which actually creates a task.
2. **Voice Notes** feature — entire feature removed (router, page, nav items, quick action button).
3. **Referral Partners** — entire feature removed (page, nav item, payout type).

## Fields That Are Functional
- **ISA follow up date** — creates a task for the ISA
- **Onboarding task checkbox** — creates a task for the agent
- **Pipeline status** — stored on agent connection, displayed in badges
- **Lead Source** — stored on contact, displayed in detail
- **Communication notes** (type, body) — stored and displayed in Activity tab
- **Properties** (address, type, beds, baths, sqft) — stored and displayed
- **Transaction fields** (purchase price, GCI, commission rate, contract/closing dates) — all stored and displayed
- **Payout items** (payee, amount, percentage, notes) — stored and displayed
- **Task fields** (title, type, priority, due date, status, notes) — all functional

## Remaining Follow-up Date on Pipeline/AgentConnectionDetail
The `followUpDate` field still exists on PipelinePage and AgentConnectionDetail for display/editing. It is stored in the DB but does NOT trigger any automation. Consider either:
- Adding automation (create a task when follow-up date is set on pipeline)
- Removing it from those pages too

## Potential Scalability Concerns (Dropdowns)
1. **Agent dropdown** in Assign Agent dialog — loads all agents. Fine for <100 agents.
2. **Contact dropdown** in Transactions — already converted to search-based in v8.3.
3. **Property dropdown** in Contact Detail "Link Property" — loads all properties.
4. **User dropdown** in Groups "Add Member" — filtered to agents only.

## Fields That Store Data But Have Limited Display
- **Contact `notes`** field — stored but only visible when editing the contact.
- **Agent Connection `agentNotes`** — stored on creation but not prominently displayed after.
- **Transaction `notes`** — stored but only visible in edit mode.
