# Pulse API Contract Proof

## Scope

This is a narrow, API-only proof executed before any additional Pulse surfaces are built. It used separate real tRPC callers and inspected returned server payloads; it did not use rendered UI state as evidence.

The self-cleaning fixture created one L10, one Team, one 1:1, one private Scope, and one cross-scope cascade. The cascade Todo had Team as its primary Scope and an intentional normalized L10 placement. The fixture created three callers: **A** (owner of all contexts), **B** (L10, Team, and 1:1 member), and **C** (Team-only member).

## Initial failure

The first raw payload inspection found a server-side isolation defect. `scopeWork(l10)` selected a cascade candidate through its L10 placement, then item-level access evaluated the Todo’s Team primary Scope. Because C could access the Team, the raw response incorrectly included the cascade Todo in C’s L10 payload even though C could not open the L10.

This was not a client-side hiding issue. The item and its source, owner, activity, and access fields were present in the raw tRPC payload.

## Repair

`enrichCanonicalWorkItems` now calls the centralized `canView(requestedScope, actor)` policy before it assembles a Scope-specific response. If the caller cannot open the requested Scope, the server returns an empty array. Item-level access continues to govern personal and notification surfaces, while requested-Scope access governs Scope-specific surfaces.

> A normalized placement can make an item eligible for a Scope query only after the caller is entitled to that requested Scope itself.

## Passing raw-payload assertions

| Server response | Required payload result | Outcome |
|---|---|---|
| A L10 | L10 item and cascade item present | Passed |
| A Team | Team item and cascade item present | Passed |
| A 1:1 | 1:1 item present | Passed |
| A personal | Private item present | Passed |
| B L10 | L10 item and cascade present; Team-only item absent | Passed |
| B Team | Team item and cascade present; L10-only item absent | Passed |
| B 1:1 | 1:1 item present | Passed |
| B personal and notification | Assigned L10, 1:1, and cascade items present; private item absent | Passed |
| C Team | Team item and cascade present; L10, 1:1, and private items absent | Passed |
| C L10 | Empty array; cascade absent from raw server payload | Passed after repair |
| C notifications | Empty array | Passed |

The cascade Todo produced the same **source label**, **owner**, **activity list**, and **item-level access outcome** in A’s L10 response, B’s L10 response, B’s Team response, B’s personal response, and B’s notification response. Its source remained the Team, showing that placement does not rewrite provenance.

All fixture records were deleted after the proof. The raw passing payload is retained outside the repository for delivery with this task.
