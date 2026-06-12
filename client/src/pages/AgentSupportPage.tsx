import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, UserCheck, Users, ArrowRight } from "lucide-react";
import { toast } from "sonner";

function getInitials(name: string | null | undefined) {
  if (!name) return "U";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function AgentSupportPage() {
  const { user, workAsAgent, isWorkingAsAgent, isWorkingAsAgentLoading } = useAuth();
  const role = (user as any)?.role;

  const { data: assignedAgents = [], isLoading } = trpc.agentSupport.myAssignedAgents.useQuery(
    undefined,
    { enabled: role === "agent_support" }
  );

  if (role !== "agent_support") {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Access restricted to Agent Support users.</p>
      </div>
    );
  }

  const handleWorkAs = async (agentId: number, agentName: string | null) => {
    try {
      await workAsAgent(agentId);
      toast.success(`Now working as ${agentName ?? "agent"} — the page will reload.`);
      setTimeout(() => window.location.reload(), 800);
    } catch {
      toast.error("Failed to switch to agent view");
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agent Support Portal</h1>
        <p className="text-muted-foreground mt-1">
          Select an agent below to work on their behalf. A teal banner will appear while you are
          operating as that agent.
        </p>
      </div>

      {/* Current status */}
      {isWorkingAsAgent && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm text-teal-800">
          <UserCheck className="inline h-4 w-4 mr-1.5 -mt-0.5" />
          You are currently working as{" "}
          <strong>{(user as any)?.name ?? "an agent"}</strong>. Use the banner at the top of the
          page to stop.
        </div>
      )}

      {/* Assigned agents list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Your Assigned Agents
          </CardTitle>
          <CardDescription>
            You have access to work on behalf of the following agents.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : assignedAgents.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No agents assigned yet.</p>
              <p className="text-xs mt-1">Contact an admin to get assigned to agents.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(assignedAgents as any[]).map((item: any) => (
                <div
                  key={item.assignmentId}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 transition-colors"
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-[oklch(0.74_0.14_200)]/20 text-[oklch(0.4_0.14_200)] font-semibold text-sm">
                      {getInitials(item.agentName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.agentName ?? "Unnamed Agent"}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.agentEmail ?? "—"}</p>
                    {item.agentTitle && (
                      <p className="text-xs text-muted-foreground truncate">{item.agentTitle}</p>
                    )}
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[10px] bg-blue-100 text-blue-700">
                    Agent
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1.5"
                    disabled={isWorkingAsAgentLoading}
                    onClick={() => handleWorkAs(item.agentId, item.agentName)}
                  >
                    {isWorkingAsAgentLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ArrowRight className="h-3.5 w-3.5" />
                    )}
                    Work as {item.agentName?.split(" ")[0] ?? "Agent"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
