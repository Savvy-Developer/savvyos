export type EmailSignatureProvider = {
  getRenderedSignatureHtml(userEmail: string): Promise<string | null>;
};

/**
 * WiseStamp does not publish a customer-facing rendered-signature API contract.
 * Keep the provider boundary explicit so the documented WiseStamp endpoint,
 * authentication headers, account ID, regional base URL, response schema, and
 * caching rules can be added without changing the Pipeline send workflow.
 *
 * Until WiseStamp enables API access and supplies that contract, returning null
 * intentionally sends the email without a signature rather than guessing a
 * private endpoint or blocking all Pipeline email delivery.
 */
export const wiseStampSignatureProvider: EmailSignatureProvider = {
  async getRenderedSignatureHtml(_userEmail: string) {
    return null;
  },
};
