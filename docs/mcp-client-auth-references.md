# Remote MCP OAuth interoperability references

This implementation replaces the original static-header-only MCP connection with OAuth 2.1 for browser-hosted MCP clients. The sources below were consulted on 2026-09-05.

## OpenAI ChatGPT

OpenAI’s [ChatGPT Developer Mode guide](https://developers.openai.com/api/docs/guides/developer-mode) states that remote MCP applications support Streaming HTTP and authentication modes including OAuth, No Authentication, and Mixed Authentication. It notes that OAuth can use dynamic client registration (DCR) and requires action-oriented tools and server instructions.

The [ChatGPT developer-mode and MCP apps help article](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt) directs builders to add the server endpoint, choose the authentication mechanism, scan tools, complete OAuth authorization when prompted, and create/publish the app. It specifically recommends OAuth configurations capable of issuing refresh tokens and advertising `offline_access`, because otherwise access can be lost when the initial authorization expires.

## Anthropic Claude

Anthropic’s [custom connector setup guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) documents adding a remote MCP URL in **Customize → Connectors** for individual users, and **Organization settings → Connectors** for Team/Enterprise Owners. It identifies OAuth as the normal authentication process for remote connectors.

Anthropic’s [building custom connectors guide](https://claude.com/docs/connectors/building) documents Streamable HTTP support, OAuth support for the 2025-03-26, 2025-06-18, and 2025-11-25 MCP authorization specifications, Dynamic Client Registration (DCR), PKCE, token refresh, and the hosted callback `https://claude.ai/api/mcp/auth_callback`.

## MCP specification

The [MCP Authorization specification (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) requires a protected resource server to publish OAuth Protected Resource Metadata and return a `WWW-Authenticate` header pointing to the metadata URL after an unauthenticated 401. It also requires authorization server metadata, PKCE for authorization-code flow, validation of registered redirect URIs, short-lived tokens, refresh-token rotation for public clients, and binding access tokens to the resource indicator.

## SavvyOS outcome

SavvyOS publishes protected-resource and authorization-server metadata, uses Dynamic Client Registration for public clients, uses OAuth authorization code flow with PKCE S256, signs in through an authorized SavvyOS user, grants only `savvyos.read`, issues 60-minute access tokens, and rotates 30-day refresh tokens. Existing static MCP keys remain available only for desktop/CLI clients that can send custom Bearer headers.
