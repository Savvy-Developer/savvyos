import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, httpLink, splitLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { initializeAppHistory } from "@/lib/navigationHistory";
import { initDeployUpdates, markDraftsSaved, reportApiErrorForUpdates } from "@/lib/deployUpdates";
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

const isUnauthorizedError = (error: unknown) =>
  error instanceof TRPCClientError && error.message === UNAUTHED_ERR_MSG;

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
    if (!isUnauthorizedError(error)) reportApiErrorForUpdates();
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    if (!isUnauthorizedError(error)) reportApiErrorForUpdates();
    console.error("[API Mutation Error]", error);
  }
  // A save succeeded, so typed text on screen is no longer an unsaved draft.
  if (event.type === "updated" && event.action.type === "success") {
    markDraftsSaved();
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

initDeployUpdates();

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
