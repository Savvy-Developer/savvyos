import mysql from "mysql2/promise";

/**
 * One-time, source-controlled intake for the Accountability Chart. This list
 * deliberately contains only seats, reporting lines, and holders. It never
 * imports the exported Pulse R&R text; existing SavvyOS R&Rs remain the sole
 * responsibility records and are linked only when ownership is unambiguous.
 */
type SeatDefinition = {
  key: string;
  title: string;
  aliases?: readonly string[];
  parentKey?: string;
  sortOrder: number;
  holderAliases: ReadonlyArray<readonly string[]>;
};

type SeatRow = mysql.RowDataPacket & { id: number; title: string };
type UserRow = mysql.RowDataPacket & { id: number; name: string | null };
type HolderRow = mysql.RowDataPacket & { userId: number; seatId: number };
type ResponsibilityRow = mysql.RowDataPacket & { id: number; ownerId: number | null };

const person = (...aliases: string[]) => aliases;

const TYLER = person("Tyler Coon");
const PHIL = person("Phil Leone");
const ELANA = person("Elana Eirhart");
const DYL = person("Dyl Renken", "Dyl");
const NATALIA = person("Natalia");
const MORGAN = person("Morgan Loftus", "Morgan");
const HEART = person("Heart");

export const ACCOUNTABILITY_CHART_INTAKE_MARKER = "accountability_chart_intake_20261010";

export const ACCOUNTABILITY_CHART_INTAKE_SEATS: readonly SeatDefinition[] = [
  { key: "ceo", title: "CEO (Visionary Seat)", sortOrder: 0, holderAliases: [TYLER] },
  { key: "integrator", title: "Integrator / COO", parentKey: "ceo", sortOrder: 0, holderAliases: [PHIL] },
  { key: "ea-to-ceo", title: "EA to CEO", aliases: ["EA to CEO (Tyler)"], parentKey: "ceo", sortOrder: 1, holderAliases: [DYL] },
  { key: "eos", title: "EOS", aliases: ["EOS Tool Owner"], parentKey: "ceo", sortOrder: 2, holderAliases: [DYL] },
  { key: "office-manager", title: "Office Manager", parentKey: "ceo", sortOrder: 3, holderAliases: [DYL] },

  { key: "cso", title: "CSO - Chief Strategy Officer", parentKey: "integrator", sortOrder: 0, holderAliases: [ELANA] },
  { key: "director-operations", title: "Director of Operations", aliases: ["Sr. Director of Business Operations"], parentKey: "integrator", sortOrder: 1, holderAliases: [DYL] },
  { key: "cro", title: "CRO - Chief Revenue Officer", parentKey: "integrator", sortOrder: 2, holderAliases: [TYLER, ELANA, PHIL] },
  { key: "ea-to-phil", title: "EA to Phil", parentKey: "integrator", sortOrder: 3, holderAliases: [person("Rhythm Alarcon")] },

  { key: "director-technology", title: "Director of Technology", parentKey: "cso", sortOrder: 0, holderAliases: [ELANA] },
  { key: "finance", title: "Finance", parentKey: "cso", sortOrder: 1, holderAliases: [ELANA] },
  { key: "hr", title: "HR", parentKey: "cso", sortOrder: 2, holderAliases: [ELANA] },
  { key: "tech-va", title: "Tech VA", parentKey: "director-technology", sortOrder: 0, holderAliases: [person("Dhruv Chougle")] },

  { key: "events-coordinator", title: "Events Coordinator", parentKey: "director-operations", sortOrder: 0, holderAliases: [person("Dustin Uhrig")] },
  { key: "ea-to-elana", title: "EA to Elana", parentKey: "director-operations", sortOrder: 1, holderAliases: [person("Athens Demausa")] },
  { key: "business-operations", title: "Business Operations", parentKey: "director-operations", sortOrder: 2, holderAliases: [ELANA] },
  { key: "recruitment-va-ea", title: "Recruitment VA / EA to DOO", aliases: ["Recruitment VA/EA to DOO"], parentKey: "director-operations", sortOrder: 3, holderAliases: [HEART] },

  { key: "director-marketing", title: "Director of Marketing", parentKey: "cro", sortOrder: 0, holderAliases: [NATALIA] },
  { key: "agent-success-lead", title: "Agent Success Lead", parentKey: "cro", sortOrder: 1, holderAliases: [PHIL] },
  { key: "director-sales", title: "Director of Sales", parentKey: "cro", sortOrder: 2, holderAliases: [TYLER] },
  { key: "marketing-operations-lead", title: "Marketing Operations Lead", parentKey: "director-marketing", sortOrder: 0, holderAliases: [person("Cam Aguilar")] },
  { key: "marketing-assistant", title: "Marketing Assistant", parentKey: "director-marketing", sortOrder: 1, holderAliases: [person("Lou Victoria"), person("Queen Cerbo")] },

  { key: "sales-performance-coach", title: "Sales Performance Coach", parentKey: "agent-success-lead", sortOrder: 0, holderAliases: [person("Hunter Webb")] },
  { key: "director-expansion", title: "Director of Expansion", parentKey: "agent-success-lead", sortOrder: 1, holderAliases: [person("Trish Bartley")] },
  { key: "director-agent-success", title: "Director of Agent Success", parentKey: "agent-success-lead", sortOrder: 2, holderAliases: [person("Ashleigh Gillespie")] },
  { key: "ea-to-trish", title: "EA to Trish", parentKey: "director-expansion", sortOrder: 0, holderAliases: [person("Jona Mocam-Otom")] },

  { key: "agent-onboarding-specialist", title: "Agent Onboarding Specialist", parentKey: "director-sales", sortOrder: 0, holderAliases: [] },
  { key: "lead-conversion-analyst", title: "Lead Conversion & Systems Analyst", parentKey: "director-sales", sortOrder: 1, holderAliases: [person("Amy Rollins")] },
  { key: "strategic-partnerships", title: "Strategic Partnerships Manager", aliases: ["Director of Strategic Partnerships"], parentKey: "director-sales", sortOrder: 2, holderAliases: [MORGAN] },
  { key: "inside-sales-manager", title: "Inside Sales Manager", parentKey: "director-sales", sortOrder: 3, holderAliases: [person("Marcus Clay")] },
  { key: "isa-lead-va", title: "ISA Lead VA", parentKey: "strategic-partnerships", sortOrder: 0, holderAliases: [person("Mark Vincent Bayno")] },
  { key: "isas", title: "ISAs", parentKey: "inside-sales-manager", sortOrder: 0, holderAliases: [person("Jeremy Hooker")] },
  { key: "seller-isa", title: "Seller ISA", parentKey: "inside-sales-manager", sortOrder: 1, holderAliases: [person("Teylor Bouchard")] },
  { key: "lead-coordinator-assistant", title: "Lead Coordinator Assistant", parentKey: "inside-sales-manager", sortOrder: 2, holderAliases: [person("Alexis Fustanes")] },
  { key: "outbound-isa", title: "Outbound ISA", parentKey: "inside-sales-manager", sortOrder: 3, holderAliases: [person("Noeme Noeme")] },
  { key: "client-care-coordinator", title: "Client Care Coordinator", parentKey: "inside-sales-manager", sortOrder: 4, holderAliases: [] },

  { key: "ea-to-tyler", title: "EA to Tyler", parentKey: "ea-to-ceo", sortOrder: 0, holderAliases: [person("Kryzll Rae")] },
  { key: "va-team-co-lead", title: "VA Team Co-Lead", parentKey: "ea-to-ceo", sortOrder: 1, holderAliases: [person("Kryzll Rae")] },
];

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function findSeat(rows: SeatRow[], definition: SeatDefinition) {
  const names = new Set([definition.title, ...(definition.aliases ?? [])].map(normalize));
  return rows.find(row => names.has(normalize(row.title)));
}

function resolveUserId(users: UserRow[], aliases: readonly string[]) {
  for (const alias of aliases) {
    const exactMatches = users.filter(user => normalize(user.name) === normalize(alias));
    if (exactMatches.length === 1) return exactMatches[0].id;
  }

  for (const alias of aliases) {
    const requestedTokens = normalize(alias).split(" ").filter(Boolean);
    if (!requestedTokens.length) continue;
    const matches = users.filter(user => {
      const nameTokens = new Set(normalize(user.name).split(" ").filter(Boolean));
      return requestedTokens.every(token => nameTokens.has(token));
    });
    if (matches.length === 1) return matches[0].id;
  }

  return null;
}

export function uniqueSeatByHolder(holderRows: ReadonlyArray<{ userId: number; seatId: number }>) {
  const seatIdsByHolder = new Map<number, Set<number>>();
  for (const { userId, seatId } of holderRows) {
    const seatIds = seatIdsByHolder.get(userId) ?? new Set<number>();
    seatIds.add(seatId);
    seatIdsByHolder.set(userId, seatIds);
  }

  return new Map(
    Array.from(seatIdsByHolder.entries())
      .filter(([, seatIds]) => seatIds.size === 1)
      .map(([userId, seatIds]) => [userId, Array.from(seatIds)[0]])
  );
}

async function replaceSeatHolders(connection: mysql.Connection, seatId: number, holderIds: number[]) {
  await connection.execute("DELETE FROM `accountability_seat_holders` WHERE `seatId` = ?", [seatId]);
  for (let sortOrder = 0; sortOrder < holderIds.length; sortOrder += 1) {
    const userId = holderIds[sortOrder];
    await connection.execute(
      "INSERT INTO `accountability_seat_holders` (`seatId`, `userId`, `sortOrder`) VALUES (?, ?, ?)",
      [seatId, userId, sortOrder]
    );
  }
}

async function removeChiefOfStaff(connection: mysql.Connection, ceoSeatId: number) {
  const [rows] = await connection.query<SeatRow[]>(
    "SELECT `id`, `title` FROM `accountability_seats` WHERE lower(`title`) LIKE '%chief of staff%'"
  );

  for (const seat of rows) {
    // Retain any unexpected child seats while removing the obsolete seat itself.
    await connection.execute(
      "UPDATE `accountability_seats` SET `parentSeatId` = ? WHERE `parentSeatId` = ?",
      [ceoSeatId, seat.id]
    );
    // No legacy R&R is copied or rewritten. A linked item becomes visible in
    // the directory's Needs seat assignment queue for a deliberate decision.
    await connection.execute(
      "UPDATE `roles_responsibilities` SET `seatId` = NULL WHERE `seatId` = ?",
      [seat.id]
    );
    await connection.execute("DELETE FROM `accountability_seats` WHERE `id` = ?", [seat.id]);
  }
}

async function linkOnlyUnambiguousResponsibilities(connection: mysql.Connection, seedSeatIds: number[]) {
  if (!seedSeatIds.length) return { linked: 0, leftForReview: 0 };
  const placeholders = seedSeatIds.map(() => "?").join(", ");
  const [holderRows] = await connection.execute<HolderRow[]>(
    `SELECT \`userId\`, \`seatId\` FROM \`accountability_seat_holders\` WHERE \`seatId\` IN (${placeholders})`,
    seedSeatIds
  );
  const uniqueSeats = uniqueSeatByHolder(holderRows);
  const [responsibilities] = await connection.query<ResponsibilityRow[]>(
    "SELECT `id`, `ownerId` FROM `roles_responsibilities` WHERE `seatId` IS NULL"
  );

  let linked = 0;
  let leftForReview = 0;
  for (const responsibility of responsibilities) {
    const seatId = responsibility.ownerId == null ? undefined : uniqueSeats.get(responsibility.ownerId);
    if (seatId == null) {
      leftForReview += 1;
      continue;
    }
    await connection.execute("UPDATE `roles_responsibilities` SET `seatId` = ? WHERE `id` = ?", [seatId, responsibility.id]);
    linked += 1;
  }
  return { linked, leftForReview };
}

async function applyAccountabilityChartIntake() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  const connection = await mysql.createConnection(databaseUrl);
  try {
    const [markers] = await connection.execute<mysql.RowDataPacket[]>(
      "SELECT `id` FROM `activity_log` WHERE `action` = ? AND `entityType` = ? LIMIT 1",
      [ACCOUNTABILITY_CHART_INTAKE_MARKER, "accountability_chart"]
    );
    if (markers.length) return;

    await connection.beginTransaction();
    try {
      const [existingSeats] = await connection.query<SeatRow[]>(
        "SELECT `id`, `title` FROM `accountability_seats`"
      );
      const [activeUsers] = await connection.query<UserRow[]>(
        "SELECT `id`, `name` FROM `users` WHERE `isActive` = 1"
      );
      const seatIdByKey = new Map<string, number>();
      const unresolvedHolders: string[] = [];

      for (const definition of ACCOUNTABILITY_CHART_INTAKE_SEATS) {
        const parentSeatId = definition.parentKey == null ? null : seatIdByKey.get(definition.parentKey);
        if (definition.parentKey != null && parentSeatId == null) {
          throw new Error(`Missing seeded parent seat: ${definition.parentKey}`);
        }

        const existing = findSeat(existingSeats, definition);
        let seatId: number;
        if (existing) {
          seatId = existing.id;
          await connection.execute(
            "UPDATE `accountability_seats` SET `title` = ?, `parentSeatId` = ?, `sortOrder` = ? WHERE `id` = ?",
            [definition.title, parentSeatId, definition.sortOrder, seatId]
          );
        } else {
          const [result] = await connection.execute<mysql.ResultSetHeader>(
            "INSERT INTO `accountability_seats` (`title`, `parentSeatId`, `sortOrder`) VALUES (?, ?, ?)",
            [definition.title, parentSeatId, definition.sortOrder]
          );
          seatId = Number(result.insertId);
          existingSeats.push({ id: seatId, title: definition.title } as SeatRow);
        }

        const holderIds = definition.holderAliases.flatMap(aliases => {
          const userId = resolveUserId(activeUsers, aliases);
          if (userId == null) {
            unresolvedHolders.push(`${definition.title}: ${aliases[0]}`);
            return [];
          }
          return [userId];
        });
        await replaceSeatHolders(connection, seatId, Array.from(new Set(holderIds)));
        seatIdByKey.set(definition.key, seatId);
      }

      await removeChiefOfStaff(connection, seatIdByKey.get("ceo")!);
      const rrs = await linkOnlyUnambiguousResponsibilities(connection, Array.from(seatIdByKey.values()));
      await connection.execute(
        "INSERT INTO `activity_log` (`action`, `entityType`, `details`) VALUES (?, ?, ?)",
        [
          ACCOUNTABILITY_CHART_INTAKE_MARKER,
          "accountability_chart",
          JSON.stringify({
            seatsSeeded: ACCOUNTABILITY_CHART_INTAKE_SEATS.length,
            responsibilitiesLinked: rrs.linked,
            responsibilitiesLeftForReview: rrs.leftForReview,
            unresolvedHolders,
          }),
        ]
      );
      await connection.commit();
      console.info(
        `[AccountabilityChart] One-time intake applied: ${ACCOUNTABILITY_CHART_INTAKE_SEATS.length} seats, ${rrs.linked} R&Rs linked, ${rrs.leftForReview} R&Rs left for seat review.`
      );
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.end();
  }
}

let readiness: Promise<void> | null = null;

export function ensureAccountabilityChartIntake() {
  readiness ??= applyAccountabilityChartIntake();
  return readiness;
}
