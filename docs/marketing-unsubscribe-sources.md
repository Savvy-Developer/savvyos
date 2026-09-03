# Marketing Unsubscribe Implementation Sources

Resend states that the `{{{RESEND_UNSUBSCRIBE_URL}}}` merge variable is automatically managed only for **Broadcasts and Automations**, not messages sent with the Emails API. SavvyOS Smart Plan and one-time campaign sends use the Emails API, so their previous literal placeholder could not become a functional recipient-specific link.

For Emails API sends, Resend recommends a `List-Unsubscribe` header containing a URL. For RFC 8058 one-click unsubscribe, bulk email should include `List-Unsubscribe-Post: List-Unsubscribe=One-Click`; the URL must accept a `POST` and return a blank `200` or `202`, while `GET` serves the normal unsubscribe page.

Sources:

1. [Resend: Add an unsubscribe link to transactional emails](https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails)
2. [Resend: Do you need to add an unsubscribe link to all emails?](https://resend.com/docs/knowledge-base/should-i-add-an-unsubscribe-link)
