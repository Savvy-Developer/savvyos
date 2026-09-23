import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bath,
  BedDouble,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  DollarSign,
  ExternalLink,
  Flame,
  Globe2,
  Heart,
  Home,
  KeyRound,
  LineChart,
  CalendarCheck,
  Calculator,
  Loader2,
  Landmark,
  Lock,
  Quote,
  Mail,
  MapPin,
  Menu,
  MessageSquare,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  TrendingUp,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { renderArticleMarkdown } from "@/lib/articleMarkdown";
import { PUBLIC_SITE_BASE, publicPath } from "@/lib/publicSitePaths";
import { captureVisitAttribution, formAttribution } from "@/lib/visitAttribution";
import {
  INVESTMENT_BANDS,
  cleanTags,
  compactMoney,
  hasAnyTag,
  inInvestmentBand,
  isInvestmentBand,
  popularTags,
  tagKey,
} from "@shared/websiteContentFilters";
import {
  attributionLine,
  publishedTestimonials,
} from "@shared/websiteTestimonials";
import {
  CALCULATOR_DEFAULTS,
  runCalculator,
} from "@/lib/investmentCalculator";
import {
  AccountMenu,
  AccountMobileLinks,
  EmailPreferencesBody,
  ForgotPasswordBody,
  LockedPanel,
  MyTransactionsBody,
  ResetPasswordBody,
  SaveButton,
  SavedPropertiesBody,
  SignInBody,
  SignUpBody,
  ViewHistoryBody,
  useRecordPropertyView,
} from "@/components/website/publicAccountPages";

const BASE = PUBLIC_SITE_BASE;
const LOGO =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png";
const path = publicPath;
/**
 * Blog posts and case studies are authored as markdown in the Website Studio.
 * Bodies written before that was true are plain text, which is valid markdown,
 * so they keep rendering as paragraphs without a migration.
 *
 * Raw HTML in the source is escaped rather than rendered. Authors are admins,
 * but "the author is trusted" is a weak reason to run arbitrary markup on a
 * public page, and a WYSIWYG never needs to emit raw HTML anyway.
 */
function ArticleBody({ markdown, className }: { markdown: string; className?: string }) {
  const html = useMemo(() => renderArticleMarkdown(markdown), [markdown]);
  if (!html) return null;
  return (
    <div
      className={className}
      // Safe: the source had its angle brackets escaped above, so this is only
      // the markup marked itself generated.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const money = (value: unknown) =>
  value == null || value === ""
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(Number(value));
const percent = (value: unknown) =>
  value == null || value === "" ? "—" : `${(Number(value) * 100).toFixed(1)}%`;

/**
 * The revenue range and the comparable listings behind it.
 *
 * Shown as a range rather than a single figure on purpose. One number reads as
 * a promise; the spread between the conservative and the strong case is the
 * uncertainty that is genuinely in the model, and an investor is entitled to
 * see it. The comps sit underneath as the evidence, because a projection
 * nobody can check is just a number on a page.
 */
function RevenueRangeSection({
  revenue,
  comps,
}: {
  revenue: { low: number; high: number; single: boolean };
  comps: Array<{
    name: string;
    annualRevenue: number;
    adr: number | null;
    occupancy: number | null;
    beds: number | null;
    city: string | null;
    photoUrl: string | null;
    link: string | null;
  }>;
}) {
  return (
    <div className="rounded-2xl border bg-white p-7 shadow-sm">
      <h2 className="text-2xl font-bold text-[#05314a]">
        Projected annual revenue
      </h2>
      <p className="mt-4 text-3xl font-black text-[#05314a] sm:text-4xl">
        {revenue.single ? (
          money(revenue.low)
        ) : (
          <>
            {money(revenue.low)}
            <span className="mx-2 font-bold text-slate-400">to</span>
            {money(revenue.high)}
          </>
        )}
      </p>
      {!revenue.single && (
        <p className="mt-1 text-sm text-slate-500">
          Conservative through strong execution.
        </p>
      )}

      {comps.length > 0 && (
        <div className="mt-7 border-t pt-6">
          <h3 className="font-bold text-[#05314a]">
            Comparable properties
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {comps.length === 1
              ? "The listing this projection is based on."
              : `The ${comps.length} listings this projection is based on.`}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {comps.map((comp, index) => {
              const details = [
                comp.beds ? `${comp.beds} bed` : null,
                comp.adr ? `${money(comp.adr)} ADR` : null,
                comp.occupancy ? `${Math.round(comp.occupancy * 100)}% occupancy` : null,
              ].filter(Boolean);
              const body = (
                <>
                  {comp.photoUrl && (
                    <img
                      src={comp.photoUrl}
                      alt=""
                      loading="lazy"
                      className="h-16 w-16 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-800">
                      {comp.name}
                    </p>
                    <p className="text-sm font-bold text-cyan-700">
                      {money(comp.annualRevenue)}
                      <span className="font-medium text-slate-500"> a year</span>
                    </p>
                    {details.length > 0 && (
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {[comp.city, ...details].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </>
              );
              return comp.link ? (
                <a
                  key={`${index}-${comp.name}`}
                  href={comp.link}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                  className="flex gap-3 rounded-xl bg-slate-50 p-3 transition hover:bg-slate-100"
                >
                  {body}
                </a>
              ) : (
                <div key={`${index}-${comp.name}`} className="flex gap-3 rounded-xl bg-slate-50 p-3">
                  {body}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-6 text-xs leading-5 text-slate-500">
        Projections are estimates based on the comparable listings shown, not a
        forecast or a guarantee of future performance. Actual results vary with
        seasonality, management, local regulation and market conditions. Review
        the full analysis with your agent before making an investment decision.
      </p>
    </div>
  );
}

function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} | Savvy STR Agents` : "Savvy STR Agents";
  }, [title]);
}

/**
 * Gentle fade-and-rise as page sections scroll into view.
 *
 * Works on the direct children of each top-level section, so section
 * backgrounds stay put and only the content moves. Photos and overlays that
 * are absolutely positioned are left alone. Sections that arrive later (after
 * data loads) are picked up by the MutationObserver. Nothing is hidden unless
 * this runs, and it does not run for visitors who ask for reduced motion.
 */
function useScrollReveal(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const pending = new Set<Element>();
    const reveal = (el: Element) => {
      el.classList.add("sv-in");
      pending.delete(el);
      io.unobserve(el);
    };
    const io = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          // Also show anything already above the screen, for instance when
          // the browser restores a scroll position on Back.
          if (!entry.isIntersecting && entry.boundingClientRect.top >= 0) continue;
          reveal(entry.target);
        }
      },
      // Threshold 0, so a very tall block (a long property grid) still
      // reveals as soon as its top edge is on screen.
      { rootMargin: "0px 0px -6% 0px", threshold: 0 },
    );
    const seen = new WeakSet<Element>();
    const scan = () => {
      root.querySelectorAll(":scope > section > *").forEach(el => {
        if (seen.has(el)) return;
        seen.add(el);
        if (getComputedStyle(el).position === "absolute") return;
        el.classList.add("sv-reveal");
        pending.add(el);
        io.observe(el);
      });
    };
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(root, { childList: true, subtree: true });
    // A fast jump (dragging the scrollbar, End, an anchor link) can carry a
    // section past the screen without it ever intersecting, which left it
    // invisible. After any scroll, show everything whose top is already above
    // the bottom of the screen.
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const bottom = window.innerHeight;
        pending.forEach(el => {
          if (el.getBoundingClientRect().top < bottom) reveal(el);
        });
      });
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("scroll", onScroll, { capture: true });
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [ref]);
}

function Shell({
  children,
  darkHeader = false,
}: {
  children: React.ReactNode;
  darkHeader?: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: siteSettings } = trpc.website.publicSettings.useQuery();
  const mainRef = useRef<HTMLElement>(null);
  useScrollReveal(mainRef);
  const nav = [
    ["Properties", "/properties"],
    ["Markets", "/markets"],
    ["Our Agents", "/agents"],
    ["Case Studies", "/case-studies"],
    ["About", "/about"],
    ["Resources", "/resources"],
    ["Contact", "/contact"],
  ];
  return (
    <div className="sv-site h-full overflow-y-auto bg-white text-slate-950 selection:bg-cyan-200">
      <header
        className={`sticky top-0 z-50 border-b ${darkHeader ? "border-white/10 bg-[#052d43]" : "border-slate-200 bg-white"}`}
      >
        {siteSettings?.announcementText && (
          <div className="bg-[#10c0df] px-4 py-1.5 text-center text-[11px] font-bold tracking-wide text-[#03293c]">
            {siteSettings.announcementText}
          </div>
        )}
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href={path()} aria-label="Savvy STR Agents home">
            <img
              src={LOGO}
              alt="Savvy STR Agents"
              className={`h-7 w-auto ${darkHeader ? "brightness-0 invert" : ""}`}
            />
          </a>
          <nav className="hidden items-center gap-6 lg:flex">
            {nav.map(([label, href]) => (
              <a
                key={href}
                className={`text-sm font-semibold transition hover:text-cyan-500 ${darkHeader ? "text-white/85" : "text-[#05314a]"}`}
                href={path(href)}
              >
                {label}
              </a>
            ))}
            <a
              className={`text-sm font-semibold ${darkHeader ? "text-white/85" : "text-[#05314a]"}`}
              href="https://www.savvy.realty/sellers"
              target="_blank"
              rel="noreferrer"
            >
              Sell <ExternalLink className="ml-1 inline h-3 w-3" />
            </a>
            {/* Very wide screens only. At 1280px the menu already reaches the
                logo, so this link would push it into it. It is always in the
                mobile menu and the footer. */}
            <a
              className={`hidden text-sm font-semibold transition hover:text-cyan-500 2xl:inline ${darkHeader ? "text-white/85" : "text-[#05314a]"}`}
              href={path("/join-our-team")}
            >
              Join the team
            </a>
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            <AccountMenu dark={darkHeader} />
            <a
              className="rounded-lg bg-[#10c0df] px-4 py-2 text-sm font-bold text-[#03293c] shadow-sm transition hover:bg-[#43e8ff]"
              href={path("/contact")}
            >
              Talk to an STR Agent
            </a>
          </div>
          <button
            className={`rounded-lg p-2 lg:hidden ${darkHeader ? "text-white" : "text-[#05314a]"}`}
            onClick={() => setMobileOpen(value => !value)}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X /> : <Menu />}
          </button>
        </div>
        {mobileOpen && (
          <nav
            className={`border-t px-4 py-4 lg:hidden ${darkHeader ? "border-white/10 bg-[#052d43]" : "border-slate-200 bg-white"}`}
          >
            {nav.map(([label, href]) => (
              <a
                key={href}
                className={`block rounded-lg px-3 py-3 text-sm font-semibold ${darkHeader ? "text-white hover:bg-white/10" : "text-[#05314a] hover:bg-slate-50"}`}
                href={path(href)}
              >
                {label}
              </a>
            ))}
            <a
              className={`block rounded-lg px-3 py-3 text-sm font-semibold ${darkHeader ? "text-white hover:bg-white/10" : "text-[#05314a] hover:bg-slate-50"}`}
              href={path("/join-our-team")}
            >
              Join the team
            </a>
            <div
              className={`my-2 border-t ${darkHeader ? "border-white/10" : "border-slate-200"}`}
            />
            <AccountMobileLinks dark={darkHeader} />
            <a
              className="mt-2 block rounded-lg bg-[#10c0df] px-3 py-3 text-center text-sm font-bold text-[#03293c]"
              href={path("/contact")}
            >
              Talk to an STR Agent
            </a>
          </nav>
        )}
      </header>
      <main ref={mainRef}>{children}</main>
      <SiteFooter settings={siteSettings} />
    </div>
  );
}

function SiteFooter({ settings }: { settings?: any }) {
  // Legal and Privacy are CMS pages, not built-in ones, so a link is shown
  // only once the page is published. A footer link to "Page not found" on a
  // legal page is worse than no link.
  const legal = trpc.website.publicPage.useQuery({ slug: "legal" }, { staleTime: 10 * 60_000 });
  const privacy = trpc.website.publicPage.useQuery({ slug: "privacy" }, { staleTime: 10 * 60_000 });
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-8 md:flex-row">
          <div>
            <img src={LOGO} alt="Savvy STR Agents" className="h-7 w-auto" />
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-500">
              {settings?.footerText || "Specialized real estate representation, property intelligence, and a national agent network built for short-term rental investors."}
            </p>
            {(settings?.contactEmail || settings?.contactPhone) && <p className="mt-3 text-sm text-slate-500">{[settings.contactEmail, settings.contactPhone].filter(Boolean).join(" · ")}</p>}
          </div>
          <div className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm font-medium text-[#05314a]">
            <a href={path("/properties")}>Properties</a>
            <a href={path("/markets")}>Markets</a>
            <a href={path("/agents")}>Our Agents</a>
            <a href={path("/case-studies")}>Case Studies</a>
            <a href={path("/resources")}>Resources</a>
            <a href={path("/about")}>About</a>
            <a href={path("/contact")}>Contact</a>
            <a href={path("/join-our-team")}>Join the team</a>
            {legal.data && <a href={path("/legal")}>Legal</a>}
            {privacy.data && <a href={path("/privacy")}>Privacy Policy</a>}
            {/* Staff sign in is a different door from the investor account in
                the header, and it belongs down here rather than competing with
                it. Agents still need the link, so it is kept rather than
                dropped. */}
            <a
              className="text-slate-500"
              href="https://os.savvy-agents.com/login"
            >
              Savvy team login
            </a>
          </div>
        </div>
        <div className="mt-8 border-t pt-5 text-xs leading-5 text-slate-500">
          <p>
            <strong>Financial & Investment Disclaimer:</strong> Information and
            projections are educational estimates, not guarantees. Verify
            regulations, financing, expenses, and operating assumptions before
            investing.
          </p>
          <p className="mt-3">
            © {new Date().getFullYear()} Savvy STR Agents. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

function LoadingPage() {
  return (
    <div className="flex min-h-[65vh] items-center justify-center">
      <Loader2 className="h-7 w-7 animate-spin text-[#10c0df]" />
    </div>
  );
}
function NotFoundPage() {
  usePageTitle("Page not found");
  return (
    <Shell>
      <section className="mx-auto max-w-3xl px-6 py-28 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-600">
          404
        </p>
        <h1 className="mt-3 text-5xl font-bold text-[#05314a]">
          We couldn't find that page.
        </h1>
        <p className="mt-5 text-slate-600">
          Browse current investment properties or meet a Savvy STR specialist.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <a
            className="rounded-lg bg-[#05314a] px-5 py-3 font-semibold text-white"
            href={path("/properties")}
          >
            Browse properties
          </a>
          <a
            className="rounded-lg border px-5 py-3 font-semibold text-[#05314a]"
            href={path()}
          >
            Back home
          </a>
        </div>
      </section>
    </Shell>
  );
}

/**
 * What real customers said.
 *
 * Three rules, all of them about not overstating:
 *
 * - No star ratings. The previous version drew five filled stars on every
 *   quote. Nobody gave those stars; they were decoration that read as a
 *   rating, on a real person's name.
 * - Every published testimonial is shown, not the first three, so the section
 *   is the whole set rather than a silently truncated sample.
 * - With nothing to show the section does not render at all, heading included.
 *   An empty "What Our Investors Are Saying" is worse than no section.
 *
 * Horizontal scroll with snap points rather than a timed carousel: no library,
 * no autoplay stealing a quote mid-sentence, and it still works with the
 * keyboard and on a phone.
 */
function TestimonialsSection({ rows }: { rows: unknown }) {
  const testimonials = publishedTestimonials(rows);
  if (!testimonials.length) return null;
  return (
    <section className="bg-white py-20">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Investor confidence"
          title="What Our Investors Are Saying"
          body="Specialized guidance matters before, during, and long after closing."
        />
        <div
          className="mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4"
          tabIndex={0}
          role="region"
          aria-label="Investor testimonials"
        >
          {testimonials.map((item, index) => {
            const attribution = attributionLine(item);
            return (
              <blockquote
                key={`${item.name}:${index}`}
                className="flex min-h-64 w-[19rem] shrink-0 snap-start flex-col rounded-2xl border bg-white p-7 shadow-sm sm:w-[22rem]"
              >
                {/* whitespace-pre-line so a quote pasted with paragraph breaks
                    keeps them instead of collapsing into one block. */}
                <p className="whitespace-pre-line text-base leading-7 text-slate-700">
                  “{item.quote}”
                </p>
                <footer className="mt-auto pt-6">
                  <p className="font-bold text-[#05314a]">{item.name}</p>
                  {attribution && (
                    <p className="text-xs text-slate-500">{attribution}</p>
                  )}
                </footer>
              </blockquote>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
  align = "center",
  tone = "light",
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  align?: "center" | "left";
  tone?: "light" | "dark";
}) {
  return (
    <div
      className={
        align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl"
      }
    >
      {eyebrow && (
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-600">
          {eyebrow}
        </p>
      )}
      <h2 className={`mt-2 text-3xl font-bold tracking-tight sm:text-4xl ${tone === "dark" ? "text-white" : "text-[#05314a]"}`}>
        {title}
      </h2>
      {body && (
        <p className={`mt-4 text-base leading-7 ${tone === "dark" ? "text-cyan-50/85" : "text-slate-600"}`}>{body}</p>
      )}
    </div>
  );
}

function PropertyCard({ item }: { item: any }) {
  const tags = Array.isArray(item.featureTags) ? item.featureTags : [];
  // Only the figures this property actually has. A card showing three dashes
  // reads as broken, so the whole strip is dropped when there is nothing to put
  // in it rather than rendering empty placeholders.
  const roi = (
    [
      ["Revenue", item.projectedRevenue, money],
      ["Cash-on-cash", item.cashOnCash, percent],
      ["Cap rate", item.capRate, percent],
    ] as const
  )
    .filter(([, value]) => value != null && value !== "")
    .map(([label, value, format]) => [label, format(value)] as const);
  return (
    <article className="group flex overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
      <a
        href={path(`/properties/${item.slug}`)}
        className="flex w-full flex-col"
      >
        <div className="relative aspect-[1.55] overflow-hidden bg-slate-100">
          <img
            src={
              item.heroImageUrl ||
              "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80"
            }
            alt={`${item.address}, ${item.city || ""}`}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute left-3 top-3 rounded-full bg-[#05314a]/90 px-3 py-1 text-xs font-bold text-white">
            Savvy opportunity
          </div>
          <div className="absolute right-3 top-3">
            <SaveButton propertyId={item.propertyId} compact />
          </div>
        </div>
        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-[#05314a]">
                {item.address}
              </h3>
              <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                <MapPin className="h-3.5 w-3.5" />
                {[item.city, item.state].filter(Boolean).join(", ")}
              </p>
            </div>
            <p className="shrink-0 text-lg font-black text-[#05314a]">
              {money(item.listPrice)}
            </p>
          </div>
          <div className="mt-4 grid grid-cols-3 border-y py-3 text-center text-sm text-slate-600">
            <span className="flex items-center justify-center gap-1">
              <BedDouble className="h-4 w-4 text-cyan-600" />
              {item.beds || "—"}
            </span>
            <span className="flex items-center justify-center gap-1">
              <Bath className="h-4 w-4 text-cyan-600" />
              {item.baths || "—"}
            </span>
            <span className="flex items-center justify-center gap-1">
              <Square className="h-4 w-4 text-cyan-600" />
              {item.sqft ? Number(item.sqft).toLocaleString() : "—"}
            </span>
          </div>
          {roi.length ? (
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-cyan-50/70 p-3">
              {roi.map(([label, value]) => (
                <div key={label} className="text-center">
                  <p className="text-sm font-black tabular-nums text-[#05314a]">
                    {value}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-800">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          ) : item.gated ? (
            // The figures exist, this visitor just does not have an account
            // yet. Say which ones, so the offer is concrete.
            <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-3 text-center">
              <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="text-[11px] font-semibold text-slate-500">
                Sign in to see revenue, cash-on-cash and cap rate
              </span>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.slice(0, 4).map((tag: string) => (
              <span
                key={tag}
                className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-900"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="mt-auto pt-5">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                {item.assignedAgentImageUrl ? (
                  <img
                    className="h-8 w-8 rounded-full object-cover"
                    src={item.assignedAgentImageUrl}
                    alt=""
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-100">
                    <UserRound className="h-4 w-4 text-cyan-700" />
                  </div>
                )}
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">
                    Your STR specialist
                  </p>
                  <p className="text-xs font-bold text-[#05314a]">
                    {item.assignedAgentName || "Savvy STR Agents"}
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-cyan-600" />
            </div>
          </div>
        </div>
      </a>
    </article>
  );
}

function AgentCard({ item }: { item: any }) {
  const specialties = Array.isArray(item.specialties) ? item.specialties : [];
  const markets = Array.isArray(item.markets) ? item.markets : [];
  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <div className="flex items-center gap-4">
        <img
          src={
            item.imageUrl ||
            "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80"
          }
          alt={item.name || "Savvy STR Agent"}
          className="h-20 w-20 rounded-2xl bg-slate-100 object-cover"
        />
        <div>
          <h3 className="text-xl font-bold text-[#05314a]">{item.name}</h3>
          <p className="mt-1 text-sm font-semibold text-cyan-700">
            {item.headline || "STR Investment Specialist"}
          </p>
          {markets[0] && (
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <MapPin className="h-3 w-3" />
              {markets[0]}
            </p>
          )}
        </div>
      </div>
      <p className="mt-5 line-clamp-4 text-sm leading-6 text-slate-600">
        {item.shortBio ||
          "A Savvy STR specialist focused on helping investors make informed property decisions."}
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {specialties.slice(0, 3).map((tag: string) => (
          <span
            key={tag}
            className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-900"
          >
            {tag}
          </span>
        ))}
      </div>
      <div className="mt-auto flex gap-2 pt-6">
        <a
          className="flex-1 rounded-lg border border-[#05314a] px-3 py-2 text-center text-sm font-bold text-[#05314a]"
          href={path(`/agents/${item.slug}`)}
        >
          View profile
        </a>
        {item.publicPhone && (
          <a
            aria-label={`Call ${item.name}`}
            className="rounded-lg bg-[#05314a] p-2.5 text-white"
            href={`tel:${item.publicPhone.replace(/[^+\d]/g, "")}`}
          >
            <Phone className="h-4 w-4" />
          </a>
        )}
      </div>
    </article>
  );
}

function StoryCard({ item }: { item: any }) {
  return (
    <a
      href={path(`/case-studies/${item.slug}`)}
      className="group grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:grid-cols-[42%_1fr]"
    >
      <div className="min-h-52 overflow-hidden">
        <img
          src={item.heroImageUrl}
          alt={item.title}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
      </div>
      <div className="flex flex-col p-6">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-cyan-600">
          {item.eyebrow || "Investor story"}
        </p>
        <h3 className="mt-2 text-xl font-bold leading-snug text-[#05314a]">
          {item.title}
        </h3>
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
          {item.excerpt}
        </p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <div>
            {item.primaryMetricValue && (
              <p className="text-lg font-black text-[#05314a]">
                {item.primaryMetricValue}
                <span className="ml-1 text-xs font-medium text-slate-500">
                  {item.primaryMetricLabel}
                </span>
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              {item.agentName ? `with ${item.agentName}` : "Savvy STR Agents"}
              {compactMoney(item.investmentAmount) ? (
                <>
                  {" · "}Investment{" "}
                  <span className="font-semibold text-[#05314a]">
                    {compactMoney(item.investmentAmount)}
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <ArrowRight className="h-5 w-5 text-cyan-600" />
        </div>
      </div>
    </a>
  );
}

function ArticleCard({ item }: { item: any }) {
  return (
    <a
      href={path(`/resources/${item.slug}`)}
      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="aspect-[1.65] overflow-hidden bg-slate-100">
        <img
          src={item.coverImageUrl}
          alt={item.title}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          loading="lazy"
        />
      </div>
      <div className="p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-600">
          {item.category || "STR Investing"}
        </p>
        <h3 className="mt-2 text-xl font-bold leading-snug text-[#05314a]">
          {item.title}
        </h3>
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
          {item.excerpt}
        </p>
        <div className="mt-5 flex items-center justify-between border-t pt-4 text-xs text-slate-500">
          <span>{item.authorName || "Savvy Team"}</span>
          <span className="font-bold text-cyan-700">Read article →</span>
        </div>
      </div>
    </a>
  );
}

function LeadForm({
  agentUserId,
  propertyId,
  intent = "general",
  requestType,
  title = "Talk with a Savvy STR specialist",
  message = "",
}: {
  agentUserId?: number;
  propertyId?: number;
  intent?: "buy" | "sell" | "property" | "agent" | "general";
  /** Which call to action opened this form, so the agent sees what was asked
   *  for rather than inferring it from the message text. */
  requestType?: "showing" | "analysis" | "financing";
  title?: string;
  message?: string;
}) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    message,
    website: "",
  });
  const submit = trpc.website.submitLead.useMutation({
    onSuccess: () => {
      toast.success(
        "Your message is in. A Savvy STR specialist will follow up shortly."
      );
      setForm({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        message: "",
        website: "",
      });
    },
    onError: error => toast.error(error.message),
  });
  const set = (key: string, value: string) =>
    setForm(prior => ({ ...prior, [key]: value }));
  return (
    // text-slate-900 is set here on purpose: the contact page places this
    // card inside a section styled text-white, and the inputs inherit that,
    // so what a visitor typed was white on white and invisible.
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl">
      <h3 className="text-2xl font-bold text-[#05314a]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        No obligation. Get a property- and market-specific point of view.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <input
          className="rounded-lg border px-3 py-3 text-sm text-slate-900 placeholder:text-slate-400"
          placeholder="First name"
          value={form.firstName}
          onChange={event => set("firstName", event.target.value)}
        />
        <input
          className="rounded-lg border px-3 py-3 text-sm text-slate-900 placeholder:text-slate-400"
          placeholder="Last name"
          value={form.lastName}
          onChange={event => set("lastName", event.target.value)}
        />
        <input
          className="rounded-lg border px-3 py-3 text-sm text-slate-900 placeholder:text-slate-400"
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={event => set("email", event.target.value)}
        />
        <input
          className="rounded-lg border px-3 py-3 text-sm text-slate-900 placeholder:text-slate-400"
          placeholder="Phone (optional)"
          value={form.phone}
          onChange={event => set("phone", event.target.value)}
        />
        <textarea
          className="min-h-28 rounded-lg border px-3 py-3 text-sm text-slate-900 placeholder:text-slate-400 sm:col-span-2"
          placeholder="How can we help?"
          value={form.message}
          onChange={event => set("message", event.target.value)}
        />
        <input
          aria-hidden="true"
          tabIndex={-1}
          className="hidden"
          value={form.website}
          onChange={event => set("website", event.target.value)}
        />
      </div>
      <button
        disabled={
          submit.isPending || !form.firstName || !form.lastName || !form.email
        }
        className="mt-4 flex w-full items-center justify-center rounded-lg bg-[#10c0df] px-4 py-3 font-bold text-[#03293c] disabled:opacity-50"
        onClick={() =>
          submit.mutate({
            ...form,
            intent,
            requestType,
            propertyId,
            agentUserId,
            sourcePath: window.location.pathname,
            // The visit's ad parameters, not just this page's. Links on this
            // site drop the query string, so the landing page's UTMs were gone
            // by the time anyone reached a form.
            attribution: formAttribution(),
          })
        }
      >
        {submit.isPending ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          "Send to Savvy"
        )}
      </button>
    </div>
  );
}

function HomePage() {
  usePageTitle("");
  const home = trpc.website.publicHome.useQuery();
  const [query, setQuery] = useState("");
  if (home.isLoading) return <LoadingPage />;
  const data = home.data;
  const settings: any = data?.settings || {};
  const heroTitle = settings.heroTitle || "Short-Term Rental Properties for Sale — Built for STR Investors";
  const [heroLead, ...heroAccentParts] = heroTitle.split("—");
  const heroAccent = heroAccentParts.join("—").trim();
  return (
    <Shell darkHeader>
      <section className="relative flex min-h-[740px] items-center overflow-hidden bg-[#05314a]">
        <img
          className="absolute inset-0 h-full w-full object-cover"
          src={settings.heroImageUrl}
          alt="Luxury short-term rental property"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#031f30]/95 via-[#05314a]/82 to-[#0d6e83]/55" />
        <div className="relative mx-auto w-full max-w-[1280px] px-4 py-24 sm:px-6 lg:px-8">
          <div className="max-w-4xl">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
              {settings.heroEyebrow || "The STR investment brokerage"}
            </p>
            <h1 className="mt-5 max-w-4xl text-5xl font-black leading-[1.04] tracking-tight text-white sm:text-6xl lg:text-7xl">
              {heroLead.trim()}{heroAccent && <> — <span className="text-[#43e8ff]">{heroAccent}</span></>}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-cyan-50/90">
              {settings.heroBody}
            </p>
            <form
              className="mt-8 flex max-w-2xl flex-col gap-2 rounded-2xl bg-white/95 p-2 shadow-2xl sm:flex-row"
              onSubmit={event => {
                event.preventDefault();
                window.location.href = `${path("/properties")}?search=${encodeURIComponent(query)}`;
              }}
            >
              <div className="flex flex-1 items-center gap-2 px-3">
                <Search className="h-5 w-5 text-cyan-600" />
                <input
                  className="w-full bg-transparent py-3 text-sm outline-none"
                  placeholder="Search a market, city or address"
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                />
              </div>
              <button className="rounded-xl bg-[#05314a] px-6 py-3 text-sm font-bold text-white">
                Search properties
              </button>
            </form>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                className="rounded-lg bg-[#10c0df] px-5 py-3 text-sm font-bold text-[#03293c]"
                href={path("/properties")}
              >
                Find Your Next STR
              </a>
              <a
                className="rounded-lg border border-white/50 bg-white/10 px-5 py-3 text-sm font-bold text-white backdrop-blur"
                href="https://www.savvy.realty/sellers"
                target="_blank"
                rel="noreferrer"
              >
                Sell My STR for Top Dollar
              </a>
            </div>
          </div>
          {Array.isArray(settings.stats) && (
            <div className="mt-16 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
              {settings.stats.map((item: any) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur"
                >
                  <p className="text-3xl font-black text-white">{item.value}</p>
                  <p className="mt-1 text-xs font-medium text-cyan-100">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Curated opportunities"
            title="Featured Properties for Sale"
            body="Browse investor-focused opportunities with specialist representation and property-level intelligence."
          />
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {(data?.properties || []).map((item: any) => (
              <PropertyCard key={item.id} item={item} />
            ))}
          </div>
          <div className="mt-10 text-center">
            <a
              className="inline-flex items-center gap-2 rounded-lg border border-[#05314a] px-5 py-3 text-sm font-bold text-[#05314a]"
              href={path("/properties")}
            >
              View all properties <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>
      <TestimonialsSection rows={settings.testimonials} />
      <section className="relative overflow-hidden bg-[#04283c] py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_30%,rgba(16,192,223,.24),transparent_35%)]" />
        <div className="relative mx-auto max-w-[1180px] px-4 text-center sm:px-6">
          <SectionHeading
            eyebrow="Built differently"
            title="More than an agent. Your STR investment team."
            body="From market selection through underwriting, offer strategy, diligence, launch planning, and local introductions—Savvy is built around the full investment decision."
            tone="dark"
          />
          <div className="mt-10 grid gap-3 text-left md:grid-cols-2 lg:grid-cols-3">
            {[
              "STR-specialized local representation",
              "Property-specific revenue modeling",
              "Regulation and zoning diligence",
              "Comparable-market intelligence",
              "Amenity and design recommendations",
              "Post-close operator connections",
            ].map(item => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/10 p-4 font-semibold text-white"
              >
                <span className="rounded-full bg-cyan-400 p-1 text-[#05314a]">
                  <Check className="h-3.5 w-3.5" />
                </span>
                {item}
              </div>
            ))}
          </div>
          <a
            className="mt-10 inline-flex rounded-lg bg-[#10c0df] px-6 py-3 font-bold text-[#03293c]"
            href={path("/contact")}
          >
            Talk to an STR Agent
          </a>
        </div>
      </section>
      <section className="bg-white py-20">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Local expertise"
            title="Expert STR Agents by Market"
            body="Work with a specialist who understands investor goals and the local operating reality."
          />
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {(data?.agents || []).slice(0, 4).map((item: any) => (
              <AgentCard key={item.id} item={item} />
            ))}
          </div>
          <div className="mt-10 text-center">
            <a
              className="font-bold text-[#05314a] underline decoration-cyan-400 decoration-2 underline-offset-4"
              href={path("/agents")}
            >
              View all agents
            </a>
          </div>
        </div>
      </section>
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Real relationships"
            title="Proven Investment Success Stories"
            body="See what changes when investors work with a team built around short-term rentals."
          />
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {(data?.caseStudies || []).map((item: any) => (
              <StoryCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      </section>
      <section className="bg-white py-20">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Learn before you buy"
            title="Featured Insights & Guides"
            body="Practical intelligence from agents and operators working in STR markets every day."
          />
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {(data?.posts || []).map((item: any) => (
              <ArticleCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      </section>
      <section className="bg-gradient-to-r from-[#05314a] to-[#0f9db7] py-20 text-center">
        <div className="mx-auto max-w-3xl px-5">
          <BookOpen className="mx-auto h-10 w-10 text-cyan-300" />
          <h2 className="mt-5 text-4xl font-black text-white">
            Ready to Start Investing in STR Properties?
          </h2>
          <p className="mt-4 text-lg text-cyan-50">
            Build your buy box and get matched with a specialist who can help
            you move with confidence.
          </p>
          <a
            className="mt-7 inline-flex rounded-lg bg-[#10c0df] px-6 py-3 font-bold text-[#03293c]"
            href={path("/contact")}
          >
            Find My Next STR Investment <ArrowRight className="ml-2 h-5 w-5" />
          </a>
        </div>
      </section>
    </Shell>
  );
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  single_family: "Single family",
  multi_family: "Multi family",
  condo: "Condo",
  townhouse: "Townhouse",
  cabin: "Cabin",
  vacation_rental: "Vacation rental",
  commercial: "Commercial",
  land: "Land",
  other: "Other",
};

const SORT_LABELS: Record<string, string> = {
  featured: "Featured first",
  priceAsc: "Price, low to high",
  priceDesc: "Price, high to low",
  newest: "Recently added",
};

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <select
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#05314a] outline-none focus:border-cyan-500"
        value={value}
        onChange={event => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "Washington DC",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

// Filters live in the address, so a filtered list can be shared or
// bookmarked, and Back returns to the same results.
const PROPERTY_FILTER_KEYS = [
  "search",
  "market",
  "state",
  "type",
  "beds",
  "baths",
  "minPrice",
  "maxPrice",
  "sort",
] as const;
type PropertyFilterKey = (typeof PROPERTY_FILTER_KEYS)[number];
type PropertyFilters = Record<PropertyFilterKey, string>;

function readPropertyFilters(): PropertyFilters {
  const params = new URLSearchParams(window.location.search);
  const filters = {} as PropertyFilters;
  for (const key of PROPERTY_FILTER_KEYS) filters[key] = params.get(key) || "";
  if (!filters.sort) filters.sort = "featured";
  return filters;
}

function PropertiesPage() {
  usePageTitle("Short-Term Rental Properties for Sale");
  const [filters, setFilters] = useState<PropertyFilters>(readPropertyFilters);
  const set = (key: PropertyFilterKey) => (value: string) =>
    setFilters(current => ({ ...current, [key]: value }));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    for (const key of PROPERTY_FILTER_KEYS) {
      const value = filters[key];
      if (value && !(key === "sort" && value === "featured")) params.set(key, value);
      else params.delete(key);
    }
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}`
    );
  }, [filters]);

  // Search runs a moment after typing stops, not on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(filters.search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [filters.search]);

  const facets = trpc.website.publicPropertyFacets.useQuery();
  const query = trpc.website.publicProperties.useQuery(
    {
    search: debouncedSearch || undefined,
    marketId: filters.market ? Number(filters.market) : undefined,
    state: filters.state || undefined,
    propertyType: filters.type || undefined,
    minBeds: filters.beds ? Number(filters.beds) : undefined,
    minBaths: filters.baths ? Number(filters.baths) : undefined,
    minPrice: filters.minPrice ? Number(filters.minPrice) : undefined,
    maxPrice: filters.maxPrice ? Number(filters.maxPrice) : undefined,
    sort: filters.sort as any,
    },
    // Keep showing the current results while the next set loads. Without
    // this every keystroke or filter change swapped the whole page for the
    // loading screen, which also threw away what was typed in the search box.
    { placeholderData: previous => previous }
  );

  const chipKeys: PropertyFilterKey[] = [
    "market",
    "state",
    "type",
    "beds",
    "baths",
    "minPrice",
    "maxPrice",
  ];
  const activeFilters = chipKeys.filter(key => filters[key]).length;
  const clearFilters = () =>
    setFilters(current => ({
      ...current,
      market: "",
      state: "",
      type: "",
      beds: "",
      baths: "",
      minPrice: "",
      maxPrice: "",
    }));

  // Price steps are built from what is published, so we never offer a bound
  // that no property sits on the right side of.
  const priceSteps = (() => {
    const range = facets.data?.priceRange;
    if (!range) return [];
    return [250000, 500000, 750000, 1000000, 1500000, 2000000, 3000000].filter(
      step => step > range.min && step < range.max
    );
  })();

  const marketName = (id: string) =>
    facets.data?.markets?.find((item: any) => String(item.id) === id)?.name ||
    "Market";
  const chipLabel = (key: PropertyFilterKey): string => {
    const value = filters[key];
    switch (key) {
      case "market":
        return marketName(value);
      case "state":
        return US_STATE_NAMES[value] || value;
      case "type":
        return PROPERTY_TYPE_LABELS[value] || value;
      case "beds":
        return `${value}+ beds`;
      case "baths":
        return `${value}+ baths`;
      case "minPrice":
        return `From ${money(value)}`;
      case "maxPrice":
        return `Up to ${money(value)}`;
      default:
        return value;
    }
  };

  const hasMarkets = !!facets.data?.markets?.length;
  if (query.isLoading && !query.data) return <LoadingPage />;
  const items = query.data || [];
  const updating = query.isFetching && query.isPlaceholderData;
  return (
    <Shell>
      <section className="border-b bg-slate-50 pb-10 pt-14">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-600">
                Properties for sale
              </p>
              <h1 className="mt-2 text-4xl font-black text-[#05314a] sm:text-5xl">
                Short-Term Rental Properties
              </h1>
            </div>
            <p className="max-w-xl text-base text-slate-600 lg:text-right">
              Investor-focused opportunities, specialist agents, and property
              intelligence in one place.
            </p>
          </div>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-cyan-500 focus-within:bg-white">
              <Search className="h-5 w-5 shrink-0 text-cyan-600" />
              <input
                className="w-full bg-transparent px-1 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                placeholder="Search by city, state, address or keyword"
                value={filters.search}
                onChange={event => set("search")(event.target.value)}
              />
              {filters.search ? (
                <button
                  type="button"
                  onClick={() => set("search")("")}
                  className="text-xs font-semibold text-slate-500 hover:text-cyan-700"
                >
                  Clear
                </button>
              ) : null}
            </div>
            <div
              className={`mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 ${hasMarkets ? "lg:grid-cols-7" : "lg:grid-cols-6"}`}
            >
              {/* Only markets with a published property are offered, so the
                  filter is hidden until at least one has something to show. */}
              {hasMarkets ? (
                <FilterSelect
                  label="Market"
                  value={filters.market}
                  onChange={set("market")}
                >
                  <option value="">All markets</option>
                  {facets.data!.markets.map((item: any) => (
                    <option key={item.id} value={String(item.id)}>
                      {item.name} ({item.propertyCount})
                    </option>
                  ))}
                </FilterSelect>
              ) : null}
              <FilterSelect
                label="State"
                value={filters.state}
                onChange={set("state")}
              >
                <option value="">All states</option>
                {(facets.data?.states || []).map((code: string) => (
                  <option key={code} value={code}>
                    {US_STATE_NAMES[code] || code}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect label="Type" value={filters.type} onChange={set("type")}>
                <option value="">Any type</option>
                {(facets.data?.propertyTypes || []).map((type: string) => (
                  <option key={type} value={type}>
                    {PROPERTY_TYPE_LABELS[type] || type}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect label="Beds" value={filters.beds} onChange={set("beds")}>
                <option value="">Any</option>
                {[1, 2, 3, 4, 5, 6].map(n => (
                  <option key={n} value={String(n)}>
                    {n}+
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect label="Baths" value={filters.baths} onChange={set("baths")}>
                <option value="">Any</option>
                {[1, 2, 3, 4, 5].map(n => (
                  <option key={n} value={String(n)}>
                    {n}+
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                label="Min price"
                value={filters.minPrice}
                onChange={set("minPrice")}
              >
                <option value="">No min</option>
                {priceSteps.map(step => (
                  <option key={step} value={String(step)}>
                    {money(step)}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                label="Max price"
                value={filters.maxPrice}
                onChange={set("maxPrice")}
              >
                <option value="">No max</option>
                {priceSteps.map(step => (
                  <option key={step} value={String(step)}>
                    {money(step)}
                  </option>
                ))}
              </FilterSelect>
            </div>
            {activeFilters ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                {chipKeys
                  .filter(key => filters[key])
                  .map(key => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => set(key)("")}
                      className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900 hover:bg-cyan-100"
                      aria-label={`Remove filter ${chipLabel(key)}`}
                    >
                      {chipLabel(key)}
                      <X className="h-3 w-3" />
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-semibold text-slate-500 underline-offset-2 hover:text-cyan-700 hover:underline"
                >
                  Clear all
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>
      <section className="py-12">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
          <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-cyan-700">
                {items.length} {items.length === 1 ? "opportunity" : "opportunities"}
              </p>
              <h2 className="text-2xl font-bold text-[#05314a]">
                Properties matching your search
              </h2>
            </div>
            <div className="sm:w-56">
              <FilterSelect label="Sort by" value={filters.sort} onChange={set("sort")}>
                {Object.entries(SORT_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </FilterSelect>
            </div>
          </div>
          {items.length ? (
            <div
              className={`grid gap-6 transition-opacity md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${updating ? "opacity-60" : ""}`}
              aria-busy={updating}
            >
              {items.map((item: any) => (
                <PropertyCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed bg-slate-50 p-16 text-center">
              <Search className="mx-auto h-8 w-8 text-slate-300" />
              <h3 className="mt-4 text-xl font-bold text-[#05314a]">
                No properties found
              </h3>
              <p className="mt-2 text-slate-500">
                {activeFilters
                  ? "No published property matches these filters yet. Try widening them."
                  : "Try a broader market, city, or address."}
              </p>
              {activeFilters ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-cyan-700 hover:bg-slate-50"
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </Shell>
  );
}

function AgentNote({ item }: { item: any }) {
  if (!item.agentBlurb) return null;
  return (
    <div className="rounded-2xl border bg-white p-7 shadow-sm">
      <p className="text-sm font-bold uppercase tracking-[.16em] text-cyan-600">
        Why I like this property
      </p>
      <div className="mt-4 flex gap-4">
        <Quote className="h-6 w-6 shrink-0 text-cyan-200" />
        <p className="text-base leading-8 text-slate-700">{item.agentBlurb}</p>
      </div>
      <div className="mt-5 flex items-center gap-3 border-t pt-5">
        {item.assignedAgentImageUrl ? (
          <img
            src={item.assignedAgentImageUrl}
            alt=""
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-100">
            <UserRound className="h-5 w-5 text-cyan-700" />
          </div>
        )}
        <div>
          <p className="text-sm font-bold text-[#05314a]">
            {item.assignedAgentName || "Savvy STR Agents"}
          </p>
          <p className="text-xs text-slate-500">STR Investment Specialist</p>
        </div>
      </div>
    </div>
  );
}

/**
 * What the form says depending on which button opened it.
 *
 * The message is pre-filled but editable. It saves someone typing the obvious
 * and, more usefully, it means the agent receiving the lead knows what was
 * asked for without having to guess from an empty message.
 */
const ASK_COPY: Record<
  "showing" | "analysis" | "financing" | "default",
  { title: (address: string) => string; message: (address: string) => string }
> = {
  showing: {
    title: address => `Book a showing at ${address}`,
    message: address =>
      `I'd like to see ${address}. Here are some times that work for me:`,
  },
  analysis: {
    title: address => `Request the full analysis for ${address}`,
    message: address =>
      `Please send me the complete investment analysis for ${address}.`,
  },
  financing: {
    title: address => `Financing for ${address}`,
    message: address =>
      `I'd like to talk through financing options for ${address}.`,
  },
  default: {
    title: address => `Ask about ${address}`,
    message: address =>
      `I'd like the full investment analysis for ${address}.`,
  },
};

const pctInput = (value: string) => {
  const parsed = parseFloat(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * What this property might do at terms the reader chooses.
 *
 * Every assumption is a field they can change, and the defaults are stated
 * rather than buried. It runs on the published projected revenue, so it is
 * behind the same login as that figure: a calculator with no revenue in it
 * would either sit empty or invite someone to type a number and mistake their
 * own guess for our analysis.
 */
function InvestmentCalculator({ item }: { item: any }) {
  const [terms, setTerms] = useState({
    downPaymentPct: String(CALCULATOR_DEFAULTS.downPaymentPct),
    interestRatePct: String(CALCULATOR_DEFAULTS.interestRatePct),
    loanTermYears: String(CALCULATOR_DEFAULTS.loanTermYears),
    operatingCostPct: String(CALCULATOR_DEFAULTS.operatingCostPct),
    annualTaxesAndInsurance: "",
  });
  const set = (key: string, value: string) =>
    setTerms(prior => ({ ...prior, [key]: value }));

  const result = runCalculator({
    purchasePrice: item.listPrice == null ? null : Number(item.listPrice),
    annualRevenue:
      item.projectedRevenue == null ? null : Number(item.projectedRevenue),
    downPaymentPct: pctInput(terms.downPaymentPct),
    interestRatePct: pctInput(terms.interestRatePct),
    loanTermYears: pctInput(terms.loanTermYears) || 30,
    operatingCostPct: pctInput(terms.operatingCostPct),
    annualTaxesAndInsurance: pctInput(terms.annualTaxesAndInsurance),
  });

  const fields: Array<[string, string, string]> = [
    ["Down payment", "downPaymentPct", "%"],
    ["Interest rate", "interestRatePct", "%"],
    ["Loan term", "loanTermYears", "yrs"],
    ["Operating costs", "operatingCostPct", "% of revenue"],
    ["Taxes & insurance", "annualTaxesAndInsurance", "$ / yr"],
  ];

  return (
    <div className="rounded-2xl border bg-white p-7 shadow-sm">
      <h2 className="flex items-center gap-2 text-2xl font-bold text-[#05314a]">
        <Calculator className="h-5 w-5 text-cyan-600" />
        Investment calculator
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        Built on this listing's price and projected revenue. Change any
        assumption to see what it does.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map(([label, key, suffix]) => (
          <label key={key} className="block">
            <span className="text-xs font-semibold text-slate-600">
              {label}
            </span>
            <div className="mt-1 flex items-center rounded-lg border border-slate-300 px-3">
              <input
                className="w-full py-2.5 text-sm outline-none"
                inputMode="decimal"
                value={(terms as any)[key]}
                placeholder="0"
                onChange={event => set(key, event.target.value)}
              />
              <span className="ml-2 shrink-0 text-xs text-slate-400">
                {suffix}
              </span>
            </div>
          </label>
        ))}
      </div>

      {result ? (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              [
                "Monthly cash flow",
                money(Math.round(result.monthlyCashFlow)),
                result.monthlyCashFlow < 0,
              ],
              [
                "Cash-on-cash",
                result.cashOnCash == null
                  ? "—"
                  : percent(result.cashOnCash),
                (result.cashOnCash ?? 0) < 0,
              ],
              ["Cap rate", percent(result.capRate), false],
            ].map(([label, value, negative]: any) => (
              <div
                key={label}
                className={`rounded-xl p-4 ${negative ? "bg-rose-50" : "bg-cyan-50"}`}
              >
                <p
                  className={`text-2xl font-black ${negative ? "text-rose-700" : "text-[#05314a]"}`}
                >
                  {value}
                </p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>
          <dl className="mt-5 grid gap-x-6 gap-y-2 border-t pt-5 text-sm sm:grid-cols-2">
            {[
              ["Down payment", money(Math.round(result.downPayment))],
              ["Loan amount", money(Math.round(result.loanAmount))],
              [
                "Monthly loan payment",
                money(Math.round(result.monthlyDebtPayment)),
              ],
              ["Operating costs", money(Math.round(result.operatingCosts))],
              [
                "Net operating income",
                money(Math.round(result.netOperatingIncome)),
              ],
              ["Annual cash flow", money(Math.round(result.annualCashFlow))],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-slate-500">{label}</dt>
                <dd className="font-semibold text-[#05314a]">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-xs leading-5 text-slate-500">
            An estimate, not an offer. Cash invested counts the down payment
            only, so closing costs, furnishing and renovation are on top.
            Confirm every figure with your agent, your lender and your
            accountant before you act on it.
          </p>
        </>
      ) : (
        <p className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          This listing does not have a published revenue projection yet, so
          there is nothing to calculate from. Ask the agent for the full
          analysis.
        </p>
      )}
    </div>
  );
}

function PropertyDetailPage({ slug }: { slug: string }) {
  const query = trpc.website.publicProperty.useQuery({ slug });
  // The revenue range and comps come from the linked pro-forma, read live, so
  // the listing cannot drift from the analysis it claims to be based on.
  const evidence = trpc.website.publicPropertyEvidence.useQuery({ slug });
  const [showLead, setShowLead] = useState(false);
  // Which of the three calls to action was pressed, so the form says what it
  // is for and the lead records what was actually asked.
  const [ask, setAsk] = useState<null | "showing" | "analysis" | "financing">(
    null
  );
  usePageTitle(query.data?.metaTitle || query.data?.address || "Property");
  // Recorded for the signed-in investor only, and only once per listing per
  // visit. Anonymous browsing is not tracked to an account that does not exist.
  useRecordPropertyView((query.data as any)?.propertyId);
  if (query.isLoading) return <LoadingPage />;
  const item: any = query.data;
  if (!item) return <NotFoundPage />;
  const gallery = Array.from(
    new Set(
      [item.heroImageUrl, ...(item.galleryImageUrls || [])].filter(Boolean)
    )
  );
  const highlights = Array.isArray(item.investmentHighlights)
    ? item.investmentHighlights
    : [];
  return (
    <Shell>
      <section className="bg-[#05314a] py-12 text-white">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
          <a
            className="inline-flex items-center gap-2 text-sm text-cyan-200"
            href={path("/properties")}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to properties
          </a>
          <div className="mt-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[.18em] text-cyan-300">
                Investment property
              </p>
              <h1 className="mt-2 text-4xl font-black sm:text-5xl">
                {item.address}
              </h1>
              <p className="mt-3 flex items-center gap-2 text-cyan-50">
                <MapPin className="h-4 w-4" />
                {[item.city, item.state, item.zip].filter(Boolean).join(", ")}
              </p>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/10 p-4 text-right">
              <p className="text-xs uppercase tracking-wide text-cyan-200">
                List price
              </p>
              <p className="text-3xl font-black">{money(item.listPrice)}</p>
            </div>
          </div>
          <div className="mt-8 grid h-[420px] gap-3 overflow-hidden rounded-2xl md:grid-cols-3">
            <img
              src={gallery[0]}
              alt={`${item.address} exterior`}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              className="h-full w-full object-cover md:col-span-2"
            />
            <div className="hidden grid-rows-2 gap-3 md:grid">
              {[gallery[1] || gallery[0], gallery[2] || gallery[0]].map(
                (image: string, index: number) => (
                <img
                  key={index}
                  src={image}
                  alt={`${item.address} detail ${index + 2}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  className="h-full min-h-0 w-full object-cover"
                  />
                )
              )}
            </div>
          </div>
        </div>
      </section>
      <section className="bg-slate-50 py-16">
        <div className="mx-auto grid max-w-[1280px] gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] lg:px-8">
          <div className="space-y-7">
            <div className="rounded-2xl border bg-white p-7 shadow-sm">
              <p className="text-sm font-bold uppercase tracking-[.16em] text-cyan-600">
                Why this property
              </p>
              <h2 className="mt-2 text-3xl font-bold text-[#05314a]">
                {item.headline || item.address}
              </h2>
              <p className="mt-5 text-base leading-8 text-slate-650">
                {item.summary ||
                  "Connect with the assigned Savvy specialist for the complete opportunity review."}
              </p>
              <div className="mt-6 grid grid-cols-3 rounded-xl border bg-slate-50 p-4 text-center">
                <div>
                  <BedDouble className="mx-auto h-5 w-5 text-cyan-600" />
                  <p className="mt-1 font-bold">{item.beds || "—"}</p>
                  <p className="text-xs text-slate-500">Bedrooms</p>
                </div>
                <div>
                  <Bath className="mx-auto h-5 w-5 text-cyan-600" />
                  <p className="mt-1 font-bold">{item.baths || "—"}</p>
                  <p className="text-xs text-slate-500">Bathrooms</p>
                </div>
                <div>
                  <Square className="mx-auto h-5 w-5 text-cyan-600" />
                  <p className="mt-1 font-bold">
                    {item.sqft ? Number(item.sqft).toLocaleString() : "—"}
                  </p>
                  <p className="text-xs text-slate-500">Square feet</p>
                </div>
              </div>
            </div>
            {item.gated ? (
              <LockedPanel
                title="Projected opportunity"
                description="Annual revenue, cash-on-cash, cap rate and occupancy for this property are available to investors with a free account."
              />
            ) : (
              <div className="rounded-2xl border bg-white p-7 shadow-sm">
                <h2 className="text-2xl font-bold text-[#05314a]">
                  Projected opportunity
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  Public estimates are shown only when a SavvyOS analysis has been
                  attached. Confirm assumptions in the full diligence package.
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Annual revenue", money(item.projectedRevenue), DollarSign],
                    ["Cash-on-cash", percent(item.cashOnCash), TrendingUp],
                    ["Cap rate", percent(item.capRate), LineChart],
                    ["Occupancy", percent(item.occupancyRate), CalendarDays],
                  ].map(([label, value, Icon]: any) => (
                    <div key={label} className="rounded-xl bg-cyan-50 p-4">
                      <Icon className="h-5 w-5 text-cyan-700" />
                      <p className="mt-3 text-2xl font-black text-[#05314a]">
                        {value}
                      </p>
                      <p className="text-xs text-slate-500">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {evidence.data?.gated && (
              <LockedPanel
                title="Revenue range and comparable listings"
                description="The projected revenue range for this property, and the nearby listings the projection is built from, are available to investors with a free account."
              />
            )}
            {evidence.data?.revenue && (
              <RevenueRangeSection
                revenue={evidence.data.revenue}
                comps={evidence.data.comps}
              />
            )}
            {item.blurbGated ? (
              <LockedPanel
                title="Why I like this property"
                description="The assigned agent's own take on this listing is available to investors with a free account."
              />
            ) : (
              <AgentNote item={item} />
            )}
            {item.gated ? (
              <LockedPanel
                title="Investment calculator"
                description="Model this property at your own down payment, rate and operating costs. Available to investors with a free account."
              />
            ) : (
              <InvestmentCalculator item={item} />
            )}
            {highlights.length > 0 && (
              <div className="rounded-2xl border bg-white p-7 shadow-sm">
                <h2 className="text-2xl font-bold text-[#05314a]">
                  Investment highlights
                </h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {highlights.map((text: string) => (
                    <div
                      key={text}
                      className="flex gap-3 rounded-xl bg-slate-50 p-4"
                    >
                      <Check className="mt-0.5 h-5 w-5 shrink-0 text-cyan-600" />
                      <span className="text-sm font-medium text-slate-700">
                        {text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
              <h2 className="font-bold text-amber-950">
                Regulation & diligence
              </h2>
              <p className="mt-2 text-sm leading-6 text-amber-900">
                {item.regulationSummary ||
                  "Verify all municipal, county, HOA, insurance, financing, and operating requirements before purchase."}
              </p>
            </div>
          </div>
          <aside className="space-y-6">
            <div className="sticky top-24 space-y-6">
              <div className="rounded-2xl border bg-white p-6 shadow-lg">
                <p className="text-xs font-bold uppercase tracking-[.16em] text-cyan-600">
                  Your local specialist
                </p>
                <div className="mt-4 flex items-center gap-4">
                  {item.assignedAgentImageUrl ? (
                    <img
                      src={item.assignedAgentImageUrl}
                      alt={item.assignedAgentName}
                      className="h-16 w-16 rounded-2xl object-cover"
                    />
                  ) : (
                    <UserRound className="h-16 w-16 rounded-2xl bg-slate-100 p-4" />
                  )}
                  <div>
                    <p className="text-xl font-bold text-[#05314a]">
                      {item.assignedAgentName || "Savvy STR Agents"}
                    </p>
                    <p className="text-sm text-slate-500">
                      STR Investment Specialist
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowLead(value => !value)}
                  className="mt-5 w-full rounded-lg bg-[#05314a] px-4 py-3 font-bold text-white"
                >
                  {item.callToActionText}
                </button>
                {item.assignedAgentPhone && (
                  <a
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-bold text-[#05314a]"
                    href={`tel:${item.assignedAgentPhone.replace(/[^+\d]/g, "")}`}
                  >
                    <Phone className="h-4 w-4" />
                    Call agent
                  </a>
                )}
                <div className="mt-2">
                  <SaveButton propertyId={item.propertyId} />
                </div>
                <div className="mt-4 space-y-2 border-t pt-4">
                  {(
                    [
                      ["showing", "Book a showing", CalendarCheck],
                      ["analysis", "Request deeper analysis", LineChart],
                      ["financing", "Financing", Landmark],
                    ] as const
                  ).map(([key, label, Icon]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setAsk(key);
                        setShowLead(true);
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold transition ${
                        ask === key
                          ? "border-cyan-400 bg-cyan-50 text-[#05314a]"
                          : "border-slate-300 text-[#05314a] hover:bg-slate-50"
                      }`}
                    >
                      <Icon className="h-4 w-4 text-cyan-600" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {showLead && (
                <LeadForm
                  agentUserId={item.assignedAgentId}
                  propertyId={item.propertyId}
                  intent="property"
                  requestType={ask ?? undefined}
                  title={ASK_COPY[ask ?? "default"].title(item.address)}
                  message={ASK_COPY[ask ?? "default"].message(item.address)}
                />
              )}
            </div>
          </aside>
        </div>
      </section>
    </Shell>
  );
}

function AgentsPage() {
  usePageTitle("Our STR Investment Agents");
  const [search, setSearch] = useState("");
  const query = trpc.website.publicAgents.useQuery();
  if (query.isLoading) return <LoadingPage />;
  const items = (query.data || []).filter(
    (item: any) =>
      !search ||
      `${item.name} ${item.headline} ${(item.markets || []).join(" ")} ${(item.specialties || []).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );
  return (
    <Shell>
      <section className="bg-[#05314a] py-20 text-center text-white">
        <div className="mx-auto max-w-3xl px-5">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-300">
            National network. Local expertise.
          </p>
          <h1 className="mt-3 text-5xl font-black">
            Find Your STR Investment Agent
          </h1>
          <p className="mt-5 text-lg text-cyan-50">
            Search by name, market, state, or specialty and meet an agent who
            speaks investor.
          </p>
        </div>
      </section>
      <section className="bg-slate-50 py-14">
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
          <div className="mb-8 flex items-center gap-3 rounded-xl border bg-white px-4 shadow-sm">
            <Search className="h-5 w-5 text-cyan-600" />
            <input
              className="w-full py-4 text-sm outline-none"
              placeholder="Search by name, market, state or specialty"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {items.map((item: any) => (
              <AgentCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      </section>
    </Shell>
  );
}

function AgentDetailPage({ slug }: { slug: string }) {
  const query = trpc.website.publicAgent.useQuery({ slug });
  const item: any = query.data;
  usePageTitle(item?.name || "Agent");
  if (query.isLoading) return <LoadingPage />;
  if (!item) return <NotFoundPage />;
  return (
    <Shell>
      <section className="bg-[#05314a] py-16 text-white">
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
          <a
            href={path("/agents")}
            className="flex items-center gap-2 text-sm text-cyan-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to agents
          </a>
          <div className="mt-8 flex flex-col items-center gap-8 md:flex-row">
            <img
              src={item.imageUrl}
              alt={item.name}
              className="h-56 w-56 rounded-3xl border-4 border-white/20 bg-white/5 object-cover"
            />
            <div className="flex-1 text-center md:text-left">
              <p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-300">
                STR Investment Specialist
              </p>
              <h1 className="mt-2 text-5xl font-black">{item.name}</h1>
              <p className="mt-4 max-w-2xl text-lg text-cyan-50">
                {item.headline}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2 md:justify-start">
                {(item.markets || []).map((market: string) => (
                  <span
                    key={market}
                    className="rounded-full bg-white/10 px-3 py-1 text-sm"
                  >
                    {market}
                  </span>
                ))}
              </div>
            </div>
            <div className="w-full rounded-2xl border border-white/15 bg-white/10 p-5 md:w-72">
              <p className="font-bold">
                Connect with {String(item.name).split(" ")[0]}
              </p>
              <div className="mt-4 grid gap-2">
                {item.publicEmail && (
                  <a
                    href={`mailto:${item.publicEmail}`}
                    className="flex items-center justify-center gap-2 rounded-lg bg-[#10c0df] px-4 py-3 font-bold text-[#03293c]"
                  >
                    <Mail className="h-4 w-4" />
                    Send message
                  </a>
                )}
                {item.publicPhone && (
                  <a
                    href={`tel:${item.publicPhone.replace(/[^+\d]/g, "")}`}
                    className="flex items-center justify-center gap-2 rounded-lg border border-white/30 px-4 py-3 font-bold text-white"
                  >
                    <Phone className="h-4 w-4" />
                    Call agent
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="bg-slate-50 py-16">
        <div className="mx-auto grid max-w-[1180px] gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div>
            <div className="rounded-2xl border bg-white p-8 shadow-sm">
              <h2 className="text-3xl font-bold text-[#05314a]">
                About {item.name}
              </h2>
              {String(item.shortBio || "")
                .split(/\n\s*\n/)
                .map((paragraph: string, index: number) => (
                  <p key={index} className="mt-5 leading-8 text-slate-650">
                    {paragraph.replace(/^"|"$/g, "")}
                  </p>
                ))}
              <div className="mt-7 flex flex-wrap gap-2">
                {(item.specialties || []).map((tag: string) => (
                  <span
                    key={tag}
                    className="rounded-full bg-cyan-50 px-3 py-1.5 text-sm font-semibold text-cyan-900"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            {item.properties?.length > 0 && (
              <div className="mt-10">
                <SectionHeading
                  align="left"
                  title={`Properties with ${item.name}`}
                />
                <div className="mt-6 grid gap-6 md:grid-cols-2">
                  {item.properties.map((property: any) => (
                    <PropertyCard key={property.id} item={property} />
                  ))}
                </div>
              </div>
            )}
          </div>
          <aside>
            <LeadForm
              agentUserId={item.userId}
              intent="agent"
              title={`Message ${item.name}`}
              message={`I'd like to connect about STR investment opportunities in ${(item.markets || ["your market"])[0]}.`}
            />
            {item.bookingUrl && (
              <a
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#05314a] px-5 py-4 font-bold text-white"
                href={item.bookingUrl}
                target="_blank"
                rel="noreferrer"
              >
                <CalendarDays className="h-5 w-5" />
                Book a call
              </a>
            )}
          </aside>
        </div>
      </section>
    </Shell>
  );
}

/** Read and write one query-string value without reloading the page. */
function useQueryParam(key: string): [string, (value: string) => void] {
  const [value, setValue] = useState(
    () => new URLSearchParams(window.location.search).get(key) || ""
  );
  const update = (next: string) => {
    setValue(next);
    const params = new URLSearchParams(window.location.search);
    if (next) params.set(key, next);
    else params.delete(key);
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}`
    );
  };
  return [value, update];
}

function CaseStudiesPage() {
  usePageTitle("STR Investment Case Studies");
  const [search, setSearch] = useQueryParam("search");
  const [bandParam, setBand] = useQueryParam("investment");
  const band = isInvestmentBand(bandParam) ? bandParam : "";
  const query = trpc.website.publicCaseStudies.useQuery();
  if (query.isLoading) return <LoadingPage />;
  const all = query.data || [];
  const needle = search.trim().toLowerCase();
  const items = all.filter(
    (item: any) =>
      (!needle ||
        `${item.title} ${item.excerpt || ""} ${item.agentName || ""}`
          .toLowerCase()
          .includes(needle)) &&
      (!band || inInvestmentBand(item.investmentAmount, band))
  );
  const filtered = !!(needle || band);
  const clear = () => {
    setSearch("");
    setBand("");
  };
  return (
    <Shell>
      <section className="border-b bg-slate-50 py-16">
        <div className="mx-auto max-w-[1180px] px-4 text-center sm:px-6">
          <h1 className="text-5xl font-black text-[#05314a]">Case Studies</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            The decisions, relationships, and execution behind successful STR
            purchases.
          </p>
          <div className="mx-auto mt-8 flex max-w-4xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm md:flex-row md:items-center">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-cyan-500 focus-within:bg-white">
              <Search className="h-5 w-5 shrink-0 text-cyan-600" />
              <input
                className="w-full bg-transparent py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                placeholder="Search case studies by title, summary or agent"
                value={search}
                onChange={event => setSearch(event.target.value)}
              />
            </div>
            <select
              aria-label="Investment amount"
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-[#05314a] outline-none focus:border-cyan-500 md:w-60"
              value={band}
              onChange={event => setBand(event.target.value)}
            >
              <option value="">Any investment amount</option>
              {INVESTMENT_BANDS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {filtered ? (
            <p className="mt-4 text-sm text-slate-500">
              Showing {items.length} of {all.length}{" "}
              <button
                type="button"
                onClick={clear}
                className="ml-1 font-semibold text-cyan-700 hover:underline"
              >
                Clear filters
              </button>
            </p>
          ) : null}
        </div>
      </section>
      <section className="py-16">
        {items.length ? (
          <div className="mx-auto grid max-w-[1180px] gap-6 px-4 sm:px-6 lg:grid-cols-2">
            {items.map((item: any) => (
              <StoryCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
            <div className="rounded-2xl border border-dashed bg-slate-50 p-16 text-center">
              <Search className="mx-auto h-8 w-8 text-slate-300" />
              <h3 className="mt-4 text-xl font-bold text-[#05314a]">
                No case studies match
              </h3>
              <p className="mt-2 text-slate-500">Try a different search or amount.</p>
              <button
                type="button"
                onClick={clear}
                className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-cyan-700 hover:bg-slate-50"
              >
                Clear filters
              </button>
            </div>
          </div>
        )}
      </section>
    </Shell>
  );
}

/**
 * Count one read of an article, once per visit.
 *
 * Deliberately silent. If the counter fails the reader must never know, and
 * the article must still be there, so nothing here can block or interrupt the
 * page.
 */
function useRecordArticleView(
  kind: "post" | "case_study",
  contentId: number | null | undefined
) {
  const record = trpc.website.recordArticleView.useMutation();
  const mutate = record.mutate;
  useEffect(() => {
    if (!contentId) return;
    mutate({ kind, contentId });
    // Once per article per visit. Re-firing on every render would turn a read
    // count into a render count.
  }, [kind, contentId, mutate]);
}

function CaseStudyDetailPage({ slug }: { slug: string }) {
  const query = trpc.website.publicCaseStudy.useQuery({ slug });
  const item: any = query.data;
  usePageTitle(item?.title || "Case Study");
  useRecordArticleView("case_study", item?.id);
  if (query.isLoading) return <LoadingPage />;
  if (!item) return <NotFoundPage />;
  return (
    <Shell>
      <article>
        <header className="mx-auto max-w-5xl px-5 py-16 text-center">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-600">
            {item.eyebrow || "Investor story"}
          </p>
          <h1 className="mt-3 text-4xl font-black leading-tight text-[#05314a] sm:text-6xl">
            {item.title}
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-slate-600">
            {item.excerpt}
          </p>
        </header>
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
          <img
            src={item.heroImageUrl}
            alt={item.title}
            className="h-[500px] w-full rounded-3xl object-cover"
          />
        </div>
        <div className="mx-auto grid max-w-[1000px] gap-8 px-5 py-16 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <div className="rounded-2xl border bg-white p-8 shadow-sm">
            <div className="grid grid-cols-2 gap-3">
              {[
                [item.primaryMetricLabel, item.primaryMetricValue],
                [item.secondaryMetricLabel, item.secondaryMetricValue],
              ]
                .filter(value => value[1])
                .map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-cyan-50 p-5">
                    <p className="text-2xl font-black text-[#05314a]">
                      {value}
                    </p>
                    <p className="text-xs text-slate-500">{label}</p>
                  </div>
                ))}
            </div>
            <div className="prose prose-slate mt-8 max-w-none prose-headings:text-[#05314a] prose-a:text-cyan-700">
              <ArticleBody markdown={item.body || ""} />
            </div>
          </div>
          <aside>
            <LeadForm
              agentUserId={item.agentUserId || undefined}
              propertyId={item.propertyId || undefined}
              intent="property"
              title={
                item.agentName
                  ? `Ask ${item.agentName}`
                  : "Ask Savvy about this story"
              }
              message={`I'd like to learn more about the strategy behind ${item.title}.`}
            />
            {item.agentSlug && (
              <a
                className="mt-3 flex items-center justify-center gap-2 rounded-xl border bg-white px-4 py-3 font-bold text-[#05314a]"
                href={path(`/agents/${item.agentSlug}`)}
              >
                View agent profile <ArrowRight className="h-4 w-4" />
              </a>
            )}
          </aside>
        </div>
      </article>
    </Shell>
  );
}

function ResourcesPage() {
  usePageTitle("Insights & Resources");
  const [search, setSearch] = useQueryParam("search");
  const [category, setCategory] = useQueryParam("category");
  const [tagParam, setTagParam] = useQueryParam("tags");
  const chosenTags = tagParam ? tagParam.split("|").filter(Boolean) : [];
  const toggleTag = (key: string) => {
    const next = chosenTags.includes(key)
      ? chosenTags.filter(tag => tag !== key)
      : [...chosenTags, key];
    setTagParam(next.join("|"));
  };
  const query = trpc.website.publicPosts.useQuery();
  if (query.isLoading) return <LoadingPage />;
  const all: any[] = query.data || [];

  // Categories with at least one published post, most used first.
  const categoryCounts = new Map<string, number>();
  for (const item of all) {
    if (item.category)
      categoryCounts.set(item.category, (categoryCounts.get(item.category) || 0) + 1);
  }
  const categories = Array.from(categoryCounts.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
  const tags = popularTags(all);
  const tagName = (key: string) =>
    tags.find(tag => tag.key === key)?.label || key;

  const needle = search.trim().toLowerCase();
  const items = all.filter(
    item =>
      (!category || item.category === category) &&
      hasAnyTag(item.tags, chosenTags) &&
      (!needle ||
        `${item.title} ${item.excerpt || ""} ${item.category || ""} ${cleanTags(item.tags).join(" ")}`
          .toLowerCase()
          .includes(needle))
  );
  const filtered = !!(needle || category || chosenTags.length);
  const clear = () => {
    setSearch("");
    setCategory("");
    setTagParam("");
  };
  const pill = (active: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
      active
        ? "border-[#05314a] bg-[#05314a] text-white"
        : "border-slate-200 bg-white text-[#05314a] hover:border-cyan-400"
    }`;
  return (
    <Shell>
      <section className="border-b bg-white py-16">
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
          <p className="text-sm text-slate-500">
            <a href={path()}>Home</a> / Resources
          </p>
          <h1 className="mt-6 text-5xl font-black text-[#05314a]">
            Insights & Resources
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Investment strategies, market analysis, and STR guidance from
            specialist agents.
          </p>
          <div className="mt-8 flex max-w-2xl items-center gap-2 rounded-xl border bg-slate-50 px-4 focus-within:border-cyan-500 focus-within:bg-white">
            <Search className="h-5 w-5 text-cyan-600" />
            <input
              className="w-full bg-transparent py-4 text-sm text-slate-900 outline-none placeholder:text-slate-400"
              placeholder="Search articles, topics, tags…"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </div>
          {categories.length > 1 ? (
            <div className="mt-6 flex flex-wrap gap-2" aria-label="Categories">
              <button type="button" className={pill(!category)} onClick={() => setCategory("")}>
                All
              </button>
              {categories.map(([name, count]) => (
                <button
                  key={name}
                  type="button"
                  className={pill(category === name)}
                  onClick={() => setCategory(category === name ? "" : name)}
                >
                  {name}
                  <span className="ml-1.5 text-xs opacity-60">{count}</span>
                </button>
              ))}
            </div>
          ) : null}
          {tags.length ? (
            <div className="mt-5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Topics
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Topics">
                {tags.map(tag => {
                  const active = chosenTags.includes(tag.key);
                  return (
                    <button
                      key={tag.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleTag(tag.key)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        active
                          ? "bg-cyan-600 text-white"
                          : "bg-cyan-50 text-cyan-900 hover:bg-cyan-100"
                      }`}
                    >
                      #{tag.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {filtered ? (
            <p className="mt-5 text-sm text-slate-500">
              Showing {items.length} of {all.length}
              {chosenTags.length
                ? ` tagged ${chosenTags.map(tagName).join(" or ")}`
                : ""}{" "}
              <button
                type="button"
                onClick={clear}
                className="ml-1 font-semibold text-cyan-700 hover:underline"
              >
                Clear filters
              </button>
            </p>
          ) : null}
        </div>
      </section>
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
          <h2 className="border-l-4 border-cyan-400 pl-3 text-2xl font-bold text-[#05314a]">
            {category || (filtered ? "Matching articles" : "Featured intelligence")}
          </h2>
          {items.length ? (
            <div className="mt-7 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {items.map((item: any) => (
                <ArticleCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div className="mt-7 rounded-2xl border border-dashed bg-white p-16 text-center">
              <Search className="mx-auto h-8 w-8 text-slate-300" />
              <h3 className="mt-4 text-xl font-bold text-[#05314a]">No articles match</h3>
              <p className="mt-2 text-slate-500">Try another topic or search.</p>
              <button
                type="button"
                onClick={clear}
                className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-cyan-700 hover:bg-slate-50"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </section>
    </Shell>
  );
}

function ResourceDetailPage({ slug }: { slug: string }) {
  const query = trpc.website.publicPost.useQuery({ slug });
  const item: any = query.data;
  usePageTitle(item?.title || "Resource");
  useRecordArticleView("post", item?.id);
  if (query.isLoading) return <LoadingPage />;
  if (!item) return <NotFoundPage />;
  return (
    <Shell>
      <article>
        <header className="mx-auto max-w-4xl px-5 py-16 text-center">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-600">
            {item.category}
          </p>
          <h1 className="mt-3 text-4xl font-black leading-tight text-[#05314a] sm:text-6xl">
            {item.title}
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-slate-600">
            {item.excerpt}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3 text-sm text-slate-500">
            {item.authorImageUrl && (
              <img
                src={item.authorImageUrl}
                alt=""
                className="h-8 w-8 rounded-full object-cover"
              />
            )}
            <span>{item.authorName || "Savvy Team"}</span>
            {item.publishedAt && (
              <>
                <span>·</span>
                <span>{new Date(item.publishedAt).toLocaleDateString()}</span>
              </>
            )}
          </div>
        </header>
        <div className="mx-auto max-w-[1000px] px-5">
          <img
            src={item.coverImageUrl}
            alt={item.title}
            className="h-[480px] w-full rounded-3xl object-cover"
          />
        </div>
        <div className="mx-auto max-w-3xl px-5 py-16">
          <ArticleBody
            markdown={item.body || ""}
            className="prose prose-lg prose-slate max-w-none prose-headings:text-[#05314a] prose-a:text-cyan-700"
          />
          {cleanTags(item.tags).length ? (
            <div className="mt-10 flex flex-wrap gap-2 border-t border-slate-200 pt-6">
              {cleanTags(item.tags).map(tag => (
                <a
                  key={tag}
                  href={`${path("/resources")}?tags=${encodeURIComponent(tagKey(tag))}`}
                  className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900 hover:bg-cyan-100"
                >
                  #{tag}
                </a>
              ))}
            </div>
          ) : null}
          <div className="mt-12 rounded-2xl bg-[#05314a] p-8 text-white">
            <h2 className="text-3xl font-bold">Put the insight to work.</h2>
            <p className="mt-3 text-cyan-50">
              Get matched with a Savvy specialist who can apply this thinking to
              your market and buy box.
            </p>
            <a
              className="mt-5 inline-flex rounded-lg bg-[#10c0df] px-5 py-3 font-bold text-[#03293c]"
              href={path("/contact")}
            >
              Talk to an STR Agent
            </a>
          </div>
        </div>
      </article>
    </Shell>
  );
}

/**
 * A photo behind a dark section, with an overlay so white text stays
 * readable. Renders nothing without a photo, so the section falls back to
 * its plain background.
 */
function PhotoBackdrop({ src, eager = false }: { src?: string | null; eager?: boolean }) {
  if (!src) return null;
  return (
    <>
      <img
        aria-hidden="true"
        alt=""
        src={src}
        loading={eager ? "eager" : "lazy"}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-[#031f30]/80 to-black/90" />
    </>
  );
}

function AboutPage() {
  usePageTitle("Why Investors Work With Savvy STR Agents");
  // Same photo as the home page hero, so changing it in Website Studio
  // updates both pages. Shell already loads these settings, so this is cached.
  const { data: siteSettings } = trpc.website.publicSettings.useQuery();
  const heroImageUrl = siteSettings?.heroImageUrl;
  const benefits: Array<[string, string, React.ElementType]> = [
    [
      "Market clarity",
      "Understand where your goals, capital, and operating plan fit.",
      Search,
    ],
    [
      "Investor-grade analysis",
      "Evaluate revenue, expenses, financing, regulations, and risk together.",
      LineChart,
    ],
    [
      "Local execution",
      "Navigate offers and diligence with an STR specialist in the market.",
      KeyRound,
    ],
    [
      "Launch network",
      "Connect with trusted managers, designers, lenders, insurers, and vendors.",
      Users,
    ],
    [
      "Portfolio perspective",
      "Choose a property that supports the strategy beyond one transaction.",
      TrendingUp,
    ],
    [
      "Long-term relationship",
      "Stay connected to a team that understands your investment journey.",
      Heart,
    ],
  ];
  return (
    <Shell darkHeader>
      <section className="relative overflow-hidden bg-black py-28 text-center text-white">
        <PhotoBackdrop src={heroImageUrl} eager />
        <div className="relative mx-auto max-w-4xl px-5">
          <p className="text-xs font-bold uppercase tracking-[.22em] text-cyan-400">
            Why Savvy
          </p>
          <h1 className="mt-4 text-5xl font-black sm:text-7xl">
            Invest Confidently in Short-Term Rentals
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-xl leading-8 text-slate-300">
            You deserve a real estate agent who actually understands short-term
            rentals—and a system built to support every important decision.
          </p>
          <a
            className="mt-8 inline-flex rounded-lg bg-[#10c0df] px-6 py-3 font-bold text-[#03293c]"
            href={path("/contact")}
          >
            Book My Free Market Match Call
          </a>
        </div>
      </section>
      <section className="border-b border-t bg-white py-12">
        <div className="mx-auto grid max-w-5xl gap-6 px-5 text-center sm:grid-cols-3">
          {[
            ["$250M+", "Closed STR sales volume"],
            ["500+", "Successful Airbnb launches"],
            ["$10M+", "Annual client Airbnb revenue"],
          ].map(([value, label]) => (
            <div key={label}>
              <p className="text-4xl font-black text-[#05314a]">{value}</p>
              <p className="mt-2 text-sm text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-[1180px] px-5">
          <SectionHeading
            title="Everything a traditional agent misses"
            body="Buying an STR is a business decision wrapped inside a real estate transaction. Savvy brings both perspectives to the table."
          />
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {benefits.map(([title, body, Icon]) => (
              <div
                key={title}
                className="rounded-2xl border bg-white p-7 shadow-sm"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#05314a] text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-xl font-bold text-[#05314a]">
                  {title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="bg-white py-20">
        <div className="mx-auto max-w-[1180px] px-5">
          <SectionHeading
            title="How It Works"
            body="A clear process designed around investor decisions—not just showings and paperwork."
          />
          <div className="mt-12 grid gap-8 md:grid-cols-4">
            {[
              [
                "01",
                "Market Match Call",
                "Clarify goals, budget, timeline, and investment thesis.",
              ],
              [
                "02",
                "Property Sourcing",
                "Focus the search on opportunities that fit your buy box.",
              ],
              [
                "03",
                "Diligence & Offer",
                "Validate the property, market, regulations, and operating plan.",
              ],
              [
                "04",
                "Launch-Ready Setup",
                "Close with a practical path to design, operations, and revenue.",
              ],
            ].map(([step, title, body]) => (
              <div key={step} className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-black text-xl font-black text-white">
                  {step}
                </div>
                <h3 className="mt-5 text-lg font-bold text-[#05314a]">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <a
              className="inline-flex rounded-lg bg-[#05314a] px-6 py-3 font-bold text-white"
              href={path("/contact")}
            >
              Get Started Today
            </a>
          </div>
        </div>
      </section>
      <section className="relative overflow-hidden bg-black py-20 text-center text-white">
        <PhotoBackdrop src={heroImageUrl} />
        <div className="relative px-5">
          <h2 className="text-4xl font-black">
            Ready to Start Your STR Journey?
          </h2>
          <p className="mt-4 text-slate-300">
            Make the next property decision with the right specialist and the
            right information.
          </p>
          <a
            className="mt-7 inline-flex rounded-lg bg-[#10c0df] px-6 py-3 font-bold text-[#03293c]"
            href={path("/contact")}
          >
            Book My Call
          </a>
        </div>
      </section>
    </Shell>
  );
}

const JOIN_CALENDLY_URL = "https://calendly.com/trish-savvy";
const JOIN_IMG = "/images/join-our-team";

const JOIN_PARTNERS: Array<{ src: string | null; alt: string }> = [
  { src: null, alt: "eXp Realty" },
  { src: `${JOIN_IMG}/airdna.png`, alt: "AirDNA" },
  { src: `${JOIN_IMG}/rabbu.png`, alt: "Rabbu" },
  { src: `${JOIN_IMG}/bnbcalc.png`, alt: "BNBCalc" },
  { src: `${JOIN_IMG}/chalet.png`, alt: "Chalet" },
  { src: `${JOIN_IMG}/striq.png`, alt: "strIQ" },
  { src: `${JOIN_IMG}/str-secrets.png`, alt: "Short Term Rental Secrets" },
  { src: `${JOIN_IMG}/str-like-the-best.png`, alt: "STR Like The Best" },
  { src: `${JOIN_IMG}/short-term-gems.png`, alt: "Short-Term Gems" },
  { src: `${JOIN_IMG}/the-offer-sheet.png`, alt: "The Offer Sheet" },
  { src: `${JOIN_IMG}/madeline-raiford.png`, alt: "Madeline Raiford-Holland" },
];

const JOIN_BENEFITS: Array<[string, string, React.ElementType]> = [
  [
    "Short-Term Rental Expertise",
    "We've been 100% focused on STR investors since 2019. Deal structures, revenue analysis, regulations — this is all we do.",
    Building2,
  ],
  [
    "Marketing Support",
    "A dedicated marketing team builds your brand presence, produces content, and runs campaigns so you can stay in front of clients.",
    TrendingUp,
  ],
  [
    "Industry Partnerships",
    "Preferred access to STR lenders, insurance advisors, property managers, and tax strategists your clients actually need.",
    Users,
  ],
  [
    "Lead Qualification",
    "Our inside sales team vets and qualifies inbound investor leads before they reach you — so your time goes to serious buyers.",
    Check,
  ],
  [
    "Proprietary Software",
    "Purpose-built STR tools for market analysis, revenue projections, and deal evaluation that generic agents simply don't have.",
    LineChart,
  ],
  [
    "Mastermind Support",
    "Weekly masterminds with top-producing STR agents nationwide. Coaching, deal reviews, and strategies you can use the same day.",
    Star,
  ],
];

const JOIN_VALUES: Array<[string, string]> = [
  [
    "Self-Leadership & Accountability",
    "We lead ourselves first — with discipline, ownership, and a drive to improve. We manage our time, follow through on commitments, and expect excellence from ourselves before asking it of others.",
  ],
  [
    "Transparent Collaboration",
    "We build trust through honesty and vulnerability. We work openly, both with our clients and our agent partners. We share wins and lessons learned, and communicate with clarity — even when it's hard.",
  ],
  [
    "Growth with Purpose",
    "We pursue personal and professional growth with intention. We challenge assumptions, seek feedback, and stay curious — because when we grow, our partners' and clients' wealth grows too.",
  ],
  [
    "Expertise with Integrity",
    "We bring deep market knowledge and STR experience — and we back it with honesty, transparency, and a client-first mindset. Our confidence comes from mastery, and our communication is clear, direct, and grounded in results. We don't just talk about excellence — we deliver it.",
  ],
  [
    "Proactive Excellence",
    "We anticipate needs, prevent problems, and execute with precision. We are both students and masters of our craft — constantly learning, always delivering. With agility, professionalism, and high standards, we do what it takes to lead in performance and results.",
  ],
  [
    "Empowered Prosperity",
    "We help our clients build wealth with confidence. Our mission is to create opportunities that support long-term success — for our investors, agents, and the communities we serve.",
  ],
];

const JOIN_HUB: Array<[string, string]> = [
  ["Operations", "keeps every transaction moving — contracts, coordination, and closings handled."],
  ["Sales", "qualifies and nurtures your pipeline so you spend time with buyers who are ready."],
  ["Data analysts", "arm you with market intelligence and revenue projections your competition can't match."],
  ["Marketing", "builds your presence and keeps your name in front of investors in your market."],
];

// Photo, alt text, and grid span. Spans make a varied collage on wide
// screens and fall back to a plain two-column grid on phones.
const JOIN_GALLERY: Array<[string, string, string]> = [
  ["team-retreat.jpg", "The full Savvy STR Agents team gathered at a team retreat", "sm:col-span-2 sm:row-span-2"],
  ["podcast-booth.jpg", "Recording in the podcast booth", "sm:row-span-2"],
  ["industry-event.jpg", "Savvy agent at an industry event", "sm:row-span-2"],
  ["on-stage.jpg", "Speaking on stage at a Savvy event", "sm:col-span-2"],
  ["property-walkthrough.jpg", "Agents on a property walkthrough", "sm:col-span-2"],
  ["off-road-tour.jpg", "Off-road property tour", "sm:row-span-2"],
  ["filming-interviews.jpg", "Filming agent interviews at a team retreat", "sm:col-span-2"],
  ["boat-day.jpg", "Boat day on the water", ""],
  ["coffee-walk.jpg", "Morning coffee walk at a mastermind retreat", ""],
  ["conference.jpg", "Savvy agents at an industry conference", "sm:row-span-2"],
  ["teaching-session.jpg", "Teaching a session on STR investing at a conference", "sm:row-span-2"],
  ["studio-interview.jpg", "Podcast interview in the Savvy studio", "sm:col-span-2"],
];

function JoinCta({ children }: { children: React.ReactNode }) {
  return (
    <a
      className="inline-flex items-center gap-2 rounded-lg bg-[#10c0df] px-6 py-3 font-bold text-[#03293c]"
      href={JOIN_CALENDLY_URL}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <ArrowRight className="h-4 w-4" />
    </a>
  );
}

function JoinEyebrow({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <p
      className={`text-xs font-bold uppercase tracking-[0.22em] ${light ? "text-cyan-300" : "text-cyan-600"}`}
    >
      {children}
    </p>
  );
}

/**
 * Recruiting page, carried over from the old site's /join-our-team. The old
 * address redirects here. Every call to action books a call with Trish, as it
 * did on the old site.
 */
function JoinTeamPage() {
  usePageTitle("Join Our Team");
  return (
    <Shell darkHeader>
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#031f30] py-20 text-white lg:py-28">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,192,223,0.25),transparent_60%)]" />
        <div className="relative mx-auto grid max-w-[1280px] items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-cyan-200">
              <span className="h-2 w-2 rounded-full bg-[#10c0df]" /> We're growing — nationwide
            </p>
            <h1 className="mt-6 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              If you live and breathe{" "}
              <span className="text-[#43e8ff]">short-term rentals</span>, we
              want you.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-cyan-50/85">
              We're seeking growth-minded short-term rental experts who know
              their market inside and out. If you love the idea of guiding
              investors and helping them build wealth, this is the place for
              you.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <JoinCta>Start Your Savvy Journey</JoinCta>
              <a
                className="inline-flex items-center rounded-lg border border-white/25 px-6 py-3 font-bold text-white hover:bg-white/10"
                href="#why-savvy"
              >
                See Why Agents Join
              </a>
            </div>
          </div>
          <div>
            <div className="overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10">
              <img
                src={`${JOIN_IMG}/team-hero.jpg`}
                alt="The Savvy STR Agents team"
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["#1", "Enterprise Agent Team at eXp Realty"],
                ["55", "Expert STR agents across the country"],
                ["49", "Active markets, from the Smokies to SoCal"],
                ["100%", "Focused on short-term rental investors"],
              ].map(([num, label]) => (
                <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-2xl font-black text-[#43e8ff]">{num}</p>
                  <p className="mt-1 text-xs leading-5 text-cyan-50/75">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Why join */}
      <section id="why-savvy" className="scroll-mt-24 bg-white py-20">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <JoinEyebrow>Why Join Savvy</JoinEyebrow>
            <h2 className="mt-3 text-3xl font-black text-[#05314a] sm:text-4xl">
              Everything you need to dominate your STR market
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              You bring the market expertise and the drive. We bring the
              infrastructure that turns great agents into top producers.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-2xl bg-[#05314a] p-7 text-white lg:row-span-2">
              <p className="text-6xl font-black text-[#43e8ff]">#1</p>
              <h3 className="mt-4 text-xl font-bold">Enterprise Agent Team at eXp Realty</h3>
              <p className="mt-3 leading-7 text-cyan-50/80">
                Join the top-ranked enterprise agent team at the world's
                largest independent brokerage — with the track record and
                national footprint to prove it.
              </p>
            </article>
            {JOIN_BENEFITS.map(([title, body, Icon]) => (
              <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-bold text-[#05314a]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Partners */}
      <section className="border-y border-slate-200 bg-slate-50 py-10">
        <p className="px-4 text-center text-sm text-slate-600">
          We invest heavily in{" "}
          <strong className="text-[#05314a]">partnerships, marketing, and technology</strong>{" "}
          — so our agents never compete alone.
        </p>
        <div className="sv-marquee mt-6" aria-label="Savvy partner logos">
          <div className="sv-marquee-track">
            {/* The list twice, so the scroll loops without a gap. */}
            {[...JOIN_PARTNERS, ...JOIN_PARTNERS].map((logo, index) => (
              <div
                key={`${logo.alt}-${index}`}
                className="flex h-14 w-40 shrink-0 items-center justify-center px-4"
                aria-hidden={index >= JOIN_PARTNERS.length}
              >
                {logo.src ? (
                  <img src={logo.src} alt={logo.alt} loading="lazy" className="max-h-10 w-auto object-contain opacity-80 grayscale" />
                ) : (
                  <span className="text-lg font-black text-[#05314a]">{logo.alt}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
          <JoinEyebrow>Savvy Core Values</JoinEyebrow>
          <h2 className="mt-3 text-3xl font-black text-[#05314a] sm:text-4xl">What we stand for</h2>
          <p className="mt-4 text-lg text-slate-600">
            How we operate, and what our clients and partners can count on.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {JOIN_VALUES.map(([title, body], index) => (
              <article key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-sm font-black text-cyan-600">{String(index + 1).padStart(2, "0")}</p>
                <h3 className="mt-2 text-lg font-bold text-[#05314a]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="bg-[#031f30] py-20 text-white">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <JoinEyebrow light>Hear It From Our Agents</JoinEyebrow>
          <h2 className="mt-3 text-3xl font-black sm:text-4xl">Don't take our word for it</h2>
          <p className="mt-4 text-lg text-cyan-50/80">
            The best people to tell you what it's like inside Savvy are the
            agents already winning here.
          </p>
          <div className="mt-10 aspect-video overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/10">
            <iframe
              src="https://fast.wistia.net/embed/iframe/i65lclausl"
              title="Savvy STR Agents: hear it from our agents"
              allow="autoplay; fullscreen"
              allowFullScreen
              loading="lazy"
              className="h-full w-full"
            />
          </div>
          <blockquote className="mx-auto mt-10 max-w-3xl text-xl font-semibold leading-8 text-white">
            “I've sold more real estate in the last 7 months than I did in the
            first three full years of being a Realtor, so it has been completely
            life-changing for me and my family.”
          </blockquote>
          <p className="mt-4 text-sm text-cyan-200">
            Joe Rohne, Savvy STR Agent, Emerald Coast
          </p>
        </div>
      </section>

      {/* Trish */}
      <section className="bg-white py-20">
        <div className="mx-auto grid max-w-[1180px] items-center gap-10 px-4 sm:px-6 md:grid-cols-[320px_1fr] lg:gap-16">
          <img
            src={`${JOIN_IMG}/trish-bartley.jpg`}
            alt="Trish Bartley, U.S. Expansion Director at Savvy STR Agents"
            loading="lazy"
            className="mx-auto aspect-[4/5] w-full max-w-xs rounded-2xl object-cover shadow-xl"
          />
          <div>
            <JoinEyebrow>Meet Your First Call</JoinEyebrow>
            <h2 className="mt-3 text-3xl font-black text-[#05314a] sm:text-4xl">Trish Bartley</h2>
            <p className="mt-1 font-semibold text-cyan-700">U.S. Expansion Director</p>
            <p className="mt-5 leading-7 text-slate-600">
              Meet the magician behind growing this team. Trish has personally
              guided every expansion agent who's joined Savvy — matching STR
              experts with the markets, resources, and support they need to win.
            </p>
            <p className="mt-4 leading-7 text-slate-600">
              Your Savvy journey starts with a conversation, not an
              application. Trish will walk you through how the partnership
              works, what we look for, and whether we're the right match for
              each other — because we can't partner with everyone, and that's
              the point.
            </p>
            <div className="mt-7">
              <JoinCta>Book a Call with Trish</JoinCta>
            </div>
          </div>
        </div>
      </section>

      {/* Savvy Hub */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto grid max-w-[1280px] items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <JoinEyebrow>The Savvy Hub</JoinEyebrow>
            <h2 className="mt-3 text-3xl font-black text-[#05314a] sm:text-4xl">
              You're the agent. We're the engine behind you.
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Every Savvy agent is backed by the Savvy Hub — a full team of
              specialists working behind the scenes so you can stay focused on
              your clients and your market.
            </p>
            <ul className="mt-7 space-y-4">
              {JOIN_HUB.map(([team, body]) => (
                <li key={team} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#10c0df] text-[#03293c]">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-slate-700">
                    <strong className="text-[#05314a]">{team}</strong> {body}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-7 text-lg font-bold text-[#05314a]">Your success is why we're here.</p>
          </div>
          <div
            className="relative mx-auto aspect-square w-full max-w-md"
            role="img"
            aria-label="A Savvy agent at the center, supported by operations, sales, data analysts, and marketing"
          >
            <div className="absolute inset-[12%] rounded-full border-2 border-dashed border-cyan-300" />
            <div className="absolute left-1/2 top-1/2 flex h-36 w-36 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-[#05314a] text-center text-white shadow-xl">
              <span className="text-2xl font-black text-[#43e8ff]">You</span>
              <span className="text-xs text-cyan-50/80">The Savvy Agent</span>
            </div>
            {[
              ["Operations", "left-1/2 top-0 -translate-x-1/2"],
              ["Sales", "right-0 top-1/2 -translate-y-1/2"],
              ["Data Analysts", "bottom-0 left-1/2 -translate-x-1/2"],
              ["Marketing", "left-0 top-1/2 -translate-y-1/2"],
            ].map(([label, position]) => (
              <div
                key={label}
                className={`absolute ${position} rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-[#05314a] shadow-md`}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Life at Savvy */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
          <JoinEyebrow>Life at Savvy</JoinEyebrow>
          <h2 className="mt-3 text-3xl font-black text-[#05314a] sm:text-4xl">
            Work hard, close deals, have fun doing it
          </h2>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">
            From team retreats to property walkthroughs, this is what it
            actually looks like to be part of the Savvy family.
          </p>
          <div className="mt-10 grid auto-rows-[160px] grid-cols-2 gap-3 sm:auto-rows-[180px] sm:grid-cols-4">
            {JOIN_GALLERY.map(([file, alt, span]) => (
              <div key={file} className={`overflow-hidden rounded-xl bg-slate-100 ${span}`}>
                <img
                  src={`${JOIN_IMG}/${file}`}
                  alt={alt}
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-500 hover:scale-105"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final call to action */}
      <section className="bg-gradient-to-r from-[#05314a] to-[#0f9db7] py-20 text-center text-white">
        <div className="mx-auto max-w-3xl px-4">
          <JoinEyebrow light>Ready When You Are</JoinEyebrow>
          <h2 className="mt-3 text-3xl font-black sm:text-4xl">
            Your market needs a Savvy STR expert. Is that you?
          </h2>
          <p className="mt-4 text-lg text-cyan-50/90">
            One call with Trish is all it takes to find out if we're a match.
            Bring your market knowledge — we'll bring everything else.
          </p>
          <div className="mt-8">
            <JoinCta>Start Your Savvy Journey</JoinCta>
          </div>
        </div>
      </section>
    </Shell>
  );
}

function ContactPage() {
  usePageTitle("Contact a Short-Term Rental Specialist");
  const { data: settings } = trpc.website.publicSettings.useQuery();
  const contactPhone = settings?.contactPhone || "(828) 407-1705";
  const contactEmail = settings?.contactEmail || "hello@savvy.realty";
  return (
    <Shell darkHeader>
      <section className="relative overflow-hidden bg-[#05314a] py-24 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,rgba(16,192,223,.28),transparent_35%)]" />
        <div className="relative mx-auto grid max-w-[1180px] gap-10 px-5 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-cyan-300">
              <Star className="h-4 w-4" />
              Free STR strategy consultation
            </p>
            <h1 className="mt-4 text-5xl font-black leading-tight sm:text-6xl">
              Ready to Start Your{" "}
              <span className="text-[#43e8ff]">STR Investment Journey?</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-cyan-50">
              Tell us what you’re trying to build. We’ll help you clarify the
              market, buy box, and next best decision.
            </p>
            <div className="mt-6 space-y-3">
              {[
                "No obligation",
                "Property- and market-specific guidance",
                "Matched with the right Savvy specialist",
              ].map(text => (
                <p key={text} className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-cyan-300" />
                  {text}
                </p>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-4 text-sm">
              <a className="flex items-center gap-2" href={`tel:${contactPhone.replace(/[^+\d]/g, "")}`}>
                <Phone className="h-4 w-4 text-cyan-300" />
                {contactPhone}
              </a>
              <a
                className="flex items-center gap-2"
                href={`mailto:${contactEmail}`}
              >
                <Mail className="h-4 w-4 text-cyan-300" />
                {contactEmail}
              </a>
            </div>
          </div>
          <LeadForm
            intent="buy"
            title="Build your STR game plan"
            message="I'd like to schedule a Market Match conversation."
          />
        </div>
      </section>
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-[1100px] px-5">
          <SectionHeading title="What You’ll Get From the Conversation" />
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {[
              [
                Globe2,
                "Market analysis",
                "Understand which markets fit your goals and constraints.",
              ],
              [
                TrendingUp,
                "Investment strategy",
                "Build a buy box around realistic economics.",
              ],
              [
                UserRound,
                "Agent matching",
                "Connect with a local specialist who understands STR.",
              ],
              [
                ShieldCheck,
                "Diligence support",
                "Know what needs to be verified before you commit.",
              ],
            ].map(([Icon, title, body]: any) => (
              <div
                key={title}
                className="flex gap-4 rounded-2xl border bg-white p-6 shadow-sm"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#05314a]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </Shell>
  );
}

/**
 * The markets Savvy covers, from the market records themselves.
 *
 * Built on ZIP territories rather than the free text each agent types into
 * their profile, so "Asheville", "Asheville NC" and "asheville" are one market
 * and the count under it is a real number. A market appears here once it has
 * territories drawn, which is also the moment its properties become findable,
 * so the page never offers a market that opens onto nothing.
 */
function MarketsPage() {
  usePageTitle("STR Markets");
  const markets = trpc.website.publicMarketDirectory.useQuery();
  const items: any[] = markets.data || [];
  if (markets.isLoading) return <LoadingPage />;
  return (
    <Shell>
      <section className="bg-[#05314a] py-20 text-center text-white">
        <h1 className="text-5xl font-black">STR Markets</h1>
        <p className="mx-auto mt-4 max-w-2xl text-cyan-50">
          The markets we cover, and what is on the market in each one today.
        </p>
      </section>
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-[1100px] px-5">
          {items.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map(item => (
                <a
                  key={item.id}
                  href={`${path("/properties")}?market=${item.id}`}
                  className="group flex items-center justify-between rounded-2xl border bg-white p-6 shadow-sm transition hover:border-cyan-200 hover:shadow"
                >
                  <div>
                    <MapPin className="h-5 w-5 text-cyan-600" />
                    <h2 className="mt-3 text-xl font-bold text-[#05314a]">
                      {item.name}
                    </h2>
                    {item.state ? (
                      <p className="text-sm text-slate-500">{item.state}</p>
                    ) : null}
                    <p className="mt-2 text-sm font-semibold text-cyan-700">
                      {item.propertyCount === 1
                        ? "1 property"
                        : `${item.propertyCount} properties`}
                    </p>
                  </div>
                  <ArrowRight className="h-5 w-5 shrink-0 text-cyan-600 transition group-hover:translate-x-1" />
                </a>
              ))}
            </div>
          ) : (
            // Markets exist in SavvyOS before their territories are drawn. Until
            // then we cannot say what is in one, and saying nothing is better
            // than a page of markets with nothing behind them.
            <div className="rounded-2xl border border-dashed bg-white p-16 text-center">
              <MapPin className="mx-auto h-8 w-8 text-slate-300" />
              <h2 className="mt-4 text-xl font-bold text-[#05314a]">
                Market coverage is being mapped
              </h2>
              <p className="mx-auto mt-2 max-w-md text-slate-500">
                Our specialists are active across the Southeast. Browse
                everything on the market, or talk to us about where you want to
                buy.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <a
                  className="rounded-lg bg-[#10c0df] px-5 py-2.5 font-bold text-[#03293c]"
                  href={path("/properties")}
                >
                  Browse properties
                </a>
                <a
                  className="rounded-lg border border-slate-200 px-5 py-2.5 font-semibold text-[#05314a]"
                  href={path("/contact")}
                >
                  Talk to a specialist
                </a>
              </div>
            </div>
          )}
        </div>
      </section>
    </Shell>
  );
}

/**
 * A content page from the CMS.
 *
 * Renders only when a published page exists at this address. Anything else
 * falls through to the not-found page, so a draft or a typo in the address
 * reads as "no such page" rather than a blank layout that looks broken.
 */
function ContentPage({ slug }: { slug: string }) {
  const query = trpc.website.publicPage.useQuery({ slug });
  const page: any = query.data;
  usePageTitle(page?.metaTitle || page?.name || "");
  if (query.isLoading) return <LoadingPage />;
  if (!page) return <NotFoundPage />;
  return (
    <Shell>
      <section className="bg-[#05314a] py-20 text-white">
        <div className="mx-auto max-w-4xl px-5 text-center">
          {page.heroEyebrow && (
            <p className="text-xs font-bold uppercase tracking-[.22em] text-cyan-300">
              {page.heroEyebrow}
            </p>
          )}
          <h1 className="mt-4 text-4xl font-black sm:text-5xl">
            {page.heroTitle || page.name}
          </h1>
          {page.heroSubtitle && (
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-cyan-50">
              {page.heroSubtitle}
            </p>
          )}
          {page.ctaText && page.ctaHref && (
            <a
              className="mt-8 inline-flex rounded-lg bg-[#10c0df] px-6 py-3 font-bold text-[#03293c]"
              href={page.ctaHref}
            >
              {page.ctaText}
            </a>
          )}
        </div>
      </section>
      {page.bodyMarkdown && (
        <section className="bg-white py-16">
          <div className="mx-auto max-w-3xl px-5">
            <ArticleBody
              markdown={page.bodyMarkdown}
              className="prose prose-slate max-w-none text-base leading-8 text-slate-700"
            />
          </div>
        </section>
      )}
    </Shell>
  );
}

/** An investor account page inside the public site's header and footer. */
function AccountPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  usePageTitle(title);
  return <Shell>{children}</Shell>;
}

export default function PublicWebsite() {
  // Every page load, since every link here is one. Holds a landing page's ad
  // parameters for the rest of the visit.
  useEffect(() => {
    captureVisitAttribution();
  }, []);
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  const relative = pathname.startsWith(BASE)
    ? pathname.slice(BASE.length) || "/"
    : pathname;
  const segments = relative.split("/").filter(Boolean);
  if (relative === "/") return <HomePage />;
  if (relative === "/properties") return <PropertiesPage />;
  if (segments[0] === "properties" && segments[1])
    return <PropertyDetailPage slug={decodeURIComponent(segments[1])} />;
  if (relative === "/agents") return <AgentsPage />;
  if (segments[0] === "agents" && segments[1])
    return <AgentDetailPage slug={decodeURIComponent(segments[1])} />;
  if (relative === "/case-studies") return <CaseStudiesPage />;
  if (segments[0] === "case-studies" && segments[1])
    return <CaseStudyDetailPage slug={decodeURIComponent(segments[1])} />;
  if (relative === "/resources") return <ResourcesPage />;
  if (segments[0] === "resources" && segments[1])
    return <ResourceDetailPage slug={decodeURIComponent(segments[1])} />;
  if (relative === "/about") return <AboutPage />;
  if (relative === "/contact") return <ContactPage />;
  if (relative === "/markets") return <MarketsPage />;
  if (relative === "/join-our-team") return <JoinTeamPage />;
  // Investor accounts. These render inside the same header and footer as the
  // rest of the site, so signing in never feels like leaving it.
  if (relative === "/sign-in") return <AccountPage title="Sign in"><SignInBody /></AccountPage>;
  if (relative === "/sign-up") return <AccountPage title="Create your account"><SignUpBody /></AccountPage>;
  if (relative === "/forgot-password")
    return <AccountPage title="Reset your password"><ForgotPasswordBody /></AccountPage>;
  if (relative === "/reset-password")
    return <AccountPage title="Set a new password"><ResetPasswordBody /></AccountPage>;
  if (relative === "/account/saved")
    return <AccountPage title="Saved properties"><SavedPropertiesBody /></AccountPage>;
  if (relative === "/account/preferences")
    return <AccountPage title="Email preferences"><EmailPreferencesBody /></AccountPage>;
  if (relative === "/account/history")
    return <AccountPage title="Recently viewed"><ViewHistoryBody /></AccountPage>;
  if (relative === "/account/transactions")
    return <AccountPage title="My transactions"><MyTransactionsBody /></AccountPage>;
  // Anything left over may be a page from the CMS. Checked last, so a page
  // saved at a built-in address can never shadow the real one.
  if (segments.length === 1) return <ContentPage slug={segments[0]} />;
  return <NotFoundPage />;
}
