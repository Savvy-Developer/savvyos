/**
 * Temporary Permission Grant Expiry Scheduler
 *
 * Runs every 15 minutes. For each admin_permissions row that has a non-null
 * tempGrantExpiry JSON map, it checks each key's ISO timestamp. If the
 * timestamp is in the past, it revokes that permission (sets the boolean
 * column to false) and removes the key from the expiry map.
 */

import { getDb } from "./db";
import { adminPermissions } from "../drizzle/schema";
import { ADMIN_NAV_PERMISSIONS } from "./routers/permissions";
import { isNotNull } from "drizzle-orm";

export async function revokeExpiredTempGrants(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const now = new Date();

    // Fetch all rows that have a tempGrantExpiry value
    const rows = await db
      .select()
      .from(adminPermissions)
      .where(isNotNull(adminPermissions.tempGrantExpiry));

    const validKeys = new Set<string>(ADMIN_NAV_PERMISSIONS.map((p) => p.key));

    for (const row of rows) {
      const expiry = row.tempGrantExpiry as Record<string, string> | null;
      if (!expiry || typeof expiry !== "object") continue;

      const updatedExpiry: Record<string, string> = { ...expiry };
      const updates: Record<string, boolean | null | Record<string, string>> = {};
      let hasChanges = false;

      for (const [key, isoTs] of Object.entries(expiry)) {
        if (!validKeys.has(key)) {
          // Unknown key — clean it up
          delete updatedExpiry[key];
          hasChanges = true;
          continue;
        }

        const expiresAt = new Date(isoTs);
        if (isNaN(expiresAt.getTime())) {
          delete updatedExpiry[key];
          hasChanges = true;
          continue;
        }

        if (expiresAt <= now) {
          // Expired — revoke the permission
          updates[key] = false;
          delete updatedExpiry[key];
          hasChanges = true;
          console.log(`[TempGrant] Revoking ${key} for userId=${row.userId} (expired at ${isoTs})`);
        }
      }

      if (hasChanges) {
        updates.tempGrantExpiry = Object.keys(updatedExpiry).length > 0 ? updatedExpiry : null;
        await db
          .update(adminPermissions)
          .set(updates as any)
          .where(
            (await import("drizzle-orm")).eq(adminPermissions.userId, row.userId)
          );
      }
    }
  } catch (err) {
    console.error("[TempGrantScheduler] Error:", err);
  }
}

export function scheduleTempGrantExpiry(): void {
  // Run every 15 minutes
  setInterval(() => {
    revokeExpiredTempGrants().catch((err) =>
      console.error("[TempGrantScheduler] Interval error:", err)
    );
  }, 15 * 60 * 1000);

  // Run once shortly after startup to catch anything that expired while server was down
  setTimeout(() => {
    revokeExpiredTempGrants().catch((err) =>
      console.error("[TempGrantScheduler] Startup error:", err)
    );
  }, 8_000);
}
