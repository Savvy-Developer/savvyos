import {
  adAttributionParams,
  sessionAdAttribution,
  type AdAttribution,
} from "@shared/adAttribution";

/**
 * Hold an ad's UTM parameters for the whole visit.
 *
 * Every link on the public site is a full page load, which drops the query
 * string, so without this an ad's parameters survived exactly one click. The
 * rule for what to keep lives in @shared/adAttribution and is tested there;
 * this file is only the storage.
 *
 * sessionStorage, not localStorage: a visit is the unit of attribution here,
 * and a click on an ad last month should not follow someone into an organic
 * visit today. Every access is guarded, since storage throws in some private
 * modes and embedded contexts, and a failure must never block the form.
 */

const KEY = "savvy_visit_attribution";

function read(): AdAttribution | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AdAttribution) : null;
  } catch {
    return null;
  }
}

/** Call on every page load. Returns what the visit now carries. */
export function captureVisitAttribution(): AdAttribution | null {
  let current: Record<string, string> = {};
  try {
    current = Object.fromEntries(new URLSearchParams(window.location.search));
  } catch {
    current = {};
  }
  const next = sessionAdAttribution(current, read());
  try {
    if (next) window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable. The current page's parameters still go with the form.
  }
  return next;
}

/**
 * The attribution a form should send: everything on the current URL, which is
 * what the lead row has always recorded, with the visit's held UTMs laid over
 * it so they survive navigation.
 */
export function formAttribution(): Record<string, string> {
  let current: Record<string, string> = {};
  try {
    current = Object.fromEntries(new URLSearchParams(window.location.search));
  } catch {
    current = {};
  }
  return { ...current, ...adAttributionParams(captureVisitAttribution()) };
}
