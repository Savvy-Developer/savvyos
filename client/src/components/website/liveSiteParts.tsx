import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bath,
  Bed,
  BookOpen,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  DollarSign,
  Info,
  Lock,
  MapPin,
  Share2,
  Square,
  TrendingUp,
  User,
  X,
} from "lucide-react";
import { publicPath } from "@/lib/publicSitePaths";
import { SaveButton, accountPath, useRecordShare } from "@/components/website/publicAccountPages";
import type { WebsiteShareChannel, WebsiteShareTarget } from "@shared/websiteSearchShareActivity";

/**
 * The public site's cards and shared pieces, built to look like the live
 * savvy-agents.com so the switch-over is not a redesign. Each one follows the
 * matching component in the old site's code (savvy-web, src/components), with
 * SavvyOS's own data and links.
 *
 * The old site is a shadcn/Tailwind build. Its theme colours are written out
 * here as values so these render the same without that theme:
 *   navy #05314a, cyan #10c0df, light cyan #43e8ff,
 *   text #0a0a0a, muted text #737373, border #e5e5e5,
 *   the dark "primary" button #171717 and the light chip #f5f5f5.
 */

const path = publicPath;

export const PLACEHOLDER_PHOTO =
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80";

const compactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 0,
});

function wholeDollars(value: unknown) {
  const n = Number(value);
  if (value == null || value === "" || !Number.isFinite(n)) return "-";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function shortMoney(value: unknown) {
  const n = Number(value);
  if (value == null || value === "" || !Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString("en-US")}`;
}

function roomCount(value: unknown) {
  const n = Number(value);
  if (value == null || value === "" || !Number.isFinite(n) || n <= 0) return "-";
  return String(Math.round(n * 10) / 10);
}

function titleCase(value: string) {
  return value.replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.slice(1));
}

function longDate(value: unknown) {
  if (!value) return null;
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function shortDate(value: unknown) {
  if (!value) return null;
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

/** Centred section title and subtitle, as on every home page section. */
export function LiveSectionTitle({ title, subtitle }: { title: string; subtitle?: string | null }) {
  return (
    <div className="mb-8 text-center">
      <h2 className="text-3xl font-bold text-[#05314a]">{title}</h2>
      {subtitle ? <p className="mt-2 text-lg">{subtitle}</p> : null}
    </div>
  );
}

/** The navy outline button under each home page section. */
export function LiveOutlineLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center rounded-md border border-[#05314a] px-6 py-3 font-medium text-[#05314a] transition-colors"
    >
      {children}
    </a>
  );
}

/** The disclaimer strip the live site shows above the footer on list pages. */
export function FinancialDisclaimer() {
  return (
    <div className="border-t border-gray-200 bg-gray-50 py-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs leading-relaxed text-gray-500">
          <span className="font-semibold">Financial &amp; Investment Disclaimer:</span>{" "}
          All information on this website is for informational purposes only and is believed
          accurate to the best of our knowledge but is not guaranteed. Nothing constitutes
          financial, tax, legal, or investment advice. All investments involve risk and you may
          lose some or all of your capital. Projections, case studies, and examples are
          illustrative only and not guarantees of future results. Agents operate independently
          under their own brokerages. Savvy may receive affiliate or referral compensation.
          Intended primarily for US residents. Conduct your own due diligence and consult your
          own professionals.{" "}
          <a
            href={path("/legal")}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[#10c0df] underline hover:text-[#05314a]"
          >
            Full disclosure applies
          </a>
          .
        </p>
      </div>
    </div>
  );
}

// ─── Property card ───────────────────────────────────────────────────────────

/** The photo strip at the top of a property card: swipe, arrows on hover, dots. */
function CardGallery({ photos, alt }: { photos: string[]; alt: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Set<number>>(() => new Set());
  const single = photos.length <= 1;

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el || el.clientWidth === 0) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    setIndex(current => (current === next ? current : next));
  }, []);

  const step = (event: React.MouseEvent, delta: number) => {
    event.preventDefault();
    event.stopPropagation();
    const el = scroller.current;
    if (!el) return;
    const target = (index + delta + photos.length) % photos.length;
    el.scrollTo({ left: target * el.clientWidth, behavior: "smooth" });
    setIndex(target);
  };

  return (
    <div className="group/gallery absolute inset-0">
      <div
        ref={scroller}
        onScroll={onScroll}
        className={`no-scrollbar flex h-full w-full ${single ? "" : "snap-x snap-mandatory overflow-x-auto"}`}
      >
        {photos.map((photo, i) => (
          <div key={`${photo}-${i}`} className="relative h-full w-full shrink-0 snap-center">
            <img
              src={failed.has(i) ? PLACEHOLDER_PHOTO : photo}
              alt={i === 0 ? alt : `${alt}, photo ${i + 1}`}
              loading="lazy"
              className="h-full w-full object-cover"
              onError={() => setFailed(prior => new Set(prior).add(i))}
            />
          </div>
        ))}
      </div>
      {!single && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={event => step(event, -1)}
            className="absolute left-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:bg-white group-hover/gallery:opacity-100 focus:opacity-100 sm:flex"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={event => step(event, 1)}
            className="absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:bg-white group-hover/gallery:opacity-100 focus:opacity-100 sm:flex"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/40 px-2 py-1 backdrop-blur-sm">
            {photos.map((photo, i) => (
              <span
                key={`dot-${photo}-${i}`}
                className={`block h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-white" : "w-1.5 bg-white/60"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Share a listing: copy the link, or open X, Facebook or WhatsApp. The round
 * icon sits on a card's photo; the pill is the property page's top bar.
 */
export function ShareButton({
  url,
  text,
  pill = false,
  target,
}: {
  url: string;
  text: string;
  pill?: boolean;
  /** What is being shared, for a signed-in investor's contact timeline. */
  target?: WebsiteShareTarget | null;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const recordShare = useRecordShare();
  const stop = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const copy = async (event: React.MouseEvent) => {
    stop(event);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      recordShare(target, "copy_link");
    } catch {
      // Clipboard can be refused (an insecure context, a browser setting);
      // the link is still on screen to copy by hand.
    }
  };
  const open_ = (href: string, channel: WebsiteShareChannel) => (event: React.MouseEvent) => {
    stop(event);
    window.open(href, "_blank", "noopener,noreferrer");
    recordShare(target, channel);
  };
  return (
    <div className={pill ? "relative" : "absolute right-3 top-3"}>
      <button
        type="button"
        aria-label="Share property"
        onClick={event => {
          stop(event);
          setOpen(value => !value);
        }}
        className={
          pill
            ? "inline-flex items-center gap-1.5 rounded-full border border-[#e5e5e5] px-3 py-1.5 text-sm font-medium text-[#05314a] transition-all duration-200 hover:scale-105 hover:text-[#10c0df]"
            : "flex size-9 items-center justify-center rounded-full bg-white/80 backdrop-blur-sm transition-colors hover:bg-white"
        }
      >
        <Share2 className={pill ? "h-4 w-4" : "h-4 w-4 text-[#0a0a0a]/70"} />
        {pill ? <span className="hidden sm:inline">Share</span> : null}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={event => {
              stop(event);
              setOpen(false);
            }}
          />
          <div
            className="absolute right-0 top-10 z-50 w-72 rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-2xl"
            onClick={stop}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900">Share this property</span>
              <button
                type="button"
                aria-label="Close"
                onClick={event => {
                  stop(event);
                  setOpen(false);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
              <span className="flex-1 truncate text-xs text-gray-500">{url}</span>
              <button
                type="button"
                onClick={copy}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                  copied ? "bg-green-100 text-green-700" : "text-[#05314a]"
                }`}
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([
                ["X", "bg-black", `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, "x"],
                ["Facebook", "bg-blue-600", `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, "facebook"],
                ["WhatsApp", "bg-green-500", `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "whatsapp"],
              ] as Array<[string, string, string, WebsiteShareChannel]>).map(([label, colour, href, channel]) => (
                <button
                  key={label}
                  type="button"
                  onClick={open_(href, channel)}
                  className="flex flex-col items-center gap-1 rounded-xl p-2 transition-colors hover:bg-gray-50"
                >
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white ${colour}`}>
                    {label.charAt(0)}
                  </span>
                  <span className="text-xs text-gray-600">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * A listing card, as on the live home page and properties list.
 *
 * Revenue and returns follow SavvyOS's own gating: a signed-out visitor sees
 * that the figures exist, never the figures, because the server does not send
 * them (see gateProperties).
 */
export function LivePropertyCard({ item }: { item: any }) {
  const tags: string[] = Array.isArray(item.featureTags) ? item.featureTags.filter(Boolean) : [];
  const photos = Array.from(
    new Set(
      [item.heroImageUrl, ...(Array.isArray(item.galleryImageUrls) ? item.galleryImageUrls : [])].filter(
        (url: unknown): url is string => typeof url === "string" && url.length > 0
      )
    )
  ).slice(0, 8);
  const title = item.address || item.headline || "Investment Property";
  const place = [item.city, item.state].filter(Boolean).join(", ");
  const href = path(`/properties/${item.slug}`);
  const shareUrl = typeof window === "undefined" ? href : `${window.location.origin}${href}`;
  const cashOnCash = item.cashOnCash == null || item.cashOnCash === "" ? null : Number(item.cashOnCash);
  const revenue = item.projectedRevenue == null || item.projectedRevenue === "" ? null : Number(item.projectedRevenue);
  const locked = !!item.gated;
  const visibleTags = tags.slice(0, 4);
  const overflow = tags.length - visibleTags.length;
  const signIn = `${accountPath.signIn}?next=${encodeURIComponent(href)}`;
  const goTo = (url: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    window.location.href = url;
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[10px] border border-[#e5e5e5] bg-white shadow-sm transition-shadow hover:shadow-lg">
      <a href={href} className="block flex-1" title={`${item.city || "Short-term rental"} - STR For Sale - Savvy STR Agents`}>
        <div className="relative h-56 bg-gray-100">
          <CardGallery photos={photos.length ? photos : [PLACEHOLDER_PHOTO]} alt={title} />
          <div
            className="absolute right-14 top-3"
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <SaveButton propertyId={item.propertyId} compact />
          </div>
          <ShareButton
            url={shareUrl}
            text={title}
            target={item.propertyId ? { kind: "property", propertyId: Number(item.propertyId) } : null}
          />
        </div>

        <div className="space-y-2 p-4 pb-2">
          <h3 className="line-clamp-1 text-lg font-semibold leading-tight tracking-tight">{title}</h3>
          {place ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center text-sm text-[#737373]">
                <MapPin className="mr-1.5 h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{place}</span>
              </div>
              {item.assignedAgentName ? (
                <span
                  role={item.assignedAgentSlug ? "link" : undefined}
                  onClick={item.assignedAgentSlug ? goTo(path(`/agents/${item.assignedAgentSlug}`)) : undefined}
                  className="flex flex-shrink-0 items-center gap-1 text-xs text-[#737373] transition-colors hover:text-[#0a0a0a]"
                >
                  {item.assignedAgentImageUrl ? (
                    <img
                      src={item.assignedAgentImageUrl}
                      alt=""
                      className="h-[18px] w-[18px] rounded-full object-cover ring-1 ring-[#e5e5e5]"
                    />
                  ) : (
                    <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#f5f5f5] text-[10px] font-medium ring-1 ring-[#e5e5e5]">
                      {String(item.assignedAgentName).charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="max-w-[90px] truncate hover:underline">{titleCase(String(item.assignedAgentName))}</span>
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="text-xl font-bold text-[#05314a]">{wholeDollars(item.listPrice)}</div>
            {cashOnCash != null && Number.isFinite(cashOnCash) && cashOnCash > 0 ? (
              <span
                className="inline-flex items-center whitespace-nowrap rounded-full border border-transparent px-2.5 py-0.5 text-xs font-semibold"
                style={{ backgroundColor: "color-mix(in oklab, #10c0df 12%, white)", color: "#10c0df" }}
              >
                {(cashOnCash * 100).toFixed(1)}% ROI
              </span>
            ) : null}
          </div>
        </div>

        <div className="p-4 pt-0">
          <div className="grid grid-cols-3 gap-2 text-sm">
            {[
              [Bed, roomCount(item.beds), "Beds"],
              [Bath, roomCount(item.baths), "Baths"],
              [Square, item.sqft ? Number(item.sqft).toLocaleString() : "-", "Sq Ft"],
            ].map(([Icon, value, label]: any) => (
              <div key={label} className="flex flex-col items-center">
                <div className="flex items-center gap-1.5">
                  <Icon className="h-4 w-4 text-[#737373]" />
                  <span className="font-medium">{value}</span>
                </div>
                <div className="mt-0.5 text-xs text-[#737373]">{label}</div>
              </div>
            ))}
          </div>

          {visibleTags.length > 0 ? (
          <div className="mt-3 flex max-h-[38px] flex-wrap content-start gap-1 overflow-hidden">
            {visibleTags.map((tag, i) => (
              <span
                key={tag}
                className={`inline-flex items-center rounded-full border border-transparent px-1.5 py-0 text-[10px] font-semibold ${
                  i === 0 ? "bg-[#171717] text-white" : "bg-[#f5f5f5] text-[#171717]"
                }`}
              >
                {titleCase(tag)}
              </span>
            ))}
            {overflow > 0 ? <span className="self-center text-[10px] text-[#737373]">+{overflow}</span> : null}
          </div>
          ) : null}

          {/* Always shown, so every card has the same shape. A listing whose
              pro-forma has no revenue figures yet says so instead of leaving a gap. */}
          <div className="mt-4 space-y-2 border-t border-[#e5e5e5] pt-3">
              {locked ? (
                <button
                  type="button"
                  onClick={goTo(signIn)}
                  className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#05314a] transition-colors"
                >
                  <Lock className="h-3.5 w-3.5" />
                  Login to view details
                </button>
              ) : null}
              <div className="flex items-center gap-1.5 rounded-lg border border-[#e5e5e5] px-2.5 py-1.5">
                <span title="Projected yearly revenue based on current market data and property metrics.">
                  <Info className="h-3 w-3 flex-shrink-0 text-[#737373]" />
                </span>
                <span className="flex-shrink-0 text-xs font-medium text-[#737373]">Proj. Revenue:</span>
                {locked ? (
                  <button
                    type="button"
                    onClick={goTo(signIn)}
                    aria-label="Sign in to view projected revenue"
                    className="truncate text-xs font-bold tracking-widest text-[#0a0a0a]"
                  >
                    ••••••
                  </button>
                ) : revenue == null ? (
                  <span className="truncate text-xs font-medium text-[#737373]">On request</span>
                ) : (
                  <span className="truncate text-xs font-bold text-[#05314a]">
                    {compactCurrency.format(revenue)} / year
                  </span>
                )}
              </div>
            </div>
        </div>
      </a>
    </div>
  );
}

// ─── Agent cards ─────────────────────────────────────────────────────────────

function agentPlace(item: any) {
  const markets: string[] = Array.isArray(item.markets) ? item.markets : [];
  return markets[0] || null;
}

/** An agent on the home page: photo, name, market, specialties, two buttons. */
export function LiveAgentCard({ item }: { item: any }) {
  const specialties: string[] = Array.isArray(item.specialties) ? item.specialties : [];
  const place = agentPlace(item);
  const profile = path(`/agents/${item.slug}`);
  const phone = item.publicPhone ? String(item.publicPhone).replace(/[^+\d]/g, "") : "";
  const secondary = phone ? `tel:${phone}` : item.bookingUrl || `${profile}#contact`;
  return (
    <div className="group relative overflow-hidden rounded-[14px] border border-[#e5e5e5] bg-white shadow-sm transition-all duration-300 hover:shadow-md">
      <div className="p-6">
        <div className="flex items-start gap-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-[#e5e5e5]">
            <img
              src={item.imageUrl || PLACEHOLDER_PHOTO}
              alt={item.name || "Agent"}
              className="h-full w-full object-cover object-[center_20%] transition-transform group-hover:scale-105"
            />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-[#05314a]">{item.name || "Agent Name"}</h3>
            <p className="text-sm">STR Investment Specialist</p>
            {place ? (
              <p className="mt-1 flex items-center gap-1 text-sm">
                <MapPin className="h-3.5 w-3.5" />
                {place}
              </p>
            ) : null}
          </div>
        </div>
        {specialties.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {specialties.slice(0, 3).map(specialty => (
              <span
                key={specialty}
                className="inline-flex items-center rounded-full border border-[#e5e5e5] px-3 py-1 text-xs font-medium text-[#43e8ff]"
              >
                {specialty}
              </span>
            ))}
          </div>
        )}
        {item.shortBio ? <p className="mt-4 line-clamp-2 text-sm">{item.shortBio}</p> : null}
      </div>
      <div className="flex gap-2 p-6 pt-0">
        <a
          href={`${profile}#contact`}
          className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border border-[#e5e5e5] bg-white px-4 text-sm font-medium text-[#05314a] shadow-xs transition-all hover:bg-gray-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          Message
        </a>
        <a
          href={secondary}
          {...(!phone && item.bookingUrl ? { target: "_blank", rel: "noreferrer" } : {})}
          className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-[#05314a] px-4 text-sm font-medium text-white transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          {phone ? "Call Now" : "Book a Call"}
        </a>
      </div>
      <div className="mt-3 pb-4">
        <a href={profile} className="block w-full text-center text-[#171717] hover:underline">
          View Full Profile
        </a>
      </div>
    </div>
  );
}

/** An agent on the agents page: large photo on top, then the details. */
export function LiveAgentListCard({ item }: { item: any }) {
  const specialties: string[] = Array.isArray(item.specialties) ? item.specialties : [];
  const place = agentPlace(item);
  const profile = path(`/agents/${item.slug}`);
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[10px] border border-[#e5e5e5] bg-white shadow-sm transition-shadow hover:shadow-lg">
      <a href={profile} className="block flex-1">
        <div className="relative h-72 bg-gray-100 sm:h-64">
          <img
            src={item.imageUrl || PLACEHOLDER_PHOTO}
            alt={item.name || "Agent"}
            className="h-full w-full object-cover object-top"
            loading="lazy"
          />
        </div>
        <div className="p-5 pb-3">
          <div className="space-y-2">
            <h3 className="line-clamp-2 text-lg font-semibold leading-none tracking-tight">{item.name || "Agent"}</h3>
            {place ? (
              <div className="flex items-center text-sm text-[#737373]">
                <MapPin className="mr-1.5 h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{place}</span>
              </div>
            ) : null}
            {item.shortBio ? <p className="mt-2 line-clamp-2 text-sm text-[#737373]">{item.shortBio}</p> : null}
          </div>
        </div>
        <div className="flex-1 p-5 pt-0">
          {specialties.length > 0 ? (
            <div className="mt-1 space-y-2 border-t border-[#e5e5e5] pt-3">
              <div className="mb-2 text-xs font-medium text-[#737373]">Specialties</div>
              <div className="flex flex-wrap gap-1">
                {specialties.slice(0, 3).map(specialty => (
                  <span
                    key={specialty}
                    className="inline-flex items-center rounded-full border border-transparent px-2.5 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: "color-mix(in oklab, #05314a 8%, white)", color: "#05314a" }}
                  >
                    {specialty}
                  </span>
                ))}
                {specialties.length > 3 ? (
                  <span className="inline-flex items-center rounded-full border border-[#737373]/30 px-2.5 py-0.5 text-xs font-semibold text-[#737373]">
                    +{specialties.length - 3} more
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </a>
      <div className="flex flex-col gap-2 p-5 pt-0">
        <a
          href={profile}
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[#e5e5e5] bg-white px-4 text-sm font-medium shadow-xs transition-all hover:bg-[#f5f5f5]"
        >
          View Profile <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}

// ─── Case study cards ────────────────────────────────────────────────────────

/** The figures a case study card lists, from whatever the story has. */
function storyFigures(item: any): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const invested = shortMoney(item.investmentAmount);
  if (invested) rows.push(["Investment", invested]);
  if (item.primaryMetricLabel && item.primaryMetricValue)
    rows.push([item.primaryMetricLabel, String(item.primaryMetricValue)]);
  if (item.secondaryMetricLabel && item.secondaryMetricValue)
    rows.push([item.secondaryMetricLabel, String(item.secondaryMetricValue)]);
  return rows;
}

/** A case study on the home page: photo on the left, figures on the right. */
export function LiveCaseStudyCard({ item }: { item: any }) {
  const figures = storyFigures(item);
  const href = path(`/case-studies/${item.slug}`);
  return (
    <div className="overflow-hidden rounded-[10px] border border-[#e5e5e5] bg-white shadow-sm transition-all duration-300 hover:shadow-lg">
      <div className="grid md:grid-cols-2">
        <div className="relative h-64 md:h-full">
          <img
            src={item.heroImageUrl || PLACEHOLDER_PHOTO}
            alt={item.title || "Case Study"}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        </div>
        <div className="flex flex-col">
          {item.eyebrow ? (
            <div className="p-4 pb-2">
              <span className="inline-flex items-center rounded-full border border-[#e5e5e5] px-2.5 py-0.5 text-xs font-semibold">
                {item.eyebrow}
              </span>
            </div>
          ) : null}
          <div className={`flex-1 p-4 ${item.eyebrow ? "pt-0" : ""}`}>
            <h3 className="mb-3 text-xl font-semibold">{item.title || "Case Study"}</h3>
            {figures.length ? (
              <div className="mb-4 space-y-2 text-sm">
                {figures.map(([label, value], i) => (
                  <div
                    key={label}
                    className={`flex justify-between ${i === figures.length - 1 && figures.length > 1 ? "border-t border-[#e5e5e5] pt-2" : ""}`}
                  >
                    <span className="text-[#737373]">{label}:</span>
                    <span className={i === 0 ? "font-medium" : "font-semibold text-[#10c0df]"}>{value}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {item.excerpt ? <p className="line-clamp-2 text-sm text-[#737373]">{item.excerpt}</p> : null}
            {item.agentName ? <p className="mt-3 text-sm text-[#737373]">Agent: {item.agentName}</p> : null}
          </div>
          <div className="flex items-center p-4 pt-0">
            <a
              href={href}
              className="inline-flex h-9 w-full items-center justify-center rounded-md bg-[#171717] px-4 text-sm font-medium text-white transition-all hover:bg-[#171717]/90"
            >
              View Full Case Study
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A case study on the case studies page: photo on top, two figure boxes. */
export function LiveCaseStudyListCard({ item }: { item: any }) {
  const href = path(`/case-studies/${item.slug}`);
  const invested = shortMoney(item.investmentAmount);
  const metric =
    item.primaryMetricLabel && item.primaryMetricValue
      ? [String(item.primaryMetricLabel), String(item.primaryMetricValue)]
      : null;
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[10px] border border-[#e5e5e5] bg-white shadow-sm transition-shadow duration-300 hover:shadow-lg">
      <a href={href} aria-label={`View case study: ${item.title}`} className="group relative block h-48 overflow-hidden bg-gray-100">
        {item.heroImageUrl ? (
          <img
            src={item.heroImageUrl}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span>No Image</span>
          </div>
        )}
      </a>
      <div className="p-5 pb-2">
        {item.eyebrow ? (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-transparent bg-[#171717] px-2.5 py-0.5 text-xs font-semibold text-[#10c0df]">
              {item.eyebrow}
            </span>
          </div>
        ) : null}
        <h2 className="line-clamp-1 text-xl font-bold text-[#05314a]">
          <a href={href} className="hover:underline">
            {item.title}
          </a>
        </h2>
      </div>
      <div className="flex-1 p-5 pt-0">
        <p className="mb-4 line-clamp-2">{item.excerpt || "No description available"}</p>
        {item.agentName ? <p className="mb-4 text-sm">Agent: {item.agentName}</p> : null}
        {metric || invested ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {metric ? (
              <div className="rounded-lg p-3">
                <div className="mb-1 flex items-center text-sm">
                  <DollarSign className="mr-1.5 h-4 w-4" />
                  <span className="truncate">{metric[0]}</span>
                </div>
                <div className="font-bold text-[#05314a]">{metric[1]}</div>
              </div>
            ) : null}
            {invested ? (
              <div className="rounded-lg p-3">
                <div className="mb-1 flex items-center text-sm">
                  <TrendingUp className="mr-1.5 h-4 w-4" />
                  <span>Investment</span>
                </div>
                <div className="font-bold text-[#10c0df]">{invested}</div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="p-5 pt-0">
        <a
          href={href}
          className="block w-full rounded-md border border-[#e5e5e5] px-4 py-2 text-center text-[#05314a] transition-colors duration-200"
        >
          View Case Study
        </a>
      </div>
    </div>
  );
}

// ─── Article cards ───────────────────────────────────────────────────────────

/** An article on the home page. */
export function LiveHomeArticleCard({ item }: { item: any }) {
  const date = longDate(item.publishedAt);
  const author = item.authorName || null;
  return (
    <a
      href={path(`/resources/${item.slug}`)}
      className="group overflow-hidden rounded-[10px] border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      {item.coverImageUrl ? (
        <div className="relative h-48 overflow-hidden bg-gray-100">
          <img
            src={item.coverImageUrl}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
          <BookOpen className="h-12 w-12 text-gray-400" />
        </div>
      )}
      <div className="p-5">
        {author ? (
          <div className="mb-3 flex items-center gap-2">
            {item.authorImageUrl ? (
              <img src={item.authorImageUrl} alt={author} loading="lazy" className="h-6 w-6 rounded-full object-cover" />
            ) : (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200">
                <span className="text-xs text-gray-500">{author.charAt(0).toUpperCase()}</span>
              </div>
            )}
            <span className="text-sm text-gray-600">{author}</span>
          </div>
        ) : null}
        <h3 className="mb-2 line-clamp-2 font-semibold text-gray-900 transition-colors group-hover:text-[#05314a]">
          {item.title}
        </h3>
        {item.excerpt ? <p className="line-clamp-2 text-sm text-gray-500">{item.excerpt}</p> : null}
        {date ? <p className="mt-3 text-xs text-gray-400">{date}</p> : null}
      </div>
    </a>
  );
}

/** An article on the resources page. */
export function LiveArticleCard({ item, featured = false }: { item: any; featured?: boolean }) {
  const href = path(`/resources/${item.slug}`);
  const date = shortDate(item.publishedAt);
  return (
    <div
      className={`group flex flex-col overflow-hidden rounded-[14px] border bg-white shadow-[0_1px_4px_0_rgba(5,49,74,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_28px_0_rgba(5,49,74,0.11)] ${
        featured ? "border-emerald-200" : "border-gray-200"
      }`}
    >
      <a href={href} className="block">
        <div className={`relative overflow-hidden bg-gray-100 ${featured ? "aspect-[16/9]" : "aspect-[2/1]"}`}>
          {item.coverImageUrl ? (
            <img
              src={item.coverImageUrl}
              alt={item.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: "color-mix(in oklab, #05314a 5%, white)" }}>
              <span className="text-sm font-medium text-[#05314a] opacity-45">Savvy Resource</span>
            </div>
          )}
          {featured ? (
            <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-semibold text-white shadow-sm">
              Featured
            </span>
          ) : null}
        </div>
      </a>
      <div className="flex flex-col space-y-1.5 px-6 pb-2 pt-3">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
          {item.category ? (
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ background: "color-mix(in oklab, #10c0df 10%, white)", color: "#05314a" }}
            >
              {item.category}
            </span>
          ) : null}
          {date ? (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {date}
            </span>
          ) : null}
        </div>
        <h3
          className={`font-semibold leading-snug text-gray-900 transition-colors group-hover:text-[#10c0df] ${featured ? "text-xl" : "text-base"}`}
        >
          <a href={href}>{item.title}</a>
        </h3>
      </div>
      <div className="px-6 pb-2">
        {item.excerpt ? <p className="line-clamp-2 text-sm leading-relaxed text-gray-500">{item.excerpt}</p> : null}
      </div>
      <div className="mt-auto flex items-center border-t border-gray-100 px-6 pb-3 pt-2">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <User className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="max-w-[120px] truncate">{item.authorName || "Savvy Team"}</span>
          </div>
          <a
            href={href}
            className="flex flex-shrink-0 items-center gap-1 text-xs font-semibold text-[#10c0df] transition-all hover:gap-1.5"
          >
            Read more
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Testimonials ────────────────────────────────────────────────────────────

type Quote = { name: string; quote: string; title?: string; location?: string };

/**
 * "What Our Investors Are Saying": three quotes to a view, arrows either
 * side, dots underneath. No star ratings: nobody gave one, so none is drawn.
 */
export function LiveInvestorQuotes({ quotes }: { quotes: Quote[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ overflow: false, prev: false, next: false, pages: 1, page: 0 });

  const gap = (el: HTMLElement) => {
    const value = parseFloat(getComputedStyle(el).columnGap);
    return Number.isFinite(value) ? value : 0;
  };

  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const max = scrollWidth - clientWidth;
    const overflow = max > 4;
    const stride = clientWidth + gap(el);
    const pages = overflow && clientWidth > 0 ? Math.max(1, Math.ceil((scrollWidth + gap(el)) / stride)) : 1;
    setState({
      overflow,
      prev: scrollLeft > 4,
      next: scrollLeft < max - 4,
      pages,
      page: clientWidth > 0 ? Math.min(pages - 1, Math.round(scrollLeft / stride)) : 0,
    });
  }, []);

  useEffect(() => {
    update();
    const el = track.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update, quotes.length]);

  if (!quotes.length) return null;

  const byPage = (dir: number) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * (el.clientWidth + gap(el)), behavior: "smooth" });
  };
  const toPage = (page: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: page * (el.clientWidth + gap(el)), behavior: "smooth" });
  };
  const arrow =
    "hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 sm:flex";

  return (
    <section className="bg-gray-50 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-3xl font-bold text-gray-900">What Our Investors Are Saying</h2>
          <p className="mx-auto max-w-3xl text-xl text-gray-600">
            Real success stories from investors who are already earning with our STR properties
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          {state.overflow && (
            <button type="button" aria-label="Previous testimonials" onClick={() => byPage(-1)} disabled={!state.prev} className={arrow}>
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {/* Phones show one card at a time: each card fits its own quote
              instead of stretching to the longest one. */}
          <div
            ref={track}
            role="group"
            aria-roledescription="carousel"
            aria-label="Client testimonials"
            className="no-scrollbar flex flex-1 snap-x snap-mandatory items-start gap-8 overflow-x-auto scroll-smooth pb-1 md:items-stretch"
          >
            {quotes.map((quote, index) => {
              const line = [quote.title, quote.location].filter(Boolean).join(" • ");
              return (
                <div
                  key={`${quote.name}:${index}`}
                  className="shrink-0 basis-full snap-start md:basis-[calc((100%-2rem)/2)] lg:basis-[calc((100%-4rem)/3)]"
                >
                  <div className="flex h-full flex-col rounded-xl bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
                    <blockquote className="mb-6 flex-1">
                      <p className="whitespace-pre-line leading-relaxed text-gray-700">"{quote.quote}"</p>
                    </blockquote>
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-gray-200 bg-gray-100 font-bold text-gray-400">
                        {quote.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{quote.name}</p>
                        {line ? <p className="text-sm text-gray-500">{line}</p> : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {state.overflow && (
            <button type="button" aria-label="Next testimonials" onClick={() => byPage(1)} disabled={!state.next} className={arrow}>
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>
        {state.overflow && state.pages > 1 && (
          <div className="mt-8 flex justify-center gap-2">
            {Array.from({ length: state.pages }).map((_, index) => (
              <button
                type="button"
                key={index}
                aria-label={`Go to slide ${index + 1}`}
                aria-current={index === state.page}
                onClick={() => toPage(index)}
                className={`h-2.5 rounded-full transition-all ${index === state.page ? "w-6 bg-gray-800" : "w-2.5 bg-gray-300 hover:bg-gray-400"}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
