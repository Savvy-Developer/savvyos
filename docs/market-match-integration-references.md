# Market Match Integration References

## Calendly

Calendly supports organization- or user-scoped webhook subscriptions for `invitee.created` (confirmed scheduling) and `invitee.canceled` (cancellations). The invitee URI supplied by the webhook can be used to retrieve invitee details and custom-question answers.

Source: [Calendly, Create a Webhook Subscription](https://developer.calendly.com/receive-data-from-scheduled-events-in-real-time-with-webhook-subscriptions), accessed 2026-09-06.

Calendly supports `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, and `utm_term` either in the embed URL or through the advanced JavaScript widget initialization. Values must be fewer than 255 characters.

Source: [Calendly, Source track your embed with UTM parameters](https://calendly.com/help/how-to-source-track-your-calendly-embed-with-utm-parameters), accessed 2026-09-06.

### Production Subscription Checklist

The SavvyOS endpoint is `https://os.savvy-agents.com/api/webhooks/calendly`. Create an organization- or user-scoped Calendly subscription for both `invitee.created` and `invitee.canceled`, with the endpoint protected by the Railway-held `CALENDLY_WEBHOOK_SECRET` query value. The subscription should receive the `utm_content` value attached by SavvyOS, which is limited to a non-identifying Market Match session and handoff reference; it never contains a buyer's email, phone number, or other personal data. SavvyOS records a provider-confirmed booking or cancellation only when that tracking value resolves to a Market Match handoff.

## Resend

Resend Contacts API supports creating contacts with email, first and last name, global unsubscribe state, custom properties, segment membership, and topic subscriptions. The application uses the configured daily-property audience ID only after explicit buyer opt-in.

Source: [Resend, Create Contact API](https://resend.com/docs/api-reference/contacts/create-contact), accessed 2026-09-06.
