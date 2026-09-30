import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Award,
  BarChart3,
  Clock,
  Share2,
  Link2,
  FileText,
  Calendar,
  CheckCircle,
  ArrowRight,
  Bath,
  BedDouble,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Images,
  DollarSign,
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
  Target,
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
import { bookingUtmParams, CONTACT_CALENDAR_FALLBACK_UTMS } from "@shared/adAttribution";
import { trackWebsiteEvent, type SellPlacement } from "@/lib/websiteAnalytics";
import {
  editableListPage,
  listPageHeading,
  splitOnContactForm,
} from "@shared/websiteEditablePages";
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
  publishedTestimonials,
} from "@shared/websiteTestimonials";
import { TEAM_SECTIONS, TEAM_SECTION_LABELS, teamInitials } from "@shared/websiteTeam";
import {
  SELLER_LISTED_OPTIONS,
  SELLER_TIMELINES,
  buildSellerMessage,
  canSubmitSeller,
  emptySellerValues,
  validateSellerField,
  type SellerField,
  type SellerValues,
} from "@shared/websiteSellerLead";
import {
  CALCULATOR_DEFAULTS,
  runCalculator,
} from "@/lib/investmentCalculator";
import {
  AccountMenu,
  AccountMobileLinks,
  EmailPreferencesBody,
  ForgotPasswordBody,
  MyTransactionsBody,
  ResetPasswordBody,
  SaveButton,
  SavedPropertiesBody,
  SignInBody,
  SignUpBody,
  ViewHistoryBody,
  accountPath,
  useRecordPropertyView,
  useWebsiteAccount,
} from "@/components/website/publicAccountPages";
import {
  FinancialDisclaimer,
  LiveAgentCard,
  LiveAgentListCard,
  LiveArticleCard,
  LiveCaseStudyCard,
  LiveCaseStudyListCard,
  LiveHomeArticleCard,
  LiveInvestorQuotes,
  LiveOutlineLink,
  LivePropertyCard,
  LiveSectionTitle,
  ShareButton,
} from "@/components/website/liveSiteParts";

/** Same event the old site pushed for its Sell buttons, so GTM reports stay comparable. */
function trackSellClick(placement: SellPlacement) {
  trackWebsiteEvent({ event: "sell_cta_click", placement, destination: publicPath("/sell") });
}

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
/** Bedrooms and bathrooms as people write them: "4", "2.5", never "4.0". */
const roomCount = (value: unknown) => {
  const parsed = Number(value);
  if (value == null || value === "" || !Number.isFinite(parsed) || parsed <= 0) return "—";
  return String(Math.round(parsed * 10) / 10);
};

function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} | Savvy STR Agents` : "Savvy STR Agents";
  }, [title]);
}

/**
 * The words at the top of a list page (Properties, Agents, Markets, Case
 * Studies, Resources): the designed wording, or a version published in the
 * Website Studio CMS. Sets the tab title too. The designed wording shows
 * while the check is in flight, so the page never waits on it.
 */
function useListHeading(slug: string) {
  const starter = editableListPage(slug)!.starter;
  const query = trpc.website.publicPage.useQuery(
    { slug },
    { staleTime: 5 * 60_000 }
  );
  const heading = listPageHeading(starter, query.data);
  usePageTitle(heading.metaTitle);
  return heading;
}

/** The header's About menu: opens on hover or click, closes on the way out,
 *  on Escape, or on a click anywhere else. Styled like the live site's. */
function AboutMenu({
  items,
  linkClass,
}: {
  items: Array<[string, string]>;
  linkClass: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div
      ref={box}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className={`flex items-center gap-1 ${linkClass}`}
      >
        About
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 w-48 pt-2">
          <div className="rounded-lg border border-gray-200 bg-white py-2 shadow-lg">
            {items.map(([label, href]) => (
              <a
                key={label}
                href={path(href)}
                className="block px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-[#05314a]/5 hover:text-[#05314a]"
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: siteSettings } = trpc.website.publicSettings.useQuery();
  // The same menu, in the same order, as the live savvy-agents.com header, so
  // the switch-over looks like the same site. About opens a small menu there
  // too, with Meet the Team on its own page. Sell is the site's own seller
  // page, whose form puts the seller in the SavvyOS ISA queue.
  const nav: Array<[string, string]> = [
    ["Properties", "/properties"],
    ["Our Agents", "/agents"],
    ["Case Studies", "/case-studies"],
  ];
  const aboutMenu: Array<[string, string]> = [
    ["About Savvy", "/about"],
    ["Meet the Team", "/team"],
    ["Markets", "/markets"],
  ];
  const navAfter: Array<[string, string]> = [["Resources", "/resources"]];
  const linkClass =
    "text-sm font-medium text-gray-700 transition-colors hover:text-[#05314a]";
  const mobileLinkClass =
    "block rounded-lg px-3 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-[#05314a]";
  return (
    <div className="sv-site h-full overflow-y-auto bg-white text-slate-950 selection:bg-cyan-200">
      <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white shadow-sm">
        {siteSettings?.announcementText && (
          <div className="bg-[#10c0df] px-4 py-1.5 text-center text-[11px] font-bold tracking-wide text-[#03293c]">
            {siteSettings.announcementText}
          </div>
        )}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <a href={path()} aria-label="Savvy STR Agents home" className="flex-shrink-0">
              <img
                src={LOGO}
                alt="Savvy STR Agents"
                className="block h-6 w-auto object-contain md:h-[30px]"
              />
            </a>
            <nav className="hidden flex-1 items-center justify-center gap-8 lg:flex">
              {nav.map(([label, href]) => (
                <a key={label} className={linkClass} href={path(href)}>
                  {label}
                </a>
              ))}
              <AboutMenu items={aboutMenu} linkClass={linkClass} />
              {navAfter.map(([label, href]) => (
                <a key={label} className={linkClass} href={path(href)}>
                  {label}
                </a>
              ))}
              <a className={linkClass} href={path("/sell")} onClick={() => trackSellClick("nav")}>
                Sell
              </a>
              <a className={linkClass} href={path("/contact")}>
                Contact
              </a>
              <a className={linkClass} href={path("/join-our-team")}>
                Join The Team
              </a>
            </nav>
            <div className="hidden items-center gap-3 lg:flex">
              <AccountMenu />
            </div>
            <button
              className="inline-flex items-center justify-center rounded-md p-2 text-gray-700 transition-colors hover:bg-gray-100 hover:text-[#05314a] lg:hidden"
              onClick={() => setMobileOpen(value => !value)}
              aria-label="Toggle navigation"
            >
              {mobileOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <nav className="border-t border-gray-200 bg-white px-4 py-4 lg:hidden">
            {[...nav, ...aboutMenu, ...navAfter].map(([label, href]) => (
              <a key={label} className={mobileLinkClass} href={path(href)}>
                {label}
              </a>
            ))}
            <a className={mobileLinkClass} href={path("/sell")} onClick={() => trackSellClick("nav")}>
              Sell
            </a>
            <a className={mobileLinkClass} href={path("/contact")}>
              Contact
            </a>
            <a className={mobileLinkClass} href={path("/join-our-team")}>
              Join The Team
            </a>
            <div className="my-2 border-t border-gray-200" />
            <AccountMobileLinks />
          </nav>
        )}
      </header>
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}

/**
 * The footer from the live savvy-agents.com: one line, copyright on the left,
 * links on the right. Legal and Privacy are CMS pages, not built-in ones, so
 * each link shows only once its page is published; a footer link to "Page not
 * found" on a legal page is worse than no link.
 *
 * Two small additions over the live site, both easy to live without and both
 * useful on SavvyOS: the Website Studio footer statement as a quiet second
 * line (only when one is set), and an Agent Login link, so agents who land on
 * the public site can reach SavvyOS without knowing its address.
 */
const AGENT_LOGIN_URL = "https://os.savvy-agents.com";

function SiteFooter() {
  const legal = trpc.website.publicPage.useQuery({ slug: "legal" }, { staleTime: 10 * 60_000 });
  const privacy = trpc.website.publicPage.useQuery({ slug: "privacy" }, { staleTime: 10 * 60_000 });
  const { data: siteSettings } = trpc.website.publicSettings.useQuery();
  const account = useWebsiteAccount();
  const linkClass = "transition-colors hover:text-[#05314a]";
  const statement = siteSettings?.footerText?.trim();
  return (
    <footer className="mt-auto border-t bg-white">
      <div className="mx-auto max-w-7xl px-4 py-8 text-sm sm:px-6 lg:px-8">
        {/* Phones: links centred in even rows, then the copyright line under
            them. From sm up: copyright left, links right, as on the live site. */}
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:text-left">
          <p className="order-last sm:order-none">© {new Date().getFullYear()} Savvy STR Agents. All rights reserved.</p>
          <nav className="flex max-w-sm flex-wrap justify-center gap-x-5 gap-y-2.5 sm:max-w-none sm:justify-start sm:gap-4">
            <a className={linkClass} href={path("/properties")}>Properties</a>
            <a className={linkClass} href={path("/markets")}>Markets</a>
            <a className={linkClass} href={path("/case-studies")}>Case Studies</a>
            <a className={linkClass} href={path("/resources")}>Resources</a>
            <a className={linkClass} href={path("/sell")} onClick={() => trackSellClick("footer")}>Sell Your STR</a>
            {legal.data && <a className={linkClass} href={path("/legal")}>Legal</a>}
            {privacy.data && <a className={linkClass} href={path("/privacy")}>Privacy Policy</a>}
            <a
              className={`flex items-center gap-1 ${linkClass}`}
              href={account.data ? accountPath.saved : accountPath.signIn}
            >
              <UserRound className="h-3.5 w-3.5" />
              My Account
            </a>
            <a className={linkClass} href={AGENT_LOGIN_URL}>Agent Login</a>
          </nav>
        </div>
        {statement && <p className="mt-4 text-center text-xs text-gray-500 sm:mt-3 sm:text-left">{statement}</p>}
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
  // The property page reuses one form for Message Agent, Book a Showing,
  // Deeper Analysis and Financing. Switching between them swaps in the new
  // starting message, unless the visitor has already written their own.
  const startingMessage = useRef(message);
  useEffect(() => {
    if (startingMessage.current === message) return;
    const previous = startingMessage.current;
    startingMessage.current = message;
    setForm(prior => (prior.message === previous || !prior.message.trim() ? { ...prior, message } : prior));
  }, [message]);
  const submit = trpc.website.submitLead.useMutation({
    onSuccess: () => {
      trackWebsiteEvent({ event: "website_lead_submitted", intent: intent ?? "general", requestType });
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

/**
 * The home page, laid out like the live savvy-agents.com home page section
 * for section: hero with search and stats, featured properties, investor
 * quotes, the "different game" block, agents, case studies, articles, and
 * the sign-up band. Words that live in the Website Studio (the hero, the
 * stats, the quotes) still come from there.
 */
const HERO_BACKDROP =
  "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1920&h=1080";

const VALUE_POINTS = [
  "Get clear on what to buy and where",
  "Choose the right market for your goals",
  "Skip the 30% property management fees (we'll show you how)",
  "Support from trusted local partners",
  "Launch a high-earning rental in as little as 30 days",
  "Turn under-performing properties into high-earners",
];

function HomePage() {
  usePageTitle("");
  const home = trpc.website.publicHome.useQuery();
  const [query, setQuery] = useState("");
  if (home.isLoading) return <LoadingPage />;
  const data = home.data;
  const settings: any = data?.settings || {};
  const heroTitle =
    settings.heroTitle || "Short-Term Rental Properties for Sale — Built for STR Investors";
  const [heroLead, ...heroAccentParts] = heroTitle.split("—");
  const heroAccent = heroAccentParts.join("—").trim();
  const stats: Array<{ value: string; label: string }> = Array.isArray(settings.stats)
    ? settings.stats
    : [];
  // The live site colours its four figures light cyan, cyan, white, light cyan.
  const statColour = ["text-[#43e8ff]", "text-[#10c0df]", "text-white", "text-[#43e8ff]"];
  const properties = data?.properties || [];
  const agents = data?.agents || [];
  const caseStudies = data?.caseStudies || [];
  const posts = data?.posts || [];
  return (
    <Shell>
      <section className="relative overflow-hidden text-white [background-image:linear-gradient(135deg,#05314a_0%,#0b4966_50%,#10c0df_100%)]">
        <div className="absolute inset-0 opacity-20">
          <img src={HERO_BACKDROP} alt="" aria-hidden="true" className="h-full w-full object-cover object-center" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div className="mx-auto max-w-4xl text-center lg:mx-0 lg:text-left">
            <h1 className="mb-4 text-4xl font-bold leading-tight md:text-6xl lg:max-w-3xl">
              {heroLead.trim()}
              {heroAccent && (
                <>
                  {" — "}
                  <span className="text-[#43e8ff]">{heroAccent}</span>
                </>
              )}
            </h1>
            {settings.heroBody ? (
              <p className="mb-6 text-xl leading-relaxed text-white/80 md:text-2xl lg:max-w-2xl">
                {settings.heroBody}
              </p>
            ) : null}
            <form
              className="relative mx-auto mb-6 w-full max-w-2xl text-left lg:mx-0"
              onSubmit={event => {
                event.preventDefault();
                const text = query.trim();
                window.location.href = text
                  ? `${path("/properties")}?search=${encodeURIComponent(text)}`
                  : path("/properties");
              }}
            >
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                className="h-14 w-full rounded-xl border border-white/30 bg-white/95 pl-12 pr-32 text-base text-gray-900 shadow-lg placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#43e8ff]"
                placeholder="Search a market, city or address"
                aria-label="Search properties"
                value={query}
                onChange={event => setQuery(event.target.value)}
              />
              <button className="absolute right-2 top-1/2 h-10 -translate-y-1/2 rounded-lg bg-[#10c0df] px-5 text-sm font-semibold text-white shadow-sm hover:opacity-90">
                Search
              </button>
            </form>
            <div className="flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <a
                className="inline-flex items-center justify-center rounded-md bg-[#10c0df] px-8 py-4 text-lg font-semibold text-white shadow-lg transition-colors hover:bg-[#43e8ff]"
                href={path("/properties")}
              >
                <Home className="mr-2 h-5 w-5" />
                Find Your Next STR
              </a>
              <a
                className="inline-flex items-center justify-center rounded-md border border-[#05314a] bg-white px-8 py-4 text-lg font-semibold text-[#05314a] shadow-lg transition-colors hover:bg-[color-mix(in_oklab,#10c0df_12%,white)]"
                href={path("/sell")}
                onClick={() => trackSellClick("hero")}
              >
                <Calendar className="mr-2 h-5 w-5" />
                Sell My STR for Top Dollar
              </a>
            </div>
          </div>
        </div>
        {stats.length ? (
          <div className="relative border-t border-white/20 bg-white/10 backdrop-blur-sm">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
              <div className="grid grid-cols-2 gap-8 text-center md:grid-cols-4">
                {stats.slice(0, 4).map((item, index) => (
                  <div key={`${item.label}-${index}`}>
                    <div className={`text-3xl font-bold ${statColour[index] || "text-white"}`}>
                      {item.value}
                    </div>
                    <div className="text-sm text-white/80">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="bg-gray-50 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <LiveSectionTitle
            title="Featured Properties for Sale"
            subtitle="Browse a curated selection of STR-friendly properties"
          />
          {properties.length ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {properties.map((item: any) => (
                <LivePropertyCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-gray-500">
              <p>No properties available at the moment. Check back soon!</p>
            </div>
          )}
          <div className="mt-8 text-center">
            <LiveOutlineLink href={path("/properties")}>
              View All Properties <ArrowRight className="ml-1 h-4 w-4" />
            </LiveOutlineLink>
          </div>
        </div>
      </section>

      <LiveInvestorQuotes quotes={publishedTestimonials(settings.testimonials)} />

      <section className="relative min-h-[700px] overflow-hidden lg:min-h-[800px]">
        <div className="absolute inset-0">
          <img
            src={settings.heroImageUrl || HERO_BACKDROP}
            alt="Modern short-term rental property"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-black/65" />
        </div>
        <div className="relative mx-auto flex min-h-[700px] w-full max-w-7xl items-center px-4 py-16 sm:px-6 lg:min-h-[800px] lg:px-8 lg:py-24">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="mb-8 text-4xl font-bold leading-[1.1] sm:text-5xl lg:text-6xl xl:text-7xl">
              <span className="font-serif italic text-[#43e8ff]">Short-Term Rental Investing Is a</span>
              <span className="text-white"> Different Game. We Know How to Win It.</span>
            </h2>
            <p className="mb-4 text-xl font-bold text-white lg:text-2xl">
              Not every agent understands short-term rentals. We do.
            </p>
            <p className="mx-auto mb-12 max-w-2xl text-base leading-relaxed text-gray-200 lg:text-lg">
              We'll help you buy the right property, in the right market, with the right plan — so
              you cash flow faster and skip the rookie mistakes.
            </p>
            <div className="mx-auto mb-14 grid max-w-3xl grid-cols-1 gap-4 text-left md:grid-cols-2">
              {VALUE_POINTS.map(point => (
                <div
                  key={point}
                  className="flex items-center gap-4 rounded-2xl border border-gray-600/50 bg-gray-800/70 px-6 py-5 backdrop-blur-sm transition-colors hover:bg-gray-700/70"
                >
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full">
                    <CheckCircle className="h-5 w-5 text-[#43e8ff]" />
                  </div>
                  <span className="text-sm font-medium leading-snug text-white lg:text-base">{point}</span>
                </div>
              ))}
            </div>
            <a
              href={path("/contact")}
              className="inline-flex items-center rounded-full bg-[#43e8ff] px-10 py-4 text-base font-bold uppercase tracking-wide text-[#05314a] shadow-2xl transition-all hover:scale-105 hover:bg-yellow-400 lg:text-lg"
            >
              Talk to an STR Agent
            </a>
          </div>
        </div>
      </section>

      {agents.length ? (
        <section className="bg-white py-12">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <LiveSectionTitle
              title="Expert STR Agents by Market"
              subtitle="Connect with local agents who specialize in STR investments"
            />
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {agents.slice(0, 6).map((item: any) => (
                <LiveAgentCard key={item.id} item={item} />
              ))}
            </div>
            <div className="mt-8 text-center">
              <LiveOutlineLink href={path("/agents")}>View All Agents</LiveOutlineLink>
            </div>
          </div>
        </section>
      ) : null}

      {caseStudies.length ? (
        <section className="bg-white py-12">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <LiveSectionTitle
              title="Proven Investment Success Stories"
              subtitle="Real results showing returns and transformation journeys"
            />
            <div className="grid gap-6 md:grid-cols-2">
              {caseStudies.map((item: any) => (
                <LiveCaseStudyCard key={item.id} item={item} />
              ))}
            </div>
            <div className="mt-8 text-center">
              <LiveOutlineLink href={path("/case-studies")}>View All Case Studies</LiveOutlineLink>
            </div>
          </div>
        </section>
      ) : null}

      {posts.length ? (
        <section className="bg-gray-50 py-12">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <LiveSectionTitle
              title="Featured Insights & Guides"
              subtitle="Expert tips and strategies for STR investing"
            />
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {posts.map((item: any) => (
                <LiveHomeArticleCard key={item.id} item={item} />
              ))}
            </div>
            <div className="mt-8 text-center">
              <a
                href={path("/resources")}
                className="inline-flex items-center gap-2 rounded-lg border border-[#05314a] px-6 py-3 text-sm font-semibold text-[#05314a] transition-colors hover:bg-[#05314a] hover:text-white"
              >
                View all insights and guides
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </section>
      ) : null}

      <section className="py-16 text-white [background-image:linear-gradient(135deg,#05314a_0%,#0b4966_50%,#10c0df_100%)]">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <div className="mb-6 flex justify-center">
            <div className="rounded-full bg-white/10 p-4 backdrop-blur-sm">
              <BookOpen className="h-12 w-12 text-[#43e8ff]" />
            </div>
          </div>
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Ready to Start Investing in STR Properties?
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-xl text-white/80">
            Create a free account to save properties, connect with expert agents, and get
            personalized investment insights.
          </p>
          <a
            href={accountPath.signUp}
            className="inline-flex items-center rounded-lg bg-[#43e8ff] px-8 py-4 text-lg font-bold text-[#05314a] shadow-lg transition-all hover:shadow-xl"
          >
            Find My Next STR Investment
            <ArrowRight className="ml-2 h-5 w-5" />
          </a>
        </div>
      </section>
    </Shell>
  );
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  single_family: "Single Family",
  multi_family: "Multi Family",
  condo: "Condo",
  townhouse: "Townhouse",
  cabin: "Cabin",
  vacation_rental: "Vacation Rental",
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
  const heading = useListHeading("properties");
  const [showMore, setShowMore] = useState(false);
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

  const hasMarkets = !!facets.data?.markets?.length;
  if (query.isLoading && !query.data) return <LoadingPage />;
  const items = query.data || [];
  const updating = query.isFetching && query.isPlaceholderData;
  // The live site's price presets, over the same min and max as the finer
  // steps under More Filters.
  const PRICE_PRESETS: Array<[string, string, string]> = [
    ["0-500000", "", "500000"],
    ["500000-1000000", "500000", "1000000"],
    ["1000000+", "1000000", ""],
  ];
  const pricePreset =
    PRICE_PRESETS.find(([, min, max]) => filters.minPrice === min && filters.maxPrice === max)?.[0] ??
    (filters.minPrice || filters.maxPrice ? "custom" : "");
  const setPricePreset = (value: string) => {
    if (value === "custom") {
      setShowMore(true);
      return;
    }
    const preset = PRICE_PRESETS.find(([key]) => key === value);
    setFilters(current => ({
      ...current,
      minPrice: preset ? preset[1] : "",
      maxPrice: preset ? preset[2] : "",
    }));
  };
  const fieldClass =
    "h-10 w-full appearance-none rounded-lg border border-gray-300 bg-white pl-3 pr-9 text-black focus:outline-none focus:ring-2 focus:ring-blue-500";
  const iconFieldClass =
    "h-10 w-full appearance-none rounded-lg border border-gray-300 bg-white pl-9 pr-9 text-black focus:outline-none focus:ring-2 focus:ring-blue-500";
  const label = "mb-2 block text-xs text-gray-600";
  const chevron = (
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
  );
  const anyFilter = activeFilters > 0 || !!filters.search;
  return (
    <Shell>
      <div className="min-h-screen bg-gray-50">
        <section className="border-b bg-white">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-12 lg:px-8">
            <div className="text-center">
              <h1 className="mb-2 text-2xl font-bold text-gray-900 sm:mb-4 sm:text-3xl md:text-4xl">
                {heading.heroTitle}
              </h1>
              {heading.heroSubtitle ? (
                <p className="mx-auto hidden max-w-3xl text-xl text-gray-600 sm:block">
                  {heading.heroSubtitle}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8 rounded-2xl border bg-gray-50 p-4 shadow-sm md:p-6">
            <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
              <div className={`min-w-0 sm:min-w-[160px] sm:flex-1 ${hasMarkets ? "" : "col-span-2"}`}>
                <label className={label} htmlFor="listing-search">
                  Search
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    id="listing-search"
                    className={iconFieldClass}
                    placeholder="City, state, keyword"
                    value={filters.search}
                    onChange={event => set("search")(event.target.value)}
                    autoComplete="off"
                  />
                </div>
              </div>
              {hasMarkets ? (
                <div className="min-w-0 sm:min-w-[160px] sm:flex-1">
                  <label className={label}>Market</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <select
                      className={iconFieldClass}
                      value={filters.market}
                      onChange={event => set("market")(event.target.value)}
                    >
                      <option value="">Any Market</option>
                      {facets.data!.markets.map((item: any) => (
                        <option key={item.id} value={String(item.id)}>
                          {item.name} ({item.propertyCount})
                        </option>
                      ))}
                    </select>
                    {chevron}
                  </div>
                </div>
              ) : null}
              <div className="min-w-0 sm:min-w-[130px]">
                <label className={label}>Price Range</label>
                <div className="relative">
                  <select
                    className={fieldClass}
                    value={pricePreset}
                    onChange={event => setPricePreset(event.target.value)}
                  >
                    <option value="">Any Price</option>
                    <option value="0-500000">Under $500K</option>
                    <option value="500000-1000000">$500K - $1M</option>
                    <option value="1000000+">$1M+</option>
                    <option value="custom">Custom range…</option>
                  </select>
                  {chevron}
                </div>
              </div>
              <div className="min-w-0 sm:min-w-[100px]">
                <label className={label}>Bedrooms</label>
                <div className="relative">
                  <select
                    className={fieldClass}
                    value={filters.beds}
                    onChange={event => set("beds")(event.target.value)}
                  >
                    <option value="">Any</option>
                    {[1, 2, 3, 4, 5].map(n => (
                      <option key={n} value={String(n)}>
                        {n}+
                      </option>
                    ))}
                  </select>
                  {chevron}
                </div>
              </div>
              <div className="col-span-2 grid w-full grid-cols-2 items-center gap-3 sm:ml-auto sm:flex sm:w-auto sm:gap-2">
                <button
                  type="button"
                  onClick={() => setShowMore(value => !value)}
                  className="inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-xl border bg-white px-3 text-sm font-medium shadow-xs transition-all hover:bg-[#f5f5f5] sm:w-auto"
                >
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  More Filters
                  {showMore ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
                </button>
                {anyFilter ? (
                  <button
                    type="button"
                    onClick={() => {
                      clearFilters();
                      set("search")("");
                    }}
                    className="order-last col-span-2 inline-flex h-10 items-center justify-center whitespace-nowrap rounded-xl px-3 text-sm font-medium text-gray-500 transition-all hover:bg-[#f5f5f5] sm:order-none sm:col-auto"
                  >
                    <X className="mr-1 h-4 w-4" />
                    Clear
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setDebouncedSearch(filters.search.trim());
                    document.getElementById("property-results")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-xl bg-[#171717] px-5 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#171717]/90 sm:w-auto"
                >
                  <Search className="mr-2 h-4 w-4" />
                  {updating ? "Search" : `Search ${items.length}`}
                </button>
              </div>
            </div>

            <p className="mt-3 min-h-[1.25rem] text-sm text-gray-600" aria-live="polite">
              {updating
                ? "Counting matches…"
                : items.length === 0
                  ? "No properties match these filters. Try a wider price range or fewer bedrooms."
                  : `${items.length.toLocaleString()} ${items.length === 1 ? "property matches" : "properties match"} these filters.`}
            </p>

            {showMore && (
              <div className="mt-4 space-y-4 border-t border-gray-200 pt-4">
                <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-4">
                  {[
                    ["State", "state", [["", "Any State"], ...(facets.data?.states || []).map((code: string) => [code, US_STATE_NAMES[code] || code])]],
                    ["Type", "type", [["", "Any Type"], ...(facets.data?.propertyTypes || []).map((type: string) => [type, PROPERTY_TYPE_LABELS[type] || type])]],
                    ["Bathrooms", "baths", [["", "Any"], ...[1, 2, 3, 4, 5].map(n => [String(n), `${n}+`])]],
                    ["Sort by", "sort", Object.entries(SORT_LABELS)],
                    ["Min price", "minPrice", [["", "No minimum"], ...priceSteps.map(step => [String(step), money(step)])]],
                    ["Max price", "maxPrice", [["", "No maximum"], ...priceSteps.map(step => [String(step), money(step)])]],
                  ].map(([title, key, options]: any) => (
                    <div key={key}>
                      <label className={label}>{title}</label>
                      <div className="relative">
                        <select
                          className={fieldClass}
                          value={filters[key as PropertyFilterKey]}
                          onChange={event => set(key as PropertyFilterKey)(event.target.value)}
                        >
                          {options.map(([value, text]: [string, string]) => (
                            <option key={value || "any"} value={value}>
                              {text}
                            </option>
                          ))}
                        </select>
                        {chevron}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div id="property-results">
            {items.length ? (
              <>
                <p className="text-sm text-gray-600">
                  {items.length === 1
                    ? "1 property matches your filters"
                    : `${items.length.toLocaleString()} properties match your filters`}
                </p>
                <div
                  className={`mb-8 grid gap-6 pt-4 transition-opacity md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${updating ? "opacity-60" : ""}`}
                  aria-busy={updating}
                >
                  {items.map((item: any) => (
                    <LivePropertyCard key={item.id} item={item} />
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-[10px] border border-[#e5e5e5] bg-white p-12 text-center shadow-sm">
                <div className="mb-4 text-gray-400">
                  <Building2 className="mx-auto mb-4 h-16 w-16" />
                </div>
                <h3 className="mb-2 text-xl font-semibold text-gray-900">No Properties Found</h3>
                <p className="mb-6 text-gray-600">Try adjusting your search filters to find more properties.</p>
                <button
                  type="button"
                  onClick={() => {
                    clearFilters();
                    set("search")("");
                  }}
                  className="inline-flex h-9 items-center rounded-md border bg-white px-4 text-sm font-medium shadow-xs hover:bg-[#f5f5f5]"
                >
                  Clear All Filters
                </button>
              </div>
            )}
          </div>
        </div>
        <FinancialDisclaimer />
      </div>
    </Shell>
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

/** A section heading on the property page, as on the live site: a short
 *  spacer where the live site draws a (transparent) accent bar, then the
 *  title. Phones skip the spacer. */
function PropertySectionTitle({
  children,
  size = "xl",
  after,
}: {
  children: React.ReactNode;
  size?: "xl" | "3xl";
  after?: React.ReactNode;
}) {
  return (
    <div className={`flex items-center gap-3 ${size === "3xl" ? "mb-4" : "mb-4"}`}>
      {/* On phones the spacer only pushed the title off-line; hidden there. */}
      <div className={`hidden sm:block h-1 ${size === "3xl" ? "w-12" : "w-8"} rounded-full`} />
      {size === "3xl" ? (
        <h2 className="text-2xl sm:text-3xl font-bold text-[#05314a]">{children}</h2>
      ) : (
        <h3 className="text-xl font-bold text-[#05314a]">{children}</h3>
      )}
      {after}
    </div>
  );
}

/** "Login to view details", as the live property page shows it. */
function LoginLink({ href, className = "" }: { href: string; className?: string }) {
  return (
    <a href={href} className={`flex items-center gap-1.5 text-sm text-[#10c0df] transition-colors ${className}`}>
      <Lock className="h-4 w-4" />
      <span>Login to view details</span>
    </a>
  );
}

function PropertyDetailPage({ slug }: { slug: string }) {
  const query = trpc.website.publicProperty.useQuery({ slug });
  // The revenue range and comps come from the linked pro-forma, read live, so
  // the listing cannot drift from the analysis it claims to be based on.
  const evidence = trpc.website.publicPropertyEvidence.useQuery({ slug });
  const [showLead, setShowLead] = useState(false);
  // Which of the calls to action was pressed, so the form says what it is
  // for and the lead records what was actually asked.
  const [ask, setAsk] = useState<null | "showing" | "analysis" | "financing">(null);
  // Full-screen photo viewer: the index of the photo open, or null.
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  // "More properties" under the page. The whole live list is small, so this
  // reuses the list query rather than adding a new one.
  const others = trpc.website.publicProperties.useQuery(undefined, {
    staleTime: 5 * 60_000,
  });
  usePageTitle(query.data?.metaTitle || query.data?.address || "Property");
  // Recorded for the signed-in investor only, and only once per listing per
  // visit. Anonymous browsing is not tracked to an account that does not exist.
  useRecordPropertyView((query.data as any)?.propertyId);
  if (query.isLoading) return <LoadingPage />;
  const item: any = query.data;
  if (!item) return <NotFoundPage />;
  const gallery = Array.from(
    new Set([item.heroImageUrl, ...(item.galleryImageUrls || [])].filter(Boolean))
  ) as string[];
  const highlights: string[] = Array.isArray(item.investmentHighlights) ? item.investmentHighlights : [];
  const tags: string[] = Array.isArray(item.featureTags) ? item.featureTags.filter(Boolean) : [];
  const here = path(`/properties/${item.slug}`);
  const signIn = `${accountPath.signIn}?next=${encodeURIComponent(here)}`;
  const shareUrl = `${window.location.origin}${here}`;
  const locked = !!item.gated;
  const cashOnCash = item.cashOnCash == null || item.cashOnCash === "" ? null : Number(item.cashOnCash);
  const revenue = evidence.data?.revenue ?? null;
  const comps = evidence.data?.comps ?? [];
  const compsLocked = !!evidence.data?.gated;
  const description: string = item.summary || "";
  const place = `${[item.city, item.state].filter(Boolean).join(", ")}${item.zip ? ` ${item.zip}` : ""}`;
  const agentName = item.assignedAgentName || "Savvy STR Agents";
  const agentProfile = item.assignedAgentSlug ? path(`/agents/${item.assignedAgentSlug}`) : null;
  const calc = locked
    ? null
    : runCalculator({
        purchasePrice: item.listPrice == null ? null : Number(item.listPrice),
        annualRevenue: item.projectedRevenue == null ? null : Number(item.projectedRevenue),
        downPaymentPct: CALCULATOR_DEFAULTS.downPaymentPct,
        interestRatePct: CALCULATOR_DEFAULTS.interestRatePct,
        loanTermYears: CALCULATOR_DEFAULTS.loanTermYears,
        operatingCostPct: CALCULATOR_DEFAULTS.operatingCostPct,
        annualTaxesAndInsurance: 0,
      });
  const specs: Array<[any, string, string]> = [
    [BedDouble, roomCount(item.beds), "Bedrooms"],
    ...(item.baths ? ([[Bath, roomCount(item.baths), "Bathrooms"]] as Array<[any, string, string]>) : []),
    ...(item.sqft ? ([[Square, Number(item.sqft).toLocaleString(), "Square Feet"]] as Array<[any, string, string]>) : []),
    [Home, PROPERTY_TYPE_LABELS[item.propertyType] || "Single Family", "Property Type"],
  ];
  const openAsk = (key: "showing" | "analysis" | "financing" | null) => {
    setAsk(key);
    setShowLead(true);
    window.setTimeout(
      () => document.getElementById("property-lead-form")?.scrollIntoView({ behavior: "smooth", block: "center" }),
      50
    );
  };
  // Up to three other live listings, the same state first.
  const moreProperties = ((others.data as any[]) || [])
    .filter(other => other.slug !== item.slug)
    .sort((a, b) => Number(b.state === item.state) - Number(a.state === item.state))
    .slice(0, 3);
  const outline =
    "inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium shadow-xs transition-all";

  return (
    <Shell>
      {item.listingStatus && item.listingStatus !== "published" ? (
        <div className="bg-amber-100 px-4 py-2.5 text-center text-sm font-medium text-amber-900">
          Draft preview. Only signed-in Savvy team members can see this page. Publish it on the
          property's Website tab to make it live.
        </div>
      ) : null}
      <div className="border-b border-[#e5e5e5] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <a
            className="group inline-flex items-center text-[#05314a] transition-colors hover:text-[#10c0df]"
            href={path("/properties")}
          >
            <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            Back to Properties
          </a>
          <div className="flex items-center gap-2">
            <ShareButton url={shareUrl} text={item.address || "Savvy STR property"} pill />
            <SaveButton propertyId={item.propertyId} pill />
          </div>
        </div>
      </div>

      <div className="bg-[#05314a] pb-2 text-white md:pb-6">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 md:py-8 lg:px-8">
          <div className="mb-4 flex flex-row items-start justify-between gap-2 md:mb-8 md:gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="mb-1 truncate text-xl font-bold leading-tight drop-shadow-lg md:mb-2 md:whitespace-normal md:text-5xl">
                {item.address}
              </h1>
              <div className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-1 backdrop-blur-sm md:gap-2 md:px-4 md:py-2">
                <MapPin className="h-3 w-3 flex-shrink-0 md:h-4 md:w-4" />
                <span className="truncate text-xs font-medium md:text-sm">{place}</span>
              </div>
            </div>
            <div className="flex-shrink-0 text-right">
              <div className="mb-0.5 text-xs text-white/80 md:mb-1 md:text-sm">List Price</div>
              <div className="text-xl font-bold drop-shadow-lg md:text-5xl">{money(item.listPrice)}</div>
              {locked ? (
                <a href={signIn} className="relative mt-1 inline-block md:mt-2" aria-label="Sign in to see the return">
                  <span className="inline-flex select-none items-center rounded-full bg-[#10c0df] px-2.5 py-0.5 text-xs font-semibold text-white shadow-lg blur-sm">
                    00.0% ROI
                  </span>
                  <Lock className="absolute inset-0 m-auto h-3 w-3 text-white drop-shadow-lg md:h-4 md:w-4" />
                </a>
              ) : cashOnCash != null && Number.isFinite(cashOnCash) && cashOnCash > 0 ? (
                <span className="mt-1 inline-flex items-center rounded-full bg-[#10c0df] px-2.5 py-0.5 text-xs font-semibold text-white shadow-lg md:mt-2">
                  {(cashOnCash * 100).toFixed(1)}% ROI
                </span>
              ) : null}
            </div>
          </div>

          {gallery.length > 0 ? (
            <div className="mt-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:gap-4">
                <button
                  type="button"
                  onClick={() => setPhotoIndex(0)}
                  className={`group relative h-[250px] cursor-pointer overflow-hidden rounded-2xl shadow-2xl md:h-[520px] ${gallery.length > 1 ? "md:col-span-8" : "md:col-span-12"}`}
                  aria-label="Open photos"
                >
                  <img
                    src={gallery[0]}
                    alt={item.address}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                </button>
                {gallery.length > 1 ? (
                  <div className="grid grid-cols-2 gap-3 md:col-span-4 md:h-[520px] md:gap-4">
                    {gallery.slice(1, 3).map((photo, index) => (
                      <button
                        type="button"
                        key={photo}
                        onClick={() => setPhotoIndex(index + 1)}
                        className={`group relative h-[100px] cursor-pointer overflow-hidden rounded-xl shadow-lg md:h-auto md:rounded-2xl ${gallery.length === 2 ? "col-span-2" : ""}`}
                        aria-label={`Open photo ${index + 2}`}
                      >
                        <img
                          src={photo}
                          alt={`${item.address} - Image ${index + 2}`}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                        />
                        <div className="absolute inset-0 bg-black/20 transition-colors duration-300 group-hover:bg-black/0" />
                      </button>
                    ))}
                    {gallery.length > 3 ? (
                      <div className="group relative col-span-2 h-[100px] overflow-hidden rounded-xl shadow-lg md:h-auto md:rounded-2xl">
                        <img src={gallery[3]} alt="More photos" className="h-full w-full object-cover" />
                        <div className="absolute inset-0 transition-colors duration-300 group-hover:bg-black/10" />
                        <button
                          type="button"
                          onClick={() => setPhotoIndex(0)}
                          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-[#10c0df]/30 bg-[#05314a] px-3 py-2 text-white shadow-lg transition-all duration-200 hover:scale-105 md:bottom-4 md:px-4 md:py-2.5"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M0 0h4v4H0V0zm6 0h4v4H6V0zm6 0h4v4h-4V0zM0 6h4v4H0V6zm6 0h4v4H6V6zm6 0h4v4h-4V6zM0 12h4v4H0v-4zm6 0h4v4H6v-4zm6 0h4v4h-4v-4z" />
                          </svg>
                          <span className="text-sm font-medium">Show all photos</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {photoIndex !== null && gallery.length > 0 && (
        <PhotoViewer
          photos={gallery}
          index={photoIndex}
          alt={item.address}
          onChange={setPhotoIndex}
          onClose={() => setPhotoIndex(null)}
        />
      )}

      <div className="bg-white">
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          {item.blurbGated || item.agentBlurb ? (
            <div className="relative overflow-hidden rounded-2xl border-2 border-[#e5e5e5] bg-white p-6 shadow-lg">
              <div className="relative">
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-xl p-2">
                    <svg className="h-6 w-6 text-[#10c0df]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-[#05314a]">Why I Like This Property</h3>
                  {item.blurbGated ? <LoginLink href={signIn} className="ml-auto" /> : null}
                </div>
                <div className="pl-12">
                  {item.blurbGated ? (
                    <a href={signIn} className="relative block cursor-pointer">
                      <p className="select-none text-lg italic leading-relaxed blur-md">
                        &ldquo;This property stands out because of its location, its rental history, and its
                        potential for above-market returns.&rdquo;
                      </p>
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex items-center gap-2 rounded-lg bg-white/90 px-4 py-2.5 shadow-lg backdrop-blur-sm">
                          <Lock className="h-4 w-4 text-[#05314a]" />
                          <span className="text-sm font-medium text-[#05314a]">Login to view details</span>
                        </span>
                      </span>
                    </a>
                  ) : (
                    <p className="text-lg italic leading-relaxed">&ldquo;{item.agentBlurb}&rdquo;</p>
                  )}
                  <a
                    href={agentProfile || path("/agents")}
                    className="group mt-4 flex items-center gap-3 transition-opacity hover:opacity-80"
                  >
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full">
                      {item.assignedAgentImageUrl ? (
                        <img src={item.assignedAgentImageUrl} alt={agentName} className="h-full w-full object-cover" />
                      ) : (
                        <span className="font-semibold text-[#05314a]">{agentName.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-[#05314a] group-hover:underline">{agentName}</div>
                      <div className="text-sm">Savvy STR Agent</div>
                    </div>
                  </a>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="order-2 space-y-6 lg:order-1 lg:col-span-2">
              {description || tags.length ? (
                <div className="relative overflow-hidden rounded-2xl border border-[#e5e5e5] bg-gradient-to-br from-white via-white to-transparent p-6 shadow-lg">
                  <div className="relative">
                    <PropertySectionTitle size="3xl">About This Property</PropertySectionTitle>
                    {description ? (
                      <div className="mb-4 text-lg leading-relaxed">
                        {description.length > 300 ? (
                          <>
                            <p className="line-clamp-4">{description}</p>
                            <button
                              type="button"
                              onClick={() => setShowAbout(true)}
                              className="mt-3 inline-flex items-center gap-1 font-semibold text-[#10c0df] transition-colors"
                            >
                              Read More
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <p className="whitespace-pre-line">{description}</p>
                        )}
                      </div>
                    ) : null}
                    {tags.length ? (
                      <div className="flex flex-wrap gap-2 pt-2">
                        {tags.map(tag => (
                          <span
                            key={tag}
                            className="inline-flex items-center rounded-full border border-transparent bg-[#f5f5f5] px-2.5 py-0.5 text-sm font-semibold text-[#171717]"
                          >
                            {tag.replace(/\b\w/g, c => c.toUpperCase())}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div>
                <PropertySectionTitle>Property Details</PropertySectionTitle>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {specs.map(([Icon, value, label]) => (
                    <div
                      key={label}
                      className="group relative overflow-hidden rounded-xl border border-[#e5e5e5] bg-gradient-to-br from-white to-gray-50 p-4 shadow-sm transition-all duration-300 hover:shadow-md"
                    >
                      <Icon className="mb-2 h-6 w-6 text-[#10c0df]" />
                      <div className="mb-0.5 text-2xl font-bold text-[#05314a]">{value}</div>
                      <div className="text-xs font-medium">{label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {locked || item.projectedRevenue || revenue ? (
                <div>
                  <PropertySectionTitle after={locked ? <LoginLink href={signIn} className="ml-auto" /> : null}>
                    Projected Opportunity
                  </PropertySectionTitle>
                  <div className="relative mb-4 overflow-hidden rounded-xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50 via-white to-transparent p-3 shadow-sm md:p-4">
                    {revenue && !revenue.single ? (
                      <>
                        <div className="mb-2 flex items-center gap-1.5">
                          <DollarSign className="h-4 w-4 text-emerald-600" />
                          <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Revenue Range</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-baseline gap-1">
                            <span className="text-xs font-medium text-gray-400">Conservative:</span>
                            <span className="text-lg font-bold text-[#05314a]">
                              {money(revenue.low)}
                              <span className="ml-0.5 text-xs font-normal">/yr</span>
                            </span>
                          </div>
                          <span className="text-sm text-gray-300">→</span>
                          <div className="flex items-baseline gap-1">
                            <span className="text-xs font-medium text-gray-400">Strong:</span>
                            <span className="text-xl font-bold text-emerald-600">
                              {money(revenue.high)}
                              <span className="ml-0.5 text-xs font-normal text-emerald-600/60">/yr</span>
                            </span>
                          </div>
                          <p className="mt-0.5 w-full text-xs text-gray-400">
                            Based on the comparable short-term rentals below. An estimate, not a guarantee.
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="mb-3 flex items-center gap-2">
                          <DollarSign className="h-6 w-6 text-emerald-600" />
                          <span className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
                            Estimated Annual Revenue
                          </span>
                        </div>
                        {locked ? (
                          <a href={signIn} className="mb-2 inline-flex items-center gap-2 font-medium text-[#05314a] transition-colors">
                            <Lock className="h-5 w-5" />
                            Login to view details
                          </a>
                        ) : (
                          <div className="mb-2 text-4xl font-bold text-[#05314a] md:text-5xl">
                            {money(revenue ? revenue.low : item.projectedRevenue)}
                            <span className="ml-2 text-lg font-normal">/year</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      [TrendingUp, cashOnCash != null ? `${(cashOnCash * 100).toFixed(1)}%` : "—", "Projected ROI", "to-blue-50 border-blue-100", "text-blue-600", "text-emerald-600"],
                      [LineChart, item.averageDailyRate ? money(item.averageDailyRate) : "—", "Avg Daily Rate", "to-amber-50 border-amber-100", "text-amber-600", "text-[#10c0df]"],
                      [CalendarDays, item.occupancyRate != null && item.occupancyRate !== "" ? `${Math.round(Number(item.occupancyRate) * 100)}%` : "—", "Avg Occupancy", "to-purple-50 border-purple-100", "text-purple-600", "text-purple-600"],
                    ].map(([Icon, value, label, tone, iconColour, valueColour]: any) => (
                      <div key={label} className={`group relative overflow-hidden rounded-lg border bg-gradient-to-br from-white ${tone} p-3 shadow-sm transition-all duration-300`}>
                        <Icon className={`mb-1 h-4 w-4 ${iconColour}`} />
                        {locked ? (
                          <a href={signIn} className="block w-full select-none text-left text-lg font-bold text-[#05314a]">
                            —
                          </a>
                        ) : (
                          <div className={`text-lg font-bold ${valueColour}`}>{value}</div>
                        )}
                        <div className="text-xs font-medium text-gray-600">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {comps.length > 0 || compsLocked ? (
                <div className="relative mb-8 overflow-hidden rounded-2xl border border-rose-100 bg-gradient-to-br from-white via-white to-rose-50 p-8 shadow-lg">
                  <div className="relative">
                    <div className="mb-6 flex items-center gap-3">
                      <div className="h-1 w-12 rounded-full bg-gradient-to-r from-rose-500 to-rose-300" />
                      <h3 className="text-2xl font-bold text-gray-900">Comparable Airbnb Listings</h3>
                    </div>
                    <p className="mb-6 text-gray-600">Revenue data from similar short-term rentals in the area</p>
                    {compsLocked ? (
                      <a
                        href={signIn}
                        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border bg-white px-4 text-sm font-medium shadow-xs hover:bg-[#f5f5f5]"
                      >
                        <Lock className="h-4 w-4 text-rose-500" />
                        Login to view the comparable listings
                      </a>
                    ) : (
                      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {comps.map((comp: any, index: number) => {
                          const body = (
                            <>
                              {comp.photoUrl ? (
                                <div className="relative h-32 w-full overflow-hidden">
                                  <img src={comp.photoUrl} alt={comp.name || "Airbnb Comp"} loading="lazy" className="h-full w-full object-cover" />
                                </div>
                              ) : (
                                <div className="flex h-32 w-full items-center justify-center bg-gradient-to-br from-rose-100 to-rose-50">
                                  <Home className="h-10 w-10 text-rose-300" />
                                </div>
                              )}
                              <div className="p-4">
                                <h4 className="mb-1 line-clamp-1 text-sm font-semibold text-gray-900">{comp.name || "Airbnb Listing"}</h4>
                                {comp.city ? <p className="mb-3 text-xs text-gray-500">{comp.city}</p> : null}
                                <div className="space-y-2">
                                  {comp.adr ? (
                                    <div className="flex justify-between text-xs">
                                      <span className="text-gray-500">ADR</span>
                                      <span className="font-medium text-gray-900">{money(comp.adr)}/night</span>
                                    </div>
                                  ) : null}
                                  {comp.occupancy ? (
                                    <div className="flex justify-between text-xs">
                                      <span className="text-gray-500">Occupancy</span>
                                      <span className="font-medium text-gray-900">{Math.round(comp.occupancy * 100)}%</span>
                                    </div>
                                  ) : null}
                                  <div className="flex justify-between border-t border-gray-100 pt-2 text-sm">
                                    <span className="font-medium text-gray-600">Revenue</span>
                                    <span className="font-bold text-emerald-600">{money(comp.annualRevenue)}/yr</span>
                                  </div>
                                </div>
                                {comp.link ? (
                                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-rose-500 group-hover:text-rose-600">
                                    View on Airbnb
                                  </span>
                                ) : null}
                              </div>
                            </>
                          );
                          const cardClass =
                            "group block overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md";
                          return comp.link ? (
                            <a key={`${index}-${comp.name}`} href={comp.link} target="_blank" rel="nofollow noopener noreferrer" className={cardClass}>
                              {body}
                            </a>
                          ) : (
                            <div key={`${index}-${comp.name}`} className={cardClass}>
                              {body}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {highlights.length > 0 && (
                <div>
                  <PropertySectionTitle>Investment Highlights</PropertySectionTitle>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {highlights.map(text => (
                      <div key={text} className="flex gap-3 rounded-xl border border-[#e5e5e5] bg-gradient-to-br from-white to-gray-50 p-4 shadow-sm">
                        <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#10c0df]" />
                        <span className="text-sm font-medium">{text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                <h3 className="font-bold text-amber-950">Regulation & diligence</h3>
                <p className="mt-2 text-sm leading-6 text-amber-900">
                  {item.regulationSummary ||
                    "Verify all municipal, county, HOA, insurance, financing, and operating requirements before purchase."}
                </p>
              </div>
            </div>

            <div className="order-1 space-y-4 lg:order-2 lg:col-span-1">
              <div className="rounded-[10px] border border-[#e5e5e5] bg-white p-5 shadow-sm">
                <h3 className="mb-3 text-center text-lg font-bold text-gray-900">Your Agent</h3>
                <a
                  href={agentProfile || path("/agents")}
                  className="group mb-3 flex cursor-pointer flex-col items-center text-center transition-opacity hover:opacity-80"
                >
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-[#e5e5e5] transition-colors group-hover:border-[#05314a]">
                    <img
                      src={item.assignedAgentImageUrl || "https://images.unsplash.com/photo-1560250097-0b93528c311a?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&h=150"}
                      alt={agentName}
                      className="h-full w-full object-cover object-[center_20%]"
                    />
                  </div>
                  <div className="mt-3">
                    <h4 className="font-bold text-gray-900 transition-colors group-hover:text-[#05314a]">{agentName}</h4>
                    <p className="text-sm">STR Investment Specialist</p>
                    {item.city ? <p className="text-sm text-gray-600">{[item.city, item.state].filter(Boolean).join(", ")}</p> : null}
                  </div>
                </a>
                <div className="my-3 h-px bg-[#e5e5e5]" />
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => openAsk(null)}
                    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[#171717] px-4 text-sm font-medium text-white transition-all hover:bg-[#171717]/90"
                  >
                    <Mail className="h-4 w-4" />
                    Message Agent
                  </button>
                  {item.assignedAgentPhone ? (
                    <a className={`${outline} bg-white hover:bg-[#f5f5f5]`} href={`tel:${String(item.assignedAgentPhone).replace(/[^+\d]/g, "")}`}>
                      <Phone className="h-4 w-4" />
                      Call Agent
                    </a>
                  ) : null}
                  <button type="button" onClick={() => openAsk("showing")} className={`${outline} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>
                    <CalendarCheck className="h-4 w-4" />
                    Book a Showing
                  </button>
                  <button type="button" onClick={() => openAsk("analysis")} className={`${outline} border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100`}>
                    <LineChart className="h-4 w-4" />
                    Request Deeper Analysis
                  </button>
                  <button type="button" onClick={() => openAsk("financing")} className={`${outline} border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100`}>
                    <Landmark className="h-4 w-4" />
                    Financing
                  </button>
                </div>
                {agentProfile ? (
                  <a href={agentProfile} className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-md px-4 text-sm font-medium transition-all hover:bg-[#f5f5f5]">
                    View Full Profile
                  </a>
                ) : null}
              </div>

              {showLead && (
                <div id="property-lead-form">
                  <LeadForm
                    agentUserId={item.assignedAgentId}
                    propertyId={item.propertyId}
                    intent="property"
                    requestType={ask ?? undefined}
                    title={ASK_COPY[ask ?? "default"].title(item.address)}
                    message={ASK_COPY[ask ?? "default"].message(item.address)}
                  />
                </div>
              )}

              <div className="rounded-[10px] border border-[#e5e5e5] bg-white p-6 shadow-sm">
                <h3 className="mb-3 flex items-center text-lg font-bold text-gray-900">
                  <Calculator className="mr-2 h-5 w-5" />
                  Investment Calculator
                </h3>
                <p className="mb-4 text-sm text-gray-600">Calculate your potential returns with real property data</p>
                {locked ? (
                  <div className="mb-4 space-y-2 rounded-lg p-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Est. Monthly Cash Flow</span>
                      <span className="select-none font-semibold text-emerald-600 blur-sm">+$0,000</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Cash-on-Cash Return</span>
                      <span className="select-none font-bold text-[#05314a] blur-sm">00.0%</span>
                    </div>
                  </div>
                ) : calc ? (
                  <div className="mb-4 space-y-2 rounded-lg p-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Est. Monthly Cash Flow</span>
                      <span className={`font-semibold ${calc.monthlyCashFlow >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {calc.monthlyCashFlow >= 0 ? "+" : ""}
                        {money(Math.round(calc.monthlyCashFlow))}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Cash-on-Cash Return</span>
                      <span className={`font-bold ${(calc.cashOnCash ?? 0) >= 0 ? "text-[#05314a]" : "text-red-600"}`}>
                        {calc.cashOnCash == null ? "—" : `${(calc.cashOnCash * 100).toFixed(1)}%`}
                      </span>
                    </div>
                  </div>
                ) : null}
                {locked ? (
                  <a href={signIn} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[#05314a] px-4 text-sm font-medium text-white">
                    <Lock className="mr-2 h-4 w-4" />
                    Login to Use Calculator
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCalculator(true)}
                    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[#05314a] px-4 text-sm font-medium text-white"
                  >
                    <Calculator className="mr-2 h-4 w-4" />
                    Open Investment Calculator
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showAbout && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={() => setShowAbout(false)}>
          <div className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 p-6">
              <div className="flex items-center gap-3">
                <div className="hidden h-1 w-8 rounded-full sm:block" />
                <h2 className="text-2xl font-bold text-[#05314a]">About This Property</h2>
              </div>
              <button type="button" onClick={() => setShowAbout(false)} className="rounded-full p-2 transition-colors hover:bg-gray-100" aria-label="Close">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-6">
              <p className="whitespace-pre-wrap text-lg leading-relaxed">{description}</p>
            </div>
            <div className="flex justify-end border-t border-gray-100 p-4">
              <button type="button" onClick={() => setShowAbout(false)} className="rounded-lg bg-[#05314a] px-6 py-2 font-medium text-white transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showCalculator && !locked && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center" onClick={() => setShowCalculator(false)}>
          <div className="relative w-full max-w-3xl" onClick={event => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setShowCalculator(false)}
              className="absolute right-4 top-4 z-10 rounded-full p-2 transition-colors hover:bg-gray-100"
              aria-label="Close calculator"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
            <InvestmentCalculator item={item} />
          </div>
        </div>
      )}

      {moreProperties.length > 0 && (
        <section className="bg-gray-50 py-12">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <LiveSectionTitle title="More Investment Properties" subtitle="Other STR opportunities you might like" />
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {moreProperties.map((other: any) => (
                <LivePropertyCard key={other.id} item={other} />
              ))}
            </div>
            <div className="mt-8 text-center">
              <LiveOutlineLink href={path("/properties")}>
                View All Properties <ArrowRight className="ml-1 h-4 w-4" />
              </LiveOutlineLink>
            </div>
          </div>
        </section>
      )}

      <div className="border-t border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <p className="text-xs text-gray-500">Information deemed reliable but not guaranteed.</p>
        </div>
      </div>
      <FinancialDisclaimer />
    </Shell>
  );
}

/**
 * Full-screen photos for a property: arrows, the keyboard (left, right,
 * Escape) and a click on the backdrop to close.
 */
function PhotoViewer({
  photos,
  index,
  alt,
  onChange,
  onClose,
}: {
  photos: string[];
  index: number;
  alt: string;
  onChange: (index: number) => void;
  onClose: () => void;
}) {
  const count = photos.length;
  const go = (step: number) => onChange((index + step + count) % count);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") go(1);
      if (event.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, count]);
  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label={`Photos of ${alt}`}
      onClick={onClose}
    >
      <div className="flex items-center justify-between px-5 py-4 text-sm text-white/80">
        <span>
          {index + 1} / {count}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-white hover:bg-white/10"
          aria-label="Close photos"
        >
          <X className="h-6 w-6" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-16 pb-8">
        <img
          src={photos[index]}
          alt={`${alt} photo ${index + 1}`}
          className="max-h-full max-w-full rounded-lg object-contain"
          onClick={event => event.stopPropagation()}
        />
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={event => {
                event.stopPropagation();
                go(-1);
              }}
              className="absolute left-4 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={event => {
                event.stopPropagation();
                go(1);
              }}
              className="absolute right-4 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
              aria-label="Next photo"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function AgentsPage() {
  const heading = useListHeading("agents");
  const [search, setSearch] = useState("");
  const [market, setMarket] = useState(
    () => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("market") || ""
  );
  const query = trpc.website.publicAgents.useQuery();
  if (query.isLoading) return <LoadingPage />;
  const all: any[] = query.data || [];
  const markets = Array.from(
    new Set(all.flatMap((item: any) => (Array.isArray(item.markets) ? item.markets : [])))
  )
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b)));
  const needle = search.trim().toLowerCase();
  const items = all.filter(
    (item: any) =>
      (!market || (item.markets || []).includes(market)) &&
      (!needle ||
        `${item.name} ${item.headline} ${(item.markets || []).join(" ")} ${(item.specialties || []).join(" ")}`
          .toLowerCase()
          .includes(needle))
  );
  // Laid out like the live /agents page: a plain heading, search and market
  // filter, then the cards.
  return (
    <Shell>
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-6xl p-6">
          <h1 className="mb-4 text-2xl font-semibold">{heading.heroTitle}</h1>
          {heading.heroSubtitle ? (
            <p className="-mt-2 mb-4 text-gray-600">{heading.heroSubtitle}</p>
          ) : null}
          <div className="mb-6 flex flex-col gap-3 sm:flex-row">
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search by name, market, state or specialty"
              className="w-full rounded border px-3 py-2 sm:w-1/2"
            />
            <select
              value={market}
              onChange={event => setMarket(event.target.value)}
              className="w-full rounded border bg-white px-3 py-2 sm:w-64"
            >
              <option value="">All markets</option>
              {markets.map(name => (
                <option key={String(name)} value={String(name)}>
                  {String(name)}
                </option>
              ))}
            </select>
          </div>
          {items.length ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item: any) => (
                <LiveAgentListCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <p className="py-12 text-center text-gray-500">No agents match that search.</p>
          )}
        </div>
        <FinancialDisclaimer />
      </div>
    </Shell>
  );
}

function AgentDetailPage({ slug }: { slug: string }) {
  const query = trpc.website.publicAgent.useQuery({ slug });
  // The agent's case studies and articles, matched by name from the public
  // lists (both small), so the profile shows them as the live site does.
  const studies = trpc.website.publicCaseStudies.useQuery(undefined, { staleTime: 5 * 60_000 });
  const posts = trpc.website.publicPosts.useQuery(undefined, { staleTime: 5 * 60_000 });
  const item: any = query.data;
  usePageTitle(item?.name || "Agent");
  // "Message" on an agent card links here with #contact. The form renders
  // only once the profile has loaded, so the browser's own jump misses it.
  useEffect(() => {
    if (!item || window.location.hash !== "#contact") return;
    const timer = window.setTimeout(
      () => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth", block: "center" }),
      100
    );
    return () => window.clearTimeout(timer);
  }, [item?.id]);
  if (query.isLoading) return <LoadingPage />;
  if (!item) return <NotFoundPage />;
  const markets: string[] = Array.isArray(item.markets) ? item.markets : [];
  const specialties: string[] = Array.isArray(item.specialties) ? item.specialties : [];
  const phone = item.publicPhone ? String(item.publicPhone).replace(/[^+\d]/g, "") : "";
  const theirStudies = ((studies.data as any[]) || []).filter(study => study.agentName && study.agentName === item.name).slice(0, 6);
  const theirPosts = ((posts.data as any[]) || []).filter(post => post.authorName && post.authorName === item.name).slice(0, 6);
  const paragraphs = String(item.shortBio || "")
    .split(/\n\s*\n/)
    .map(text => text.replace(/^"|"$/g, "").trim())
    .filter(Boolean);
  const toContact = () => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth", block: "center" });
  const shortDate = (value: unknown) => {
    const date = value ? new Date(value as any) : null;
    return date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : null;
  };
  // Laid out like the live agent profile.
  return (
    <Shell>
      <div className="min-h-screen bg-gray-50">
        <div className="border-b bg-white">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            <a
              href={path("/agents")}
              className="inline-flex h-9 items-center rounded-md px-4 text-sm font-medium transition-all hover:bg-[#f5f5f5]"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Agents
            </a>
          </div>
        </div>

        <section className="relative overflow-hidden bg-[#05314a]">
          <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
            <div className="flex flex-col items-center gap-8 text-center md:flex-row md:items-center md:text-left">
              <div className="shrink-0">
                <img
                  src={item.imageUrl || "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80"}
                  alt={item.name}
                  className="h-40 w-40 rounded-2xl object-cover object-top ring-4 ring-white/20 md:h-56 md:w-56"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-[#43e8ff]">
                  STR Investment Specialist
                </p>
                <h1 className="mb-2 text-3xl font-bold tracking-tight text-white md:text-4xl">{item.name}</h1>
                {markets[0] ? (
                  <div className="mb-4 flex items-center justify-center text-white/70 md:justify-start">
                    <MapPin className="mr-1.5 h-4 w-4 shrink-0" />
                    <span>{markets[0]}</span>
                  </div>
                ) : null}
              </div>
              <div className="w-full md:w-auto md:shrink-0">
                <div className="mx-auto w-full rounded-xl border border-white/20 bg-white/10 p-5 backdrop-blur-sm sm:max-w-xs md:mx-0">
                  <h3 className="mb-4 text-base font-bold text-white">Contact {item.name}</h3>
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={toContact}
                      className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-white px-4 text-sm font-medium text-[#05314a] transition-all hover:bg-white/90"
                    >
                      <Mail className="h-4 w-4" />
                      Send Message
                    </button>
                    {phone ? (
                      <a
                        href={`tel:${phone}`}
                        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-white/60 bg-transparent px-4 text-sm font-medium text-white transition-all hover:bg-white/15"
                      >
                        <Phone className="h-4 w-4" />
                        Call Agent
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="mb-8 rounded-[10px] border border-[#e5e5e5] bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-2xl font-bold text-gray-900">About {item.name}</h2>
                {paragraphs.length ? (
                  paragraphs.map((paragraph, index) => (
                    <p key={index} className="mb-4 leading-relaxed text-gray-700">
                      {paragraph}
                    </p>
                  ))
                ) : item.headline ? (
                  <p className="mb-4 leading-relaxed text-gray-700">{item.headline}</p>
                ) : null}
                {specialties.length > 0 ? (
                  <div className="mt-6">
                    <h3 className="mb-3 flex items-center text-lg font-semibold text-gray-900">
                      <Star className="mr-2 h-5 w-5" />
                      Specialties
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {specialties.map(tag => (
                        <span key={tag} className="inline-flex items-center rounded-full border border-transparent bg-[#f5f5f5] px-2.5 py-0.5 text-xs font-semibold text-[#05314a]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {markets.length > 0 ? (
                  <div className="mt-6">
                    <h3 className="mb-3 flex items-center text-lg font-semibold text-gray-900">
                      <MapPin className="mr-2 h-5 w-5" />
                      Market Expertise
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {markets.map((market, index) => (
                        <span
                          key={market}
                          className={`inline-flex items-center rounded-full border border-transparent px-2.5 py-0.5 text-xs font-semibold ${
                            index === 0 ? "bg-[#05314a] text-white" : "bg-[#f5f5f5] text-[#05314a]"
                          }`}
                        >
                          {index === 0 ? (
                            <Star className="mr-1 h-3 w-3 fill-current" aria-label="Primary market" />
                          ) : (
                            <MapPin className="mr-1 h-3 w-3" aria-hidden="true" />
                          )}
                          {market}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {item.properties?.length > 0 && (
                <div className="mb-8">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="flex items-center text-2xl font-bold text-gray-900">
                      <Home className="mr-2 h-5 w-5" />
                      Properties
                    </h2>
                    <a href={path("/properties")} className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium hover:bg-[#f5f5f5]">
                      View all properties <ArrowRight className="ml-1 h-4 w-4" />
                    </a>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    {item.properties.slice(0, 3).map((property: any) => (
                      <LivePropertyCard key={property.id} item={property} />
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-8">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center text-2xl font-bold text-gray-900">
                    <BookOpen className="mr-2 h-5 w-5" />
                    Case Studies ({theirStudies.length})
                  </h2>
                  {theirStudies.length > 0 ? (
                    <a href={path("/case-studies")} className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium hover:bg-[#f5f5f5]">
                      View all <ArrowRight className="ml-1 h-4 w-4" />
                    </a>
                  ) : null}
                </div>
                {theirStudies.length === 0 ? (
                  <p className="text-gray-500">No Case Studies available yet.</p>
                ) : (
                  <div className="space-y-4">
                    {theirStudies.map((study: any) => (
                      <div key={study.id} className="group flex flex-col gap-4 rounded-xl border bg-white p-4 transition-shadow hover:shadow-md sm:flex-row">
                        <div className="relative h-20 w-full flex-shrink-0 overflow-hidden rounded-lg bg-gray-100 sm:w-24">
                          {study.heroImageUrl ? (
                            <img src={study.heroImageUrl} alt={study.title} loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <BookOpen className="h-8 w-8" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <a href={path(`/case-studies/${study.slug}`)}>
                            <h3 className="line-clamp-2 font-semibold leading-snug text-gray-900">{study.title}</h3>
                          </a>
                          {study.excerpt ? <p className="mt-1 line-clamp-2 text-sm text-gray-500">{study.excerpt}</p> : null}
                        </div>
                        <div className="flex flex-shrink-0 items-center sm:items-start">
                          <a
                            href={path(`/case-studies/${study.slug}`)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-white px-3 text-sm font-medium shadow-xs hover:bg-[#f5f5f5]"
                          >
                            View Case Study <ArrowRight className="ml-1 h-4 w-4" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {theirPosts.length > 0 ? (
                <div className="mb-8">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="flex items-center text-2xl font-bold text-gray-900">
                      <FileText className="mr-2 h-5 w-5" />
                      Articles & Insights
                    </h2>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {theirPosts.map((post: any) => (
                      <a key={post.id} href={path(`/resources/${post.slug}`)} className="group flex gap-4 rounded-xl border bg-white p-4 transition-shadow hover:shadow-md">
                        <div className="relative h-20 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                          {post.coverImageUrl ? (
                            <img src={post.coverImageUrl} alt={post.title} loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <FileText className="h-8 w-8" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="line-clamp-2 font-semibold leading-snug text-gray-900">{post.title}</h3>
                          {post.excerpt ? <p className="mt-1 line-clamp-2 text-sm text-gray-500">{post.excerpt}</p> : null}
                          {shortDate(post.publishedAt) ? (
                            <span className="mt-2 inline-block text-xs text-gray-400">{shortDate(post.publishedAt)}</span>
                          ) : null}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="lg:col-span-1">
              {item.bookingUrl ? (
                <div className="mb-6 overflow-hidden rounded-[10px] border border-[#e5e5e5] bg-white p-4 shadow-sm">
                  <h3 className="mb-3 text-lg font-bold text-gray-900">Book a Call with {item.name}</h3>
                  <a
                    className="flex w-full items-center justify-center gap-2 rounded-md bg-[#05314a] px-4 py-3 text-sm font-medium text-white"
                    href={item.bookingUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <CalendarDays className="h-4 w-4" />
                    Pick a time
                  </a>
                </div>
              ) : null}
              <div id="contact">
                <LeadForm
                  agentUserId={item.userId}
                  intent="agent"
                  title={`Message ${item.name}`}
                  message={`I'd like to connect about STR investment opportunities in ${markets[0] || "your market"}.`}
                />
              </div>
            </div>
          </div>
        </div>
        <FinancialDisclaimer />
      </div>
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
  const heading = useListHeading("case-studies");
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
  // Laid out like the live /case-studies page.
  return (
    <Shell>
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 text-center">
            <h1 className="mb-3 text-3xl font-bold text-[#05314a]">{heading.heroTitle}</h1>
            {heading.heroSubtitle ? (
              <p className="mx-auto max-w-2xl text-lg">{heading.heroSubtitle}</p>
            ) : null}
          </div>

          <div className="mx-auto mb-8 max-w-3xl">
            <div className="relative overflow-hidden rounded-2xl border border-[#e5e5e5] shadow-sm">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent" />
              <div className="relative bg-white/80 p-3 backdrop-blur">
                <div className="flex flex-col gap-3 md:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search case studies by title or summary..."
                      value={search}
                      onChange={event => setSearch(event.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-12 text-[#05314a] transition-all focus:outline-none"
                    />
                    {search ? (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 transition-colors hover:bg-gray-100"
                        aria-label="Clear search"
                      >
                        <X className="h-4 w-4 text-gray-400" />
                      </button>
                    ) : null}
                  </div>
                  <select
                    aria-label="Investment amount"
                    value={band}
                    onChange={event => setBand(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[#05314a] transition-all focus:outline-none md:w-64"
                  >
                    <option value="">Any Investment Amount</option>
                    {INVESTMENT_BANDS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {filtered ? (
                    <button
                      type="button"
                      onClick={clear}
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[#05314a] transition-colors hover:bg-gray-50 md:w-auto"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
                {filtered ? (
                  <div className="mt-2 text-center text-sm text-gray-500">
                    Showing {items.length} result{items.length !== 1 ? "s" : ""}
                    {needle ? ` for "${search.trim()}"` : ""}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {items.length === 0 && filtered ? (
            <div className="rounded-xl border border-gray-100 bg-white py-12 text-center">
              <Search className="mx-auto mb-4 h-12 w-12 text-gray-300" />
              <h3 className="mb-2 text-lg font-medium text-gray-600">No results found</h3>
              <p className="text-gray-500">Try adjusting your search terms or browse all case studies</p>
              <button
                type="button"
                onClick={clear}
                className="mt-4 rounded-lg bg-[#05314a] px-4 py-2 text-white transition-colors"
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {items.map((item: any) => (
                <LiveCaseStudyListCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>
      <FinancialDisclaimer />
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

function DraftPreviewBanner({ status, what }: { status?: string | null; what: string }) {
  if (!status || status === "published") return null;
  return (
    <div className="bg-amber-100 px-4 py-2.5 text-center text-sm font-medium text-amber-900">
      Draft preview. Only signed-in Savvy team members can see this {what}. Set it to Published in
      SavvyOS to make it live.
    </div>
  );
}

function CaseStudyDetailPage({ slug }: { slug: string }) {
  const query = trpc.website.publicCaseStudy.useQuery({ slug });
  // "More from" the agent: their live listings, from the (small) public list.
  const others = trpc.website.publicProperties.useQuery(undefined, { staleTime: 5 * 60_000 });
  const item: any = query.data;
  usePageTitle(item?.title || "Case Study");
  useRecordArticleView("case_study", item?.id);
  if (query.isLoading) return <LoadingPage />;
  if (!item) return <NotFoundPage />;
  const agentName = item.agentName || null;
  const agentProfile = item.agentSlug ? path(`/agents/${item.agentSlug}`) : null;
  const invested = item.investmentAmount != null && Number(item.investmentAmount) > 0 ? Number(item.investmentAmount) : null;
  const metrics = [
    [item.primaryMetricLabel, item.primaryMetricValue],
    [item.secondaryMetricLabel, item.secondaryMetricValue],
  ].filter(([label, value]) => label && value) as Array<[string, string]>;
  const published = item.publishedAt ? new Date(item.publishedAt) : null;
  const theirListings = ((others.data as any[]) || [])
    .filter(other => item.agentSlug && other.assignedAgentSlug === item.agentSlug)
    .slice(0, 3);
  // Laid out like the live case study page.
  return (
    <Shell>
      <DraftPreviewBanner status={item.contentStatus} what="case study" />
      <div className="min-h-screen bg-white">
        <div className="border-b bg-white">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="text-center">
              <h1 className="mb-4 text-3xl font-bold text-[#05314a] md:text-5xl">{item.title}</h1>
              {item.excerpt ? <p className="mx-auto max-w-2xl text-xl">{item.excerpt}</p> : null}
            </div>
          </div>
        </div>

        {item.heroImageUrl ? (
          <div className="relative h-64 bg-gray-200 sm:h-96">
            <img src={item.heroImageUrl} alt={item.title} className="h-full w-full object-cover" />
          </div>
        ) : null}

        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {invested || metrics.length ? (
                <div className="mb-8 rounded-xl border p-6">
                  <h2 className="mb-6 text-2xl font-bold">Investment Overview</h2>
                  {invested ? (
                    <div className="mb-6 grid gap-6 md:grid-cols-2">
                      <div className="flex justify-between rounded-lg border bg-white p-4">
                        <span>Investment Amount</span>
                        <span className="text-xl font-bold text-[#05314a]">{money(invested)}</span>
                      </div>
                    </div>
                  ) : null}
                  {metrics.length ? (
                    <div className="grid gap-6 md:grid-cols-3">
                      {metrics.map(([label, value], index) => (
                        <div key={label} className="rounded-lg border bg-white p-4 text-center">
                          <div className={`text-2xl font-bold ${index === 0 ? "text-[#10c0df]" : "text-[#05314a]"}`}>{value}</div>
                          <div className="text-sm">{label}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {item.body ? (
                <div className="relative mb-8 overflow-hidden rounded-2xl border bg-gradient-to-br from-white via-white to-transparent p-5 shadow-lg sm:p-8">
                  <div className="relative">
                    <div className="mb-6 flex items-center gap-3">
                      <div className="hidden h-1 w-12 rounded-full sm:block" />
                      <h2 className="text-2xl font-bold text-[#05314a] sm:text-3xl">Details</h2>
                    </div>
                    <div className="prose max-w-none prose-headings:text-[#05314a] prose-a:text-[#10c0df]">
                      <ArticleBody markdown={item.body} />
                    </div>
                  </div>
                </div>
              ) : null}

              {agentName && (item.agentBookingUrl || agentProfile) ? (
                <div className="mt-8">
                  <a
                    href={item.agentBookingUrl || agentProfile}
                    {...(item.agentBookingUrl ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="inline-block rounded-[6px] bg-[#05314a] px-7 py-3.5 text-base font-semibold text-white no-underline transition-opacity hover:opacity-90"
                  >
                    Book a Call with {agentName}
                  </a>
                </div>
              ) : null}

              {theirListings.length > 0 && agentName ? (
                <div className="mb-8 mt-8">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="flex items-center text-2xl font-bold text-gray-900">
                      <Home className="mr-2 h-5 w-5" />
                      More from {agentName}
                    </h2>
                    <a href={path("/properties")} className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium hover:bg-[#f5f5f5]">
                      View all properties <ArrowRight className="ml-1 h-4 w-4" />
                    </a>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    {theirListings.map((listing: any) => (
                      <LivePropertyCard key={listing.id} item={listing} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <aside className="no-scrollbar order-first lg:order-none lg:col-span-1 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto">
              <a
                href={path("/case-studies")}
                className="mb-4 inline-flex items-center gap-2 text-sm text-[#05314a] transition-colors hover:text-[#10c0df]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Case Studies
              </a>

              {agentName ? (
                <div className="mb-4 rounded-xl border bg-white p-4">
                  <a href={agentProfile || "#"} className="group flex flex-col items-center text-center transition-opacity hover:opacity-80 lg:flex-row lg:text-left">
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-gray-200 transition-colors group-hover:border-[#05314a]">
                      {item.agentImageUrl ? (
                        <img src={item.agentImageUrl} alt={agentName} className="h-full w-full object-cover object-[center_20%]" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <UserRound className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="mt-2 min-w-0 lg:ml-3 lg:mt-0">
                      <p className="truncate font-semibold leading-tight text-[#05314a] transition-colors group-hover:text-[#10c0df]">{agentName}</p>
                      <p className="text-xs">STR Investment Specialist</p>
                    </div>
                  </a>
                  {item.agentEmail || item.agentPhone ? (
                    <div className="mt-3 flex flex-col items-center space-y-1.5 border-t pt-3 lg:items-stretch">
                      {item.agentEmail ? (
                        <a href={`mailto:${item.agentEmail}`} className="flex items-center gap-2 text-sm transition-colors hover:text-[#10c0df]">
                          <Mail className="h-4 w-4 shrink-0 text-[#10c0df]" />
                          <span className="truncate">{item.agentEmail}</span>
                        </a>
                      ) : null}
                      {item.agentPhone ? (
                        <a href={`tel:${String(item.agentPhone).replace(/[^+\d]/g, "")}`} className="flex items-center gap-2 text-sm transition-colors hover:text-[#10c0df]">
                          <Phone className="h-4 w-4 shrink-0 text-[#10c0df]" />
                          <span className="truncate">{item.agentPhone}</span>
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                  {agentProfile ? (
                    <a href={agentProfile} className="mt-3 block text-center text-sm font-medium text-[#10c0df] transition-colors hover:text-[#05314a]">
                      View Profile
                    </a>
                  ) : null}
                </div>
              ) : null}

              <div className="mb-4">
                <LeadForm
                  agentUserId={item.agentUserId || undefined}
                  propertyId={item.propertyId || undefined}
                  intent="property"
                  title={agentName ? `Ask ${String(agentName).split(" ")[0]} about this deal` : "Ask Savvy about this story"}
                  message={`I'd like to learn more about the strategy behind ${item.title}.`}
                />
              </div>

              {invested || metrics.length || published ? (
                <div className="hidden rounded-xl border bg-white p-6 lg:block">
                  <h3 className="mb-4 text-lg font-bold">Quick Stats</h3>
                  <div className="space-y-3 text-sm">
                    {invested ? (
                      <div className="flex justify-between">
                        <span>Investment</span>
                        <span className="font-medium">{money(invested)}</span>
                      </div>
                    ) : null}
                    {metrics.map(([label, value], index) => (
                      <div key={label} className="flex justify-between">
                        <span>{label}</span>
                        <span className={`font-medium ${index === 0 ? "text-[#10c0df]" : ""}`}>{value}</span>
                      </div>
                    ))}
                    {published && !Number.isNaN(published.getTime()) ? (
                      <div className="flex justify-between border-t pt-3">
                        <span>Published</span>
                        <span className="font-medium">{published.toLocaleDateString()}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        </div>
        <FinancialDisclaimer />
      </div>
    </Shell>
  );
}

function ResourcesPage() {
  const heading = useListHeading("resources");
  const [search, setSearch] = useQueryParam("search");
  const [category, setCategory] = useQueryParam("category");
  const [tagParam, setTagParam] = useQueryParam("tags");
  const [filterOpen, setFilterOpen] = useState(false);
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
  const categories = Array.from(categoryCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
  const tags = popularTags(all);
  const tagName = (key: string) => tags.find(tag => tag.key === key)?.label || key;

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
  const activeFilterCount = (category ? 1 : 0) + chosenTags.length;
  const clear = () => {
    setSearch("");
    setCategory("");
    setTagParam("");
    setFilterOpen(false);
  };
  const featured = items.filter(item => item.isFeatured);
  const regular = items.filter(item => !item.isFeatured);
  const tab = (active: boolean) =>
    `flex-shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
      active ? "bg-[#05314a] text-white shadow-[0_2px_6px_0_rgba(5,49,74,0.18)]" : "bg-gray-100 text-gray-600"
    }`;
  const SubHeading = ({ children }: { children: React.ReactNode }) => (
    <h2 className="mb-5 flex items-center gap-2.5 text-lg font-semibold text-gray-800">
      <span className="inline-block h-5 w-1 flex-shrink-0 rounded-full bg-[#10c0df]" />
      {children}
    </h2>
  );

  // Laid out like the live /resources page.
  return (
    <Shell>
      <div className="min-h-screen bg-[#f8f9fb]">
        <div className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-2 flex items-center gap-2 text-sm text-gray-500">
              <a href={path()} className="transition-colors hover:text-gray-900">
                Home
              </a>
              <span>/</span>
              <span className="text-gray-900">Resources</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">{heading.heroTitle}</h1>
            {heading.heroSubtitle ? (
              <p className="mt-2 text-base text-gray-500 sm:text-lg">{heading.heroSubtitle}</p>
            ) : null}
          </div>
        </div>

        <div className="sticky top-16 z-30 border-b border-gray-200 bg-white shadow-[0_1px_8px_0_rgba(5,49,74,0.07)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 py-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  placeholder="Search articles, topics, tags…"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 pl-10 pr-10 text-sm outline-none transition-all focus:border-[#10c0df]"
                />
                {search ? (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              {categories.length > 0 || tags.length > 0 ? (
                <div className="relative flex-shrink-0">
                  <button
                    type="button"
                    aria-expanded={filterOpen}
                    onClick={() => setFilterOpen(open => !open)}
                    className={`flex h-10 select-none items-center gap-2 whitespace-nowrap rounded-lg border px-4 text-sm font-medium transition-all ${
                      activeFilterCount > 0
                        ? "border-[#10c0df] bg-[#10c0df] text-white"
                        : "border-gray-300 bg-white text-[#05314a]"
                    }`}
                  >
                    <SlidersHorizontal className="h-4 w-4 flex-shrink-0" />
                    <span className="hidden sm:inline">Filter</span>
                    {activeFilterCount > 0 ? (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/30 px-1 text-xs font-bold text-white">
                        {activeFilterCount}
                      </span>
                    ) : null}
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${filterOpen ? "rotate-180" : ""}`} />
                  </button>
                  {filterOpen ? (
                    <div className="absolute right-0 z-50 mt-2 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-gray-100 bg-white shadow-[0_8px_32px_0_rgba(5,49,74,0.14)]">
                      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                        <span className="text-sm font-semibold text-[#05314a]">Filters</span>
                        {activeFilterCount > 0 ? (
                          <button type="button" onClick={clear} className="text-xs font-medium text-[#10c0df] hover:underline">
                            Clear all
                          </button>
                        ) : null}
                      </div>
                      <div className="max-h-[65vh] overflow-y-auto">
                        {categories.length > 0 ? (
                          <div className="border-b border-gray-100 px-4 py-3">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Category</p>
                            <div className="space-y-0.5">
                              {["", ...categories].map(name => {
                                const active = category === name;
                                return (
                                  <button
                                    key={name || "all"}
                                    type="button"
                                    onClick={() => setCategory(active && name ? "" : name)}
                                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                                      active ? "bg-[color-mix(in_oklab,#10c0df_10%,white)] font-semibold text-[#05314a]" : "text-gray-700"
                                    }`}
                                  >
                                    <span>{name || "All categories"}</span>
                                    {active ? <Check className="h-4 w-4 flex-shrink-0 text-[#10c0df]" /> : null}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                        {tags.length > 0 ? (
                          <div className="px-4 py-3">
                            <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">Tags</p>
                            <div className="flex flex-wrap gap-2">
                              {tags.map(tag => {
                                const active = chosenTags.includes(tag.key);
                                return (
                                  <button
                                    key={tag.key}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => toggleTag(tag.key)}
                                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                                      active ? "border-[#10c0df] bg-[#10c0df] text-white" : "border-gray-200 bg-gray-50 text-gray-700"
                                    }`}
                                  >
                                    {active ? <Check className="h-3 w-3 flex-shrink-0" /> : null}
                                    {tag.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div className="border-t border-gray-100 px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setFilterOpen(false)}
                          className="h-9 w-full rounded-lg bg-[#05314a] text-sm font-semibold text-white transition-opacity hover:opacity-90"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            {categories.length > 0 ? (
              <div className="relative flex items-center border-t border-gray-100 py-1">
                <div className="no-scrollbar flex w-full select-none items-center gap-1.5 overflow-x-auto py-1.5">
                  <button type="button" className={tab(!category)} onClick={() => setCategory("")}>
                    All
                  </button>
                  {categories.map(name => (
                    <button
                      key={name}
                      type="button"
                      className={tab(category === name)}
                      onClick={() => setCategory(category === name ? "" : name)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {filtered ? (
          <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center gap-2">
              {needle ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                  <Search className="h-3 w-3 flex-shrink-0" />
                  &ldquo;{search.trim()}&rdquo;
                  <button type="button" aria-label="Remove search filter" onClick={() => setSearch("")} className="ml-0.5 hover:text-gray-900">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ) : null}
              {category ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,#05314a_8%,white)] px-3 py-1 text-xs font-medium text-[#05314a]">
                  {category}
                  <button type="button" aria-label="Remove category filter" onClick={() => setCategory("")} className="ml-0.5 transition-opacity hover:opacity-70">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ) : null}
              {chosenTags.map(key => (
                <span
                  key={key}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,#10c0df_12%,white)] px-3 py-1 text-xs font-medium text-[#05314a]"
                >
                  {tagName(key)}
                  <button type="button" aria-label={`Remove tag filter: ${tagName(key)}`} onClick={() => toggleTag(key)} className="ml-0.5 transition-opacity hover:opacity-70">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <button type="button" onClick={clear} className="text-xs font-medium text-[#10c0df] transition-colors hover:underline">
                Clear all
              </button>
            </div>
          </div>
        ) : null}

        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white py-20 text-center shadow-[0_1px_4px_0_rgba(5,49,74,0.05)]">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[color-mix(in_oklab,#10c0df_10%,white)]">
                <Search className="h-6 w-6 text-[#10c0df]" />
              </div>
              <p className="font-medium text-gray-700">No articles match your filters.</p>
              <p className="mt-1 text-sm text-gray-400">Try adjusting your search or filter criteria.</p>
              <button
                type="button"
                onClick={clear}
                className="mt-5 rounded-lg bg-[#05314a] px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Clear filters
              </button>
            </div>
          ) : filtered ? (
            <div>
              <SubHeading>Results ({items.length})</SubHeading>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {items.map((item: any) => (
                  <LiveArticleCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-10">
              {featured.length > 0 ? (
                <div>
                  <SubHeading>Featured</SubHeading>
                  <div className="grid gap-6 md:grid-cols-2">
                    {featured.map((item: any) => (
                      <LiveArticleCard key={item.id} item={item} featured />
                    ))}
                  </div>
                </div>
              ) : null}
              {regular.length > 0 ? (
                <div>
                  {featured.length > 0 ? <SubHeading>Latest Articles</SubHeading> : null}
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {regular.map((item: any) => (
                      <LiveArticleCard key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

function ResourceDetailPage({ slug }: { slug: string }) {
  const query = trpc.website.publicPost.useQuery({ slug });
  // "Keep reading": other articles, from the (small) public list.
  const all = trpc.website.publicPosts.useQuery(undefined, { staleTime: 5 * 60_000 });
  const [copied, setCopied] = useState(false);
  const [ctaDismissed, setCtaDismissed] = useState(false);
  const item: any = query.data;
  usePageTitle(item?.title || "Resource");
  useRecordArticleView("post", item?.id);
  if (query.isLoading) return <LoadingPage />;
  if (!item) return <NotFoundPage />;
  const authorName = item.authorName || "Savvy Team";
  const tags = cleanTags(item.tags);
  const minutes = Math.max(1, Math.ceil(String(item.body || "").length / 1000));
  const published = item.publishedAt ? new Date(item.publishedAt) : null;
  const url = `${window.location.origin}${path(`/resources/${item.slug}`)}`;
  const related = ((all.data as any[]) || [])
    .filter(post => post.slug !== item.slug)
    .sort((a, b) => Number(b.category === item.category) - Number(a.category === item.category))
    .slice(0, 3);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused; the address bar still has the link.
    }
  };
  // Laid out like the live article page.
  return (
    <Shell>
      <DraftPreviewBanner status={item.contentStatus} what="post" />
      <div className="min-h-screen bg-white">
        <div className="border-b border-gray-200">
          <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 text-sm">
              <a href={path()} className="text-gray-600 hover:text-gray-900">
                Home
              </a>
              <span className="text-gray-400">/</span>
              <a href={path("/resources")} className="text-gray-600 hover:text-gray-900">
                Resources
              </a>
            </div>
          </div>
        </div>

        <article className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          <header className="mb-8">
            {item.category || tags.length ? (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {item.category ? (
                  <span className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium text-[#05314a]">
                    {item.category}
                  </span>
                ) : null}
                {tags.map(tag => (
                  <a
                    key={tag}
                    href={`${path("/resources")}?tags=${encodeURIComponent(tagKey(tag))}`}
                    className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600"
                  >
                    {tag}
                  </a>
                ))}
              </div>
            ) : null}
            <h1 className="mb-4 text-3xl font-bold leading-tight text-gray-900 sm:text-4xl lg:text-5xl">{item.title}</h1>
            <div className="mb-6 flex flex-wrap items-center gap-4 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                {item.authorImageUrl ? (
                  <img src={item.authorImageUrl} alt={authorName} className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
                    <span className="text-sm text-gray-500">{authorName.charAt(0).toUpperCase()}</span>
                  </div>
                )}
                <span className="font-medium text-gray-700">{authorName}</span>
              </div>
              {published && !Number.isNaN(published.getTime()) ? (
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>{published.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
                </div>
              ) : null}
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span>{minutes} min read</span>
              </div>
            </div>
            {item.coverImageUrl ? (
              <div className="relative mb-8 aspect-video overflow-hidden rounded-xl bg-gray-100">
                <img src={item.coverImageUrl} alt={item.title} className="h-full w-full object-cover" />
              </div>
            ) : null}
          </header>

          <ArticleBody
            markdown={item.body || ""}
            className="prose prose-lg prose-gray max-w-none prose-headings:text-gray-900 prose-h2:mb-4 prose-h2:mt-8 prose-h2:text-2xl prose-h2:font-bold prose-h3:mb-3 prose-h3:mt-6 prose-h3:text-xl prose-h3:font-semibold prose-p:mb-4 prose-p:leading-relaxed prose-p:text-gray-700 prose-a:text-[#05314a] prose-a:underline prose-a:underline-offset-4 prose-strong:text-gray-900 prose-li:mb-2 prose-li:text-gray-700 prose-blockquote:border-l-4 prose-blockquote:border-[#05314a] prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-gray-600 prose-img:my-6 prose-img:h-auto prose-img:w-full prose-img:rounded-lg"
          />

          <div className="mt-12 border-t border-gray-200 pt-8">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2 text-gray-600">
                <Share2 className="h-5 w-5" />
                <span className="font-medium">Share this article</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={copyLink}
                  className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-green-500" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4" />
                      Copy Link
                    </>
                  )}
                </button>
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(item.title)}&url=${encodeURIComponent(url)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-[#1DA1F2] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1a8cd8]"
                >
                  Share on X
                </a>
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-[#0A66C2] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0958a8]"
                >
                  LinkedIn
                </a>
              </div>
            </div>
          </div>

          {item.authorName ? (
            <div className="mt-12 rounded-xl bg-gray-50 p-6">
              <div className="flex items-start gap-4">
                {item.authorImageUrl ? (
                  <img src={item.authorImageUrl} alt={authorName} className="h-16 w-16 flex-shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-gray-200">
                    <span className="text-xl text-gray-500">{authorName.charAt(0).toUpperCase()}</span>
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="mb-1 font-semibold text-gray-900">Written by {authorName}</h3>
                  <a href={path("/agents")} className="inline-flex items-center text-sm font-medium text-[#05314a] hover:underline">
                    Meet our agents
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>
          ) : null}
        </article>

        {related.length > 0 ? (
          <section className="mx-auto mt-12 max-w-4xl px-4 sm:px-6 lg:px-8">
            <h2 className="mb-6 text-2xl font-bold text-gray-900">Keep reading</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {related.map((post: any) => (
                <a
                  key={post.id}
                  href={path(`/resources/${post.slug}`)}
                  className="group overflow-hidden rounded-xl border border-gray-200 transition-shadow hover:shadow-md"
                >
                  <div className="relative aspect-[2/1] overflow-hidden bg-gray-100">
                    {post.coverImageUrl ? (
                      <img
                        src={post.coverImageUrl}
                        alt={post.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <BookOpen className="h-8 w-8 text-gray-300" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    {post.category ? <p className="mb-1 text-xs font-medium text-[#10c0df]">{post.category}</p> : null}
                    <h3 className="line-clamp-2 text-sm font-semibold text-gray-900">{post.title}</h3>
                  </div>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {!ctaDismissed ? (
          <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0">
            <div className="flex items-center gap-3 rounded-full border border-gray-200 bg-white py-2 pl-5 pr-2 shadow-lg">
              <a href={accountPath.signUp} className="flex flex-1 items-center justify-between gap-2 text-sm font-semibold text-[#05314a]">
                Get STR deals in your inbox
                <ArrowRight className="h-4 w-4 shrink-0" />
              </a>
              <button
                type="button"
                onClick={() => setCtaDismissed(true)}
                aria-label="Dismiss"
                className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}

        <section className="mt-12 bg-gray-50 py-12">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <h2 className="mb-6 text-2xl font-bold text-gray-900">Explore More</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                [path("/resources"), BookOpen, "Browse All Articles", "More STR insights"],
                [path("/properties"), Home, "Browse Properties", "Find STR investments"],
                [path("/agents"), UserRound, "Search Agent Directory", "Connect with STR experts"],
              ].map(([href, Icon, title, sub]: any) => (
                <a key={title} href={href} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg">
                    <Icon className="h-6 w-6 text-[#05314a]" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{title}</p>
                    <p className="text-sm text-gray-500">{sub}</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
      </div>
    </Shell>
  );
}

/** A stroke icon from one or more SVG paths, as the live About page draws them. */
function StrokeIcon({ paths, className }: { paths: string[]; className: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      {paths.map(d => (
        <path key={d} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
      ))}
    </svg>
  );
}

const ICON = {
  check: ["M5 13l4 4L19 7"],
  pin: [
    "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z",
    "M15 11a3 3 0 11-6 0 3 3 0 016 0z",
  ],
  dollar: [
    "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  ],
  people: [
    "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
  ],
  bolt: ["M13 10V3L4 14h7v7l9-11h-7z"],
  trend: ["M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"],
  x: ["M6 18L18 6M6 6l12 12"],
  house: [
    "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  ],
  calc: [
    "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z",
  ],
  card: ["M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"],
  sparkle: ["M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"],
  map: [
    "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
  ],
  chart: [
    "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  ],
};

/**
 * About, as the live savvy-agents.com /about page, section for section.
 * Replaced by a published Website Studio page at the same address, when
 * there is one (see EditablePage).
 */
function AboutPage() {
  usePageTitle("Why Investors Work With Savvy STR Agents");
  const cta = "inline-block rounded-lg bg-[#10c0df] px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-[#43e8ff]";
  const benefits: Array<[string[], string, string]> = [
    [ICON.check, "Get Clear on What to Buy and Where", "We help you identify the best properties in the best markets for maximum returns."],
    [ICON.pin, "Choose the Right Market for Your Goals", "Whether mountains, beach, or wine country - we'll help you make the smartest move."],
    [ICON.dollar, "Skip the 30% Property Management Fees", "We'll show you how to self-manage efficiently and keep more profit."],
    [ICON.people, "Support from Trusted Local Partners", "Connect with vetted contractors, cleaners, and service providers in your market."],
    [ICON.bolt, "Launch in as Little as 30 Days", "Our proven process gets your rental live and earning fast."],
    [ICON.trend, "Turn Under-Performers into High-Earners", "Already own a property? We'll help you optimize it for better returns."],
  ];
  const mistakes: Array<[string[], string]> = [
    [ICON.x, "Overpaying in oversaturated areas"],
    [ICON.house, "Picking cookie-cutter properties that blend in"],
    [ICON.dollar, "Wasting money on updates that don't boost bookings"],
    [ICON.calc, "Miscalculating the real costs"],
    [ICON.card, "Losing profit to overpriced management fees"],
  ];
  const proof: Array<[string[], React.ReactNode]> = [
    [ICON.sparkle, <>We rank in the <strong>Top 10 at eXp Realty</strong> for short-term rental investment sales nationwide.</>],
    [ICON.dollar, <>Our clients' STRs generate an average of <strong>$100K per year</strong> in revenue.</>],
    [ICON.people, <>We lead a <strong>private network</strong> of serious STR hosts, operators, and owners.</>],
    [ICON.trend, <>We've sold more <strong>top 10 revenue-generating properties</strong> than any other team in our markets.</>],
    [ICON.map, <>Our proven playbook works across <strong>22+ top-performing STR markets</strong> in the U.S.</>],
    [ICON.chart, <>As an <strong>official AirDNA partner</strong>, our strategies are powered by the best data in the industry.</>],
  ];
  const steps: Array<[string, string]> = [
    ["Book Your Market Match Call", "We'll discuss your goals, budget, and ideal markets to find the perfect fit."],
    ["Property Sourcing", "We bring you high-return, design-forward deals... often before they hit the market."],
    ["Launch-Ready Setup", "Get your property furnished, photographed, and listed with our proven system."],
    ["Cash Flow Confidence", "Start earning with ongoing support from our community and team."],
  ];
  return (
    <Shell>
      <div className="min-h-screen bg-white">
        <section className="relative py-20 lg:py-32" style={{ background: "linear-gradient(135deg, #05314a 0%, #0b4966 55%, #10c0df 100%)" }}>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl text-center">
              <h1 className="mb-6 text-4xl font-bold text-white md:text-5xl lg:text-6xl">
                Invest Confidently in Short-Term Rentals
              </h1>
              <p className="mb-8 text-xl text-white/90 md:text-2xl">
                You Deserve a Real Estate Agent that Actually Understands Short Term Rentals.
              </p>
              <p className="mx-auto mb-10 max-w-3xl text-lg text-white/75">
                Not every agent understands short-term rentals. We do. We'll help you buy the right property, in the
                right market, with the right plan — so you cash flow faster and skip the rookie mistakes.
              </p>
              <a href={path("/contact")} className={cta}>
                Book My Free Market Match Call
              </a>
            </div>
          </div>
        </section>

        <section className="border-y bg-white py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-8 text-center md:grid-cols-3">
              {[
                ["$250M+", "In Closed STR Sales Volume"],
                ["500+", "Successful Airbnb Properties Launched"],
                ["$10M+", "In Annual Revenue Earned By Our Clients on Airbnb"],
              ].map(([value, label]) => (
                <div key={label}>
                  <div className="mb-2 text-5xl font-bold text-[#05314a] md:text-6xl">{value}</div>
                  <p className="text-lg text-gray-600">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-gray-50 py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {benefits.map(([icon, title, body]) => (
                <div key={title} className="rounded-xl bg-white p-8 shadow-sm transition-shadow hover:shadow-md">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[#05314a]">
                    <StrokeIcon paths={icon} className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="mb-3 text-xl font-bold text-[#05314a]">{title}</h3>
                  <p className="text-gray-600">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="mb-4 text-3xl font-bold text-[#05314a] md:text-4xl">Avoid the Rookie Mistakes</h2>
              <p className="mx-auto max-w-3xl text-xl text-gray-600">
                Don't let common pitfalls cost you thousands. We'll help you avoid these expensive errors.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5">
              {mistakes.map(([icon, text]) => (
                <div key={text} className="p-6 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                    <StrokeIcon paths={icon} className="h-6 w-6 text-red-600" />
                  </div>
                  <p className="font-semibold text-[#05314a]">{text}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 text-center">
              <a href={path("/contact")} className={cta}>
                Book My Free Market Match Call
              </a>
            </div>
          </div>
        </section>

        <section className="bg-gray-50 py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="mb-4 text-3xl font-bold text-[#05314a] md:text-4xl">We Understand the Short Term Rental Market</h2>
              <p className="mx-auto max-w-3xl text-xl text-gray-600">
                Short-term rental investing can feel overwhelming. We make it simple—with expert advice, a clear plan,
                and local pros who have your back.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {proof.map(([icon, text], index) => (
                <div key={index} className="rounded-lg bg-white p-6 shadow-sm">
                  <div className="flex items-start">
                    <div className="mr-3 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg">
                      <StrokeIcon paths={icon} className="h-5 w-5 text-[#10c0df]" />
                    </div>
                    <p className="text-gray-700">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-16 text-center">
              <h2 className="mb-4 text-3xl font-bold text-[#05314a] md:text-4xl">How It Works</h2>
              <p className="text-xl text-gray-600">
                We help you forecast returns, optimize operations, and join our private STR owner community.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
              {steps.map(([title, body], index) => (
                <div key={title} className="text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#10c0df] text-2xl font-bold text-white">
                    {index + 1}
                  </div>
                  <h3 className="mb-3 text-xl font-bold text-[#05314a]">{title}</h3>
                  <p className="text-gray-600">{body}</p>
                </div>
              ))}
            </div>
            <div className="mt-12 text-center">
              <a href={path("/contact")} className={cta}>
                Get Started Today
              </a>
            </div>
          </div>
        </section>

        <section className="bg-gray-50 py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">22+ Short-Term Rental Markets</div>
              <h2 className="mb-4 text-3xl font-bold text-[#05314a] md:text-4xl">
                We Work in Top Performing Rental Markets Across the Country
              </h2>
              <p className="mx-auto mb-8 max-w-3xl text-xl text-gray-600">
                Whether you're drawn to the mountains, beach, or wine country - We'll help you make the smartest move.
              </p>
              <a href={path("/markets")} className={cta}>
                EXPLORE MARKETS
              </a>
            </div>
          </div>
        </section>

        <section className="bg-[#05314a] py-20 text-white">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="mb-6 text-3xl font-bold md:text-4xl">Ready to Start Your STR Journey?</h2>
            <p className="mb-8 text-xl text-white/80">
              Book a free Market Match Call and discover how we can help you build a profitable short-term rental
              portfolio.
            </p>
            <a href={path("/contact")} className={cta}>
              Book My Call
            </a>
          </div>
        </section>
      </div>
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
    <Shell>
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

/** The live contact page's booking calendar: Savvy's Market Match call. */
const MARKET_MATCH_CALENDLY = "https://calendly.com/d/cx7n-jmt-7x5/market-match";

/**
 * Contact, as the live savvy-agents.com /contact page: the booking calendar
 * beside the pitch, three figures, why to book, and a direct-contact band.
 * Replaced by a published Website Studio page at the same address, when
 * there is one (see EditablePage).
 */
function ContactPage() {
  usePageTitle("Contact a Short-Term Rental Specialist");
  const { data: settings } = trpc.website.publicSettings.useQuery();
  const [calendarLoaded, setCalendarLoaded] = useState(false);
  const contactPhone = settings?.contactPhone || "(828) 407-1705";
  const contactEmail = settings?.contactEmail || "hello@savvy.realty";
  const tel = `tel:${contactPhone.replace(/[^+\d]/g, "")}`;
  // The visit's UTMs (this URL, else held from the landing page), or the
  // contact page fallback when there are none. Worked out once per page load.
  const calendarUtms = useMemo(
    () => new URLSearchParams(bookingUtmParams(captureVisitAttribution(), CONTACT_CALENDAR_FALLBACK_UTMS)).toString(),
    []
  );
  const calendarSrc = `${MARKET_MATCH_CALENDLY}?embed_type=Inline&embed_domain=${encodeURIComponent(window.location.hostname)}&primary_color=10c0df&${calendarUtms}`;
  const stats: Array<[any, string, string]> = [
    [DollarSign, "$250M+", "STRs Sold in 2024"],
    [Users, "294", "Investor Transactions"],
    [TrendingUp, "500%", "Highest CoC Return"],
  ];
  const reasons: Array<[any, string, string]> = [
    [LineChart, "Market Analysis", "Get insights on the best STR markets for your budget and goals"],
    [Search, "Investment Strategy", "Develop a personalized plan to maximize your returns"],
    [UserRound, "Agent Matching", "Connect with top-performing agents in your target market"],
    [ShieldCheck, "Due Diligence Support", "Learn what to look for when evaluating properties"],
  ];
  return (
    <Shell>
      <div className="min-h-screen bg-gray-50">
        <section className="relative overflow-hidden bg-[#05314a]">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(1100px 460px at 82% -10%, rgba(16,192,223,0.22), transparent 62%), radial-gradient(700px 420px at 4% 108%, rgba(16,192,223,0.10), transparent 60%)",
            }}
          />
          <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-16 sm:px-6 lg:px-8 lg:pb-32 lg:pt-20">
            <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
              <div className="text-center lg:col-span-6 lg:text-left">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white">
                  <Star className="h-3.5 w-3.5 text-[#10c0df]" />
                  Free Strategy Consultation
                </div>
                <h1 className="mt-6 text-4xl font-bold leading-[1.1] tracking-tight text-white md:text-5xl">
                  Ready to Start Your <span className="text-[#43e8ff]">STR Investment Journey?</span>
                </h1>
                <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-white/75 md:text-xl lg:mx-0">
                  Connect with our expert team and discover how we can help you build a profitable short-term rental
                  portfolio.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
                  {["No Obligation", "Expert Guidance", "Personalized Strategy"].map(point => (
                    <span
                      key={point}
                      className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white/90"
                    >
                      <CheckCircle className="h-4 w-4 text-[#10c0df]" />
                      {point}
                    </span>
                  ))}
                </div>
                <div className="mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 border-t border-white/15 pt-7 text-sm text-white/60 lg:justify-start">
                  <span>Prefer to talk now?</span>
                  <a href={tel} className="inline-flex items-center gap-2 font-semibold text-white transition-colors hover:text-[#43e8ff]">
                    <Phone className="h-4 w-4 text-[#10c0df]" />
                    {contactPhone}
                  </a>
                  <a href={`mailto:${contactEmail}`} className="inline-flex items-center gap-2 font-semibold text-white transition-colors hover:text-[#43e8ff]">
                    <Mail className="h-4 w-4 text-[#10c0df]" />
                    {contactEmail}
                  </a>
                </div>
              </div>

              <div className="lg:col-span-6">
                <div className="overflow-hidden rounded-3xl border border-white/50 bg-white shadow-2xl">
                  <div className="px-6 py-5" style={{ backgroundImage: "linear-gradient(to right, #05314a, #10c0df)" }}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white/20">
                        <Calendar className="h-5 w-5 text-white" />
                      </div>
                      <div className="text-left">
                        <div className="text-lg font-bold text-white">Book Your Strategy Call</div>
                        <div className="text-sm text-white/80">15-minute personalized consultation</div>
                      </div>
                    </div>
                  </div>
                  <div className="relative" style={{ minWidth: "320px", height: "700px" }}>
                    {!calendarLoaded && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white">
                        <div className="text-center">
                          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-b-2 border-[#05314a]" />
                          <div className="font-medium text-gray-600">Loading calendar...</div>
                        </div>
                      </div>
                    )}
                    <iframe
                      title="Book your strategy call"
                      src={calendarSrc}
                      onLoad={() => setCalendarLoaded(true)}
                      className="h-full w-full border-0"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-10 -mt-16 pb-4">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
              {stats.map(([Icon, value, label]) => (
                <div
                  key={label}
                  className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white px-7 py-7 shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundImage: "linear-gradient(to right, #10c0df, rgba(16,192,223,0))" }} />
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl">
                    <Icon className="h-5 w-5 text-[#10c0df]" />
                  </div>
                  <div className="mt-5 text-4xl font-bold leading-none tracking-tight tabular-nums text-[#05314a] md:text-[2.6rem]">{value}</div>
                  <div className="mt-2 text-sm font-medium text-gray-600">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 lg:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight text-[#05314a] md:text-4xl">Why Schedule a Call?</h2>
              <p className="mt-3 text-lg leading-relaxed text-gray-600">
                Our team of STR investment experts will help you navigate the market and find the perfect property for
                your goals.
              </p>
            </div>
            <div className="mt-9 grid gap-5 md:grid-cols-2">
              {reasons.map(([Icon, title, desc]) => (
                <div
                  key={title}
                  className="group flex items-start gap-5 rounded-2xl border border-gray-100 bg-white px-6 py-6 shadow-sm transition-all duration-200 hover:-translate-y-[3px] hover:shadow-lg"
                >
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-colors duration-200 group-hover:bg-[#10c0df]">
                    <Icon className="h-5 w-5 text-[#10c0df] transition-colors duration-200 group-hover:text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-[#05314a]">{title}</div>
                    <p className="mt-1 text-sm leading-relaxed text-gray-600">{desc}</p>
                  </div>
                  <ArrowRight className="h-5 w-5 flex-shrink-0 self-center text-gray-300 transition-all duration-200 group-hover:translate-x-1 group-hover:text-[#10c0df]" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pb-20 lg:pb-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div
              className="relative overflow-hidden rounded-3xl px-6 py-14 text-center shadow-xl sm:px-10 lg:px-14"
              style={{ backgroundImage: "linear-gradient(to bottom right, #05314a 0%, #0a4f6e 55%, #0d7f9c 100%)" }}
            >
              <div
                className="pointer-events-none absolute inset-0"
                style={{ backgroundImage: "radial-gradient(760px 320px at 88% 0%, rgba(67,232,255,0.25), transparent 60%)" }}
              />
              <div className="relative">
                <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Prefer to Reach Out Directly?</h2>
                <p className="mx-auto mt-4 max-w-xl text-white/80">
                  Our team is here to help. Send us an email or give us a call anytime.
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <a
                    href={tel}
                    className="inline-flex w-full items-center justify-center gap-3 rounded-full px-8 py-4 font-bold text-[#05314a] shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl sm:w-auto"
                    style={{ backgroundColor: "#43e8ff" }}
                  >
                    <Phone className="h-5 w-5" />
                    Call Us Today
                  </a>
                  <a
                    href={`mailto:${contactEmail}`}
                    className="inline-flex w-full items-center justify-center gap-3 rounded-full border border-white/20 bg-white/10 px-8 py-4 font-medium text-white backdrop-blur-sm transition-colors duration-200 hover:bg-white/20 sm:w-auto"
                  >
                    <Mail className="h-5 w-5" />
                    {contactEmail}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
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
/** A market's page address: /markets/<state>/<city>, like the old site. */
function marketCityKey(name: unknown) {
  return String(name || "").split(",")[0].trim().toLowerCase();
}
function marketSlug(name: unknown) {
  return marketCityKey(name)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function marketPath(market: { name: string; state?: string | null }) {
  const state = String(market.state || "us").toLowerCase();
  return path(`/markets/${encodeURIComponent(state)}/${marketSlug(market.name)}`);
}

/** Short price the way the old market pages print it: $550K, $1.1M. */
function marketPrice(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

function marketRooms(beds: unknown, baths: unknown) {
  const parts: string[] = [];
  if (beds != null && beds !== "") parts.push(`${Number(beds)} bd`);
  if (baths != null && baths !== "") parts.push(`${Number(baths).toFixed(1)} ba`);
  return parts.join(" · ");
}

/** An agent on a market page: photo, name, headline, two lines of bio. */
function MarketAgentCard({ item }: { item: any }) {
  return (
    <a
      href={path(`/agents/${item.slug}`)}
      className="block rounded-xl border border-[#e5e5e5] bg-white p-5 transition-shadow hover:shadow-md"
    >
      <div className="flex items-center gap-4">
        <img
          src={item.imageUrl || "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=160&q=80"}
          alt={item.name || "Agent"}
          className="h-20 w-20 shrink-0 rounded-full object-cover object-[center_20%]"
        />
        <div className="min-w-0">
          <h3 className="truncate text-lg font-medium text-[#05314a]">{item.name}</h3>
          {item.headline ? <p className="line-clamp-2 text-sm text-gray-700">{item.headline}</p> : null}
        </div>
      </div>
      {item.shortBio ? <p className="mt-4 line-clamp-2 text-[15px] leading-6 text-gray-800">{item.shortBio}</p> : null}
    </a>
  );
}

/** A listing on a market page: photo, address, place, price and rooms. */
function MarketPropertyCard({ item }: { item: any }) {
  const title = item.address || item.headline || "Investment Property";
  const place = [item.city, item.state].filter(Boolean).join(", ");
  return (
    <a
      href={path(`/properties/${item.slug}`)}
      className="block overflow-hidden rounded-xl border border-[#e5e5e5] bg-white transition-shadow hover:shadow-md"
    >
      <div className="h-56 bg-gray-100">
        <img
          src={item.heroImageUrl || "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80"}
          alt={title}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </div>
      <div className="p-5">
        <h3 className="truncate text-lg font-medium text-[#05314a]">{title}</h3>
        {place ? <p className="truncate text-[15px] text-gray-800">{place}</p> : null}
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-lg font-bold text-[#05314a]">{marketPrice(item.listPrice)}</span>
          <span className="text-sm text-gray-700">{marketRooms(item.beds, item.baths)}</span>
        </div>
      </div>
    </a>
  );
}

/**
 * One market, laid out like the old site's /markets/<state>/<city> pages: the
 * market name, "Agents in <city>" and "Properties in <city>", each with a View
 * all link. Agents are matched to the market by name, properties by the
 * market's ZIP territories (the same rule as the properties filter).
 */
function MarketDetailPage({ state, city }: { state: string; city: string }) {
  const directory = trpc.website.publicMarketDirectory.useQuery();
  const agentsQuery = trpc.website.publicAgents.useQuery();
  const market = (directory.data || []).find(
    (item: any) =>
      marketSlug(item.name) === city.toLowerCase() &&
      String(item.state || "us").toLowerCase() === state.toLowerCase()
  ) as any;
  const properties = trpc.website.publicProperties.useQuery(
    { marketId: market?.id },
    { enabled: !!market?.id }
  );
  const cityName = market ? String(market.name).split(",")[0].trim() : "";
  const place = market ? [cityName, market.state].filter(Boolean).join(", ") : "";
  usePageTitle(market ? `${place} Short-Term Rentals for Sale` : "Market");

  if (directory.isLoading || agentsQuery.isLoading) return <LoadingPage />;
  if (!market) {
    return (
      <Shell>
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h1 className="text-3xl font-bold text-[#05314a]">We couldn't find that market</h1>
          <p className="mt-3 text-gray-600">It may have moved. Every market we cover is on the markets page.</p>
          <a href={path("/markets")} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#05314a] px-5 py-3 font-semibold text-white">
            See all markets <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </Shell>
    );
  }

  const key = marketCityKey(market.name);
  const agents = ((agentsQuery.data || []) as any[]).filter(agent =>
    (Array.isArray(agent.markets) ? agent.markets : []).some((name: unknown) => marketCityKey(name) === key)
  );
  const agentMarketName =
    agents
      .flatMap((agent: any) => agent.markets || [])
      .find((name: unknown) => marketCityKey(name) === key) || market.name;
  const listings: any[] = properties.data || [];
  const viewAll = "inline-flex items-center gap-1 text-[15px] text-[#10c0df] hover:text-[#05314a]";

  return (
    <Shell>
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="mb-8 text-3xl font-bold text-[#05314a] md:text-4xl">{place}</h1>

          <section className="mb-14">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-2xl font-semibold text-[#05314a]">Agents in {cityName}</h2>
              <a href={`${path("/agents")}?market=${encodeURIComponent(String(agentMarketName))}`} className={viewAll}>
                View all <ArrowRight className="h-4 w-4" />
              </a>
            </div>
            {agents.length ? (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {agents.slice(0, 6).map((agent: any) => (
                  <MarketAgentCard key={agent.id} item={agent} />
                ))}
              </div>
            ) : (
              <p className="text-gray-600">
                No agents listed here yet. <a className="text-[#10c0df]" href={path("/contact")}>Talk to our team</a>.
              </p>
            )}
          </section>

          <section>
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-2xl font-semibold text-[#05314a]">Properties in {cityName}</h2>
              <a href={`${path("/properties")}?market=${market.id}`} className={viewAll}>
                View all <ArrowRight className="h-4 w-4" />
              </a>
            </div>
            {properties.isLoading ? (
              <p className="py-6 text-gray-500">Loading properties…</p>
            ) : listings.length ? (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {listings.slice(0, 9).map((item: any) => (
                  <MarketPropertyCard key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <p className="text-gray-600">
                No properties listed here right now.{" "}
                <a className="text-[#10c0df]" href={path("/contact")}>Ask a {cityName} agent</a> about what's coming up.
              </p>
            )}
          </section>
        </div>
        <FinancialDisclaimer />
      </div>
    </Shell>
  );
}

function MarketsPage() {
  const heading = useListHeading("markets");
  const markets = trpc.website.publicMarketDirectory.useQuery();
  const agents = trpc.website.publicAgents.useQuery();
  const items: any[] = markets.data || [];
  if (markets.isLoading) return <LoadingPage />;
  // Agents are tied to markets by name. Most markets have agents long before
  // they have a published listing, so a card leads with whichever it has
  // instead of saying "0 properties for sale".
  const marketKey = (name: unknown) => String(name || "").split(",")[0].trim().toLowerCase();
  const agentCounts = new Map<string, number>();
  for (const agent of (agents.data || []) as any[]) {
    for (const name of Array.isArray(agent.markets) ? agent.markets : []) {
      const key = marketKey(name);
      if (!key) continue;
      agentCounts.set(key, (agentCounts.get(key) || 0) + 1);
    }
  }
  // Grouped by state, states in alphabetical order, as on the live page.
  const byState = new Map<string, any[]>();
  for (const item of items) {
    const key = String(item.state || "Other");
    byState.set(key, [...(byState.get(key) || []), item]);
  }
  const states = Array.from(byState.entries()).sort((a, b) =>
    (US_STATE_NAMES[a[0]] || a[0]).localeCompare(US_STATE_NAMES[b[0]] || b[0])
  );
  // Laid out like the live /markets page.
  return (
    <Shell>
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h1 className="text-3xl font-bold text-[#05314a]">{heading.heroTitle}</h1>
            <p className="mx-auto mt-4 max-w-3xl text-lg">
              {items.length ? `${items.length} vetted ${items.length === 1 ? "market" : "markets"}. ` : ""}
              {heading.heroSubtitle}
            </p>
            <div className="mt-8">
              <a
                href={path("/contact")}
                className="inline-block rounded-lg bg-[#10c0df] px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-[#43e8ff]"
              >
                Get Matched with Your Ideal Market
              </a>
            </div>
          </div>

          {items.length === 0 ? (
            <p className="rounded-xl bg-gray-50 py-12 text-center">No markets available yet.</p>
          ) : (
            <div className="space-y-12">
              {states.map(([state, stateMarkets]) => (
                <section key={state}>
                  <div className="mb-6 flex items-center gap-3">
                    <h2 className="text-2xl font-bold text-[#05314a]">{US_STATE_NAMES[state] || state}</h2>
                    <span className="text-sm font-medium">
                      {stateMarkets.length} {stateMarkets.length === 1 ? "market" : "markets"}
                    </span>
                    <div className="h-px flex-1" />
                  </div>
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {stateMarkets.map((market: any) => (
                      <a
                        key={market.id}
                        href={marketPath(market)}
                        className="group rounded-xl border bg-white p-6 transition-all hover:shadow-md"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-colors">
                            <MapPin className="h-5 w-5 text-[#05314a] transition-colors group-hover:text-[#10c0df]" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-[#05314a] transition-colors group-hover:text-[#10c0df]">{market.name}</h3>
                          </div>
                          <ArrowRight className="mt-0.5 h-5 w-5 transition-all group-hover:translate-x-1 group-hover:text-[#10c0df]" />
                        </div>
                        <p className="mt-3 line-clamp-2 text-sm">
                          {[
                            market.propertyCount > 0
                              ? market.propertyCount === 1
                                ? "1 property for sale"
                                : `${market.propertyCount} properties for sale`
                              : null,
                            agentCounts.get(marketKey(market.name))
                              ? `${agentCounts.get(marketKey(market.name))} local ${agentCounts.get(marketKey(market.name)) === 1 ? "agent" : "agents"}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "Local agents ready to help"}
                        </p>
                      </a>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
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
/**
 * About, Contact and Join Our Team: the designed page, unless a CMS version at
 * the same address is published in the Website Studio. Setting that version
 * back to Draft brings the designed page back.
 */
function EditablePage({
  slug,
  designed,
}: {
  slug: string;
  designed: React.ReactNode;
}) {
  const query = trpc.website.publicPage.useQuery(
    { slug },
    { staleTime: 5 * 60_000 }
  );
  if (query.isLoading) return <LoadingPage />;
  if (query.data) return <ContentPageView page={query.data} />;
  return <>{designed}</>;
}

function ContentPage({ slug }: { slug: string }) {
  const query = trpc.website.publicPage.useQuery({ slug });
  if (query.isLoading) return <LoadingPage />;
  if (!query.data) return <NotFoundPage />;
  return <ContentPageView page={query.data} />;
}

function ContentPageView({ page }: { page: any }) {
  usePageTitle(page?.metaTitle || page?.name || "");
  // A line holding just [[contact-form]] becomes the real contact form, so a
  // rewritten Contact page still sends inquiries into SavvyOS.
  const parts = splitOnContactForm(page.bodyMarkdown || "");
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
          <div className="mx-auto max-w-3xl space-y-10 px-5">
            {parts.map((part, index) => (
              <div key={index} className="space-y-10">
                {part.trim() && (
                  <ArticleBody
                    markdown={part}
                    className="prose prose-slate max-w-none text-base leading-8 text-slate-700 prose-headings:text-[#05314a] prose-a:text-cyan-700 prose-img:rounded-2xl"
                  />
                )}
                {index < parts.length - 1 && (
                  <LeadForm
                    intent="general"
                    title="Talk with a Savvy STR specialist"
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </Shell>
  );
}

/**
 * Meet the Team, laid out like the live savvy-agents.com /team page: gradient
 * hero, the vision with the site's figures, core values, a closing call to
 * action. Three things differ on purpose. The people come from Website Studio >
 * Team (on the live page that section is hidden and holds one placeholder). The
 * figures are the same Website Studio stats the home page shows, not the live
 * page's "1000+ properties" and "100% satisfaction". And the live page's
 * invented testimonials, its timeline (which names the founder wrongly) and
 * its "coming soon" press cards are left out; real testimonials from the
 * Studio show instead, when there are any.
 */
const TEAM_STAT_ICONS = [Users, MapPin, Building2, Star];

const TEAM_VALUES: Array<[any, string, string]> = [
  [Target, "Mission-Driven", "We're on a mission to make short-term rental investing accessible to everyone, not just the wealthy few."],
  [Heart, "Client-First", "Every decision we make starts with one question: How does this benefit our clients and their investment goals?"],
  [TrendingUp, "Data-Informed", "We leverage market data and analytics to provide accurate projections and help investors make informed decisions."],
  [Award, "Excellence", "We hold ourselves to the highest standards, partnering only with top-performing agents in each market."],
];

function TeamMemberCard({ member }: { member: any }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg">
      <div className="relative aspect-[3/4] w-full bg-gray-100">
        {member.imageUrl ? (
          <img
            src={member.imageUrl}
            alt={member.name}
            loading="lazy"
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="flex size-32 items-center justify-center rounded-full [background-image:linear-gradient(to_bottom_right,#05314a,#10c0df)]">
              <span className="text-5xl font-bold text-white">{teamInitials(member.name)}</span>
            </div>
          </div>
        )}
      </div>
      <div className="p-6">
        <h3 className="mb-1 text-xl font-bold text-[#05314a]">{member.name}</h3>
        {member.title && <p className="mb-3 text-sm font-semibold text-[#10c0df]">{member.title}</p>}
        {member.bio && <p className="mb-4 whitespace-pre-line text-sm leading-relaxed text-gray-600">{member.bio}</p>}
        {(member.email || member.linkedinUrl) && (
          <div className="flex items-center gap-3 border-t border-gray-100 pt-3">
            {member.email && (
              <a
                href={`mailto:${member.email}`}
                className="rounded-full bg-gray-100 p-2 text-gray-700 transition-colors hover:bg-[#05314a] hover:text-white"
                title={`Email ${member.name}`}
                aria-label={`Email ${member.name}`}
              >
                <Mail className="h-4 w-4" />
              </a>
            )}
            {member.linkedinUrl && (
              <a
                href={member.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-700 transition-colors hover:bg-[#0077b5] hover:text-white"
                title={`${member.name} on LinkedIn`}
              >
                LinkedIn
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TeamPage() {
  usePageTitle("Meet the Team");
  const team = trpc.website.publicTeamMembers.useQuery();
  const agentList = trpc.website.publicAgents.useQuery();
  const { data: settings } = trpc.website.publicSettings.useQuery();
  const members = team.data ?? [];
  const agents: any[] = (agentList.data as any[]) ?? [];
  const stats: Array<{ value: string; label: string }> = Array.isArray(settings?.stats)
    ? (settings!.stats as Array<{ value: string; label: string }>).slice(0, 4)
    : [];
  const testimonials = publishedTestimonials(settings?.testimonials);
  return (
    <Shell>
      <div className="min-h-screen bg-white">
        <section className="relative flex min-h-[60vh] items-center overflow-hidden">
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(135deg, #05314A 0%, #0b4966 40%, #10C0DF 100%)" }}
          />
          <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="absolute -right-40 -top-40 h-80 w-80 rounded-full blur-3xl" style={{ backgroundColor: "rgba(67, 232, 255, 0.2)" }} />
            <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full blur-3xl" style={{ backgroundColor: "rgba(255, 255, 255, 0.1)" }} />
            <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" style={{ backgroundColor: "rgba(16, 192, 223, 0.2)" }} />
          </div>
          <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
            <div className="mx-auto max-w-4xl text-center">
              <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm font-semibold text-white">
                <Users className="h-4 w-4" />
                Meet the People Behind Savvy
              </div>
              <h1 className="mb-8 text-4xl font-bold leading-tight text-white md:text-5xl lg:text-7xl">
                We Believe in <br />
                <span style={{ color: "#43E8FF" }}>Building Wealth</span> Together
              </h1>
              <p className="mx-auto max-w-3xl text-xl leading-relaxed text-white/90 md:text-2xl">
                Behind every successful investment is an experienced team, dedicated to helping you achieve your
                financial goals through short-term rental properties.
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-4">
                <a
                  href={path("/contact")}
                  className="inline-flex items-center gap-2 rounded-full px-8 py-4 text-lg font-bold shadow-xl transition-all hover:scale-105"
                  style={{ backgroundColor: "#43E8FF", color: "#05314A" }}
                >
                  Get in Touch <ChevronRight className="h-5 w-5" />
                </a>
                <a
                  href={path("/properties")}
                  className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-8 py-4 text-lg font-bold text-white transition-all hover:bg-white/20"
                >
                  View Properties
                </a>
              </div>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0" aria-hidden="true">
            <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
              <path
                d="M0 120L60 110C120 100 240 80 360 70C480 60 600 60 720 65C840 70 960 80 1080 85C1200 90 1320 90 1380 90L1440 90V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0Z"
                fill="white"
              />
            </svg>
          </div>
        </section>

        {TEAM_SECTIONS.map(section => {
          const people = members.filter((member: any) => (member.section === "leadership" ? "leadership" : "staff") === section);
          if (!people.length) return null;
          return (
            <section key={section} className="bg-white py-14 lg:py-20">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mb-10 text-center">
                  <h2 className="text-3xl font-bold text-[#05314a] md:text-4xl">{TEAM_SECTION_LABELS[section]}</h2>
                  <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
                    {section === "leadership"
                      ? "The people leading Savvy STR Agents."
                      : "The Savvy team behind every deal, from first call to closing."}
                  </p>
                </div>
                <div
                  className={`mx-auto grid gap-8 md:grid-cols-2 lg:grid-cols-3 ${people.length === 1 ? "max-w-sm md:grid-cols-1 lg:grid-cols-1" : people.length === 2 ? "max-w-3xl lg:grid-cols-2" : "max-w-6xl"}`}
                >
                  {people.map((member: any) => (
                    <TeamMemberCard key={member.id ?? member.name} member={member} />
                  ))}
                </div>
              </div>
            </section>
          );
        })}

        {agents.length > 0 && (
          <section className="bg-white py-14 lg:py-20">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="mb-10 text-center">
                <h2 className="text-3xl font-bold text-[#05314a] md:text-4xl">Our Agents</h2>
                <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
                  {agents.length} short-term rental specialists, each in the market they know best.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {agents.map((agent: any) => {
                  const place = (Array.isArray(agent.markets) ? agent.markets : []).filter(Boolean).slice(0, 2).join(", ");
                  return (
                    <a
                      key={agent.id}
                      href={path(`/agents/${agent.slug}`)}
                      className="group flex flex-col items-center rounded-xl border border-gray-100 bg-white p-4 text-center shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="mb-3 h-24 w-24 overflow-hidden rounded-full border-2 border-gray-100 bg-gray-100">
                        {agent.imageUrl ? (
                          <img src={agent.imageUrl} alt={agent.name} loading="lazy" className="h-full w-full object-cover object-top" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xl font-bold text-[#05314a]">
                            {teamInitials(agent.name || "")}
                          </div>
                        )}
                      </div>
                      <p className="font-semibold leading-tight text-[#05314a] group-hover:text-[#10c0df]">{agent.name}</p>
                      {place ? <p className="mt-1 line-clamp-2 text-xs text-gray-500">{place}</p> : null}
                    </a>
                  );
                })}
              </div>
              <div className="mt-8 text-center">
                <a href={path("/agents")} className="inline-flex items-center gap-2 font-semibold text-[#05314a] hover:text-[#10c0df]">
                  Search agents by market <ChevronRight className="h-5 w-5" />
                </a>
              </div>
            </div>
          </section>
        )}

        <section className={`py-16 lg:py-24 ${members.length || agents.length ? "bg-gray-50" : "bg-white"}`}>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className={`grid items-center gap-12 ${stats.length ? "lg:grid-cols-2" : ""}`}>
              <div className={stats.length ? "" : "mx-auto max-w-3xl"}>
                <span className="text-sm font-semibold uppercase tracking-wider text-[#10c0df]">Our Vision</span>
                <h2 className="mb-6 mt-2 text-3xl font-bold text-[#05314a] md:text-4xl">
                  Democratizing Real Estate Investment
                </h2>
                <p className="mb-6 text-lg leading-relaxed text-gray-600">
                  At Savvy, we believe that everyone deserves access to wealth-building opportunities through real
                  estate. Short-term rentals have created incredible returns for investors, but finding the right
                  properties and agents has traditionally been reserved for those with insider connections.
                </p>
                <p className="mb-8 text-lg leading-relaxed text-gray-600">
                  We&apos;re changing that. By connecting investors with vetted, STR-specialized agents and providing
                  transparent data on property performance, we&apos;re making it possible for anyone to invest
                  confidently in short-term rentals.
                </p>
                <a
                  href={path("/contact")}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#05314a] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#0b4966]"
                >
                  Get Started <ChevronRight className="h-5 w-5" />
                </a>
              </div>
              {stats.length > 0 && (
                <div className="rounded-2xl p-8 lg:p-12">
                  <div className="grid grid-cols-2 gap-6">
                    {stats.map((stat, index) => {
                      const Icon = TEAM_STAT_ICONS[index] ?? Star;
                      return (
                        <div key={`${stat.label}-${index}`} className="text-center">
                          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-md">
                            <Icon className="h-6 w-6 text-[#05314a]" />
                          </div>
                          <div className="text-3xl font-bold text-[#05314a]">{stat.value}</div>
                          <div className="text-sm text-gray-600">{stat.label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className={`py-16 lg:py-24 ${members.length || agents.length ? "bg-white" : "bg-gray-50"}`}>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <span className="text-sm font-semibold uppercase tracking-wider text-[#10c0df]">What Drives Us</span>
              <h2 className="mt-2 text-3xl font-bold text-[#05314a] md:text-4xl">Our Core Values</h2>
            </div>
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
              {TEAM_VALUES.map(([Icon, title, body]) => (
                <div key={title} className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100 transition-shadow hover:shadow-lg">
                  <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-xl">
                    <Icon className="h-7 w-7 text-[#05314a]" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-[#05314a]">{title}</h3>
                  <p className="text-gray-600">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <LiveInvestorQuotes quotes={testimonials} />

        <section className="bg-[#10c0df] py-16 lg:py-20">
          <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="mb-4 text-3xl font-bold text-white md:text-4xl">Ready to Start Your Investment Journey?</h2>
            <p className="mx-auto mb-8 max-w-2xl text-xl text-white/80">
              Connect with our team and discover how Savvy can help you build wealth through short-term rentals.
            </p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <a
                href={path("/properties")}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-8 py-4 font-semibold text-[#05314a] transition-colors hover:bg-gray-100"
              >
                Browse Properties
              </a>
              <a
                href={path("/contact")}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#05314a] px-8 py-4 font-semibold text-white transition-colors hover:bg-[#0b4966]"
              >
                Schedule a Call
              </a>
            </div>
          </div>
        </section>
      </div>
    </Shell>
  );
}

/**
 * The Sell page's form. A seller becomes a SavvyOS contact through the same
 * submitLead every website form uses, with intent "sell": new contacts land in
 * the ISA queue as a New Lead tagged "Seller lead", and the property details
 * are written into the contact's notes. The rules live in
 * shared/websiteSellerLead.ts so they are tested.
 */
function SellerLeadForm({ phone, tel }: { phone: string; tel: string }) {
  const [values, setValues] = useState<SellerValues>(emptySellerValues());
  const [honeypot, setHoneypot] = useState("");
  const [touched, setTouched] = useState(false);
  const [sent, setSent] = useState(false);
  const submit = trpc.website.submitLead.useMutation({
    onSuccess: () => {
      trackWebsiteEvent({ event: "seller_lead_submitted", timeline: values.timeline || "" });
      setSent(true);
    },
    onError: error => toast.error(error.message || "Could not send your details"),
  });
  const set = (field: keyof SellerValues) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setValues(current => ({ ...current, [field]: event.target.value }));
  const errorFor = (field: SellerField) => (touched ? validateSellerField(field, values) : null);
  const fieldClass = (invalid: boolean) =>
    `mt-1 block h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm text-gray-900 shadow-xs outline-none placeholder:text-gray-400 focus-visible:ring-[3px] ${
      invalid
        ? "border-red-400 focus-visible:ring-red-200"
        : "border-gray-300 focus-visible:border-[#10c0df] focus-visible:ring-[#10c0df]/30"
    }`;
  const labelClass = "text-xs font-semibold uppercase tracking-wide text-gray-900";
  const errorText = (field: SellerField) =>
    errorFor(field) ? <p className="mt-1 text-xs text-red-600">{errorFor(field)}</p> : null;

  if (sent) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-lg">
        <h2 className="text-2xl font-bold text-[#05314a]">Thanks, that is all we need</h2>
        <p className="mt-3 leading-relaxed text-gray-600">
          An STR agent who knows your market will come back to you at{" "}
          <span className="font-semibold text-[#05314a]">{values.email}</span>, usually the same working day. There
          is nothing else for you to do.
        </p>
        <p className="mt-4 text-sm text-gray-500">
          If it is urgent, call{" "}
          <a href={tel} className="font-semibold text-[#10c0df] hover:underline">
            {phone}
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form
      id="seller-form"
      noValidate
      className="scroll-mt-24 rounded-2xl border border-gray-100 bg-white p-6 text-gray-900 shadow-lg sm:p-8"
      onSubmit={event => {
        event.preventDefault();
        setTouched(true);
        if (!canSubmitSeller(values)) return;
        submit.mutate({
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          email: values.email.trim(),
          phone: values.phone.trim(),
          message: buildSellerMessage(values),
          intent: "sell",
          sourcePath: window.location.pathname,
          attribution: formAttribution(),
          website: honeypot,
        });
      }}
    >
      <h2 className="text-2xl font-bold text-[#05314a]">Tell us about your rental</h2>
      <p className="mt-2 text-sm text-gray-600">A few fields, no obligation, and no call booked until you want one.</p>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="seller-address" className={labelClass}>Property address</label>
          <input
            id="seller-address"
            className={fieldClass(!!errorFor("address"))}
            value={values.address}
            onChange={set("address")}
            placeholder="412 Gulf Shore Dr, Destin, FL 32541"
            autoComplete="street-address"
            aria-invalid={!!errorFor("address")}
          />
          {errorText("address")}
        </div>
        <div>
          <label htmlFor="seller-first" className={labelClass}>First name</label>
          <input
            id="seller-first"
            className={fieldClass(!!errorFor("firstName"))}
            value={values.firstName}
            onChange={set("firstName")}
            autoComplete="given-name"
            aria-invalid={!!errorFor("firstName")}
          />
          {errorText("firstName")}
        </div>
        <div>
          <label htmlFor="seller-last" className={labelClass}>Last name</label>
          <input
            id="seller-last"
            className={fieldClass(!!errorFor("lastName"))}
            value={values.lastName}
            onChange={set("lastName")}
            autoComplete="family-name"
            aria-invalid={!!errorFor("lastName")}
          />
          {errorText("lastName")}
        </div>
        <div>
          <label htmlFor="seller-email" className={labelClass}>Email</label>
          <input
            id="seller-email"
            type="email"
            className={fieldClass(!!errorFor("email"))}
            value={values.email}
            onChange={set("email")}
            autoComplete="email"
            aria-invalid={!!errorFor("email")}
          />
          {errorText("email")}
        </div>
        <div>
          <label htmlFor="seller-phone" className={labelClass}>Phone</label>
          <input
            id="seller-phone"
            type="tel"
            className={fieldClass(!!errorFor("phone"))}
            value={values.phone}
            onChange={set("phone")}
            autoComplete="tel"
            aria-invalid={!!errorFor("phone")}
          />
          {errorText("phone")}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="seller-timeline" className={labelClass}>Timeline</label>
          <select
            id="seller-timeline"
            className={fieldClass(!!errorFor("timeline"))}
            value={values.timeline}
            onChange={set("timeline")}
            aria-invalid={!!errorFor("timeline")}
          >
            <option value="">Choose one</option>
            {SELLER_TIMELINES.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          {errorText("timeline")}
        </div>

        <div className="border-t border-gray-100 pt-5 sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Optional, but it makes the first call more useful
          </p>
        </div>
        <div>
          <label htmlFor="seller-bedrooms" className={labelClass}>Bedrooms</label>
          <input
            id="seller-bedrooms"
            inputMode="numeric"
            className={fieldClass(false)}
            value={values.bedrooms}
            onChange={set("bedrooms")}
          />
        </div>
        <div>
          <label htmlFor="seller-listed" className={labelClass}>Currently rented short term</label>
          <select id="seller-listed" className={fieldClass(false)} value={values.listed} onChange={set("listed")}>
            <option value="">Choose one</option>
            {SELLER_LISTED_OPTIONS.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="seller-revenue" className={labelClass}>Last 12 months revenue</label>
          <input
            id="seller-revenue"
            className={fieldClass(false)}
            value={values.revenue}
            onChange={set("revenue")}
            placeholder="Roughly is fine"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="seller-message" className={labelClass}>Anything else we should know</label>
          <textarea
            id="seller-message"
            rows={3}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-xs outline-none focus-visible:border-[#10c0df] focus-visible:ring-[3px] focus-visible:ring-[#10c0df]/30"
            value={values.message}
            onChange={set("message")}
          />
        </div>
        <input
          aria-hidden="true"
          tabIndex={-1}
          autoComplete="off"
          className="hidden"
          value={honeypot}
          onChange={event => setHoneypot(event.target.value)}
        />
      </div>

      <button
        type="submit"
        disabled={submit.isPending}
        className="mt-6 flex h-12 w-full items-center justify-center rounded-md bg-[#10c0df] text-base font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {submit.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Get my valuation"}
      </button>
      <p className="mt-3 text-center text-xs text-gray-500">
        We will never list your property publicly without your say so.
      </p>
    </form>
  );
}

const SELL_PROMISES = [
  "Discover your STR's true market value",
  "Unlock the hidden potential in your home's equity",
  "Learn how to leverage your STR's value with investors",
  "Connect with local market STR experts",
];

const SELL_DIFFERENCES: Array<[any, string, string]> = [
  [BarChart3, "Your buyer is an investor", "They price on what the property earns, not on the kitchen. A listing written for a family buyer leaves that money on the table."],
  [FileText, "Your numbers are the pitch", "Twelve months of revenue, occupancy and average nightly rate do more for the price than any photograph. We put them to work."],
  [CalendarCheck, "Forward bookings are an asset", "A calendar with reservations on it is income the buyer inherits. Handled properly it is a reason to pay more, not a complication."],
  [TrendingUp, "Timing is a decision, not a date", "Listing before or after your season changes both the price and how long it sits. That is worth ten minutes before you commit."],
];

const SELL_STEPS: Array<[string, string]> = [
  ["Send the details", "The address, your timeline, and whatever you know about last year. Two minutes."],
  ["We value it on the income", "An STR agent who works your market reads the revenue alongside the comparable sales, because investor buyers do."],
  ["You get a straight answer", "Sometimes that answer is that holding another season is worth more than selling now. We will say so."],
];

const SELL_FAQS: Array<[string, string]> = [
  ["Do I have to stop taking bookings?", "No. Keep renting exactly as you are. Forward reservations are usually an advantage in the sale, not something to clear out first."],
  ["Will my property be listed publicly straight away?", "No. Nothing is listed anywhere until you say so. Plenty of these conversations end with an owner deciding to hold, and that is a fine outcome."],
  ["What if I do not know last year's revenue?", "Send the address anyway. Most of what we need can be pulled from the market and your listing history, and the rest can wait for the first call."],
  ["Who actually handles the sale?", "Savvy Realty, our brokerage. Savvy STR Agents is where the market data and the agent network live; the listing agreement itself sits with the licensed brokerage. Your details go to the same team either way."],
];

/**
 * Sell, as the live savvy-agents.com /sell page: the promise beside the form,
 * three figures, why an STR sale is different, what happens next, a booking
 * calendar for anyone who would rather talk, the FAQ and a closing band.
 */
function SellPage() {
  usePageTitle("Sell Your Short-Term Rental");
  const { data: settings } = trpc.website.publicSettings.useQuery();
  const [calendarLoaded, setCalendarLoaded] = useState(false);
  const phone = settings?.contactPhone || "(828) 407-1705";
  const tel = `tel:${phone.replace(/[^+\d]/g, "")}`;
  const calendarSrc = `${MARKET_MATCH_CALENDLY}?embed_type=Inline&embed_domain=${encodeURIComponent(window.location.hostname)}&primary_color=10c0df`;
  const stats: Array<[any, string, string]> = [
    [DollarSign, "$250M+", "of STRs sold in 2024"],
    [Users, "294", "investor transactions in 2024"],
    [TrendingUp, "500%", "highest 2024 CoC return"],
  ];
  return (
    <Shell>
      <div className="min-h-screen bg-gray-50">
        <section className="relative overflow-hidden bg-[#05314a]">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(1100px 460px at 82% -10%, rgba(16,192,223,0.22), transparent 62%), radial-gradient(700px 420px at 4% 108%, rgba(16,192,223,0.10), transparent 60%)",
            }}
          />
          <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-16 sm:px-6 lg:px-8 lg:pb-32 lg:pt-20">
            <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-14">
              <div className="text-center lg:col-span-6 lg:text-left">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white">
                  For short-term rental owners
                </div>
                <h1 className="mt-6 text-4xl font-bold leading-[1.1] tracking-tight text-white md:text-5xl">
                  Thinking about selling <span className="text-[#43e8ff]">your STR?</span>
                </h1>
                <p className="mt-5 text-lg font-semibold text-[#10c0df] md:text-xl">
                  Let&rsquo;s talk strategy, not just sales.
                </p>
                <ul className="mx-auto mt-8 max-w-xl space-y-3 text-left lg:mx-0">
                  {SELL_PROMISES.map(promise => (
                    <li key={promise} className="flex items-start gap-3 text-white/85">
                      <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#10c0df]" />
                      <span className="leading-relaxed">{promise}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 border-t border-white/15 pt-7 text-sm text-white/60 lg:justify-start">
                  <span>Rather talk it through first?</span>
                  <a href={tel} className="inline-flex items-center gap-2 font-semibold text-white transition-colors hover:text-[#43e8ff]">
                    <Phone className="h-4 w-4 text-[#10c0df]" />
                    {phone}
                  </a>
                  <a href="#book" className="font-semibold text-white underline-offset-4 transition-colors hover:text-[#43e8ff] hover:underline">
                    Book a 15 minute call
                  </a>
                </div>
              </div>
              <div className="lg:col-span-6">
                <SellerLeadForm phone={phone} tel={tel} />
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-10 -mt-16 pb-4">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
              {stats.map(([Icon, value, label]) => (
                <div key={label} className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white px-7 py-7 shadow-lg">
                  <div className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundImage: "linear-gradient(to right, #10c0df, rgba(16,192,223,0))" }} />
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl">
                    <Icon className="h-5 w-5 text-[#10c0df]" />
                  </div>
                  <div className="mt-5 text-4xl font-bold leading-none tracking-tight text-[#05314a] tabular-nums md:text-[2.6rem]">
                    {value}
                  </div>
                  <div className="mt-2 text-sm font-medium text-gray-600">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 lg:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight text-[#05314a] md:text-4xl">Selling a rental is not selling a house</h2>
              <p className="mt-3 text-lg leading-relaxed text-gray-600">
                The buyer, the pitch and the timing are all different. Getting those four things right is most of the
                difference in the final number.
              </p>
            </div>
            <div className="mt-9 grid gap-5 md:grid-cols-2">
              {SELL_DIFFERENCES.map(([Icon, title, body]) => (
                <div key={title} className="flex items-start gap-5 rounded-2xl border border-gray-100 bg-white px-6 py-6 shadow-sm">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl">
                    <Icon className="h-5 w-5 text-[#10c0df]" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-[#05314a]">{title}</div>
                    <p className="mt-1 text-sm leading-relaxed text-gray-600">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pb-16 lg:pb-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold tracking-tight text-[#05314a] md:text-4xl">What happens after you send it</h2>
            <ol className="mt-9 grid gap-6 md:grid-cols-3">
              {SELL_STEPS.map(([title, body], index) => (
                <li key={title} className="border-t-2 border-[#10c0df] pt-5">
                  <div className="font-mono text-sm font-bold text-[#10c0df] tabular-nums">{String(index + 1).padStart(2, "0")}</div>
                  <div className="mt-2 text-lg font-bold text-[#05314a]">{title}</div>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="book" className="scroll-mt-24 pb-16 lg:pb-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-lg">
              <div className="px-6 py-5" style={{ backgroundImage: "linear-gradient(to right, #05314a, #10c0df)" }}>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white/20">
                    <CalendarCheck className="h-5 w-5 text-white" />
                  </div>
                  <div className="text-left">
                    <div className="text-lg font-bold text-white">Rather just book a call?</div>
                    <div className="text-sm text-white/80">15 minutes with an STR agent. Pick a time that suits you.</div>
                  </div>
                </div>
              </div>
              <div className="relative" style={{ minWidth: "320px", height: "700px" }}>
                {!calendarLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white">
                    <div className="text-center">
                      <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-b-2 border-[#05314a]" />
                      <div className="font-medium text-gray-600">Loading calendar...</div>
                    </div>
                  </div>
                )}
                <iframe
                  title="Book a call about selling"
                  src={calendarSrc}
                  loading="lazy"
                  onLoad={() => setCalendarLoaded(true)}
                  className="h-full w-full border-0"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="pb-16 lg:pb-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold tracking-tight text-[#05314a] md:text-4xl">Before you send it</h2>
            <dl className="mt-8 divide-y divide-gray-200 border-y border-gray-200">
              {SELL_FAQS.map(([question, answer]) => (
                <div key={question} className="py-6">
                  <dt className="font-bold text-[#05314a]">{question}</dt>
                  <dd className="mt-2 leading-relaxed text-gray-600">{answer}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="pb-20 lg:pb-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div
              className="relative overflow-hidden rounded-3xl px-6 py-14 text-center shadow-xl sm:px-10 lg:px-14"
              style={{ backgroundImage: "linear-gradient(to bottom right, #05314a 0%, #0a4f6e 55%, #0d7f9c 100%)" }}
            >
              <div
                className="pointer-events-none absolute inset-0"
                style={{ backgroundImage: "radial-gradient(760px 320px at 88% 0%, rgba(67,232,255,0.25), transparent 60%)" }}
              />
              <div className="relative">
                <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Find out what an investor would pay for it</h2>
                <p className="mx-auto mt-4 max-w-xl text-white/80">No obligation, nothing listed, and a straight answer either way.</p>
                <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <a
                    href="#seller-form"
                    className="inline-flex w-full items-center justify-center gap-3 rounded-full px-8 py-4 font-bold text-[#05314a] shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl sm:w-auto"
                    style={{ backgroundColor: "#43e8ff" }}
                  >
                    Send my property details
                  </a>
                  <a
                    href={tel}
                    className="inline-flex w-full items-center justify-center gap-3 rounded-full border border-white/20 bg-white/10 px-8 py-4 font-medium text-white transition-colors duration-200 hover:bg-white/20 sm:w-auto"
                  >
                    <Phone className="h-5 w-5" />
                    {phone}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
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
  if (relative === "/about")
    return <EditablePage slug="about" designed={<AboutPage />} />;
  if (relative === "/contact")
    return <EditablePage slug="contact" designed={<ContactPage />} />;
  if (relative === "/markets") return <MarketsPage />;
  if (segments[0] === "markets" && segments.length === 3)
    return <MarketDetailPage state={decodeURIComponent(segments[1])} city={decodeURIComponent(segments[2])} />;
  if (relative === "/team") return <TeamPage />;
  if (relative === "/sell") return <SellPage />;
  if (relative === "/join-our-team")
    return <EditablePage slug="join-our-team" designed={<JoinTeamPage />} />;
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
