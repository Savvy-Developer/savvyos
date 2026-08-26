export type TrainingGuideSeed = {
  title: string;
  visibleToRoles: string;
  sortOrder: number;
  content: string;
};

export const TRAINING_GUIDES_CATEGORY = {
  name: "SavvyOS Training Guides",
  type: "training" as const,
  description: "Role-specific walkthroughs for using every section of SavvyOS.",
  visibleToRoles: "admin,agent,isa,agent_support",
  sortOrder: -100,
};

export const SAVVYOS_TRAINING_GUIDES: TrainingGuideSeed[] = [
  {
    title: "SavvyOS Training Guide: Agents",
    visibleToRoles: "admin,agent",
    sortOrder: 10,
    content: `# SavvyOS Training Guide for Agents

## Your operating rhythm

SavvyOS is your home for prospecting, deals, operations, requests, and performance visibility. Begin each workday in **My Dashboard**, move directly to any overdue work in **Tasks**, and keep your active opportunities current in **My Pipeline**. The system is most useful when status, next action, and ownership are kept accurate on the same day that activity occurs.

> **Use the sidebar as your operating map.** Your view is intentionally limited to the work and information that belong to you. If an area is unavailable, it is either outside your role or has not been enabled for your account.

## Start here

| Step | What to do | Why it matters |
|---|---|---|
| 1 | Open **My Dashboard** and review priorities, production, and reminders. | It gives you a single starting point for the day. |
| 2 | Open **Tasks** and complete, reschedule, or clarify every due item. | Tasks are the system of record for assigned follow-up. |
| 3 | Review **My Pipeline** and **Hot Leads**. | Current stages and next actions keep your lead work visible and actionable. |
| 4 | Use **Pulse** to stay aligned to goals, priorities, meetings, and attention items. | Pulse is your operating cadence alongside your deal work. |
| 5 | Update your **Profile** from the account menu whenever your photo or details change. | Accurate identity information helps the organization work with you. |

## Overview

| Section | Use it for | Core workflow |
|---|---|---|
| **My Dashboard** | Your daily overview. | Review the summary first; then open the item that requires action rather than treating the dashboard as a static report. |
| **Daily Report** | Your agent-facing daily operating digest. | Read the report, use its links to act on priorities, and return to it when you need a concise view of what changed. |
| **My Stats** | Your personal performance view. | Use the selected date range to understand activity and production trends; use the trend to choose the next best action, not merely to review a score. |
| **Agent Leaderboard** | Team recognition and comparative performance visibility. | Check the leaderboard for context and celebrate progress; do not use it as a substitute for keeping your own activity current. |

## My CRM

| Section | Use it for | Core workflow |
|---|---|---|
| **My Pipeline** | Managing the opportunities connected to you. | Open an opportunity, verify its stage, record the next action, and move it only when the underlying buyer or seller progress supports the change. |
| **Hot Leads** | Prioritizing opportunities that need prompt attention. | Work the highest-priority records first, capture the result of outreach, and schedule a clear next action before leaving the record. |
| **Request Connection** | Requesting a connection to a lead or contact. | Submit only the information needed for the request, explain the business reason when prompted, and monitor the request outcome before treating the relationship as yours to work. |

## My Deals

| Section | Use it for | Core workflow |
|---|---|---|
| **Transactions** | Recording and following your active and closed transactions. | Create or update the transaction as the deal advances, confirm key dates and financial details, and keep the record aligned with the signed deal. |
| **Listings** | Tracking listing-side inventory and milestones. | Add or update listing details, review expiry and status information, and complete follow-up before an expiration becomes urgent. |
| **Properties** | Maintaining property-level information and analysis. | Open the property from a deal or listing, keep core facts accurate, and use the available property analysis or pro forma workflow where applicable. |
| **My Commission** | Reviewing commission and payout information for your deals. | Verify the deal inputs before escalating a discrepancy. Commission calculations use the transaction record, and the system enforces the company's minimum share requirement. |
| **Team Dashboard** *(group leaders only)* | Seeing your team's activity and production. | Use it to coach from current data and direct teammates back to the relevant record for changes. |
| **Group Leader Commissions** *(group leaders only)* | Reviewing group-leader commission information. | Confirm the source transaction and commission configuration before requesting a correction. |

> **Commission safeguard:** Do not change deal economics to force a payout result. Keep purchase price, commission rate, and payout data accurate. SavvyOS calculates GCI from purchase price multiplied by commission rate, supports an authorized manual override, and flags payout totals above 100%.

## Operations

| Section | Use it for | Core workflow |
|---|---|---|
| **Tasks** | Your assigned follow-up and operating commitments. | Complete the task when the work is done; otherwise update its due date, owner, or details so the next person has a clear handoff. |
| **Org Chart** | Understanding reporting and team relationships. | Use it to find the right leader, partner, or functional owner before escalating an issue. |
| **Agent Directory** | Finding colleagues and agent information. | Search for the appropriate person and use the profile details to coordinate professionally. |
| **On/Offboarding** *(when assigned)* | Completing your own onboarding or offboarding work. | Work through each assigned item in order, provide required information accurately, and raise blockers through the designated request channel. |

## Pulse

**Pulse** is your operating system for focus and accountability. Use it to review your work, inputs, meetings, and notifications; capture meaningful progress rather than trying to duplicate every CRM detail. When a Pulse item points to a deal, task, or request, complete the source record so the operational history stays accurate.

| Pulse area | Practice |
|---|---|
| **Mission / Work** | Review current priorities and work items; make ownership and next actions explicit. |
| **Inputs** | Record or review the inputs that support consistent execution. |
| **Meetings** | Prepare from current data, use the meeting workspace as directed, and close the loop on assigned follow-ups. |
| **Notifications** | Adjust preferences responsibly so important operating signals are not missed. |

## Requests and resources

| Section | Use it for | Core workflow |
|---|---|---|
| **Marketing Requests** | Requesting marketing support or assets. | State the audience, goal, required date, source materials, and approval context. Review the request status rather than sending duplicate requests. |
| **Tech Requests** | Reporting a system, access, or tooling need. | Describe the issue, impact, steps to reproduce, and any deadline. Add screenshots or examples only when they help the team diagnose the request. |
| **Knowledge Base** | Finding published SOPs, training, and reference material. | Start with **SavvyOS Training Guides**, then search for the specific process you are completing. Follow the latest published article rather than relying on an older saved copy. |
| **Savvy-Agents.com** | Opening the linked Savvy Agents resource in a separate tab. | Treat it as an external resource; return to SavvyOS to record deal and task activity. |

## Recommended day-to-day flows

### When a lead needs to be worked

Open **Hot Leads** or **My Pipeline**, review the last activity, take the next best action, record the outcome, and set the next action. If you need ownership or access to a lead, use **Request Connection** before working the relationship as your own.

### When a deal advances

Update the relevant pipeline opportunity, then keep the corresponding **Transaction**, **Listing**, or **Property** record current. Review **My Commission** once transaction details are accurate. Use **Tasks** for follow-ups that must be completed by a date or owner.

### When you need help

Use **Marketing Requests** for deliverables from marketing and **Tech Requests** for access or system support. Use **Knowledge Base** first for a documented process, then submit a clear request when the issue still requires assistance.

## Quality standard

Before you end the day, confirm that every meaningful interaction has one of three outcomes: the record was updated, a next action was created, or a request was submitted to the correct team. This keeps your pipeline, task list, reporting, and commission visibility trustworthy for you and the organization.
`,
  },
  {
    title: "SavvyOS Training Guide: Inside Sales Agents",
    visibleToRoles: "admin,isa",
    sortOrder: 20,
    content: `# SavvyOS Training Guide for Inside Sales Agents

## Your operating rhythm

SavvyOS is the working environment for lead stewardship, agent matching, follow-up discipline, and market-match operations. Start each shift in the **ISA Dashboard**, clear time-sensitive work in **Tasks**, and then work the appropriate leads from **All Contacts**, **Hot Leads**, and **Agent Pipelines**. Every conversation should leave the record with a clear status, documented outcome, and next owner or next action.

> **The handoff principle:** An ISA creates momentum, but the record—not memory—carries that momentum forward. Keep contact facts, activity, connection status, and next steps current before moving on.

## Start here

| Step | What to do | Why it matters |
|---|---|---|
| 1 | Open **ISA Dashboard** and review the day’s workload and signals. | It establishes a prioritized operating queue. |
| 2 | Open **Tasks** and resolve overdue or time-bound follow-up. | Task completion makes ownership and timing visible. |
| 3 | Review **Hot Leads** and the relevant **All Contacts** queue. | It keeps high-intent contacts ahead of lower-priority activity. |
| 4 | Check **Connection Requests** and **Agent Pipelines** for handoff movement. | A fast, documented handoff protects the lead experience. |
| 5 | Use **Pulse** to manage priorities, meeting commitments, and operating attention. | Pulse keeps your individual execution aligned with the team cadence. |

## Overview

| Section | Use it for | Core workflow |
|---|---|---|
| **ISA Dashboard** | Daily operating view for inside sales. | Review the indicators and queues, then open the source record that needs action. |
| **My Performance** | Your performance view. | Use current and historical results to identify where follow-up quality, speed, or coverage needs attention. |

## Leads and CRM

| Section | Use it for | Core workflow |
|---|---|---|
| **All Contacts** | The shared contact and lead workspace available to ISAs. | Search before creating a record, validate contact information, and keep stages, notes, and next actions specific and current. |
| **Hot Leads** | Lead prioritization. | Work high-priority contacts first; log the attempt or conversation outcome and assign the next step before leaving the record. |
| **Agent Pipelines** | Seeing opportunity progression by agent. | Use the pipeline to understand the contact’s current stage and coordinate a clean transition. Do not advance a stage without evidence of progress. |
| **Connection Requests** | Reviewing and acting on agent connection requests. | Confirm the request details, route or resolve it according to the current process, and make sure the status communicates the handoff result. |

## Operations

| Section | Use it for | Core workflow |
|---|---|---|
| **Tasks** | Assigned follow-up, call preparation, and operational commitments. | Complete work when finished; otherwise update the due date, owner, or context so the work does not become ambiguous. |
| **Market Match Hub** | Supporting market-match configuration and matching workflows. | Review the applicable requirements, keep market information accurate, and use the structured workflow rather than maintaining parallel notes outside the system. |
| **Market Match Call** | Running or supporting the market-match call workflow. | Prepare from the current record, capture meaningful outcomes and next steps, and route follow-up to the proper owner. |
| **Org Chart** | Understanding reporting and cross-functional relationships. | Use it to find the right leader or team when a lead, request, or exception needs escalation. |
| **Agent Directory** | Finding agent information. | Confirm the agent’s identity and details before coordinating a connection or follow-up. |

## Pulse

Use **Pulse** to create a disciplined operating cadence around your lead work. Review your work items and inputs, prepare for meetings from current CRM data, and complete follow-up in the source record after a meeting. Pulse should clarify priorities and accountability; **All Contacts**, **Agent Pipelines**, and **Tasks** remain the authoritative places for contact, pipeline, and task activity.

| Pulse area | Practice |
|---|---|
| **Mission / Work** | Review current priorities and make next actions explicit. |
| **Inputs** | Track the inputs that support consistent outreach and execution. |
| **Meetings** | Prepare from live records and document resulting commitments in the appropriate workflow. |
| **Notifications** | Keep your settings tuned to important operating signals. |

## Resources and profile

| Section | Use it for | Core workflow |
|---|---|---|
| **Knowledge Base** | Published ISA playbooks, SOPs, and role training. | Begin with **SavvyOS Training Guides**, then search for the relevant workflow, script, or policy. |
| **Profile** | Your user information, available from the account menu. | Keep your details current and use the profile area when your photo or account information changes. |

## Recommended operating flows

### Working a high-priority lead

Open the lead from **Hot Leads** or **All Contacts**, review the last meaningful activity, make the outreach attempt, record the actual outcome, and schedule the exact next action. If the lead becomes ready for an agent connection, ensure the contact record and request context are complete before advancing the handoff.

### Processing a connection request

Open **Connection Requests**, verify the contact and agent context, follow the applicable assignment or approval process, and update the status so both the ISA and agent can understand what happened. Avoid informal side-channel handoffs that leave no record.

### Conducting market-match work

Use **Market Match Hub** to prepare the structured market context and **Market Match Call** to support the live workflow. Capture only confirmed information, distinguish preferences from requirements, and create or update follow-up work immediately after the call.

## Quality standard

A well-managed ISA record answers three questions without additional explanation: who owns the next step, what should happen next, and when it is due. Before ending your shift, review unresolved hot leads, pending connection requests, and overdue tasks so the next operator receives a complete and current handoff.
`,
  },
  {
    title: "SavvyOS Training Guide: Agent Support",
    visibleToRoles: "admin,agent_support",
    sortOrder: 30,
    content: `# SavvyOS Training Guide for Agent Support

## Your operating rhythm

SavvyOS lets Agent Support team members work on behalf of the agents assigned to them while preserving the correct operational context. Start in the **Agent Support Portal**, choose the assigned agent whose work you need to support, and then complete the work through that agent’s SavvyOS view. A teal banner identifies when you are operating as an agent; stop the session from that banner when the assignment is complete.

> **Scope rule:** Work only for agents who appear in your assigned-agent list. If an agent is missing, contact an administrator for assignment rather than attempting to access or recreate the work elsewhere.

## Start here

| Step | What to do | Why it matters |
|---|---|---|
| 1 | Open **Agent Support Portal**. | It is the authoritative list of agents you are permitted to support. |
| 2 | Select **Work as [Agent]** for the appropriate assigned agent. | It opens the agent’s authorized working context. |
| 3 | Confirm the teal banner is visible. | The banner confirms you are acting on that agent’s behalf. |
| 4 | Complete the requested work through the relevant agent section. | The work is recorded in the correct operational context. |
| 5 | Stop working as the agent from the banner when finished. | It prevents activity from being completed under the wrong agent context. |

## Agent Support Portal

| Section | Use it for | Core workflow |
|---|---|---|
| **Agent Support Portal** | Selecting an assigned agent and entering their authorized view. | Review the agent list, choose the correct person, confirm the support mode banner, complete the requested action, and exit support mode when done. |

If the portal shows **No agents assigned yet**, do not attempt a workaround. Ask an administrator to assign the appropriate relationship. The portal intentionally limits access to safeguard agent data and ownership.

## Working as an assigned agent

Once you select an agent, their normal agent navigation becomes your working surface. Use the **Agent Training Guide** in this same Knowledge Base for the full step-by-step coverage of those sections. Your support responsibilities commonly involve the following areas.

| Agent section | Support use case | Completion standard |
|---|---|---|
| **My Dashboard / Daily Report / My Stats** | Review current priorities or provide administrative support based on the agent’s request. | Do not change information solely to make a dashboard look complete; update the source record. |
| **My Pipeline / Hot Leads / Request Connection** | Assist with follow-up preparation, opportunity hygiene, or a properly authorized connection request. | Record only confirmed information and preserve a clear next action. |
| **Transactions / Listings / Properties / My Commission** | Support deal documentation or verify transaction information. | Use source documents and approved instructions; escalate financial or policy questions rather than guessing. |
| **Tasks** | Complete, create, or update assigned operational follow-up. | Make the task outcome, next owner, and due date clear. |
| **Pulse** | Help prepare work, inputs, or meetings under the agent’s direction. | Keep Pulse aligned with the source CRM, deal, and task records. |
| **Marketing Requests / Tech Requests** | Submit or monitor a request for the agent. | State the requesting agent, objective, deadline, and required context. |
| **Knowledge Base** | Find the current SOP or process. | Follow the latest published guidance and include it in the handoff when appropriate. |

## Your own navigation

| Section | Use it for | Core workflow |
|---|---|---|
| **Pulse** | Your own role-level priorities and operating cadence. | Maintain your work items and meeting commitments without mixing them with the agent’s support activity. |
| **Knowledge Base** | Support documentation, agent-facing training, SOPs, and references. | Start with this guide or the **Agent Training Guide**, then search for the process you are completing. |
| **Profile** | Your account information, available from the account menu. | Keep your own profile current; do not edit an agent’s identity details unless the task and authorization are explicit. |

## Safe support workflow

### Before you begin

Confirm the request, identify the assigned agent, and open the **Agent Support Portal**. Select the correct agent and verify the teal support-mode banner before making any change.

### While you work

Use the same quality bar as the agent: work from the current record, document meaningful outcomes, and leave a clear next step. Maintain the distinction between confirmed facts, agent instructions, and items that still require a decision or approval.

### Before you hand off

Review the relevant record and explain what was completed, what remains, who owns the next step, and any deadline. If the request involved a transaction, commission, connection, or sensitive contact decision, escalate uncertainty rather than making an unsupported assumption.

## Quality standard

Excellent agent support is invisible in the best sense: the agent can open SavvyOS and immediately understand what happened, why it happened, and what comes next. Use authorized access, preserve data accuracy, and exit the agent context as soon as the assigned work is complete.
`,
  },
  {
    title: "SavvyOS Training Guide: Administrators",
    visibleToRoles: "admin",
    sortOrder: 40,
    content: `# SavvyOS Training Guide for Administrators

## Your operating rhythm

Administrators have the broadest SavvyOS access and are responsible for keeping the system useful, trustworthy, and appropriately governed. Start with **Admin Dashboard**, clear urgent operational exceptions in **Tasks**, **Admin Approvals**, and **Commission & Payouts**, then review the functional queues that require leadership action. Use permissions and assignments deliberately; broad access should not replace clear ownership.

> **Administration standard:** Make changes in the source workflow, document the reason when an exception matters, and use the least disruptive action that resolves the issue. Accurate data and deliberate ownership are more valuable than a fast but opaque fix.

## Daily administrator checklist

| Step | What to review | Why it matters |
|---|---|---|
| 1 | **Admin Dashboard**, **ISM Dashboard**, and priority reporting. | Identifies performance, workload, and exception signals. |
| 2 | **Tasks**, **Admin Approvals**, and commission-related badges. | Clears time-sensitive work and protects operating controls. |
| 3 | **Connection Requests**, **Marketing Requests**, and **Tech Requests**. | Maintains timely handoffs and service levels. |
| 4 | **Pulse**, **Leadership Dashboard**, and **Coaching Hub**. | Keeps leadership work aligned to current operating data. |
| 5 | **Feature Updates** and **Knowledge Base**. | Keeps agents informed and documentation current after material changes. |

## Overview and reporting

| Section | Use it for | Core workflow |
|---|---|---|
| **Admin Dashboard** | Organization-level starting view. | Review indicators, follow drill-downs to the source record, and act through the appropriate functional queue. |
| **ISM Dashboard** | Inside-sales management visibility. | Review ISA performance and workload, then use contact, task, connection, and coaching workflows for interventions. |
| **Reporting** | Standard reporting and analytical views. | Choose the appropriate date range and segment, verify the source data, and use findings to trigger a documented operating action. |
| **Custom Reports** | Permission-controlled custom reporting. | Build or open reports only when the result supports a defined business question; validate filters before sharing results. |
| **Agent Leaderboard** | Team performance visibility. | Use it for recognition and coaching context, not as the sole source for financial or pipeline decisions. |

## CRM administration

| Section | Use it for | Core workflow |
|---|---|---|
| **All Contacts** | Organization-wide lead and contact management. | Search before creating, merge or correct records through approved tools, maintain clear ownership, and protect contact data quality. |
| **Hot Leads** | Prioritizing time-sensitive opportunities. | Verify that the urgency and next action are real, then coordinate with the responsible ISA or agent. |
| **All Pipelines** | Monitoring opportunity movement across agents. | Use stages to diagnose movement and blockage; correct data at the opportunity record rather than maintaining a separate tracker. |
| **Connection Requests** | Resolving and governing agent-contact connection workflows. | Review the request context, approve or resolve according to policy, and ensure the final status makes ownership unambiguous. |
| **Lead Sources** | Maintaining lead-source definitions and reporting integrity. | Standardize names and usage so source reporting is meaningful; do not create near-duplicate labels for the same channel. |

## Transactions and financial operations

| Section | Use it for | Core workflow |
|---|---|---|
| **All Transactions** | Oversight of active and closed deals. | Verify key deal data, update the record through the proper workflow, and use exception handling when financial inputs need review. |
| **Transaction Exports** | Producing transaction reporting outputs. | Select the correct scope and date range, review totals before distributing, and retain the source context for material reports. |
| **Listings** | Monitoring listing-side activity and expiration exposure. | Review status and dates, follow up on expiring listings, and correct the record when source information changes. |
| **Properties** | Organization-wide property and analysis records. | Maintain accurate property facts and use property analysis or pro forma workflows consistently. |
| **Commission & Payouts** | Reviewing commission splits, payouts, flags, and exceptions. | Verify transaction-level inputs before changing payout data. The system enforces a 20% minimum company share and flags payout totals above 100%. |
| **Referrals** | Managing referral relationships and referral deal information. | Keep referral ownership, status, and deal linkage current; resolve exceptions from the actual referral record. |

## Operations and leadership

| Section | Use it for | Core workflow |
|---|---|---|
| **Tasks** | Organization-wide task execution and follow-up. | Assign an accountable owner and due date; use status changes to show work actually completed. |
| **On/Offboarding** | Templates, trackers, reports, and active lifecycle workflows. | Choose the appropriate lifecycle workflow, keep required steps current, and clear blockers with the responsible owner. |
| **Coaching Hub** | Coaching programs, sessions, and agent accountability. | Use current activity and outcome data to prepare coaching; record commitments and follow-up in the relevant session or task workflow. |
| **Leadership Dashboard** | Leadership-level operational and performance view. | Identify a decision or intervention, then open the source record to act. |
| **Activity Log** | Auditing material in-app activity. | Use it to investigate a specific question, confirm context, and avoid using it as a substitute for normal record documentation. |

## Pulse

**Pulse** is the operating layer for priorities, work, meetings, attention, and notifications. Administrators can also access the mission-control and settings views that support organization-level attention management. Use Pulse to make ownership and operating signals visible, while keeping contact, deal, commission, and task facts in their dedicated source records.

| Pulse area | Administrator practice |
|---|---|
| **Mission / Work / Inputs** | Maintain clear priorities, work ownership, and operating inputs. |
| **Meetings** | Prepare with current data, capture commitments, and route resulting work to its accountable owner. |
| **Outstanding / Attention settings** | Review organization-level exceptions and resolve them through the source workflow. |
| **Notifications** | Maintain sensible alerting so high-value operating signals are delivered without creating noise. |

## Administration

| Section | Use it for | Core workflow |
|---|---|---|
| **Users** | Creating, activating, and maintaining user accounts. | Assign the correct role and keep identity information current; review access changes promptly. |
| **Admin Approvals** | Reviewing workflow approvals, including items requiring administrator action. | Confirm the underlying record and policy basis before approving or declining. |
| **Market Match Hub** | Managing market-match configuration and operations. | Keep market data and workflow settings current; use the linked record for supporting details. |
| **Org Chart** | Maintaining and viewing organizational relationships. | Keep reporting lines accurate so routing and accountability remain clear. |
| **Agent Directory** | Organization-wide agent reference. | Use it to confirm agent details and directory presence before outreach or assignment changes. |
| **Roles & Responsibilities** | Defining role expectations and ownership. | Update responsibilities when the operating model changes, then communicate the impact through the appropriate channel. |
| **Feedback & Requests** | Reviewing submitted feedback and product requests. | Triage by impact, clarify the request in the source item, and communicate a decision or next step. |
| **Marketing Requests** | Managing agent marketing requests. | Prioritize requests by business need and deadline, keep status current, and avoid requiring agents to repeat context. |
| **Tech Requests** | Managing technical issues and access requests. | Verify impact and reproducibility, assign the appropriate owner, and keep the request status visible. |
| **Goals** | Tracking organizational goals. | Keep goal owners, targets, and progress current; use Pulse and leadership workflows to address missed commitments. |
| **Job Board** | Administering job-board content and hiring workflows. | Publish accurate opportunities and keep status or role details current. |
| **Talent Profiles** | Reviewing and managing talent-profile information. | Use consistent criteria and safeguard candidate or talent data. |
| **Resend Inbox** | Reviewing relevant email inbox activity. | Investigate delivery or response context, then return to the source contact, task, or request to record action. |
| **Passwords** | Accessing the shared passwords area where authorized. | Follow security practices, restrict disclosure, and never place credentials in contact notes or broad communications. |
| **Super Permissions** | Managing granular administrator permissions. | Grant only the access needed for a defined job function; review changes carefully because they affect navigation and capabilities. |

## Development tools and resources

| Section | Use it for | Core workflow |
|---|---|---|
| **Webhooks** | Reviewing configured inbound or outbound workflow integrations. | Validate the business purpose, payload behavior, and owner before changing configuration. |
| **Duplicate Contacts** | Detecting and resolving duplicate contact records. | Review candidates carefully, preserve the best source information, and use the approved resolution path rather than deleting blindly. |
| **Knowledge Base** | Publishing SOPs, reference materials, and training. | Create content in the correct category, set the correct role visibility, publish only verified guidance, and keep outdated content current. |

## Projects and plans

| Section | Use it for | Core workflow |
|---|---|---|
| **Projects** | Tracking cross-functional initiatives and project work. | Define ownership, milestones, and next actions; use the project record as the shared status source. |
| **Smart Plans** | Designing email-drip plan definitions. | Review audience, content, timing, and activation state carefully. Email workflows are live; do not assume SMS or untriggered automation logic is sending messages without confirming its enabled execution path. |
| **Feature Updates** | Publishing agent-facing changes for the Daily SavvyOS Report and agent email. | Write a concise, accurate published update with an action path whenever a material agent-facing capability changes. |
| **Email Notifications** | Reviewing and managing notification configuration. | Confirm the business intent, recipient group, and enabled state before changing a notification. |

## Administrator governance routines

### When a user needs access

Use **Users** to confirm the role, then use **Super Permissions** only for the granular capabilities that role actually needs. Confirm the user can see the correct navigation after the change, and document any nonstandard access in the appropriate workflow.

### When a new administrator left-navigation item is added

Every new left-sidebar admin navigation item must be added to the **Super Permissions** definition and matrix, stored in the administrator-permission model, mapped to the sidebar permission filter, and enforced by both its direct route and server API. Do not ship a new admin navigation item until these permission checks are complete and verified.

### When a data-quality issue is found

Open the relevant source record—contact, pipeline, transaction, listing, property, or task—before correcting it. Use **Duplicate Contacts** for duplicate analysis and avoid creating parallel records or off-system corrections that make reporting unreliable.

### When a new agent-facing capability ships

Update the **Knowledge Base** if users need operating guidance. Create and publish a concise **Feature Update** with a real in-app action path so the change appears in the Daily SavvyOS Report and agent email. Do not publish feature updates for purely internal infrastructure or maintenance work unless there is an agent-facing effect.

## Quality standard

A well-run SavvyOS environment has clear ownership, accurate source records, role-appropriate access, and current documentation. Before closing an administrative item, make sure the decision is visible in the system, the next owner is clear, and the affected users can find the guidance they need.
`,
  },
];
