import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
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
import {
  CALCULATOR_DEFAULTS,
  runCalculator,
} from "@/lib/investmentCalculator";
import {
  AccountMenu,
  AccountMobileLinks,
  EmailPreferencesBody,
  ForgotPasswordBody,
  LockedGroupPanel,
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
} from "@/components/website/liveSiteParts";

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
                comp.beds ? `${roomCount(comp.beds)} bed` : null,
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
  // too. Its "Meet the Team" goes to the agents page, as the old /team
  // address already does.
  const nav: Array<[string, string]> = [
    ["Properties", "/properties"],
    ["Our Agents", "/agents"],
    ["Case Studies", "/case-studies"],
  ];
  const aboutMenu: Array<[string, string]> = [
    ["About Savvy", "/about"],
    ["Meet the Team", "/agents"],
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
              <a
                className={linkClass}
                href="https://www.savvy.realty/sellers"
                target="_blank"
                rel="noreferrer"
              >
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
            <a
              className={mobileLinkClass}
              href="https://www.savvy.realty/sellers"
              target="_blank"
              rel="noreferrer"
            >
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
 */
function SiteFooter() {
  const legal = trpc.website.publicPage.useQuery({ slug: "legal" }, { staleTime: 10 * 60_000 });
  const privacy = trpc.website.publicPage.useQuery({ slug: "privacy" }, { staleTime: 10 * 60_000 });
  const account = useWebsiteAccount();
  const linkClass = "transition-colors hover:text-[#10c0df]";
  return (
    <footer className="mt-auto border-t bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-sm text-[#05314a]/70 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>© {new Date().getFullYear()} Savvy STR Agents. All rights reserved.</p>
        <nav className="flex flex-wrap gap-4">
          <a className={linkClass} href={path("/properties")}>Properties</a>
          <a className={linkClass} href={path("/markets")}>Markets</a>
          <a className={linkClass} href={path("/case-studies")}>Case Studies</a>
          <a className={linkClass} href={path("/resources")}>Resources</a>
          <a
            className={linkClass}
            href="https://www.savvy.realty/sellers"
            target="_blank"
            rel="noreferrer"
          >
            Sell Your STR
          </a>
          {legal.data && <a className={linkClass} href={path("/legal")}>Legal</a>}
          {privacy.data && <a className={linkClass} href={path("/privacy")}>Privacy Policy</a>}
          <a
            className={`flex items-center gap-1 ${linkClass}`}
            href={account.data ? accountPath.saved : accountPath.signIn}
          >
            <UserRound className="h-3.5 w-3.5" />
            My Account
          </a>
        </nav>
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
        <div className="absolute inset-0 bg-[#05314a]/40" />
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
                href="https://www.savvy.realty/sellers"
                target="_blank"
                rel="noreferrer"
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
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#43e8ff]/20">
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
            className="inline-flex items-center rounded-lg bg-[#43e8ff] px-8 py-4 text-lg font-bold text-[#05314a] shadow-lg transition-all hover:bg-[#43e8ff]/90 hover:shadow-xl"
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
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[160px] flex-1">
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
                <div className="min-w-[160px] flex-1">
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
              <div className="min-w-[130px]">
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
              <div className="min-w-[100px]">
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
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowMore(value => !value)}
                  className="inline-flex h-10 flex-1 items-center justify-center whitespace-nowrap rounded-xl border bg-white px-3 text-sm font-medium shadow-xs transition-all hover:bg-[#f5f5f5] sm:flex-initial"
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
                    className="inline-flex h-10 items-center whitespace-nowrap rounded-xl px-3 text-sm font-medium text-gray-500 transition-all hover:bg-[#f5f5f5]"
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
                  className="inline-flex h-10 flex-1 items-center justify-center whitespace-nowrap rounded-xl bg-[#171717] px-5 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#171717]/90 sm:flex-initial"
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
  // Full-screen photo viewer: the index of the photo open, or null.
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
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
    new Set(
      [item.heroImageUrl, ...(item.galleryImageUrls || [])].filter(Boolean)
    )
  );
  const highlights = Array.isArray(item.investmentHighlights)
    ? item.investmentHighlights
    : [];
  // Everything a free account unlocks on this page, shown once together.
  const lockedItems = [
    item.gated && "Projected revenue, cash-on-cash, cap rate and occupancy",
    evidence.data?.gated && "The revenue range and the comparable listings behind it",
    item.blurbGated && "The agent's own take on this property",
    item.gated && "The investment calculator, at your own down payment and rate",
  ].filter(Boolean) as string[];
  // Up to three other live listings, the same state first.
  const moreProperties = ((others.data as any[]) || [])
    .filter(other => other.slug !== item.slug)
    .sort(
      (a, b) =>
        Number(b.state === item.state) - Number(a.state === item.state)
    )
    .slice(0, 3);
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
          <div
            className={`relative mt-8 grid h-[440px] gap-3 overflow-hidden rounded-2xl ${
              gallery.length >= 3 ? "md:grid-cols-3" : gallery.length === 2 ? "md:grid-cols-2" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => gallery.length && setPhotoIndex(0)}
              className={`group relative h-full overflow-hidden ${gallery.length >= 3 ? "md:col-span-2" : ""}`}
              aria-label="Open photos"
            >
              <img
                src={gallery[0]}
                alt={`${item.address} exterior`}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
              />
            </button>
            {gallery.length === 2 && (
              <button
                type="button"
                onClick={() => setPhotoIndex(1)}
                className="group relative hidden h-full overflow-hidden md:block"
                aria-label="Open photo 2"
              >
                <img
                  src={gallery[1]}
                  alt={`${item.address} photo 2`}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                />
              </button>
            )}
            {gallery.length >= 3 && (
              <div className="hidden grid-rows-2 gap-3 md:grid">
                {[1, 2].map(index => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setPhotoIndex(index)}
                    className="group relative min-h-0 overflow-hidden"
                    aria-label={`Open photo ${index + 1}`}
                  >
                    <img
                      src={gallery[index]}
                      alt={`${item.address} photo ${index + 1}`}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                    />
                  </button>
                ))}
              </div>
            )}
            {gallery.length > 1 && (
              <button
                type="button"
                onClick={() => setPhotoIndex(0)}
                className="absolute bottom-4 right-4 flex items-center gap-2 rounded-lg bg-white/95 px-4 py-2 text-sm font-bold text-[#05314a] shadow-lg transition hover:bg-white"
              >
                <Images className="h-4 w-4" />
                View all {gallery.length} photos
              </button>
            )}
          </div>
        </div>
      </section>
      {photoIndex !== null && gallery.length > 0 && (
        <PhotoViewer
          photos={gallery as string[]}
          index={photoIndex}
          alt={item.address}
          onChange={setPhotoIndex}
          onClose={() => setPhotoIndex(null)}
        />
      )}
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
              <p className="mt-5 text-base leading-8 text-slate-600">
                {item.summary ||
                  "Connect with the assigned Savvy specialist for the complete opportunity review."}
              </p>
              <div className="mt-6 grid grid-cols-3 rounded-xl border bg-slate-50 p-4 text-center">
                <div>
                  <BedDouble className="mx-auto h-5 w-5 text-cyan-600" />
                  <p className="mt-1 font-bold">{roomCount(item.beds)}</p>
                  <p className="text-xs text-slate-500">Bedrooms</p>
                </div>
                <div>
                  <Bath className="mx-auto h-5 w-5 text-cyan-600" />
                  <p className="mt-1 font-bold">{roomCount(item.baths)}</p>
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
            <LockedGroupPanel items={lockedItems} />
            {item.gated ? null : (
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
            {evidence.data?.revenue && (
              <RevenueRangeSection
                revenue={evidence.data.revenue}
                comps={evidence.data.comps}
              />
            )}
            {item.blurbGated ? null : <AgentNote item={item} />}
            {item.gated ? null : <InvestmentCalculator item={item} />}
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
      {moreProperties.length > 0 && (
        <section className="border-t bg-white py-16">
          <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[.16em] text-cyan-600">
                  Keep exploring
                </p>
                <h2 className="mt-2 text-3xl font-bold text-[#05314a]">
                  More investment properties
                </h2>
              </div>
              <a
                href={path("/properties")}
                className="inline-flex items-center gap-2 text-sm font-bold text-[#05314a] hover:text-cyan-700"
              >
                See all properties
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
            <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {moreProperties.map((other: any) => (
                <LivePropertyCard key={other.id} item={other} />
              ))}
            </div>
          </div>
        </section>
      )}
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
  const [market, setMarket] = useState("");
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
                  <p key={index} className="mt-5 leading-8 text-slate-600">
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
                    <LivePropertyCard key={property.id} item={property} />
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
              <p className="mx-auto max-w-2xl text-lg text-[#05314a]/80">{heading.heroSubtitle}</p>
            ) : null}
          </div>

          <div className="mx-auto mb-8 max-w-3xl">
            <div className="relative overflow-hidden rounded-2xl border border-[#05314a]/15 shadow-sm">
              <div className="absolute inset-0 bg-gradient-to-r from-[#05314a]/10 via-white/60 to-[#10c0df]/10" />
              <div className="relative bg-white/80 p-3 backdrop-blur">
                <div className="flex flex-col gap-3 md:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search case studies by title or summary..."
                      value={search}
                      onChange={event => setSearch(event.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-12 text-[#05314a] transition-all focus:border-[#05314a] focus:outline-none focus:ring-2 focus:ring-[#05314a]/20"
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
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[#05314a] transition-all focus:border-[#05314a] focus:outline-none focus:ring-2 focus:ring-[#05314a]/20 md:w-64"
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
                className="mt-4 rounded-lg bg-[#05314a] px-4 py-2 text-white transition-colors hover:bg-[#05314a]/90"
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
    <Shell>
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

function ContactPage() {
  usePageTitle("Contact a Short-Term Rental Specialist");
  const { data: settings } = trpc.website.publicSettings.useQuery();
  const contactPhone = settings?.contactPhone || "(828) 407-1705";
  const contactEmail = settings?.contactEmail || "hello@savvy.realty";
  return (
    <Shell>
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
  const heading = useListHeading("markets");
  const markets = trpc.website.publicMarketDirectory.useQuery();
  const items: any[] = markets.data || [];
  if (markets.isLoading) return <LoadingPage />;
  return (
    <Shell>
      <section className="bg-[#05314a] py-20 text-center text-white">
        {heading.heroEyebrow && (
          <p className="mb-3 text-xs font-bold uppercase tracking-[.2em] text-cyan-300">
            {heading.heroEyebrow}
          </p>
        )}
        <h1 className="text-5xl font-black">{heading.heroTitle}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-cyan-50">{heading.heroSubtitle}</p>
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
