import type { Request } from "express";

/**
 * Analytics tags for the public website (home.savvy-agents.com/newsite).
 *
 * The old savvy-agents.com loads Google Tag Manager (GTM-NHP839WJ, which
 * carries GA4 and the Meta pixel) and Microsoft Clarity on every page. The new
 * site has to load the same container before the domain moves, or analytics
 * and ad conversion tracking stop on switch day.
 *
 * Tags go on every /newsite page, including sign-in, account pages and the
 * not-found page, because the old site had them everywhere. They never go on
 * the SavvyOS app itself (os.savvy-agents.com) or on landing pages, which
 * carry their own per-page tracking settings.
 *
 * Railway can override either id, or set it to "off" to stop loading it:
 *   WEBSITE_GTM_ID      default GTM-NHP839WJ
 *   WEBSITE_CLARITY_ID  default x7g7afshlc
 */
const DEFAULT_GTM_ID = "GTM-NHP839WJ";
const DEFAULT_CLARITY_ID = "x7g7afshlc";

const publicHost = (process.env.PUBLIC_LANDING_PAGE_HOST || "home.savvy-agents.com").toLowerCase();
const publicHosts = new Set([publicHost, `www.${publicHost}`]);

export type WebsiteTags = { head: string; body: string };

function configured(value: string | undefined, fallback: string, pattern: RegExp) {
  const raw = (value ?? fallback).trim();
  if (!raw || raw.toLowerCase() === "off") return null;
  return pattern.test(raw) ? raw : null;
}

export function websiteGtmId(env: NodeJS.ProcessEnv = process.env) {
  return configured(env.WEBSITE_GTM_ID, DEFAULT_GTM_ID, /^GTM-[A-Z0-9]{4,12}$/);
}

export function websiteClarityId(env: NodeJS.ProcessEnv = process.env) {
  return configured(env.WEBSITE_CLARITY_ID, DEFAULT_CLARITY_ID, /^[a-z0-9]{6,20}$/);
}

export function isWebsitePageRequest(host: string, path: string) {
  const cleanHost = host.split(":")[0].toLowerCase();
  if (!publicHosts.has(cleanHost)) return false;
  return path === "/newsite" || path.startsWith("/newsite/");
}

/** The tag markup for a request, or null when the request is not a website page. */
export function websiteTagsForRequest(
  req: Pick<Request, "hostname" | "headers" | "path">,
  env: NodeJS.ProcessEnv = process.env
): WebsiteTags | null {
  const host = req.hostname || String(req.headers.host || "");
  if (!isWebsitePageRequest(host, req.path)) return null;
  const gtm = websiteGtmId(env);
  const clarity = websiteClarityId(env);
  if (!gtm && !clarity) return null;

  const head: string[] = [];
  const body: string[] = [];
  if (gtm) {
    // Google's standard container snippet. The id is validated above, so it
    // is safe to place inside the script.
    head.push(
      `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtm}');</script>`
    );
    body.push(
      `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${gtm}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`
    );
  }
  if (clarity) {
    head.push(
      `<script>(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${clarity}");</script>`
    );
  }
  return { head: head.join("\n    "), body: body.join("\n    ") };
}

/** Puts the container at the top of <head> (as Google asks) and the noscript fallback at the top of <body>. */
export function injectWebsiteTags(html: string, tags: WebsiteTags | null | undefined) {
  if (!tags) return html;
  let out = html;
  if (tags.head) out = out.replace(/<head([^>]*)>/i, `<head$1>\n    ${tags.head}`);
  if (tags.body) out = out.replace(/<body([^>]*)>/i, `<body$1>\n    ${tags.body}`);
  return out;
}
