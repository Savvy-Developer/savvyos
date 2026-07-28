/**
 * useAgentContactNav
 *
 * For agent users: looks up the agent's own pipeline connection for a given
 * contactId and returns a navigate function that goes to /pipeline/:connectionId.
 *
 * For non-agent users: returns a navigate function that goes to /contacts/:contactId.
 *
 * Usage:
 *   const goToContact = useAgentContactNav();
 *   <button onClick={() => goToContact(contact.id)}>...</button>
 */

import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "./useAuth";

/**
 * Returns a stable navigate function.
 * - Agents → /pipeline/:connectionId  (looks up connection on demand)
 * - Others → /contacts/:contactId
 */
export function useAgentContactNav() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const isAgent = user?.role === "agent";

  return async (contactId: number) => {
    if (!isAgent) {
      navigate(`/contacts/${contactId}`);
      return;
    }

    // Fetch the agent's connection for this contact (uses tRPC cache if available)
    try {
      const result = await utils.agentConnections.list.fetch({
        contactId,
        limit: 1,
      });
      const connectionId = result?.rows?.[0]?.connection?.id;
      if (connectionId) {
        navigate(`/pipeline/${connectionId}`);
      }
      // If no connection exists, do nothing (agent has no pipeline entry for this contact)
    } catch {
      // silently ignore
    }
  };
}
