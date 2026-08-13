# Pulse Scope Foundation Design

## Governing decision

The improvement blueprint supersedes the prior Pulse foundation where the two differ. The new foundation is therefore centered on one first-class **Scope** instead of separate meeting, team, and 1:1 registries. The previous Pulse tables contain no production records, so they can be retired safely in the replacement migration rather than being preserved as another runtime source of truth.

## Canonical model

| Canonical object | Purpose | Key rule |
|---|---|---|
| `pulse_people` | A business person who may hold memberships, ownership, assignments, attendance, and notification-recipient relationships | A person does not require a login. |
| `pulse_person_accounts` | Explicit relationship between a Pulse person and a SavvyOS authenticated account (`users`) | Authentication is never inferred from a missing email, credential, or boolean. |
| `pulse_scopes` | Universal Pulse container for `company`, `l10`, `team`, `one_on_one`, and `private` contexts | Each business item has one primary scope; archive is a state transition here. |
| `pulse_scope_memberships` | A person’s active relationship and capability within a scope | Replaces parallel meeting grants, team membership, and 1:1 viewers. |
| `pulse_l10_settings` | L10-only registry configuration, attached to the L10 scope | Meeting cadence is configuration, not a separate access model. |
| `pulse_calendar_config`, `pulse_reporting_periods`, `pulse_holidays` | The single calendar authority | No page or future object service computes fiscal/week/due-window rules itself. |
| `pulse_domain_events` | Typed, append-only Pulse events | Database constraints and triggers prevent malformed payload classes and updates/deletes. |

## Scope semantics

| Scope type | Typical use | Membership policy | Access policy |
|---|---|---|---|
| `company` | Company-wide operating context | Active accounts | Active accounts or explicit membership, as configured |
| `l10` | Configurable L10 meeting and work destination | Explicit membership | Members; facilitators/managers own meeting administration |
| `team` | Operational team context | Explicit membership | Members |
| `one_on_one` | Direct manager/employee operating context | Explicit membership | Members or explicit viewers, as configured |
| `private` | Personal work context | Owner-only | Owner-only |

An inactive scope is unavailable before any membership, management role, or configuration entitlement is considered. This archive gate applies equally to scope discovery, direct resource read, and every policy question.

## Central policy service

`server/pulse/policy.ts` owns the named decision functions required by the blueprint: `canView`, `canCreate`, `canAssign`, `canVote`, `canManageMeeting`, and `canDeliver`. The API router and UI call query contracts that delegate to this service; neither repeats membership rules. The global Super Permissions capability `canViewPulse` only controls access to the Admin configuration surface. It does not grant visibility to an otherwise inaccessible scope.

## Person and account model

All existing SavvyOS accounts are backfilled to a `pulse_people` record and an explicit `pulse_person_accounts` link. Directory-only people can be created without a `users` record and may still become members, owners, attendees, assignees, or recipients. Existing SavvyOS authentication remains unchanged; only linked accounts can act as authenticated Pulse users.

## Calendar service

`server/pulse/calendar.ts` reads the active `pulse_calendar_config`, reporting periods, and holidays. Its local-time routines derive fiscal year, operating week, reporting-period membership, holiday status, and due-window boundaries from a single IANA timezone configuration. UI or object-specific code does not calculate week or fiscal boundaries.

## Event stream

`pulse_domain_events` uses a database `ENUM` for event type plus type-specific JSON `CHECK` constraints. Database triggers reject updates and deletes, making the stream append-only. `server/pulse/events.ts` is the sole writer used by scope, membership, and calendar mutations.

## Migration decision

The previous separate Pulse registry tables are empty in production. Migration `0017_pulse_scope_foundation.sql` therefore creates the canonical scope foundation, backfills people/account links from existing SavvyOS users, and removes the unused legacy Pulse registry tables. No business record migration is required.

## Foundation acceptance slice

The foundation exposes a query-led Admin Pulse tab that can configure and inspect a team, L10, 1:1, private scope, calendar settings, and event stream. The same `visibleScopes` query drives the UI for all scope types. A direct API access check and UI resource list both resolve visibility through the same policy service; archived scopes are filtered before role or membership evaluation.
