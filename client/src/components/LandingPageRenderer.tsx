import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Block = { id: string; type: string; content: Record<string, any>; settings?: Record<string, any> };
export type LandingPageDocument = {
  id: number;
  slug: string;
  pageTitle: string;
  metaDescription?: string | null;
  socialImageUrl?: string | null;
  noindex?: boolean;
  trackingSettings?: { metaPixelId?: string | null; ga4MeasurementId?: string | null; googleAdsId?: string | null; googleAdsConversionLabel?: string | null } | null;
  postSubmitType: "inline" | "landing_page" | "external";
  postSubmitMessage?: string | null;
  postSubmitUrl?: string | null;
  pageSettings?: Record<string, any> | null;
  blocks: Block[];
};

type Attribution = { landingUrl: string; referrerUrl?: string | null; utm_source?: string | null; utm_medium?: string | null; utm_campaign?: string | null; utm_term?: string | null; utm_content?: string | null; gclid?: string | null; fbclid?: string | null; fbc?: string | null; fbp?: string | null; deviceCategory?: "mobile" | "tablet" | "desktop" | "other" };

const COLOR = /^#[0-9a-f]{6}$/i;
const safeColor = (value: unknown, fallback: string) => typeof value === "string" && COLOR.test(value) ? value : fallback;
const cleanUrl = (value: unknown) => typeof value === "string" && /^(https?:\/\/|\/|#)/.test(value) ? value : "";

function sessionIdFor(pageId: number) {
  const key = `savvy-landing-session-${pageId}`;
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  sessionStorage.setItem(key, id);
  return id;
}

function cookieValue(name: string) {
  const prefix = `${name}=`;
  return document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length) || null;
}

function buildAttribution(): Attribution {
  const query = new URLSearchParams(window.location.search);
  const width = window.innerWidth;
  const deviceCategory = width < 768 ? "mobile" : width < 1024 ? "tablet" : "desktop";
  return {
    landingUrl: window.location.href,
    referrerUrl: document.referrer || null,
    utm_source: query.get("utm_source"),
    utm_medium: query.get("utm_medium"),
    utm_campaign: query.get("utm_campaign"),
    utm_term: query.get("utm_term"),
    utm_content: query.get("utm_content"),
    gclid: query.get("gclid"),
    fbclid: query.get("fbclid"),
    // `_fbc` is normally set by the pixel; construct the documented click value
    // before the SDK has had a chance to persist it on the first visit.
    fbc: cookieValue("_fbc") || (query.get("fbclid") ? `fb.1.${Date.now()}.${query.get("fbclid")}` : null),
    fbp: cookieValue("_fbp"),
    deviceCategory,
  };
}

function persistentAttribution(pageId: number): Attribution {
  const key = `savvy-landing-attribution-${pageId}`;
  const current = buildAttribution();
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || "null") as { first?: Attribution } | null;
    if (!saved?.first) {
      sessionStorage.setItem(key, JSON.stringify({ first: current }));
      return current;
    }
    const merged = { ...saved.first, ...Object.fromEntries(Object.entries(current).filter(([, value]) => value !== null && value !== "")) } as Attribution;
    sessionStorage.setItem(key, JSON.stringify({ first: saved.first, latest: merged }));
    return merged;
  } catch {
    return current;
  }
}

function scrollToTarget(target: string) {
  if (target.startsWith("#")) document.querySelector(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  else if (target) window.location.assign(target);
}

function trackConversion(page: LandingPageDocument, conversionType: "form" | "calendly") {
  const eventName = conversionType === "calendly" ? "Schedule" : "Lead";
  const params = { content_name: page.slug, content_category: "landing_page", conversion_type: conversionType };
  const windowWithTags = window as any;
  if (typeof windowWithTags.fbq === "function") windowWithTags.fbq("track", eventName, params);
  if (typeof windowWithTags.gtag === "function") {
    windowWithTags.gtag("event", "generate_lead", {
      ...params,
      ...(page.trackingSettings?.googleAdsId && page.trackingSettings?.googleAdsConversionLabel ? { send_to: `${page.trackingSettings.googleAdsId}/${page.trackingSettings.googleAdsConversionLabel}` } : {}),
    });
  }
}

function Section({ block, children }: { block: Block; children: React.ReactNode }) {
  const settings = block.settings ?? {};
  const style = {
    backgroundColor: safeColor(settings.background, "#ffffff"),
    color: safeColor(settings.textColor, "#0f172a"),
  };
  const padding = settings.padding === "small" ? "py-10" : settings.padding === "large" ? "py-20 sm:py-28" : "py-14 sm:py-20";
  return <section id={block.id} className={`${padding} px-5 sm:px-8`} style={style}><div className="mx-auto max-w-6xl">{children}</div></section>;
}

function FormBlock({ block, page, preview }: { block: Block; page: LandingPageDocument; preview: boolean }) {
  const fields = Array.isArray(block.content.fields) ? block.content.fields : [];
  const [answers, setAnswers] = useState<Record<string, any>>(() => Object.fromEntries(fields.map((field: any) => [field.id, field.type === "checkboxes" ? [] : field.defaultValue ?? ""])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [honeypot, setHoneypot] = useState("");
  const [complete, setComplete] = useState(false);
  const submit = trpc.landingPages.submitForm.useMutation({ onSuccess: (result) => {
    if (result.bot) return;
    trackConversion(page, "form");
    if (result.postSubmitType === "external" || result.postSubmitType === "landing_page") {
      if (result.postSubmitUrl) window.location.assign(result.postSubmitUrl);
      return;
    }
    setComplete(true);
  }});

  function setAnswer(id: string, value: unknown) { setAnswers((prior) => ({ ...prior, [id]: value })); setErrors((prior) => ({ ...prior, [id]: "" })); }
  function validate() {
    const next: Record<string, string> = {};
    for (const field of fields) {
      const raw = answers[field.id];
      const empty = Array.isArray(raw) ? raw.length === 0 : raw === undefined || raw === null || String(raw).trim() === "";
      if (field.required && empty) next[field.id] = `${field.label} is required.`;
      if (!empty && (field.type === "email" || field.validation === "email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw).trim())) next[field.id] = "Enter a valid email address.";
      if (!empty && (field.type === "phone" || field.validation === "phone") && String(raw).replace(/\D/g, "").length !== 10) next[field.id] = "Enter a 10-digit phone number.";
    }
    const firstName = fields.find((field: any) => field.type === "first_name");
    const lastName = fields.find((field: any) => field.type === "last_name");
    const email = fields.find((field: any) => field.type === "email");
    const phone = fields.find((field: any) => field.type === "phone");
    if (!firstName || !answers[firstName.id]) next[firstName?.id ?? "_form"] = "First name is required.";
    if (!lastName || !answers[lastName.id]) next[lastName?.id ?? "_form"] = "Last name is required.";
    if ((!email || !answers[email.id]) && (!phone || !answers[phone.id])) next._form = "Please provide an email address or phone number.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }
  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (preview) return;
    if (!validate()) return;
    submit.mutate({ pageId: page.id, sessionId: sessionIdFor(page.id), answers, attribution: persistentAttribution(page.id), honeypot });
  }
  const accent = safeColor(block.settings?.accentColor, "#0d96a5");
  if (complete) return <Section block={block}><div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200"><CheckCircle2 className="mx-auto mb-4 h-11 w-11" style={{ color: accent }} /><h2 className="text-2xl font-bold text-slate-950">Thank you.</h2><p className="mt-3 text-slate-600">{page.postSubmitMessage || "A Savvy STR Agent will be in touch shortly."}</p></div></Section>;
  return <Section block={block}><div id="lead-form" className="mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-9"><h2 className="text-2xl font-bold text-slate-950">{block.content.heading || "Let’s get started"}</h2>{block.content.body && <p className="mt-2 text-slate-600">{block.content.body}</p>}<form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
    <div className="absolute -left-[9999px]" aria-hidden="true"><input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} /></div>
    {fields.filter((field: any) => field.type !== "hidden").map((field: any) => <Field key={field.id} field={field} value={answers[field.id]} setValue={(value) => setAnswer(field.id, value)} error={errors[field.id]} />)}
    {errors._form && <p className="text-sm text-red-600">{errors._form}</p>}
    {submit.error && <p className="text-sm text-red-600">{submit.error.message || "We could not submit your information. Please try again."}</p>}
    <button type="submit" disabled={submit.isPending || preview} className="inline-flex min-h-12 w-full items-center justify-center rounded-lg px-5 text-base font-semibold text-white transition hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: accent }}>{submit.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</> : preview ? "Preview only" : block.content.submitText || "Submit"}</button>
  </form></div></Section>;
}

function Field({ field, value, setValue, error }: { field: any; value: any; setValue: (value: any) => void; error?: string }) {
  const id = `field-${field.id}`;
  const label = <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-800">{field.label}{field.required && <span className="ml-1 text-red-600">*</span>}</label>;
  if (field.type === "sms_consent") return <div className="rounded-lg border border-slate-200 p-3"><label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700"><input type="checkbox" checked={value === true} onChange={(event) => setValue(event.target.checked)} className="mt-0.5 h-4 w-4" /><span>{field.consentLanguage || field.label}</span></label>{error && <p className="mt-1 text-xs text-red-600">{error}</p>}</div>;
  if (field.type === "radio") return <div>{label}<div className="space-y-2">{(field.options || []).map((option: string) => <label key={option} className="flex items-center gap-2 text-sm text-slate-700"><input type="radio" name={field.id} checked={value === option} onChange={() => setValue(option)} />{option}</label>)}</div>{error && <p className="mt-1 text-xs text-red-600">{error}</p>}</div>;
  if (field.type === "checkboxes") return <div>{label}<div className="space-y-2">{(field.options || []).map((option: string) => <label key={option} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={Array.isArray(value) && value.includes(option)} onChange={(event) => setValue(event.target.checked ? [...(value || []), option] : (value || []).filter((item: string) => item !== option))} />{option}</label>)}</div>{error && <p className="mt-1 text-xs text-red-600">{error}</p>}</div>;
  if (field.type === "dropdown") return <div>{label}<select id={id} value={value || ""} onChange={(event) => setValue(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 focus:border-cyan-600 focus:outline-none"><option value="">Select an option</option>{(field.options || []).map((option: string) => <option key={option} value={option}>{option}</option>)}</select>{error && <p className="mt-1 text-xs text-red-600">{error}</p>}</div>;
  const type = field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text";
  return <div>{label}{field.type === "long_text" ? <textarea id={id} value={value || ""} onChange={(event) => setValue(event.target.value)} rows={4} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:border-cyan-600 focus:outline-none" /> : <input id={id} type={type} value={value || ""} onChange={(event) => setValue(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-slate-900 focus:border-cyan-600 focus:outline-none" />}{error && <p className="mt-1 text-xs text-red-600">{error}</p>}</div>;
}

function CalendlyBlock({ block, page, preview }: { block: Block; page: LandingPageDocument; preview: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const recordedBooking = useRef(false);
  const recordBooking = trpc.landingPages.recordCalendlyBooking.useMutation({ onSuccess: (result) => {
    if (result.bot) return;
    trackConversion(page, "calendly");
    if ((result.postSubmitType === "external" || result.postSubmitType === "landing_page") && result.postSubmitUrl) window.location.assign(result.postSubmitUrl);
  }, onError: () => { recordedBooking.current = false; }});
  const calendarUrl = cleanUrl(block.content.url);
  const popup = block.content.display === "popup";
  useEffect(() => {
    if (preview || !calendarUrl) return;
    const scriptId = "savvy-calendly-widget";
    const initialize = () => {
      const Calendly = (window as any).Calendly;
      if (!Calendly || popup || !container.current) return;
      container.current.innerHTML = "";
      const attribution = persistentAttribution(page.id);
      Calendly.initInlineWidget({ url: calendarUrl, parentElement: container.current, utm: { utmSource: attribution.utm_source || undefined, utmMedium: attribution.utm_medium || undefined, utmCampaign: attribution.utm_campaign || undefined, utmContent: attribution.utm_content || undefined, utmTerm: attribution.utm_term || undefined } });
    };
    if ((window as any).Calendly) initialize();
    else {
      const script = document.getElementById(scriptId) as HTMLScriptElement | null || Object.assign(document.createElement("script"), { id: scriptId, src: "https://assets.calendly.com/assets/external/widget.js", async: true });
      script.addEventListener("load", initialize, { once: true });
      if (!script.parentNode) document.body.appendChild(script);
    }
    return () => { if (container.current) container.current.innerHTML = ""; };
  }, [calendarUrl, page.id, popup, preview]);
  useEffect(() => {
    if (preview) return;
    const listener = (event: MessageEvent) => {
      if (!event.origin.includes("calendly.com") || event.data?.event !== "calendly.event_scheduled") return;
      if (recordedBooking.current) return;
      recordedBooking.current = true;
      const payload = event.data.payload || {};
      recordBooking.mutate({ pageId: page.id, sessionId: sessionIdFor(page.id), eventUri: payload.event?.uri, inviteeUri: payload.invitee?.uri, attribution: persistentAttribution(page.id) });
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [page.id, preview, recordBooking]);
  const accent = safeColor(block.settings?.accentColor, "#0d96a5");
  return <Section block={block}><div className="mx-auto max-w-3xl text-center"><h2 className="text-2xl font-bold text-slate-950">{block.content.heading || "Book a time to connect"}</h2>{block.content.body && <p className="mx-auto mt-2 max-w-xl text-slate-600">{block.content.body}</p>}{preview ? <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500">Calendly preview: {calendarUrl || "Add a Calendly event URL"}</div> : popup ? <button onClick={() => (window as any).Calendly?.initPopupWidget({ url: calendarUrl })} disabled={!calendarUrl} className="mt-6 min-h-12 rounded-lg px-5 font-semibold text-white disabled:opacity-50" style={{ backgroundColor: accent }}>{block.content.buttonText || "Schedule a call"}</button> : <div ref={container} className="mt-6 min-h-[650px] overflow-hidden rounded-xl border border-slate-200 bg-white" />}</div></Section>;
}

function SafeVideo({ url }: { url: string }) { const allowed = /^https:\/\/(www\.)?(youtube\.com\/embed\/|player\.vimeo\.com\/video\/)/.test(url); return allowed ? <div className="aspect-video overflow-hidden rounded-xl"><iframe title="Video" src={url} className="h-full w-full" allowFullScreen /></div> : <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">Add a YouTube or Vimeo embed URL.</div>; }

export function LandingPageRenderer({ page, preview = false }: { page: LandingPageDocument; preview?: boolean }) {
  const trackVisit = trpc.landingPages.trackVisit.useMutation();
  useEffect(() => {
    if (!preview) trackVisit.mutate({ pageId: page.id, sessionId: sessionIdFor(page.id), attribution: persistentAttribution(page.id) });
  // page identity is intentional; a view is tracked once per rendered page/session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id, preview]);
  const pageStyle = useMemo(() => ({ backgroundColor: safeColor(page.pageSettings?.background, "#ffffff"), color: safeColor(page.pageSettings?.textColor, "#0f172a") }), [page.pageSettings]);
  return <main style={pageStyle} className="min-h-screen overflow-x-hidden">{page.blocks.map((block) => {
    const accent = safeColor(block.settings?.accentColor || page.pageSettings?.accentColor, "#0d96a5");
    if (block.type === "hero") return <Section key={block.id} block={block}><div className="mx-auto max-w-4xl text-center"><p className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>{block.content.eyebrow || "Savvy STR Agents"}</p><h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">{block.content.heading || "Your next investment move starts here."}</h1>{block.content.body && <p className="mx-auto mt-5 max-w-2xl text-lg opacity-85 sm:text-xl">{block.content.body}</p>}{block.content.ctaText && <button onClick={() => scrollToTarget(cleanUrl(block.content.ctaTarget) || "#lead-form")} className="mt-8 min-h-12 rounded-lg px-6 font-semibold text-white" style={{ backgroundColor: accent }}>{block.content.ctaText}</button>}</div></Section>;
    if (block.type === "rich_text") return <Section key={block.id} block={block}><div className="mx-auto max-w-3xl"><h2 className="text-3xl font-bold">{block.content.heading}</h2><div className="mt-4 whitespace-pre-wrap text-lg leading-8 opacity-90">{block.content.body}</div></div></Section>;
    if (block.type === "image") return <Section key={block.id} block={block}><figure className="mx-auto max-w-5xl">{cleanUrl(block.content.url) ? <img src={cleanUrl(block.content.url)} alt={block.content.alt || "Savvy STR Agents"} className="max-h-[680px] w-full rounded-2xl object-cover shadow-sm" loading="lazy" /> : <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">Add an image URL.</div>}{block.content.caption && <figcaption className="mt-3 text-center text-sm opacity-70">{block.content.caption}</figcaption>}</figure></Section>;
    if (block.type === "feature_list") return <Section key={block.id} block={block}><div className="mx-auto max-w-4xl"><h2 className="text-center text-3xl font-bold">{block.content.heading}</h2><div className="mt-8 grid gap-4 sm:grid-cols-3">{(block.content.items || []).map((item: string, index: number) => <div key={`${item}-${index}`} className="rounded-xl bg-white/90 p-5 shadow-sm ring-1 ring-slate-200"><CheckCircle2 className="h-5 w-5" style={{ color: accent }} /><p className="mt-3 font-medium text-slate-800">{item}</p></div>)}</div></div></Section>;
    if (block.type === "form") return <FormBlock key={block.id} block={block} page={page} preview={preview} />;
    if (block.type === "video") return <Section key={block.id} block={block}><div className="mx-auto max-w-4xl">{block.content.heading && <h2 className="mb-6 text-center text-3xl font-bold">{block.content.heading}</h2>}<SafeVideo url={cleanUrl(block.content.embedUrl)} /></div></Section>;
    if (block.type === "testimonial") return <Section key={block.id} block={block}><blockquote className="mx-auto max-w-3xl text-center"><p className="text-2xl font-medium leading-9">“{block.content.quote || "Savvy helped us make a confident decision."}”</p><footer className="mt-5 text-sm opacity-75">{block.content.name || "Savvy STR Client"}{block.content.role ? ` · ${block.content.role}` : ""}</footer></blockquote></Section>;
    if (block.type === "faq") return <Section key={block.id} block={block}><div className="mx-auto max-w-3xl"><h2 className="text-center text-3xl font-bold">{block.content.heading || "Frequently asked questions"}</h2><div className="mt-8 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">{(block.content.items || []).map((item: any, index: number) => <details key={index} className="group p-5"><summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-slate-900">{item.question || "Question"}<ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></summary><p className="mt-3 leading-7 text-slate-600">{item.answer || "Answer"}</p></details>)}</div></div></Section>;
    if (block.type === "cta") return <Section key={block.id} block={block}><div className="mx-auto max-w-3xl text-center"><h2 className="text-3xl font-bold">{block.content.heading || "Ready to get started?"}</h2>{block.content.body && <p className="mt-3 text-lg opacity-85">{block.content.body}</p>}<button onClick={() => scrollToTarget(cleanUrl(block.content.ctaTarget) || "#lead-form")} className="mt-6 min-h-12 rounded-lg px-6 font-semibold text-white" style={{ backgroundColor: accent }}>{block.content.ctaText || "Get started"}</button></div></Section>;
    if (block.type === "calendly") return <CalendlyBlock key={block.id} block={block} page={page} preview={preview} />;
    if (block.type === "footer") return <Section key={block.id} block={block}><p className="text-center text-sm opacity-80">{block.content.text || `© ${new Date().getFullYear()} Savvy STR Agents.`}</p></Section>;
    if (block.type === "spacer") return <div key={block.id} className={block.content.size === "large" ? "h-24" : "h-12"} />;
    if (block.type === "divider") return <div key={block.id} className="mx-auto max-w-6xl px-5"><hr className="border-slate-200" /></div>;
    return null;
  })}</main>;
}
