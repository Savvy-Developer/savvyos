import { useEffect, useMemo, useState } from "react";
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
  Loader2,
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

const BASE = "/newsite";
const LOGO =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png";
const path = (suffix = "") => `${BASE}${suffix}`;
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

function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} | Savvy STR Agents` : "Savvy STR Agents";
  }, [title]);
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
  const nav = [
    ["Properties", "/properties"],
    ["Our Agents", "/agents"],
    ["Case Studies", "/case-studies"],
    ["About", "/about"],
    ["Resources", "/resources"],
    ["Contact", "/contact"],
  ];
  return (
    <div className="h-full overflow-y-auto bg-white text-slate-950 selection:bg-cyan-200">
      <header
        className={`sticky top-0 z-50 border-b backdrop-blur-xl ${darkHeader ? "border-white/10 bg-[#052d43]/95" : "border-slate-200 bg-white/95"}`}
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
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            <a
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${darkHeader ? "text-white" : "text-[#05314a]"}`}
              href="https://os.savvy-agents.com/login"
            >
              Login
            </a>
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
              className="mt-2 block rounded-lg bg-[#10c0df] px-3 py-3 text-center text-sm font-bold text-[#03293c]"
              href={path("/contact")}
            >
              Talk to an STR Agent
            </a>
          </nav>
        )}
      </header>
      <main>{children}</main>
      <SiteFooter settings={siteSettings} />
    </div>
  );
}

function SiteFooter({ settings }: { settings?: any }) {
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
            <a href={path("/agents")}>Our Agents</a>
            <a href={path("/case-studies")}>Case Studies</a>
            <a href={path("/resources")}>Resources</a>
            <a href={path("/about")}>About</a>
            <a href={path("/contact")}>Contact</a>
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
          <button
            type="button"
            aria-label="Save property"
            onClick={event => {
              event.preventDefault();
              toast.info(
                "Saved properties will be enabled with the member portal."
              );
            }}
            className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-[#05314a] shadow"
          >
            <Heart className="h-4 w-4" />
          </button>
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
  title = "Talk with a Savvy STR specialist",
  message = "",
}: {
  agentUserId?: number;
  propertyId?: number;
  intent?: "buy" | "sell" | "property" | "agent" | "general";
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
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
      <h3 className="text-2xl font-bold text-[#05314a]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        No obligation. Get a property- and market-specific point of view.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <input
          className="rounded-lg border px-3 py-3 text-sm"
          placeholder="First name"
          value={form.firstName}
          onChange={event => set("firstName", event.target.value)}
        />
        <input
          className="rounded-lg border px-3 py-3 text-sm"
          placeholder="Last name"
          value={form.lastName}
          onChange={event => set("lastName", event.target.value)}
        />
        <input
          className="rounded-lg border px-3 py-3 text-sm"
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={event => set("email", event.target.value)}
        />
        <input
          className="rounded-lg border px-3 py-3 text-sm"
          placeholder="Phone (optional)"
          value={form.phone}
          onChange={event => set("phone", event.target.value)}
        />
        <textarea
          className="min-h-28 rounded-lg border px-3 py-3 text-sm sm:col-span-2"
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
            propertyId,
            agentUserId,
            sourcePath: window.location.pathname,
            attribution: Object.fromEntries(
              new URLSearchParams(window.location.search)
            ),
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
      <section className="bg-white py-20">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Investor confidence"
            title="What Our Investors Are Saying"
            body="Specialized guidance matters before, during, and long after closing."
          />
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {((settings.testimonials || []) as any[])
              .slice(0, 3)
              .map((item: any) => (
                <blockquote
                  key={item.quote}
                  className="flex min-h-64 flex-col rounded-2xl border bg-white p-7 shadow-sm"
                >
                  <div className="flex gap-1 text-amber-400">
                    {[0, 1, 2, 3, 4].map(index => (
                      <Star key={index} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                  <p className="mt-5 text-base leading-7 text-slate-700">
                    “{item.quote}”
                  </p>
                  <footer className="mt-auto pt-6">
                    <p className="font-bold text-[#05314a]">{item.name}</p>
                    <p className="text-xs text-slate-500">{item.role}</p>
                  </footer>
                </blockquote>
              ))}
          </div>
        </div>
      </section>
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

function PropertiesPage() {
  usePageTitle("Short-Term Rental Properties for Sale");
  const initial =
    new URLSearchParams(window.location.search).get("search") || "";
  const [search, setSearch] = useState(initial);
  const query = trpc.website.publicProperties.useQuery({
    search: initial || undefined,
  });
  if (query.isLoading) return <LoadingPage />;
  const items = (query.data || []).filter(
    (item: any) =>
      !search ||
      `${item.address} ${item.city} ${item.state} ${item.headline}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );
  return (
    <Shell>
      <section className="border-b bg-slate-50 py-16">
        <div className="mx-auto max-w-[1280px] px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-black text-[#05314a] sm:text-5xl">
            Short-Term Rental Properties for Sale
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            Investor-focused opportunities, specialist agents, and property
            intelligence in one place.
          </p>
          <div className="mx-auto mt-8 flex max-w-3xl items-center gap-2 rounded-xl border bg-white p-2 shadow-sm">
            <Search className="ml-3 h-5 w-5 text-cyan-600" />
            <input
              className="flex-1 px-2 py-3 text-sm outline-none"
              placeholder="City, state, keyword"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </div>
        </div>
      </section>
      <section className="py-14">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
          <div className="mb-7 flex items-end justify-between">
            <div>
              <p className="text-sm font-semibold text-cyan-700">
                {items.length} opportunities
              </p>
              <h2 className="text-2xl font-bold text-[#05314a]">
                Properties matching your search
              </h2>
            </div>
          </div>
          {items.length ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                Try a broader market, city, or address.
              </p>
            </div>
          )}
        </div>
      </section>
    </Shell>
  );
}

function PropertyDetailPage({ slug }: { slug: string }) {
  const query = trpc.website.publicProperty.useQuery({ slug });
  const [showLead, setShowLead] = useState(false);
  usePageTitle(query.data?.metaTitle || query.data?.address || "Property");
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
              </div>
              {showLead && (
                <LeadForm
                  agentUserId={item.assignedAgentId}
                  propertyId={item.propertyId}
                  intent="property"
                  title={`Ask about ${item.address}`}
                  message={`I'd like the full investment analysis for ${item.address}.`}
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

function CaseStudiesPage() {
  usePageTitle("STR Investment Case Studies");
  const [search, setSearch] = useState("");
  const query = trpc.website.publicCaseStudies.useQuery();
  if (query.isLoading) return <LoadingPage />;
  const items = (query.data || []).filter(
    (item: any) =>
      !search ||
      `${item.title} ${item.excerpt}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );
  return (
    <Shell>
      <section className="border-b bg-slate-50 py-16 text-center">
        <h1 className="text-5xl font-black text-[#05314a]">Case Studies</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          The decisions, relationships, and execution behind successful STR
          purchases.
        </p>
        <div className="mx-auto mt-8 flex max-w-2xl items-center gap-2 rounded-xl border bg-white px-4 shadow-sm">
          <Search className="h-5 w-5 text-cyan-600" />
          <input
            className="w-full py-4 text-sm outline-none"
            placeholder="Search case studies"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>
      </section>
      <section className="py-16">
        <div className="mx-auto grid max-w-[1180px] gap-6 px-4 sm:px-6 lg:grid-cols-2">
          {items.map((item: any) => (
            <StoryCard key={item.id} item={item} />
          ))}
        </div>
      </section>
    </Shell>
  );
}

function CaseStudyDetailPage({ slug }: { slug: string }) {
  const query = trpc.website.publicCaseStudy.useQuery({ slug });
  const item: any = query.data;
  usePageTitle(item?.title || "Case Study");
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
            <div className="prose prose-slate mt-8 max-w-none">
              {String(item.body || "")
                .split(/\n\s*\n/)
                .map((paragraph: string, index: number) =>
                  index % 2 === 0 && paragraph.length < 80 ? (
                    <h2
                      key={index}
                      className="mt-8 text-2xl font-bold text-[#05314a]"
                    >
                      {paragraph}
                    </h2>
                  ) : (
                    <p key={index} className="mt-4 leading-8 text-slate-650">
                      {paragraph}
                    </p>
                  )
                )}
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
  const [search, setSearch] = useState("");
  const query = trpc.website.publicPosts.useQuery();
  if (query.isLoading) return <LoadingPage />;
  const items = (query.data || []).filter(
    (item: any) =>
      !search ||
      `${item.title} ${item.excerpt} ${item.category}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );
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
          <div className="mt-8 flex max-w-2xl items-center gap-2 rounded-xl border bg-slate-50 px-4">
            <Search className="h-5 w-5 text-cyan-600" />
            <input
              className="w-full bg-transparent py-4 text-sm outline-none"
              placeholder="Search articles, topics, tags…"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </div>
        </div>
      </section>
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
          <h2 className="border-l-4 border-cyan-400 pl-3 text-2xl font-bold text-[#05314a]">
            Featured intelligence
          </h2>
          <div className="mt-7 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {items.map((item: any) => (
              <ArticleCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      </section>
    </Shell>
  );
}

function ResourceDetailPage({ slug }: { slug: string }) {
  const query = trpc.website.publicPost.useQuery({ slug });
  const item: any = query.data;
  usePageTitle(item?.title || "Resource");
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
          {String(item.body || "")
            .split(/\n\s*\n/)
            .map((paragraph: string, index: number) => (
              <p key={index} className="mt-5 text-lg leading-8 text-slate-700">
                {paragraph}
              </p>
            ))}
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

function AboutPage() {
  usePageTitle("Why Investors Work With Savvy STR Agents");
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
      <section className="bg-black py-28 text-center text-white">
        <div className="mx-auto max-w-4xl px-5">
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
      <section className="bg-black py-20 text-center text-white">
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

function MarketsPage() {
  usePageTitle("STR Markets");
  const agents = trpc.website.publicAgents.useQuery();
  const markets = useMemo(
    () =>
      Array.from(
        new Set((agents.data || []).flatMap((item: any) => item.markets || []))
      ).sort(),
    [agents.data]
  );
  if (agents.isLoading) return <LoadingPage />;
  return (
    <Shell>
      <section className="bg-[#05314a] py-20 text-center text-white">
        <h1 className="text-5xl font-black">STR Markets</h1>
        <p className="mx-auto mt-4 max-w-2xl text-cyan-50">
          Explore active markets through the specialists who work in them.
        </p>
      </section>
      <section className="bg-slate-50 py-16">
        <div className="mx-auto grid max-w-[1100px] gap-4 px-5 sm:grid-cols-2 lg:grid-cols-3">
          {markets.map(market => (
            <a
              key={market}
              href={`${path("/properties")}?search=${encodeURIComponent(String(market))}`}
              className="group flex items-center justify-between rounded-2xl border bg-white p-6 shadow-sm"
            >
              <div>
                <MapPin className="h-5 w-5 text-cyan-600" />
                <h2 className="mt-3 text-xl font-bold text-[#05314a]">
                  {String(market)}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Browse properties and specialists
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-cyan-600 transition group-hover:translate-x-1" />
            </a>
          ))}
        </div>
      </section>
    </Shell>
  );
}

export default function PublicWebsite() {
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
  return <NotFoundPage />;
}
