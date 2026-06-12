import { detectAllDuplicates, persistDuplicatePairs } from "../server/duplicateDetection.js";

const pairs = await detectAllDuplicates();
const inserted = await persistDuplicatePairs(pairs);
console.log(JSON.stringify({ ok: true, detected: pairs.length, inserted }));
process.exit(0);
