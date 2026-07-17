import { useAuth } from "@/_core/hooks/useAuth";
import DevRoleSwitcher from "./DevRoleSwitcher";
import FeedbackDialog from "./FeedbackDialog";
import DevLoginScreen from "./DevLoginScreen";
import { SimulateAsButton, SimulationBanner, WorkAsAgentBanner } from "./SimulateAsButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import {
  BarChart3,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  DollarSign,
  FileText,
  FileDown,
  GitBranch,
  Home,
  LogOut,
  Map,
  Menu,
  Network,
  PhoneCall,
  Receipt,
  Shield,
  Tag,
  UserCheck,
  Users,
  Wallet,
  Handshake,
  X,
  CheckSquare,
  Mail,
  Zap,
  MessageSquarePlus,
  Settings,
  Megaphone,
  GitMerge,
  Layers,
  Bell,
  StickyNote,
  MessageSquare,
  BookOpen,
  Webhook,
  LayoutDashboard,
  Link2,
  Target,
  Activity,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

// ─── Types ────────────────────────────────────────────────────────────────────
type NavItem = { icon: React.ElementType; label: string; path: string; badge?: number };
type NavGroup = { label: string; items: NavItem[] };

// ─── Static Nav Configs ──────────────────────────────────────────────────────
function buildAgentNav(hasActiveOnboarding: boolean, isGroupLeader: boolean): NavGroup[] {
  const dealsItems: NavItem[] = [
    { icon: FileText, label: "Transactions", path: "/transactions" },
    { icon: Building2, label: "Listings", path: "/listings" },
    { icon: Wallet, label: "My Commission", path: "/commission" },
  ];
  if (isGroupLeader) {
    dealsItems.push({ icon: LayoutDashboard, label: "Team Dashboard", path: "/group-leader-dashboard" });
    dealsItems.push({ icon: Users, label: "Group Leader Commissions", path: "/group-leader-commissions" });
  }

  const operationsItems: NavItem[] = [
    { icon: ClipboardList, label: "Tasks", path: "/tasks" },
    { icon: Network, label: "Org Chart", path: "/org-chart" },
    { icon: Handshake, label: "Referral Partners", path: "/referral-partners" },
  ];
  if (hasActiveOnboarding) {
    operationsItems.push({ icon: UserCheck, label: "On/Offboarding", path: "/my-onboarding" });
  }

  return [
    {
      label: "Overview",
      items: [{ icon: Home, label: "My Dashboard", path: "/" }],
    },
    {
      label: "My CRM",
      items: [
        { icon: GitBranch, label: "My Pipeline", path: "/pipeline" },
        { icon: GitMerge, label: "Request Connection", path: "/request-connection" },
      ],
    },
    {
      label: "My Deals",
      items: dealsItems,
    },
    {
      label: "Operations",
      items: operationsItems,
    },
    {
      label: "Marketing",
      items: [
        { icon: Megaphone, label: "Marketing Requests", path: "/marketing-requests" },
      ],
    },
    {
      label: "Resources",
      items: [
        { icon: BookOpen, label: "Knowledge Base", path: "/kb" },
      ],
    },
  ];
}

function buildAgentSupportNav(): NavGroup[] {
  return [
    {
      label: "Overview",
      items: [
        { icon: UserCheck, label: "Agent Support Portal", path: "/agent-support" },
      ],
    },
    {
      label: "Resources",
      items: [
        { icon: BookOpen, label: "Knowledge Base", path: "/kb" },
      ],
    },
  ];
}

function buildIsaNav(pendingConnReqs: number): NavGroup[] {
  return [
    {
      label: "Overview",
      items: [
        { icon: PhoneCall, label: "ISA Dashboard", path: "/" },
      ],
    },
    {
      label: "Leads & CRM",
      items: [
        { icon: Users, label: "All Contacts", path: "/contacts" },
        { icon: GitBranch, label: "Agent Pipelines", path: "/pipeline" },
        { icon: GitMerge, label: "Connection Requests", path: "/connection-requests", badge: pendingConnReqs > 0 ? pendingConnReqs : undefined },
      ],
    },
    {
      label: "Operations",
      items: [
        { icon: ClipboardList, label: "Tasks", path: "/tasks" },
        { icon: Map, label: "Market Match Hub", path: "/market-match-config" },
        { icon: PhoneCall, label: "Market Match Call", path: "/market-match-call" },
        { icon: Network, label: "Org Chart", path: "/org-chart" },
      ],
    },
    {
      label: "Resources",
      items: [
        { icon: BookOpen, label: "Knowledge Base", path: "/kb" },
      ],
    },
  ];
}
function buildAdminNav(pendingApprovals: number, pendingFeedback: number, pendingExceptions: number, flaggedTx: number, unpaidPayouts: number, pendingConnReqs: number, myOverdueTasks: number = 0, pendingMarketing: number = 0): NavGroup[] {
  return [
    {
      label: "Overview",
      items: [
        { icon: Home, label: "Admin Dashboard", path: "/" },
        { icon: BarChart3, label: "Analytics & Reports", path: "/analytics" },
      ],
    },
    {
      label: "CRM",
      items: [
        { icon: Users, label: "All Contacts", path: "/contacts" },
        { icon: GitBranch, label: "All Pipelines", path: "/pipeline" },
        { icon: GitMerge, label: "Connection Requests", path: "/connection-requests", badge: pendingConnReqs > 0 ? pendingConnReqs : undefined },
        { icon: Tag, label: "Lead Sources", path: "/lead-sources" },
      ],
    },
    {
      label: "Transactions",
      items: [
        { icon: FileText, label: "All Transactions", path: "/transactions" },
        { icon: FileDown, label: "Transaction Exports", path: "/transaction-reporting" },
        { icon: Building2, label: "Listings", path: "/listings" },
        { icon: Building2, label: "Properties", path: "/properties" },
        { icon: DollarSign, label: "Commission & Payouts", path: "/commission", badge: (unpaidPayouts > 0 || flaggedTx > 0 || pendingExceptions > 0) ? (unpaidPayouts + flaggedTx + pendingExceptions) : undefined },
      ],
    },
    {
      label: "Operations",
      items: [
        { icon: ClipboardList, label: "Tasks", path: "/tasks", badge: myOverdueTasks > 0 ? myOverdueTasks : undefined },
        { icon: UserCheck, label: "On/Offboarding", path: "/onboarding" },
        { icon: Users, label: "Leadership Dashboard", path: "/leadership-dashboard" },
        { icon: Activity, label: "Activity Log", path: "/admin/activity" },
      ],
    },
    {
      label: "Admin",
      items: [
        { icon: UserCheck, label: "Users", path: "/users" },
        { icon: CheckSquare, label: "Admin Approvals", path: "/approvals", badge: pendingApprovals > 0 ? pendingApprovals : undefined },
        { icon: Map, label: "Market Match Hub", path: "/market-match-config" },
        { icon: Network, label: "Org Chart", path: "/org-chart" },
        { icon: MessageSquarePlus, label: "Feedback & Requests", path: "/feedback", badge: pendingFeedback > 0 ? pendingFeedback : undefined },
        { icon: Megaphone, label: "Marketing Requests", path: "/marketing-admin", badge: pendingMarketing > 0 ? pendingMarketing : undefined },
        { icon: Target, label: "Goals", path: "/goals" },
      ],
    },
    {
      label: "Dev Tools",
      items: [
        { icon: Webhook, label: "Webhooks", path: "/webhooks" },
        { icon: GitMerge, label: "Duplicate Contacts", path: "/duplicates" },
      ],
    },
    {
      label: "Resources",
      items: [
        { icon: BookOpen, label: "Knowledge Base", path: "/kb" },
      ],
    },
  ];
}

// ─── Sidebar Nav Content ──────────────────────────────────────────────────────
function SidebarNav({
  navGroups,
  currentPath,
  collapsed,
  onNavigate,
  user,
  roleLabel,
  roleBadgeClass,
  logout,
}: {
  navGroups: NavGroup[];
  currentPath: string;
  collapsed: boolean;
  onNavigate: (path: string) => void;
  user: { name?: string | null; profilePhotoUrl?: string | null };
  roleLabel: string;
  roleBadgeClass: string;
  logout: () => void;
  canSimulate?: boolean;
}) {
  const initials = user.name
    ? user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";
  const avatarUrl = (user as any).profilePhotoUrl ?? null;

  return (
    <div className="flex flex-col h-full select-none">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-[14px] border-b border-sidebar-border shrink-0 min-h-[57px]">
        {!collapsed ? (
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png"
            alt="Savvy STR Agents"
            className="h-7 w-auto object-contain"
          />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-[oklch(0.74_0.14_200)] flex items-center justify-center shrink-0">
            <span className="text-[oklch(0.08_0_0)] font-bold text-sm">S</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-3">
        {navGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-2 mb-1">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive =
                  item.path === "/"
                    ? currentPath === "/"
                    : currentPath.startsWith(item.path);
                return (
                  <li key={item.path}>
                    <button
                      type="button"
                      onClick={() => onNavigate(item.path)}
                      title={collapsed ? item.label : undefined}
                      className={`w-full flex items-center gap-2.5 px-2 py-[9px] rounded-md text-sm transition-colors text-left ${
                        isActive
                          ? "bg-[oklch(0.74_0.14_200)]/15 text-[oklch(0.60_0.14_200)] font-semibold"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      }`}
                    >
                      <item.icon className="h-[16px] w-[16px] shrink-0" />
                      {!collapsed && (
                        <span className="truncate leading-tight flex-1">{item.label}</span>
                      )}
                      {!collapsed && item.badge != null && (
                        <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                          {item.badge}
                        </span>
                      )}
                      {collapsed && item.badge != null && (
                        <span className="absolute top-0 right-0 bg-red-500 text-white text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Simulate As (only for tyler@savvy.realty) */}
      <div className="px-2 pb-1">
        <SimulateAsButton collapsed={collapsed} />
      </div>

      {/* Feedback link */}
      {!collapsed && (
        <div className="px-2 pb-1">
          <FeedbackDialog />
        </div>
      )}

      {/* User footer */}
      <div className="border-t border-sidebar-border p-3 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2.5 w-full rounded-lg px-2 py-2 hover:bg-sidebar-accent transition-colors text-left"
            >
              <Avatar className="h-8 w-8 shrink-0">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={user.name ?? ""} className="object-cover" />}
                <AvatarFallback className="bg-[oklch(0.74_0.14_200)] text-[oklch(0.08_0_0)] text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-sidebar-foreground truncate leading-tight">
                      {user.name ?? "User"}
                    </p>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${roleBadgeClass}`}>
                      {roleLabel}
                    </span>
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-48">
            <DropdownMenuItem onClick={() => (window.location.href = "/profile")} className="cursor-pointer">
              <Settings className="h-4 w-4 mr-2" />
              My Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive cursor-pointer">
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ─── Main Layout ──────────────────────────────────────────────────────────────
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const [currentPath] = useLocation();
  const [, navigate] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = (user as any)?.role as "admin" | "agent" | "isa" | "agent_support" | undefined;

  // Fetch pending approvals count for admin badge
  const { data: pendingCount } = trpc.approvalRequests.pendingCount.useQuery(
    undefined,
    { enabled: role === "admin", refetchInterval: 30000 }
  );

  // Fetch pending feedback count for admin badge
  const { data: pendingFeedbackCount } = trpc.feedback.pendingCount.useQuery(
    undefined,
    { enabled: role === "admin", refetchInterval: 30000 }
  );

  // Fetch active onboarding status for agent nav
  const { data: onboardingStatus } = trpc.onboarding.hasActiveOnboarding.useQuery(
    undefined,
    { enabled: role === "agent", refetchInterval: 60000 }
  );

  // Fetch group leader status for agent nav
  const { data: groupLeaderStatus } = trpc.groups.isGroupLeader.useQuery(
    undefined,
    { enabled: role === "agent", refetchInterval: 120000 }
  );
   // Fetch pending commission exceptions count for admin badge
  const { data: pendingExceptionsData } = trpc.commissionExceptions.pendingCount.useQuery(
    undefined,
    { enabled: role === "admin", refetchInterval: 60000 }
  );
  // Fetch flagged transaction count for Transaction Reporting badge
  const { data: flaggedTxData } = trpc.transactions.flaggedCount.useQuery(
    undefined,
    { enabled: role === "admin", refetchInterval: 60000 }
  );
  // Fetch unpaid payouts count for Payout Report badge
  const { data: unpaidPayoutsData } = trpc.transactions.unpaidPayoutsCount.useQuery(
    undefined,
    { enabled: role === "admin", refetchInterval: 60000 }
  );
  // Fetch pending connection requests count for admin/ISA badge
  const { data: pendingConnReqsData } = trpc.connectionRequests.pendingCount.useQuery(
    undefined,
    { enabled: role === "admin" || role === "isa", refetchInterval: 30000 }
  );
  // Fetch pending marketing requests count for admin badge
  const { data: pendingMarketingData } = trpc.marketingRequests.pendingCount.useQuery(
    undefined,
    { enabled: role === "admin", refetchInterval: 60000 }
  );
  // Fetch my overdue task count for Tasks badge
  const { data: myOverdueTaskData } = trpc.tasks.myOverdueCount.useQuery(
    undefined,
    { enabled: !!user, refetchInterval: 60000 }
  );
  // Fetch the logged-in user's profile photo for the sidebar avatar
  const { data: myCoreProfile } = trpc.users.getMyCoreProfile.useQuery(
    undefined,
    { enabled: !!user, staleTime: 60000 }
  );

  // Derived values needed to conditionally enable PM inbox queries
  const isTyler = (user as any)?.email === "tyler@savvy.realty";
  const isPmUser = isTyler || role === "admin";

  // PM Inbox unread count — must be above early returns
  const { data: inboxCount, refetch: refetchInbox } = trpc.pm.inbox.unreadCount.useQuery(
    undefined,
    { enabled: isPmUser, refetchInterval: 30000 }
  );

  // PM Inbox panel state — must be above early returns
  const [inboxOpen, setInboxOpen] = useState(false);
  const inboxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (inboxRef.current && !inboxRef.current.contains(e.target as Node)) {
        setInboxOpen(false);
      }
    }
    if (inboxOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [inboxOpen]);

  const { data: inboxItems = [] } = trpc.pm.inbox.list.useQuery(
    undefined,
    { enabled: isPmUser && inboxOpen }
  );
  const markNoteRead = trpc.pm.notes.markRead.useMutation({ onSuccess: () => { refetchInbox(); } });
  const markNoteUnread = trpc.pm.notes.markUnread.useMutation({ onSuccess: () => { refetchInbox(); } });

  // ── Early returns (all hooks must be above this line) ──────────────────────
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) {
    if (import.meta.env.VITE_DEV_LOGIN_ENABLED === "true") return <DevLoginScreen />;
    window.location.href = "/login";
    return null;
  }

  const pending = typeof pendingCount === "object" && pendingCount !== null ? (pendingCount as any).count : (pendingCount ?? 0);
  const pendingFb = typeof pendingFeedbackCount === "number" ? pendingFeedbackCount : 0;
  const pendingExc = (pendingExceptionsData as any)?.count ?? 0;
  const flaggedTx = (flaggedTxData as any)?.count ?? 0;
  const unpaidPayouts = (unpaidPayoutsData as any)?.count ?? 0;
  const pendingConnReqs = (pendingConnReqsData as any)?.count ?? 0;
  const myOverdueTaskCount = (myOverdueTaskData as any)?.count ?? 0;
  const pendingMarketingCount = (pendingMarketingData as any)?.count ?? 0;
  const hasActiveOnboarding = onboardingStatus?.active ?? false;
  const isGroupLeader = groupLeaderStatus?.isLeader ?? false;
  const unreadPmCount = (inboxCount as any)?.count ?? 0;

  const baseNavGroups =
    role === "admin"
      ? buildAdminNav(pending, pendingFb, pendingExc, flaggedTx, unpaidPayouts, pendingConnReqs, myOverdueTaskCount, pendingMarketingCount)
      : role === "isa"
      ? buildIsaNav(pendingConnReqs)
      : role === "agent_support"
      ? buildAgentSupportNav()
      : buildAgentNav(hasActiveOnboarding, isGroupLeader);
  const allowHiddenNav = (user as any)?.allowHiddenNav === true || isTyler;
  const navGroups: NavGroup[] = allowHiddenNav
    ? [
        ...baseNavGroups,
        {
          label: "Hidden",
          items: [
            { icon: Layers, label: "Projects", path: "/projects" },
            { icon: Zap, label: "Smart Plans", path: "/smart-plans" },
            { icon: Mail, label: "Email Notifications", path: "/email-notifications" },
          ],
        },
      ]
    : baseNavGroups;
  const roleLabel = role === "admin" ? "Admin" : role === "isa" ? "ISA" : role === "agent_support" ? "Agent Support" : "Agent";
  const roleBadgeClass =
    role === "admin"
      ? "bg-[oklch(0.74_0.14_200)]/20 text-[oklch(0.74_0.14_200)]"
      : role === "isa"
      ? "bg-[oklch(0.74_0.14_200)]/15 text-[oklch(0.74_0.14_200)]"
      : role === "agent_support"
      ? "bg-teal-100 text-teal-700"
      : "bg-[oklch(0.74_0.14_200)]/10 text-[oklch(0.74_0.14_200)]";

  const sidebarBg = "bg-sidebar";
  const sidebarWidth = collapsed ? "w-[56px]" : "w-[240px]";

  const navProps = {
    navGroups,
    currentPath,
    collapsed,
    user: { ...user, profilePhotoUrl: (myCoreProfile as any)?.profilePhotoUrl ?? null },
    roleLabel,
    roleBadgeClass,
    logout,
  };

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      {/* ── Desktop Sidebar ── */}
      <aside
        className={`hidden md:flex flex-col shrink-0 ${sidebarBg} ${sidebarWidth} transition-[width] duration-200 ease-linear relative z-20`}
      >
        <SidebarNav
          {...navProps}
          onNavigate={(path) => navigate(path)}
        />
        {/* Collapse toggle button */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="absolute top-1/2 -right-3 -translate-y-1/2 w-6 h-6 rounded-full bg-card border border-border shadow flex items-center justify-center hover:bg-muted transition-colors z-30"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronLeft className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
      </aside>

      {/* ── Mobile Sidebar Overlay ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <aside className={`absolute left-0 top-0 bottom-0 w-72 ${sidebarBg} flex flex-col z-50 shadow-2xl`}>
            <div className="absolute top-3 right-3 z-10">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-2 rounded-md hover:bg-muted text-muted-foreground active:bg-muted/80"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarNav
              {...navProps}
              collapsed={false}
              onNavigate={(path) => {
                navigate(path);
                setMobileOpen(false);
              }}
            />
          </aside>
        </div>
      )}

      {/* ── Main Content ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top bar — mobile gets a branded header, desktop gets a minimal bar */}
        <header className="flex items-center h-14 px-3 md:px-4 border-b bg-card shrink-0 gap-3">
          {/* Mobile: hamburger + logo */}
          <button
            type="button"
            className="md:hidden p-2 -ml-1 rounded-md hover:bg-muted active:bg-muted/80 transition-colors"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          {/* Mobile: centered brand logo */}
          <div className="md:hidden flex items-center gap-2 flex-1 justify-center">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png"
              alt="Savvy STR Agents"
              className="h-6 w-auto object-contain"
            />
          </div>
          {/* Mobile: role badge on right */}
          <div className="md:hidden">
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${roleBadgeClass}`}>
              {roleLabel}
            </span>
          </div>
          {/* Desktop: spacer */}
          <div className="hidden md:flex flex-1" />

          {/* PM Inbox Bell — visible to Tyler and all admins */}
          {isPmUser && (
            <div className="relative" ref={inboxRef}>
              <button
                type="button"
                onClick={() => setInboxOpen(v => !v)}
                className="relative p-2 rounded-md hover:bg-muted transition-colors"
                title="Project Inbox"
              >
                <Bell className="h-5 w-5 text-muted-foreground" />
                {unreadPmCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </button>

              {/* Inbox Dropdown */}
              {inboxOpen && (
                <div className="absolute right-0 top-full mt-1 w-80 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <span className="font-semibold text-sm">Project Inbox</span>
                    {unreadPmCount > 0 && (
                      <span className="text-xs text-muted-foreground">{unreadPmCount} unread</span>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {(inboxItems as any[]).length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Bell className="h-7 w-7 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">All caught up!</p>
                        <p className="text-xs mt-0.5">No unread notes or comments</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {(inboxItems as any[]).map((item: any) => (
                          <div
                            key={`${item.type}-${item.id}`}
                            className={`px-4 py-3 hover:bg-accent/50 cursor-pointer transition-colors ${
                              item.isUnread ? "bg-primary/3" : ""
                            }`}
                            onClick={() => {
                              if (item.type === "note" && item.isUnread) {
                                markNoteRead.mutate({ noteId: item.id });
                              }
                              navigate(`/projects/${item.projectId}`);
                              setInboxOpen(false);
                            }}
                          >
                            <div className="flex items-start gap-2.5">
                              <div className="shrink-0 mt-0.5">
                                {item.type === "note" ? (
                                  <StickyNote className="h-4 w-4 text-primary" />
                                ) : (
                                  <MessageSquare className="h-4 w-4 text-blue-500" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="text-xs font-medium truncate">{item.authorName ?? "Someone"}</span>
                                  {item.isUnread && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2">{item.content}</p>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <span className="text-[10px] text-muted-foreground truncate">{item.projectTitle}</span>
                                  <span className="text-[10px] text-muted-foreground">·</span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {item.createdAt ? new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground"
                                title={item.isUnread ? "Mark read" : "Mark unread"}
                                onClick={e => {
                                  e.stopPropagation();
                                  if (item.type === "note") {
                                    if (item.isUnread) markNoteRead.mutate({ noteId: item.id });
                                    else markNoteUnread.mutate({ noteId: item.id });
                                  }
                                }}
                              >
                                {item.isUnread
                                  ? <span className="text-[10px] text-primary font-medium">Read</span>
                                  : <span className="text-[10px] text-muted-foreground">Unread</span>}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="px-4 py-2 border-t border-border">
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => { navigate("/projects"); setInboxOpen(false); }}
                    >
                      View all projects →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </header>

        {/* Simulation banner — shown when impersonating another user */}
        <SimulationBanner />
        {/* Work-as-agent banner — shown when agent_support is operating as an agent */}
        <WorkAsAgentBanner />

        {/* Page content — extra bottom padding on mobile for the dev switcher */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-background pb-safe">
          {children}
        </main>

        {/* Dev mode role switcher */}
        {import.meta.env.VITE_DEV_LOGIN_ENABLED === "true" && (
          <DevRoleSwitcher currentRole={(user as any)?.role} />
        )}
      </div>
    </div>
  );
}
