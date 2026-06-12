/**
 * Seed script: realistic SavvyOS test data for audit
 * Run: node scripts/seed-audit-data.mjs
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);

// ─── Users ────────────────────────────────────────────────────────────────────
// Existing: Tyler(1/admin), DevAdmin(360001), DevISA(360002), DevAgent(360003), Elana(420023/admin)
// Add: 3 agents + 1 more ISA
const NOW = new Date().toISOString().slice(0, 19).replace("T", " ");

console.log("Seeding users...");
await db.query(`
  INSERT IGNORE INTO users (id, openId, name, email, role, isActive, createdAt, updatedAt, lastSignedIn) VALUES
  (500001, 'manual_agent_sarah', 'Sarah Mitchell', 'sarah@savvyagents.dev', 'agent', 1, '${NOW}', '${NOW}', '${NOW}'),
  (500002, 'manual_agent_james', 'James Rivera', 'james@savvyagents.dev', 'agent', 1, '${NOW}', '${NOW}', '${NOW}'),
  (500003, 'manual_agent_priya', 'Priya Patel', 'priya@savvyagents.dev', 'agent', 1, '${NOW}', '${NOW}', '${NOW}'),
  (500004, 'manual_isa_marcus', 'Marcus Thompson', 'marcus@savvyagents.dev', 'isa', 1, '${NOW}', '${NOW}', '${NOW}')
`);

// ─── Lead Sources ─────────────────────────────────────────────────────────────
console.log("Seeding lead sources...");
await db.query(`
  INSERT IGNORE INTO lead_sources (id, name, parentId, campaignType, isActive, createdAt, updatedAt) VALUES
  (100, 'Online Portals', NULL, 'both', 1, '${NOW}', '${NOW}'),
  (101, 'Zillow', 100, 'buyer', 1, '${NOW}', '${NOW}'),
  (102, 'Realtor.com', 100, 'buyer', 1, '${NOW}', '${NOW}'),
  (103, 'Airbnb', 100, 'seller', 1, '${NOW}', '${NOW}'),
  (110, 'Social Media', NULL, 'both', 1, '${NOW}', '${NOW}'),
  (111, 'Instagram', 110, 'both', 1, '${NOW}', '${NOW}'),
  (112, 'Facebook', 110, 'both', 1, '${NOW}', '${NOW}'),
  (120, 'Referral', NULL, 'both', 1, '${NOW}', '${NOW}'),
  (121, 'Past Client', 120, 'both', 1, '${NOW}', '${NOW}'),
  (122, 'Agent Referral', 120, 'both', 1, '${NOW}', '${NOW}')
`);

// ─── Contacts ─────────────────────────────────────────────────────────────────
console.log("Seeding contacts...");
await db.query(`
  INSERT IGNORE INTO contacts (id, firstName, lastName, email, phone, leadSourceId, assignedIsaId, notes, createdAt, updatedAt) VALUES
  (2001, 'Brandon', 'Walsh', 'brandon.walsh@email.com', '615-555-0101', 101, 360002, 'Interested in Smoky Mountains area STR', '${NOW}', '${NOW}'),
  (2002, 'Chloe', 'Martinez', 'chloe.m@email.com', '615-555-0102', 101, 360002, 'Budget $450k-$600k, wants pool', '${NOW}', '${NOW}'),
  (2003, 'Derek', 'Johnson', 'derek.j@email.com', '615-555-0103', 102, 360002, 'Looking in Gatlinburg, flexible timeline', '${NOW}', '${NOW}'),
  (2004, 'Emily', 'Chen', 'emily.chen@email.com', '615-555-0104', 111, 500004, 'Instagram DM lead, very motivated', '${NOW}', '${NOW}'),
  (2005, 'Frank', 'Nguyen', 'frank.n@email.com', '615-555-0105', 121, 500004, 'Past client referral from 2023', '${NOW}', '${NOW}'),
  (2006, 'Grace', 'Kim', 'grace.kim@email.com', '615-555-0106', 103, 360002, 'Airbnb host looking to sell and upgrade', '${NOW}', '${NOW}'),
  (2007, 'Henry', 'Brown', 'henry.b@email.com', '615-555-0107', 112, 500004, 'Facebook ad lead, first-time STR buyer', '${NOW}', '${NOW}'),
  (2008, 'Isabella', 'Davis', 'isabella.d@email.com', '615-555-0108', 101, 360002, 'Zillow inquiry, $800k budget', '${NOW}', '${NOW}'),
  (2009, 'Jack', 'Wilson', 'jack.w@email.com', '615-555-0109', 122, 500004, 'Referred by Dev Agent, investor', '${NOW}', '${NOW}'),
  (2010, 'Karen', 'Taylor', 'karen.t@email.com', '615-555-0110', 101, 360002, 'Zillow lead, wants cabin with hot tub', '${NOW}', '${NOW}'),
  (2011, 'Liam', 'Anderson', 'liam.a@email.com', '615-555-0111', 111, 500004, 'Instagram story lead', '${NOW}', '${NOW}'),
  (2012, 'Mia', 'Thomas', 'mia.t@email.com', '615-555-0112', 102, 360002, 'Realtor.com inquiry, seller looking to 1031', '${NOW}', '${NOW}')
`);

// ─── Agent Connections ────────────────────────────────────────────────────────
console.log("Seeding agent connections...");
await db.query(`
  INSERT IGNORE INTO agent_connections (id, contactId, agentId, pipelineStatus, minPrice, maxPrice, minBeds, minBaths, targetCities, strRequirements, createdAt, updatedAt) VALUES
  (3001, 2001, 360003, 'active_client', 400000, 600000, 3, 2, '["Gatlinburg","Pigeon Forge"]', 'Wants high occupancy area', '${NOW}', '${NOW}'),
  (3002, 2002, 360003, 'active_client', 450000, 600000, 4, 3, '["Sevierville"]', 'Pool required, hot tub preferred', '${NOW}', '${NOW}'),
  (3003, 2003, 500001, 'nurture', 300000, 450000, 2, 2, '["Gatlinburg"]', 'Flexible, no urgency', '${NOW}', '${NOW}'),
  (3004, 2004, 500001, 'active_client', 500000, 750000, 4, 3, '["Pigeon Forge","Gatlinburg"]', 'Very motivated, pre-approved', '${NOW}', '${NOW}'),
  (3005, 2005, 500002, 'under_contract', 600000, 800000, 5, 4, '["Wears Valley"]', 'Past client, knows the market', '${NOW}', '${NOW}'),
  (3006, 2006, 500002, 'active_client', 350000, 500000, 3, 2, '["Sevierville"]', 'Selling current STR first', '${NOW}', '${NOW}'),
  (3007, 2007, 500003, 'nurture', 250000, 400000, 2, 1, '["Gatlinburg"]', 'First-time buyer, needs education', '${NOW}', '${NOW}'),
  (3008, 2008, 500003, 'active_client', 700000, 900000, 5, 4, '["Wears Valley","Townsend"]', 'High budget, wants luxury', '${NOW}', '${NOW}'),
  (3009, 2009, 360003, 'closed', 550000, 700000, 4, 3, '["Pigeon Forge"]', 'Investor, bought 2 properties', '${NOW}', '${NOW}'),
  (3010, 2010, 500001, 'active_client', 400000, 550000, 3, 2, '["Gatlinburg"]', 'Cabin with hot tub required', '${NOW}', '${NOW}')
`);

// ─── Properties ───────────────────────────────────────────────────────────────
console.log("Seeding properties...");
await db.query(`
  INSERT IGNORE INTO properties (id, address, city, state, zip, propertyType, beds, baths, sqft, listPrice, strNotes, notes, createdAt, updatedAt) VALUES
  (4001, '123 Mountain View Dr', 'Gatlinburg', 'TN', '37738', 'cabin', 4, 3, 2200, 520000, 'Hot tub, game room, mountain views', 'STR active, high occupancy', '${NOW}', '${NOW}'),
  (4002, '456 Smoky Ridge Ln', 'Pigeon Forge', 'TN', '37863', 'cabin', 3, 2, 1800, 385000, 'Pool access, near Dollywood', 'Good STR location', '${NOW}', '${NOW}'),
  (4003, '789 Wears Valley Rd', 'Sevierville', 'TN', '37862', 'vacation_rental', 5, 4, 3100, 695000, 'Luxury STR, sleeps 12', 'Premium property', '${NOW}', '${NOW}'),
  (4004, '321 Creekside Ct', 'Gatlinburg', 'TN', '37738', 'cabin', 2, 2, 1200, 295000, 'Cozy couples cabin, high occupancy', 'Great reviews', '${NOW}', '${NOW}')
`);

// ─── Transactions ─────────────────────────────────────────────────────────────
console.log("Seeding transactions...");
await db.query(`
  INSERT IGNORE INTO transactions (id, primaryContactId, agentId, propertyId, transactionType, status, purchasePrice, commissionRate, grossCommissionIncome, contractDate, closingDate, notes, createdAt, updatedAt) VALUES
  (5001, 2009, 360003, 4001, 'buyer', 'closed', 520000, 0.03, 15600, '2026-02-01', '2026-03-01', 'Smooth closing, investor client', '${NOW}', '${NOW}'),
  (5002, 2005, 500002, 4002, 'buyer', 'under_contract', 385000, 0.03, 11550, '2026-03-10', NULL, 'Under contract, closing April 15', '${NOW}', '${NOW}'),
  (5003, 2012, 500001, 4003, 'seller', 'active', 695000, 0.025, 17375, NULL, NULL, 'Listing agreement signed', '${NOW}', '${NOW}')
`);

// ─── Transaction Payout Items ─────────────────────────────────────────────────
console.log("Seeding payout items...");
await db.query(`
  INSERT IGNORE INTO transaction_payout_items (id, transactionId, payeeType, payeeUserId, payeeName, percentage, amount, isPaid, createdAt, updatedAt) VALUES
  (6001, 5001, 'agent', 360003, 'Dev Agent', 2.4, 12480, 1, '${NOW}', '${NOW}'),
  (6002, 5001, 'savvy_str_agents', NULL, 'Savvy STR Agents', 0.4, 2080, 1, '${NOW}', '${NOW}'),
  (6003, 5001, 'exp', NULL, 'Exp', 0.2, 1040, 1, '${NOW}', '${NOW}'),
  (6004, 5002, 'agent', 500002, 'James Rivera', 2.4, 9240, 0, '${NOW}', '${NOW}'),
  (6005, 5002, 'savvy_str_agents', NULL, 'Savvy STR Agents', 0.4, 1540, 0, '${NOW}', '${NOW}'),
  (6006, 5002, 'exp', NULL, 'Exp', 0.2, 770, 0, '${NOW}', '${NOW}')
`);

// ─── Tasks ────────────────────────────────────────────────────────────────────
console.log("Seeding tasks...");
await db.query(`
  INSERT IGNORE INTO tasks (id, title, description, assignedToId, createdById, relatedContactId, status, priority, dueDate, createdAt, updatedAt) VALUES
  (7001, 'Follow up with Brandon Walsh', 'Call to discuss Gatlinburg listings', 360003, 360002, 2001, 'pending', 'high', DATE_ADD(NOW(), INTERVAL 1 DAY), '${NOW}', '${NOW}'),
  (7002, 'Send Chloe Martinez listings', 'Email 3 Sevierville pool properties', 360003, 360002, 2002, 'pending', 'medium', DATE_ADD(NOW(), INTERVAL 2 DAY), '${NOW}', '${NOW}'),
  (7003, 'Schedule showing for Emily Chen', 'She wants to see 2 properties this weekend', 500001, 500004, 2004, 'pending', 'high', DATE_ADD(NOW(), INTERVAL 1 DAY), '${NOW}', '${NOW}'),
  (7004, 'Buy box intake for Jack Wilson', 'Fill out buy box details for new investor client', 360003, 360002, 2009, 'completed', 'medium', DATE_SUB(NOW(), INTERVAL 5 DAY), '${NOW}', '${NOW}'),
  (7005, 'Review offer for Frank Nguyen', 'Review and submit offer on Pigeon Forge property', 500002, 500004, 2005, 'pending', 'urgent', DATE_ADD(NOW(), INTERVAL 0 DAY), '${NOW}', '${NOW}'),
  (7006, 'ISA follow-up: Grace Kim', 'Check in on selling timeline', 500004, 500004, 2006, 'pending', 'medium', DATE_ADD(NOW(), INTERVAL 3 DAY), '${NOW}', '${NOW}'),
  (7007, 'Overdue: Call Henry Brown', 'First-time buyer needs education call', 500003, 360002, 2007, 'pending', 'low', DATE_SUB(NOW(), INTERVAL 2 DAY), '${NOW}', '${NOW}')
`);

// ─── Communications ───────────────────────────────────────────────────────────
console.log("Seeding communications...");
await db.query(`
  INSERT IGNORE INTO communications (id, relatedContactId, type, subject, body, authorId, communicatedAt) VALUES
  (8001, 2001, 'call', 'Initial call', 'Spoke for 20 min. Brandon is serious, wants to close by summer. Prefers Gatlinburg.', 360002, '${NOW}'),
  (8002, 2001, 'email', 'Listings sent', 'Sent 4 Gatlinburg listings in $400-600k range.', 360003, '${NOW}'),
  (8003, 2002, 'note', 'Pool requirement confirmed', 'Chloe confirmed pool is non-negotiable. Hot tub preferred.', 360002, '${NOW}'),
  (8004, 2004, 'sms', 'Showing confirmation', 'Emily confirmed Saturday 10am showing at 123 Mountain View Dr.', 500001, '${NOW}'),
  (8005, 2005, 'call', 'Offer strategy call', 'Frank wants to offer asking price to secure the deal. Closing target April 15.', 500002, '${NOW}'),
  (8006, 2009, 'note', 'Transaction closed', 'Jack closed on 123 Mountain View Dr. Very happy. Asked about 2nd property.', 360003, '${NOW}')
`);

// ─── Groups ───────────────────────────────────────────────────────────────────
console.log("Seeding groups...");
await db.query(`
  INSERT IGNORE INTO \`groups\` (id, name, leaderId, createdAt, updatedAt) VALUES
  (9001, 'Smoky Mountains Team', 360003, '${NOW}', '${NOW}'),
  (9002, 'East Tennessee Team', 500001, '${NOW}', '${NOW}')
`);
await db.query(`
  INSERT IGNORE INTO group_members (groupId, userId, createdAt) VALUES
  (9001, 500002, '${NOW}'),
  (9002, 500003, '${NOW}')
`);

console.log("✅ Seed complete!");
await db.end();
