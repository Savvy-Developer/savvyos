import type mysql from "mysql2/promise";
import type { MlsFeedType, MlsProvider } from "../../drizzle/mlsSchema";
import { adapterFor } from "./adapters";
import type { FeedLicense } from "./license";

type Connection = Awaited<ReturnType<typeof mysql.createConnection>>;

/**
 * Feeds Savvy has licensed, declared in code so they exist in production
 * without a hand-entered admin form. Created once, only when the source has no
 * feed for the same provider and license type. An admin's later edits
 * (disable, photo policy, license expiry) are never overwritten.
 *
 * Tokens are not here. Each credentialRef resolves to a Railway variable:
 *   MLSGRID_BBO -> MLS_CRED_MLSGRID_BBO_TOKEN (Canopy and MARIS BBO subscription)
 *   MLSGRID     -> MLS_CRED_MLSGRID_TOKEN     (MARIS IDX subscription)
 * Until a variable is set, the worker marks that feed "Credentials not
 * configured" and skips it.
 *
 * Canopy runs on BBO only. Its BBO feed is a superset of IDX (2.6M records vs
 * 1.16M, including canceled and expired), and each record keeps MLS Grid's
 * MlgCanUse flags in mls_listings.permittedUses, so the public site can later
 * show only IDX-permitted listings. A second Canopy IDX feed would duplicate
 * every listing.
 */
export type DeclaredMlsFeed = {
  sourceCode: string;
  name: string;
  provider: MlsProvider;
  feedType: MlsFeedType;
  credentialRef: string;
  license: FeedLicense;
};

export const DECLARED_MLS_FEEDS: DeclaredMlsFeed[] = [
  {
    sourceCode: "canopy",
    name: "Canopy BBO (MLS Grid)",
    provider: "mls_grid",
    feedType: "bbo",
    credentialRef: "MLSGRID_BBO",
    license: {
      approved: true,
      internalUse: true,
      reference: "Canopy MLS back office (BBO) via MLS Grid. Agreement signed 2026-09-29; BBO access confirmed 2026-09-30.",
    },
  },
  {
    sourceCode: "maris",
    name: "MARIS IDX (MLS Grid)",
    provider: "mls_grid",
    feedType: "idx",
    credentialRef: "MLSGRID",
    license: {
      approved: true,
      internalUse: true,
      reference: "MARIS IDX via MLS Grid. Access confirmed 2026-09-30; added on Tyler Coon's instruction.",
    },
  },
  {
    sourceCode: "maris",
    name: "MARIS BBO (MLS Grid)",
    provider: "mls_grid",
    feedType: "bbo",
    credentialRef: "MLSGRID_BBO",
    license: {
      approved: true,
      internalUse: true,
      reference: "MARIS (NEW) back office via MLS Grid. Two active Savvy OS licenses confirmed on the BBO subscription 2026-10-02; enabled on Tyler Coon's instruction.",
    },
  },
];

export async function ensureDeclaredMlsFeeds(connection: Connection, feeds: DeclaredMlsFeed[] = DECLARED_MLS_FEEDS) {
  // The web service and the worker can boot at the same moment. A named lock
  // keeps them from both inserting the same feed (there is no unique index).
  const [lock] = await connection.query<any[]>("SELECT GET_LOCK('savvyos_mls_declared_feeds', 15) AS got");
  if (Number(lock[0]?.got) !== 1) {
    console.warn("[mlsFeeds] another process is creating declared feeds; skipping");
    return [];
  }
  try {
    return await createMissingFeeds(connection, feeds);
  } finally {
    await connection.query("SELECT RELEASE_LOCK('savvyos_mls_declared_feeds')");
  }
}

async function createMissingFeeds(connection: Connection, feeds: DeclaredMlsFeed[]) {
  const created: string[] = [];
  for (const declared of feeds) {
    const [sources] = await connection.query<any[]>(
      "SELECT id, onboardingStatus, originatingSystemName, keyPrefix FROM `mls_sources` WHERE code = ? LIMIT 1",
      [declared.sourceCode]
    );
    const source = sources[0];
    if (!source) continue;
    const [existing] = await connection.query<any[]>(
      "SELECT id FROM `mls_feeds` WHERE sourceId = ? AND provider = ? AND feedType = ? LIMIT 1",
      [source.id, declared.provider, declared.feedType]
    );
    if (existing.length) {
      if (declared.provider === "mls_grid") {
        // One-time migration only. Subsequent admin changes to the interval or
        // photo policy are never overwritten by another deploy.
        await connection.query(
          `UPDATE mls_feeds
             SET options = JSON_SET(COALESCE(options, JSON_OBJECT()), '$.fastImportV1', true),
                 syncIntervalMinutes = 5, mediaPolicy = 'primary_only'
           WHERE id = ? AND JSON_EXTRACT(options, '$.fastImportV1') IS NULL`,
          [existing[0].id]
        );
      }
      continue;
    }
    if (!source.originatingSystemName) {
      console.warn(`[mlsFeeds] ${declared.sourceCode} has no OriginatingSystemName; not creating ${declared.name}`);
      continue;
    }
    await connection.query(
      `INSERT INTO \`mls_feeds\`
        (sourceId, name, provider, feedType, baseUrl, originatingSystemName, keyPrefix, credentialRef, options, enabled, syncIntervalMinutes, mediaPolicy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, true, ?, ?)`,
      [
        source.id,
        declared.name,
        declared.provider,
        declared.feedType,
        adapterFor(declared.provider).defaultBaseUrl,
        source.originatingSystemName,
        source.keyPrefix ?? null,
        declared.credentialRef,
        JSON.stringify({ license: declared.license, declaredInCode: true, fastImportV1: declared.provider === "mls_grid" }),
        declared.provider === "mls_grid" ? 5 : 15,
        "primary_only",
      ]
    );
    if (["planned", "conditional", "applied"].includes(String(source.onboardingStatus))) {
      await connection.query("UPDATE `mls_sources` SET onboardingStatus = 'approved' WHERE id = ?", [source.id]);
    }
    created.push(declared.name);
  }
  if (created.length) console.log(`[mlsFeeds] created declared feeds: ${created.join(", ")}`);
  return created;
}
