# SavvyOS TODO

## Database Schema
- [x] Extend users table with role (admin/agent/isa)
- [x] contacts table
- [x] agent_connections table (agent ↔ contact relationship with pipeline status + buy box)
- [x] lead_sources table
- [x] referral_partners table
- [x] properties table
- [x] property_ownership table
- [x] transactions table
- [x] transaction_payout_items table
- [x] groups table
- [x] group_members table
- [x] tasks table
- [x] documents table
- [x] communications table
- [x] activity_log table
- [x] automations table

## Backend API (tRPC Routers)
- [x] contacts router (CRUD, search, lead source)
- [x] agent_connections router (pipeline CRUD, buy box)
- [x] properties router (CRUD, ownership history)
- [x] transactions router (CRUD, status management)
- [x] commission router (payout items, integrity checks)
- [x] tasks router (CRUD, assign, complete)
- [x] documents router (upload to S3, list, delete)
- [x] communications router (notes, calls, emails, SMS logs)
- [x] analytics router (KPIs, pipeline metrics, agent performance)
- [x] referral_partners router
- [x] groups router
- [x] automation router (trigger/action engine)
- [x] voice transcription router

## Frontend Shell
- [x] Global design system (colors, typography, spacing)
- [x] DashboardLayout with role-aware sidebar navigation
- [x] Route structure for admin/agent/isa views
- [x] Auth guard and role-based routing

## Admin Dashboard
- [x] Admin overview KPIs (revenue, transactions, leads)
- [x] Agent performance table
- [x] ISA performance table
- [x] Commission financial reports
- [x] Referral partner ROI

## Analytics
- [x] Pipeline funnel chart
- [x] Lead conversion rates
- [x] Commission revenue over time
- [x] Agent production bar chart
- [x] ISA performance metrics

## Commission Accounting
- [x] Transaction payout breakdown UI
- [x] Commission split editor (agent/brokerage/team leader/referral)
- [x] Financial integrity validation (>100% flag)
- [x] Payout status tracking (paid/unpaid)

## Agent Dashboard
- [x] VIP lead list (agent connections)
- [x] Pipeline kanban board
- [x] Active transactions list
- [x] Follow-up tasks
- [x] Contact detail view with buy box

## Contact Management
- [x] Contact list with search/filter
- [x] Contact detail page (info, history, connections)
- [x] Create/edit contact form
- [x] Lead source attribution
- [x] Secondary contact (spouse/partner)
- [x] Communication history on contact

## Transaction Management
- [x] Transaction list view
- [x] Transaction detail page
- [x] Create/edit transaction form
- [x] Property linking
- [x] Status workflow (active/pending/closed/cancelled)

## ISA Dashboard
- [x] Assigned contacts list
- [x] Lead pipeline view
- [x] Follow-up queue
- [x] Create contact + agent connection flow
- [x] Task management

## Task Management
- [x] Task list (assigned to me)
- [x] Create/edit task
- [x] Mark complete
- [x] Due date tracking

## Document Management
- [x] Document upload (S3)
- [x] Document list per contact/transaction/property
- [x] Document download/view

## Communication Log
- [x] Log note/call/email/SMS
- [x] Communication timeline per contact
- [x] Communication timeline per transaction

## Automation Engine
- [x] Financial integrity check (payout > 100% → flag)
- [x] Transaction closed → trigger payout workflow
- [x] New agent connection → create outreach task
- [x] Follow-up date → create task
- [x] Stale lead → notify user

## Email Alerts
- [x] Lead assigned alert to agent/ISA
- [x] Transaction status change alert
- [x] Commission calculated alert
- [x] Task due alert

## Voice Transcription
- [x] Voice note recording UI
- [x] Upload audio to S3
- [x] Transcribe via Whisper API
- [x] Save transcription as contact note + task items

## Financial Integrity
- [x] Commission total validation (never > 100%)
- [x] Alert admin if transaction closes without payout items
- [x] Alert if referral partner exists but no payout created

## Testing
- [x] contacts router tests
- [x] transactions router tests
- [x] commission integrity tests
- [x] automation trigger tests

## Portal Redesign (v2)
- [x] Fix sidebar nav text overlap bug (background text bleeding through)
- [x] Fix unclickable nav items (Analytics, Pipeline, Properties, Commission, Documents, Voice Notes)
- [x] Redesign nav into 3 role-specific configs (Admin / ISA / Agent)
- [x] Admin portal: dedicated dashboard with brokerage-wide KPIs, all transactions, commission reports, team management, lead sources, referral partners
- [x] ISA portal: all leads with agent filter, VIP pipeline view per agent, contact management, task queue, follow-up scheduling
- [x] Agent portal: own leads only, own transactions, own pipeline, own tasks, own commission view
- [x] Backend query scoping: admin=all, agent=own records only, ISA=assigned+all contacts
- [x] Admin: Lead Sources management page (add/edit/delete sources)
- [ ] Admin: Transaction Payouts report page (all payouts across brokerage)
- [x] ISA: Agent pipeline filter (view VIP pipeline filtered by specific agent)
- [x] Agent: My Pipeline page (own agent connections only)
- [x] Agent: My Transactions page (own transactions only)

## Full Feature Completion (v3)
- [x] Fix sidebar nav overlap/unclickable bug — replace shadcn Sidebar with custom fixed sidebar
- [x] User Management: add user manually (name, email, role), edit user profile, invite flow
- [x] Groups Management: create/edit groups, assign group leader, add/remove members
- [x] Lead Sources: CRUD page for lead source records (not just analytics view)
- [x] Referral Partners: full CRUD (add, edit, deactivate, view payout history)
- [x] ISA quick-create: Contact + Agent Connection form directly from ISA dashboard
- [x] Agent Connection detail/edit: buy box fields (price range, beds, baths, cities, STR notes)
- [ ] Pipeline Kanban board: drag-and-drop columns per pipeline stage (future enhancement)
- [x] Transaction Payout Report: admin page showing all payout line items across brokerage
- [x] Commission integrity UI: flag display on transactions, admin alert panel
- [ ] AI Insights panel: lead scoring, follow-up suggestions, pipeline analysis (future enhancement)
- [x] Backend scoping: agent queries filter by agentId=ctx.user.id
- [x] ISA backend scoping: contacts show all + filter by assignedIsaId
- [x] Admin: Transaction Payouts report page (all payouts across brokerage)

## Bug Fixes (v3.1)
- [x] Fix analytics.agentPerformance crash (isActive column missing in DB)
- [x] Fix Voice Notes page error (caused by dashboard crash propagating)

## Lead Source Hierarchy & Advanced Analytics (v4)
- [x] Add `lead_sources` table with parentId self-reference (two-level hierarchy)
- [x] Add `leadSourceId` FK to contacts table (replaces leadSourceType enum)
- [x] Migrate contacts schema to use leadSourceId instead of leadSourceType enum
- [x] Build Lead Sources management page: tree view, parent categories, child sub-sources, referral partner linking
- [x] Campaign type support (buyer/seller/both) on lead sources
- [x] Deep analytics backend: lead source ROI, conversion funnel, agent production trends, ISA metrics, referral partner performance
- [x] Advanced Analytics page: 5 tabs (Overview, Lead Sources, Agent Production, ISA Performance, Referral Partners)
- [x] Date range filters across all analytics tabs
- [ ] Update contact create/edit forms to use hierarchical lead source picker (next step)

## Contact & Agent Connection Improvements (v5)
- [x] Hierarchical lead source picker in contact create/edit form (category → sub-source)
- [x] Inline "Add New Referral Partner" inside lead source sub-source dialog
- [x] Spouse/partner/business partner secondary contact: linked contact field on contact form and detail
- [x] Agent connection creation from Admin portal (contact detail + contact list)
- [x] Agent connection creation from ISA portal (contact detail + contact list)
- [x] Agent data scoping: agents only see contacts via their agent connections (no standalone contact list)
- [x] Agent nav: replace "Contacts" with "My Pipeline" as the primary entry point

## System Audit & Architecture Repair (v6)
- [x] Fix TransactionDetail payout form: add payeeUserId picker (agents) and payeeReferralPartnerId picker (referral partners) instead of free-text only
- [x] Fix TransactionDetail: GCI auto-calculation (percentage × GCI = dollar amount shown live)
- [x] Fix PipelinePage: add buy box view/edit panel per pipeline entry
- [x] Fix PipelinePage: stage update dialog with follow-up date and agent notes
- [x] Fix ISADashboard: 2-step quick-create (contact → agent connection) with lead source picker
- [x] Fix ISADashboard: 'New Lead' button in header and quick actions
- [ ] Fix CommissionPage: scope to current user's transactions for agents (admin sees all)
- [ ] Fix TransactionsPage: add commissionRate field with auto-GCI calculation
- [ ] Build AgentConnectionDetail page: full drill-down with buy box, notes, tasks, communications
- [ ] Fix agent nav: remove standalone 'My Contacts' — agents access contacts only via pipeline
- [ ] Fix PayoutReportPage: add to admin nav (currently missing)
- [ ] Clean up legacy contact fields from create/edit forms

## Agent Connection Detail & Commission Auto-Calc (v7)
- [x] Build AgentConnectionDetail page: buy box, communications, tasks, documents, notes per agent-contact relationship
- [x] Wire /pipeline/:id route to AgentConnectionDetail
- [x] Link PipelinePage row chevron to /pipeline/:id detail page
- [x] Add commission rate field to Transaction create form with auto-GCI calculation
- [x] Add contract date + closing date fields to Transaction create form

## Commission Agent Scoping (v7.1)
- [x] Scope commission router payout queries: agents see only their own payout items, admins/ISAs see all
- [x] Update CommissionPage frontend: agents see personal earnings summary, admins see brokerage-wide view
- [x] Hide admin-only controls (e.g., edit payout items) from agent role on CommissionPage

## Dev Mode & Nav Cleanup (v7.2)
- [x] Add dev-mode login bypass: skip OAuth, inject mock user based on selected role
- [x] Add floating role switcher UI (Admin / ISA / Agent toggle) visible in dev mode
- [x] Remove Documents and Voice Notes from admin nav (they are sub-features, not top-level)

## Agent-to-Transaction Linking (v7.3)
- [x] Show agent selector in transaction create form for admins (agents/ISAs default to self)
- [x] Update transaction router create procedure to accept agentId from admin input
- [x] Fix dev login bypass: AppLayout was redirecting to OAuth before AuthGuard could show dev screen

## Mobile UX Improvements (v7.5)
- [x] Fix dev role switcher hidden/clipped on mobile
- [x] Fix sidebar navigation on mobile (hamburger menu, overlay)
- [x] Fix dashboard cards layout on mobile (single column)
- [x] Fix tables on mobile (horizontal scroll or card view)
- [x] Fix dialog/modal sizing on mobile
- [x] Fix form layouts on mobile (full-width inputs)
- [x] Fix header/topbar on mobile

## OAuth Email Merge (v7.6)
- [x] When OAuth login email matches existing manually-created user, merge openId into that account instead of creating a duplicate
- [x] Clean up Elana's duplicate account in the database

## ISA Portal Improvements (v8)
- [x] Fix edit contact form: add ISA assignment field (same as add contact)
- [x] Make email a required field on add and edit contact forms
- [x] Remove address, city, state, zip from contact add/edit forms (Details & Source section)
- [x] Add approval_requests table (type, requestedById, targetId, reason, status, reviewedById)
- [x] Add contact_properties table (contactId, propertyId, label e.g. "Primary home")
- [x] Add Properties tab on contact detail page (all portals: Admin, ISA, Agent)
- [x] Allow linking existing properties to a contact with a label
- [x] When ISA assigns agent to contact: show checkbox (checked by default) to create a task for the agent (fill out buy box/initial notes), ISA picks due date
- [x] Prevent ISA from assigning the same agent to the same contact more than once
- [x] ISA pipeline page: add agent name filter button
- [x] ISA can request deletion of an agent connection (requires reason note)
- [x] Admin Approvals page: list pending deletion requests, approve/reject with notes
- [x] On approval: delete the agent connection; on rejection: notify ISA

## Portal Fixes v8.1
### ISA Portal
- [x] Fix ISA "My Tasks" showing tasks assigned to agents — scope to ISA's own tasks only
- [x] Show assignee name on tasks in ISA dashboard contact view
- [x] Grey out delete button on agent connection if deletion already requested, show tooltip
- [x] Filter contacts and agent pipelines by assigned ISA (including unassigned) — default on ISA dashboard

### Agent Portal
- [x] Redirect agent contact clicks to AgentConnectionDetail page (not ContactDetail)
- [x] Show Transactions on AgentConnectionDetail page
- [x] Show Spouse/Partner on AgentConnectionDetail page
- [x] Show Assigned ISA on AgentConnectionDetail page
- [x] Remove "New Transaction" button from Agent Transactions page
- [x] Remove "Properties" link from agent nav
- [x] Show agent connection contact name + link on Agent "My Tasks" page
- [x] Add task editing (due date + status) on agent portal

### Admin Portal
- [x] Show red badge with pending approval count on Admin Approvals nav item

### Cross-Portal
- [x] Add task editing (due date + status change) across all portals if missing
- [x] Delete duplicate contact Elle Anderson (the one with phone number)
- [x] Prevent duplicate contacts: block same email and/or phone number on create

## Task Automation Simplification v8.2
- [x] Remove auto "Initial outreach for new lead" task when ISA doesn't check onboarding box
- [x] Remove auto "Review transaction documents" task on transaction creation
- [x] Remove auto "Process commission payouts" task on transaction close
- [x] Remove Voice Notes feature entirely (router, nav items, pages)
- [x] Add ISA follow-up date task: when ISA sets a follow-up date on agent connection, create a task for the ISA to follow up with that client
- [x] Rename follow-up date field to "ISA follow up date (creates a task - optional)"
- [x] Delete all existing tasks from database

## ISA Portal Improvements (v8.3)
- [x] Show assigned person name on tasks in ISA Dashboard "My Tasks" section
- [x] Allow ISA to edit tasks (priority, due date, status, notes, and other related fields)
- [x] Record when tasks are added, completed, updated (task activity timestamps)
- [x] Search filter clearing: add "Clear filters" link when no results or at bottom of results; triggers new search without filters. Apply throughout site where filters may mask results
- [x] Remove non-functional "Follow-up Date" field from Assign Agent workflow (keep only ISA follow up date)
- [x] Audit all fields across the site for non-functional/placeholder fields and report findings
- [x] Contact page for ISA: add (#) count next to Properties, Transactions, and Tasks (only incomplete tasks)

## Agent Portal Improvements (v8.3)
- [x] Add "Listings" page visible on both admin and agent portals (only admins can add listings)
- [x] Listings: active, terminated, expired statuses; ability to convert listing to transaction
- [x] Toggle between % commission and flat dollar amount when adding/editing transactions
- [x] Same commission toggle on "Add payout" screen
- [x] Replace "Brokerage" payout item with "Savvy STR Agents" and "Exp"
- [x] Agent dashboard Tasks section: edit via Tasks page (already has edit)
- [x] Agent dashboard Transactions section: make transactions clickable to open transaction page
- [x] Show spouse/partner phone and email on agent portal when they exist

## Admin Portal Improvements (v8.3)
- [x] Scalable contact search for new transactions (search-based, not dropdown; handle 30k+ contacts)
- [x] Review all dropdowns site-wide for scalability with large datasets (documented in audit report)
- [x] Remove "Dual" from transaction type; if dual selected, create two transactions (buyer + seller) with separate commission inputs
- [x] Remove "Referral" and "Lease" from transaction types
- [x] Format Purchase Price and GCI as $1,000,000 (using toLocaleString formatting)
- [x] Remove Referral Partners feature entirely (only use Lead Sources)
- [x] Groups: only allow "Agent" role to be assigned (leader and members filtered to agents only)
- [x] Groups page: show member names in main group card (not just popup)
- [x] Rename "Team Members" nav link to "Users"
- [x] Tasks page: filter by assigned person (ISA, Admin, or Agent) + created date filter
- [x] Tasks: add "Created" timestamp on all pages where tasks appear
- [x] Fix "Agent Performance" on Admin Dashboard: now shows pipeline contacts, active, closed, GCI per agent
- [x] Transaction status types: only "active", "under contract", "closed", "terminated"

## Overall Improvements (v8.3)
- [x] History/audit tab on Contact page showing all changes (status, ISA assignment, agent connection, etc.)
- [x] History/audit tab on Transaction page showing all changes (status changes, edits, etc.)
- [x] History/audit throughout entire site wherever changes are tracked (use activity log system)

## Simulate As Feature
- [x] Backend: simulateAs tRPC procedure (tyler@savvy.realty only) — stores target userId in session cookie
- [x] Backend: stopSimulation tRPC procedure — clears simulated user from session
- [x] Backend: context reads simulatedUserId from session and swaps ctx.user accordingly
- [x] Frontend: "Simulate As" button in admin sidebar/header, only visible to tyler@savvy.realty
- [x] Frontend: user picker dialog showing all users (name, email, role)
- [x] Frontend: orange impersonation banner at top of screen showing who is being simulated + "Exit Simulation" button
- [x] Frontend: useAuth() returns simulated user's role so all portals render correctly

## ISA Dashboard Task Improvements
- [x] Show assigned person name on each task in ISA Dashboard "My Tasks" section
- [x] Allow ISA to edit tasks: priority, due date, status, notes, title, and other fields
- [x] Record task activity: log when tasks are created, updated, completed (with timestamp + who did it)

## Contact Detail Page - Task Improvements
- [x] Contact Detail Tasks tab: show assigned person name on each task
- [x] Contact Detail Tasks tab: allow editing tasks (priority, due date, status, notes, title, assigned to)
- [x] Record task activity: log when tasks are created, updated, completed (timestamp + who did it)

## History Tab Normalization
- [x] Normalize History tab: show human-readable descriptions instead of raw JSON (e.g. "Email changed from X to Y", "ISA assigned to Jane Smith")
- [x] Handle all action types: contact_updated, task_created, task_updated, task_completed, agent_connection_created, transaction_created, transaction_updated, etc.

## Bug Fixes
- [x] Fix Assign Agent / Assign ISA dropdowns showing blank when logged in as ISA (users.list too restrictive)

## Resend Email Integration
- [x] Install Resend SDK and add RESEND_API_KEY secret
- [x] Build email service using savvy-agents.com domain
- [x] Send real emails to agents/ISAs for: new lead assigned, transaction status changed, transaction closed, commission calculated, task created/due
- [x] Replace notifyOwner-only alerts with actual recipient emails

## Overdue Task Flagging
- [x] Show red badge on tasks that are past their due date
- [x] Add "Overdue" filter to Tasks page
- [x] Show overdue indicator on Contact Detail and Agent Dashboard task lists

## Diff-Based Transaction History
- [x] Log old vs new values on transaction update (same pattern as contact diff logging)
- [x] Update activity formatter to display transaction field changes cleanly

## Brand Redesign (v9)
- [x] Upload Savvy STR Agents logo to CDN
- [x] Update global CSS with brand colors: cyan #00C4D4, black #0A0A0A, white backgrounds
- [x] Update sidebar with brand logo, dark background, cyan active states
- [x] Update all UI components to use new brand tokens (buttons, badges, cards, charts)
- [x] Build branded HTML email templates for all transactional emails

## UI & Groups Fixes (v9.1)
- [x] Remove dark theme from sidebar/nav (switch to light/neutral with cyan accents)
- [x] Groups: restrict leader and member dropdowns to Agents only
- [x] Groups: enforce one-group-per-agent (server-side + UI filtering)
- [x] Groups: prevent a leader from being assigned to another group as member or leader
- [x] Groups: show member names directly on group cards (not just in the popup)

## Smart Plans (v10)
- [x] DB: smart_plans table (id, name, status, triggeredByLeadSourceId, createdAt)
- [x] DB: smart_plan_steps table (id, planId, stepOrder, channel, delayDays, delayHours, subject, body, createdAt)
- [x] DB: smart_plan_enrollments table (id, planId, contactId, currentStepIndex, enrolledAt, status, completedAt)
- [x] DB: smart_plan_executions table (id, enrollmentId, stepId, sentAt, status, errorMessage)
- [x] Backend: Aircall SMS helper (api_id + api_token Basic Auth, number ID configurable)
- [x] Backend: Resend email helper for Smart Plans (from hello@savvy-agents.com)
- [x] Backend: enrollment trigger on contact creation (match lead source → enroll in plan)
- [x] Backend: step scheduler cron job (check enrollments, dispatch due steps)
- [x] Backend: merge tag rendering ({{first_name}}, {{last_name}}, {{agent_name}}, {{lead_source}})
- [x] Backend: tRPC smartPlans router (CRUD plans, steps, list enrollments, list executions)
- [x] Admin UI: Smart Plans list page (name, lead source trigger, step count, enrollment count, active/paused toggle)
- [x] Admin UI: Plan builder — create/edit plan with step editor (channel, delay, subject, body)
- [x] Admin UI: Enrollment view per plan (contacts enrolled, current step, status)
- [x] Contact page: Smart Plan tab on Admin portal (enrollments + execution log per contact)
- [x] Contact page: Smart Plan tab on ISA portal
- [x] Contact page: Smart Plan tab on Agent portal (AgentConnectionDetail)
- [ ] Settings: Aircall API ID + API Token secrets entry
- [ ] Settings: Aircall phone number ID (the sending number)
- [ ] Settings: Resend from-address confirmation (hello@savvy-agents.com)
- [x] Tests: smartPlans router unit tests

## Smart Plans Builder Redesign (v10.1)
- [x] Multi-step wizard: Step 1 = Plan name/trigger/lead source, Step 2 = Add steps one at a time, Step 3 = Review & publish
- [x] WYSIWYG email editor with HTML toggle (rich text + raw HTML mode)
- [x] Per-step save (each step saved immediately, no full-page reload risk)
- [x] Draft status: plans can be saved as drafts before publishing
- [x] Step reorder (drag or up/down arrows)
- [x] Step delete with confirmation
- [x] Backend: draft plan status support
- [x] Backend: step reorder endpoint
- [x] Backend: step delete endpoint

## Smart Plans v10.2
- [x] Schema: add triggerLeadSourceIds (JSON array) and triggerScope enum (new_only/existing_and_new/manual) to smart_plans
- [x] Backend: multi-source enrollment trigger, countMatchingContacts query, bulkEnrollExisting endpoint with explicit call
- [x] Frontend wizard: multi-select lead source picker, trigger scope selector
- [x] Frontend: explicit confirmation dialog with live contact count before bulk enrolling existing contacts
- [x] Frontend: remove agent_name/isa_name/team_name merge tags — keep only first_name, last_name, full_name, lead_source
- [x] Frontend: paginated contacts dialog (25/page, search, status filter)

## Smart Plans v10.3 — Business Hours Scheduling
- [x] Schema: add businessHoursOnly (boolean, default false) and timezone (varchar, default 'America/New_York') to smart_plan_steps
- [x] Backend scheduler: defer steps outside Mon-Fri 9am-6pm to next valid window
- [x] Frontend StepEditor: business-hours toggle + timezone selector

## Full Audit & Duplicate User Fix (v11)
- [x] Fix duplicate users: deduplicate elana@savvy.realty rows, add DB-level unique constraint on email
- [x] Seed realistic test data for audit (contacts, transactions, tasks, lead sources, groups)
- [x] Browser audit: Admin workflow (all pages)
- [x] Browser audit: Agent workflow
- [x] Browser audit: ISA workflow
- [x] Compile prioritized audit report
- [x] Implement critical fixes from audit: Documents + Referral Partners nav links, SimulateAs button visibility

## Pagination & Email Deliverability (v11.1)
- [ ] Restore Documents and Referral Partners nav links (removed by Tyler — links only, not functionality)
- [x] Server-side pagination: All Contacts page (25/page + search)
- [x] Server-side pagination: Pipeline page (25/page + search)
- [x] Server-side pagination: Transactions page (25/page + search)
- [x] Server-side pagination: Tasks page (25/page + search)
- [x] Server-side pagination: Users page (25/page + search)
- [x] Smart Plans: bounce tracking — suppress contacts with hard bounces
- [x] Smart Plans: unsubscribe management — honor opt-outs, never re-send
- [x] Smart Plans: global email footer with unsubscribe link
- [x] Smart Plans: switch marketing emails to Resend Broadcasts API
- [x] Smart Plans: rate limiting / batching for large enrollments (30k contacts)

## v11.2 — Pagination, Referral Partners Removal, Email Deliverability
- [ ] Fully remove Referral Partners: page, route, nav link, schema tables, all code references
- [ ] Server-side pagination: All Contacts (25/page + search)
- [ ] Server-side pagination: Pipeline / Agent Connections (25/page + search)
- [ ] Server-side pagination: Transactions (25/page + search)
- [ ] Server-side pagination: Tasks (25/page + search)
- [ ] Server-side pagination: Users (25/page + search)
- [ ] Add emailStatus column to contacts (valid/bounced/unsubscribed) + migration
- [ ] Resend webhook endpoint for bounce and complaint events
- [ ] Global email footer template with unsubscribe link, address, branding
- [ ] Smart Plan scheduler: skip bounced/unsubscribed contacts

## Usability Audit Fixes (v11.3)
### Critical
- [x] Fix broken Agent sidebar routes: "My Pipeline" → /pipeline, "My Commission" → /commission (routes were already correct)
- [x] Add frontend route guard: block ISA/Agent from /users, /groups, /lead-sources, /approvals, /documents, /referral-partners (AdminRoute already in place)
### High
- [x] Fix Agent dashboard "Active Pipeline" metric — count active-stage pipeline contacts, not open transactions
- [x] Referral Partners removed from nav entirely (Tyler's decision)
- [x] Add "Enroll in Smart Plan" button on contact detail Smart Plans tab (ISA + Admin)
### Medium
- [x] Add ISA pipeline status column to ISA/Admin Contacts table
- [x] Add filter bar (priority, due date) to Agent and ISA task views
- [x] Rename "Total Earned" to "Earned to Date" on Agent Commission page
- [x] ISA can enroll contacts in Smart Plans from contact detail page
### Low / UX
- [x] Make ISA dashboard "My Assigned Leads" cards clickable → /contacts/:id
- [x] Make Agent dashboard pipeline contact cards clickable → /contacts/:id
- [x] Add tooltip/help text explaining "Buy Box" on Pipeline page
- [x] History tab: multi-entity lookup (tasks, notes, connections, all related activity)
- [x] Analytics page already has date range picker per tab
- [ ] Fix Listings page: clarify distinction from Properties, populate with correct data
- [x] Add archive + delete contact actions on contact detail page (admin only)

## ISA Pipeline Status (v11.4)
- [x] Schema: add isaStatus enum column to contacts (same values as agent pipelineStatus: new_lead, attempted_contact, nurture, active_client, under_contract, closed, dead)
- [x] DB migration: ALTER TABLE contacts ADD COLUMN isa_status
- [ ] Auto-set isaStatus to 'new_lead' when ISA is first assigned to a contact
- [ ] Backend: include isaStatus in contacts.list and contacts.get responses
- [ ] Backend: contacts.update accepts isaStatus changes (admin + ISA only)
- [ ] Backend: contacts.list filter by isaStatus
- [ ] Frontend: ISA pipeline status field on Contact Detail page (editable by admin + ISA, disabled if no ISA assigned)
- [ ] Frontend: ISA pipeline status column in All Contacts table (ISA + Admin views)
- [ ] Frontend: ISA pipeline status filter on ISA Contacts page
- [ ] Frontend: ISA pipeline status filter on Admin Contacts page
- [ ] Frontend: ISA pipeline status shown on Admin Dashboard contact cards
- [ ] Frontend: ISA pipeline status filter on ISA Dashboard
- [ ] Frontend: ISA pipeline status shown/filterable on Admin Pipeline page (agent connections view)
- [ ] Activity log: log isaStatus changes with old/new values

## v11.5 — Major Feature Sprint

### Listings Page (Full Build)
- [ ] Schema: listings table (id, contactId, propertyId, agentId, listPrice, listingDate, expirationDate, status: active/terminated/expired/converted, createdAt, updatedAt)
- [ ] Schema: listing_notes table (id, listingId, authorId, content, createdAt)
- [ ] DB migration: create listings and listing_notes tables
- [ ] Backend: listings CRUD router (list, get, create, update, terminate, expire, convertToContract)
- [ ] Listings page: table view with status badges, filter by status/agent
- [ ] Create listing modal: contact lookup (search existing or add new inline), property lookup (search existing or add new inline), list price ($-formatted), listing date, expiration date
- [ ] Listing detail page: all fields editable, status actions (Terminate, Mark Expired), Convert to Contract button
- [ ] Notes section on listing detail (add/view notes, agents + admins)
- [ ] Register /listings and /listings/:id routes in App.tsx
- [ ] Add Listings to sidebar nav (Admin + Agent)

### Transaction Flow Overhaul
- [ ] Step 1: Buy / Sell / Dual type selector (before contact/property selection)
- [ ] Sell flow: link to existing listing lookup (search by address/contact), or add new listing inline
- [ ] Dual flow: separate buyer contact + seller contact (different people, never same contact)
- [ ] All flows: contact lookup with create-if-not-found inline option
- [ ] All flows: property lookup with create-if-not-found inline option
- [ ] Field formatting throughout: $ for prices, phone number masking (xxx) xxx-xxxx, email validation
- [ ] Data validation: required fields, format checks, date logic (close date must be after contract date)
- [ ] Fix commission rate display: 0.03 should show as 3%, not 0.0300%

### Transaction Document Uploads
- [ ] Schema: transaction_documents table (id, transactionId, uploadedBy, label, customLabel, fileUrl, fileKey, fileName, fileSize, mimeType, createdAt)
- [ ] DB migration: create transaction_documents table
- [ ] Backend: transaction documents router (upload to S3, list, delete)
- [ ] Upload UI on transaction detail: file picker, label selector (Appraisal / Closing Disclosure / Home Inspection / Other), custom label input when Other selected
- [ ] Document list on transaction detail: filename, label, uploader, date, download link, delete (admin only)

### Transaction Notes
- [ ] Schema: transaction_notes table (id, transactionId, authorId, content, createdAt)
- [ ] DB migration: create transaction_notes table
- [ ] Backend: transaction notes router (add, list)
- [ ] Notes section on transaction detail page (agents + admins can add/view)

### Listing Notes
- [ ] Notes section on listing detail page (agents + admins can add/view)
- [ ] Backend: listing notes router (add, list)

### ISA Funnel Analytics
- [x] Backend: ISA funnel query (count contacts by isa_status, grouped by assignedIsaId)
- [x] Analytics page: ISA Funnel tab with bar chart broken down by ISA and stage

### Bulk ISA Assignment
- [x] All Contacts page: checkbox column for row selection
- [x] Bulk action toolbar: appears when rows selected, shows "Assign ISA" dropdown
- [x] Backend: bulk update assignedIsaId procedure (admin + ISA only)

### Resend Transactional Emails
- [ ] Audit all existing transactional email sends in codebase (identify Manus-sent emails)
- [ ] Replace with Resend API calls using branded HTML templates
- [ ] Email types to implement: welcome/invite, task assigned, commission payout notification, transaction created, transaction status changed, listing created
- [ ] Trigger all email types to Tyler for design review after implementation

## v11.6 — Resend Emails, Listing Detail, Commission Rate Fix

### Commission Rate Display Fix
- [x] Fix commission rate display: stored 0.03 should display as 3%, not 0.0300%

### Resend Transactional Emails
- [x] Audit all existing email sends in codebase
- [x] Build branded HTML email templates (lead assigned, task assigned, transaction created, transaction status changed, transaction closed, commission payout, listing created, task due, payout integrity fail)
- [x] All emails use Resend API via savvy-agents.com verified domain
- [x] Triggered all 9 email types to Tyler@savvy.realty for design review
- [x] Added Email Test page (admin-only) at /email-test for re-triggering

### Listing Detail Page
- [x] Build /listings/:id route and ListingDetail page
- [x] Editable fields: list price, listing date, expiration date, MLS number, notes
- [x] Status actions: Terminate, Mark Expired buttons (with confirmation dialogs)
- [x] Convert to Contract button (opens dialog pre-filled with listing contact + list price)
- [x] Notes section: add/view notes (agents + admins)
- [x] Register /listings/:id route in App.tsx
- [x] Link listing rows in ListingsPage to detail page via Details button

## v11.7 — Listing Detail Contact/Property Editing

- [x] ListingDetail: add contact search/change UI (search existing, create new inline) in the Seller card
- [x] ListingDetail: add property search/change UI (search existing, create new inline) in the Property card
- [x] ListingDetail: update handleUpdate to send contactId and propertyId when changed
- [x] ListingsPage create modal: require contact (validation error if not selected/created)
- [ ] ListingsPage create modal: require property (validation error if not selected/created — property is optional by design)

## v11.8 — Listing Convert Pre-fill + Expiration Reminder Emails ✅

- [x] ListingDetail: pre-fill propertyId on convertToTransaction call when listing has a linked property (handled server-side in convertToTransaction procedure)
- [x] ListingsPage: pre-fill propertyId on convertToTransaction call when listing has a linked property (handled server-side)
- [x] Backend: convertToTransaction procedure passes propertyId to createTransaction
- [x] Add listing_expiration_reminder email type to resendEmail.ts (branded HTML template with amber color scheme)
- [x] Backend: checkExpiredListings procedure — finds active listings where expirationDate < today, emails the agent
- [x] Scheduler: daily cron at 8am calls checkExpiredListings; also runs 15s after startup
- [x] Prevent duplicate emails: track lastExpirationReminderSent on listings table (DB column + schema updated)
- [x] Email Test page updated to include listing_expiration_reminder (10 types total)

## v11.9 — Logo Colors, Email Redesign, Expiration Badges ✅

- [x] Extract exact colors from Savvy logo: #0fc0df (cyan) → oklch(0.74 0.130 215.1)
- [x] Update site-wide CSS variables in index.css to match logo colors (hue 215 throughout, exact brand cyan)
- [x] Redesign all 10 email templates: white background, Savvy logo at top, thin cyan accent bar, clean minimal layout
- [x] Add expiration warning badge to Listings page: red "Expired" badge + AlertTriangle for past-due active listings
- [x] Add amber "Xd" countdown badge for listings expiring within 7 days

## v11.10 — Smart Plan Trigger Lead Source UI

- [x] Add trigger lead source multi-select to Smart Plan details form (currently missing from UI)
- [x] Add trigger scope selector (New Only / New + Existing / Manual) to details form
- [x] Show selected lead sources as removable badges in the details panel
- [x] Show trigger lead source info on the plan detail view (now shows all sources from triggerLeadSourceIds)
- [x] Backend list procedure now returns triggerLeadSources array with names for all plans
- [x] Plan cards on the list page now show all trigger sources (multi-source support)

## v11.11 — Smart Plan Enrollment Drill-Down & Step Preview ✅

- [x] Backend: enrollments.list now returns currentStep details (subject, channel, stepOrder) and totalSteps for each enrollment
- [x] Enrollment modal: shows contact name, email, current step # with subject/channel icon, next send date (with overdue warning), status
- [x] Enrollment modal: "Unenroll" button to cancel active enrollments
- [x] Frontend: "Preview" (Eye icon) button on each step card in the step editor
- [x] Step preview modal: renders email with Savvy logo header in iframe (exactly as sent) or SMS bubble view
- [x] Step preview modal: merge tags filled with example values (Alex Johnson / Zillow)

## v11.12 — Email Test, Termination Reason, Org Chart, Markets, Agent Profile, Task Pagination

### Email Test Page
- [ ] Add individual "Send" button next to each email type (in addition to "Send All")
- [ ] Each individual button sends only that one email type to Tyler@savvy.realty

### Termination Reason Modal
- [ ] When transaction status is changed to "Terminated", show a modal asking for termination reason
- [ ] Add termination reason as a transaction note with label "Termination Reason"
- [ ] Backend: accept optional terminationReason on status update procedure

### User Management — New Fields
- [ ] DB: add reportsToId (FK to users), phone, title columns to users table
- [ ] User create/edit form: add "Reports To" dropdown (other users), phone field, title field
- [ ] Backend: update user create/update procedures to accept new fields

### Markets Page
- [ ] DB: create markets table (id, name, createdAt)
- [ ] Backend: markets router (list, create, update, delete)
- [ ] Markets page: list view with add/edit/delete, accessible from Admin nav
- [ ] Add Markets to admin sidebar nav

### Agent Market Assignment
- [ ] DB: add marketId FK to users table
- [ ] User create/edit form: add Market dropdown (with inline "Add Market" option)
- [ ] Backend: include marketId in user create/update

### Org Chart Page
- [ ] Build /org-chart page showing all users with title, phone, market, and hierarchy
- [ ] Hierarchy based on reportsToId (tree structure)
- [ ] Show in both Admin nav and Agent nav
- [ ] Each node shows: avatar/initials, name, title, phone, market

### Agent Profile Page
- [ ] Build /agents/:id page with full agent profile
- [ ] Sections: analytics (GCI, closed deals, active pipeline), transactions list, contact assignments, tasks
- [ ] Link agent name on All Tasks admin page to /agents/:id
- [ ] Link agent name on All Contacts admin page to /agents/:id
- [ ] Add to admin nav or accessible via click-through

### All Tasks Pagination
- [ ] Backend: tasks.list procedure — add pagination (page, pageSize=50), return total count
- [ ] All Tasks page: server-side pagination with page controls
- [ ] Answer: without pagination, 30,000 tasks would crash the browser tab (JS heap + DOM nodes)

## v11.12 — Completed Items ✅

- [x] Email Test Page: individual "Send" button next to each email type (already existed from v11.6)
- [x] Termination Reason Modal: modal captures reason when status changes to "Terminated", adds as note
- [x] User Management — New Fields: reportsToId, phone, title, marketId added to users table + forms
- [x] Markets Page: markets table, router, CRUD page, admin nav link
- [x] Agent Market Assignment: marketId FK on users, user create/edit includes market dropdown
- [x] Org Chart Page: /org-chart hierarchical tree, admin nav link
- [x] Agent Profile Page: /agents/:id with agent info, GCI stats, transactions, contacts, tasks tabs
- [x] All Tasks Pagination: tasks.listAll now paginated (50/page), page controls in TasksPage
- [x] Agent profile links from Tasks page (click assigned agent name → /agents/:id)
- [x] Markets and Org Chart added to admin sidebar nav

## Bug Fix — Transaction Detail "Invalid time value"
- [x] Fix RangeError: Invalid time value on /transactions/:id page (e.g. /transactions/60002)
- [x] Add safeFormat utility to prevent Invalid time value crashes across all pages (18 files + 1 component updated)

## Org Chart Hierarchy Fix
- [x] Tyler Coon (owner) always displayed at the top of the org chart
- [x] Exclude users who don't have a "Reports To" assignment (except Tyler/owner)
- [x] Display proper tree hierarchy based on reportsToId relationships
- [x] Show "Not in Org Chart" section for unassigned users with dashed-border cards

## Termination Reason Display
- [x] Investigate how termination reason is stored (note vs dedicated field)
- [x] Add terminationReason column to transactions table (schema + migration)
- [x] Save terminationReason to dedicated field when terminating (in addition to note)
- [x] Display termination reason prominently on terminated transaction detail page (red banner)
- [x] Show termination reason on transaction list/table for terminated transactions (inline under status badge)
- [x] Backfill existing terminated transaction with reason from notes

## v11.13 — Agent Links, Agent Analytics Tab, Market Filtering
- [x] Clickable agent names on Contacts page linking to /agents/:id
- [x] Analytics tab on Agent Profile page with monthly GCI trend chart
- [x] Analytics tab: closed deals over time chart
- [x] Analytics tab: lead source breakdown for the agent
- [x] Analytics tab: transaction type breakdown for the agent
- [x] Market filter dropdown on Contacts page
- [x] Market filter dropdown on Transactions page

## v11.14 — Transaction Search & Market Performance Dashboard
- [x] Add text search bar to Transactions page (search by transaction number, contact name, property)
- [x] Status filter now also resets page and filters server-side
- [x] Create Market Performance dashboard page with aggregate GCI, deal count, agent count per market
- [x] Add Market Performance page to admin sidebar navigation
- [x] Market comparison table with GCI, volume, avg deal size per market
- [x] GCI distribution pie chart across markets
- [x] Monthly GCI trend chart (filterable by market)
- [x] Agent leaderboard when specific market is selected

## v11.15 — Transaction Reporting, Bug/Feature Requests, Task Revamp

### Transaction Reporting
- [x] Create Transaction Reporting page with advanced filters (status, agent, under contract date range, closing date range)
- [x] Flag transactions with no closing date
- [x] Flag transactions past current closing date
- [x] Add Transaction Reporting to admin sidebar
- [x] CSV export for transaction reports
- [x] Market filter on reporting page

### Bug/Feature Request System
- [x] Create feedback table in DB (type: bug/feature, title, description, userId, status, adminNotes)
- [x] Add "Report a Bug" / "Request a Feature" link on all dashboards (agent, ISA, admin)
- [x] Create admin Feedback Review page to approve/deny/review submissions
- [x] Add Feedback Review to admin sidebar with pending count badge

### Task Revamp
- [x] Split tasks into "All Tasks" (admin) and "My Tasks" tabs on Tasks page
- [x] Admin cannot mark tasks complete for other users
- [x] Create Task Detail page with notes (/tasks/:id)
- [x] Create task_notes table in DB
- [x] Add task notes CRUD (add/view notes per task)
- [x] Clickable tasks that open task detail
- [x] getById procedure for efficient single-task loading
- [x] Admin sidebar shows "All Tasks" label

## v11.16 — Commission Structure & Auto-Payout Calculation

### Schema Updates
- [x] Add commissionSplit field to users table (50, 60, 70, 80 for agents)
- [x] Add leaderSplitOverride field to group_members table (per-agent group leader %, 10/20/30)
- [x] Add referralPercent field to lead_sources table (5, 10, 15, 20, 25, 30 for referral partner sub-sources)
- [x] Add referralFeePaidBy field to transaction_payout_items (savvy, agent, split, group_leader)
- [x] Add leaderCommissionSplit field to groups table (default group leader %, 10/20/30)
- [x] Add isProtected field to lead_sources (Referral Partner + sub-sources marked protected)
- [x] Add referral_partner to payeeType enum on transaction_payout_items

### Commission Calculation Engine
- [x] Solo agent calculation: Agent % + Savvy % = 100%
- [x] Group agent calculation: Agent % + Group Leader % + Savvy % = 100% (before referral)
- [x] Referral fee calculation for solo agents (50/50 → Savvy pays all up to 30%; 60/40 → agent pays 10%, Savvy up to 20%; 70/30 → agent pays 20%, Savvy up to 10%; 80/20 → agent pays all)
- [x] Referral fee calculation for group agents (Savvy min 20%, agent min 50%, split the difference)
- [x] Group leader 30%: group leader pays all referral fees up to 30%
- [x] Flag for review if Savvy makes less than 20% on any deal
- [x] 23 unit tests passing covering all scenarios from Tyler's tables

### UI Updates
- [x] Groups page: add group leader commission split setting (10/20/30%), per-agent override in Manage Members dialog
- [x] Lead Sources: add referral % to Referral Partner sub-sources (5-30% options)
- [x] Make "Referral Partner (Leads in)" source and its sub-sources undeletable (isProtected flag)
- [x] Show Protected badge and hide delete button on protected sources
- [x] Referral % badge displayed on sub-source rows
- [x] Auto-generate payout items when transaction is created (with commission engine)
- [x] Transaction detail: show referral fee responsibility (who pays what) — blue badge on payout items
- [x] Commission structure settings on user profile (agent split % — 50/60/70/80)
- [x] Commission split column on Users table
- [x] Commission split dropdown on Add/Edit User form (shows only for agents)

## v11.17 — Bug Fixes & Improvements
### Email Branding
- [x] Verified all Resend emails use Savvy branding (from: Savvy STR Agents <notifications@savvy-agents.com>)
- [x] All email types confirmed sending correctly via Resend API
- [x] Note: Manus platform notifications (noreply) are separate — disable in Settings > Notifications

### Contact Search Performance
- [x] Fix contact search on "Add a new listing" page — increased search limit from 25 to 50 results
- [x] Increased contact search limit on transactions page from 15 to 50 results
- [x] Contact search uses server-side LIKE query which scales to 30k+ contacts

### Transaction Status
- [x] Remove "active" status from transactions — only under_contract, closed, terminated
- [x] New transactions default to "under_contract" status (schema default + frontend)

### Transaction Filters
- [x] Add "Filter by agent" on the transactions page (already existed)
- [x] Add filter for closing date on transactions page (already existed)
- [x] Add filter for under contract date on transactions page (already existed)

### Listing Filters & Termination
- [x] Add filter by agent on listings page
- [x] Add filter for listing date, expiration date on listings page
- [x] When listing changed to terminated, require termination date submission (termination dialog with date picker)

### Property Creation from Listings
- [x] Verified property creation flow works correctly (createProperty → get ID → pass to listing create)
- [x] Property links correctly to listing after creation

### Listing-to-Transaction Conversion
- [x] Listing conversion defaults to "seller" transaction
- [x] Allow "dual" transaction type for listing conversion (dropdown with seller/dual options)
- [x] "buyer" alone is not available when converting from a listing

### Transaction Detail Editing
- [x] Make all transaction information editable on the transaction detail page (comprehensive edit dialog)

## v11.18 — Bug Fixes & Improvements
### Market Performance
- [x] Fix Market Performance page showing "no markets" when markets exist in the database (SQL ORDER BY alias error + removed stale 'active' status references)

### Admin Nav Cleanup
- [x] Remove "Documents" link from admin left-hand nav panel

### Document Management on Transactions
- [x] Fix document delete error on transaction detail page (fixed nested data access: row.doc vs row)
- [x] Show document label/category (e.g. "Appraisal") on uploaded documents (styled badge with primary color)
- [x] Add ability to rename documents (inline rename with Save/Cancel, backend mutation added)
- [x] Add ability to view documents (open/preview via Eye icon button)
- [x] Add ability to download documents (Download icon button)

## v11.19 — Bug Fixes & Improvements

### Lead Source Filters
- [x] Add lead source filter dropdown to contacts page
- [x] Add lead source filter dropdown to pipelines page

### My Tasks Navigation & Filtering
- [x] Split "All Tasks" and "My Tasks" into two separate links in admin nav
- [x] Fix "My Tasks" to only show tasks assigned to the logged-in user (uses assignedToId filter via listAll)

### Transaction History — Payout Details
- [x] Show actual payout values (percentage, amount, agent) in transaction history
- [x] Record payout edits in transaction history with old and new values

### Document Count Badge
- [x] Show document count (#) next to the Documents tab in transaction detail page

## v11.20 — Feature Additions & Improvements

### Lead Source Filter on Transactions
- [x] Add lead source filter dropdown to transactions page

### Transaction Date Filters
- [x] Add closing date filter to transactions page (already existed)
- [x] Add under contract date filter to transactions page (already existed)

### My Tasks — Create Task Button
- [x] Add "Create Task" button on the My Tasks page

### Lead Source Display on Contacts
- [x] Show lead source name on the contacts list/detail page (resolved from leadSources query)

### History Logging — Before/After Values
- [x] Fix contact history: show lead source name from/to (resolved at write time in backend)
- [x] Fix transaction history: show before/after values for all field changes (status, type, agent, contacts, dates)

### Group Leader Commission Page
- [x] Add group leader commission page on agent dashboard for group leaders

### Listing Validation
- [x] Require list price, expiration date, and list date when creating a listing (frontend validation with toast)

### Listing History
- [x] Add history/activity log to listings (listed, terminated, converted, etc.)
- [x] Show termination date on listing page when listing is terminated

### Property Associations
- [x] Show associated transactions, listings, and contacts on the Properties detail page

## v11.21 — Onboarding Portal

### Database Schema
- [x] Create onboarding_templates table (id, name, description, createdAt)
- [x] Create onboarding_template_tasks table (id, templateId, title, description, assignee: admin/agent, sortOrder)
- [x] Create onboarding_instances table (id, agentUserId, templateId, status: in_progress/completed, startedAt, completedAt)
- [x] Create onboarding_instance_tasks table (id, instanceId, templateTaskId, title, description, assignee, completed, completedAt, completedByUserId)

### Backend Routes
- [x] CRUD for onboarding templates (admin only)
- [x] CRUD for template tasks within a template
- [x] Create onboarding instance when agent is added with template selected
- [x] Query onboarding instances with progress for admin tracker
- [x] Query agent's own onboarding tasks
- [x] Toggle task completion (admin or agent depending on assignee)

### Admin — Onboarding Templates Page
- [x] List all templates with task count
- [x] Create/edit template with inline task management
- [x] Delete template (if not in use)

### Agent Creation Integration
- [x] Add checkbox "Start onboarding" and template dropdown to agent creation form
- [x] Auto-create onboarding instance with tasks when agent is created with template

### Admin — Onboarding Tracker Page
- [x] List all active onboarding instances with agent name and progress bar
- [x] Click into an instance to see task checklist and mark admin tasks complete
- [x] Show completed onboarding history

### Agent — Onboarding Page
- [x] Show onboarding checklist on agent dashboard until complete
- [x] Agent can mark their assigned tasks as complete
- [x] Show progress bar and completion status
- [x] Add "Onboarding" link to agent nav

## v11.22 — Onboarding Enhancements

### Due Dates on Onboarding Tasks
- [x] Add dueDaysOffset column to onboarding_template_tasks (relative days from onboarding start)
- [x] Add dueDate column to onboarding_instance_tasks (computed absolute date when instance is created)
- [x] Update template task CRUD UI to allow setting relative due days
- [x] Update instance task creation to compute absolute due dates from start date + offset
- [x] Show due dates on admin tracker task detail view with overdue highlighting
- [x] Show due dates on agent onboarding checklist with overdue highlighting

### Conditional Onboarding Nav Link
- [x] Add backend query to check if agent has active (in_progress) onboarding instance
- [x] Conditionally show "Onboarding" link in agent nav only when active instance exists
- [x] Hide "Onboarding" link once onboarding is completed

## v11.23 — Onboarding Enhancements (Part 2)

### 1. Overdue Onboarding Task Email Alerts
- [x] Add backend function to find overdue onboarding tasks (dueDate < now, not completed)
- [x] Send email alerts to admin and agent when tasks become overdue
- [x] Add tRPC procedure to manually trigger overdue check or integrate with existing scheduler
- [x] Include task title, agent name, due date, and days overdue in email

### 2. Bulk Due Date Management for Admins
- [x] Add backend procedure to bulk extend due dates on an onboarding instance (shift all by N days)
- [x] Add backend procedure to update individual instance task due dates
- [x] Add UI controls on Onboarding Tracker detail view for bulk extend and per-task date editing
- [x] Validate that only admins can perform bulk operations

### 3. Onboarding Completion Summary/Report
- [x] Add backend procedure to compute onboarding metrics (avg time-to-complete, per-agent stats, overdue rates)
- [x] Create OnboardingReportPage with summary cards and per-agent breakdown table
- [x] Add route and nav link for the report page (admin only)
- [x] Show metrics: avg completion time, on-time rate, overdue task count, per-agent details

## v11.24 — Offboarding & Template Type Support

### Template Type (On/Offboarding)
- [x] Add `type` column to onboarding_templates (enum: onboarding, offboarding)
- [x] Update template CRUD UI to show type selector and rename labels to "On/Offboarding Lists"
- [x] Rename nav links from "Onboarding Templates" to "On/Offboarding Lists"
- [x] Rename "Onboarding Tracker" to "On/Offboarding Tracker"
- [x] Rename "Onboarding Report" to "On/Offboarding Report"
- [x] Update all page headers and references accordingly

### Offboard Button on Agent Profile
- [x] Add "Offboard Agent" button to agent profile page (admin only)
- [x] Create template selection dialog that filters to offboarding templates
- [x] Wire up to existing createInstance procedure to create an offboarding instance
- [x] Show offboarding status on agent profile if active

## v11.25 — User Activate/Deactivate

- [x] Add `isActive` column to users table (default true)
- [x] Add backend procedure to toggle user active status (admin only)
- [x] Protect tyler@savvy.realty from being deactivated
- [x] Add activate/deactivate button on agent profile page
- [x] Show visual indicator on profile when user is deactivated
- [x] Prevent deactivated users from logging in (block at auth context)
- [x] Show deactivated status on agent list/cards
- [x] Write tests for activate/deactivate procedures and protection

## v11.26 — Nav Visibility Fixes

- [x] Restrict "Group Leader Commissions" nav link to group leaders only (hide for regular agents/ISAs)
- [x] Add backend query to check if current user is a group leader
- [x] Add "Org Chart" nav link to agent and ISA dashboards

## v11.27 — Nav, ISA, and Contact Page Fixes

- [x] Add group leader badge on agent profile page
- [x] Add server-side guard on group leader commissions page (block non-leaders)
- [x] Add back-link from Org Chart to agent profile pages (admin only)
- [x] Block ISA from clicking/opening transaction detail pages
- [x] Move ISA pipeline status section higher on the contact detail page
- [x] Fix contact page formatting for ISA view
- [x] Add "Add Task" button to contact page on ISA dashboard

## v11.28 — Contact Page, ISA Fixes, Agent Profile, Leadership 1-on-1

### Contact Page Layout
- [x] Compact left column cards — reduce padding/whitespace, combine small cards
- [x] Collapse spouse/partner card into primary contact card when present
- [x] Tighten up Agent Connections and Notes cards

### ISA Add Task Fixes
- [x] Default "Assigned To" in Add Task dialog to the logged-in ISA user
- [x] Fix task creation to properly link the task to the current contact (relatedContactId)

### ISA Org Chart Fix
- [x] Fix "Unable to determine organization owner" error for ISA role

### ISA Task Count Fix
- [x] Fix ISA dashboard task count — /my-tasks and dashboard should show same count
- [x] Fix ISA nav "My Tasks" link to point to /tasks instead of /my-tasks

### Agent Profile Role-Gating
- [x] Hide "Offboard Agent" button for non-agent roles (admin, ISA profiles)
- [x] Hide GCI/transaction analytics section for non-agent roles

### Leadership 1-on-1
- [x] Add leadership_feedback table (agentId, adminId, date, notes, rating, followUpDate)
- [x] Add backend procedures: createFeedback, listFeedback (per agent)
- [x] Add "Leadership 1-on-1" button on agent profile (admin only)
- [x] Create feedback dialog with fields: date, notes, rating, follow-up date
- [x] Add "Leadership History" tab on agent profile showing all past feedback entries

## v11.29 — Leadership Dashboard, Commission Exceptions, Bug Fixes

### Leadership Dashboard
- [x] Add backend procedure to list all 1-on-1 sessions across all agents with filters (date range, rating, agent)
- [x] Create LeadershipDashboardPage with summary cards and per-session table
- [x] Add nav link under Operations (admin only)

### Commission Exception Request
- [x] Add commission_exceptions table (transactionId, agentId, requestedSplit, reason, status, adminNote)
- [x] Add backend procedures: requestException (agent), listExceptions (admin), approveException, denyException
- [x] Add "Request Exception" button on agent Transaction detail page with form
- [x] Create CommissionExceptionsPage for admin (list, approve/deny, edit commission)
- [x] Guardrails: never allow total > 100%, warn if agent < 50% or Savvy < 20%
- [x] Send email to tyler@savvy.realty if agent < 50% or Savvy < 20% on approval
- [x] Add nav link for CommissionExceptionsPage (admin only)

### Transaction Notes Fix
- [x] Fix transaction notes to show date, author name, and note text
- [x] Investigate why notes show name but no date/text

### Transactions Table Cleanup
- [x] Show only property address under "Transaction" column (remove transaction number)

### Listings Table Cleanup
- [x] Compact the Listings table rows — address should not make rows tall

### ISA Contact Page Add Task
- [x] Add "Add Task" button to contact detail page (ISA view)

## v11.30 — Commission, AI Summary, Bug Fixes

### Commission Exceptions Nav Badge
- [ ] Add pending count query to commissionExceptions router
- [ ] Show (#) badge on "Commission Exceptions" nav link when pending requests exist

### Protect Paid Payouts
- [ ] Block edit/delete of payout items with status="paid" on backend
- [ ] Hide edit/delete buttons for paid payout items on frontend

### Commission Scoping Fix
- [ ] Fix "My Commissions" for agents to show only their own agent payout items (not group leader items)
- [ ] Verify Group Leader Commissions shows only group leader payout items

### Listing Details Crash Fix
- [ ] Fix TypeError: Cannot read properties of undefined (reading 'replace') on ListingDetail for agents

### Properties Page — Contacts
- [ ] Add contacts/owners section to properties page showing linked contacts
- [ ] Clean up the transactions tab on the property detail page

### Lead Source on Contact Page
- [ ] Add lead source display to the contact detail page

### Onboarding Report Fix
- [ ] Fix /onboarding-report page that keeps loading/spinning

### Nav Count Badges
- [ ] Add transaction count badge to "All Transactions" nav link
- [ ] Add transaction count badge to "Transaction Reporting" nav link
- [ ] Add transaction count badge to "Payout Report" nav link

### Commission Page Cleanup
- [ ] Remove full transaction list from Commission & Payouts page
- [ ] Keep only transactions with integrity flags/issues on that page

### AI Contact Summary
- [ ] Add contact_ai_summaries table (contactId, summary, generatedAt)
- [ ] Add backend procedure to generate AI summary (notes, tasks, transactions, agents, buy boxes)
- [ ] Write a rich prompt covering: who is the lead, what they want, last contact, next outreach, history
- [ ] Cache summary for 1 week; auto-regenerate if stale
- [ ] Add AI Summary tab/card to contact detail page

## Latest Batch Completed
- [x] Admin can edit commissions on "Not Paid" payout items (PayoutReportPage edit dialog)
- [x] "Paid" payout items are protected from edit/delete on both backend and frontend
- [x] Listing Details crash fixed (payeeType.replace on undefined)
- [x] Lead source full name (parent › child) shown on contact detail page
- [x] Onboarding report FORBIDDEN error fixed (ISA users can view commission exceptions)
- [x] Nav count badges added for Transaction Reporting (flagged) and Payout Report (unpaid)
- [x] All-transactions list removed from Commission & Payouts page (only flagged shown)
- [x] AI Summary tab added to contact detail page with 7-day cache and force-refresh
- [x] aiSummary and aiSummaryUpdatedAt columns added to contacts table
- [x] Rich AI prompt covers: who the lead is, buy box, last contact, agents/ISAs, tasks, transactions, next outreach

## Fixes (Latest Batch - March 20)
- [ ] Agent-scoped listings: agents see only their own listings
- [ ] Pre-apply flagged filter on Transaction Reporting page when navigating from nav badge
- [ ] Duplicate contact detection on create (email + phone check with warning UI)
- [ ] User profile document upload: DB table, S3 storage, upload/list/delete procedures
- [ ] User profile document upload: Documents tab UI on AgentProfilePage (admin-only upload)
- [ ] Document category dropdown on upload dialog
- [ ] Document count badge on Users list page
- [ ] Expand user profile fields: core identity, address, HR, lifecycle, agent-specific, ISA-specific, admin-specific

## Analytics Overhaul (March 20 - ChatGPT Integration)
- [x] Executive Dashboard: MTD/YTD KPI cards, efficiency metrics (pipeline value, revenue/lead, revenue/agent, pipeline coverage), period-over-period trend cards (WoW, MoM, YoY), 12-month GCI trend chart
- [x] Sales Funnel tab: stage-by-stage conversion funnel with drop-off rates and avg days per stage
- [x] Lead Source ROI tab: revenue, closings, conversion rate, cost-per-close per lead source with bar charts
- [x] Pipeline Health tab: pipeline value card, stalled deals, aging distribution chart, avg days per stage breakdown
- [x] Agent Production tab (admin-only): agent leaderboard table with GCI, closings, pipeline, conversion rate
- [x] ISA Performance tab (admin-only): ISA metrics - contacts assigned, qualified, conversion rate, avg response time
- [x] Markets tab (admin-only): market comparison table and monthly GCI trend by market
- [x] AI Insights tab (admin-only): LLM-powered anomaly detection, opportunity surfacing, coaching recommendations
- [x] Universal period filter (MTD, QTD, YTD, Last 30/60/90 days, Last 12 months)
- [x] Fixed aging buckets GROUP BY CASE expression (MySQL parameterization issue)
- [x] Fixed DATE_FORMAT GROUP BY parameterization in monthly trend queries

## Goal Tracking (March 20)
- [ ] Add agent_goals table (agentId, year, month, gciTarget, closingsTarget, volumeTarget)
- [ ] Schema migration via webdev_execute_sql
- [ ] DB helpers: upsertAgentGoal, getAgentGoals, getAgentProductionWithGoals
- [ ] tRPC procedures: goals.set, goals.list, goals.getProductionWithGoals
- [ ] Agent Production tab: progress bars (GCI vs target, closings vs target)
- [ ] Admin goal-setting dialog: set targets per agent per month
- [ ] Bulk goal-setting: set same target for all agents at once

## Goal Tracking (March 2026)
- [x] agent_goals table created in DB (agentId, year, month, gciGoal, closingsGoal, volumeGoal)
- [x] DB helpers: getAgentProductionWithGoals, setAgentGoal, setGoalsForAllAgents
- [x] tRPC procedures: analytics.agentProductionWithGoals, analytics.setAgentGoal, analytics.setGoalsForAllAgents
- [x] Agent Production tab: year/month period selectors
- [x] Set Goals dialog per agent (GCI, Closings, Volume targets)
- [x] Set Goals for All button (bulk goal assignment)
- [x] Progress bars showing actual vs target per agent
- [x] Goals Set counter in summary cards
- [x] Vitest tests: 10 tests passing

## Agent Goal View (March 2026)
- [x] tRPC procedure: analytics.myGoals (returns current user's own goals + production)
- [x] MyGoals component with progress bars for GCI, Closings, Volume
- [x] Integrate MyGoals into agent personal dashboard
- [x] Vitest tests for myGoals procedure (14 tests passing)

## My Goals Period Toggle (March 2026)
- [x] Annual / This Month toggle on My Goals card
- [x] Both periods fetched and cached; switch is instant (no re-fetch)
- [x] Period label updates in card header

## Pace Indicator (March 2026)
- [x] Compute expected progress % based on elapsed time in period
- [x] Show "on pace", "X% ahead", or "X% behind" label on each goal bar
- [x] Annual: elapsed days / 365; Monthly: elapsed days / days-in-month
- [x] Color-coded: green = on pace or ahead, amber = slightly behind, rose = significantly behind

## Projected Close Date / Year-End Projection (March 2026)
- [x] Compute projected final value at year-end based on current velocity
- [x] Show "On track to hit goal by [date]" when ahead of pace
- [x] Show "At current pace, you'll reach X% by year-end" when behind
- [x] Show "Goal hit!" when already at 100%

## Market Match Call Feature (March 20, 2026)
- [x] DB schema: market_profiles, market_agent_assignments, market_case_studies, market_match_sessions tables
- [x] marketMatch.db.ts helpers: getAllMarketProfiles, upsertMarketProfile, createMarketMatchSession, updateMarketMatchSession, completeMarketMatchSession, getContactCallContext
- [x] marketMatchRouter tRPC procedures: listMarkets, upsertMarket, deleteMarket, startSession, updateSession, generateRecommendations, generateCallSummary, completeSession, getSessionsForContact
- [x] MarketMatchCallPage: contact search screen, live call workspace (investor profile, call notes, AI coaching, AI recommendations panels), end-of-call summary
- [x] MarketMatchConfigPage: admin market configuration (add/edit markets, buy boxes, talking points, agent assignments, case studies)
- [x] Nav items added to ISA and Admin sidebars
- [x] 13 vitest tests passing

## Call History & Email Intro (March 20, 2026)
- [ ] DB helper: getCallHistoryForContact (returns past sessions with top market matches)
- [ ] DB helper: getRecentCallSessions (ISA-level, paginated)
- [ ] tRPC procedure: marketMatch.callHistory (list sessions for contact)
- [ ] tRPC procedure: marketMatch.recentSessions (ISA recent calls)
- [ ] tRPC procedure: marketMatch.sendAgentIntroEmail (send intro email investor <> agent)
- [ ] Call History tab on MarketMatchCallPage with session cards and detail drawer
- [ ] Email Intro button on end-of-call summary (fires after agent is selected in top recommendation)
- [ ] Email Intro checkbox on each market recommendation card (pre-call and post-call)

## Call History & Email Intro (March 20, 2026)
- [x] Call History tab on Market Match Call page (New Call / Call History pill toggle)
- [x] Expandable session cards with contact name, date, duration, confidence score, top market
- [x] Session detail view: top 3 market matches, investor profile badges, call summary, next action
- [x] Email Intro section on end-of-call summary screen
- [x] Agent selector dropdown (fetches all agents via users.list)
- [x] "Also send a copy to the investor" checkbox
- [x] Send Intro Email button with loading state and success confirmation
- [x] market_match_intro email template added to resendEmail.ts
- [x] sendAgentIntroEmail tRPC procedure in marketMatch router
- [x] recentSessions tRPC procedure in marketMatch router
- [x] 11 vitest tests passing

## Market Match Call Entry Point Refactor (Mar 20)
- [x] Remove Market Match Call from ISA sidebar nav
- [x] Remove Market Match Call from Admin sidebar nav
- [x] Add "Match" button to contact list row (ISA + admin only)
- [x] Add "Market Match Call" button to ContactDetail page header (ISA + admin only)
- [x] Auto-start session when contactId is passed via URL query param
- [x] Loading overlay while auto-start is pending

## Market Match Call UX Overhaul (Mar 20)
- [ ] Investor Profile + Call Notes side-by-side in live call workspace
- [ ] Compact investor profile form (dropdowns side-by-side, reduce vertical scroll)
- [ ] Lender Intro button when Financing Type = conventional or dscr
- [ ] Lender Intro email sends from ISA email, CCs lender
- [ ] Admin Lender Recommendation settings (lender email + email template editor)
- [ ] Merge Markets reporting page into Market Match Config (unified admin page with tabs)

## Market Match Hub Overhaul (Complete)
- [x] Restructure live call workspace: investor profile + call notes side-by-side
- [x] Compact form layout: dropdowns in 2-column pairs to reduce vertical scrolling
- [x] Lender Intro button appears when DSCR or Conventional financing is selected
- [x] Lender config DB table (lender_config) created and migrated
- [x] Admin Lender Settings tab in Market Match Hub with Add/Edit/Delete lenders
- [x] sendLenderIntroEmail tRPC procedure with template variable substitution
- [x] Merge Markets + Market Performance + Market Match Config into unified Market Match Hub
- [x] Market Match Hub has 3 tabs: Market Profiles, Performance, Lender Settings
- [x] Remove old Markets and Market Performance nav items from admin sidebar
- [x] Rename Market Match Config to Market Match Hub in admin nav
- [x] 12 vitest tests passing for Market Match Hub

## Bug Fixes (March 20)
- [ ] Fix ISA Performance tab React #310 crash (invalid useMemo)
- [ ] Hide Market and agent-onboarding fields for ISA role in user form
- [ ] Invalidate/refetch user list after adding a new user (no page refresh needed)

## Bug Fixes — March 20
- [x] Fix ISA Performance tab React error #310 (hooks after early return)
- [x] Hide Market field for ISA/Admin roles in user form (agent only)
- [x] Restrict onboarding checkbox to agent role only
- [x] Fix user list not refreshing after add/edit/delete (wrong cache key)

## Market Match Hub — Profile Editor Overhaul
- [x] Fix input focus-loss bug (caused by inline Section component defined inside render)
- [x] Replace market profile modal with full-page multi-step editor (/market-profile/new, /market-profile/:id)
- [x] Step 1: Basic Info (name, state, region, status, budget, vibe tag)
- [x] Step 2: Investor Fit (profiles, property details, scoring weights)
- [x] Step 3: Talking Points, Objections, Notes
- [x] Auto-save draft to localStorage so progress is not lost on navigation
- [x] Back button returns to Market Match Hub with unsaved-changes warning

## Market Match Hub — Lender Editor Overhaul
- [x] Replace lender modal with full-page editor (/lender-editor/new, /lender-editor/:id)
- [x] All lender fields on one clean page (name, email, phone, company, NMLS, email template)
- [x] Back button returns to Market Match Hub Lender Settings tab

## Lender Intro Log
- [x] Add lender_intro_log table (id, lenderId, lenderName, isaId, isaName, investorName, investorEmail, financingType, budget, timeline, sentAt)
- [x] DB helpers: insertLenderIntroLog, getLenderIntroLogs
- [x] tRPC procedure: marketMatch.getLenderIntroLogs (admin/ISA)
- [x] Log entry written inside sendLenderIntro mutation on success
- [x] Intro Log tab/section in Lender Settings showing table of all intros
- [x] Summary stats: total intros, intros per lender, last 30 days count
- [x] Write vitest tests for log procedures

## Analytics — Markets Tab Fix
- [x] Fix React error #310 on Markets tab (hooks called after early return)

## Market GCI Goal Tracking & Drill-Down
- [x] Add annualGciGoal (decimal) column to market_profiles table
- [x] Update upsertMarketProfile DB helper to include annualGciGoal
- [x] Add annualGciGoal field to MarketProfileEditorPage (Step 1)
- [x] Update marketPerformance analytics query to include annualGciGoal
- [x] Show GCI progress bar on Analytics Markets tab (totalGci / annualGciGoal)
- [x] Make market rows clickable in Analytics Markets tab → navigate to drill-down
- [x] Build tRPC procedures: analytics.marketDrillDown (agents, deals, monthly trend for one market)
- [x] Build MarketDrillDownPage (/analytics/market/:id) with agents table, deal history, monthly GCI chart
- [x] Add route for MarketDrillDownPage in App.tsx
- [x] Write vitest tests for drill-down procedures

## Analytics Markets Tab & Agent Drill-Down
- [x] Fix React error #310 on Analytics Markets tab (persistent hooks-after-return)
- [x] Make agent names clickable in MarketDrillDownPage (link to /agents/:id)

## Agent Profile — Market Badge
- [x] Add tRPC procedure to fetch markets for a given agent (analytics.agentMarkets)
- [x] Show market badge(s) on AgentProfilePage header with link to /analytics/market/:id

## Markets Consolidation — Migrate to market_profiles
- [x] Audit all usages of old markets table (schema, server, client)
- [x] Add marketProfileId column to users table, migrate data, drop old markets table
- [x] Update markets router to use market_profiles
- [x] Update analytics queries (getMarketPerformance, getMarketMonthlyTrend, getMarketAgentLeaderboard, drill-down) to join market_profiles
- [x] Update UsersPage market assignment dropdown to use market_profiles
- [x] Update AgentProfilePage market badge to use market_profiles
- [x] Update Analytics Markets tab (annualGciGoal now from market_profiles)
- [x] Remove Markets page from sidebar if it was pointing to old markets
- [x] Run tests and TypeScript check

## Property History Tab
- [x] Audit existing history tabs on Contact, Transaction, Listing detail pages
- [x] Build getPropertyHistory DB helper (linked contacts, transactions, listings + outcomes)
- [x] Add analytics.propertyHistory tRPC procedure
- [x] Add History tab to PropertyDetailPage with timeline UI
- [x] Show: when added to a contact (contact name, date), transaction (status/outcome, close date, GCI), listing (status/outcome, list price, close price)
- [x] Write vitest tests for propertyHistory procedure

## Marketing Requests Feature
- [x] Add marketing_requests table (id, agentId, title, description, requestType, status, priority, dueDate, responseNote, responseFileUrl, responseFileKey, responseFileName, completedAt, createdAt, updatedAt)
- [x] Add marketing_request_attachments table (id, requestId, fileUrl, fileKey, fileName, mimeType, uploadedBy, createdAt)
- [x] Apply DB migration via webdev_execute_sql
- [x] Add DB helpers: createMarketingRequest, listMarketingRequests, getMarketingRequest, updateMarketingRequestStatus, addMarketingResponse
- [x] Build tRPC router: marketingRequests (create, list, getById, updateStatus, respond, uploadAttachment)
- [x] Build agent MarketingRequestsPage: submit form + list (default: pending only, toggle to show completed)
- [x] Build admin/marketing MarketingAdminPage: all requests, filter by status (default: new+in_progress), respond with note + file, mark complete/in_progress
- [x] Add "Marketing Requests" link to agent sidebar nav
- [x] Add "Marketing Requests" link to admin sidebar nav
- [x] Wire routes in App.tsx
- [x] Run TypeScript check and tests

## Contact & Transaction History Timelines
- [ ] Build getContactHistory tRPC procedure (properties, transactions, listings, activity log, communications)
- [ ] Build getTransactionHistory tRPC procedure (property, contact, listing origin, status changes, communications)
- [ ] Add History tab to ContactDetail page with full chronological timeline
- [ ] Add History tab to TransactionDetail page with full chronological timeline
- [ ] Add listing-to-transaction visual connector in all timelines (listing → contract → close chain)
- [ ] Update PropertyDetail history timeline with listing-to-transaction connectors
- [x] Add lead source breadcrumb pills to Agent Pipeline contact cards in ISA Dashboard
- [x] Add lead source breadcrumb pills to AgentConnectionDetail page
- [x] Add Last Contacted column to Contacts table (most recent communication date)
- [x] Enforce email/phone/currency validation and formatting across all forms

## Form Validation & Contact Page Improvements (v12)
- [x] Add phone submit validation (block if < 10 digits) everywhere phone fields exist
- [x] Add email submit validation (block if invalid format) everywhere email fields exist
- [x] Contact detail page cleanup: merge ISA status into contact info card, reduce visual clutter
- [x] Add Call Booking Calendar Link field to agent user profiles (schema + UI)
- [x] Agent connection assignment: remove onboarding task checkbox/due date
- [x] Agent connection assignment: show agent's Call Booking Link when agent is selected
- [x] Agent connection assignment: add "Introduce client to agent" checkbox that sends intro email (client + CC agent)
- [x] Build email template editor: add "Edit email" link per template on Email Test page
- [x] Pre-populate email templates with current template content
- [x] Add edit button to User Profile page

## Agent Connection Booking Link (v12.1)
- [x] Show agent's Call Booking Link as a clickable button on AgentConnectionDetail page

## Agent Pipeline Add Contact (v13)
- [x] Add "Add Contact" button to agent PipelinePage that creates contact + auto agent connection with selectable pipeline stage

## Duplicate Detection & Connection Requests (v14)
- [x] Add connection_requests table to DB schema
- [x] Add server procedures: contacts.checkDuplicate, connectionRequests.create, connectionRequests.list, connectionRequests.approve, connectionRequests.deny
- [x] Add lead source picker to all contact create forms (ContactsPage, PipelinePage, ListingsPage, TransactionsPage)
- [x] Hard block email/phone duplicates on all contact create forms with option to request agent connection
- [x] Soft name warning on all contact create forms with "Are you sure?" confirmation
- [x] Build Connection Requests page for admins/ISAs with approve/deny
- [x] Send approval email to requesting agent when connection request is approved

## Duplicate Detection & Nav Badge (v14.1)
- [x] Add email/phone duplicate check on ContactDetail edit form (block save if match found on another contact)
- [x] Replace Connection Requests nav badge with a red number indicator in admin and ISA sidebars (already implemented as red circle count)

## Tyler's Projects — Project Management System (v15)
- [ ] DB schema: pm_projects, pm_tasks, pm_weekly_updates, pm_project_collaborators, pm_project_activity tables
- [ ] Server routers: projects CRUD, tasks CRUD, weekly updates, AI summary/debrief
- [ ] Project Management Dashboard (AI debrief, personal section, alerts)
- [ ] Projects list page (grouped by department, filters)
- [ ] Project Detail page (tasks, weekly update, collaborators, AI summary)
- [ ] Tyler-only nav section in AppLayout (visible only to OWNER_OPEN_ID / Tyler)
- [ ] All routes registered in App.tsx

## Project Management Module (Tyler's Projects)

- [x] Database schema: pm_projects, pm_tasks, pm_task_comments, pm_weekly_updates, pm_activity_log tables
- [x] PM router: full CRUD for projects, tasks, comments, weekly updates, activity log, AI summary
- [x] Wire pm router into main appRouter
- [x] ProjectsPage: list view + kanban view with stats, filters, search, create dialog
- [x] ProjectDetailPage: tasks tab (add/edit/complete/delete/comments), weekly updates tab, activity tab, AI summary
- [x] Tyler-only "Tyler's Projects" nav section (gated by tyler@savvy.realty email)
- [x] Routes /projects and /projects/:id added to App.tsx
- [x] Vitest tests for PM router logic (13 test files, 179 tests passing)
- [x] 0 TypeScript errors

## PM Enhancements – Departments, Collaborators, Notes & Inbox

- [x] Schema: pm_departments table (id, name, createdAt)
- [x] Schema: pm_project_collaborators table (projectId, userId)
- [x] Schema: pm_project_notes table (id, projectId, authorId, content, createdAt)
- [x] Schema: pm_note_mentions table (noteId, mentionedUserId)
- [x] Schema: pm_note_reads table (noteId, userId, readAt) for unread tracking
- [x] Schema: pm_task_comment_reads table (commentId, userId, readAt) for unread tracking
- [x] Server: departments router (list, create, delete)
- [x] Server: collaborators router (add, remove, list per project)
- [x] Server: project notes router (create with @mention parsing, list, mark read/unread)
- [x] Server: inbox router (unread notes + comments mentioning or involving me, mark read, mark unread)
- [x] Frontend: department managed dropdown with "Add New Department" option on create/edit project
- [x] Frontend: owner filter on ProjectsPage
- [x] Frontend: collaborator filter on ProjectsPage
- [x] Frontend: Notes tab on ProjectDetail (post note, @mention autocomplete, read/unread indicator)
- [x] Frontend: Inbox panel (bell icon in header or sidebar) showing unread notes/comments
- [x] Frontend: Mark as unread button on notes and task comments

## Bug Fixes & Enhancements (v16)

- [x] Formatting: create shared formatPhone, formatEmail, formatAddress utilities
- [x] Formatting: apply phone formatting everywhere it displays (ContactsPage, ContactDetail, TransactionDetail, PipelinePage, AgentConnectionDetail, etc.)
- [x] Formatting: apply email formatting (lowercase, mailto links where appropriate)
- [x] Formatting: apply address formatting (title case, city/state/zip on one line)
- [x] Bug: investigate phantom ISA assignment on Elle Anderson — ISA auto-assigned when contact created from ISADashboard (correct behavior); ISA follow-up date field now hidden in UI when no ISA assigned
- [x] Bug: no auto follow-up task when admin creates contact with no ISA assigned — fixed: task now assigned to contact's ISA, not the caller; skipped if no ISA
- [x] PM: Collaborators panel on ProjectDetailPage (view list, add/remove collaborators)
- [x] PM: Department management page (admin-only, rename/delete departments with project count)
- [x] PM: @mention email notification — send email to mentioned user when they are @mentioned in a project note

## Bug Fixes & Enhancements (v17)

- [x] Bug: Fix unknown email type error for market_match_intro and client_intro on Email Test page
- [x] Email Test page: show all available template variables per email type
- [x] Email Test page: Add "Show Preview" button to render HTML preview before sending
- [x] Favicon: generate and add a favicon to the site
- [x] Address formatting: apply City, State ZIP formatting in PropertyDetail, ListingDetail, TransactionDetail, ContactDetail

## Bug Fixes & Enhancements (v18)

- [x] Validation: agents must provide email OR phone when creating a contact (frontend form + backend guard)
- [x] Address formatting: apply formatStreet + formatCityStateZip to ContactDetail page

## Bug Fixes & Enhancements (v19)

- [x] Validation: ISA Dashboard quick-create form requires email OR phone (consistent with agent Pipeline rule)

## Bug Fixes & Enhancements (v20)

- [ ] Dual Agency dialog: add buyer contact search-and-select (link to existing contact)
- [ ] Dual Agency dialog: add buyer-side commission field
- [ ] Dual Agency dialog: add buyer-side notes textarea
- [ ] Backend: extend convertToTransaction procedure to accept buyerContactId, buyerCommission, buyerNotes

## Dual Agency Dialog Enhancement (v20)

- [x] Dual Agency dialog: transaction type selector (Seller Only vs Dual Agency)
- [x] Dual Agency dialog: buyer contact search-and-select field
- [x] Dual Agency dialog: buyer-side commission type + rate fields
- [x] Dual Agency dialog: buyer-side notes textarea
- [x] Schema: add buyerContactId, buyerCommissionRate, buyerCommissionType, buyerNotes to transactions table
- [x] Backend: extend convertToTransaction procedure to accept and store buyer-side fields
- [x] Backend: require buyerContactId when transactionType is "dual"

## Commission Calculator in Convert Dialog (v21)

- [x] Live commission calculator panel in Convert to Contract dialog (seller-side + buyer-side amounts, updates on input)

## Admin Transaction Delete (v22)

- [x] Backend: admin-only delete procedure in transactions router (cascade payout items, activity log, documents)
- [x] Frontend: Delete button on TransactionDetail (admin only) with confirmation dialog
- [x] Frontend: Delete action on TransactionsPage row (admin only) with confirmation dialog

## Admin Custom Splits Input (v23)

- [ ] Locate all splits dropdowns (agent profile, transaction payout items, commission & payouts)
- [ ] Replace splits dropdown with admin free-input field (numeric, 0-100 range, sum validation)
- [ ] Backend: validate split values are numeric and within range in relevant procedures

## Admin Custom Splits Input (v23)

- [x] UsersPage: replace commission split Select dropdown with free numeric input (0-100) with live Agent%/Savvy% preview
- [x] GroupsPage: replace leader commission split Select with free numeric input in Add/Edit Group dialogs
- [x] GroupsPage: replace per-member split override Select with inline numeric input field
- [x] Backend: add z.number().min(0).max(100) validation to groups.create, groups.update, and groups.members.updateSplit

## Buyer Side Info Card on TransactionDetail (v24)

- [x] Add Buyer Side card to TransactionDetail showing buyer contact (linked), buyer commission type/rate, and buyer notes (only visible when buyerContactId is set)

## Commission Split Automation (v25)

- [x] Audit existing generateAutoPayouts logic and schema
- [x] Enhance generateAutoPayouts: GCI = price × rate, agent split from profile, group leader from GCI, Savvy = remainder
- [x] Schema: add isOverride boolean and overrideNote text to transaction_payout_items
- [x] Admin override UI: mark payout item as overridden, show override badge, log to activity
- [x] Re-calculate Splits button on TransactionDetail (admin only): re-runs auto-payouts, clears non-overridden items

## Auto-Clear Commission Integrity Alerts (v26)

- [x] Audit commissionFlags schema and backend check logic
- [x] Implement validateAndClearCommissionFlag helper: checks 100% allocation + split adherence
- [x] Wire auto-clear into recalculateSplits procedure
- [x] Wire auto-clear into addPayoutItem, updatePayoutItem, deletePayoutItem mutations
- [x] Wire auto-clear into updatePayoutOverride mutation
- [x] Frontend: Commission Alerts panel auto-removes cleared flags on data refresh
- [x] Frontend: TransactionDetail integrity badge auto-clears when flag is resolved

## Duplicate Flow Removal & Auto-Resolve Gap Fix (v27)

- [x] Remove ISA Dashboard quick-create dialog (2-step contact + pipeline form); redirect "New Lead" button to /contacts/new
- [x] Audit all pages for duplicate flows — PipelinePage, ListingDetail, TransactionsPage inline forms are contextually justified; no additional removals needed
- [x] Wire validateAndAutoResolveFlag into transaction update mutation for already-closed transactions with payoutIntegrityFlag set
- [x] When transaction is closed with payouts present, run full split-adherence check instead of only checking total

## Filter Improvements & Commission Flag Card (v28)

- [x] Payout Report: add agent filter (dropdown), payee type filter, and date range filter (closing date)
- [x] Agent Dashboard: add Commission Flags alert card showing flagged transactions with link to fix
- [x] Transactions (admin): already had full date range + agent + status + lead source filters
- [x] Pipeline page: already had stage filter pills + agent/ISA/lead source filters
- [x] Commission page (agent): add year filter dropdown (current year default, All Time option)

## Filter Improvements v29

- [ ] Transactions (admin): add transaction type filter pill row
- [ ] Commission (agent): add date range filter (from/to closing date)
- [ ] Tasks: add due date range filter + related-to contact/transaction search
- [ ] Pipeline: add name/phone/email search + follow-up due date range filter
- [ ] Analytics: add agent filter dropdown on all sub-tabs
- [ ] Filter-aware counts: Pipeline stage pills count only filtered results; audit all other pages with counts
- [ ] Commission page: add Group Leader tab (#3 from previous suggestions)

## Filter Improvements & Commission Group Leader Tab (v29)
- [x] Payout Report: agent filter, payee type filter, date range filter (verified from v28)
- [x] Transactions (Admin): transaction type filter pills (Buyer / Seller / Dual)
- [x] Commission (Agent): replaced year-only filter with full custom date range + year preset dropdown
- [x] Tasks: due date range filter (from/to), related-to search field
- [x] Pipeline: name/phone/email search input, follow-up date range filter
- [x] Analytics: global agent filter dropdown at page level, passed to Executive, Sales Funnel, Lead Source ROI, Pipeline Health tabs; backend agentId added to leadSourceROI, leadSourceFunnel, transactionTypeBreakdown, pipelineVelocity
- [x] Filter-aware counts: Pipeline "All (N)" pill now uses pre-filtered count (reflects all active filters)
- [x] Commission page: Group Leader tab added for agents who are also group leaders (tabs: My Commission / Group Leader)

## Bulk CSV Upload (v30)
- [ ] Backend: contacts.bulkUpload procedure (parse rows, skip duplicates by email/phone, return results summary)
- [ ] Backend: properties.bulkUpload procedure (parse rows, insert, return results summary)
- [ ] Backend: listings.bulkUpload procedure (parse rows, match property by address or create new, return results summary)
- [ ] Shared BulkUploadDialog component (CSV template download, file picker, preview table, row-level error reporting, import button)
- [ ] Wire BulkUploadDialog into ContactsPage (Upload CSV button next to New Contact)
- [ ] Wire BulkUploadDialog into PropertiesPage (Upload CSV button next to Add Property)
- [ ] Wire BulkUploadDialog into ListingsPage (Upload CSV button next to New Listing)

## Bulk CSV Upload (v30) — COMPLETED
- [x] Backend bulkUpload procedure for Contacts (email/phone duplicate detection)
- [x] Backend bulkUpload procedure for Properties (address duplicate detection)
- [x] Backend bulkUpload procedure for Listings (MLS number duplicate detection; auto-creates property if address given)
- [x] Shared BulkUploadDialog component: CSV template download, file picker, preview table (first 10 rows), row-level results with created/skipped/error counts
- [x] Bulk Upload button added to Contacts page
- [x] Bulk Upload button added to Properties page
- [x] Bulk Upload button added to Listings page

## Buyer-Side Edit Post-Conversion (v31) — COMPLETED
- [x] Verify backend transactions.update supports buyerContactId, buyerCommissionRate, buyerCommissionType, buyerNotes
- [x] Add edit button to Buyer Side card in TransactionDetail
- [x] Build edit dialog with contact picker, commission rate/type, and notes fields
- [x] Wire mutation to backend and invalidate transaction query on success

## Bulk Upload Enhancements (v32)
- [ ] Contacts template: add email, phone, address, city, state, zip, leadSource, notes columns
- [ ] Listings template: add contact info columns (sellerName, sellerEmail, sellerPhone) and accept "closed"/"UC" status
- [ ] Properties template: add owner contact info columns (ownerName, ownerEmail, ownerPhone)
- [ ] Backend: normalize "UC", "under contract", "Under Contract" → "under_contract" in listings/properties bulk upload
- [ ] Backend: normalize "closed", "Closed" → "closed" status in listings bulk upload

## Bulk Upload Enhancements (v32) — COMPLETED
- [x] Contacts template: add address, city, state, zip, isaStatus columns
- [x] Listings template: add sellerFirstName, sellerLastName, sellerEmail, sellerPhone; normalize UC/closed status
- [x] Properties template: add ownerFirstName, ownerLastName, ownerEmail, ownerPhone; auto-link via propertyOwnership
- [x] Backend: contacts bulkUpload accepts address/city/state/zip/isaStatus
- [x] Backend: listings bulkUpload normalizes UC/under contract/closed → converted; creates/links seller contact
- [x] Backend: properties bulkUpload creates/links owner contact via propertyOwnership table

## Simulate As — Admin-Wide Access (v33) — COMPLETED
- [x] context.ts: allow any admin role (not just owner email) to use simulate cookie
- [x] routers.ts auth.me: return realUser for any admin role
- [x] routers.ts simulateAs: check realUser.role === "admin" instead of email match
- [x] routers.ts stopSimulation: check realUser.role === "admin" instead of email match
- [x] useAuth.ts: canSimulate checks role === "admin" instead of email match

## Bulk Upload Admin-Only Gate (v34) — COMPLETED
- [x] ContactsPage: gate Bulk Upload button behind user?.role === "admin"
- [x] PropertiesPage: add useAuth import, gate Bulk Upload button behind user?.role === "admin"
- [x] ListingsPage: gate Bulk Upload button behind isAdmin (already defined in that page)

## Referral Payout Cascade Logic (v35)
- [ ] Add referralSourceName and referralPayoutPct fields to transactions schema
- [ ] Run migration SQL
- [ ] Rewrite commissionEngine to use cascading deduction: Savvy first (20% floor), then Group Leader, then Agent
- [ ] Update autoPayouts.ts to use referralPayoutPct from transaction (falls back to contact lead source)
- [ ] Update validateAndAutoResolveFlag to treat referral_partner items as expected auto-generated items
- [ ] Update TransactionDetail UI: show referral source name and payout % on the payout card; add referral fields to the transaction edit dialog
- [ ] TypeScript check and save checkpoint

## Referral Payout Cascade Logic (v35) — COMPLETED
- [x] Schema: added referralSourceName (text) and referralPayoutPct (decimal) to transactions table via SQL migration
- [x] commissionEngine.ts: rewrote cascading deduction — referral deducted from Savvy first (20% GCI floor), then Group Leader, then Agent
- [x] autoPayouts.ts: reads transaction-level referral fields (priority) or falls back to contact lead source referralPercent
- [x] transactions router create/update: added referralSourceName and referralPayoutPct to input schemas
- [x] recalculateSplits: reads referral fields from transaction record and passes to generateAutoPayouts
- [x] TransactionDetail edit dialog: added Referral section with source name + payout % inputs and live amount preview
- [x] TransactionDetail summary card: shows Referral Source row with purple badge when referral is set
- [x] TransactionDetail payout items: referral_partner items show purple "Referral" badge

## Knowledge Base Module (v36)
- [ ] Schema: kb_categories (id, name, type, description, sortOrder, createdAt) and kb_articles (id, categoryId, title, content, contentType, visibleToRoles, status, createdBy, updatedAt)
- [ ] Migration SQL applied to database
- [ ] Backend: categories CRUD (admin only for write, all for read)
- [ ] Backend: articles CRUD (admin only for write, filtered by visibleToRoles for read)
- [ ] Backend: visibility toggle procedure (admin only)
- [ ] Frontend: KnowledgeBasePage with category sidebar, article list, article detail
- [ ] Frontend: Admin editor with rich text (markdown), category picker, visibility controls
- [ ] Navigation: add Knowledge Base link to sidebar for all roles
- [ ] Role-based UI: hide edit/delete/create buttons from agents and ISAs

## Knowledge Base Module (v36) — COMPLETED
- [x] Schema: kb_categories (id, name, type, description, sortOrder) and kb_articles (id, categoryId, title, content, type, visibleToAgents, visibleToISAs, status, authorId, timestamps)
- [x] Migration SQL applied directly
- [x] Backend: knowledgeBase tRPC router with listCategories, listArticles, getArticle (role-filtered), createCategory, updateCategory, deleteCategory, createArticle, updateArticle, deleteArticle, toggleVisibility
- [x] Frontend: KnowledgeBasePage with category sidebar, article list, article detail with markdown rendering, admin editor with rich textarea
- [x] Visibility toggles per article (visible to agents / visible to ISAs) — admin-only
- [x] Role-based access: admins see all articles (draft + published), agents/ISAs see only published + visible-to-them articles
- [x] Navigation: Knowledge Base added to all three nav builders (admin, agent, ISA) under Resources group
- [x] Route /kb registered in App.tsx

## Agent Support Role (v37)
- [x] Schema: add `agent_support` to role enum on users table
- [x] Schema: add `agent_support_assignments` table (id, agentSupportUserId, agentId, createdAt, createdByAdminId)
- [x] DB migration applied via SQL
- [x] Backend: agentSupport tRPC router (listAssignments, assignAgent, removeAssignment, listMyAgents, workAs, stopWorkingAs)
- [x] Backend: context.ts reads `work_as_agent_id` cookie; swaps ctx.user to the assigned agent when valid
- [x] Backend: auth.me exposes `isWorkingAsAgent` and `realUser` for agent_support role
- [x] Backend: logout clears `work_as_agent_id` cookie (3 cookies total)
- [x] Backend: knowledgeBase visibility — agent_support treated same as agent (read-only KB access)
- [x] Backend: users.create and users.update accept `agent_support` role
- [x] Frontend: useAuth.ts exposes `isWorkingAsAgent` and `canWorkAsAgent` flags
- [x] Frontend: WorkAsAgentBanner component — amber banner shown when working as an agent
- [x] Frontend: AgentSupportPage (/agent-support) — shows assigned agents with Work As / Stop Working As buttons
- [x] Frontend: AppLayout nav builder for `agent_support` role (My Agents + Knowledge Base)
- [x] Frontend: UsersPage — agent_support role option in create/edit forms and role filter
- [x] Frontend: UsersPage — Manage Assignments dialog for agent_support users (assign/remove agents)
- [x] Tests: 16 agentSupport vitest tests passing
- [x] Tests: auth.logout test updated to expect 3 cleared cookies

## Duplicate Contact Detection & Merge (v38)
- [x] Schema: duplicate_contact_pairs table with matchType, confidence, status, keptContactId, reviewedById
- [x] Detection engine: exact match (email, phone, name+address) + fuzzy Jaro-Winkler name matching
- [x] Merge engine: re-parents all FK tables (tasks, transactions, contacts, communications, documents, properties, smart plan enrollments, activity log, approval requests, agent connections, connection requests, contact properties, groups)
- [x] Soft-delete loser contact after merge (archived_at set)
- [x] tRPC duplicates router: scan, getStats, listPairs (paginated), getPair, merge, dismiss
- [x] DuplicatesPage: stats cards, tabbed list (pending/merged/dismissed), merge dialog with side-by-side comparison and field-level conflict picker
- [x] Admin nav: Duplicate Contacts entry under Admin section
- [x] Route: /duplicates (admin-only)
- [x] 19 vitest tests: phone/email normalisation, Jaro-Winkler algorithm, scan, merge, getStats, dismiss, match priority

## Listing Edit Parity for Bulk-Uploaded Listings (v38)

- [x] Root cause identified: Edit button was gated on `isActive` — bulk-uploaded terminated/expired/converted listings had no Edit button
- [x] Backend: update procedure now accepts `listingStatus`, `agentId`, and `terminationDate` fields
- [x] Backend: agent-ownership guard added (agents can only edit their own listings)
- [x] Frontend: Edit button now always visible for admins regardless of listing status
- [x] Frontend: Edit dialog now includes Listing Status selector (admin only)
- [x] Frontend: Edit dialog now includes Agent reassignment dropdown (admin only)
- [x] Frontend: Edit dialog now shows Termination Date field when status is "terminated"
- [x] Frontend: openEdit pre-populates all new fields from existing listing data
- [x] Tests: 10 vitest tests cover admin edit of all statuses, agent-ownership guard, and ISA rejection

## Listing Status Standardisation (v39)
- [x] Rename `converted` status to `closed`, add `under_contract` as a distinct status
- [x] DB migration: widen enum, migrate 86 `converted` rows to `closed`, finalise 5-value enum
- [x] Backend: update create/update zod enums to `active | terminated | expired | under_contract | closed`
- [x] Backend: bulk-upload normaliser maps UC/under contract/undercontract → `under_contract`; closed/converted/sold → `closed`
- [x] Backend: convertToTransaction sets listing status to `closed` (was `converted`)
- [x] Frontend ListingDetail: STATUS_COLORS/LABELS, editForm type, Edit dialog selects
- [x] Frontend ListingsPage: STATUS_COLORS/LABELS, filter tabs, create form selects, badge display, bulk-upload column hint

## Transaction Bulk Upload (v40)
- [x] CSV template with all 22 columns (transaction_number, transaction_type, status, agent_email, contact, property, purchase_price, commission_rate_pct, gci, agent_split_pct, group_leader_split_pct, referral fields, contract_date, closing_date, notes)
- [x] Backend bulkUpload tRPC procedure (admin-only) with full commission logic integration
- [x] Transaction type normalisation (buyer/purchase/buy, seller/listing/sell, dual/dual agency)
- [x] Status normalisation (under_contract/UC/pending, closed/sold, terminated/cancelled)
- [x] Agent email lookup with clear error if not found
- [x] Contact find-or-create logic
- [x] Property find-or-create logic
- [x] GCI derivation from purchase_price × commission_rate_pct
- [x] GCI mismatch warning (>$1 difference)
- [x] Savvy 20% minimum split warning
- [x] CSV-provided explicit splits used directly when agent_split_pct is provided
- [x] Auto-payout generation from agent profile when splits not provided
- [x] Per-row error and warning collection with row index
- [x] Frontend bulk upload dialog (3-step: upload → preview → results)
- [x] CSV template download button in dialog
- [x] Preview table showing first 20 rows before import
- [x] Per-row results with success/failure/warning indicators
- [x] 49 vitest tests covering all validation and normalisation logic

## Webhook API System (v41)
- [x] webhook_endpoints and webhook_logs DB tables + migration
- [x] HMAC-SHA256 / plain-token authentication on inbound route
- [x] Handler registry: lead_ingest, contact_create, contact_update, custom
- [x] Contact + lead-source field mapper (20+ field aliases)
- [x] Express route: POST /api/inbound/:slug
- [x] tRPC admin router: createEndpoint, listEndpoints, updateEndpoint, deleteEndpoint, listLogs, getLog, stats
- [x] WebhooksPage: endpoint management, log viewer, payload inspector, integration guide
- [x] Webhooks nav item in admin sidebar
- [x] 35 vitest tests pass

## Batch Fixes & Features (v42)
- [x] Feedback modal: make dialog scrollable so large feedback items don't overflow viewport
- [x] Users page: remove "Reports To" field from user create/edit form
- [x] Org Chart: redesign with collapsible tree layout, fix broken lines, fix agent/ISA visibility
- [x] Nav: hide Smart Plans under Tyler's Projects section (not in main nav)
- [x] Nav: hide Email Test under Tyler's Projects section
- [x] Agent Dashboard: fix "My Contacts" box and button — redirect to My Pipeline instead
- [x] v29 filters: transaction type filter on admin Transactions page
- [x] v29 filters: date range filter on agent Commission page
- [x] v29 filters: name/phone/email search on Pipeline page
- [x] v29 filters: agent filter dropdown on Analytics sub-tabs
- [x] Duplicate prevention at contact create: inline check for email/phone/name match (admin+ISA)
- [x] Duplicate prevention: also applies when agent adds a contact
- [x] Agent Dashboard: personalised KPIs (YTD GCI vs goal, pipeline count, tasks due today, next follow-up)
- [x] Scheduled nightly duplicate scan + /api/scheduled/duplicate-scan endpoint
- [x] Group Leader dashboard page
- [x] Email Notifications admin page (read-only inventory of all system emails)

## Batch Fixes & Features (v43) — COMPLETED
- [x] Market Profile update bug fix — query fails when optional fields are empty strings
- [x] Users form: restore Reports-To field (required on create + edit)
- [x] Users form: hide Title/Position for Agent, ISA, Agent Support roles; require it for Admin
- [x] Agent Dashboard: remove/fix "Add Contact" button — agents should not navigate to /contacts
- [x] Org Chart: show contact info (phone/email) collapsible per node
- [x] Org Chart: show Market for agents, Group name for group members
- [x] Org Chart: start fully collapsed, users expand to explore
- [x] Org Chart: group children by user type under each manager
- [x] Email Notifications v2: DB-backed per-notification toggle (email_notification_settings table)
- [x] Nightly duplicate scan: create scheduled task that POSTs to /api/scheduled/duplicate-scan
- [x] Group Leader Dashboard: live data verified; year filter already in place

## Partner Lead Intake Form (v44) — COMPLETED
- [x] Public /partner-lead page (no auth) with Client Name, Phone, Email, Notes fields
- [x] Partner Source attribution via URL param (?partner=) and dropdown fallback
- [x] Backend publicProcedure: ingest lead, create contact, fire webhook, notify admins
- [x] Thank-you confirmation screen after submission
- [x] Admin notification (notifyOwner) on new partner lead submission

## Partner Form Enhancements (v45) — COMPLETED
- [x] Rate limiting: IP-based (max 5 submissions per 15 min) + honeypot field on submitPartnerLead
- [x] Email confirmation: send receipt to partner email after successful lead submission
- [x] Partner Links admin page: lists all lead sources with Copy Link button for /partner-lead?partner=...
- [x] Wire Partner Links page to Admin nav

## v46 Batch
- [ ] Departments page: add breadcrumb/back-link to /projects
- [ ] Email Notification toggles: enforce isEnabled check in sendTransactionalEmail
- [ ] Market Profile editor: add "Preview AI Prompt" button
- [ ] Org Chart: fix empty state bug (reportsToId query returning no results)
- [ ] Market Match: seed us_states, us_counties, us_cities reference tables
- [ ] Market Match: add market_counties join table (market ↔ county many-to-many)
- [ ] Market Match: remove region field, make state a dropdown, add county multi-select
- [ ] Market Match: migrate existing market state values to dropdown (fuzzy match)
- [ ] Market Match: budget min/max as dropdowns ($100k–$3M)
- [ ] Market Match: remove goal field from market profile editor
- [ ] Goals admin page: unified page with agent goals + market goals sections
- [ ] Market Match Config page: show assigned agents + associated groups per market
- [ ] Market Match Config page: show budget range and richer detail on cards

## v46 Batch — COMPLETED
- [x] Email Notification toggle guard: sendTransactionalEmail checks isEnabled in DB before sending
- [x] Org Chart fix: self-referencing root node (Tyler reportsToId=1) no longer causes empty tree
- [x] US states/counties reference tables: 51 states + 3,143 counties seeded
- [x] market_counties join table added to schema
- [x] Market Profile editor: state dropdown (DB-backed), county multi-select, budget dropdowns ($100k increments), region field removed, Annual GCI Goal field removed
- [x] Goals admin page: unified /goals page with agent goals + market goals, nav item added
- [x] Market Match Config: agent cards now show group name badge, email, phone, budget spec, lead cap
- [x] getMarketAgents: returns groupName, agentEmail, agentPhone via LEFT JOIN

## v47 Batch
- [ ] Migrate existing market state free-text values to standardized state codes
- [ ] Goals page: add YTD actual vs target progress bars for agent goals and market goals
- [ ] Market Match Config: show county tags on collapsed market card header

## v47 Batch — COMPLETED
- [x] Migrate existing market state free-text values to 2-letter state codes (33 markets updated)
- [x] Goals page: YTD progress bars already implemented and live — verified working
- [x] Market Match Config: county tags shown on collapsed market card headers (up to 5, +N more)

## v48 Batch
- [ ] Goals page: add sort-by-% to goal option on agent tab (lowest first to surface who needs attention)
## v48 Batch — COMPLETED
- [x] Goals page: sort dropdown added to AgentGoalsTab (% to Goal Lowest/Highest, No Goal First, Name A-Z)
## v49 Batch — COMPLETED
- [x] getMarketAIPrompt tRPC procedure: returns marketBlock, fieldsSummary (10 boolean fields + completenessScore %), marketName, isActive, status
- [x] Preview AI Prompt button added to MarketProfileEditorPage header (edit mode only) — opens Dialog modal with completeness score, field checklist, and raw market context block
- [x] AIPreviewModal rendered in JSX return statement
- [x] Market Goals tab enhanced: YTD GCI shown prominently as large number on every card (even with no goal set), sort dropdown added (% to Goal Lowest/Highest, No Goal First, YTD GCI Highest, Name A-Z), "Set goal" clickable badge on no-goal cards
## v50 Batch
- [ ] Goals page: monthly GCI sparkline bar charts per agent card (12-month breakdown using monthlyGciTrend per agent)
- [ ] Partner Lead Form: remove Partner/Lead Source dropdown entirely; if ?partner= param doesn't match a known source exactly, show 404 page; add noindex/nofollow meta tags to prevent indexing
- [ ] Partner Links page: fix broken "Admin → Lead Sources" link (was pointing to /admin/lead-sources, should be /lead-sources)
- [ ] Nav cleanup: move Lead Sources from Admin group into CRM group; remove Partner Links from nav and embed it as a tab inside LeadSourcesPage
- [ ] Hidden nav: rename "Projects" + "Dev Tools" nav groups to a single "Hidden" group; add allowHiddenNav boolean to users DB table; add "Allow access to Hidden Navigation" checkbox on user Edit dialog (Tyler-only); use allowHiddenNav flag (or isTyler) to show Hidden nav
- [ ] Move Departments functionality inside ProjectsPage (accessible from within the page, not as a separate nav item)

## v50 Batch — COMPLETED
- [x] Goals page: monthly GCI sparkline bar charts per agent card (Annual view only, 12-bar chart with current month highlighted)
- [x] Partner Lead Form: remove Partner/Lead Source dropdown, show 404 if ?partner= doesn't match any active partner link, add noindex/nofollow meta
- [x] Fix broken "Admin > Lead Sources" link on Partner Links page
- [x] Nav cleanup: Lead Sources moved under CRM, Partner Links tab embedded inside LeadSourcesPage, Partner Links removed from top-level nav
- [x] Hidden nav system: renamed Tyler's nav groups to "Hidden", added allowHiddenNav DB column + checkbox on user edit (Tyler only), moved Departments into Projects page

## v51 Batch — COMPLETED
- [x] Goals page: add monthly pace target line (goal ÷ 12) to SparklineChart as dashed amber horizontal line
- [x] Partner Links analytics: add clickCount + submissionCount columns to lead_sources, track on form load and submission, display in PartnerLinksTab with conversion rate

## v52 Batch
- [ ] Fix Market Match Hub Select.Item empty value bug (BUDGET_OPTIONS has ["", "— Not set —"])
- [ ] Nav: move Email Notifications under Hidden; move Email Test into EmailNotificationsPage as a tab
- [ ] Nav: add Dev Tools section with Webhooks and Duplicate Contacts
- [ ] Nav: move Groups under Users page (as a tab)
- [ ] Nav: consolidate Payout Report + Transaction Reporting + Commission Exceptions into Commission & Payouts page (tabs)
- [ ] Nav: combine On/Offboarding Lists + Tracker + Report into single On/Offboarding page (tabs)
- [ ] Goals page: agent card drill-down detail panel (click card to open monthly GCI table)
- [ ] Lead Sources: add inactive sources tab with Reactivate button

## v52 Batch — COMPLETED
- [x] Fix Market Match Hub Select.Item empty value bug (BUDGET_OPTIONS has ["", "— Not set —"])
- [x] Nav: move Email Notifications under Hidden; move Email Test into EmailNotificationsPage as a tab
- [x] Nav: add Dev Tools section with Webhooks and Duplicate Contacts
- [x] Nav: move Groups under Users page (as a tab)
- [x] Nav: consolidate Payout Report + Transaction Reporting + Commission Exceptions into Commission & Payouts page (tabs)
- [x] Nav: combine On/Offboarding Lists + Tracker + Report into single On/Offboarding page (tabs)
- [x] Goals page: agent card drill-down detail panel (click card to open monthly GCI table)
- [x] Lead Sources: add inactive sources tab with Reactivate button

## v53 Batch — COMPLETED
- [x] Fix Analytics & Reports All Agents dropdown invisible text (was using firstName/lastName, switched to name)
- [x] Combine All Tasks + My Tasks into single Tasks page with My Tasks/All Tasks toggle, defaulting to My Tasks
- [x] Tasks nav badge shows overdue My Tasks count (red number)
- [x] On/Offboarding Tracker: add Overdue status filter option (client-side filter on overdueTasks > 0)

## v54 Batch — COMPLETED
- [x] Commission & Payouts: add tab badges (pending exceptions, unpaid payouts, flagged transactions)
- [x] Transaction Reporting: add count badges to the flag filter buttons
- [x] Fix On/Offboarding Report tab (remove duplicate PageHeader from OnboardingReportPage when embedded)
- [x] Leadership Dashboard: add Start 1-on-1 button with agent selector dialog
- [x] UsersPage: make user names clickable to open /agents/:id profile page
- [x] UsersPage edit modal: fix vertical overflow (add max-h + overflow-y-auto to DialogContent)
- [x] Email Notifications page: add Birthday Recognition and Anniversary Recognition opt-in entries

## v55 — Analytics & Reporting Full BI Rebuild

### Backend: New analytics procedures
- [ ] Business Overview KPIs (total GCI, volume, closings, active pipeline, agents, contacts)
- [ ] Agent Performance: production table with GCI, volume, closings, pipeline count, avg deal size, goal %, filterable by agent/group/market/date range
- [ ] Monthly GCI trend — add date range + group/market filters
- [ ] Agent pipeline funnel: count by pipelineStatus per agent
- [ ] Group Performance: GCI, closings, volume per group with member breakdown
- [ ] Market Performance: GCI, closings, volume per market profile with agent breakdown
- [ ] Commission Summary: total GCI, brokerage take, agent payouts, group leader payouts, referral fees
- [ ] Payout Status: unpaid vs paid breakdown by agent and payee type
- [ ] Commission Exceptions: count by status, avg resolution time
- [ ] Task Analytics: total/open/overdue/completed by assignee, type, priority; completion rate over time
- [ ] ISA Reporting: contacts by isaStatus, conversion rates, contacts per ISA, market match sessions
- [ ] Lead Source Analytics: contacts by source, conversion to active/closed, click/submission counts
- [ ] Pipeline Analytics: contacts by pipelineStatus per agent, follow-up overdue count
- [ ] Onboarding Report: instances by status, avg completion time, overdue tasks count
- [ ] Database Health: total contacts, archived, bounced emails, unsubscribed, duplicate pairs pending

### Frontend: BI Suite page rebuild
- [ ] Left sidebar category nav (10 categories)
- [ ] Business Overview tab: KPI cards grid + monthly GCI trend chart + agent leaderboard mini-table
- [ ] Agent Performance tab: date range + agent + group + market filters; production table + GCI bar chart + pipeline funnel
- [ ] Group Performance tab: group filter; GCI/closings/volume per group table + member breakdown
- [ ] Market Intelligence tab: market filter; GCI/closings/volume per market + agent assignment table
- [ ] Commission & Payouts tab: date range + agent + status filters; summary KPI cards + payout status table + exceptions summary
- [ ] Task Analytics tab: date range + assignee + type + priority filters; KPI cards + status donut chart + completion trend line
- [ ] ISA & Pipeline tab: ISA filter + date range; ISA performance table + contact funnel by isaStatus + market match session stats
- [ ] Lead Sources tab: source filter + date range; source performance table + conversion funnel chart
- [ ] On/Offboarding tab: type + status + agent filters; instance table + avg completion time + overdue tasks
- [ ] Database Health tab: KPI cards + contact growth trend
- [ ] Shared: date range picker component, export-to-CSV button on all tables

## v55 — Analytics & Reporting BI Rebuild
- [x] Audit schema, db helpers, analytics router
- [x] Design 10 BI report categories
- [x] Build db-analytics.ts with 12 new query helpers
- [x] Add 12 new tRPC procedures to analytics router
- [x] Write shared.tsx analytics utilities (KpiCard, ExportButton, DateRangeFilter, Th, Td)
- [x] BusinessOverviewTab — GCI trend, volume, closings, agent rankings
- [x] AgentPerformanceTab — per-agent production, pipeline, goals
- [x] GroupPerformanceTab — team GCI, expandable member rows
- [x] MarketIntelligenceTab — market GCI, agents, goal %, expandable
- [x] CommissionPayoutsTab — pending/paid commissions, splits
- [x] TaskAnalyticsTab — completion rate, overdue, by assignee/type/priority
- [x] IsaPipelineTab — ISA performance, pipeline funnel, market match sessions
- [x] LeadSourceAnalyticsTab — contact volume, GCI per source, ROI table
- [x] OnboardingReportTab — agent onboarding progress, overdue tasks
- [x] DatabaseHealthTab — record counts, data quality, monthly growth
- [x] Rebuild AnalyticsPage with left sidebar category nav (16 categories)
- [x] Fix all TypeScript errors (0 errors)

## v56 — UI Fixes & Report Depth
- [ ] Group Performance: fix blank dropdown items, expand metrics (closed/UC volume, units)
- [ ] Lead Source ROI: fix page crash
- [ ] Expand all analytics tabs with deeper metrics
- [ ] Database Health: fix all-zeros, add more content
- [ ] Pipeline Health: make stalled deals clickable (link to transaction)
- [ ] Admin Dashboard: make agent names clickable
- [ ] Admin Dashboard: remove Quick Actions and Pending Tasks sections
- [ ] All Contacts: remove Match blue link, add insights panel
- [ ] Goals page: remove Bulk Set Goals button, convert agent/market cards to tables

## v56 — UI Fixes & Report Expansion
- [x] Group Performance: fixed blank dropdown (group.id vs group.group.id), expanded metrics (UC volume/units, closed volume, per-member breakdown)
- [x] Lead Source ROI: fixed page crash (field name mismatch), added GCI from transactions
- [x] Database Health: expanded with transactions, agents, tasks, groups, markets stats + data quality flags
- [x] Pipeline Health: stalled deals rows are now clickable, navigate to contact detail
- [x] Admin Dashboard: agent names are clickable (link to agent profile)
- [x] Admin Dashboard: removed Quick Actions and Pending Tasks cards
- [x] All Contacts: removed Match blue link
- [x] All Contacts: added insights panel (total, new last 30d, missing email, missing phone)
- [x] Goals - Agent Goals: removed Bulk Set Goals for All Agents button
- [x] Goals - Agent Goals: converted agent cards to a table with GCI/Closings/% columns
- [x] Goals - Market Goals: converted market cards to a table

## v57 — Request Connection on Agent Profile
- [x] Add searchForRequest procedure to contactsRouter (returns contacts not yet connected to agent, excluding pending requests)
- [x] Add Request Connection button to AgentProfilePage header (visible to admins and the agent themselves)
- [x] Add Request Connection dialog with live contact search, pipeline stage picker, and submit
- [x] Reuses existing connectionRequests.create backend procedure (no schema changes needed)

## v59 — Lender Role
- [x] Add lender to user role enum in schema
- [x] Create contact_lender_access join table (migration applied)
- [x] Backend lender router: myContacts, contactDetail, addNote, grantAccess, revokeAccess, listAccessForContact
- [x] LenderDashboard page at /lender-portal with contact list and note-taking panel
- [x] GrantLenderAccessDialog component for admin/agent use on contact cards
- [x] Lender Access button on ContactDetail.tsx (admin only)
- [x] LenderRoute guard in App.tsx
- [x] Lender nav in AppLayout (My Contacts → /lender-portal)
- [x] Role label and badge class for lender in AppLayout

## v60 — Pipeline Nav Fix, Badge Fix, ISA Assignment, ISA Activity, Lead Aging
- [ ] Fix admin pipeline click to navigate to lead pipeline record
- [ ] Fix notification badge clearing for Admin Approvals and Feedback
- [ ] Add assignedIsaId field to contacts (already in schema, verify UI)
- [ ] Add ISA assignment UI to contact detail and contact list
- [ ] Make ISA activity (notes, calls, texts) visible to agents on their pipeline contacts
- [ ] Lead aging: Assigned but Untouched flag (configurable days)
- [ ] Lead aging: Unassigned flag (configurable days)
- [ ] Lead aging indicators visible on pipeline and contact list

## v60 — 5 Fixes & Features
- [x] Fix: Admin pipeline click navigates to /pipeline/:id (not /contacts/:id)
- [x] Fix: Notification badge clearing — pendingCount invalidated on approval review
- [x] Feature: ISA assignment field visible in contacts table (Assigned ISA column)
- [x] Feature: ISA activity visible to agents — author attribution + blue ISA badge on comms
- [x] Feature: Lead aging indicators on Pipeline page — Unassigned (red), Stale 7d+ (orange), Idle 3d+ (yellow)

## Bug Fixes (v61)
- [x] Fix Contact View React error #310 — moved lenderAccessOpen useState above early return in ContactDetail.tsx
- [x] Fix lead sources not loading in Add Contact window for agent role — gated users.list queries on canListUsers (admin/isa only) to prevent FORBIDDEN errors from blocking the page

## Bug Fixes (v62)
- [x] Fix bulkUpload Zod validation error — leadSourceType and isaStatus enum fields now use z.preprocess to coerce empty strings to null before enum validation, preventing "Invalid option" errors when CSV rows have blank values for these fields

## Bug Fixes (v63)
- [x] Fix Buy Box form type mismatches in AgentConnectionDetail — handleSaveBuyBox now parses maxSqft as integer and splits targetCities/targetZips comma strings into arrays before sending to backend

## Feature: ISA Market Match Hub Access (v64)
- [x] Add Market Match Hub nav link to ISA sidebar (Operations section in AppLayout.tsx)
- [x] Add AdminOrIsaRoute guard in App.tsx and apply it to /market-match-config route
- [x] Hide admin-only Lender Settings tab from ISA users in MarketMatchConfigPage
- [x] Backend already uses isaOrAdminProcedure for all ISA-relevant procedures (no backend changes needed)

## Bug Fixes (v65)
- [x] Fix Market Match Hub: Min Budget and Max Budget not saving to database — columns were missing from DB, applied ALTER TABLE migration

## Features (v66)
- [x] Market Match Hub: Show budget range ($X - $Y) on market profile cards
- [x] Market Match Hub: Add budgetMax > budgetMin validation on the edit form

## Feature: Remove Lender from Market Match Hub (v67)
- [ ] Remove LenderSettingsTab and IntroLogTab from MarketMatchConfigPage
- [ ] Remove "Intro to Lender?" button from MarketMatchCallPage
- [ ] Remove lender procedures from marketMatch router
- [ ] Remove lender DB helpers from marketMatch.db.ts
- [ ] Remove LenderEditorPage, LenderDashboard, and lender routes from App.tsx
- [ ] Remove lender nav from AppLayout.tsx

## Feature: Remove Lender from Market Match Hub (v67)
- [x] Remove Lender Settings tab from MarketMatchConfigPage
- [x] Remove Intro Log tab from MarketMatchConfigPage
- [x] Remove Lender Intro button from MarketMatchCallPage
- [x] Remove getLenderConfigs, upsertLenderConfig, deleteLenderConfig, sendLenderIntroEmail, getLenderIntroLogs, getLenderIntroLogStats procedures from marketMatch router
- [x] Remove LenderEditorPage.tsx and LenderDashboard.tsx pages
- [x] Remove lender routes from App.tsx
- [x] Remove LenderRoute guard and lender nav from AppLayout.tsx

## Bug Fix: Inbound Webhook Hang (v68)
- [x] Fix POST /api/inbound/:slug hanging indefinitely — express.json() was consuming the request body stream before the webhook route's custom req.on("data") listener could fire, causing next() to never be called. Fixed by reconstructing _rawBody from the already-parsed req.body instead of re-reading the consumed stream.

## v69 Tasks
- [ ] Fix SCHEDULED_TASK_COOKIE auth — switch duplicate scan endpoint to static secret header
- [x] A→Z / Z→A sorting: Contacts
- [x] A→Z / Z→A sorting: Connection Requests
- [x] A→Z / Z→A sorting: Properties
- [x] A→Z / Z→A sorting: Listings
- [x] A→Z / Z→A sorting: All Transactions
- [x] A→Z / Z→A sorting: All Pipelines
- [x] A→Z / Z→A sorting: Commission & Payouts

## v70 Tasks
- [x] Add Market Match Call nav link to ISA sidebar (under Operations)
- [x] Bulk upload template CSV download — already implemented in BulkUploadDialog (verified)
- [x] Goals page: Agent Goals tab sort by % to goal — already implemented as default sort (verified)

## v71 Tasks
- [x] Add timezone column to contacts table (DB migration applied)
- [x] Add timezone to contactInput zod schema (backend router)
- [x] Display timezone + live local time in Contact Info card
- [x] Add Time Zone picker to Edit Contact dialog (Primary tab)

## v72 Tasks — Lead Tag System
- [x] Add tags table and contact_tags junction table to DB schema + apply migration
- [x] Build tags tRPC router (list, create, update, delete, bulkUpload, setContactTags, getContactTags)
- [x] Update contacts list/get procedures to return associated tags
- [x] Build Admin Tags management page (CRUD table + CSV bulk upload + sample CSV download)
- [x] Add Tags nav item to Admin sidebar
- [x] Update ContactDetail: multi-select tag picker + tag chips on contact card
- [x] Update ContactsPage: tag chips in list rows + tag filter dropdown

## v73 Tasks
- [x] Tag Analytics widget on Admin Dashboard — shows each tag name + contact count with proportional bar, sorted by count desc, "Manage" link to /tags, hidden when no tags exist

## v74 Tasks
- [x] Note edit permissions: only author can edit; add editedAt, editedBy, originalText columns to communications table
- [x] Note edit audit trail: record original text, updated text, editor, timestamp in history
- [x] Note edit UI: inline edit form on note card, Edit button visible only to author
- [x] Celebratory confetti: install canvas-confetti, build useCelebration hook
- [x] Confetti trigger: transaction status → Under Contract or Closed
- [x] Confetti trigger: task marked as Completed
- [x] Confetti trigger: agent connection successfully created

## v77 Tasks
- [x] Fix dual agency Convert Listing to Transaction: backend now creates TWO separate transactions (seller-type + buyer-type) instead of one dual record
- [x] Seller transaction: linked to listing, seller contact, seller commission, listingId
- [x] Buyer transaction: linked to buyer contact, buyer commission, buyer notes, same property
- [x] Toast message updated to confirm "2 transactions created" for dual agency

## v78 Tasks — Commission Split & Payout Logic Fix
- [ ] Fix duplicate lead source allocation: upsert instead of insert for lead source payout records
- [ ] Restore group leader split: calculate group leader % from agent's net portion after Savvy 20% + referral
- [ ] Enforce one payout per recipient per transaction (agent, savvy, lead source, group leader)
- [ ] Recalculation: clear/update existing payout records on recalc instead of appending
- [ ] Admin override: validate total allocation does not exceed 100% GCI
- [ ] Verify commission splits feed correctly into Commission & Payouts reporting

## v78 Tasks — Commission Split & Payout Logic Fix
- [x] Fix duplicate lead source allocation: upsertAutoPayoutItem instead of createPayoutItem (idempotent per payeeType per transaction)
- [x] Restore group leader split: isInGroup correctly true when agent has membership AND groupLeaderSplit > 0
- [x] Enforce one payout per recipient per transaction via upsertAutoPayoutItem
- [x] Recalculation: delete ALL auto-generated payouts before regenerating (not just non-override)
- [x] Admin override: validate total allocation does not exceed 100% GCI before saving
- [x] Commission splits feed correctly into Commission & Payouts reporting (no schema changes needed)

## v79 Tasks — Back to Active Workflow
- [x] Backend: listings.backToActive procedure — terminates linked transactions, updates listing price/commission, sets status to active
- [x] Frontend: Back to Active dialog in ListingDetail — required price + commission fields, only shown for under_contract listings
- [x] Activity log entry for back-to-active event

## v80 Tasks — Back to Active Improvements
- [x] Show terminated transaction links section on re-activated listing detail
- [x] Allow assigned agent (not just admin) to trigger Back to Active
- [x] Surface reason field in listing activity log display for back_to_active events

## v81 Tasks — Mandatory Contact Linking
- [x] Listing create/edit: seller contact required (backend Zod + frontend validation)
- [x] Transaction create: buyer + seller contacts required (backend Zod + frontend validation)
- [x] Conversion dialog: buyer contact required before conversion can complete

## v82 Tasks — GCI Calculator
- [x] Auto-calculate GCI from Purchase Price * Commission % in TransactionDetail
- [x] Manual override flag: GCI field stays editable; track if user has manually edited it
- [x] Recalculate button: appears when price or commission % changes after a manual GCI edit
- [x] Downstream: final GCI feeds correctly into commission split logic and reporting

## v83 Tasks — GCI Auto-Calc & Commission Split Preview

- [x] Upgrade CommissionFields in creation wizard to support manual GCI override + recalculate button
- [x] Add buyer-side GCI auto-calc to buyer edit dialog in TransactionDetail
- [x] Add live commission split preview panel to transaction edit dialog
- [x] Add getCommissionPreview tRPC endpoint (reads agent profile, group membership, runs commission engine)

## v84 — Full Lender Deprecation
- [ ] Remove lender from role enum in drizzle/schema.ts
- [ ] Remove contactLenderAccess, lenderConfig, lenderIntroLog table definitions from schema
- [ ] Remove lenderRouter from server/routers.ts
- [ ] Delete server/routers/lender.ts
- [ ] Remove lender DB helpers from server/marketMatch.db.ts
- [ ] Remove lender test blocks from server/marketMatch.hub.test.ts
- [ ] Delete client/src/components/GrantLenderAccessDialog.tsx
- [ ] Remove Lender Access button, state, and dialog from ContactDetail.tsx
- [ ] Drop contact_lender_access, lender_config, lender_intro_log tables from DB
- [ ] Migrate any existing lender-role users to agent_support
- [ ] Update documentation (Lender guide removed, rollout plan updated)

## v85 — Full Lead Tag System Removal
- [ ] Remove tags and contact_tags table definitions from drizzle/schema.ts
- [ ] Remove tagsRouter import and registration from server/routers.ts
- [ ] Delete server/routers/tags.ts
- [ ] Remove contactTags import and tagId filter from server/db.ts
- [ ] Remove tagId param from contacts.list in server/routers/contacts.ts
- [ ] Delete client/src/pages/TagsAdminPage.tsx
- [ ] Remove TagsAdminPage route from App.tsx
- [ ] Remove Lead Tags nav item from AppLayout.tsx
- [ ] Remove tag picker dialog, tag display, allTags query from ContactDetail.tsx
- [ ] Remove tag filter, Tags column, tag badges from ContactsPage.tsx
- [ ] Remove Tag Analytics widget, TAG_COLOR_HEX, tagStats from AdminDashboard.tsx
- [ ] Drop tags and contact_tags tables from DB

## v85 — Full Lead Tag System Removal
- [x] Remove tags and contact_tags table definitions from drizzle/schema.ts
- [x] Delete server/routers/tags.ts router file
- [x] Remove tagsRouter import and registration from server/routers.ts
- [x] Remove tagId filter param from server/routers/contacts.ts list query
- [x] Remove tags/contactTags imports and tagId filter logic from server/db.ts
- [x] Remove TagsAdminPage import and /tags route from client/src/App.tsx
- [x] Remove Lead Tags nav entry from client/src/components/AppLayout.tsx
- [x] Remove all tag queries, state, display blocks, and picker dialog from ContactDetail.tsx
- [x] Remove tag filter dropdown, Tags column header, and row badges from ContactsPage.tsx
- [x] Remove tagColorClass import, TAG_COLOR_HEX, tagStats query, and Tag Analytics widget from AdminDashboard.tsx
- [x] Delete client/src/pages/TagsAdminPage.tsx file
- [x] Clear all rows from contact_tags and tags DB tables (data cleanup)

## v86 — Email/Password Auth (Replace Manus OAuth)
- [x] Add passwordHash, passwordResetToken, passwordResetExpiry columns to users table
- [x] Install bcryptjs for password hashing
- [x] Add DB helpers: setPassword, setResetToken, clearResetToken, getUserByResetToken
- [x] Simplify sdk.ts authenticateRequest to resolve user by openId from JWT (no Manus OAuth sync)
- [x] Add auth.login tRPC procedure (email + bcrypt verify → sign JWT → set session cookie)
- [x] Add auth.forgotPassword tRPC procedure (generate reset token, send email via Resend)
- [x] Add auth.resetPassword tRPC procedure (verify token, set new password, clear token)
- [x] Add auth.adminSetPassword tRPC procedure (admin-only: set any user's password directly)
- [x] Add password_reset email template to resendEmail.ts
- [x] Seed tyler@savvy.realty with bcrypt-hashed initial password (Savvy2026!)
- [x] Build LoginPage.tsx (email/password form, replaces Manus OAuth button)
- [x] Build ForgotPasswordPage.tsx (email input, sends reset link)
- [x] Build ResetPasswordPage.tsx (reads token from URL, sets new password)
- [x] Register /login, /forgot-password, /reset-password routes in App.tsx
- [x] Update AuthGuard to redirect to /login instead of OAuth URL
- [x] Update useAuth.ts to redirect to /login instead of OAuth URL
- [x] Update main.tsx to redirect to /login on UNAUTHORIZED errors
- [x] Update AppLayout.tsx to redirect to /login instead of OAuth URL
- [x] Update DashboardLayout.tsx to redirect to /login instead of OAuth URL
- [x] Add Set Password dialog to UsersPage (admin can set any user's password with confirmation)
- [x] Add KeyRound icon button to each user row in Users table


## v88 — Sub-Source Mandatory Agreement Upload
- [x] Add agreementUrl and agreementKey columns to lead_sources table (DB migration)
- [x] Update drizzle/schema.ts with new columns
- [x] Add /api/upload/lead-source-agreement upload route to uploadRoutes.ts (S3 storage)
- [x] Update leadSources.create and leadSources.update procedures to accept/store agreement fields
- [x] Add mandatory Upload Agreement field to Add Sub-Source dialog (required for new sub-sources)
- [x] Show existing agreement with View/Replace buttons when editing a sub-source
- [x] Show file preview (name + remove button) after selecting a new file
- [x] Block save with clear error message if no agreement uploaded for new sub-sources
- [x] Show FileText icon button on each sub-source row to view agreement (opens in new tab)
- [x] Upload state: button shows "Uploading..." while file is being sent to S3

## Analytics & Reports — Financial Performance Tab
- [x] `getFinancialPerformanceSummary` db-analytics helper: closed/UC counts, volumes, GCI, gross commission, net commission, company dollars, referral payouts, group leader splits
- [x] `getMasterMetrics` db-analytics helper: per-transaction breakdown with payout aggregation by type, sortable, filterable by date/agent/group/market/status
- [x] `analytics.financialPerformanceSummary` tRPC procedure (admin-protected)
- [x] `analytics.masterMetrics` tRPC procedure (admin-protected)
- [x] FinancialPerformanceTab.tsx: Transaction Volume & Status KPI cards (Closed, UC, Total GCI, Company Dollars)
- [x] FinancialPerformanceTab.tsx: Financial Performance Metrics KPI cards (Gross Commission, Net Commission, Group Leader Splits, Referral Payouts)
- [x] FinancialPerformanceTab.tsx: Commission Breakdown pie chart
- [x] FinancialPerformanceTab.tsx: Closed vs Under Contract volume bar chart
- [x] FinancialPerformanceTab.tsx: Master Metrics Table with sortable columns (Close Date, Purchase Price, GCI, Company Dollars), status filter, CSV export, and totals row
- [x] Wired "Financial Performance" into AnalyticsPage REPORT_CATEGORIES sidebar (admin-only)
- [x] Vitest unit tests for financial calculation logic (7 tests passing)
