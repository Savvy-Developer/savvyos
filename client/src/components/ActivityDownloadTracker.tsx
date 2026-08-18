import { useEffect } from "react";

type TrackedAction = "downloaded_file" | "opened_file";

function isFileUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl, window.location.href);
    if (url.protocol === "blob:") return true;
    if (!/^https?:$/.test(url.protocol)) return false;

    const looksLikeFile = /\.(?:pdf|csv|xlsx?|docx?|pptx?|zip|txt|png|jpe?g|webp|gif|mp3|wav|m4a|mp4|mov)(?:$|[?#])/i.test(url.pathname);
    const isStorageUrl = /(?:amazonaws\.com|s3[.-]|cloudfront\.net|manuscdn\.com)/i.test(url.hostname);
    return looksLikeFile || isStorageUrl;
  } catch {
    return false;
  }
}

function filenameFromUrl(rawUrl: string): string {
  try {
    const path = new URL(rawUrl, window.location.href).pathname;
    const filename = path.split("/").filter(Boolean).pop();
    return filename ? decodeURIComponent(filename).slice(0, 255) : "File";
  } catch {
    return "File";
  }
}

function recordFileActivity(action: TrackedAction, fileName: string, source: string) {
  void fetch("/api/audit/download", {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, fileName: fileName.slice(0, 255), source: source.slice(0, 64) }),
  }).catch(() => {
    // Download/open actions must never be disrupted if auditing is unavailable.
  });
}

/**
 * Captures file activity that happens outside normal tRPC mutations. It observes
 * normal links, client-created download anchors, and direct window.open calls.
 */
export default function ActivityDownloadTracker() {
  useEffect(() => {
    const recentlyTracked = new WeakMap<HTMLAnchorElement, number>();

    const trackAnchor = (anchor: HTMLAnchorElement) => {
      const href = anchor.href;
      if (!href || (!anchor.hasAttribute("download") && !isFileUrl(href))) return;

      const now = Date.now();
      const lastTracked = recentlyTracked.get(anchor) ?? 0;
      if (now - lastTracked < 1500) return;
      recentlyTracked.set(anchor, now);

      const action: TrackedAction = anchor.hasAttribute("download") ? "downloaded_file" : "opened_file";
      const fileName = anchor.download || anchor.getAttribute("aria-label") || anchor.textContent?.trim() || filenameFromUrl(href);
      recordFileActivity(action, fileName || filenameFromUrl(href), "link");
    };

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a") as HTMLAnchorElement | null;
      if (anchor) trackAnchor(anchor);
    };

    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function trackedAnchorClick(this: HTMLAnchorElement) {
      trackAnchor(this);
      return originalAnchorClick.call(this);
    };

    const originalWindowOpen = window.open;
    window.open = function trackedWindowOpen(url?: string | URL, target?: string, features?: string) {
      const rawUrl = typeof url === "string" ? url : url?.toString() ?? "";
      if (rawUrl && isFileUrl(rawUrl)) {
        recordFileActivity("opened_file", filenameFromUrl(rawUrl), "window_open");
      }
      return originalWindowOpen.call(window, url, target, features);
    };

    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      HTMLAnchorElement.prototype.click = originalAnchorClick;
      window.open = originalWindowOpen;
    };
  }, []);

  return null;
}
