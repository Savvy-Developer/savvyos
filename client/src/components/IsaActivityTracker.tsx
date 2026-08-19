import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

/**
 * Records first-party navigation events for ISA users. The server derives the
 * action and entity type from the pathname, so client code cannot attribute an
 * event to another user or fabricate an entity type.
 */
export default function IsaActivityTracker() {
  const { user } = useAuth();
  const [location] = useLocation();
  const lastTrackedPath = useRef<string | null>(null);
  const trackNavigation = trpc.users.trackIsaNavigation.useMutation();

  useEffect(() => {
    if (user?.role !== "isa" || !location || location === lastTrackedPath.current) {
      return;
    }

    lastTrackedPath.current = location;
    trackNavigation.mutate({ path: location });
  }, [location, trackNavigation, user?.role]);

  return null;
}
