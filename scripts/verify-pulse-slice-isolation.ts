import mysql from "mysql2/promise";
import { getUsersByRole } from "../server/db";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const connection = await mysql.createConnection({ uri: url });
let passed = false;
try {
  const [fixtures] = await connection.query<any[]>(`
    SELECT id, name, isActive
    FROM users
    WHERE openId LIKE 'pulse_slice_fixture_%'
    ORDER BY name
  `);
  const agents = await getUsersByRole("agent");
  const leakedFixtures = agents.filter((agent: any) => String(agent.openId).startsWith("pulse_slice_fixture_"));
  const activeFixtures = fixtures.filter((fixture) => Boolean(fixture.isActive));

  if (activeFixtures.length || leakedFixtures.length) {
    throw new Error(`Pulse Slice isolation failed: ${activeFixtures.length} active fixture(s), ${leakedFixtures.length} fixture(s) in Agent selectors.`);
  }
  passed = true;
  console.log(`Pulse Slice isolation passed: ${fixtures.length} retired fixture user(s), none returned by the Agent selector.`);
} finally {
  await connection.end();
}
if (passed) process.exit(0);
