import { trpc } from "@/lib/trpc";
import { formatPhoneDisplay } from "@/lib/inputFormatters";
import { CalendarDays, ExternalLink, Loader2, Mail, MapPin, Phone, ShieldCheck, Star, Wrench } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useRoute } from "wouter";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png";

type ContactIcon = typeof Phone;

function getInitials(name: string | null | undefined): string {
  return name?.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "SA";
}

function ContactAction({ href, label, icon: Icon, external = false }: { href: string; label: string; icon: ContactIcon; external?: boolean }) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
    >
      <Icon className="h-4 w-4" />{label}
    </a>
  );
}

function UnavailableVendorList() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-cyan-50 via-slate-50 to-white px-5 py-12">
      <main className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl ring-1 ring-slate-200">
        <img src={LOGO_URL} alt="Savvy STR Agents" className="mx-auto h-8 w-auto" />
        <div className="mx-auto mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100"><Wrench className="h-7 w-7 text-slate-500" /></div>
        <h1 className="mt-5 text-2xl font-bold text-slate-900">This Vendor List is unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">This shared list may still be in preparation or the link may no longer be active. Please contact your Savvy STR Agents representative for the latest recommendations.</p>
      </main>
    </div>
  );
}

export default function PublicVendorListPage() {
  const [, params] = useRoute("/vendors/:slug");
  const slug = params?.slug?.trim().toLowerCase() ?? "";
  const listQuery = trpc.vendors.getPublic.useQuery({ slug }, { enabled: slug.length >= 3, retry: false });
  const list = listQuery.data;

  // SavvyOS locks the dashboard shell to the viewport. This route is intentionally
  // a full document client resource, so restore normal browser scrolling only here.
  useEffect(() => {
    const root = document.getElementById("root");
    const elements = [document.documentElement, document.body, root].filter((element): element is HTMLElement => Boolean(element));
    const previousStyles = elements.map((element) => ({ element, style: element.getAttribute("style") }));
    for (const { element } of previousStyles) {
      element.style.height = "auto";
      element.style.minHeight = "100%";
      element.style.overflow = "visible";
      element.style.overflowY = "auto";
    }
    return () => {
      for (const { element, style } of previousStyles) {
        if (style === null) element.removeAttribute("style");
        else element.setAttribute("style", style);
      }
    };
  }, []);

  useEffect(() => {
    if (!list) return;
    const priorTitle = document.title;
    document.title = `${list.displayName} | Savvy STR Agents`;
    const description = document.createElement("meta");
    description.name = "description";
    description.content = list.headline || `Trusted vendor recommendations from ${list.agentName || "a Savvy STR Agent"}.`;
    document.head.appendChild(description);
    return () => {
      document.title = priorTitle;
      description.remove();
    };
  }, [list]);

  const availableCategoryCount = useMemo(() => list?.categories.filter((category) => category.vendors.length > 0).length ?? 0, [list]);
  const hasAgentContact = Boolean(list?.agentPhone || list?.agentEmail || list?.agentCallBookingLink);

  if (!slug || slug.length < 3) return <UnavailableVendorList />;
  if (listQuery.isLoading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-cyan-600" /></div>;
  if (listQuery.error || !list) return <UnavailableVendorList />;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <img src={LOGO_URL} alt="Savvy STR Agents" className="h-8 w-auto" />
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Trusted local resources</span>
        </div>
      </header>
      <main>
        <section className="relative overflow-hidden bg-slate-950 px-5 py-14 text-white sm:px-8 sm:py-20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(34,211,238,0.22),_transparent_40%),radial-gradient(circle_at_bottom_left,_rgba(14,165,233,0.16),_transparent_35%)]" />
          <div className="relative mx-auto max-w-6xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-300">A curated network for STR owners</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-bold tracking-tight sm:text-5xl">{list.displayName}</h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-200">{list.headline || "Trusted professionals to help you set up, operate, and maintain your short-term rental."}</p>
            {list.intro && <p className="mt-5 max-w-3xl whitespace-pre-line text-base leading-7 text-slate-300">{list.intro}</p>}
            <div className="mt-8 flex flex-wrap gap-3 text-sm text-slate-200"><span className="rounded-full border border-white/15 bg-white/10 px-4 py-2">{availableCategoryCount} {availableCategoryCount === 1 ? "service category" : "service categories"}</span><span className="rounded-full border border-white/15 bg-white/10 px-4 py-2">Shared by {list.agentName || "your Savvy STR Agent"}</span></div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
          <section className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Your Savvy STR Agent">
            <div className="h-1.5 bg-gradient-to-r from-cyan-400 via-cyan-500 to-slate-900" />
            <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-cyan-100 text-cyan-800 ring-4 ring-cyan-50">
                {list.agentProfilePhotoUrl ? <img src={list.agentProfilePhotoUrl} alt={list.agentName || "Savvy STR Agent"} className="h-full w-full object-cover" /> : <span className="text-xl font-bold">{getInitials(list.agentName)}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700">Your Savvy STR Agent</p>
                <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">{list.agentName || "Savvy STR Agent"}</h2>
                {list.agentTitle && <p className="mt-1 text-sm font-medium text-slate-600">{list.agentTitle}</p>}
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Need help choosing a provider or coordinating your next step? Reach out directly and your agent can help you make the right connection.</p>
              </div>
              {hasAgentContact && <div className="flex shrink-0 flex-wrap gap-2 sm:max-w-[330px] sm:justify-end">
                {list.agentPhone && <ContactAction href={`tel:${list.agentPhone.replace(/[^+\d]/g, "")}`} label={formatPhoneDisplay(list.agentPhone) || "Call"} icon={Phone} />}
                {list.agentEmail && <ContactAction href={`mailto:${list.agentEmail}`} label="Email agent" icon={Mail} />}
                {list.agentCallBookingLink && <ContactAction href={list.agentCallBookingLink} label="Book a call" icon={CalendarDays} external />}
              </div>}
            </div>
          </section>

          <div className="mb-10 rounded-xl border border-cyan-100 bg-cyan-50 p-4 text-sm leading-6 text-slate-700"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan-700" /><p><strong>Personal recommendations.</strong> This is a curated list from {list.agentName || "your agent"}'s local network. Please connect with each provider directly to confirm availability, pricing, scope, insurance, and fit for your property.</p></div></div>
          {list.categories.filter((category) => category.vendors.length > 0).length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center"><Wrench className="mx-auto h-9 w-9 text-slate-400" /><h2 className="mt-4 text-lg font-semibold">Recommendations are coming soon</h2><p className="mt-2 text-sm text-slate-600">Your agent is preparing this resource. Please check back soon.</p></div> : <div className="space-y-12">{list.categories.filter((category) => category.vendors.length > 0).map((category) => <section key={category.id} aria-labelledby={`category-${category.id}`}><div className="max-w-2xl"><p className="text-sm font-semibold uppercase tracking-[0.14em] text-cyan-700">Vendor category</p><h2 id={`category-${category.id}`} className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{category.name}</h2>{category.description && <p className="mt-2 text-sm leading-6 text-slate-600">{category.description}</p>}</div><div className="mt-6 grid gap-5 lg:grid-cols-2">{category.vendors.map((vendor) => <article key={vendor.id} className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-slate-900">{vendor.businessName}</h3>{vendor.contactName && <p className="mt-1 text-sm text-slate-600">{vendor.contactName}</p>}</div>{vendor.isFeatured && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800"><Star className="h-3.5 w-3.5 fill-current" /> Featured</span>}</div>{vendor.description && <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-600">{vendor.description}</p>}{(vendor.serviceArea || vendor.address) && <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm leading-5 text-slate-600"><div className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700" /><div>{vendor.serviceArea && <p>{vendor.serviceArea}</p>}{vendor.address && <p className={vendor.serviceArea ? "mt-1 whitespace-pre-line" : "whitespace-pre-line"}>{vendor.address}</p>}</div></div></div>}<div className="mt-5 flex flex-wrap gap-2">{vendor.phone && <ContactAction href={`tel:${vendor.phone.replace(/[^+\d]/g, "")}`} label="Call" icon={Phone} />}{vendor.email && <ContactAction href={`mailto:${vendor.email}`} label="Email" icon={Mail} />}{vendor.website && <ContactAction href={vendor.website} label="Website" icon={ExternalLink} external />}</div>{!vendor.phone && !vendor.email && !vendor.website && <p className="mt-5 text-sm italic text-slate-500">Contact details available from your agent upon request.</p>}</article>)}</div></section>)}</div>}
        </section>
      </main>
      <footer className="border-t border-slate-200 bg-white"><div className="mx-auto max-w-6xl px-5 py-8 text-center text-xs leading-5 text-slate-500 sm:px-8">Shared by {list.agentName || "your Savvy STR Agent"} through Savvy STR Agents. Vendor recommendations are independent referrals; clients should perform their own due diligence before engaging any provider.</div></footer>
    </div>
  );
}
