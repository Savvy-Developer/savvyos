# Email Integration Research

## Resend

- Resend's batch endpoint accepts up to 100 email payloads in one API request. Each email can have a distinct recipient, subject, HTML body, and Reply-To address. Source: https://resend.com/docs/api-reference/emails/send-batch-emails
- A mass send of up to 250 contacts therefore requires at most three batch calls (100, 100, 50). Source: https://resend.com/docs/dashboard/emails/batch-sending
- Batch requests support idempotency keys. Keys must be unique per request, have a maximum length of 256 characters, and are retained for 24 hours. Source: https://resend.com/docs/dashboard/emails/idempotency-keys
- Resend states that all accounts begin with a 10-request-per-second rate limit, batch requests count as one request, free transactional accounts are limited to 100 emails per day, and paid transactional plans have no daily platform quota but do have monthly quotas. Source: https://resend.com/docs/knowledge-base/account-quotas-and-limits
- Resend recommends its Broadcasts product for marketing campaigns, while the batch API is documented for sending multiple transactional emails with unique content. Source: https://resend.com/docs/dashboard/emails/batch-sending

## WiseStamp

- WiseStamp's public integration pages describe centralized management and vendor-managed integrations, but do not publish a customer-facing endpoint or response schema for retrieving rendered signature HTML. Sources: https://www.wisestamp.com/features/integrate/ and https://www.wisestamp.com/features/manage/
- WiseStamp's copy/paste instructions confirm that rendered signature HTML can be exported manually from the Employee Hub by selecting Copy/Paste and then HTML Code. Source: https://support.wisestamp.com/en/articles/12561475-deploy-your-signature-using-copy-paste
- Zoho's documented WiseStamp integration states that an organization administrator must obtain a WiseStamp API key and Account ID by contacting WiseStamp Support. It also requires users' email addresses to match in both systems. Source: https://www.zoho.com/mail/help/wisestamp-integration.html
- WiseStamp documents region-specific endpoints for EU-resident accounts, so the integration must also confirm whether the account is in the US/default or EU environment. Source: https://support.wisestamp.com/en/articles/12561423-data-security-and-privacy-at-wisestamp

## WiseStamp Access Needed

Request from WiseStamp Support or the account Customer Success Manager:

1. API access enabled for the Savvy organization.
2. The WiseStamp Account ID.
3. An API key or other documented authentication credentials.
4. The correct base URL for the account's region.
5. The endpoint and parameters for retrieving a user's currently assigned rendered signature HTML by email address.
6. A sample response and documented error behavior.
7. API rate limits and caching guidance.

Do not guess or reverse-engineer private WiseStamp endpoints. The application should use a provider boundary and remain operational without a signature until WiseStamp supplies the documented contract.
