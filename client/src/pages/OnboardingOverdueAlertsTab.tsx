import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Mail, Save, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function OnboardingOverdueAlertsTab() {
  const utils = trpc.useUtils();
  const { data: settings, isLoading } =
    trpc.onboarding.getOverdueAlertSettings.useQuery();
  const { data: adminUsers = [] } = trpc.users.list.useQuery({
    role: "admin",
  });
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<number[]>(
    []
  );
  const [includeAffectedAgent, setIncludeAffectedAgent] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setSelectedRecipientIds(settings.recipientUserIds);
    setIncludeAffectedAgent(settings.includeAffectedAgent);
  }, [
    settings,
    settings?.recipientUserIds.join(","),
    settings?.includeAffectedAgent,
  ]);

  const saveSettings = trpc.onboarding.updateOverdueAlertSettings.useMutation({
    onSuccess: async () => {
      await utils.onboarding.getOverdueAlertSettings.invalidate();
      toast.success("Onboarding overdue alert settings saved");
    },
    onError: error => toast.error(error.message),
  });

  const activeAdmins = adminUsers.filter(
    (admin: any) => admin.isActive !== false && Boolean(admin.email)
  );
  const isEnabled = settings?.isEnabled ?? false;

  function save(isEnabledForSave = isEnabled) {
    if (
      isEnabledForSave &&
      selectedRecipientIds.length === 0 &&
      !includeAffectedAgent
    ) {
      toast.error(
        "Select an admin recipient or include the affected agent before turning alerts on"
      );
      return;
    }
    saveSettings.mutate({
      recipientUserIds: selectedRecipientIds,
      includeAffectedAgent,
      isEnabled: isEnabledForSave,
    });
  }

  function toggleAdmin(adminId: number, checked: boolean) {
    setSelectedRecipientIds(current =>
      checked
        ? Array.from(new Set([...current, adminId]))
        : current.filter(id => id !== adminId)
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-amber-500/25 bg-amber-500/[0.03]">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <div className="rounded-lg bg-amber-100 p-2.5 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">Onboarding overdue alerts</h2>
                <Badge variant={isEnabled ? "default" : "secondary"}>
                  {isEnabled ? "Sending" : "Off"}
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Choose exactly which active administrators receive the daily
                alert, then decide whether each affected agent receives a
                private reminder for their own overdue tasks.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-auto">
            <Label htmlFor="onboarding-overdue-enabled" className="text-sm">
              Send alerts
            </Label>
            <Switch
              id="onboarding-overdue-enabled"
              checked={isEnabled}
              onCheckedChange={checked => save(checked)}
              disabled={isLoading || saveSettings.isPending}
              aria-label="Turn onboarding overdue alerts on or off"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5 p-5">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h3 className="font-medium">Administrator recipients</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Selected administrators receive the complete overdue checklist for
              each affected agent. Only active administrators with an email
              address can be selected.
            </p>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading recipients…</p>
          ) : activeAdmins.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No active administrators with email addresses are available.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {activeAdmins.map((admin: any) => {
                const selected = selectedRecipientIds.includes(admin.id);
                return (
                  <label
                    key={admin.id}
                    className="flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selected}
                      onCheckedChange={checked =>
                        toggleAdmin(admin.id, Boolean(checked))
                      }
                      aria-label={`Send overdue onboarding alerts to ${admin.name ?? admin.email}`}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {admin.name ?? admin.email}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {admin.email}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <div className="rounded-lg bg-blue-100 p-2.5 text-blue-700">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-medium">Affected-agent copy</h3>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Send each affected agent a private email listing only their own
                overdue, agent-assigned onboarding tasks. This does not expose
                other agents’ checklists.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-auto">
            <Label htmlFor="include-affected-agent" className="text-sm">
              Include agents
            </Label>
            <Switch
              id="include-affected-agent"
              checked={includeAffectedAgent}
              onCheckedChange={setIncludeAffectedAgent}
              disabled={isLoading || saveSettings.isPending}
              aria-label="Include affected agents in onboarding overdue alerts"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Alert delivery remains off until you turn on{" "}
          <strong>Send alerts</strong>. Saving lets you prepare the recipient
          list first.
        </p>
        <Button
          onClick={() => save()}
          disabled={isLoading || saveSettings.isPending}
        >
          <Save className="mr-2 h-4 w-4" />
          {saveSettings.isPending ? "Saving…" : "Save recipients"}
        </Button>
      </div>
    </div>
  );
}
