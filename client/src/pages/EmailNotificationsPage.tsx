/**
 * Email Notifications Admin Page — v2
 *
 * Shows all system email notifications with live DB-backed enable/disable toggles.
 * Each toggle persists to the `email_notification_settings` table via tRPC.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Mail, Search, Bell, Zap, Clock, CheckCircle2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EmailTestPage from "./EmailTestPage";

// ─── Static metadata ──────────────────────────────────────────────────────────

type Recipient = "Agent" | "Admin" | "ISA" | "Agent + Admin" | "Mentioned User";
type Category = "Transactions" | "Listings" | "Tasks" | "Leads & CRM" | "Onboarding" | "Market Match" | "Commission" | "Projects" | "Recognition";
type TriggerType = "Event" | "Scheduled";

interface NotifMeta {
  id: string;
  name: string;
  description: string;
  trigger: string;
  triggerType: TriggerType;
  recipient: Recipient;
  category: Category;
}

const NOTIFICATIONS: NotifMeta[] = [
  // ── Leads & CRM ──────────────────────────────────────────────────────────
  { id: "lead_assigned", name: "Lead Assigned to Agent", description: "Sent to the agent when a contact is connected to them via the pipeline.", trigger: "Agent connection created (admin or ISA assigns a contact to an agent)", triggerType: "Event", recipient: "Agent", category: "Leads & CRM" },
  { id: "connection_request_approved", name: "Connection Request Approved", description: "Sent to the agent when their connection request for an existing contact is approved.", trigger: "Admin or ISA approves a connection request", triggerType: "Event", recipient: "Agent", category: "Leads & CRM" },
  { id: "client_intro", name: "Client Introduction Email", description: "Sent to the investor/client to introduce them to their assigned agent.", trigger: "Agent connection created and client intro is triggered", triggerType: "Event", recipient: "Agent", category: "Leads & CRM" },
  // ── Transactions ──────────────────────────────────────────────────────────
  { id: "transaction_created", name: "Transaction Created", description: "Notifies the agent when a new transaction is created and linked to them.", trigger: "New transaction created with an assigned agent", triggerType: "Event", recipient: "Agent", category: "Transactions" },
  { id: "transaction_status_changed", name: "Transaction Status Changed", description: "Notifies the agent when the status of one of their transactions changes.", trigger: "Transaction status updated", triggerType: "Event", recipient: "Agent", category: "Transactions" },
  { id: "transaction_closed", name: "Transaction Closed", description: "Notifies the agent when their transaction is marked as Closed.", trigger: "Transaction status set to 'closed'", triggerType: "Event", recipient: "Agent", category: "Transactions" },
  // ── Commission ────────────────────────────────────────────────────────────
  { id: "commission_calculated", name: "Commission Calculated", description: "Notifies the payee when their commission payout has been calculated.", trigger: "Commission payout record created for a payee", triggerType: "Event", recipient: "Agent", category: "Commission" },
  { id: "payout_integrity_fail", name: "Payout Integrity Failure", description: "Alerts when a payout calculation fails integrity checks.", trigger: "Payout integrity check fails during transaction update", triggerType: "Event", recipient: "Agent + Admin", category: "Commission" },
  { id: "commission_exception_warning", name: "Commission Exception Warning", description: "Notifies the agent when a commission exception is flagged.", trigger: "Commission exception created or status changed", triggerType: "Event", recipient: "Agent", category: "Commission" },
  // ── Listings ──────────────────────────────────────────────────────────────
  { id: "listing_created", name: "Listing Created", description: "Notifies the agent when a new listing is created and assigned to them.", trigger: "New listing created with an assigned agent", triggerType: "Event", recipient: "Agent", category: "Listings" },
  { id: "listing_expiration_reminder", name: "Listing Expiration Reminder", description: "Warns the agent that their listing is approaching its expiration date.", trigger: "Nightly scheduler — fires when a listing's expiration date is within 14 days", triggerType: "Scheduled", recipient: "Agent", category: "Listings" },
  // ── Tasks ─────────────────────────────────────────────────────────────────
  { id: "task_assigned", name: "Task Assigned", description: "Notifies a user when a task is assigned to them.", trigger: "Task created or updated with a new assignee", triggerType: "Event", recipient: "Agent", category: "Tasks" },
  { id: "task_due", name: "Task Due Reminder", description: "Reminds the assignee that a task is due soon.", trigger: "Scheduled — fires when a task's due date is approaching", triggerType: "Scheduled", recipient: "Agent", category: "Tasks" },
  // ── Onboarding ────────────────────────────────────────────────────────────
  { id: "onboarding_overdue", name: "Onboarding Overdue Alert", description: "Alerts the agent and their admin when onboarding tasks are overdue.", trigger: "Nightly scheduler — fires when onboarding tasks are past their due date", triggerType: "Scheduled", recipient: "Agent + Admin", category: "Onboarding" },
  // ── Market Match ──────────────────────────────────────────────────────────
  { id: "market_match_intro", name: "Market Match Intro", description: "Sends a branded introduction email to the investor after a Market Match call.", trigger: "Market Match call completed and intro triggered by ISA or admin", triggerType: "Event", recipient: "Agent", category: "Market Match" },
  // ── Projects ──────────────────────────────────────────────────────────────────────────────────────
  { id: "pm_mention", name: "Project Mention Notification", description: "Notifies a user when they are @mentioned in a project note or comment.", trigger: "@mention detected in a project note", triggerType: "Event", recipient: "Mentioned User", category: "Projects" },
  // ── Recognition ──────────────────────────────────────────────────────────────────────────────────
  { id: "birthday_recognition", name: "Birthday Recognition Email", description: "Sends a birthday recognition email to agents who have opted in via their Extended Profile (Birthday Recognition Opt-In toggle). The agent's birthday is set in their profile.", trigger: "Nightly scheduler — fires on the agent's birthday (matching month/day)", triggerType: "Scheduled", recipient: "Agent", category: "Recognition" },
  { id: "anniversary_recognition", name: "Work Anniversary Recognition Email", description: "Sends a work anniversary recognition email to agents who have opted in via their Extended Profile (Anniversary Recognition Opt-In toggle). The work anniversary date is set in their profile.", trigger: "Nightly scheduler — fires on the agent's Work Anniversary Date (matching month/day)", triggerType: "Scheduled", recipient: "Agent", category: "Recognition" },
];
const CATEGORIES: Category[] = ["Transactions", "Listings", "Tasks", "Leads & CRM", "Onboarding", "Market Match", "Commission", "Projects", "Recognition"];
const CATEGORY_COLORS: Record<Category, string> = {
  "Transactions": "bg-blue-100 text-blue-700",
  "Listings": "bg-purple-100 text-purple-700",
  "Tasks": "bg-amber-100 text-amber-700",
  "Leads & CRM": "bg-emerald-100 text-emerald-700",
  "Onboarding": "bg-cyan-100 text-cyan-700",
  "Market Match": "bg-indigo-100 text-indigo-700",
  "Commission": "bg-rose-100 text-rose-700",
  "Projects": "bg-orange-100 text-orange-700",
  "Recognition": "bg-pink-100 text-pink-700",
};

const RECIPIENT_COLORS: Record<Recipient, string> = {
  "Agent": "bg-slate-100 text-slate-700",
  "Admin": "bg-red-100 text-red-700",
  "ISA": "bg-violet-100 text-violet-700",
  "Agent + Admin": "bg-orange-100 text-orange-700",
  "Mentioned User": "bg-teal-100 text-teal-700",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function EmailNotificationsPage() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [triggerFilter, setTriggerFilter] = useState<string>("all");

  // Live settings from DB
  const { data: settings = [], isLoading, refetch } = trpc.emailNotifications.list.useQuery();
  const toggleMutation = trpc.emailNotifications.toggle.useMutation({
    onSuccess: () => { refetch(); },
    onError: (err) => { toast.error(`Failed to update: ${err.message}`); refetch(); },
  });

  // Build a quick lookup map: notificationKey → isEnabled
  const enabledMap = new Map<string, boolean>(
    settings.map((s: { notificationKey: string; isEnabled: boolean }) => [s.notificationKey, s.isEnabled])
  );

  function isEnabled(id: string): boolean {
    // Default to true if not yet seeded
    return enabledMap.has(id) ? enabledMap.get(id)! : true;
  }

  function handleToggle(id: string, newValue: boolean) {
    // Optimistic: update local map immediately via refetch after mutation
    toggleMutation.mutate({ notificationKey: id, isEnabled: newValue });
  }

  const filtered = NOTIFICATIONS.filter((n) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || n.name.toLowerCase().includes(q) || n.description.toLowerCase().includes(q) || n.trigger.toLowerCase().includes(q);
    const matchesCategory = categoryFilter === "all" || n.category === categoryFilter;
    const matchesTrigger = triggerFilter === "all" || n.triggerType === triggerFilter;
    return matchesSearch && matchesCategory && matchesTrigger;
  });

  const totalEnabled = NOTIFICATIONS.filter((n) => isEnabled(n.id)).length;
  const eventCount = NOTIFICATIONS.filter((n) => n.triggerType === "Event").length;
  const scheduledCount = NOTIFICATIONS.filter((n) => n.triggerType === "Scheduled").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email Notifications"
        subtitle="Manage which automated email notifications SavvyOS sends"
      />
      <Tabs defaultValue="notifications" className="space-y-6">
        <TabsList>
          <TabsTrigger value="notifications">Notification Settings</TabsTrigger>
          <TabsTrigger value="test">Email Test</TabsTrigger>
        </TabsList>
        <TabsContent value="test"><EmailTestPage /></TabsContent>
        <TabsContent value="notifications">

      {/* Summary KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <Mail className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-xl font-bold">{NOTIFICATIONS.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Enabled</p>
              <p className="text-xl font-bold">{isLoading ? "—" : totalEnabled}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100">
              <Zap className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Event-Triggered</p>
              <p className="text-xl font-bold">{eventCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100">
              <Clock className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Scheduled</p>
              <p className="text-xl font-bold">{scheduledCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search notifications…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={triggerFilter} onValueChange={setTriggerFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Triggers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Triggers</SelectItem>
            <SelectItem value="Event">Event-Triggered</SelectItem>
            <SelectItem value="Scheduled">Scheduled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Notification Cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No notifications match your filters.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((n) => {
            const enabled = isEnabled(n.id);
            return (
              <Card key={n.id} className={`transition-shadow hover:shadow-sm ${!enabled ? "opacity-60" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className={`p-2 rounded-lg shrink-0 ${n.triggerType === "Scheduled" ? "bg-purple-100" : "bg-amber-100"}`}>
                      {n.triggerType === "Scheduled" ? (
                        <Clock className="h-4 w-4 text-purple-600" />
                      ) : (
                        <Zap className="h-4 w-4 text-amber-600" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-semibold text-sm">{n.name}</h3>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 border-0 ${CATEGORY_COLORS[n.category]}`}>
                          {n.category}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 border-0 ${RECIPIENT_COLORS[n.recipient]}`}>
                          → {n.recipient}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 border-0 ${n.triggerType === "Scheduled" ? "bg-purple-50 text-purple-600" : "bg-amber-50 text-amber-600"}`}>
                          {n.triggerType}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-1.5">{n.description}</p>
                      <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <Zap className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/60" />
                        <span><span className="font-medium text-foreground/70">Trigger:</span> {n.trigger}</span>
                      </div>
                    </div>

                    {/* Toggle */}
                    <div className="shrink-0 flex flex-col items-center gap-1.5">
                      <Switch
                        checked={enabled}
                        onCheckedChange={(val) => handleToggle(n.id, val)}
                        disabled={toggleMutation.isPending}
                        aria-label={`Toggle ${n.name}`}
                      />
                      <span className={`text-[10px] font-medium ${enabled ? "text-emerald-600" : "text-muted-foreground"}`}>
                        {enabled ? "On" : "Off"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Footer count */}
      <p className="text-xs text-muted-foreground text-center pb-4">
        Showing {filtered.length} of {NOTIFICATIONS.length} notifications &bull; {totalEnabled} enabled
      </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
