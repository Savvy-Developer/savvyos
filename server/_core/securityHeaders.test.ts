/**
 * Security headers (security audit, finding 08): what each host gets, and the
 * would-be-blocked reports.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  CSP_REPORT_PATH,
  isPublicSiteHost,
  parseCspReports,
  securityHeadersEnabled,
  securityHeadersFor,
  shouldLogViolation,
} from "./securityHeaders";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n");

describe("which site a host is", () => {
  it("knows the public website hosts, including the configured landing host", () => {
    expect(isPublicSiteHost("home.savvy-agents.com", {})).toBe(true);
    expect(isPublicSiteHost("www.savvy-agents.com", {})).toBe(true);
    expect(isPublicSiteHost("HOME.savvy-agents.com:443", {})).toBe(true);
    expect(isPublicSiteHost("os.savvy-agents.com", {})).toBe(false);
    expect(isPublicSiteHost("savvyos-production-ee09.up.railway.app", {})).toBe(false);
    expect(isPublicSiteHost("site.example.com", { PUBLIC_LANDING_PAGE_HOST: "site.example.com" })).toBe(true);
  });
});

describe("headers", () => {
  const admin = securityHeadersFor({ host: "os.savvy-agents.com", production: true }, {});
  const site = securityHeadersFor({ host: "home.savvy-agents.com", production: true }, {});

  it("sends the safe ones everywhere", () => {
    for (const headers of [admin, site]) {
      expect(headers["Strict-Transport-Security"]).toBe("max-age=31536000");
      expect(headers["X-Content-Type-Options"]).toBe("nosniff");
      expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
      expect(headers["Content-Security-Policy"]).toContain("object-src 'none'");
      expect(headers["Content-Security-Policy"]).toContain("base-uri 'self'");
    }
  });

  it("leaves the microphone alone for the Aircall phone", () => {
    expect(admin["Permissions-Policy"]).toBe("camera=(), geolocation=()");
    expect(admin["Permissions-Policy"]).not.toContain("microphone");
  });

  it("only our own sites may frame SavvyOS; the public site is not restricted", () => {
    expect(admin["Content-Security-Policy"]).toContain(
      "frame-ancestors 'self' https://savvy-agents.com https://*.savvy-agents.com"
    );
    expect(site["Content-Security-Policy"]).not.toContain("frame-ancestors");
    expect(admin["X-Frame-Options"]).toBeUndefined();
  });

  it("enforces nothing that could block scripts, styles, images or embeds", () => {
    for (const headers of [admin, site]) {
      const enforced = headers["Content-Security-Policy"];
      for (const rule of ["default-src", "script-src", "style-src", "img-src", "connect-src", "frame-src", "form-action"]) {
        expect(enforced).not.toContain(rule);
      }
    }
  });

  it("reports what a stricter policy would block, without blocking it", () => {
    const reportOnly = admin["Content-Security-Policy-Report-Only"];
    expect(reportOnly).toContain("default-src 'self'");
    expect(reportOnly).toContain("script-src 'self' 'unsafe-inline' https:");
    expect(reportOnly).toContain(`report-uri ${CSP_REPORT_PATH}`);
    expect(reportOnly).toContain("report-to csp");
    expect(admin["Reporting-Endpoints"]).toBe(`csp="${CSP_REPORT_PATH}"`);
  });

  it("no HSTS in development (localhost)", () => {
    expect(securityHeadersFor({ host: "localhost", production: false }, {})["Strict-Transport-Security"]).toBeUndefined();
  });

  it("SECURITY_HEADERS=off removes them", () => {
    expect(securityHeadersEnabled({})).toBe(true);
    expect(securityHeadersEnabled({ SECURITY_HEADERS: "off" })).toBe(false);
  });
});

describe("violation reports", () => {
  it("reads the old and the new report formats, keeping only origins and paths", () => {
    const old = parseCspReports({
      "csp-report": {
        "document-uri": "https://os.savvy-agents.com/contacts/12?token=secret",
        "violated-directive": "script-src-elem",
        "effective-directive": "script-src-elem",
        "blocked-uri": "http://evil.example/x.js?k=1",
        disposition: "report",
      },
    });
    expect(old).toEqual([
      { directive: "script-src-elem", blocked: "http://evil.example", page: "os.savvy-agents.com/contacts/12", disposition: "report" },
    ]);
    const modern = parseCspReports([
      {
        type: "csp-violation",
        body: { documentURL: "https://home.savvy-agents.com/newsite/", effectiveDirective: "script-src", blockedURL: "eval", disposition: "report" },
      },
      { type: "deprecation", body: {} },
    ]);
    expect(modern).toEqual([{ directive: "script-src", blocked: "eval", page: "home.savvy-agents.com/newsite/", disposition: "report" }]);
    expect(parseCspReports("nonsense")).toEqual([]);
    expect(parseCspReports(null)).toEqual([]);
  });

  it("logs each kind once an hour", () => {
    const violation = { directive: "img-src", blocked: "http://cdn.example", page: "x", disposition: "report" };
    const now = 10_000_000_000;
    expect(shouldLogViolation(violation, now)).toBe(true);
    expect(shouldLogViolation(violation, now + 1000)).toBe(false);
    expect(shouldLogViolation({ ...violation, blocked: "http://other.example" }, now + 2000)).toBe(true);
    expect(shouldLogViolation(violation, now + 61 * 60_000)).toBe(true);
  });
});

describe("wiring", () => {
  const index = read("server/_core/index.ts");
  it("runs before CORS and before the public host's /api guard", () => {
    const headers = index.indexOf("app.use(securityHeadersMiddleware());");
    const report = index.indexOf("registerCspReportRoute(app);");
    expect(headers).toBeGreaterThan(0);
    expect(report).toBeGreaterThan(headers);
    expect(report).toBeLessThan(index.indexOf("const origin = req.headers.origin;"));
    expect(report).toBeLessThan(index.indexOf("if (!landingHosts.has(host)) return next();"));
    expect(index).toContain('app.disable("x-powered-by");');
  });

  it("Dependabot opens grouped monthly updates for npm and GitHub Actions", () => {
    const config = read(".github/dependabot.yml");
    expect(config).toContain('package-ecosystem: "npm"');
    expect(config).toContain('package-ecosystem: "github-actions"');
    expect(config).toContain('interval: "monthly"');
  });
});
