# SavvyOS Coaching Hub: Comprehensive Gap Analysis

**Date:** July 31, 2026
**Author:** Manus AI

This document provides a systematic gap analysis comparing the 2,964-line Coaching Hub prompt specifications against the actual shipped implementation in the `savvyos` repository. The goal is to identify every missing feature, incomplete workflow, and deviation from the spec, establishing a clear roadmap for the rebuild.

## Executive Summary

The prompt requested a comprehensive "operating system for agent success" featuring deep AI synthesis, integrated production/pipeline data, a staged session workspace, and full historical tracking. 

The shipped implementation is effectively a **lightweight CRUD application** for sessions and commitments. It lacks almost all of the required intelligence, integration, and operational workflows. 

### Major Missing Systems

1. **Coaching Command Center:** Completely missing. The top-level page (`CoachingHubPage.tsx`) is just a roster table, lacking the 19 required metrics, 23 action queues, and the AI Agent Success Brief.
2. **AI Synthesis & Intelligence:** The prompt requires AI to synthesize goals, production, CRM activity, tasks, and historical sessions into a unified pre-session brief and agent diagnosis. The shipped backend (`coaching.ts`) only implements two narrow AI calls: summarizing a single session's text and summarizing an uploaded assessment.
3. **Session Workspace & Media:** The prompt requires a staged workspace (`Prepare → Conduct → AI Process → Review → Commit → Schedule Next`) with live browser recording, file uploads, and automatic transcription. The shipped session page (`CoachingSessionPage.tsx`) is a simple form with textareas for notes and no media or transcription capabilities.
4. **Data Integration:** The prompt requires deep integration with existing goals, production, pipeline, leads, and tasks. The shipped backend only fetches a tiny subset of production stats (`getAgentProductionStats`) and does not integrate goals or CRM data into the coaching workflows.
5. **Operational Workflows:** The New-Agent Launch System (automation beyond profile creation), Market Coverage views, Capacity Escalations UI, and Reports/Scorecards are entirely missing from the frontend.

---

## Detailed Gap Analysis by Prompt Section

### Section 6: Existing Goals Integration
- **Required:** Display existing annual/quarterly goals, show actual/projected performance, link commitments to goals, surface goals during sessions, and compare goals to pipeline.
- **Shipped:** The backend schema includes a `relatedGoalId` on commitments, but there is no UI to select goals, no goal progress visualization on the agent page, and no goal context in the session workspace.

### Section 7: New-Agent Creation Integration
- **Required:** Auto-create profile, set to Launch, create 90-day Launch Plan, connect to goals, queue for setup, require Coach of Record and first session assignment within 14 days.
- **Shipped:** `users.ts` auto-creates a profile with status "Launch", but fails to create a Launch Plan, connect goals, or enforce the 14-day session scheduling requirement.

### Section 10: Coaching Command Center
- **Required:** A high-information dashboard with 19 top-level metrics, 23 specific action queues (e.g., "Sessions due today", "Launch agents at risk"), and an AI-generated Agent Success Brief synthesizing organizational changes.
- **Shipped:** Does not exist. The default route `/coaching` renders an agent roster table.

### Section 11: Agent Portfolio
- **Required:** A table with 34 specific columns (including under-contract volume, forecasts, pipeline coverage, lead age, overdue tasks), 22 filters, 16 saved views, and bulk actions.
- **Shipped:** A basic table with 7 columns, 3 filters, 0 saved views, and 0 bulk actions.

### Section 12: Individual Agent Coaching Page
- **Required:** A central intelligence page with 17 specific header fields and 11 required tabs (Overview, AI Coaching Insights, Performance, Goals, Pipeline and Leads, Coaching History, Commitments, Assessments, Performance Reset, Market Context, Files and Recordings).
- **Shipped:** A shell page with basic header chips, 4 production cards, and only 4 tabs (Sessions, Commitments, Assessments, Performance Reset). 

### Section 13: Required AI Coaching Insights
- **Required:** An agent-level AI synthesis analyzing all historical sessions, commitments, goals, production, CRM activity, and assessments to produce an executive summary, diagnosis, recommended style, agenda, and questions.
- **Shipped:** Completely missing. The backend has no endpoint for this, and the frontend has no UI for it.

### Section 15: Complete Agent Performance Data
- **Required:** Deep data visualization for Production (13 metrics), Commission benchmarking, Terminations (9 metrics), Leads (17 metrics), Pipeline (20 metrics), and Tasks (12 metrics).
- **Shipped:** Only 4 basic metrics (Trailing 90 Units/Volume, Under Contract Units/Volume) are fetched and displayed.

### Section 16 & 17: Session Scheduling & Workspace
- **Required:** Enforced cadence rules, next-session requirements, and a staged workspace (`Prepare → Conduct → AI Process → Review → Commit → Schedule Next`) with a split view for the coaching brief, live notes/recording, and actions.
- **Shipped:** A basic single-page form. No enforced cadence, no staged workflow, no split view, and no pre-session brief.

### Section 18 & 19: Recording, Transcription & AI Processing
- **Required:** Live browser recording, audio/video/transcript uploads, automatic transcription, and a human review screen to approve AI-extracted commitments and summaries.
- **Shipped:** No recording or upload capabilities. The AI summary generation (`generateSessionSummary`) parses commitments into text, but there is no structured approval workflow to convert them into actual `coachingCommitments` rows.

### Section 25: Commitments System
- **Required:** Centralized system visible across dashboards, sessions, and resets, tracking completion rates and repeatedly missed commitments.
- **Shipped:** Basic CRUD exists, but it lacks the required cross-surface visibility, AI confidence tracking, and analytics.

### Section 26-32: Operational Systems (Resets, Escalations, Markets, Reports)
- **Required:** Formal 30-day Performance Resets, Capacity Escalations, Market Coverage views, Productive-Agent Retention tracking, and 8 specific Reports/Scorecards.
- **Shipped:** Backend schemas and basic CRUD exist for Resets, Escalations, and Coach-Outs, but the frontend lacks UIs for Escalations, Market Coverage, Retention, and Reports.

### Section 34: Coaching Settings
- **Required:** Configuration UI for performance bands, cadences, templates, triggers, and AI prompts.
- **Shipped:** Backend schema exists, but no frontend UI.

---

## Rebuild Roadmap

To achieve 100% compliance with the prompt, the following phases will be executed:

1. **Backend Expansion:** Build missing endpoints for command-center queues, agent-level AI synthesis, comprehensive data fetching (goals, pipeline, leads, tasks), file uploads, and historical snapshots.
2. **Command Center:** Build the true `/coaching` landing page with the AI brief, metrics, and 23 action queues.
3. **Agent Portfolio:** Upgrade the roster table with all 34 columns, filters, and saved views.
4. **Agent Page:** Implement the 11 required tabs, including the critical AI Coaching Insights and full performance data views.
5. **Session Workspace:** Rebuild `/coaching/session/:id` into the staged `Prepare → Conduct → AI Process → Review` workflow, adding recording and upload capabilities.
6. **Operational Pages:** Build UIs for Market Coverage, Capacity Escalations, Reports, and Settings.
