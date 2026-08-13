# Pulse Communication Domain

## Single domain and lifecycle

`pulse_communications` stores cascades and announcements. A communication has a source Scope for provenance and one or more explicit target Scope records. Publishing is a state transition from draft to published. It snapshots target memberships into a frozen recipient ledger; no later display or delivery query expands Scope membership independently.

The recipient ledger stores one recipient per communication and the target Scope IDs that justified that recipient at publish time. Acknowledgments are one row per recipient and communication. Reactions, if added, are intentionally separate and cannot alter acknowledgment state.

## One notification policy and delivery ledger

Feature mutations create communications and notification intents only. They do not call email, Slack, or any notification transport. `evaluatePulseNotificationPolicy` is the sole evaluator. It checks the target Scope/object-access policy before composition and each time the delivery worker attempts a channel. It uses explicit Scope membership and archive-first Scope state, never platform role.

`pulse_notification_intents` records the requested schedule and channels. `pulse_notification_deliveries` is the delivery ledger and contains a unique deduplication key per intent/channel. A single `processPulseCommunicationDeliveryBatch` worker evaluates pending intents, composes only after an allowed decision, and records delivered, suppressed, skipped, or failed outcomes. The initial Slack adapter intentionally records a configuration-based skip until a managed Slack transport is supplied; no workflow sends directly from a feature mutation.

## Audience equality

Both the audience API and the delivery-audience API read `pulse_communication_recipient_ledger`; neither reads target-Scope membership directly. The recipient display API also uses the same ledger record for the viewer, re-evaluates object access, and returns acknowledgement state from its single per-person row. This makes the delivery audience and displayed audience mechanically comparable as the same frozen ledger IDs.

## Acceptance slice

A rollback-only test creates target Scopes, freezes a two-person cascade ledger, invokes the worker in dry-run mode, verifies delivery and displayed audience IDs match exactly, confirms role does not add an un-targeted person, verifies archive suppresses delivery/display, records one acknowledgment, and proves a duplicate acknowledgment and reaction do not change the acknowledged state.
