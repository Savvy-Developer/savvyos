# Agent Production Report — Implementation References

## Railway scheduled tasks

Railway documents that native cron services run a command on a cron expression, expect that command to terminate, schedule in UTC, and do not guarantee exact-to-the-minute execution. This report therefore uses SavvyOS’s existing in-process scheduler with Eastern-time calculations and a durable run record rather than adding a separate Railway cron service.

Source: [Railway Cron Jobs](https://docs.railway.com/cron-jobs)

## Resend delivery idempotency

Resend supports idempotency keys for email-send requests. A duplicate request with the same key is not sent again during the 24-hour retention period. The report uses a per-report-date, per-administrator key as an additional retry safeguard, while the database run record provides durable protection across longer periods.

Sources: [Resend Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys) and [Resend Send Email API](https://resend.com/docs/api-reference/emails/send-email)
