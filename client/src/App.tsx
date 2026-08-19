import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import { useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

// Layouts
import AppLayout from "./components/AppLayout";

// Pages
import Dashboard from "./pages/Dashboard";
import IsaStatsPage from "./pages/isa/IsaStatsPage";
import ContactsPage from "./pages/ContactsPage";
import ContactDetail from "./pages/ContactDetail";
import TransactionsPage from "./pages/TransactionsPage";
import TransactionDetail from "./pages/TransactionDetail";
import PropertiesPage from "./pages/PropertiesPage";
import PropertyDetail from "./pages/PropertyDetail";
import ProformaPage from "./pages/ProformaPage";
import MyProformasPage from "./pages/MyProformasPage";
import ProformaDefaultsPage from "./pages/ProformaDefaultsPage";
import TasksPage from "./pages/TasksPage";
import ReportingSuitePage from "./pages/ReportingSuitePage";
import CustomReportsPage from "./pages/CustomReportsPage";
import IsmDashboardPage from "./pages/IsmDashboardPage";
import PipelinePage from "./pages/PipelinePage";
import CommissionPage from "./pages/CommissionPage";
import GroupLeaderCommissionsPage from "./pages/GroupLeaderCommissionsPage";
import GroupLeaderDashboard from "./pages/GroupLeaderDashboard";
import UsersPage from "./pages/UsersPage";
import LeadSourcesPage from './pages/LeadSourcesPage';
import GroupsPage from './pages/GroupsPage';
import PayoutReportPage from './pages/PayoutReportPage';
import DocumentsPage from "./pages/DocumentsPage";
import AgentConnectionDetail from "./pages/AgentConnectionDetail";
import AdminApprovalsPage from "./pages/AdminApprovalsPage";
import ListingsPage from "./pages/ListingsPage";
import ListingDetail from "./pages/ListingDetail";
import SmartPlansPage from "./pages/SmartPlansPage";
import SmartPlanEditorPage from "./pages/SmartPlanEditorPage";
import EmailTestPage from "./pages/EmailTestPage";
import MarketsPage from "./pages/MarketsPage";
import OrgChartPage from "./pages/OrgChartPage";
import AgentProfilePage from "./pages/AgentProfilePage";
import MarketPerformancePage from "./pages/MarketPerformancePage";
import TransactionReportingPage from "./pages/TransactionReportingPage";
import FeedbackPage from "./pages/FeedbackPage";
import TaskDetailPage from "./pages/TaskDetailPage";
import MyTasksPage from "./pages/MyTasksPage";
import OnboardingTemplatesPage from "./pages/OnboardingTemplatesPage";
import OnboardingTrackerPage from "./pages/OnboardingTrackerPage";
import MyOnboardingPage from "./pages/MyOnboardingPage";
import OnboardingReportPage from "./pages/OnboardingReportPage";
import LeadershipDashboardPage from "./pages/LeadershipDashboardPage";
import CommissionExceptionsPage from "./pages/CommissionExceptionsPage";
import MarketMatchCallPage from "./pages/MarketMatchCallPage";
import MarketMatchConfigPage from "./pages/MarketMatchConfigPage";
import MarketProfileEditorPage from "./pages/MarketProfileEditorPage";
import MarketDrillDownPage from "./pages/MarketDrillDownPage";
import MarketingRequestsPage from "./pages/MarketingRequestsPage";
import MarketingAdminPage from "./pages/MarketingAdminPage";
import ConnectionRequestsPage from "./pages/ConnectionRequestsPage";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import DepartmentManagementPage from "./pages/DepartmentManagementPage";
import KnowledgeBasePage from "./pages/KnowledgeBasePage";
import AgentSupportPage from "./pages/AgentSupportPage";
import DuplicatesPage from "./pages/DuplicatesPage";
import WebhooksPage from "./pages/WebhooksPage";
import EmailNotificationsPage from "./pages/EmailNotificationsPage";
import PartnerLeadForm from "./pages/PartnerLeadForm";
import PartnerLinksPage from "./pages/PartnerLinksPage";
import GoalsPage from "./pages/GoalsPage";
import StatsPage from "./pages/StatsPage";
import AgentLeaderboardPage from "./pages/AgentLeaderboardPage";
import AgentLeaderboardPresentationPage from "./pages/AgentLeaderboardPresentationPage";
import ActivityTimelinePage from "./pages/admin/ActivityTimelinePage";
import OnboardingPage from "./pages/OnboardingPage";
import SuperPermissionsPage from "./pages/SuperPermissionsPage";
import RequestConnectionPage from "./pages/RequestConnectionPage";
import ProfilePage from "./pages/ProfilePage";
import DevRoleSwitcher from "./components/DevRoleSwitcher";
import DevLoginScreen from "./components/DevLoginScreen";
import ActivityDownloadTracker from "./components/ActivityDownloadTracker";
import IsaActivityTracker from "./components/IsaActivityTracker";
import LoginPage from "./pages/LoginPage";
import CareersPage from "./pages/CareersPage";
import JobBoardAdminPage from "./pages/JobBoardAdminPage";
import TalentProfilePage from "./pages/TalentProfilePage";
import TalentProfileAdminPage from "./pages/TalentProfileAdminPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import CoachingHubPage from "./pages/CoachingHubPage";
import CoachingAgentPage from "./pages/CoachingAgentPage";
import CoachingSessionPage from "./pages/CoachingSessionPage";
import CoachingSessionsPage from "./pages/CoachingSessionsPage";
import HotLeadsPage from "./pages/HotLeadsPage";
import PasswordsPage from "./pages/PasswordsPage";
import RolesResponsibilitiesPage from "./pages/RolesResponsibilitiesPage";
import RoleResponsibilityDetailPage from "./pages/RoleResponsibilityDetailPage";
import PulseFoundationPage from "./pages/PulseFoundationPage";
import DailyReportPage from "./pages/DailyReportPage";
import DailyReportFeatureUpdatesPage from "./pages/DailyReportFeatureUpdatesPage";
import ReferralsPage from "./pages/ReferralsPage";
import ReferralDetailPage from "./pages/ReferralDetailPage";
import ReferralAgentDetailPage from "./pages/ReferralAgentDetailPage";

const IS_DEV = import.meta.env.VITE_DEV_LOGIN_ENABLED === "true";

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const role = (user as any)?.role;
  if (role && role !== "admin") {
    navigate("/");
    return null;
  }
  return <>{children}</>;
}

function AdminOrIsaRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const role = (user as any)?.role;
  if (role && role !== "admin" && role !== "isa") {
    navigate("/");
    return null;
  }
  return <>{children}</>;
}

function AgentOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  if (user?.role && user.role !== "agent") {
    navigate("/");
    return null;
  }
  return <>{children}</>;
}

function NonAgentRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const role = (user as any)?.role;
  if (role === "agent") {
    navigate("/pipeline");
    return null;
  }
  return <>{children}</>;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-lg">S</span>
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading SavvyOS...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (IS_DEV) return <DevLoginScreen />;
    // Redirect to internal login page instead of Manus OAuth
    window.location.href = "/login";
    return null;
  }

  return <><ActivityDownloadTracker /><IsaActivityTracker />{children}</>;
}

function IsmDashboardRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isAdmin = (user as any)?.role === "admin";
  const { data: permissions, isLoading } = trpc.permissions.getMyPermissions.useQuery(undefined, { enabled: isAdmin });
  if (!isAdmin) return <NotFound />;
  if (isLoading) return <div className="min-h-[40vh]" />;
  if (!(permissions as any)?.canViewIsmDashboard) return <NotFound />;
  return <>{children}</>;
}

function CustomReportsRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isAdmin = (user as any)?.role === "admin";
  const { data: permissions, isLoading } = trpc.permissions.getMyPermissions.useQuery(undefined, { enabled: isAdmin });
  if (!isAdmin) return <NotFound />;
  if (isLoading) return <div className="min-h-[40vh]" />;
  if (!(permissions as any)?.canViewCustomReports) return <NotFound />;
  return <>{children}</>;
}

function Router() {
  return (
    <AuthGuard>
      <Switch>
        <Route path="/leaderboard/present" component={AgentLeaderboardPresentationPage} />
        <Route>
          {() => (
            <AppLayout>
              <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/ism-dashboard">{() => <IsmDashboardRoute><IsmDashboardPage /></IsmDashboardRoute>}</Route>
          <Route path="/isa-stats">{() => <AdminOrIsaRoute><IsaStatsPage /></AdminOrIsaRoute>}</Route>
          <Route path="/contacts">{() => <NonAgentRoute><ContactsPage /></NonAgentRoute>}</Route>
          <Route path="/contacts/:id">{() => <NonAgentRoute><ContactDetail /></NonAgentRoute>}</Route>
          <Route path="/transactions" component={TransactionsPage} />
          <Route path="/transactions/:id" component={TransactionDetail} />
          <Route path="/properties" component={PropertiesPage} />
          <Route path="/properties/:id" component={PropertyDetail} />
          <Route path="/properties/:id/proforma" component={ProformaPage} />
          <Route path="/proformas" component={MyProformasPage} />
          <Route path="/proforma-defaults" component={ProformaDefaultsPage} />
          <Route path="/pipeline" component={PipelinePage} />
          <Route path="/daily-report">{() => <AgentOnlyRoute><DailyReportPage /></AgentOnlyRoute>}</Route>
          <Route path="/pipeline/:id" component={AgentConnectionDetail} />
          <Route path="/connection-requests" component={ConnectionRequestsPage} />
          <Route path="/request-connection" component={RequestConnectionPage} />
          <Route path="/tasks" component={TasksPage} />
          <Route path="/my-tasks" component={MyTasksPage} />
          <Route path="/tasks/:id" component={TaskDetailPage} />
          <Route path="/analytics/legacy">{() => <AdminRoute><ReportingSuitePage /></AdminRoute>}</Route>
          <Route path="/analytics/lead-cohorts">{() => <AdminRoute><ReportingSuitePage /></AdminRoute>}</Route>
          <Route path="/analytics">{() => <AdminRoute><ReportingSuitePage /></AdminRoute>}</Route>
          <Route path="/custom-reports">{() => <CustomReportsRoute><CustomReportsPage /></CustomReportsRoute>}</Route>
          <Route path="/commission" component={CommissionPage} />
          <Route path="/group-leader-commissions" component={GroupLeaderCommissionsPage} />
          <Route path="/group-leader-dashboard" component={GroupLeaderDashboard} />
          <Route path="/users">{() => <AdminRoute><UsersPage /></AdminRoute>}</Route>
          <Route path="/lead-sources">{() => <AdminRoute><LeadSourcesPage /></AdminRoute>}</Route>
          <Route path="/groups">{() => <AdminRoute><GroupsPage /></AdminRoute>}</Route>
          <Route path="/payout-report">{() => <AdminRoute><PayoutReportPage /></AdminRoute>}</Route>
          <Route path="/documents">{() => <AdminRoute><DocumentsPage /></AdminRoute>}</Route>
          <Route path="/smart-plans/new">{() => <AdminRoute><SmartPlanEditorPage isNew /></AdminRoute>}</Route>
          <Route path="/smart-plans/:id">{() => <AdminRoute><SmartPlanEditorPage /></AdminRoute>}</Route>
          <Route path="/smart-plans">{() => <AdminRoute><SmartPlansPage /></AdminRoute>}</Route>
          <Route path="/approvals">{() => <AdminRoute><AdminApprovalsPage /></AdminRoute>}</Route>
          <Route path="/listings" component={ListingsPage} />
          <Route path="/listings/:id" component={ListingDetail} />
          <Route path="/email-test">{() => <AdminRoute><EmailTestPage /></AdminRoute>}</Route>
          <Route path="/markets">{() => <AdminRoute><MarketsPage /></AdminRoute>}</Route>
          <Route path="/market-performance">{() => <AdminRoute><MarketPerformancePage /></AdminRoute>}</Route>
          <Route path="/transaction-reporting">{() => <AdminRoute><TransactionReportingPage /></AdminRoute>}</Route>
          <Route path="/feedback">{() => <AdminRoute><FeedbackPage /></AdminRoute>}</Route>
          <Route path="/onboarding">{() => <AdminRoute><OnboardingPage /></AdminRoute>}</Route>
          <Route path="/onboarding-templates">{() => <AdminRoute><OnboardingPage /></AdminRoute>}</Route>
          <Route path="/onboarding-tracker">{() => <AdminRoute><OnboardingPage /></AdminRoute>}</Route>
          <Route path="/onboarding-report">{() => <AdminRoute><OnboardingPage /></AdminRoute>}</Route>
          <Route path="/leadership-dashboard">{() => <AdminRoute><LeadershipDashboardPage /></AdminRoute>}</Route>
          <Route path="/commission-exceptions">{() => <AdminRoute><CommissionExceptionsPage /></AdminRoute>}</Route>
          <Route path="/referrals">{() => <AdminOrIsaRoute><ReferralsPage /></AdminOrIsaRoute>}</Route>
          <Route path="/referrals/agents/:id">{() => <AdminOrIsaRoute><ReferralAgentDetailPage /></AdminOrIsaRoute>}</Route>
          <Route path="/referrals/:id">{() => <AdminOrIsaRoute><ReferralDetailPage /></AdminOrIsaRoute>}</Route>
          <Route path="/my-onboarding" component={MyOnboardingPage} />
          <Route path="/org-chart" component={OrgChartPage} />
          <Route path="/roles-responsibilities">{() => <AdminRoute><RolesResponsibilitiesPage /></AdminRoute>}</Route>
          <Route path="/roles-responsibilities/:id">{() => <AdminRoute><RoleResponsibilityDetailPage /></AdminRoute>}</Route>
          <Route path="/pulse" component={PulseFoundationPage} />
          <Route path="/profile" component={ProfilePage} />
          <Route path="/agents/:id" component={AgentProfilePage} />
          <Route path="/market-match-call" component={MarketMatchCallPage} />
          <Route path="/market-match-config">{() => <AdminOrIsaRoute><MarketMatchConfigPage /></AdminOrIsaRoute>}</Route>
          <Route path="/market-profile/new">{() => <AdminRoute><MarketProfileEditorPage /></AdminRoute>}</Route>
          <Route path="/market-profile/:id">{(params: any) => <AdminRoute><MarketProfileEditorPage marketId={Number(params.id)} /></AdminRoute>}</Route>
          <Route path="/analytics/market/:id">{(params: any) => <AdminRoute><MarketDrillDownPage /></AdminRoute>}</Route>
          <Route path="/marketing-requests" component={MarketingRequestsPage} />
          <Route path="/marketing-admin">{() => <AdminRoute><MarketingAdminPage /></AdminRoute>}</Route>
          <Route path="/projects" component={ProjectsPage} />
          <Route path="/projects/:id" component={ProjectDetailPage} />
          <Route path="/departments" component={DepartmentManagementPage} />
          <Route path="/kb" component={KnowledgeBasePage} />
          <Route path="/agent-support" component={AgentSupportPage} />
          <Route path="/duplicates">{() => <AdminRoute><DuplicatesPage /></AdminRoute>}</Route>
          <Route path="/webhooks">{() => <AdminRoute><WebhooksPage /></AdminRoute>}</Route>
          <Route path="/email-notifications">{() => <AdminRoute><EmailNotificationsPage /></AdminRoute>}</Route>
          <Route path="/daily-report-updates">{() => <AdminRoute><DailyReportFeatureUpdatesPage /></AdminRoute>}</Route>
          <Route path="/partner-links">{() => <AdminRoute><PartnerLinksPage /></AdminRoute>}</Route>
          <Route path="/goals">{() => <AdminRoute><GoalsPage /></AdminRoute>}</Route>
          <Route path="/job-board">{() => <AdminRoute><JobBoardAdminPage /></AdminRoute>}</Route>
          <Route path="/talent-profile-admin">{() => <AdminRoute><TalentProfileAdminPage /></AdminRoute>}</Route>
          <Route path="/stats" component={StatsPage} />
          <Route path="/leaderboard" component={AgentLeaderboardPage} />
          <Route path="/admin/activity">{() => <AdminRoute><ActivityTimelinePage /></AdminRoute>}</Route>
          <Route path="/admin/super-permissions">{() => <AdminRoute><SuperPermissionsPage /></AdminRoute>}</Route>
          <Route path="/coaching">{() => <AdminRoute><CoachingHubPage /></AdminRoute>}</Route>
          <Route path="/coaching/sessions">{() => <AdminRoute><CoachingSessionsPage /></AdminRoute>}</Route>
          <Route path="/coaching/agent/:id">{() => <AdminRoute><CoachingAgentPage /></AdminRoute>}</Route>
          <Route path="/coaching/session/:id">{() => <AdminRoute><CoachingSessionPage /></AdminRoute>}</Route>
          <Route path="/hot-leads" component={HotLeadsPage} />
          <Route path="/passwords" component={PasswordsPage} />
                <Route path="/404" component={NotFound} />
                <Route component={NotFound} />
              </Switch>
            </AppLayout>
          )}
        </Route>
      </Switch>
    </AuthGuard>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          {/* Public routes — no auth required */}
          <Switch>
            <Route path="/partner-lead" component={PartnerLeadForm} />
            <Route path="/careers" component={CareersPage} />
            <Route path="/talent-profile" component={TalentProfilePage} />
            <Route path="/login" component={LoginPage} />
            <Route path="/forgot-password" component={ForgotPasswordPage} />
            <Route path="/reset-password" component={ResetPasswordPage} />
            <Route>{() => <Router />}</Route>
          </Switch>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
