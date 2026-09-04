import { marketMatchSettings } from "../drizzle/schema";
import { getDb } from "./db";

export const DEFAULT_MAX_RECOMMENDED_MARKETS = 5;
export const MIN_RECOMMENDED_MARKETS = 3;
export const MAX_RECOMMENDED_MARKETS = 5;

export type MarketMatchSettingsValue = {
  enabled: boolean;
  maxRecommendedMarkets: number;
  updatedAt: Date | null;
  updatedById: number | null;
};

/**
 * Keeps an omitted or malformed persisted value from reducing call coverage
 * unexpectedly. The settings UI only accepts 3–5; this server-side guard is
 * the final authority for call sessions and future programmatic writes.
 */
export function normalizeMaxRecommendedMarkets(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < MIN_RECOMMENDED_MARKETS ||
    parsed > MAX_RECOMMENDED_MARKETS
  ) {
    return DEFAULT_MAX_RECOMMENDED_MARKETS;
  }
  return parsed;
}

export async function getMarketMatchSettings(
  database?: Awaited<ReturnType<typeof getDb>>
): Promise<MarketMatchSettingsValue> {
  const db = database ?? (await getDb());
  if (!db) throw new Error("Database unavailable");
  const [settings] = await db.select().from(marketMatchSettings).limit(1);
  if (!settings) {
    return {
      enabled: true,
      maxRecommendedMarkets: DEFAULT_MAX_RECOMMENDED_MARKETS,
      updatedAt: null,
      updatedById: null,
    };
  }
  return {
    enabled: Boolean(settings.enabled),
    maxRecommendedMarkets: normalizeMaxRecommendedMarkets(
      settings.maxRecommendedMarkets
    ),
    updatedAt: settings.updatedAt ?? null,
    updatedById: settings.updatedById ?? null,
  };
}

export async function saveMarketMatchSettings(input: {
  enabled: boolean;
  maxRecommendedMarkets: number;
  updatedById: number;
}): Promise<MarketMatchSettingsValue> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const maxRecommendedMarkets = normalizeMaxRecommendedMarkets(
    input.maxRecommendedMarkets
  );
  await db
    .insert(marketMatchSettings)
    .values({
      id: 1,
      enabled: input.enabled,
      maxRecommendedMarkets,
      updatedById: input.updatedById,
    })
    .onDuplicateKeyUpdate({
      set: {
        enabled: input.enabled,
        maxRecommendedMarkets,
        updatedById: input.updatedById,
        updatedAt: new Date(),
      },
    });
  return getMarketMatchSettings(db);
}
