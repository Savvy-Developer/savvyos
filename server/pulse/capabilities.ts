import { canAdminUsePermission, type PulseCapabilityKey } from "../routers/permissions";

export type PulseCapability = PulseCapabilityKey;

/**
 * Pulse administration capabilities are resolved only from the SavvyOS Super
 * Permissions matrix. This helper intentionally has no meeting argument:
 * visibility remains exclusively governed by `visible_meeting_ids()`.
 */
export async function hasPulseCapability(
  user: { id: number; role: string; email?: string | null },
  capability: PulseCapability,
): Promise<boolean> {
  return canAdminUsePermission(user, capability);
}
