# Market Match Integration References

## Calendly

Calendly supports organization- or user-scoped webhook subscriptions for `invitee.created` (confirmed scheduling) and `invitee.canceled` (cancellations). The invitee URI supplied by the webhook can be used to retrieve invitee details and custom-question answers.

Source: [Calendly, Create a Webhook Subscription](https://developer.calendly.com/receive-data-from-scheduled-events-in-real-time-with-webhook-subscriptions), accessed 2026-09-06.

Calendly supports `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, and `utm_term` either in the embed URL or through the advanced JavaScript widget initialization. Values must be fewer than 255 characters.

Source: [Calendly, Source track your embed with UTM parameters](https://calendly.com/help/how-to-source-track-your-calendly-embed-with-utm-parameters), accessed 2026-09-06.

## Resend

Resend Contacts API supports creating contacts with email, first and last name, global unsubscribe state, custom properties, segment membership, and topic subscriptions. The application uses the configured daily-property audience ID only after explicit buyer opt-in.

Source: [Resend, Create Contact API](https://resend.com/docs/api-reference/contacts/create-contact), accessed 2026-09-06.
