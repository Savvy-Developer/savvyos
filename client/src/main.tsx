import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
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

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

// ---------------------------------------------------------------------------
// Deploy-version watcher
// ---------------------------------------------------------------------------
// Polls the server's health endpoint every 60 s. When the server returns a
// different buildId (meaning a new deploy has gone live), we invalidate the
// entire React Query cache so every active component re-fetches fresh data.
// This prevents the "connections disappeared" symptom where users who were
// already logged in see stale/empty data after a deployment without needing
// to hard-refresh or log out.
// ---------------------------------------------------------------------------
let knownBuildId: string | null = null;

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

    if (buildId !== knownBuildId) {
      console.info(
        `[SavvyOS] New deploy detected (${knownBuildId} → ${buildId}). Refreshing data…`
      );
      knownBuildId = buildId;
      // Invalidate all queries so every component silently re-fetches.
      // This is non-disruptive: React Query refetches in the background and
      // only updates the UI when fresh data arrives.
      await queryClient.invalidateQueries();
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
