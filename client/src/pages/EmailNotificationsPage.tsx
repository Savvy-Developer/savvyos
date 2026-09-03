/**
 * Email Notifications Admin Page — v2
 *
 * Shows all system email notifications with live DB-backed enable/disable toggles.
 * Each toggle persists to the `email_notification_settings` table via tRPC.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Mail, Search, Bell, Zap, Clock, CheckCircle2, Plus, UsersRound } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EmailTestPage from "./EmailTestPage";
import EmailNotificationBuilderDialog, { type CustomNotificationFormValues } from "@/components/EmailNotificationBuilderDialog";

// ─── Static metadata ──────────────────────────────────────────────────────────

type Recipient = "Agent" | "Admin" | "ISA" | "Agent + Admin" | "Agent + Client" | "Assigned Agent" | "Assigned User" | "Transaction Payee" | "Listing Agent" | "Brokerage Owner" | "Transaction Client" | "Assigned Agent + Coach" | "Client + Assigned Agent" | "Assigned Agent + Optional Client Copy" | "Active Admins" | "Active Admins + ISAs + Agents" | "Designated Leadership" | "Full-User Agent" | "Coached Agent" | "Coach + Leaders" | "Pulse Member(s)" | "Pulse Work Assignee(s)" | "Mentioned User" | "Partner" | "Account Holder" | "Marketing Team + Creator" | "Reporting Manager" | "Requesting Employee" | "Vendor" | "Vendor Agent + Designated Leadership" | "Not Currently Sent";
type Category = "Transactions" | "Listings" | "Tasks" | "Leads & CRM" | "Onboarding" | "Market Match" | "Commission" | "Projects" | "Pulse" | "Partner & Access" | "Account Security" | "Marketing" | "Reporting" | "PTO";
type TriggerType = "Event" | "Scheduled";

interface NotifMeta {
  id: string;
  name: string;
  description: string;
  trigger: string;
  triggerType: TriggerType;
  recipient: Recipient;
  category: Category;
  customId?: number;
  isEnabled?: boolean;
}

const NOTIFICATIONS: NotifMeta[] = [
  // ── Leads & CRM ──────────────────────────────────────────────────────────
  { id: "lead_assigned", name: "Lead Assigned to Agent", description: "Sent only to the agent newly connected to the contact via the pipeline, including the original lead source and a concise client-context briefing when CRM history is available.", trigger: "Agent connection created (admin or ISA assigns a contact to an agent)", triggerType: "Event", recipient: "Assigned Agent", category: "Leads & CRM" },
  { id: "connection_request_approved", name: "Connection Request Approved", description: "Sent only to the agent whose request for an existing contact was approved.", trigger: "Admin or ISA approves a connection request", triggerType: "Event", recipient: "Assigned Agent", category: "Leads & CRM" },
  { id: "client_intro", name: "Client Introduction Email", description: "Sent to the investor/client, with their assigned agent copied, when an introduction is requested.", trigger: "Agent connection created and client intro is triggered", triggerType: "Event", recipient: "Client + Assigned Agent", category: "Leads & CRM" },
  { id: "website_deeper_analysis_request", name: "Website Deeper Analysis Handoff", description: "Sent to the assigned agent, with the requesting client copied, including the agent's call link.", trigger: "An investor requests deeper analysis from a savvy-agents.com property page", triggerType: "Event", recipient: "Client + Assigned Agent", category: "Leads & CRM" },
  { id: "website_financing_request", name: "Website Financing Handoff", description: "Sent to the assigned agent, with the requesting client copied, including the agent's call link.", trigger: "An investor requests financing information from a savvy-agents.com property page", triggerType: "Event", recipient: "Client + Assigned Agent", category: "Leads & CRM" },
  { id: "website_showing_request", name: "Website Showing Handoff", description: "Sent to the assigned agent, with the requesting client copied, including the agent's call link.", trigger: "An investor requests a showing from a savvy-agents.com property page", triggerType: "Event", recipient: "Client + Assigned Agent", category: "Leads & CRM" },
  // ── Transactions ──────────────────────────────────────────────────────────
  { id: "transaction_created", name: "Transaction Created", description: "Sent only to the agent assigned to the new transaction.", trigger: "New transaction created with an assigned agent", triggerType: "Event", recipient: "Assigned Agent", category: "Transactions" },
  { id: "transaction_status_changed", name: "Transaction Status Changed", description: "Sent only to the agent assigned to the transaction whose status changed.", trigger: "Transaction status updated", triggerType: "Event", recipient: "Assigned Agent", category: "Transactions" },
  { id: "transaction_closed", name: "Transaction Closed", description: "Sent only to the agent assigned to the transaction when it is marked Closed.", trigger: "Transaction status set to 'closed'", triggerType: "Event", recipient: "Assigned Agent", category: "Transactions" },
  // ── Reporting ──────────────────────────────────────────────────────────────
  { id: "agent_production_report", name: "Agent Production Report", description: "Sends the current under-contract and closed production table to every active administrator.", trigger: "Every Friday at 6:00 PM Eastern", triggerType: "Scheduled", recipient: "Active Admins", category: "Reporting" },
  { id: "vendor_featured_payment_invitation", name: "Featured Vendor Payment Invitation", description: "Sends a unique Stripe-hosted monthly checkout link to the vendor selected by an agent, with the published public Vendor List link when one is available.", trigger: "Agent selects Invite to Pay on a vendor", triggerType: "Event", recipient: "Vendor", category: "Reporting" },
  { id: "vendor_featured_payment_received", name: "Featured Vendor Payment Received", description: "Confirms to the agent that a Stripe payment was received and the vendor is now marked Featured on their Vendor List.", trigger: "Stripe confirms a successful Featured Vendor invoice", triggerType: "Event", recipient: "Assigned Agent", category: "Reporting" },
  { id: "vendor_featured_payment_failed", name: "Featured Vendor Payment Alert", description: "Alerts the Vendor List agent and Tyler, Elana, Dyl, and Kryzll when a Stripe payment fails or a subscription becomes past due, unpaid, paused, canceled, or incomplete.", trigger: "Stripe billing event requires vendor follow-up", triggerType: "Event", recipient: "Vendor Agent + Designated Leadership", category: "Reporting" },
  { id: "monthly_featured_vendor_earnings", name: "Featured Vendor Leadership Earnings", description: "Summarizes prior-month collections, each agent’s 75% amount due, and Savvy’s 25% share for Tyler, Elana, Dyl, and Kryzll.", trigger: "1st of each month at 9:00 AM Eastern", triggerType: "Scheduled", recipient: "Designated Leadership", category: "Reporting" },
  { id: "agent_featured_vendor_earnings", name: "Featured Vendor Agent Earnings", description: "Sends each agent a private, itemized statement of their 75% earnings from successful Featured vendor payments.", trigger: "1st of each month at 9:00 AM Eastern", triggerType: "Scheduled", recipient: "Assigned Agent", category: "Reporting" },
  // ── Commission ────────────────────────────────────────────────────────────
  { id: "commission_calculated", name: "Commission Calculated", description: "Sent only to the person recorded as the commission payout payee.", trigger: "Commission payout record created for a payee", triggerType: "Event", recipient: "Transaction Payee", category: "Commission" },
  { id: "payout_integrity_fail", name: "Payout Integrity Failure", description: "Sent only to the assigned transaction agent when a payout integrity check fails.", trigger: "Payout integrity check fails during transaction update", triggerType: "Event", recipient: "Assigned Agent", category: "Commission" },
  { id: "commission_exception_warning", name: "Commission Exception Warning", description: "Sent to the brokerage owner when commission guardrails are breached.", trigger: "Commission exception created or status changed", triggerType: "Event", recipient: "Brokerage Owner", category: "Commission" },
  // ── Listings ──────────────────────────────────────────────────────────────
  { id: "listing_created", name: "Listing Created", description: "Sent only to the agent assigned to the new listing.", trigger: "New listing created with an assigned agent", triggerType: "Event", recipient: "Listing Agent", category: "Listings" },
  { id: "listing_expiration_reminder", name: "Listing Expiration Reminder", description: "Sent only to the agent assigned to the listing approaching expiration.", trigger: "Nightly scheduler — fires when a listing's expiration date is within 14 days", triggerType: "Scheduled", recipient: "Listing Agent", category: "Listings" },
  // ── Tasks ─────────────────────────────────────────────────────────────────
  { id: "task_assigned", name: "Task Assigned", description: "Sent only to the user newly assigned to the task.", trigger: "Task created or updated with a new assignee", triggerType: "Event", recipient: "Assigned User", category: "Tasks" },
  { id: "task_due", name: "Task Due Reminder", description: "Sent only to the user assigned to the task as its due date approaches.", trigger: "Scheduled — fires when a task's due date is approaching", triggerType: "Scheduled", recipient: "Assigned User", category: "Tasks" },
  // ── Onboarding ────────────────────────────────────────────────────────────
  // ── PTO ──────────────────────────────────────────────────────────────────
  { id: "pto_request_submitted", name: "PTO Request Submitted", description: "Sent only to the employee's current reporting manager when a PTO request is submitted.", trigger: "Employee submits a PTO request", triggerType: "Event", recipient: "Reporting Manager", category: "PTO" },
  { id: "pto_request_decision", name: "PTO Request Decision", description: "Sent only to the requesting employee when their reporting manager approves or declines PTO.", trigger: "Reporting manager approves or declines a PTO request", triggerType: "Event", recipient: "Requesting Employee", category: "PTO" },
  // ── Onboarding ──────────────────────────────────────────────────────────
  { id: "onboarding_overdue", name: "Onboarding Overdue Alert", description: "Sends every active administrator the overdue instance; also sends the agent their own overdue agent tasks.", trigger: "Nightly scheduler — fires when onboarding tasks are past their due date", triggerType: "Scheduled", recipient: "Active Admins", category: "Onboarding" },
  // ── Market Match ──────────────────────────────────────────────────────────
  { id: "market_match_intro", name: "Market Match Intro", description: "Sent to the recommended agent; the operator may also send the same handoff copy to the matched investor.", trigger: "Market Match call completed and intro triggered by ISA or admin", triggerType: "Event", recipient: "Assigned Agent + Optional Client Copy", category: "Market Match" },
  // ── Projects ──────────────────────────────────────────────────────────────────────────────────────
  { id: "pm_mention", name: "Project Mention Notification", description: "Notifies a user when they are @mentioned in a project note or comment.", trigger: "@mention detected in a project note", triggerType: "Event", recipient: "Mentioned User", category: "Projects" },
  // ── Transaction reviews ──────────────────────────────────────────────────
  { id: "transaction_review_request", name: "Transaction Review Request", description: "Sent only to the client being asked to review their completed transaction; replies route to the transaction agent.", trigger: "A review request is created for a closed transaction", triggerType: "Event", recipient: "Transaction Client", category: "Transactions" },
  { id: "transaction_review_received", name: "Transaction Review Received", description: "Sent to the transaction agent and, if assigned, that agent's coach of record.", trigger: "A client submits a transaction review", triggerType: "Event", recipient: "Assigned Agent + Coach", category: "Transactions" },
  // ── Reporting and coaching ───────────────────────────────────────────────
  { id: "weekly_lead_report", name: "Weekly Lead Report", description: "Sent only to the designated leadership distribution list.", trigger: "Weekly scheduled report", triggerType: "Scheduled", recipient: "Designated Leadership", category: "Reporting" },
  { id: "weekly_webinar_report", name: "Upcoming Webinars Report", description: "Sent to every active administrator, ISA, and agent with an email address.", trigger: "Monday scheduled report", triggerType: "Scheduled", recipient: "Active Admins + ISAs + Agents", category: "Reporting" },
  { id: "weekly_referral_report", name: "Weekly Referral Report", description: "Sent only to the designated referral leadership distribution list.", trigger: "Monday scheduled report", triggerType: "Scheduled", recipient: "Designated Leadership", category: "Reporting" },
  { id: "daily_agent_report", name: "Daily Agent Report", description: "Each active full-user agent receives only their own live priorities, leads, and tasks.", trigger: "Daily scheduled report", triggerType: "Scheduled", recipient: "Full-User Agent", category: "Reporting" },
  { id: "daily_isa_activities", name: "Daily ISA Activities Report", description: "Sent only to the designated ISA leadership distribution list.", trigger: "Daily scheduled report", triggerType: "Scheduled", recipient: "Designated Leadership", category: "Reporting" },
  { id: "monthly_agent_renewals", name: "Monthly Agent Renewals", description: "Sent to Phil, Elana, Dyl, and Tyler with all overdue renewals plus renewals due in the next 60 days.", trigger: "1st of each month at 9:00 AM Eastern", triggerType: "Scheduled", recipient: "Designated Leadership", category: "Reporting" },
  { id: "coaching_weekly_accountability", name: "Coaching Weekly Accountability", description: "Sent only to the named coaching leadership distribution list.", trigger: "Friday scheduled report", triggerType: "Scheduled", recipient: "Designated Leadership", category: "Reporting" },
  { id: "coaching_tips_for_today", name: "Coaching Tips for Today", description: "Sent only to the named coaching leadership distribution list.", trigger: "Daily scheduled briefing", triggerType: "Scheduled", recipient: "Designated Leadership", category: "Reporting" },
  { id: "coaching_feedback_invitation", name: "Coaching Feedback Invitation", description: "Sent only to the agent who attended the coaching session, using a private survey link.", trigger: "Following an eligible coaching session", triggerType: "Event", recipient: "Coached Agent", category: "Reporting" },
  { id: "coaching_feedback_weekly_summary", name: "Coaching Feedback Weekly Summary", description: "Each active coach receives their own aggregate; named leaders receive the company-wide aggregate.", trigger: "Friday scheduled report", triggerType: "Scheduled", recipient: "Coach + Leaders", category: "Reporting" },
  // ── Pulse ────────────────────────────────────────────────────────────────
  { id: "meeting_reminder", name: "Pulse Meeting Reminder", description: "Sent only to active members of the relevant Pulse meeting who have email enabled in their preferences.", trigger: "Scheduled weekly preparation reminder", triggerType: "Scheduled", recipient: "Pulse Member(s)", category: "Pulse" },
  { id: "pulse_submission_confirmation", name: "Pulse Weekly Prep Confirmation", description: "Sent only to the member who submitted weekly preparation.", trigger: "Weekly preparation is submitted", triggerType: "Event", recipient: "Pulse Member(s)", category: "Pulse" },
  { id: "pulse_meeting_recap", name: "Pulse Meeting Recap", description: "Sent only to active members of the meeting whose recap was generated.", trigger: "Meeting recap is generated", triggerType: "Event", recipient: "Pulse Member(s)", category: "Pulse" },
  { id: "todo_assigned", name: "Pulse To-do Assigned", description: "Sent only to the member or members assigned the Pulse to-do and enabled for email.", trigger: "A Pulse to-do is assigned", triggerType: "Event", recipient: "Pulse Work Assignee(s)", category: "Pulse" },
  { id: "cascade_sent", name: "Pulse Cascade Sent", description: "Sent only to members of the cascade's destination meeting who have email enabled.", trigger: "A Pulse cascade is sent", triggerType: "Event", recipient: "Pulse Member(s)", category: "Pulse" },
  { id: "overdue_digest", name: "Pulse Overdue Digest", description: "Sent only to each assignee with overdue Pulse to-dos who has email enabled.", trigger: "Weekly scheduled digest", triggerType: "Scheduled", recipient: "Pulse Work Assignee(s)", category: "Pulse" },
  { id: "mention", name: "Pulse Mention", description: "Sent only to the Pulse member or members who were mentioned and have email enabled.", trigger: "A Pulse comment includes an @mention", triggerType: "Event", recipient: "Mentioned User", category: "Pulse" },
  { id: "rock_completed", name: "Pulse Rock Completed", description: "Sent only to the members selected by the rock-completion notification rule who have email enabled.", trigger: "A Pulse rock is marked complete", triggerType: "Event", recipient: "Pulse Member(s)", category: "Pulse" },
  { id: "pulse_overdue_digest", name: "Legacy Pulse Overdue Digest Template", description: "Template retained for compatibility; the active overdue digest uses the Pulse Overdue Digest notification above.", trigger: "No active sender", triggerType: "Scheduled", recipient: "Not Currently Sent", category: "Pulse" },
  { id: "pulse_rock_completed", name: "Legacy Pulse Rock Completed Template", description: "Template retained for compatibility; the active rock notification uses Pulse Rock Completed above.", trigger: "No active sender", triggerType: "Event", recipient: "Not Currently Sent", category: "Pulse" },
  { id: "welcome", name: "Pulse Welcome Template", description: "Template retained for Pulse member onboarding; there is no active automated sender at this time.", trigger: "No active sender", triggerType: "Event", recipient: "Not Currently Sent", category: "Pulse" },
  // ── Partners, account access, and marketing ──────────────────────────────
  { id: "partner_lead_confirmation", name: "Partner Lead Confirmation", description: "Sent only to the referring partner whose email was supplied with the lead intake.", trigger: "Partner lead intake is submitted", triggerType: "Event", recipient: "Partner", category: "Partner & Access" },
  { id: "partner_portal_access", name: "Partner Portal Access", description: "Sent only to the partner who requested a secure portal sign-in link.", trigger: "Partner requests portal access", triggerType: "Event", recipient: "Partner", category: "Partner & Access" },
  { id: "password_reset", name: "Password Reset", description: "Sent only to the SavvyOS account holder who requested the password reset.", trigger: "Account password reset is requested", triggerType: "Event", recipient: "Account Holder", category: "Account Security" },
  { id: "webinar_marketing_request", name: "Webinar Marketing Request", description: "Sent to the marketing inbox, with the SavvyOS webinar creator copied.", trigger: "A webinar is created in SavvyOS", triggerType: "Event", recipient: "Marketing Team + Creator", category: "Marketing" },
];
const CATEGORIES: Category[] = ["Transactions", "Listings", "Tasks", "Leads & CRM", "Onboarding", "Market Match", "Commission", "Projects", "Pulse", "Partner & Access", "Account Security", "Marketing", "Reporting", "PTO"];
const CATEGORY_COLORS: Record<Category, string> = {
  "Transactions": "bg-blue-100 text-blue-700",
  "Listings": "bg-purple-100 text-purple-700",
  "Tasks": "bg-amber-100 text-amber-700",
  "Leads & CRM": "bg-emerald-100 text-emerald-700",
  "Onboarding": "bg-cyan-100 text-cyan-700",
  "Market Match": "bg-indigo-100 text-indigo-700",
  "Commission": "bg-rose-100 text-rose-700",
  "Projects": "bg-orange-100 text-orange-700",
  "Pulse": "bg-fuchsia-100 text-fuchsia-700",
  "Partner & Access": "bg-lime-100 text-lime-700",
  "Account Security": "bg-stone-100 text-stone-700",
  "Marketing": "bg-pink-100 text-pink-700",
  "Reporting": "bg-sky-100 text-sky-700",
  "PTO": "bg-teal-100 text-teal-700",
};

const RECIPIENT_COLORS: Record<Recipient, string> = {
  "Agent": "bg-slate-100 text-slate-700",
  "Admin": "bg-red-100 text-red-700",
  "ISA": "bg-violet-100 text-violet-700",
  "Agent + Admin": "bg-orange-100 text-orange-700",
  "Agent + Client": "bg-cyan-100 text-cyan-700",
  "Assigned Agent": "bg-slate-100 text-slate-700",
  "Assigned User": "bg-slate-100 text-slate-700",
  "Transaction Payee": "bg-slate-100 text-slate-700",
  "Listing Agent": "bg-slate-100 text-slate-700",
  "Brokerage Owner": "bg-red-100 text-red-700",
  "Transaction Client": "bg-cyan-100 text-cyan-700",
  "Assigned Agent + Coach": "bg-orange-100 text-orange-700",
  "Client + Assigned Agent": "bg-cyan-100 text-cyan-700",
  "Assigned Agent + Optional Client Copy": "bg-cyan-100 text-cyan-700",
  "Active Admins": "bg-red-100 text-red-700",
  "Active Admins + ISAs + Agents": "bg-indigo-100 text-indigo-700",
  "Designated Leadership": "bg-violet-100 text-violet-700",
  "Full-User Agent": "bg-slate-100 text-slate-700",
  "Coached Agent": "bg-slate-100 text-slate-700",
  "Coach + Leaders": "bg-orange-100 text-orange-700",
  "Pulse Member(s)": "bg-fuchsia-100 text-fuchsia-700",
  "Pulse Work Assignee(s)": "bg-fuchsia-100 text-fuchsia-700",
  "Mentioned User": "bg-teal-100 text-teal-700",
  "Partner": "bg-lime-100 text-lime-700",
  "Account Holder": "bg-stone-100 text-stone-700",
  "Marketing Team + Creator": "bg-pink-100 text-pink-700",
  "Reporting Manager": "bg-teal-100 text-teal-700",
  "Requesting Employee": "bg-teal-100 text-teal-700",
  "Vendor": "bg-cyan-100 text-cyan-700",
  "Vendor Agent + Designated Leadership": "bg-violet-100 text-violet-700",
  "Not Currently Sent": "bg-zinc-100 text-zinc-600",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function EmailNotificationsPage() {
  const [search, setSearch] = useState("");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [triggerFilter, setTriggerFilter] = useState<string>("all");

  // Live settings from DB
  const { data: settings = [], isLoading, refetch } = trpc.emailNotifications.list.useQuery();
  const toggleMutation = trpc.emailNotifications.toggle.useMutation({
    onSuccess: () => { refetch(); },
    onError: (err) => { toast.error(`Failed to update: ${err.message}`); refetch(); },
  });
  const { data: customNotifications = [], isLoading: isCustomLoading, refetch: refetchCustomNotifications } = trpc.customEmailNotifications.list.useQuery();
  const createCustomNotificationMutation = trpc.customEmailNotifications.create.useMutation({
    onSuccess: () => {
      toast.success("Custom email notification created.");
      setBuilderOpen(false);
      refetchCustomNotifications();
    },
    onError: (err) => toast.error(`Failed to create notification: ${err.message}`),
  });
  const toggleCustomNotificationMutation = trpc.customEmailNotifications.toggle.useMutation({
    onSuccess: () => { refetchCustomNotifications(); },
    onError: (err) => { toast.error(`Failed to update: ${err.message}`); refetchCustomNotifications(); },
  });
  // Build a quick lookup map: notificationKey → isEnabled
  const enabledMap = new Map<string, boolean>(
    settings.map((s: { notificationKey: string; isEnabled: boolean }) => [s.notificationKey, s.isEnabled])
  );

  const customNotificationMeta: NotifMeta[] = customNotifications.map((notification) => ({
    id: notification.notificationKey,
    customId: notification.id,
    isEnabled: notification.isEnabled,
    name: notification.name,
    description: notification.description || "Custom email notification.",
    trigger: notification.trigger,
    triggerType: notification.triggerType as TriggerType,
    recipient: notification.recipient as Recipient,
    category: notification.category as Category,
  }));
  const notificationItems = [...NOTIFICATIONS, ...customNotificationMeta];

  function isEnabled(notification: NotifMeta): boolean {
    if (notification.customId !== undefined) return notification.isEnabled ?? true;
    // Default to true if the system setting has not yet been seeded.
    return enabledMap.has(notification.id) ? enabledMap.get(notification.id)! : true;
  }

  function handleToggle(notification: NotifMeta, newValue: boolean) {
    if (notification.customId !== undefined) {
      toggleCustomNotificationMutation.mutate({ id: notification.customId, isEnabled: newValue });
      return;
    }
    toggleMutation.mutate({ notificationKey: notification.id, isEnabled: newValue });
  }

  function handleCreateCustomNotification(values: CustomNotificationFormValues) {
    createCustomNotificationMutation.mutate(values);
  }

  const filtered = notificationItems.filter((n) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || n.name.toLowerCase().includes(q) || n.description.toLowerCase().includes(q) || n.trigger.toLowerCase().includes(q);
    const matchesCategory = categoryFilter === "all" || n.category === categoryFilter;
    const matchesTrigger = triggerFilter === "all" || n.triggerType === triggerFilter;
    return matchesSearch && matchesCategory && matchesTrigger;
  });

  const totalEnabled = notificationItems.filter(isEnabled).length;
  const eventCount = notificationItems.filter((n) => n.triggerType === "Event").length;
  const scheduledCount = notificationItems.filter((n) => n.triggerType === "Scheduled").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email Notifications"
        subtitle="Review each automated email's recipient audience and manage whether SavvyOS sends it"
        actions={
          <Button onClick={() => setBuilderOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Build Email Notification
          </Button>
        }
      />
      <Tabs defaultValue="notifications" className="space-y-6">
        <TabsList className="flex overflow-x-auto h-auto gap-0 w-full" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          <TabsTrigger value="notifications" className="shrink-0 whitespace-nowrap">Notification Settings</TabsTrigger>
          <TabsTrigger value="test" className="shrink-0 whitespace-nowrap">Email Test</TabsTrigger>
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
              <p className="text-xl font-bold">{notificationItems.length}</p>
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
              <p className="text-xl font-bold">{isLoading || isCustomLoading ? "—" : totalEnabled}</p>
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
            const enabled = isEnabled(n);
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
                        {n.customId !== undefined && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-0 bg-primary/10 text-primary">Custom</Badge>
                        )}
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 border-0 ${CATEGORY_COLORS[n.category]}`}>
                          {n.category}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 border-0 ${n.triggerType === "Scheduled" ? "bg-purple-50 text-purple-600" : "bg-amber-50 text-amber-600"}`}>
                          {n.triggerType}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-1.5">{n.description}</p>
                      <div className={`mb-1.5 flex items-start gap-2 rounded-md px-2.5 py-2 text-xs ${RECIPIENT_COLORS[n.recipient]}`}>
                        <UsersRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span><span className="font-semibold">Recipients:</span> {n.recipient}</span>
                      </div>
                      <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <Zap className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/60" />
                        <span><span className="font-medium text-foreground/70">Trigger:</span> {n.trigger}</span>
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="shrink-0 flex items-center gap-3">
                      <div className="flex flex-col items-center gap-1.5">
                      <Switch
                        checked={enabled}
                        onCheckedChange={(val) => handleToggle(n, val)}
                        disabled={n.customId !== undefined ? toggleCustomNotificationMutation.isPending : toggleMutation.isPending}
                        aria-label={`Toggle ${n.name}`}
                      />
                      <span className={`text-[10px] font-medium ${enabled ? "text-emerald-600" : "text-muted-foreground"}`}>
                        {enabled ? "On" : "Off"}
                      </span>
                      </div>
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
        Showing {filtered.length} of {notificationItems.length} notifications &bull; {totalEnabled} enabled
      </p>
        </TabsContent>
      </Tabs>
      <EmailNotificationBuilderDialog
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        onCreate={handleCreateCustomNotification}
        isSaving={createCustomNotificationMutation.isPending}
      />
    </div>
  );
}
