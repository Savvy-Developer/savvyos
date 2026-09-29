/**
 * Named events for Google Tag Manager on the public website.
 *
 * The names and fields match what the old savvy-agents.com pushed
 * (src/lib/analytics.ts there), so any trigger already set up in the GTM
 * container for them keeps working after the move.
 */
export type SellPlacement = "hero" | "nav" | "footer";

export type WebsiteAnalyticsEvent =
  | { event: "sell_cta_click"; placement: SellPlacement; destination: string }
  | { event: "seller_lead_submitted"; timeline: string }
  | { event: "website_lead_submitted"; intent: string; requestType?: string };

type DataLayerWindow = Window & { dataLayer?: unknown[] };

/**
 * Fire and forget. If Tag Manager is blocked or not loaded this does nothing,
 * and it can never stop a click or a form from working.
 */
export function trackWebsiteEvent(payload: WebsiteAnalyticsEvent): void {
  if (typeof window === "undefined") return;
  try {
    const w = window as DataLayerWindow;
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push(payload);
  } catch {
    // Deliberately silent.
  }
}
