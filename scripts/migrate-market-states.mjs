import mysql from 'mysql2/promise';

const STATE_MAP = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
};

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.query('SELECT id, name, state FROM market_profiles');
  
  let updated = 0;
  let skipped = 0;
  
  for (const row of rows) {
    const current = row.state?.trim();
    if (!current) continue;
    
    // Already a 2-letter code
    if (/^[A-Z]{2}$/.test(current)) {
      console.log(`  SKIP id=${row.id} "${row.name}": already "${current}"`);
      skipped++;
      continue;
    }
    
    // Try full name match
    const code = STATE_MAP[current];
    if (code) {
      await conn.query('UPDATE market_profiles SET state = ? WHERE id = ?', [code, row.id]);
      console.log(`  UPDATE id=${row.id} "${row.name}": "${current}" → "${code}"`);
      updated++;
    } else {
      console.log(`  NO MATCH id=${row.id} "${row.name}": "${current}" — leaving as-is`);
      skipped++;
    }
  }
  
  console.log(`\nDone: ${updated} updated, ${skipped} skipped`);
  await conn.end();
}

run().catch(console.error);
