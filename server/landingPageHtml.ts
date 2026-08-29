import type { Request } from "express";
import { and, eq } from "drizzle-orm";
import { landingPages } from "../drizzle/schema";
import { getDb } from "./db";

const publicHost = (process.env.PUBLIC_LANDING_PAGE_HOST || "home.savvy-agents.com").toLowerCase();
const reservedPublicPaths = new Set(["", "login", "admin", "api", "assets", "healthz", "partner-lead", "careers", "talent-profile"]);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type LandingTrackingSettings = {
  metaPixelId?: string | null;
  ga4MeasurementId?: string | null;
  googleAdsId?: string | null;
  googleAdsConversionLabel?: string | null;
  customHeadCode?: string | null;
};

type LandingMetadata = {
  slug: string;
  pageTitle: string;
  metaDescription: string | null;
  socialImageUrl: string | null;
  noindex: boolean;
  trackingSettings: LandingTrackingSettings;
};

function requestHost(req: Request) {
  return (req.hostname || req.headers.host || "").split(":")[0].toLowerCase();
}

function requestSlug(req: Request) {
  const path = req.path.replace(/^\/+|\/+$/g, "");
  if (path.includes("/")) return null;
  const slug = path.toLowerCase();
  if (reservedPublicPaths.has(slug) || !slugPattern.test(slug)) return null;
  return slug;
}

function textSetting(settings: unknown, key: keyof LandingTrackingSettings, maxLength: number) {
  const value = (settings as Record<string, unknown> | null)?.[key];
  return typeof value === "string" ? value.trim().slice(0, maxLength) || null : null;
}

export function normalizeLandingTrackingSettings(settings: unknown): LandingTrackingSettings {
  const metaPixelId = textSetting(settings, "metaPixelId", 32);
  const ga4MeasurementId = textSetting(settings, "ga4MeasurementId", 64)?.toUpperCase() ?? null;
  const googleAdsId = textSetting(settings, "googleAdsId", 64)?.toUpperCase() ?? null;
  const googleAdsConversionLabel = textSetting(settings, "googleAdsConversionLabel", 255);
  const customHeadCode = textSetting(settings, "customHeadCode", 20_000);
  return {
    metaPixelId: metaPixelId && /^\d{5,32}$/.test(metaPixelId) ? metaPixelId : null,
    ga4MeasurementId: ga4MeasurementId && /^G-[A-Z0-9]{4,}$/i.test(ga4MeasurementId) ? ga4MeasurementId : null,
    googleAdsId: googleAdsId && /^AW-\d{4,}$/i.test(googleAdsId) ? googleAdsId : null,
    googleAdsConversionLabel,
    customHeadCode,
  };
}

export async function getLandingPageMetadata(req: Request): Promise<LandingMetadata | null> {
  if (requestHost(req) !== publicHost) return null;
  const slug = requestSlug(req);
  if (!slug) return null;
  const db = await getDb();
  if (!db) return null;
  const [page] = await db.select({
    slug: landingPages.slug,
    pageTitle: landingPages.pageTitle,
    metaDescription: landingPages.metaDescription,
    socialImageUrl: landingPages.socialImageUrl,
    noindex: landingPages.noindex,
    trackingSettings: landingPages.trackingSettings,
  }).from(landingPages).where(and(
    eq(landingPages.slug, slug),
    eq(landingPages.status, "published"),
  )).limit(1);
  if (!page) return null;
  return { ...page, trackingSettings: normalizeLandingTrackingSettings(page.trackingSettings) };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function metaTag(attribute: "name" | "property", key: string, content: string) {
  return `<meta ${attribute}="${key}" content="${escapeHtml(content)}" />`;
}

function trackingTags(settings: LandingTrackingSettings) {
  const googleTagId = settings.ga4MeasurementId || settings.googleAdsId;
  const tags: string[] = [];
  if (settings.metaPixelId) {
    const pixelId = JSON.stringify(settings.metaPixelId);
    tags.push(`<script>(function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)})(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${pixelId});fbq('track','PageView');</script>`);
  }
  if (googleTagId) {
    tags.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleTagId)}"></script>`);
    tags.push(`<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());${settings.ga4MeasurementId ? `gtag('config',${JSON.stringify(settings.ga4MeasurementId)});` : ""}${settings.googleAdsId ? `gtag('config',${JSON.stringify(settings.googleAdsId)});` : ""}</script>`);
  }
  // This field is intentionally reserved for administrator-managed vendor snippets.
  // It is injected only on the corresponding published public page, never in the OS app.
  if (settings.customHeadCode) tags.push(settings.customHeadCode);
  return tags.join("\n    ");
}

/** Injects crawlable metadata and configured vendor tags before the client application starts. */
export function injectLandingPageHtml(html: string, metadata: LandingMetadata | null) {
  if (!metadata) return html;
  const canonicalUrl = `https://${publicHost}/${metadata.slug}`;
  const title = metadata.pageTitle || "Savvy STR Agents";
  const tags = [
    metaTag("name", "description", metadata.metaDescription || ""),
    metaTag("property", "og:title", title),
    metaTag("property", "og:description", metadata.metaDescription || ""),
    metaTag("property", "og:type", "website"),
    metaTag("property", "og:url", canonicalUrl),
    metaTag("name", "twitter:card", metadata.socialImageUrl ? "summary_large_image" : "summary"),
    metaTag("name", "twitter:title", title),
    metaTag("name", "twitter:description", metadata.metaDescription || ""),
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`,
    metadata.noindex ? metaTag("name", "robots", "noindex, nofollow") : "",
    metadata.socialImageUrl ? `${metaTag("property", "og:image", metadata.socialImageUrl)}\n    ${metaTag("name", "twitter:image", metadata.socialImageUrl)}` : "",
    trackingTags(metadata.trackingSettings),
  ].filter(Boolean).join("\n    ");
  const titleTag = `<title>${escapeHtml(title)}</title>`;
  const withTitle = /<title>[\s\S]*?<\/title>/i.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/i, titleTag)
    : html.replace(/<head([^>]*)>/i, `<head$1>\n    ${titleTag}`);
  return withTitle.replace(/<\/head>/i, `    ${tags}\n  </head>`);
}
