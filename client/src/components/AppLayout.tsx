import { useAuth } from "@/_core/hooks/useAuth";
import DevRoleSwitcher from "./DevRoleSwitcher";
import CommunicationsHub from "./CommunicationsHub";
import FeedbackDialog from "./FeedbackDialog";
import DevLoginScreen from "./DevLoginScreen";
import {
  SimulateAsButton,
  SimulationBanner,
  WorkAsAgentBanner,
} from "./SimulateAsButton";
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
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  BarChart3,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  DollarSign,
  FileText,
  GitBranch,
  Home,
  LogOut,
  Map,
  Menu,
  Network,
  PhoneCall,
  Receipt,
  Shield,
  ShieldCheck,
  Tag,
  UserCheck,
  Users,
  Wallet,
  Handshake,
  X,
  CheckSquare,
  Mail,
  Inbox,
  Zap,
  MessageSquarePlus,
  Settings,
  Megaphone,
  GitMerge,
  Layers,
  StickyNote,
  MessageSquare,
  BookOpen,
  Webhook,
  LayoutDashboard,
  Link2,
  Target,
  Activity,
  ArrowLeft,
  Briefcase,
  BrainCircuit,
  GraduationCap,
  Flame,
  Lock,
  TrendingUp,
  Trophy,
  Sparkles,
  Wrench,
  Video,
  KeyRound,
  Star,
  Search,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { getPulseNavDestinations, type PulseNavShell } from "@shared/pulseNav";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

// ─── Types ────────────────────────────────────────────────────────────────────
type NavItem = {
  icon: React.ElementType;
  label: string;
  path: string;
  badge?: number;
  external?: boolean;
};
type NavGroup = { label: string; items: NavItem[] };

// ─── Static Nav Configs ──────────────────────────────────────────────────────
function buildAgentNav(
  hasActiveOnboarding: boolean,
  isGroupLeader: boolean,
  myOverdueTasks: number = 0
): NavGroup[] {
  const dealsItems: NavItem[] = [
    { icon: FileText, label: "Transactions", path: "/transactions" },
    { icon: Building2, label: "Listings", path: "/listings" },
    { icon: Building2, label: "Properties", path: "/properties" },
    { icon: Wallet, label: "My Commission", path: "/commission" },
    { icon: Star, label: "Reviews", path: "/reviews" },
  ];
  if (isGroupLeader) {
    dealsItems.push({
      icon: LayoutDashboard,
      label: "Team Dashboard",
      path: "/group-leader-dashboard",
    });
    dealsItems.push({
      icon: Users,
      label: "Group Leader Commissions",
      path: "/group-leader-commissions",
    });
  }

  const operationsItems: NavItem[] = [
    {
      icon: ClipboardList,
      label: "Tasks",
      path: "/tasks",
      badge: myOverdueTasks > 0 ? myOverdueTasks : undefined,
    },
    { icon: Network, label: "Org Chart", path: "/org-chart" },
    { icon: Users, label: "Agent Directory", path: "/agent-directory" },
  ];
  if (hasActiveOnboarding) {
    operationsItems.push({
      icon: UserCheck,
      label: "Onboarding",
      path: "/my-onboarding",
    });
  }

  return [
    {
      label: "Overview",
      items: [
        { icon: Home, label: "My Dashboard", path: "/" },
        { icon: Activity, label: "Daily Report", path: "/daily-report" },
        { icon: BarChart3, label: "My Stats", path: "/stats" },
        { icon: Trophy, label: "Agent Leaderboard", path: "/leaderboard" },
      ],
    },
    {
      label: "My CRM",
      items: [
        { icon: GitBranch, label: "My Pipeline", path: "/pipeline" },
        { icon: Flame, label: "Hot Leads", path: "/hot-leads" },
        {
          icon: GitMerge,
          label: "Request Connection",
          path: "/request-connection",
        },
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
      label: "Requests",
      items: [
        {
          icon: Megaphone,
          label: "Marketing Requests",
          path: "/marketing-requests",
        },
        { icon: Wrench, label: "Tech Requests", path: "/tech-requests" },
      ],
    },
    {
      label: "Resources",
      items: [
        {
          icon: Handshake,
          label: "Referral Partners",
          path: "/referral-partners",
        },
        { icon: Wrench, label: "Vendor List", path: "/vendors" },
        { icon: BookOpen, label: "Knowledge Base", path: "/kb" },
        {
          icon: Link2,
          label: "Savvy-Agents.com",
          path: "https://www.savvy-agents.com/admin/properties",
          external: true,
        },
      ],
    },
  ];
}

/** The Pulse shell is intentionally capped at five destinations. */
function buildPulseNav(shell?: PulseNavShell): NavGroup[] {
  const icons: Record<string, React.ElementType> = {
    "My EOS Dashboard": CheckSquare,
    Meetings: Users,
    Settings,
  };
  return [
    {
      label: "Pulse",
      items: getPulseNavDestinations(shell).map(item => ({
        ...item,
        icon: icons[item.label] ?? Users,
      })),
    },
  ];
}

function buildAgentSupportNav(): NavGroup[] {
  return [
    {
      label: "Overview",
      items: [
        {
          icon: UserCheck,
          label: "Agent Support Portal",
          path: "/agent-support",
        },
      ],
    },
    {
      label: "Operations",
      items: [{ icon: CalendarDays, label: "My PTO", path: "/pto" }],
    },
    {
      label: "Resources",
      items: [{ icon: BookOpen, label: "Knowledge Base", path: "/kb" }],
    },
  ];
}

function buildIsaNav(
  pendingConnReqs: number,
  myOverdueTasks: number = 0,
  resendInboxUnread: number = 0,
  marketingTextInboxUnread: number = 0
): NavGroup[] {
  return [
    {
      label: "Overview",
      items: [
        { icon: PhoneCall, label: "ISA Dashboard", path: "/" },
        { icon: TrendingUp, label: "My Performance", path: "/isa-stats" },
      ],
    },
    {
      label: "Leads & CRM",
      items: [
        { icon: Users, label: "All Contacts", path: "/contacts" },
        {
          icon: MessageSquarePlus,
          label: "My Communications",
          path: "/communications",
        },
        { icon: Flame, label: "Hot Leads", path: "/hot-leads" },
        { icon: GitBranch, label: "Agent Pipelines", path: "/pipeline" },
        {
          icon: GitMerge,
          label: "Connection Requests",
          path: "/connection-requests",
          badge: pendingConnReqs > 0 ? pendingConnReqs : undefined,
        },
        {
          icon: Inbox,
          label: "Resend Inbox",
          path: "/resend-inbox",
          badge: resendInboxUnread > 0 ? resendInboxUnread : undefined,
        },
        {
          icon: MessageSquare,
          label: "Marketing Text Inbox",
          path: "/marketing-text-inbox",
          badge:
            marketingTextInboxUnread > 0 ? marketingTextInboxUnread : undefined,
        },
      ],
    },
    {
      label: "Operations",
      items: [
        {
          icon: ClipboardList,
          label: "Tasks",
          path: "/tasks",
          badge: myOverdueTasks > 0 ? myOverdueTasks : undefined,
        },
        { icon: Network, label: "Org Chart", path: "/org-chart" },
        { icon: Users, label: "Agent Directory", path: "/agent-directory" },
      ],
    },
    {
      label: "Resources",
      items: [{ icon: BookOpen, label: "Knowledge Base", path: "/kb" }],
    },
  ];
}
// Permission key → path mapping (used to filter nav items)
const PERM_PATH_MAP: Record<string, string> = {
  canViewDashboard: "/",
  canViewIsmDashboard: "/ism-dashboard",
  canViewReporting: "/analytics",
  canViewCustomReports: "/custom-reports",
  canViewLeaderboard: "/leaderboard",
  canViewContacts: "/contacts",
  canViewPipeline: "/pipeline",
  canViewConnectionRequests: "/connection-requests",
  canViewLeadSources: "/lead-sources",
  canViewHotLeads: "/hot-leads",
  canViewTransactions: "/transactions",
  canViewTransactionExports: "/transaction-reporting",
  canViewListings: "/listings",
  canViewProperties: "/properties",
  canViewCommission: "/commission",
  canViewReviews: "/reviews",
  canViewReferrals: "/referrals",
  canViewPulse: "/pulse",
  canViewTasks: "/tasks",
  canApprovePto: "/pto/approvals",
  canAdministerPto: "/pto/admin",
  canViewOnboarding: "/onboarding",
  canViewCoachingHub: "/coaching",
  canViewAgentRenewals: "/agent-renewals",
  canViewCoachFeedback: "/coach-feedback",
  canViewLeadershipDashboard: "/leadership-dashboard",
  canViewActivityLog: "/admin/activity",
  canViewUsers: "/users",
  canViewAdminApprovals: "/approvals",
  canViewAgentMarkets: "/agent-markets",
  canViewOrgChart: "/org-chart",
  canViewRolesResponsibilities: "/roles-responsibilities",
  canViewFeedback: "/feedback",
  canViewMarketingAdmin: "/marketing-admin",
  canViewWebinars: "/webinars",
  canViewTechRequests: "/tech-requests",
  canViewGoals: "/goals",
  canViewJobBoard: "/job-board",
  canViewTalentProfile: "/talent-profile-admin",
  canViewLandingPages: "/landing-pages",
  canViewShortLinks: "/short-links",
  canViewWebhooks: "/webhooks",
  canViewDuplicates: "/duplicates",
  canViewKnowledgeBase: "/kb",
  canViewProjects: "/projects",
  canViewSmartPlans: "/smart-plans",
  canViewEmailNotifications: "/email-notifications",
  canViewFeatureUpdates: "/daily-report-updates",
  canViewResendInbox: "/resend-inbox",
  canViewMarketingTextInbox: "/marketing-text-inbox",
  canViewPasswords: "/passwords",
  canViewSuperPermissions: "/admin/super-permissions",
  canViewAgentDirectory: "/agent-directory",
  canViewAffiliateLinks: "/affiliate-links",
  canViewVendorLists: "/admin/vendors",
};

function filterNavByPermissions(
  groups: NavGroup[],
  permissions: Record<string, boolean> | null | undefined
): NavGroup[] {
  if (!permissions) return groups;
  // Build a set of allowed paths
  const allowedPaths = new Set<string>();
  for (const [key, allowed] of Object.entries(permissions)) {
    if (allowed && PERM_PATH_MAP[key]) allowedPaths.add(PERM_PATH_MAP[key]);
  }
  return groups
    .map(group => ({
      ...group,
      items: group.items.filter(item => {
        // If this path has a permission key, enforce it; otherwise always show
        const hasPermKey = Object.values(PERM_PATH_MAP).includes(item.path);
        return !hasPermKey || allowedPaths.has(item.path);
      }),
    }))
    .filter(group => group.items.length > 0);
}

function buildAdminNav(
  pendingApprovals: number,
  pendingFeedback: number,
  pendingExceptions: number,
  flaggedTx: number,
  unpaidPayouts: number,
  pendingConnReqs: number,
  myOverdueTasks: number = 0,
  pendingMarketing: number = 0,
  resendInboxUnread: number = 0,
  marketingTextInboxUnread: number = 0,
  pendingPtoApprovals: number = 0,
  canManageMcp: boolean = false
): NavGroup[] {
  return [
    {
      label: "Overview",
      items: [
        { icon: Home, label: "Admin Dashboard", path: "/" },
        { icon: BarChart3, label: "Reporting", path: "/analytics" },
        { icon: BrainCircuit, label: "Conversation Intelligence", path: "/analytics/conversation-intelligence" },
        { icon: Trophy, label: "Agent Leaderboard", path: "/leaderboard" },
      ],
    },
    {
      label: "CRM",
      items: [
        { icon: Users, label: "All Contacts", path: "/contacts" },
        { icon: GitBranch, label: "Agent Pipelines", path: "/pipeline" },
        {
          icon: ClipboardList,
          label: "CRM Tasks",
          path: "/tasks",
          badge: myOverdueTasks > 0 ? myOverdueTasks : undefined,
        },
      ],
    },
    {
      label: "ISA",
      items: [
        { icon: PhoneCall, label: "ISM Dashboard", path: "/ism-dashboard" },
        { icon: Flame, label: "Hot Leads", path: "/hot-leads" },
        {
          icon: Inbox,
          label: "Resend Inbox",
          path: "/resend-inbox",
          badge: resendInboxUnread > 0 ? resendInboxUnread : undefined,
        },
        {
          icon: MessageSquare,
          label: "Marketing Text Inbox",
          path: "/marketing-text-inbox",
          badge:
            marketingTextInboxUnread > 0 ? marketingTextInboxUnread : undefined,
        },
        { icon: GitMerge, label: "Duplicate Contacts", path: "/duplicates" },
      ],
    },
    {
      label: "Transactions",
      items: [
        { icon: FileText, label: "All Transactions", path: "/transactions" },
        { icon: Building2, label: "Listings", path: "/listings" },
        { icon: Building2, label: "Properties", path: "/properties" },
        {
          icon: DollarSign,
          label: "Commissions and Payouts",
          path: "/commission",
          badge:
            unpaidPayouts > 0 || flaggedTx > 0 || pendingExceptions > 0
              ? unpaidPayouts + flaggedTx + pendingExceptions
              : undefined,
        },
        { icon: Handshake, label: "Referrals", path: "/referrals" },
      ],
    },
    {
      label: "Agent Success Team",
      items: [
        { icon: Map, label: "Agent Markets", path: "/agent-markets" },
        { icon: Star, label: "Reviews", path: "/reviews" },
        { icon: GraduationCap, label: "Coaching Hub", path: "/coaching" },
        {
          icon: Users,
          label: "Leadership Dashboard",
          path: "/leadership-dashboard",
        },
        {
          icon: MessageSquare,
          label: "Coach Feedback",
          path: "/coach-feedback",
        },
        { icon: Target, label: "Goals", path: "/goals" },
        { icon: Wrench, label: "Vendors", path: "/admin/vendors" },
      ],
    },
    {
      label: "Work",
      items: [
        { icon: Activity, label: "Pulse", path: "/pulse" },
        { icon: Layers, label: "Projects", path: "/projects" },
        { icon: Briefcase, label: "Job Board", path: "/job-board" },
        {
          icon: Activity,
          label: "Talent Profiles",
          path: "/talent-profile-admin",
        },
        {
          icon: ClipboardList,
          label: "Roles and Responsibilities",
          path: "/roles-responsibilities",
        },
        { icon: BookOpen, label: "Knowledgebase", path: "/kb" },
      ],
    },
    {
      label: "Marketing",
      items: [
        { icon: Video, label: "Webinars", path: "/webinars" },
        {
          icon: LayoutDashboard,
          label: "Landing Pages",
          path: "/landing-pages",
        },
        { icon: Zap, label: "Smart Plans", path: "/smart-plans" },
        {
          icon: Megaphone,
          label: "Marketing Requests",
          path: "/marketing-admin",
          badge: pendingMarketing > 0 ? pendingMarketing : undefined,
        },
        { icon: Link2, label: "Short Links", path: "/short-links" },
      ],
    },
    {
      label: "Approvals",
      items: [
        {
          icon: GitMerge,
          label: "Connection Requests",
          path: "/connection-requests",
          badge: pendingConnReqs > 0 ? pendingConnReqs : undefined,
        },
        {
          icon: CheckSquare,
          label: "Admin Approvals",
          path: "/approvals",
          badge: pendingApprovals > 0 ? pendingApprovals : undefined,
        },
      ],
    },
    {
      label: "Admin",
      items: [
        { icon: UserCheck, label: "Users", path: "/users" },
        { icon: Link2, label: "Affiliate Links", path: "/affiliate-links" },
        {
          icon: CalendarDays,
          label: "Agent Renewals",
          path: "/agent-renewals",
        },
        { icon: Tag, label: "Lead Sources", path: "/lead-sources" },
        { icon: Activity, label: "Activity Log", path: "/admin/activity" },
        { icon: Settings, label: "PTO Administration", path: "/pto/admin" },
        {
          icon: Settings,
          label: "Market Match Settings",
          path: "/admin/market-match-settings",
        },
        {
          icon: ClipboardList,
          label: "PTO Approvals",
          path: "/pto/approvals",
          badge: pendingPtoApprovals > 0 ? pendingPtoApprovals : undefined,
        },
        { icon: UserCheck, label: "On/Offboarding", path: "/onboarding" },
        { icon: Network, label: "Org Chart", path: "/org-chart" },
        { icon: Users, label: "Agent Directory", path: "/agent-directory" },
        {
          icon: MessageSquarePlus,
          label: "Feedback and Requests",
          path: "/feedback",
          badge: pendingFeedback > 0 ? pendingFeedback : undefined,
        },
        { icon: Wrench, label: "Tech Requests", path: "/tech-requests" },
        {
          icon: ShieldCheck,
          label: "Super Permissions",
          path: "/admin/super-permissions",
        },
        { icon: Lock, label: "Passwords", path: "/passwords" },
        {
          icon: Mail,
          label: "Email Notifications",
          path: "/email-notifications",
        },
        {
          icon: Sparkles,
          label: "Feature Updates",
          path: "/daily-report-updates",
        },
        ...(canManageMcp
          ? [{ icon: KeyRound, label: "MCP Access", path: "/mcp-access" }]
          : []),
        { icon: Webhook, label: "Webhooks", path: "/webhooks" },
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
  canManageFavorites = false,
  favoritePaths = new Set<string>(),
  onFavoriteChange,
}: {
  navGroups: NavGroup[];
  currentPath: string;
  collapsed: boolean;
  onNavigate: (path: string) => void;
  user: { name?: string | null; profilePhotoUrl?: string | null };
  roleLabel: string;
  roleBadgeClass: string;
  logout: () => void;
  canManageFavorites?: boolean;
  favoritePaths?: Set<string>;
  onFavoriteChange?: (item: NavItem, isFavorite: boolean) => void;
  canSimulate?: boolean;
}) {
  const initials = user.name
    ? user.name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";
  const avatarUrl = (user as any).profilePhotoUrl ?? null;
  // Each category begins expanded so the condensed admin navigation remains discoverable.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set()
  );
  const toggleGroup = (label: string) => {
    setCollapsedGroups(current => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

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
      <nav className="flex-1 overflow-y-auto overscroll-y-contain py-3 px-2 space-y-1">
        {navGroups.map(group => {
          const isGroupCollapsed = collapsedGroups.has(group.label);
          return (
            <div
              key={group.label}
              className="border-b border-sidebar-border/60 pb-1 last:border-b-0"
            >
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={!isGroupCollapsed}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                >
                  <span>{group.label}</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 transition-transform ${isGroupCollapsed ? "-rotate-90" : ""}`}
                  />
                </button>
              )}
              {(collapsed || !isGroupCollapsed) && (
                <ul className="space-y-0.5 pb-1">
                  {group.items.map(item => {
                    const isActive =
                      !item.external &&
                      (item.path === "/"
                        ? currentPath === "/"
                        : currentPath.startsWith(item.path));
                    return (
                      <li key={item.path} className="group/item relative">
                        <div
                          className={`flex items-center gap-1 rounded-md pr-1 transition-colors ${
                            isActive
                              ? "bg-[oklch(0.74_0.14_200)]/15 text-[oklch(0.60_0.14_200)] font-semibold"
                              : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              item.external
                                ? window.open(
                                    item.path,
                                    "_blank",
                                    "noopener,noreferrer"
                                  )
                                : onNavigate(item.path)
                            }
                            title={collapsed ? item.label : undefined}
                            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-[9px] text-left text-sm"
                          >
                            <item.icon className="h-[16px] w-[16px] shrink-0" />
                            {!collapsed && (
                              <span className="truncate leading-tight flex-1">
                                {item.label}
                              </span>
                            )}
                            {!collapsed && item.external && (
                              <Link2 className="h-3 w-3 shrink-0 opacity-60" />
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
                          {canManageFavorites &&
                            !collapsed &&
                            onFavoriteChange && (
                              <button
                                type="button"
                                onClick={event => {
                                  event.stopPropagation();
                                  onFavoriteChange(
                                    item,
                                    !favoritePaths.has(item.path)
                                  );
                                }}
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                  favoritePaths.has(item.path)
                                    ? "text-amber-500"
                                    : "text-muted-foreground opacity-0 group-hover/item:opacity-100 focus:opacity-100"
                                }`}
                                title={
                                  favoritePaths.has(item.path)
                                    ? `Remove ${item.label} from Favorites`
                                    : `Add ${item.label} to Favorites`
                                }
                                aria-label={
                                  favoritePaths.has(item.path)
                                    ? `Remove ${item.label} from Favorites`
                                    : `Add ${item.label} to Favorites`
                                }
                              >
                                <Star
                                  className="h-4 w-4"
                                  fill={
                                    favoritePaths.has(item.path)
                                      ? "currentColor"
                                      : "none"
                                  }
                                />
                              </button>
                            )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
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
                {avatarUrl && (
                  <AvatarImage
                    src={avatarUrl}
                    alt={user.name ?? ""}
                    className="object-cover"
                  />
                )}
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
                    <span
                      className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${roleBadgeClass}`}
                    >
                      {roleLabel}
                    </span>
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-48">
            <DropdownMenuItem
              onClick={() => (window.location.href = "/profile")}
              className="cursor-pointer"
            >
              <Settings className="h-4 w-4 mr-2" />
              My Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={logout}
              className="text-destructive cursor-pointer"
            >
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
  const [commandOpen, setCommandOpen] = useState(false);
  const role = (user as any)?.role as
    | "admin"
    | "agent"
    | "isa"
    | "agent_support"
    | undefined;
  const isAdmin = role === "admin";
  const utils = trpc.useUtils();
  const adminNavigationPreferences = trpc.adminNavigation.preferences.useQuery(
    undefined,
    {
      enabled: isAdmin,
      staleTime: 30_000,
    }
  );
  const trackAdminPage = trpc.adminNavigation.trackPage.useMutation({
    onSuccess: () => void utils.adminNavigation.preferences.invalidate(),
  });
  const setAdminFavorite = trpc.adminNavigation.setFavorite.useMutation({
    onSuccess: () => void utils.adminNavigation.preferences.invalidate(),
  });
  const lastTrackedAdminPath = useRef<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        isAdmin &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        setCommandOpen(open => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAdmin]);

  useEffect(() => {
    if (
      !isAdmin ||
      !currentPath ||
      lastTrackedAdminPath.current === currentPath
    )
      return;
    lastTrackedAdminPath.current = currentPath;
    trackAdminPage.mutate({ path: currentPath });
  }, [currentPath, isAdmin, trackAdminPage]);

  const isPulsePath =
    currentPath === "/pulse" || currentPath.startsWith("/pulse/");
  const isPulseMeetingPath =
    currentPath === "/pulse/meetings" ||
    currentPath.startsWith("/pulse/meetings/");

  // Pulse navigation is membership-aware and intentionally replaces the broader
  // SavvyOS nav while someone is working inside Pulse.
  const { data: pulseShell } = trpc.pulse.shell.useQuery(undefined, {
    enabled: !!user && isPulsePath,
    staleTime: 30000,
  });

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
  const { data: onboardingStatus } =
    trpc.onboarding.hasActiveOnboarding.useQuery(undefined, {
      enabled: role === "agent",
      refetchInterval: 60000,
    });

  // Fetch group leader status for agent nav
  const { data: groupLeaderStatus } = trpc.groups.isGroupLeader.useQuery(
    undefined,
    { enabled: role === "agent", refetchInterval: 120000 }
  );
  // Fetch pending commission exceptions count for admin badge
  const { data: pendingExceptionsData } =
    trpc.commissionExceptions.pendingCount.useQuery(undefined, {
      enabled: role === "admin",
      refetchInterval: 60000,
    });
  // Fetch flagged transaction count for Transaction Reporting badge
  const { data: flaggedTxData } = trpc.transactions.flaggedCount.useQuery(
    undefined,
    { enabled: role === "admin", refetchInterval: 60000 }
  );
  // Fetch unpaid payouts count for Payout Report badge
  const { data: unpaidPayoutsData } =
    trpc.transactions.unpaidPayoutsCount.useQuery(undefined, {
      enabled: role === "admin",
      refetchInterval: 60000,
    });
  // Fetch pending connection requests count for admin/ISA badge
  const { data: pendingConnReqsData } =
    trpc.connectionRequests.pendingCount.useQuery(undefined, {
      enabled: role === "admin" || role === "isa",
      refetchInterval: 30000,
    });
  // Fetch pending marketing requests count for admin badge
  const { data: pendingMarketingData } =
    trpc.marketingRequests.pendingCount.useQuery(undefined, {
      enabled: role === "admin",
      refetchInterval: 60000,
    });
  // Fetch PTO requests awaiting this manager's decision. The server returns zero without the explicit Super Permission.
  const { data: pendingPtoApprovalsData } = trpc.pto.pendingCount.useQuery(
    undefined,
    { enabled: role === "admin", refetchInterval: 30000 }
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

  // Fetch admin permissions for nav filtering
  const { data: adminPerms } = trpc.permissions.getMyPermissions.useQuery(
    undefined,
    { enabled: role === "admin", staleTime: 30000 }
  );

  // Resend Inbox is separately super-permissioned because it contains external correspondence.
  const canUseResendInbox =
    role === "isa" ||
    (role === "admin" &&
      !!(adminPerms as Record<string, boolean> | undefined)?.canViewResendInbox);
  const { data: resendInboxUnreadData } = trpc.resendInbox.unreadCount.useQuery(
    undefined,
    { enabled: canUseResendInbox, refetchInterval: 30000 }
  );
  const canUseMarketingTextInbox =
    role === "isa" ||
    (role === "admin" &&
      !!(adminPerms as Record<string, boolean> | undefined)
        ?.canViewMarketingTextInbox);
  const { data: marketingTextInboxUnreadData } =
    trpc.marketingTextInbox.unreadCount.useQuery(undefined, {
      enabled: canUseMarketingTextInbox,
      refetchInterval: 30000,
    });

  // Password navigation is available only to list owners, selected recipients, and designated super users.
  const { data: passwordAccess } = trpc.passwords.hasAccessibleLists.useQuery(
    undefined,
    { enabled: !!user, staleTime: 30000 }
  );

  // ── Early returns (all hooks must be above this line) ──────────────────────
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) {
    if (import.meta.env.VITE_DEV_LOGIN_ENABLED === "true")
      return <DevLoginScreen />;
    window.location.href = "/login";
    return null;
  }

  const pending =
    typeof pendingCount === "object" && pendingCount !== null
      ? (pendingCount as any).count
      : (pendingCount ?? 0);
  const pendingFb =
    typeof pendingFeedbackCount === "number" ? pendingFeedbackCount : 0;
  const pendingExc = (pendingExceptionsData as any)?.count ?? 0;
  const flaggedTx = (flaggedTxData as any)?.count ?? 0;
  const unpaidPayouts = (unpaidPayoutsData as any)?.count ?? 0;
  const pendingConnReqs = (pendingConnReqsData as any)?.count ?? 0;
  const myOverdueTaskCount = (myOverdueTaskData as any)?.count ?? 0;
  const pendingMarketingCount = (pendingMarketingData as any)?.count ?? 0;
  const pendingPtoApprovalsCount = (pendingPtoApprovalsData as any)?.count ?? 0;
  const hasActiveOnboarding = onboardingStatus?.active ?? false;
  const isGroupLeader = groupLeaderStatus?.isLeader ?? false;
  const resendInboxUnreadCount = (resendInboxUnreadData as any)?.count ?? 0;
  const marketingTextInboxUnreadCount =
    (marketingTextInboxUnreadData as any)?.count ?? 0;

  const standardNavGroups =
    role === "admin"
      ? buildAdminNav(
          pending,
          pendingFb,
          pendingExc,
          flaggedTx,
          unpaidPayouts,
          pendingConnReqs,
          myOverdueTaskCount,
          pendingMarketingCount,
          resendInboxUnreadCount,
          marketingTextInboxUnreadCount,
          pendingPtoApprovalsCount,
          ["tyler@savvy.realty", "elana@savvy.realty", "dyl@savvy.realty"].includes(
            String((user as any).email ?? "").toLowerCase()
          )
        )
      : role === "isa"
        ? buildIsaNav(
            pendingConnReqs,
            myOverdueTaskCount,
            resendInboxUnreadCount,
            marketingTextInboxUnreadCount
          )
        : role === "agent_support"
          ? buildAgentSupportNav()
          : buildAgentNav(
              hasActiveOnboarding,
              isGroupLeader,
              myOverdueTaskCount
            );
  const canUsePulseLayout =
    isPulsePath && Boolean((pulseShell as any)?.hasPulseAccess);
  const baseNavGroups = canUsePulseLayout
    ? buildPulseNav(pulseShell as PulseNavShell | undefined)
    : standardNavGroups;
  // For admin users, filter nav by their permissions, then apply password-list visibility.
  const permissionFilteredNavGroups: NavGroup[] =
    role === "admin"
      ? filterNavByPermissions(
          baseNavGroups,
          adminPerms as Record<string, boolean> | null | undefined
        )
      : baseNavGroups;
  const passwordNavItem: NavItem = {
    icon: Lock,
    label: "Passwords",
    path: "/passwords",
  };
  const navGroups: NavGroup[] = canUsePulseLayout
    ? baseNavGroups
    : role === "admin"
      ? permissionFilteredNavGroups
          .map(group => ({
            ...group,
            items: group.items.filter(
              item =>
                item.path !== "/passwords" ||
                !!passwordAccess?.hasAccessibleLists
            ),
          }))
          .filter(group => group.items.length > 0)
      : passwordAccess?.hasAccessibleLists
        ? permissionFilteredNavGroups.some(group => group.label === "Resources")
          ? permissionFilteredNavGroups.map(group =>
              group.label === "Resources"
                ? { ...group, items: [...group.items, passwordNavItem] }
                : group
            )
          : [
              ...permissionFilteredNavGroups,
              { label: "Shared", items: [passwordNavItem] },
            ]
        : permissionFilteredNavGroups;
  // My PTO is an employee benefit driven only by the authoritative W-2 tag.
  // Approval and administration remain separately controlled through Super Permissions.
  const ptoItem: NavItem = {
    icon: CalendarDays,
    label: "My PTO",
    path: "/pto",
  };
  const employmentFilteredNavGroups = navGroups
    .map(group => {
      if (group.label !== "Operations") return group;
      const itemsWithoutMyPto = group.items.filter(
        item => item.path !== "/pto"
      );
      if ((user as any).employmentType !== "w2")
        return { ...group, items: itemsWithoutMyPto };
      const tasksIndex = itemsWithoutMyPto.findIndex(
        item => item.path === "/tasks"
      );
      const insertionIndex = tasksIndex >= 0 ? tasksIndex + 1 : 0;
      return {
        ...group,
        items: [
          ...itemsWithoutMyPto.slice(0, insertionIndex),
          ptoItem,
          ...itemsWithoutMyPto.slice(insertionIndex),
        ],
      };
    })
    .filter(group => group.items.length > 0);
  // Pulse navigation deliberately has no Operations group; W-2 PTO access must
  // remain discoverable there and in any future role-specific shell.
  if (
    (user as any).employmentType === "w2" &&
    !employmentFilteredNavGroups.some(group =>
      group.items.some(item => item.path === "/pto")
    )
  ) {
    employmentFilteredNavGroups.push({ label: "Operations", items: [ptoItem] });
  }
  // This is intentionally derived from the same permission-filtered navigation
  // source used by the sidebar. New admin links therefore appear automatically
  // in Search and cannot be favorited or surfaced without Super Permission.
  const adminPreferenceByPath = new globalThis.Map<string, any>(
    (adminNavigationPreferences.data ?? []).map(preference => [
      preference.path,
      preference,
    ])
  );
  const adminFavoritePaths = new Set(
    (adminNavigationPreferences.data ?? [])
      .filter(preference => preference.isFavorite)
      .map(preference => preference.path)
  );
  const availableAdminNavItems = employmentFilteredNavGroups.flatMap(group =>
    group.items.map(item => ({ group: group.label, item }))
  );
  const favoriteNavItems = isAdmin
    ? availableAdminNavItems
        .filter(({ item }) => adminFavoritePaths.has(item.path))
        .sort((left, right) => {
          const usageDifference =
            Number(adminPreferenceByPath.get(right.item.path)?.viewCount ?? 0) -
            Number(adminPreferenceByPath.get(left.item.path)?.viewCount ?? 0);
          return (
            usageDifference || left.item.label.localeCompare(right.item.label)
          );
        })
        .map(({ item }) => item)
    : [];
  const sidebarNavGroups: NavGroup[] =
    favoriteNavItems.length > 0
      ? [
          { label: "Favorites", items: favoriteNavItems },
          ...employmentFilteredNavGroups,
        ]
      : employmentFilteredNavGroups;
  const rankedCommandItems = availableAdminNavItems.sort((left, right) => {
    const usageDifference =
      Number(adminPreferenceByPath.get(right.item.path)?.viewCount ?? 0) -
      Number(adminPreferenceByPath.get(left.item.path)?.viewCount ?? 0);
    if (usageDifference !== 0) return usageDifference;
    const favoriteDifference =
      Number(adminFavoritePaths.has(right.item.path)) -
      Number(adminFavoritePaths.has(left.item.path));
    return (
      favoriteDifference || left.item.label.localeCompare(right.item.label)
    );
  });
  const roleLabel =
    role === "admin"
      ? "Admin"
      : role === "isa"
        ? "ISA"
        : role === "agent_support"
          ? "Agent Support"
          : "Agent";
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
    navGroups: sidebarNavGroups,
    currentPath,
    collapsed,
    user: {
      ...user,
      profilePhotoUrl: (myCoreProfile as any)?.profilePhotoUrl ?? null,
    },
    roleLabel,
    roleBadgeClass,
    logout,
    canManageFavorites: isAdmin,
    favoritePaths: adminFavoritePaths,
    onFavoriteChange: (item: NavItem, favorite: boolean) =>
      setAdminFavorite.mutate({ path: item.path, isFavorite: favorite }),
  };

  return (
    <>
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-[100] min-h-11 rounded-md bg-primary px-4 py-3 text-base font-medium text-primary-foreground focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Skip to content
      </a>
      {isAdmin && (
        <CommandDialog
          open={commandOpen}
          onOpenChange={setCommandOpen}
          title="Navigate SavvyOS"
          description="Your most-used permitted pages appear first. Search to jump anywhere in SavvyOS."
          className="max-w-3xl"
        >
          <CommandInput placeholder="Search SavvyOS pages…" />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>No matching pages available.</CommandEmpty>
            <CommandGroup heading="Pages">
              {rankedCommandItems.map(({ group, item }) => (
                <CommandItem
                  key={item.path}
                  value={`${item.label} ${group}`}
                  onSelect={() => {
                    setCommandOpen(false);
                    if (item.external)
                      window.open(item.path, "_blank", "noopener,noreferrer");
                    else navigate(item.path);
                  }}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {group}
                  </span>
                  {adminFavoritePaths.has(item.path) && (
                    <Star className="ml-auto h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                  )}
                  {item.badge != null && (
                    <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                      {item.badge}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      )}
      <div className="flex h-[100dvh] overflow-hidden bg-background">
        {/* ── Desktop Sidebar ── */}
        <aside
          className={`hidden md:flex flex-col shrink-0 ${sidebarBg} ${sidebarWidth} transition-[width] duration-200 ease-linear relative z-20`}
        >
          <SidebarNav {...navProps} onNavigate={path => navigate(path)} />
          {/* Collapse toggle button */}
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
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
            <aside
              className={`absolute left-0 top-0 bottom-0 w-72 ${sidebarBg} flex flex-col z-50 shadow-2xl`}
            >
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
                onNavigate={path => {
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
            {canUsePulseLayout ? (
              <button
                type="button"
                onClick={() => navigate("/")}
                className="hidden min-h-11 items-center gap-2 rounded-md px-3 text-base font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
                aria-label="Return to SavvyOS"
              >
                <ArrowLeft className="h-4 w-4" />
                SavvyOS
              </button>
            ) : null}
            {canUsePulseLayout ? (
              <button
                type="button"
                onClick={() => navigate("/")}
                className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-base font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
                aria-label="Return to SavvyOS"
              >
                <ArrowLeft className="h-4 w-4" />
                SavvyOS
              </button>
            ) : null}
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
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${roleBadgeClass}`}
              >
                {roleLabel}
              </span>
            </div>
            {/* Desktop: spacer */}
            <div className="hidden md:flex flex-1" />
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setCommandOpen(true)}
                  className="hidden min-h-9 w-[420px] items-center gap-2 rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted lg:w-[520px] md:flex"
                  aria-label="Search SavvyOS pages"
                >
                  <Search className="h-4 w-4" />
                  <span className="flex-1 text-left">Search pages</span>
                  <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium">
                    ⌘K
                  </kbd>
                </button>
                <button
                  type="button"
                  onClick={() => setCommandOpen(true)}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:hidden"
                  aria-label="Search SavvyOS pages"
                >
                  <Search className="h-5 w-5" />
                </button>
              </>
            )}
          </header>

          {/* Simulation banner — shown when impersonating another user */}
          <SimulationBanner />
          {/* Work-as-agent banner — shown when agent_support is operating as an agent */}
          <WorkAsAgentBanner />

          {/* Page content — extra bottom padding on mobile for the dev switcher */}
          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 overflow-y-auto overscroll-y-contain p-4 md:p-6 bg-background pb-safe"
          >
            {children}
          </main>

          {/* This remains outside routed page content so the embedded Aircall Workspace and text drafts survive navigation. */}
          {role === "isa" && <CommunicationsHub />}

          {/* Dev mode role switcher */}
          {import.meta.env.VITE_DEV_LOGIN_ENABLED === "true" && (
            <DevRoleSwitcher currentRole={(user as any)?.role} />
          )}
        </div>
      </div>
    </>
  );
}
