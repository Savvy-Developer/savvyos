# Reporting Suite Expansion Specification

This document defines the backend contracts, filters, and evidence tables for the five new decision-ready reports being added to the SavvyOS Reporting suite. These designs are grounded in the live production data audited on July 29, 2026.

## 1. Agent Onboarding Report
**Goal:** Track onboarding velocity, identify stalled agents, and surface overdue tasks holding up production readiness.
* **Filters:** Date range (based on instance `startedAt`), Agent (for isolating specific users).
* **Summary Metrics:**
  * Active Instances
  * Completed Instances
  * Average Days to Complete
  * Total Overdue Tasks
  * On-Time Completion Rate (tasks finished on or before `dueDate`)
* **Charts:**
  * **Onboarding Funnel:** Active vs. Completed by start month.
* **Evidence Table (Active Instances):**
  * Agent Name
  * Template Name
  * Start Date
  * Progress (Completed / Total Tasks)
  * Overdue Tasks
  * Next Due Date (if any)

## 2. Market Analytics Report
**Goal:** Evaluate geographic market health, agent capacity, and investor matching activity.
* **Filters:** Market Status (Active, Recruiting, Paused, Future).
* **Summary Metrics:**
  * Active Markets
  * Assigned Agents
  * Available Lead Capacity (sum of `maxLeadCapacity` - `currentLeadCount` where `isAvailable = true`)
  * Market Match Sessions (last 30 days)
* **Charts:**
  * **Market Assignment Distribution:** Top markets by agent count.
* **Evidence Table (Markets):**
  * Market Name
  * State
  * Status
  * Primary Agents
  * Available Capacity
  * Match Sessions (All Time)
  * Annual GCI Goal (if set)

## 3. Tasks Report
**Goal:** Analyze operational workload, overdue volume, and completion velocity across the team.
* **Filters:** Date range (based on `dueDate`), Agent (Assignee), Status (Pending, In Progress, Completed), Priority.
* **Summary Metrics:**
  * Total Open Tasks
  * Overdue Tasks
  * Completed Tasks (in period)
  * High/Urgent Open Tasks
* **Charts:**
  * **Task Completion Trend:** Open vs. Completed by week/month.
  * **Task Type Distribution:** Bar chart of open tasks by `taskType`.
* **Evidence Table (Task Details):**
  * Title
  * Assignee
  * Priority
  * Status
  * Type
  * Due Date
  * Related Entity (Contact/Transaction/Property)

## 4. ISA Activities Report
**Goal:** Measure ISA pipeline health, contact progression, and Market Match session outcomes.
* **Filters:** ISA (Agent ID where role = 'isa'), Date range (based on session/contact updates).
* **Summary Metrics:**
  * Total Assigned Contacts
  * Active Clients (contacts in `active_client` status)
  * Completed Match Sessions
  * Average Session Confidence Score
* **Charts:**
  * **ISA Pipeline Distribution:** Contacts grouped by `isa_status`.
* **Evidence Table (Recent Match Sessions):**
  * Contact Name
  * ISA Name
  * Session Status
  * Duration
  * Confidence Score
  * Completed At
  * Recommended Agent

## 5. Lead Sources Report
**Goal:** Evaluate acquisition volume and downstream conversion quality by lead source.
* **Filters:** Campaign Type (Buyer, Seller, Both), Active Status.
* **Summary Metrics:**
  * Total Sources
  * Total Contacts Generated
  * Contacts Under Contract / Closed
  * Closed Volume (from linked transactions)
* **Charts:**
  * **Top Sources by Volume:** Bar chart of contact count by source.
  * **Conversion Quality:** Bar chart of closed transactions by source.
* **Evidence Table (Source Performance):**
  * Source Name
  * Campaign Type
  * Active Status
  * Total Contacts
  * Active Clients
  * Under Contract
  * Closed Contacts
  * Closed Volume
