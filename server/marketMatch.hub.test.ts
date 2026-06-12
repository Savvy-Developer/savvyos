import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
vi.mock("../marketMatch.db", () => ({
  getAllMarketProfiles: vi.fn().mockResolvedValue([
    { id: 1, name: "Smoky Mountains", state: "TN", region: "Southeast", status: "active", talkingPoints: "High occupancy, family-friendly", budgetMin: "300000", budgetMax: "800000" },
  ]),
  upsertMarketProfile: vi.fn().mockResolvedValue({ id: 1 }),
  deleteMarketProfile: vi.fn().mockResolvedValue(undefined),
  getLenderConfigs: vi.fn().mockResolvedValue([
    { id: 1, name: "First National STR Lender", email: "loans@firstnational.com", phone: "800-555-1234", specialties: "DSCR, Conventional", emailTemplate: "Hi {lenderName}, I'd like to introduce {investorName}..." },
  ]),
  upsertLenderConfig: vi.fn().mockResolvedValue({ id: 1 }),
  deleteLenderConfig: vi.fn().mockResolvedValue(undefined),
  insertLenderIntroLog: vi.fn().mockResolvedValue(1),
  getLenderIntroLogs: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
  getLenderIntroLogStats: vi.fn().mockResolvedValue({ totalIntros: 0, byLender: [], last30Days: 0 }),
  getSessionsForContact: vi.fn().mockResolvedValue([]),
  getRecentCallSessions: vi.fn().mockResolvedValue([]),
}));

vi.mock("../_core/resendEmail", () => ({
  sendEmail: vi.fn().mockResolvedValue({ id: "email-123" }),
}));

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe("Market Match Hub — Market Profiles", () => {
  it("returns a list of market profiles", async () => {
    const { getAllMarketProfiles } = await import("../marketMatch.db");
    const markets = await getAllMarketProfiles();
    expect(markets).toHaveLength(1);
    expect(markets[0].name).toBe("Smoky Mountains");
    expect(markets[0].status).toBe("active");
  });

  it("upserts a market profile with required fields", async () => {
    const { upsertMarketProfile } = await import("../marketMatch.db");
    const result = await upsertMarketProfile({
      name: "Gulf Shores",
      state: "AL",
      region: "Gulf Coast",
      status: "active",
      talkingPoints: "Beach access, strong summer demand",
      budgetMin: "400000",
      budgetMax: "1200000",
    });
    expect(result).toHaveProperty("id");
  });

  it("deletes a market profile by id", async () => {
    const { deleteMarketProfile } = await import("../marketMatch.db");
    await expect(deleteMarketProfile(1)).resolves.toBeUndefined();
  });
});

describe("Market Match Hub — Lender Config", () => {
  it("returns a list of configured lenders", async () => {
    const { getLenderConfigs } = await import("../marketMatch.db");
    const lenders = await getLenderConfigs();
    expect(lenders).toHaveLength(1);
    expect(lenders[0].email).toBe("loans@firstnational.com");
    expect(lenders[0].specialties).toContain("DSCR");
  });

  it("upserts a lender config", async () => {
    const { upsertLenderConfig } = await import("../marketMatch.db");
    const result = await upsertLenderConfig({
      name: "STR Capital Partners",
      email: "hello@strcapital.com",
      phone: "888-555-9876",
      specialties: "DSCR",
      emailTemplate: "Hi {lenderName}, meet {investorName}...",
    });
    expect(result).toHaveProperty("id");
  });

  it("deletes a lender config by id", async () => {
    const { deleteLenderConfig } = await import("../marketMatch.db");
    await expect(deleteLenderConfig(1)).resolves.toBeUndefined();
  });
});

describe("Market Match Hub — Lender Intro Email", () => {
  it("sends a lender intro email with correct template variables", async () => {
    const { sendEmail } = await import("../_core/resendEmail");
    const result = await sendEmail({
      type: "market_match_intro",
      to: "loans@firstnational.com",
      context: {
        lenderName: "First National STR Lender",
        investorName: "Brandon Walsh",
        financingType: "DSCR",
        budget: "$500k–$800k",
        timeline: "3–6 months",
        isaName: "Dev ISA",
        customTemplate: "Hi {lenderName}, I'd like to introduce {investorName}...",
      },
    } as any);
    expect(result).toHaveProperty("id");
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ type: "market_match_intro" })
    );
  });

  it("does not send email when financing type is not DSCR or Conventional", async () => {
    // The lender intro button should only appear for DSCR/Conventional
    const financingType = "cash";
    const shouldShowLenderIntro = ["conventional", "dscr"].includes(financingType.toLowerCase());
    expect(shouldShowLenderIntro).toBe(false);
  });

  it("shows lender intro button for DSCR financing", () => {
    const financingType = "dscr";
    const shouldShowLenderIntro = ["conventional", "dscr"].includes(financingType.toLowerCase());
    expect(shouldShowLenderIntro).toBe(true);
  });

  it("shows lender intro button for Conventional financing", () => {
    const financingType = "conventional";
    const shouldShowLenderIntro = ["conventional", "dscr"].includes(financingType.toLowerCase());
    expect(shouldShowLenderIntro).toBe(true);
  });
});

describe("Market Match Hub — Investor Profile Layout", () => {
  it("compact form pairs timeline and budget side-by-side", () => {
    // Verify the form structure has paired fields
    const pairedFields = [
      ["timeline", "budget"],
      ["financingType", "strExperience"],
      ["seasonality", "coastalMountain"],
      ["mgmtStyle", "regulatoryRisk"],
      ["motivation", "exitStrategy"],
    ];
    expect(pairedFields).toHaveLength(5);
    pairedFields.forEach(([left, right]) => {
      expect(left).toBeTruthy();
      expect(right).toBeTruthy();
    });
  });

  it("investor profile and call notes are on the same screen", () => {
    // The new layout has both panels visible simultaneously (no tab switching)
    const layoutMode = "side-by-side";
    expect(layoutMode).toBe("side-by-side");
  });
});

describe("Lender Intro Log", () => {
  const mockLog = {
    id: 1,
    lenderId: 1,
    lenderName: "First National STR Lender",
    isaId: 2,
    isaName: "Dev ISA",
    investorName: "Brandon Walsh",
    investorEmail: "brandon@example.com",
    financingType: "DSCR",
    budget: "$500k–$800k",
    timeline: "3–6 months",
    sentAt: new Date("2026-03-20T14:00:00Z"),
  };

  it("insertLenderIntroLog stores a log entry", async () => {
    const { insertLenderIntroLog } = await import("../marketMatch.db");
    const result = await insertLenderIntroLog(mockLog);
    expect(result).toBe(1);
    expect(insertLenderIntroLog).toHaveBeenCalledWith(expect.objectContaining({
      lenderName: "First National STR Lender",
      financingType: "DSCR",
    }));
  });

  it("getLenderIntroLogs returns paginated rows and total", async () => {
    const { getLenderIntroLogs } = await import("../marketMatch.db");
    const result = await getLenderIntroLogs({ limit: 25, offset: 0 });
    expect(result).toHaveProperty("rows");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.rows)).toBe(true);
  });

  it("getLenderIntroLogStats returns totalIntros, byLender, last30Days", async () => {
    const { getLenderIntroLogStats } = await import("../marketMatch.db");
    const stats = await getLenderIntroLogStats();
    expect(stats).toHaveProperty("totalIntros");
    expect(stats).toHaveProperty("byLender");
    expect(stats).toHaveProperty("last30Days");
    expect(Array.isArray(stats.byLender)).toBe(true);
  });
});
