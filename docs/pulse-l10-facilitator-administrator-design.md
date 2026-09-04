# Pulse L10 Facilitator and Administrator Design

## Roles

Every active Level 10 has two separately stored meeting-level roles. The **Facilitator** supports agenda labeling and meeting-health reporting. The **Administrator** is accountable for the meeting workspace and is authorized to start, resume, and close that specific L10.

Both role holders must be active members of the meeting. Neither role changes the person’s general SavvyOS role, Pulse permission-matrix grants, or membership in another L10.

## Required assignment

L10 creation requires both `facilitatorId` and `administratorId`; the choices may identify the same member. Activation and configuration saves reject an active L10 that is missing either assignment. Legacy meetings with an empty role receive clear configuration-required messaging rather than silently granting authority.

A role holder cannot be removed from meeting participants until their role is reassigned. The meeting settings screen presents a required two-column role assignment card before the participant list, and the meeting overview shows both names.

## Run authority

The `run_l10s` Pulse matrix capability remains the governing capability for users generally. In addition, an assigned active L10 Administrator receives meeting-scoped run authority for their own meeting only. The server enforces this condition on start, resume, session update, and close. The Facilitator alone does not gain run authority.
