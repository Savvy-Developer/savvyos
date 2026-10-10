// SavvyOS MCP uses OAuth 2.1 for every client connection. The allowed list
// controls who may grant the read-only `savvyos.read` scope through ChatGPT,
// Claude, or another standards-compliant remote MCP client.
export const MCP_AUTHORIZED_USER_EMAILS = new Set([
  "tyler@savvy.realty",
  "elana@savvy.realty",
  "dyl@savvy.realty",
  "camilo@savvy.realty",
  "philleone@savvy.realty",
  "scott.asbell@savvy.realty",
  "marcusclay@savvy.realty",
  "birdiehardin@savvy.realty",
  "morganloftus@savvy.realty",
]);

export function isMcpAuthorizedUser(email: string | null | undefined): boolean {
  return !!email && MCP_AUTHORIZED_USER_EMAILS.has(email.trim().toLowerCase());
}
