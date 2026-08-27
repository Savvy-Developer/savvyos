import { useEffect } from "react";
import { useLocation } from "wouter";
import { LandingPageRenderer } from "@/components/LandingPageRenderer";
import { trpc } from "@/lib/trpc";

function PublicNotFound() {
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-center"><div className="max-w-md"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">Savvy STR Agents</p><h1 className="mt-3 text-4xl font-bold text-slate-950">Page not found</h1><p className="mt-4 text-slate-600">This landing page is unavailable or has been unpublished.</p></div></main>;
}

function usePageMetadata(page: { pageTitle?: string; metaDescription?: string | null; socialImageUrl?: string | null; noindex?: boolean } | null | undefined) {
  useEffect(() => {
    if (!page) return;
    const priorTitle = document.title;
    document.title = page.pageTitle || "Savvy STR Agents";
    const nodes: HTMLMetaElement[] = [];
    const add = (name: string, content: string, property = false) => { const node = document.createElement("meta"); if (property) node.setAttribute("property", name); else node.name = name; node.content = content; document.head.appendChild(node); nodes.push(node); };
    if (page.metaDescription) add("description", page.metaDescription);
    if (page.noindex) add("robots", "noindex, nofollow");
    if (page.socialImageUrl) add("og:image", page.socialImageUrl, true);
    add("og:title", page.pageTitle || "Savvy STR Agents", true);
    return () => { document.title = priorTitle; nodes.forEach((node) => node.remove()); };
  }, [page]);
}

export default function PublicLandingPage() {
  const [location] = useLocation();
  const path = location.replace(/^\/+|\/+$/g, "");
  const slug = path.split("/")[0] || "";
  const validPublicPath = !!slug && !["login", "admin", "api", "assets", "healthz", "partner-lead", "careers", "talent-profile"].includes(slug);
  const pageQuery = trpc.landingPages.getPublicPage.useQuery({ slug }, { enabled: validPublicPath, retry: false, staleTime: 30_000 });
  usePageMetadata(pageQuery.data);
  if (!validPublicPath || pageQuery.error) return <PublicNotFound />;
  if (pageQuery.isLoading || !pageQuery.data) return <main className="flex min-h-screen items-center justify-center bg-white"><span className="h-7 w-7 animate-spin rounded-full border-2 border-cyan-700 border-t-transparent" /></main>;
  return <LandingPageRenderer page={pageQuery.data as any} />;
}

export { PublicNotFound };
