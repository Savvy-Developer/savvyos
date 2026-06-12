import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { UserCog, UserCheck, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-amber-100 text-amber-800",
  isa: "bg-purple-100 text-purple-800",
  agent: "bg-blue-100 text-blue-800",
};

function getInitials(name: string | null | undefined) {
  if (!name) return "U";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ─── Impersonation Banner (admin simulation) ─────────────────────────────────
export function SimulationBanner() {
  const { isSimulating, isWorkingAsAgent, user, realUser, stopSimulation, isSimulatingLoading } = useAuth();

  // Don't show the admin simulation banner when agent_support is working as agent
  // (the WorkAsAgentBanner handles that case)
  if (!isSimulating || isWorkingAsAgent) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-orange-500 text-white flex items-center justify-between px-4 py-2 text-sm font-medium shadow-lg">
      <div className="flex items-center gap-2">
        <UserCog className="h-4 w-4 shrink-0" />
        <span>
          Simulating as{" "}
          <strong>{(user as any)?.name ?? "Unknown"}</strong>
          {" "}
          <span className="opacity-80 font-normal">
            ({(user as any)?.role ?? "—"})
          </span>
        </span>
      </div>
      <button
        type="button"
        onClick={() => stopSimulation().catch(() => toast.error("Failed to exit simulation"))}
        disabled={isSimulatingLoading}
        className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 rounded-md px-3 py-1 text-white text-xs font-semibold transition-colors disabled:opacity-50"
      >
        {isSimulatingLoading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <X className="h-3 w-3" />
        )}
        Exit Simulation
      </button>
    </div>
  );
}

// ─── Work-As-Agent Banner (agent_support impersonating an agent) ──────────────
export function WorkAsAgentBanner() {
  const { isWorkingAsAgent, user, realUser, stopWorkingAsAgent, isWorkingAsAgentLoading } = useAuth();

  if (!isWorkingAsAgent) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-teal-600 text-white flex items-center justify-between px-4 py-2 text-sm font-medium shadow-lg">
      <div className="flex items-center gap-2">
        <UserCheck className="h-4 w-4 shrink-0" />
        <span>
          Working as{" "}
          <strong>{(user as any)?.name ?? "Unknown"}</strong>
          {" "}
          <span className="opacity-80 font-normal">
            — Agent Support: {(realUser as any)?.name ?? ""}
          </span>
        </span>
      </div>
      <button
        type="button"
        onClick={() =>
          stopWorkingAsAgent().catch(() => toast.error("Failed to stop working as agent"))
        }
        disabled={isWorkingAsAgentLoading}
        className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 rounded-md px-3 py-1 text-white text-xs font-semibold transition-colors disabled:opacity-50"
      >
        {isWorkingAsAgentLoading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <X className="h-3 w-3" />
        )}
        Stop Working as Agent
      </button>
    </div>
  );
}

// ─── Simulate As Button (shown in sidebar for tyler@savvy.realty) ─────────────
export function SimulateAsButton({ collapsed }: { collapsed: boolean }) {
  const { canSimulate, simulateAs, isSimulatingLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: users = [] } = trpc.users.list.useQuery(undefined, {
    enabled: open && canSimulate,
  });

  if (!canSimulate) return null;

  const filtered = users.filter((u: any) => {
    const q = search.toLowerCase();
    return (
      (u.name ?? "").toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q) ||
      (u.role ?? "").toLowerCase().includes(q)
    );
  });

  const handleSelect = async (userId: number) => {
    try {
      await simulateAs(userId);
      setOpen(false);
      toast.success("Now simulating — the page will reload to apply the new role.");
      // Small delay so the toast is visible, then reload to re-render the correct portal
      setTimeout(() => window.location.reload(), 800);
    } catch {
      toast.error("Failed to simulate as this user");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={collapsed ? "Simulate As" : undefined}
        className="w-full flex items-center gap-2.5 px-2 py-[9px] rounded-md text-sm transition-colors text-left text-orange-500 hover:bg-orange-50 hover:text-orange-600"
      >
        <UserCog className="h-[16px] w-[16px] shrink-0" />
        {!collapsed && (
          <span className="truncate leading-tight flex-1">Simulate As</span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Simulate As</DialogTitle>
            <DialogDescription>
              Select a user to view the app from their perspective. An orange banner will appear so you always know you're in simulation mode.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2">
            <input
              type="text"
              placeholder="Search by name, email, or role…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
          </div>

          <div className="mt-3 space-y-1 max-h-72 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No users found</p>
            )}
            {filtered.map((u: any) => (
              <button
                key={u.id}
                type="button"
                onClick={() => handleSelect(u.id)}
                disabled={isSimulatingLoading}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition-colors text-left disabled:opacity-50"
              >
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-amber-500 text-white text-xs font-semibold">
                    {getInitials(u.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.name ?? "Unnamed"}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email ?? "—"}</p>
                </div>
                <Badge
                  variant="secondary"
                  className={`text-[10px] shrink-0 ${ROLE_COLORS[u.role] ?? ""}`}
                >
                  {u.role}
                </Badge>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
