import mysql from "mysql2/promise";
import fs from "fs";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ── Create tables ──────────────────────────────────────────────────────────────
await conn.execute(`
  CREATE TABLE IF NOT EXISTS us_states (
    code VARCHAR(2) PRIMARY KEY,
    name VARCHAR(100) NOT NULL
  )
`);
console.log("us_states table ready.");

await conn.execute(`
  CREATE TABLE IF NOT EXISTS us_counties (
    id INT AUTO_INCREMENT PRIMARY KEY,
    stateCode VARCHAR(2) NOT NULL,
    name VARCHAR(150) NOT NULL,
    FOREIGN KEY (stateCode) REFERENCES us_states(code) ON DELETE CASCADE
  )
`);
console.log("us_counties table ready.");

await conn.execute(`
  CREATE TABLE IF NOT EXISTS market_counties (
    id INT AUTO_INCREMENT PRIMARY KEY,
    marketProfileId INT NOT NULL,
    countyId INT NOT NULL,
    FOREIGN KEY (marketProfileId) REFERENCES market_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (countyId) REFERENCES us_counties(id) ON DELETE CASCADE
  )
`);
console.log("market_counties table ready.");

// ── Seed all 50 US states + DC ─────────────────────────────────────────────────
const states = [
  ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],
  ["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["FL","Florida"],["GA","Georgia"],
  ["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],
  ["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],
  ["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],
  ["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],
  ["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],
  ["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],
  ["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],
  ["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"],
  ["DC","District of Columbia"],
];

for (const [code, name] of states) {
  await conn.execute(
    "INSERT INTO us_states (code, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name)",
    [code, name]
  );
}
console.log(`Seeded ${states.length} states.`);

// ── Seed counties ──────────────────────────────────────────────────────────────
const sql = fs.readFileSync(new URL("./county-seed.sql", import.meta.url), "utf-8");
const statements = sql.split("\n").filter(l => l.startsWith("INSERT"));
let count = 0;
for (const stmt of statements) {
  await conn.execute(stmt);
  count++;
  if (count % 500 === 0) console.log(`  ${count}/${statements.length} counties...`);
}
console.log(`Seeded ${count} county entries.`);

await conn.end();
console.log("Migration complete.");
