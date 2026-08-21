# SavvyOS Select-Control Audit

## Purpose

This audit reviews the select and combobox controls across the admin, ISA, and agent experiences. The governing rule is straightforward: standard selects remain appropriate for short, mutually exclusive, stable option sets; searchable selects are required for dynamic people, property, market, and contact lists; and searchable multi-select controls are used when users may reasonably apply more than one taxonomy or filter at once.

| Control type | Use when | Examples |
|---|---|---|
| Standard select | Fewer than 15 stable, mutually exclusive choices | Pipeline stage, task priority, status, document type, loan type, time zone |
| Searchable single select | Dynamic or potentially long lists where one record is chosen | Agent, ISA, assignee, contact, property, market, lead source |
| Searchable multi-select | Several values may be relevant or useful as simultaneous filters | Agent Directory markets, states, specialties, languages, production levels, teams |

## Audit Outcome by Experience

| Experience | Audit finding | Result |
|---|---|---|
| Admin | Dynamic agent/ISA assignees and large property lists are high-friction when rendered as ordinary selects. Short workflow/status fields remain fast and clear as standard selects. | Contact-task assignees and existing-property linking now use searchable controls. Existing searchable assignments and lead-source pickers remain in place. |
| ISA | ISA assignment and agent assignment are dynamic people lists; the existing searchable assignment pattern is appropriate. Pipeline and priority controls use small fixed enumerations. | No broad conversion needed beyond the shared client-profile improvements. |
| Agent | The main new directory experience needs compound filtering across multiple markets and characteristics. Pipeline stages, communication type, task type, and priority remain short fixed lists. | The Agent Directory uses searchable multi-select filters. The client profile now has a direct follow-up scheduler, while its existing short task-type and priority selects remain standard. |

## Implemented Improvements

The following changes were made as a result of the audit:

| Surface | Change | Why it improves the workflow |
|---|---|---|
| Agent Directory | Added searchable multi-select filters for market, state, specialty, language, production level, and team. | Agents can locate collaborators across overlapping markets and qualifications without repeated page changes. |
| Agent profile administration | Added searchable multi-select maintenance fields for directory specialties and languages, plus a short production-level select. | Directory data is controlled and easy for administrators to maintain. |
| Contact profile task dialogs | Replaced combined agent/ISA assignee selects with searchable controls. | People lists naturally grow and are faster to search than to scan. |
| Contact profile property linking | Replaced the existing-property select with a searchable address, city, and ZIP picker. | Property inventories are large enough that linear scanning is inefficient. |

## Deliberately Retained Standard Selects

The audit intentionally retains standard select controls for pipeline statuses, task status and priority, communication direction/type, document type, time zone, employment status, role classification, and other short business enumerations. Converting those controls to search would add an unnecessary interaction step without improving selection accuracy.

## Maintenance Standard

New forms should avoid placing more than approximately fifteen dynamic options in a standard select. When a field represents a person, contact, property, market, or other expanding data set, use the shared `SearchableSelect` component for one choice or the shared `MultiSelect` component for several choices. This maintains a consistent, accessible selection experience as SavvyOS grows.
