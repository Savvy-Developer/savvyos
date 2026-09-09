import mysql from "mysql2/promise";
import { extractAirbnbListingId, extractAirbnbPhotoUrls } from "../server/airbnbListing";

type ProformaRow = { id: number; formData: unknown };
type CompReference = { proformaId: number; compIndex: number };
type ParsedProforma = { id: number; formData: Record<string, any> };

const RAPIDAPI_HOST = "airbnb-search.p.rapidapi.com";
const CONCURRENCY = 4;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

function parseFormData(value: unknown): Record<string, any> | null {
  try {
    const parsed = typeof value === "string"
      ? JSON.parse(value)
      : Buffer.isBuffer(value)
        ? JSON.parse(value.toString("utf8"))
        : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, any> : null;
  } catch {
    return null;
  }
}

async function fetchListingPhoto(listingId: string, rapidApiKey: string): Promise<string | null> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`https://${RAPIDAPI_HOST}/stays/detail?listingId=${encodeURIComponent(listingId)}`, {
        headers: {
          "x-rapidapi-host": RAPIDAPI_HOST,
          "x-rapidapi-key": rapidApiKey,
        },
      });
      if (!response.ok) {
        if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < 3) {
          await sleep(attempt * 1_000);
          continue;
        }
        return null;
      }
      const data = await response.json() as { status?: boolean; data?: unknown };
      if (!data.status || !data.data) return null;
      return extractAirbnbPhotoUrls(data.data, 1)[0] ?? null;
    } catch {
      if (attempt < 3) await sleep(attempt * 1_000);
    }
  }
  return null;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  if (!rapidApiKey) throw new Error("RAPIDAPI_KEY is required.");

  const connection = await mysql.createConnection(databaseUrl);
  try {
    const [rows] = await connection.query<ProformaRow[]>("SELECT id, formData FROM proformas");
    const proformas = new Map<number, ParsedProforma>();
    const listingReferences = new Map<string, CompReference[]>();

    for (const row of rows) {
      const formData = parseFormData(row.formData);
      if (!formData || !Array.isArray(formData.comps)) continue;
      proformas.set(row.id, { id: row.id, formData });
      formData.comps.forEach((comp: any, compIndex: number) => {
        if (typeof comp?.photoUrl === "string" && comp.photoUrl.trim()) return;
        const listingId = extractAirbnbListingId(comp?.link);
        if (!listingId) return;
        const references = listingReferences.get(listingId) ?? [];
        references.push({ proformaId: row.id, compIndex });
        listingReferences.set(listingId, references);
      });
    }

    const listingIds = [...listingReferences.keys()];
    const photosByListing = new Map<string, string>();
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, listingIds.length) }, async () => {
      while (cursor < listingIds.length) {
        const listingId = listingIds[cursor++];
        const photoUrl = await fetchListingPhoto(listingId, rapidApiKey);
        if (photoUrl) photosByListing.set(listingId, photoUrl);
      }
    }));

    const changedProformaIds = new Set<number>();
    let updatedComps = 0;
    for (const [listingId, photoUrl] of photosByListing) {
      for (const reference of listingReferences.get(listingId) ?? []) {
        const proforma = proformas.get(reference.proformaId);
        const comp = proforma?.formData.comps?.[reference.compIndex];
        if (!comp || (typeof comp.photoUrl === "string" && comp.photoUrl.trim())) continue;
        comp.photoUrl = photoUrl;
        changedProformaIds.add(reference.proformaId);
        updatedComps += 1;
      }
    }

    for (const proformaId of changedProformaIds) {
      const proforma = proformas.get(proformaId)!;
      await connection.execute("UPDATE proformas SET formData = ?, updatedAt = NOW() WHERE id = ?", [
        JSON.stringify(proforma.formData),
        proformaId,
      ]);
    }

    console.log(JSON.stringify({
      scannedProformas: rows.length,
      missingPhotoListings: listingIds.length,
      recoveredListings: photosByListing.size,
      recoveredComps: updatedComps,
      updatedProformas: changedProformaIds.size,
      stillMissingListings: listingIds.length - photosByListing.size,
    }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
