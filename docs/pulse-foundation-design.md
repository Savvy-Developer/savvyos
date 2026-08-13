# Pulse Foundation Design

## Purpose

This first Pulse increment adds the **administrative foundation** for SavvyOS’s operating system: a permission-gated Admin entry, a normalized meeting registry, a single per-person meeting entitlement, an explicit Full User versus Teammate distinction, and access-derived navigation data. It intentionally does not create the later runner, scorecard, work-item, communication, reminder, team dashboard, or 1:1 dashboard surfaces.

## Authorization model

| Layer | Source of truth | Effect |
|---|---|---|
| Pulse tab visibility | `admin_permissions.canViewPulse` | Determines whether an administrator receives the Pulse entry in the SavvyOS Admin sidebar and may call Pulse configuration procedures. |
| Meeting access | `pulse_meeting_access` | One active row per `(meetingId, userId)`; `member` and `facilitator` are the only levels. A facilitator is a user with an active `facilitator` entitlement, not a role shortcut. |
| Team access | `pulse_team_members` membership | Team dashboards resolve visibility from active direct membership. This is distinct from project-workspace memberships, and a linked meeting never grants team access. |
| 1:1 access | Direct participants plus `pulse_one_on_one_access` | Participants are the normal authority; active explicit viewer grants cover additional authorized readers. Administrator status alone does not create 1:1 visibility. |
| Archive gate | `pulse_meetings.isActive` | Checked before any privilege or meeting-access check. Inactive meetings are omitted from normal discovery, content, navigation, reminders, and access queries. |

The new Pulse procedures contain **no user-email or user-ID visibility exceptions**. Existing generic SavvyOS protected-admin behavior remains inside the centralized Super Permissions resolver and is not treated as Pulse authorization.

## People model

The live `users` record remains SavvyOS’s person directory. A new `personType` column distinguishes `full_user` from `teammate`. All existing accounts migrate as `full_user`.

| Person type | Authentication | Pulse access / notifications / assignments | Intended use |
|---|---|---|---|
| `full_user` | May authenticate if otherwise active and credentialed | May receive explicit meeting access; later may be assigned work and notifications | Employees and operating participants |
| `teammate` | Blocked even if a credential is mistakenly present | Cannot receive Pulse access, assignments, or notifications | Accountability-chart and reference directory records |

## Meeting registry

`pulse_meetings` is durable configuration, not a meeting-session table. The registry records a stable key, display name, weekday and local start time, IANA timezone, facilitator reference, duration, configured section visibility, active/archive state, archive actor/note, and audit timestamps. The generator validates that the nominated facilitator is an active Full User, atomically creates the meeting, and creates the facilitator’s canonical entitlement plus any selected member entitlements.

The initial foundation also persists active-only `pulse_teams` / `pulse_team_members` and `pulse_one_on_ones` / `pulse_one_on_one_access` tables. The navigation resolver returns no team or 1:1 name unless its caller has the relevant active direct membership, participant relationship, or explicit viewer relationship. Their operating dashboards and configuration screens remain intentionally deferred to later Pulse increments.

The facilitator reference is descriptive configuration. The active `pulse_meeting_access` record remains the authorization source of truth; generator and facilitator-change procedures maintain the two invariants together.

## Navigation contract

`pulse.getNavigation` only returns active resources that the effective Full User can open. The response places operational resources under **Operate** and makes no static list of inaccessible meeting, team, or 1:1 names. The remaining product-boundary groups—**Plan**, **Communicate**, **Analyze**, and **Administer**—are represented only when Pulse adds accessible resources to them. The Admin sidebar entry itself remains a centralized SavvyOS configuration capability, gated by `canViewPulse`.

## Initial API surface

| Procedure | Authorization | Result |
|---|---|---|
| `pulse.getRegistry` | Pulse tab entitlement; active facilitator/member entitlement per returned meeting | Accessible active registry records with facilitator and access summary |
| `pulse.getDirectory` | Pulse tab entitlement | Active Full Users for facilitator/member assignment |
| `pulse.getNavigation` | Authenticated Full User | Access-derived active meeting, team, and 1:1 resource groups; no static resource list is returned |
| `pulse.createMeeting` | Pulse tab entitlement | Creates a registry record and normalized entitlements atomically |
| `pulse.updateMeeting` | Active facilitator entitlement | Updates configuration while preserving registry/access invariants |
| `pulse.replaceMeetingAccess` | Active facilitator entitlement | Replaces all non-revoked meeting grants using member/facilitator records only |
| `pulse.archiveMeeting` | Active facilitator entitlement | Deactivates a meeting and records archive attribution; subsequent normal queries omit it before authorization evaluation |
| `pulse.reactivateMeeting` | Pulse tab entitlement plus known registry identifier | Restores a deactivated registry record without recreating historical configuration or access records |

## Explicitly deferred

The additional operating surfaces—team dashboards, 1:1 dashboards, meeting sessions, scorecards, universal work items, notifications, and reporting—will be added in later prompts. They will reuse the present registry and scope resolvers while maintaining the same separation between visibility, ownership, destination, notification eligibility, and active/archive state; they will not add legacy per-user access booleans.
