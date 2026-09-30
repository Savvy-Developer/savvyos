/**
 * The Meta (Facebook/Instagram) product catalog feed for the public site.
 *
 * The old savvy-agents.com served one at /api/meta-catalog: a CSV of every
 * live listing in Meta's catalog format, fetched by Commerce Manager for
 * property ads. This is the same feed from SavvyOS's website listings, at
 * /newsite/meta-catalog.csv and, for when the domain moves, at the old
 * /api/meta-catalog address too, so a feed schedule pointed at the old URL
 * keeps working.
 *
 * Same columns as the old feed. A listing imported from the old site keeps
 * its old id, so Meta sees the same catalog items rather than new ones.
 * Published listings only; nothing gated on the site (the agent's note, the
 * revenue range) is in here.
 */
import type { Express, Request } from "express";
import { and, desc, eq } from "drizzle-orm";

import { properties, websiteProperties } from "../drizzle/schema";
import { getDb } from "./db";

const publicHost = (process.env.PUBLIC_LANDING_PAGE_HOST || "home.savvy-agents.com").toLowerCase();
const publicHosts = new Set([publicHost, `www.${publicHost}`]);
const ORIGIN = `https://${publicHost}`;

export const META_CATALOG_PATHS = ["/newsite/meta-catalog.csv", "/api/meta-catalog"];

export type CatalogRow = {
  id: number;
  slug: string;
  headline: string | null;
  address: string;
  city: string | null;
  state: string | null;
  listPrice: string | number | null;
  heroImageUrl: string | null;
  galleryImageUrls: unknown;
  projectedRevenue: string | number | null;
  importedData: unknown;
  createdAt: Date | string | null;
};

const HEADERS = ["id", "title", "description", "availability", "condition", "price", "link", "image_link", "date created"];

export function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

/** "mm/dd/yyyy, hh:MM AM" in US Eastern time, the old feed's format. */
export function catalogDate(value: Date | string | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${get("month")}/${get("day")}/${get("year")}, ${get("hour")}:${get("minute")} ${get("dayPeriod").toUpperCase()}`;
}

function firstImage(row: CatalogRow): string | null {
  if (row.heroImageUrl && /^https?:\/\//i.test(row.heroImageUrl)) return row.heroImageUrl;
  const gallery = Array.isArray(row.galleryImageUrls) ? row.galleryImageUrls : [];
  const url = gallery.find(item => typeof item === "string" && /^https?:\/\//i.test(item));
  return (url as string | undefined) ?? null;
}

/** The old feed's description: place, and the return when the listing has a projection. */
export function catalogDescription(row: Pick<CatalogRow, "city" | "state" | "listPrice" | "projectedRevenue">): string {
  const place = [row.city, row.state].filter(Boolean).join(", ");
  const price = Number(row.listPrice);
  const revenue = Number(row.projectedRevenue);
  const roi = price > 0 && revenue > 0 ? ((revenue / price) * 100).toFixed(1) : null;
  return `📍 Located in ${place}${roi ? ` | 🔥 Projected Return: ${roi}% ROI` : ""}`;
}

export function buildMetaCatalogCsv(rows: CatalogRow[], origin: string): string {
  const lines = [HEADERS.join(",")];
  for (const row of rows) {
    const image = firstImage(row);
    const imported = row.importedData as { source?: string; oldId?: string } | null;
    const id = imported?.source === "savvy-agents.com" && imported.oldId ? imported.oldId : `savvyos-${row.id}`;
    const price = Number(row.listPrice);
    lines.push(
      [
        csvEscape(id),
        csvEscape(row.headline || row.address),
        csvEscape(catalogDescription(row)),
        csvEscape(image ? "in stock" : "out of stock"),
        csvEscape("new"),
        csvEscape(Number.isFinite(price) && price > 0 ? Math.round(price) : 0),
        csvEscape(`${origin}/newsite/properties/${row.slug}`),
        csvEscape(image ?? ""),
        csvEscape(catalogDate(row.createdAt)),
      ].join(",")
    );
  }
  // The BOM tells Meta's fetcher the file is UTF-8 (the description has emoji).
  return `﻿${lines.join("\n")}`;
}

async function loadCatalogRows(): Promise<CatalogRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: websiteProperties.id,
      slug: websiteProperties.slug,
      headline: websiteProperties.headline,
      address: properties.address,
      city: properties.city,
      state: properties.state,
      listPrice: properties.listPrice,
      heroImageUrl: websiteProperties.heroImageUrl,
      galleryImageUrls: websiteProperties.galleryImageUrls,
      projectedRevenue: websiteProperties.projectedRevenue,
      importedData: websiteProperties.importedData,
      createdAt: websiteProperties.createdAt,
    })
    .from(websiteProperties)
    .innerJoin(properties, eq(websiteProperties.propertyId, properties.id))
    .where(and(eq(websiteProperties.status, "published")))
    .orderBy(desc(websiteProperties.publishedAt));
}

function isPublicHost(req: Request) {
  const host = (req.hostname || req.headers.host || "").split(":")[0].toLowerCase();
  return publicHosts.has(host);
}

/** Registered before the public host's /api guard, so /api/meta-catalog is reachable there. */
export function registerWebsiteMetaCatalog(app: Express) {
  app.get(META_CATALOG_PATHS, async (req, res, next) => {
    if (!isPublicHost(req)) return next();
    try {
      const csv = buildMetaCatalogCsv(await loadCatalogRows(), ORIGIN);
      res
        .status(200)
        .set({
          "Content-Type": "text/csv; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          "Content-Disposition": 'attachment; filename="meta-catalog.csv"',
        })
        .send(csv);
    } catch (error) {
      console.error("[MetaCatalog] Feed failed:", error);
      res.status(500).type("text/plain").send("Catalog unavailable");
    }
  });
}
