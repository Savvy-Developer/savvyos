# Swoogo Integration Verification — 2026-09-09

Swoogo’s current developer documentation confirms that its REST API base URL is `https://api.swoogo.com/api/v1`, OAuth uses a client-credentials grant to `POST /oauth2/token`, and access tokens expire after 30 minutes. The event module therefore uses an expiry-aware, single-flight token manager with a pre-expiry refresh margin and a single retry after a provider `401`.

Swoogo supports webhooks for `event`, `contact`, `registrant`, `speaker`, `sponsor`, `session`, `session_attendance`, and `registrant_line_item`. Webhooks can use JSON payloads and custom request headers. Delivery is retried after failures, so SavvyOS acknowledges a valid Swoogo delivery before deferred processing and records debounced source-verification activity rather than incrementing a counter from the delivery payload.

The registrants endpoint requires an `event_id` query parameter and returns paginated `items`. The current implementation does **not** activate the counting call: the supplied requirements explicitly defer aggregation until the organization confirms whether speakers and sponsors also hold registrant records, the actual registrant-type model, and the de-duplication strategy.

## Sources

1. [Swoogo API introduction](https://developer.swoogo.com/api-reference/introduction)
2. [Swoogo webhooks overview](https://developer.swoogo.com/api-reference/overviews/webhooks)
3. [Swoogo: Get All Registrants](https://developer.swoogo.com/api-reference/registrants/get-all-registrants.md)
