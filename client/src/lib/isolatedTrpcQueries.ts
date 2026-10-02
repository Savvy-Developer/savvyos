const isolatedPaths = new Set([
  "analytics.leadCohortConversion",
  "mlsProperties.search",
  "mlsProperties.total",
  "mlsProperties.mapPoints",
  "mlsProperties.listing",
]);

/** Slow unrelated batch members must not delay a property card or map response. */
export const isIsolatedTrpcQuery = (path: string) => isolatedPaths.has(path);
