import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

// Layouts
import AppLayout from "./components/AppLayout";

// Pages
import Dashboard from "./pages/Dashboard";
import ContactsPage from "./pages/ContactsPage";
import ContactDetail from "./pages/ContactDetail";
import TransactionsPage from "./pages/TransactionsPage";
import TransactionDetail from "./pages/TransactionDetail";
import PropertiesPage from "./pages/PropertiesPage";
import PropertyDetail from "./pages/PropertyDetail";
import TasksPage from "./pages/TasksPage";
import AnalyticsPage from "./pages/AnalyticsPage";
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
import ReferralPartnersPage from "./pages/ReferralPartnersPage";
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
import OnboardingPage from "./pages/OnboardingPage";
import RequestConnectionPage from "./pages/RequestConnectionPage";
import ProfilePage from "./pages/ProfilePage";
import DevRoleSwitcher from "./components/DevRoleSwitcher";
import DevLoginScreen from "./components/DevLoginScreen";
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

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

  return <>{children}</>;
}

function Router() {
  return (
    <AuthGuard>
      <AppLayout>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/contacts" component={ContactsPage} />
          <Route path="/contacts/:id" component={ContactDetail} />
          <Route path="/transactions" component={TransactionsPage} />
          <Route path="/transactions/:id" component={TransactionDetail} />
          <Route path="/properties" component={PropertiesPage} />
          <Route path="/properties/:id" component={PropertyDetail} />
          <Route path="/pipeline" component={PipelinePage} />
          <Route path="/pipeline/:id" component={AgentConnectionDetail} />
          <Route path="/connection-requests" component={ConnectionRequestsPage} />
          <Route path="/request-connection" component={RequestConnectionPage} />
          <Route path="/tasks" component={TasksPage} />
          <Route path="/my-tasks" component={MyTasksPage} />
          <Route path="/tasks/:id" component={TaskDetailPage} />
          <Route path="/analytics" component={AnalyticsPage} />
          <Route path="/commission" component={CommissionPage} />
          <Route path="/group-leader-commissions" component={GroupLeaderCommissionsPage} />
          <Route path="/group-leader-dashboard" component={GroupLeaderDashboard} />
          <Route path="/users">{() => <AdminRoute><UsersPage /></AdminRoute>}</Route>
          <Route path="/lead-sources">{() => <AdminRoute><LeadSourcesPage /></AdminRoute>}</Route>
          <Route path="/groups">{() => <AdminRoute><GroupsPage /></AdminRoute>}</Route>
          <Route path="/payout-report">{() => <AdminRoute><PayoutReportPage /></AdminRoute>}</Route>
          <Route path="/documents">{() => <AdminRoute><DocumentsPage /></AdminRoute>}</Route>
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
          <Route path="/referral-partners" component={ReferralPartnersPage} />
          <Route path="/my-onboarding" component={MyOnboardingPage} />
          <Route path="/org-chart" component={OrgChartPage} />
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
          <Route path="/partner-links">{() => <AdminRoute><PartnerLinksPage /></AdminRoute>}</Route>
          <Route path="/goals">{() => <AdminRoute><GoalsPage /></AdminRoute>}</Route>
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </AppLayout>
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
