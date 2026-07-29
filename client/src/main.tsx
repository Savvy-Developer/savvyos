import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, httpLink, splitLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import { toast } from "sonner";
import App from "./App";
import { initializeAppHistory } from "@/lib/navigationHistory";
import "./index.css";

initializeAppHistory();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Re-fetch when the user returns to the tab so data is always fresh
      // after a deploy or after the user has been away.
      refetchOnWindowFocus: true,
      // Treat cached data as stale after 30 s so the next mount/focus
      // triggers a background re-fetch rather than serving stale data.
      staleTime: 30_000,
      // Keep unused cache entries for 5 minutes before garbage-collecting.
      gcTime: 5 * 60_000,
      // Retry failed queries once before surfacing an error.
      retry: 1,
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;
  if (import.meta.env.DEV) return; // dev mode: never redirect to OAuth

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;
  if (!isUnauthorized) return;

  window.location.href = "/login";
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const authenticatedFetch = (input: RequestInfo | URL, init?: RequestInit) =>
  globalThis.fetch(input, {
    ...(init ?? {}),
    credentials: "include",
  });

const trpcClient = trpc.createClient({
  links: [
    // The cohort report can legitimately scan a large date range. Keep it out of
    // the initial navigation batch so unrelated chrome (badges, profile, and nav)
    // stays responsive even while the report is loading.
    splitLink({
      condition(op) {
        return op.path === "analytics.leadCohortConversion";
      },
      true: httpLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch: authenticatedFetch,
      }),
      false: httpBatchLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch: authenticatedFetch,
      }),
    }),
  ],
});

// ---------------------------------------------------------------------------
// Deploy-version watcher
// ---------------------------------------------------------------------------
// Polls the server's health endpoint every 60 s. When the server returns a
// different buildId (meaning a new deploy has gone live), it:
//   1. Shows a toast notification with a "Refresh now" button.
//   2. Auto-reloads the page after 10 s so the user always gets the latest
//      code without needing to manually hard-refresh.
// The 10-second grace period lets users finish typing before the reload.
// ---------------------------------------------------------------------------
let knownBuildId: string | null = null;
let reloadScheduled = false;

async function checkForNewDeploy() {
  try {
    const res = await fetch(
      `/api/trpc/system.health?input=${encodeURIComponent(JSON.stringify({ json: { timestamp: Date.now() } }))}`,
      { credentials: "include" }
    );
    if (!res.ok) return;
    const json = await res.json();
    const buildId: string | undefined = json?.result?.data?.json?.buildId;
    if (!buildId) return;

    if (knownBuildId === null) {
      // First poll — just record the current build id.
      knownBuildId = buildId;
      return;
    }

    if (buildId !== knownBuildId && !reloadScheduled) {
      console.info(
        `[SavvyOS] New deploy detected (${knownBuildId} → ${buildId}). Reloading…`
      );
      knownBuildId = buildId;
      reloadScheduled = true;

      // Show a persistent toast so the user knows what's happening.
      // The action button lets them reload immediately; otherwise it
      // auto-reloads after 10 seconds.
      toast.info("SavvyOS has been updated", {
        description: "Refreshing in 10 seconds to load the latest version…",
        duration: 10_000,
        action: {
          label: "Refresh now",
          onClick: () => window.location.reload(),
        },
        onDismiss: () => {
          // If the user explicitly dismisses, still reload after 10 s
          // so they always end up on the latest version.
        },
      });

      setTimeout(() => {
        window.location.reload();
      }, 10_000);
    }
  } catch {
    // Network errors are expected during the brief window when Railway is
    // cycling the container. Silently ignore them.
  }
}

// Start polling after a short delay so the initial page load isn't impacted.
setTimeout(() => {
  checkForNewDeploy();
  setInterval(checkForNewDeploy, 60_000);
}, 5_000);

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
