import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  eventAlerts,
  eventExclusivityClaims,
  eventHeadcountComponents,
  eventObligations,
  eventPortfolio,
  eventSponsorAsks,
  eventSponsors,
  eventSwoogoSyncActivity,
  eventUnaffiliatedContacts,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { getSwoogoConfigurationStatus } from "../swoogoEvents";
import { canAdminUsePermission } from "./permissions";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const nullableText = (max: number) => z.string().trim().max(max).nullable();
const nullableMoney = z
  .number()
  .finite()
  .min(-9_999_999_999_999.99)
  .max(9_999_999_999_999.99)
  .nullable();
const eventStatuses = [
  "Idea",
  "Approved",
  "Contracted",
  "In build",
  "Selling",
  "Signed",
  "Committed",
  "Not started",
  "Date unconfirmed",
  "Date TBD",
  "Decision live",
  "Evaluating",
  "Conflict",
  "Pivoting",
  "Closed",
] as const;
const sponsorStages = [
  "signed",
  "invoiced",
  "verbal",
  "proposed",
  "target",
  "partner",
  "speaker",
] as const;
const shareStatuses = ["written", "verbal", "not_agreed"] as const;
const sourceType = z.string().trim().min(1).max(255);

type EventAccessUser = { id: number; role: string; email?: string | null };

async function requireEventsAccess(user: EventAccessUser) {
  if (user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Events is available to administrators only.",
    });
  }
  if (!(await canAdminUsePermission(user, "canViewEvents"))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Events access has not been granted in Super Permissions.",
    });
  }
}

async function database() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable.",
    });
  return db;
}

function stringOrNull(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function sqlDate(value: string | null | undefined) {
  return value ? new Date(`${value}T12:00:00.000Z`) : null;
}

function versionedUpdate(result: unknown) {
  const affectedRows = Number(
    (result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0
  );
  if (affectedRows === 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "This record changed since it was opened. Refresh the Events Console and retry your edit.",
    });
  }
}

const SEED_EVENTS = [
  {
    key: "summit26",
    name: "Savvy Summit 2026",
    tier: 1,
    status: "In build",
    startDate: "2026-10-05",
    endDate: "2026-10-07",
    city: "Charlotte, NC",
    venue: "Tabbris",
    ownerName: "Dustin Uhrig",
    counterpart: "Storm Hambrick",
    registrationPlatform: "Swoogo",
    swoogoEventId: "SW-89104",
    revenueTarget: 98000,
    revenueBooked: 55000,
    savvyRevenueShare: 100,
    committedCost: 55000,
    headcountGuarantee: 60,
    headcountGuaranteeVendor: "Tin Kitchen",
    workingHeadcount: 68,
    notes:
      "Ishita signed at 50,000, CSA invoiced at 5,000. Pricing by Mira 2,500 is proposed and is not counted.",
    components: [
      ["Agents", 43, "Swoogo: Agent"],
      ["Staff and leadership", null, "Swoogo: Staff"],
      ["Speakers", null, "Swoogo: Speaker"],
      ["Sponsor reps", null, "Swoogo: Sponsor"],
      ["Approved plus ones", null, "Swoogo: Guest"],
    ],
  },
  {
    key: "poconos",
    name: "Poconos Regional",
    tier: 2,
    status: "Date unconfirmed",
    startDate: null,
    endDate: null,
    city: "Poconos, PA",
    venue: null,
    ownerName: "Dustin Uhrig",
    counterpart: "Michael Klein",
    registrationPlatform: null,
    swoogoEventId: null,
    revenueTarget: null,
    revenueBooked: 0,
    savvyRevenueShare: null,
    committedCost: null,
    notes:
      "Listed as September with no year confirmed. Cannot be planned or sold until Klein confirms.",
  },
  {
    key: "pcb",
    name: "Panama City Beach Summit",
    tier: 2,
    status: "Selling",
    startDate: "2027-01-21",
    endDate: "2027-01-22",
    city: "Panama City Beach, FL",
    venue: "Boardwalk Beach Hotel",
    ownerName: "Dustin Uhrig",
    counterpart: "Joe Rohne",
    registrationPlatform: "Joe’s own",
    swoogoEventId: null,
    revenueTarget: 21000,
    revenueBooked: 0,
    savvyRevenueShare: 25,
    shareStatus: "verbal",
    committedCost: 0,
    notes:
      "Sellout 84,000 in sponsorship. Savvy takes 25 percent flat, verbal only. Joe keeps all ticket revenue and carries the 43,000 cost base. Registration and attendance are his to run.",
  },
  {
    key: "smokies",
    name: "Smokies Regional",
    tier: 2,
    status: "Not started",
    startDate: "2027-02-22",
    endDate: "2027-02-23",
    city: "Sevierville, TN",
    venue: null,
    ownerName: "Dustin Uhrig",
    counterpart: "Brandon Thompson",
    registrationPlatform: null,
    swoogoEventId: null,
    revenueTarget: null,
    revenueBooked: 0,
    savvyRevenueShare: null,
    committedCost: null,
    notes:
      "End of February placeholder. Nine days from the Asheville regional.",
  },
  {
    key: "avl",
    name: "Asheville Regional",
    tier: 2,
    status: "Not started",
    startDate: "2027-03-03",
    endDate: "2027-03-04",
    city: "Asheville, NC",
    venue: null,
    ownerName: "Dustin Uhrig",
    counterpart: "Tyler Coon",
    registrationPlatform: null,
    swoogoEventId: null,
    revenueTarget: null,
    revenueBooked: 0,
    savvyRevenueShare: null,
    committedCost: null,
    notes:
      "Early March placeholder. Same sponsor pool as Smokies, six weeks after PCB.",
  },
  {
    key: "scottsdale",
    name: "Scottsdale Regional",
    tier: 2,
    status: "Date TBD",
    startDate: null,
    endDate: null,
    city: "Scottsdale, AZ",
    venue: null,
    ownerName: "Dustin Uhrig",
    counterpart: "Jeremy Holden",
    registrationPlatform: null,
    swoogoEventId: null,
    revenueTarget: null,
    revenueBooked: 0,
    savvyRevenueShare: null,
    committedCost: null,
    notes: "Carries the second Booking.com after-party target.",
  },
  {
    key: "unconf",
    name: "STR Unconference",
    tier: 3,
    status: "Signed",
    startDate: "2027-04-04",
    endDate: "2027-04-06",
    city: "Nashville, TN",
    venue: "Category 10",
    ownerName: "Dustin Uhrig",
    counterpart: "StaySummit LLC",
    registrationPlatform: "Organizer",
    swoogoEventId: null,
    revenueTarget: 0,
    revenueBooked: 0,
    savvyRevenueShare: 0,
    committedCost: 75000,
    notes:
      "Co-title with Guesty. 37,500 paid, 37,500 due Oct 1. 20,000 of the fee is an F&B credit, not extra spend. Largest single check in the portfolio.",
    components: [
      ["Ticket allocation", 10, "Organizer"],
      ["Assigned to people", null, "Manual"],
    ],
  },
  {
    key: "luyl",
    name: "Level Up Your Listing",
    tier: 3,
    status: "Committed",
    startDate: "2027-05-06",
    endDate: "2027-05-07",
    city: "TBD",
    venue: null,
    ownerName: "Dustin Uhrig",
    counterpart: "LUYL LLC / Ishita",
    registrationPlatform: "Organizer",
    swoogoEventId: null,
    revenueTarget: 0,
    revenueBooked: 0,
    savvyRevenueShare: 0,
    committedCost: 30000,
    notes:
      "60,000 gross split 50/50 with Ishita. Dates are a placeholder pending organizer confirmation.",
  },
  {
    key: "imnw",
    name: "IMN STR Winter",
    tier: 4,
    status: "Decision live",
    startDate: "2027-02-01",
    endDate: "2027-02-02",
    city: "Miami, FL",
    venue: null,
    ownerName: "Dustin Uhrig",
    counterpart: "IMN",
    registrationPlatform: "Organizer",
    swoogoEventId: null,
    revenueTarget: 0,
    revenueBooked: 0,
    savvyRevenueShare: 0,
    committedCost: null,
    notes:
      "Best room for sponsor prospecting. Sponsorship window closes Sept through Nov.",
  },
  {
    key: "vrma",
    name: "VRMA International",
    tier: 4,
    status: "Conflict",
    startDate: "2026-10-04",
    endDate: "2026-10-06",
    city: "Nashville, TN",
    venue: null,
    ownerName: "Dustin Uhrig",
    counterpart: "VRMA",
    registrationPlatform: "Organizer",
    swoogoEventId: null,
    revenueTarget: 0,
    revenueBooked: 0,
    savvyRevenueShare: 0,
    committedCost: null,
    notes:
      "Runs on top of Savvy Summit. Recurs every October, so this collision repeats annually unless one moves.",
  },
  {
    key: "swb",
    name: "STR Wealth Builders",
    tier: 4,
    status: "Evaluating",
    startDate: "2027-05-21",
    endDate: "2027-05-22",
    city: "Coeur d'Alene, ID",
    venue: null,
    ownerName: "Dustin Uhrig",
    counterpart: "Organizer",
    registrationPlatform: "Organizer",
    swoogoEventId: null,
    revenueTarget: 0,
    revenueBooked: 0,
    savvyRevenueShare: 0,
    committedCost: null,
    notes: "Small and agent-friendly. Recruitment value, not client value.",
  },
  {
    key: "imns",
    name: "IMN STR Summer",
    tier: 4,
    status: "Evaluating",
    startDate: "2027-06-15",
    endDate: "2027-06-16",
    city: "Carlsbad, CA",
    venue: null,
    ownerName: "Dustin Uhrig",
    counterpart: "IMN",
    registrationPlatform: "Organizer",
    swoogoEventId: null,
    revenueTarget: 0,
    revenueBooked: 0,
    savvyRevenueShare: 0,
    committedCost: null,
    notes: "Duplicates the Winter room. Pick one.",
  },
  {
    key: "tpt",
    name: "Top Producers Trip",
    tier: 1,
    status: "Pivoting",
    startDate: null,
    endDate: null,
    city: "Pacific Mexico under review",
    venue: null,
    ownerName: "Dustin Uhrig",
    counterpart: "Tyler Coon",
    registrationPlatform: null,
    swoogoEventId: null,
    revenueTarget: 0,
    revenueBooked: 0,
    savvyRevenueShare: 0,
    committedCost: null,
    notes:
      "Mediterranean cruise dead. Price ceilings are 5,000 per couple for Joe’s team and nearer 2,000 for the Smokies group. Tier 1 but nowhere near build, so no registration setup yet.",
  },
] as const;

const SEED_OBLIGATIONS = [
  [
    "summit-balance",
    "summit26",
    "2026-09-04",
    "Tabbris balance due",
    null,
    "Venue balance",
    true,
    "Balance and the full-refund window land within a day of each other. There is no window where the money is committed and the exit is still open.",
  ],
  [
    "summit-refund",
    "summit26",
    "2026-09-05",
    "Tabbris full-refund window closes",
    null,
    "Full venue cost",
    true,
    "After this date the venue spend is unrecoverable regardless of headcount or sponsorship.",
  ],
  [
    "pcb-launch",
    "pcb",
    "2026-09-08",
    "PCB launch window opens",
    null,
    "Opens the 21,000 window",
    false,
    "Nothing launches cleanly until the sponsor ownership line with Joe is settled and Parker has a formal ask in hand.",
  ],
  [
    "summit-guarantee",
    "summit26",
    "2026-09-25",
    "Tin Kitchen guarantee decision",
    null,
    "Overage exposure",
    true,
    "Guaranteed at 60 against a working estimate near 68, and four of the five headcount components are still uncounted.",
  ],
  [
    "summit-alpha",
    "summit26",
    "2026-09-26",
    "AlphaGraphics estimate 27751 expires",
    1708.5,
    "Quoted, COD",
    true,
    "Request a revised estimate rather than approving this one and issuing a second.",
  ],
  [
    "unconf-balance",
    "unconf",
    "2026-10-01",
    "STR Unconference balance due",
    37500,
    "Contractual, signed",
    true,
    "Hard date in a signed agreement. Largest single outflow in the portfolio and it lands four days before Savvy Summit opens.",
  ],
  [
    "summit-monarch",
    "summit26",
    "2026-10-04",
    "Monarch Market balance due",
    141.4,
    "Day 0 room rental",
    true,
    "Room rental only, no food and beverage from Savvy. Half already paid.",
  ],
  [
    "imnw-close",
    "imnw",
    "2026-11-30",
    "IMN STR Winter sponsorship closes",
    null,
    "Cost unknown",
    true,
    "Decide against the sponsor-prospecting case, not the client case.",
  ],
  [
    "unconf-fb",
    "unconf",
    "2027-02-03",
    "Unconference F&B allocation due in writing",
    20000,
    "Credit to allocate",
    false,
    "The 20,000 is carved out of the fee already paid. Anything above it is invoiced directly to Savvy after the event.",
  ],
  [
    "unconf-menu",
    "unconf",
    "2027-02-18",
    "Unconference menu due",
    null,
    "Within credit",
    true,
    "Bar orders set in advance through the venue F&B manager. Minimums apply.",
  ],
] as const;

const SEED_SPONSORS = [
  [
    "ishita",
    "Ishita Interiors",
    "Design and furnishing",
    "Ishita Lalan",
    "Half of the 50,000 collected. Twelve months of year-round benefits attached.",
    [
      ["summit26", 50000, "signed"],
      ["luyl", null, "partner"],
    ],
  ],
  [
    "csa",
    "CSA Partners",
    "Cost segregation",
    "Sam Fringer, Conner Iddiols",
    "Invoice unpaid. Package does not mention meals but reps are on site three days.",
    [["summit26", 5000, "invoiced"]],
  ],
  [
    "mira",
    "Pricing by Mira",
    "Revenue management",
    "Emile Sakhel",
    "Attending remotely in October, VRMA conflict. Confirmed speaker at PCB.",
    [
      ["summit26", 2500, "proposed"],
      ["pcb", null, "speaker"],
    ],
  ],
  [
    "mortgage-shop",
    "The Mortgage Shop",
    "Lending",
    "Brenna Carles",
    "Wants 10,000 total. Split structure gets her there at full price with no discount.",
    [
      ["summit26", 2500, "proposed"],
      ["pcb", 7500, "proposed"],
    ],
  ],
  [
    "movement",
    "Movement Mortgage",
    "Lending",
    "Parker Borofsky",
    "Paid 20,000 at HostConnect. Has never received a formal ask.",
    [["pcb", 15000, "target"]],
  ],
  [
    "booking",
    "Booking.com",
    "OTA",
    null,
    "After-party naming. Blocked on whether host agreements permit sub-licensing, and on OTA category exclusivity.",
    [
      ["unconf", 30000, "target"],
      ["scottsdale", 30000, "target"],
    ],
  ],
] as const;

const SEED_CLAIMS = [
  [
    "claim-design-summit",
    "summit26",
    "Design and furnishing",
    "Ishita Interiors",
    true,
    "None open.",
  ],
  [
    "claim-lending-summit",
    "summit26",
    "Lending",
    null,
    false,
    "The Mortgage Shop is proposed here. Nobody has asked for the category.",
  ],
  [
    "claim-lending-pcb",
    "pcb",
    "Lending",
    null,
    false,
    "Movement Mortgage is the Title target and The Mortgage Shop is proposed at Gold.",
  ],
  [
    "claim-ota-unconf",
    "unconf",
    "OTA",
    null,
    false,
    "Booking.com is the after-party target. Airbnb exhibited at HostConnect, so the category is contested.",
  ],
  [
    "claim-ota-scottsdale",
    "scottsdale",
    "OTA",
    null,
    false,
    "Second Booking.com after-party target.",
  ],
  [
    "claim-cost-seg-summit",
    "summit26",
    "Cost segregation",
    null,
    false,
    "CSA did not claim it in their package. Worth offering before the regionals go on sale.",
  ],
] as const;

const SEED_ALERTS = [
  [
    "alert-lending",
    "warning",
    "Lending is unclaimed with two lenders in play",
    "Nobody holds lending exclusivity. The Mortgage Shop is proposed at Savvy Summit and Movement Mortgage is the likely Title buyer at Panama City Beach, and both are lenders.",
    "Whichever asks for exclusivity first constrains the other, so decide now whether the category is sold per event or across the portfolio rather than after a sponsor raises it.",
    "The Mortgage Shop proposed structure, Movement Mortgage PCB target",
  ],
  [
    "alert-headcount",
    "blocking",
    "Four registrant types are still empty",
    "Only the agent type has anyone in it. Staff and leadership, speakers, sponsor reps and approved plus ones all read zero, which means those people have not registered yet rather than that they are not coming.",
    "The catering guarantee is 60 against a working estimate near 68, and the gap is entirely in the four empty types.",
    "Prospectus, run of show, Tin Kitchen contract, Swoogo registrant types",
  ],
  [
    "alert-agreements",
    "blocking",
    "Two agreements carrying real money exist only as conversation",
    "Joe Rohne’s 25 percent revenue split and Parker Borofsky’s structured separately are both verbal.",
    "Writing the agent-host template once stops this repeating four more times.",
    "PCB terms, Tyler on Parker",
  ],
  [
    "alert-shares",
    "warning",
    "Four Tier 2 events have no share set",
    "Poconos, Smokies, Asheville and Scottsdale all sit blank. That is deliberate.",
    "Setting a tier-wide default would quietly commit Savvy before the partner agreement is written.",
    "PCB terms, agent host introductions",
  ],
  [
    "alert-q1",
    "warning",
    "Q1 2027 asks the same thirty companies for the same money three times",
    "Panama City Beach in January, Smokies in late February, Asheville in early March, then 37,500 to the Unconference in April.",
    "A bundled 2027 offer priced across multiple regionals is the other lever.",
    "Regional calendar, sponsor pool analysis",
  ],
  [
    "alert-deliverables",
    "warning",
    "Contracted sponsor deliverables are unbooked with weeks to go",
    "Ishita’s executive suite, welcome baskets and commercial shoot are all in the signed agreement and none are booked.",
    "The affiliate fee percentage is still blank in the signed PDF.",
    "Ishita Interiors title agreement",
  ],
  [
    "alert-pcb-table",
    "warning",
    "Panama tier table may be being quoted one column off",
    "Joe referenced Gold at 20,000 when 20,000 was the Title figure in the earlier table.",
    "Confirm which he is reading before he quotes a sponsor.",
    "PCB tier revision",
  ],
] as const;

async function ensureSeedData(db: any) {
  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(eventPortfolio);
  if (Number(countRow?.count ?? 0) > 0) return;

  const eventIds = new Map<string, number>();
  for (const seed of SEED_EVENTS) {
    const result = await db.insert(eventPortfolio).values({
      seedKey: seed.key,
      name: seed.name,
      tier: seed.tier,
      status: seed.status,
      startDate: sqlDate(seed.startDate),
      endDate: sqlDate(seed.endDate),
      city: seed.city,
      venue: seed.venue,
      ownerName: seed.ownerName,
      counterpart: seed.counterpart,
      registrationPlatform: seed.registrationPlatform,
      swoogoEventId: seed.swoogoEventId,
      revenueTarget:
        seed.revenueTarget === null ? null : String(seed.revenueTarget),
      revenueBooked: String(seed.revenueBooked),
      savvyRevenueShare:
        seed.savvyRevenueShare === null ? null : String(seed.savvyRevenueShare),
      shareStatus:
        "shareStatus" in seed
          ? (seed.shareStatus as "written" | "verbal")
          : null,
      committedCost:
        seed.committedCost === null ? null : String(seed.committedCost),
      headcountGuarantee:
        "headcountGuarantee" in seed ? seed.headcountGuarantee : null,
      headcountGuaranteeVendor:
        "headcountGuaranteeVendor" in seed
          ? seed.headcountGuaranteeVendor
          : null,
      workingHeadcount:
        "workingHeadcount" in seed ? seed.workingHeadcount : null,
      notes: seed.notes,
    });
    const eventId = Number(result[0].insertId);
    eventIds.set(seed.key, eventId);
    if ("components" in seed && seed.components) {
      await db
        .insert(eventHeadcountComponents)
        .values(
          seed.components.map(([label, count, sourceType]) => ({
            eventId,
            label,
            count,
            sourceType,
          }))
        );
    }
  }

  for (const [
    key,
    eventKey,
    dueDate,
    title,
    amountAtRisk,
    amountNote,
    isPayable,
    consequence,
  ] of SEED_OBLIGATIONS) {
    await db.insert(eventObligations).values({
      seedKey: key,
      eventId: eventIds.get(eventKey)!,
      dueDate: sqlDate(dueDate),
      title,
      amountAtRisk: amountAtRisk === null ? null : String(amountAtRisk),
      amountNote,
      isPayable,
      consequence,
    });
  }

  const sponsorIds = new Map<string, number>();
  for (const [
    key,
    companyName,
    category,
    contactName,
    notes,
    asks,
  ] of SEED_SPONSORS) {
    const result = await db
      .insert(eventSponsors)
      .values({ seedKey: key, companyName, category, contactName, notes });
    const sponsorId = Number(result[0].insertId);
    sponsorIds.set(key, sponsorId);
    await db.insert(eventSponsorAsks).values(
      asks.map(([eventKey, amount, stage]) => ({
        sponsorId,
        eventId: eventIds.get(eventKey)!,
        amount: amount === null ? null : String(amount),
        stage: stage as (typeof sponsorStages)[number],
      }))
    );
  }

  for (const [
    key,
    eventKey,
    category,
    holderName,
    isWritten,
    notes,
  ] of SEED_CLAIMS) {
    const matchingSponsorKey =
      holderName === "Ishita Interiors" ? "ishita" : undefined;
    await db.insert(eventExclusivityClaims).values({
      seedKey: key,
      eventId: eventIds.get(eventKey)!,
      category,
      sponsorId: matchingSponsorKey
        ? sponsorIds.get(matchingSponsorKey)
        : undefined,
      holderName,
      isWritten,
      notes,
    });
  }

  await db.insert(eventUnaffiliatedContacts).values({
    seedKey: "host-financial",
    companyName: "Host Financial",
    category: "Lending",
    contactName: "Adam Windham",
    notes:
      "No current affiliation. Holds no sponsorship, no exclusivity and no agreement of any kind. Kept here so the name stays findable and does not reappear in a sponsor total.",
  });

  await db.insert(eventAlerts).values(
    SEED_ALERTS.map(([key, level, title, body, secondaryBody, source]) => ({
      seedKey: key,
      level: level as "blocking" | "warning",
      title,
      body,
      secondaryBody,
      source,
    }))
  );
}

async function overviewData(db: any) {
  await ensureSeedData(db);
  const [
    events,
    components,
    obligations,
    sponsors,
    asks,
    claims,
    unaffiliated,
    alerts,
    syncActivity,
  ] = await Promise.all([
    db
      .select()
      .from(eventPortfolio)
      .orderBy(asc(eventPortfolio.startDate), asc(eventPortfolio.name)),
    db
      .select()
      .from(eventHeadcountComponents)
      .orderBy(asc(eventHeadcountComponents.id)),
    db
      .select()
      .from(eventObligations)
      .orderBy(asc(eventObligations.dueDate), asc(eventObligations.id)),
    db.select().from(eventSponsors).orderBy(asc(eventSponsors.companyName)),
    db.select().from(eventSponsorAsks),
    db
      .select()
      .from(eventExclusivityClaims)
      .orderBy(asc(eventExclusivityClaims.category)),
    db
      .select()
      .from(eventUnaffiliatedContacts)
      .orderBy(asc(eventUnaffiliatedContacts.companyName)),
    db
      .select()
      .from(eventAlerts)
      .where(eq(eventAlerts.isOpen, true))
      .orderBy(desc(eventAlerts.level), asc(eventAlerts.id)),
    db
      .select()
      .from(eventSwoogoSyncActivity)
      .orderBy(desc(eventSwoogoSyncActivity.receivedAt))
      .limit(10),
  ]);
  const componentsByEvent = new Map<number, any[]>();
  for (const component of components)
    componentsByEvent.set(component.eventId, [
      ...(componentsByEvent.get(component.eventId) ?? []),
      component,
    ]);
  const obligationsByEvent = new Map<number, any[]>();
  for (const obligation of obligations)
    obligationsByEvent.set(obligation.eventId, [
      ...(obligationsByEvent.get(obligation.eventId) ?? []),
      obligation,
    ]);
  const asksBySponsor = new Map<number, any[]>();
  for (const ask of asks)
    asksBySponsor.set(ask.sponsorId, [
      ...(asksBySponsor.get(ask.sponsorId) ?? []),
      ask,
    ]);
  const sponsorById = new Map(
    sponsors.map((sponsor: any) => [sponsor.id, sponsor])
  );

  return {
    events: events.map((event: any) => ({
      ...event,
      components: componentsByEvent.get(event.id) ?? [],
      obligations: obligationsByEvent.get(event.id) ?? [],
    })),
    sponsors: sponsors.map((sponsor: any) => ({
      ...sponsor,
      asks: asksBySponsor.get(sponsor.id) ?? [],
    })),
    claims: claims.map((claim: any) => ({
      ...claim,
      sponsor: claim.sponsorId
        ? (sponsorById.get(claim.sponsorId) ?? null)
        : null,
    })),
    unaffiliated,
    alerts,
    syncActivity,
    integration: getSwoogoConfigurationStatus(),
  };
}

const eventPatchSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  tier: z.number().int().min(1).max(4).optional(),
  status: z.enum(eventStatuses).optional(),
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  city: nullableText(255).optional(),
  venue: nullableText(255).optional(),
  ownerName: nullableText(255).optional(),
  counterpart: nullableText(255).optional(),
  registrationPlatform: nullableText(255).optional(),
  swoogoEventId: nullableText(128).optional(),
  revenueTarget: nullableMoney.optional(),
  revenueBooked: nullableMoney.optional(),
  savvyRevenueShare: z.number().finite().min(0).max(100).nullable().optional(),
  shareStatus: z.enum(shareStatuses).nullable().optional(),
  committedCost: nullableMoney.optional(),
  headcountGuarantee: z
    .number()
    .int()
    .min(0)
    .max(1_000_000)
    .nullable()
    .optional(),
  headcountGuaranteeVendor: nullableText(255).optional(),
  workingHeadcount: z
    .number()
    .int()
    .min(0)
    .max(1_000_000)
    .nullable()
    .optional(),
  notes: nullableText(20_000).optional(),
});

function patchEventForDatabase(patch: z.infer<typeof eventPatchSchema>) {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (
      [
        "revenueTarget",
        "revenueBooked",
        "savvyRevenueShare",
        "committedCost",
      ].includes(key)
    ) {
      next[key] = value === null ? null : String(value);
    } else if (["startDate", "endDate"].includes(key)) {
      next[key] = sqlDate(value as string | null);
    } else if (
      [
        "city",
        "venue",
        "ownerName",
        "counterpart",
        "registrationPlatform",
        "swoogoEventId",
        "headcountGuaranteeVendor",
        "notes",
      ].includes(key)
    ) {
      next[key] = typeof value === "string" ? stringOrNull(value) : value;
    } else {
      next[key] = value;
    }
  }
  return next;
}

async function assertExclusiveCategoryAvailable(
  db: any,
  input: { sponsorId: number; eventId: number }
) {
  const [sponsor] = await db
    .select()
    .from(eventSponsors)
    .where(eq(eventSponsors.id, input.sponsorId))
    .limit(1);
  if (!sponsor?.category) return;
  const [claim] = await db
    .select()
    .from(eventExclusivityClaims)
    .where(
      and(
        eq(eventExclusivityClaims.eventId, input.eventId),
        eq(eventExclusivityClaims.category, sponsor.category)
      )
    )
    .limit(1);
  if (!claim) return;
  const holder =
    claim.sponsorId === input.sponsorId ||
    (!claim.sponsorId && claim.holderName === sponsor.companyName);
  if (!holder && (claim.sponsorId || claim.holderName)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `${sponsor.category} exclusivity is already claimed for this event.`,
    });
  }
}

const pendingRecounts = new Map<string, NodeJS.Timeout>();
const RECOUNT_DEBOUNCE_MS = Math.max(
  1000,
  Number(process.env.RECOUNT_DEBOUNCE_MS) || 5000
);

/**
 * This is deliberately a verification-only recount queue. It preserves
 * acknowledge-first/debounced webhook semantics and retains a durable activity
 * record, but does not aggregate sources or overwrite components until Dustin
 * confirms whether speakers and sponsors also have registrant records.
 */
export async function queueSwoogoRecountVerification(input: {
  providerEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  const key = input.providerEventId;
  const existing = pendingRecounts.get(key);
  if (existing) clearTimeout(existing);
  pendingRecounts.set(
    key,
    setTimeout(() => {
      pendingRecounts.delete(key);
      void recordSwoogoVerification(input);
    }, RECOUNT_DEBOUNCE_MS)
  );
}

async function recordSwoogoVerification(input: {
  providerEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  try {
    const db = await database();
    const [event] = await db
      .select({ id: eventPortfolio.id })
      .from(eventPortfolio)
      .where(eq(eventPortfolio.swoogoEventId, input.providerEventId))
      .limit(1);
    await db.insert(eventSwoogoSyncActivity).values({
      eventId: event?.id ?? null,
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      status: "awaiting_source_confirmation",
      payload: input.payload,
    });
    console.info(
      `[Events/Swoogo] Debounced source verification recorded for provider event ${input.providerEventId}.`
    );
  } catch (error) {
    console.error(
      "[Events/Swoogo] Could not record source verification:",
      error instanceof Error ? error.message : error
    );
  }
}

export const eventsRouter = router({
  overview: protectedProcedure.query(async ({ ctx }) => {
    await requireEventsAccess(ctx.user);
    return overviewData(await database());
  }),

  integrationStatus: protectedProcedure.query(async ({ ctx }) => {
    await requireEventsAccess(ctx.user);
    return getSwoogoConfigurationStatus();
  }),

  createEvent: protectedProcedure
    .input(
      eventPatchSchema.extend({
        name: z.string().trim().min(1).max(255),
        tier: z.number().int().min(1).max(4).default(2),
        status: z.enum(eventStatuses).default("Idea"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireEventsAccess(ctx.user);
      const db = await database();
      const [result] = await db.insert(eventPortfolio).values({
        ...patchEventForDatabase(input),
        createdById: ctx.user.id,
        updatedById: ctx.user.id,
        revenueBooked:
          input.revenueBooked === undefined
            ? "0"
            : input.revenueBooked === null
              ? null
              : String(input.revenueBooked),
      } as any);
      return { id: Number(result.insertId), version: 1 };
    }),

  updateEvent: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        version: z.number().int().positive(),
        patch: eventPatchSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireEventsAccess(ctx.user);
      if (
        input.patch.startDate &&
        input.patch.endDate &&
        input.patch.endDate < input.patch.startDate
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "An event cannot end before it starts.",
        });
      }
      const db = await database();
      const result = await db
        .update(eventPortfolio)
        .set({
          ...patchEventForDatabase(input.patch),
          updatedById: ctx.user.id,
          version: sql`${eventPortfolio.version} + 1`,
        } as any)
        .where(
          and(
            eq(eventPortfolio.id, input.id),
            eq(eventPortfolio.version, input.version)
          )
        );
      versionedUpdate(result);
      return { version: input.version + 1 };
    }),

  deleteEvent: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        version: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireEventsAccess(ctx.user);
      const db = await database();
      const result = await db
        .delete(eventPortfolio)
        .where(
          and(
            eq(eventPortfolio.id, input.id),
            eq(eventPortfolio.version, input.version)
          )
        );
      versionedUpdate(result);
      return { success: true };
    }),

  createComponent: protectedProcedure
    .input(
      z.object({
        eventId: z.number().int().positive(),
        label: z.string().trim().min(1).max(255),
        count: z.number().int().min(0).max(1_000_000).nullable().default(null),
        sourceType: sourceType.default("Manual"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireEventsAccess(ctx.user);
      const db = await database();
      const [result] = await db.insert(eventHeadcountComponents).values(input);
      return { id: Number(result.insertId), version: 1 };
    }),

  updateComponent: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        version: z.number().int().positive(),
        patch: z.object({
          label: z.string().trim().min(1).max(255).optional(),
          count: z.number().int().min(0).max(1_000_000).nullable().optional(),
          sourceType: sourceType.optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireEventsAccess(ctx.user);
      const db = await database();
      const result = await db
        .update(eventHeadcountComponents)
        .set({
          ...input.patch,
          version: sql`${eventHeadcountComponents.version} + 1`,
        })
        .where(
          and(
            eq(eventHeadcountComponents.id, input.id),
            eq(eventHeadcountComponents.version, input.version)
          )
        );
      versionedUpdate(result);
      return { version: input.version + 1 };
    }),

  deleteComponent: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        version: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireEventsAccess(ctx.user);
      const db = await database();
      const result = await db
        .delete(eventHeadcountComponents)
        .where(
          and(
            eq(eventHeadcountComponents.id, input.id),
            eq(eventHeadcountComponents.version, input.version)
          )
        );
      versionedUpdate(result);
      return { success: true };
    }),

  createObligation: protectedProcedure
    .input(
      z.object({
        eventId: z.number().int().positive(),
        dueDate: isoDate.nullable().default(null),
        title: z.string().trim().min(1).max(255),
        amountAtRisk: nullableMoney.default(null),
        amountNote: nullableText(255).default(null),
        isPayable: z.boolean().default(true),
        ownerName: nullableText(255).default(null),
        status: z.string().trim().min(1).max(64).default("Open"),
        consequence: nullableText(20_000).default(null),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireEventsAccess(ctx.user);
      const db = await database();
      const [result] = await db
        .insert(eventObligations)
        .values({
          ...input,
          dueDate: sqlDate(input.dueDate),
          amountAtRisk:
            input.amountAtRisk === null ? null : String(input.amountAtRisk),
        });
      return { id: Number(result.insertId), version: 1 };
    }),

  updateObligation: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        version: z.number().int().positive(),
        patch: z.object({
          eventId: z.number().int().positive().optional(),
          dueDate: isoDate.nullable().optional(),
          title: z.string().trim().min(1).max(255).optional(),
          amountAtRisk: nullableMoney.optional(),
          amountNote: nullableText(255).optional(),
          isPayable: z.boolean().optional(),
          ownerName: nullableText(255).optional(),
          status: z.string().trim().min(1).max(64).optional(),
          consequence: nullableText(20_000).optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireEventsAccess(ctx.user);
      const db = await database();
      const patch = {
        ...input.patch,
        ...(input.patch.dueDate !== undefined
          ? { dueDate: sqlDate(input.patch.dueDate) }
          : {}),
        ...(input.patch.amountAtRisk !== undefined
          ? {
              amountAtRisk:
                input.patch.amountAtRisk === null
                  ? null
                  : String(input.patch.amountAtRisk),
            }
          : {}),
      };
      const result = await db
        .update(eventObligations)
        .set({ ...patch, version: sql`${eventObligations.version} + 1` } as any)
        .where(
          and(
            eq(eventObligations.id, input.id),
            eq(eventObligations.version, input.version)
          )
        );
      versionedUpdate(result);
      return { version: input.version + 1 };
    }),

  deleteObligation: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        version: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireEventsAccess(ctx.user);
      const db = await database();
      const result = await db
        .delete(eventObligations)
        .where(
          and(
            eq(eventObligations.id, input.id),
            eq(eventObligations.version, input.version)
          )
        );
      versionedUpdate(result);
      return { success: true };
    }),

  createSponsor: protectedProcedure
    .input(
      z.object({
        companyName: z.string().trim().min(1).max(255),
        category: nullableText(255).default(null),
        contactName: nullableText(255).default(null),
        notes: nullableText(20_000).default(null),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireEventsAccess(ctx.user);
      const db = await database();
      const [result] = await db.insert(eventSponsors).values(input);
      return { id: Number(result.insertId), version: 1 };
    }),

  updateSponsor: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        version: z.number().int().positive(),
        patch: z.object({
          companyName: z.string().trim().min(1).max(255).optional(),
          category: nullableText(255).optional(),
          contactName: nullableText(255).optional(),
          notes: nullableText(20_000).optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireEventsAccess(ctx.user);
      const db = await database();
      const result = await db
        .update(eventSponsors)
        .set({ ...input.patch, version: sql`${eventSponsors.version} + 1` })
        .where(
          and(
            eq(eventSponsors.id, input.id),
            eq(eventSponsors.version, input.version)
          )
        );
      versionedUpdate(result);
      return { version: input.version + 1 };
    }),

  deleteSponsor: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        version: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireEventsAccess(ctx.user);
      const db = await database();
      const result = await db
        .delete(eventSponsors)
        .where(
          and(
            eq(eventSponsors.id, input.id),
            eq(eventSponsors.version, input.version)
          )
        );
      versionedUpdate(result);
      return { success: true };
    }),

  upsertSponsorAsk: protectedProcedure
    .input(
      z.object({
        sponsorId: z.number().int().positive(),
        eventId: z.number().int().positive(),
        amount: nullableMoney,
        stage: z.enum(sponsorStages),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireEventsAccess(ctx.user);
      const db = await database();
      await assertExclusiveCategoryAvailable(db, input);
      const existing = await db
        .select()
        .from(eventSponsorAsks)
        .where(
          and(
            eq(eventSponsorAsks.sponsorId, input.sponsorId),
            eq(eventSponsorAsks.eventId, input.eventId)
          )
        )
        .limit(1);
      if (existing[0]) {
        await db
          .update(eventSponsorAsks)
          .set({
            amount: input.amount === null ? null : String(input.amount),
            stage: input.stage,
            version: sql`${eventSponsorAsks.version} + 1`,
          })
          .where(eq(eventSponsorAsks.id, existing[0].id));
        return { id: existing[0].id, version: existing[0].version + 1 };
      }
      const [result] = await db
        .insert(eventSponsorAsks)
        .values({
          ...input,
          amount: input.amount === null ? null : String(input.amount),
        });
      return { id: Number(result.insertId), version: 1 };
    }),

  deleteSponsorAsk: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        version: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireEventsAccess(ctx.user);
      const db = await database();
      const result = await db
        .delete(eventSponsorAsks)
        .where(
          and(
            eq(eventSponsorAsks.id, input.id),
            eq(eventSponsorAsks.version, input.version)
          )
        );
      versionedUpdate(result);
      return { success: true };
    }),

  createClaim: protectedProcedure
    .input(
      z.object({
        eventId: z.number().int().positive(),
        category: z.string().trim().min(1).max(255),
        sponsorId: z.number().int().positive().nullable().default(null),
        holderName: nullableText(255).default(null),
        isWritten: z.boolean().default(false),
        notes: nullableText(20_000).default(null),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireEventsAccess(ctx.user);
      const db = await database();
      const [result] = await db.insert(eventExclusivityClaims).values(input);
      return { id: Number(result.insertId), version: 1 };
    }),

  updateClaim: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        version: z.number().int().positive(),
        patch: z.object({
          eventId: z.number().int().positive().optional(),
          category: z.string().trim().min(1).max(255).optional(),
          sponsorId: z.number().int().positive().nullable().optional(),
          holderName: nullableText(255).optional(),
          isWritten: z.boolean().optional(),
          notes: nullableText(20_000).optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireEventsAccess(ctx.user);
      const db = await database();
      const result = await db
        .update(eventExclusivityClaims)
        .set({
          ...input.patch,
          version: sql`${eventExclusivityClaims.version} + 1`,
        })
        .where(
          and(
            eq(eventExclusivityClaims.id, input.id),
            eq(eventExclusivityClaims.version, input.version)
          )
        );
      versionedUpdate(result);
      return { version: input.version + 1 };
    }),

  deleteClaim: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        version: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireEventsAccess(ctx.user);
      const db = await database();
      const result = await db
        .delete(eventExclusivityClaims)
        .where(
          and(
            eq(eventExclusivityClaims.id, input.id),
            eq(eventExclusivityClaims.version, input.version)
          )
        );
      versionedUpdate(result);
      return { success: true };
    }),

  createUnaffiliated: protectedProcedure
    .input(
      z.object({
        companyName: z.string().trim().min(1).max(255),
        category: nullableText(255).default(null),
        contactName: nullableText(255).default(null),
        notes: nullableText(20_000).default(null),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireEventsAccess(ctx.user);
      const db = await database();
      const [result] = await db.insert(eventUnaffiliatedContacts).values(input);
      return { id: Number(result.insertId), version: 1 };
    }),

  updateUnaffiliated: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        version: z.number().int().positive(),
        patch: z.object({
          companyName: z.string().trim().min(1).max(255).optional(),
          category: nullableText(255).optional(),
          contactName: nullableText(255).optional(),
          notes: nullableText(20_000).optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireEventsAccess(ctx.user);
      const db = await database();
      const result = await db
        .update(eventUnaffiliatedContacts)
        .set({
          ...input.patch,
          version: sql`${eventUnaffiliatedContacts.version} + 1`,
        })
        .where(
          and(
            eq(eventUnaffiliatedContacts.id, input.id),
            eq(eventUnaffiliatedContacts.version, input.version)
          )
        );
      versionedUpdate(result);
      return { version: input.version + 1 };
    }),

  deleteUnaffiliated: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        version: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireEventsAccess(ctx.user);
      const db = await database();
      const result = await db
        .delete(eventUnaffiliatedContacts)
        .where(
          and(
            eq(eventUnaffiliatedContacts.id, input.id),
            eq(eventUnaffiliatedContacts.version, input.version)
          )
        );
      versionedUpdate(result);
      return { success: true };
    }),
});
