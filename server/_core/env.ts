export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  // GoHighLevel (LeadConnector) — outbound contact sync. Sync is no-op when
  // GHL_LOCATION_TOKEN is empty (e.g. local dev) — see server/_core/ghlSync.ts.
  ghlLocationToken: process.env.GHL_LOCATION_TOKEN ?? "",
  ghlLocationId: process.env.GHL_LOCATION_ID ?? "2ZPnQStoB9ZVXSwFdfEw",
};
