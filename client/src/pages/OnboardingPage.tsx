import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";
import OnboardingTrackerPage from "./OnboardingTrackerPage";
import OnboardingTemplatesPage from "./OnboardingTemplatesPage";
import OnboardingReportPage from "./OnboardingReportPage";
import OnboardingOverdueAlertsTab from "./OnboardingOverdueAlertsTab";
import { useLocation } from "wouter";

export default function OnboardingPage() {
  const [location] = useLocation();
  const tab = new URLSearchParams(location.split("?", 2)[1] ?? "").get("tab");
  const defaultTab = tab === "overdue-alerts" ? "overdue-alerts" : "tracker";
  return (
    <div>
      <PageHeader
        title="On/Offboarding"
        subtitle="Manage onboarding and offboarding workflows, templates, and reports"
      />
      <Tabs key={defaultTab} defaultValue={defaultTab} className="space-y-6">
        <TabsList className="flex overflow-x-auto h-auto gap-0 w-full" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          <TabsTrigger value="tracker" className="shrink-0 whitespace-nowrap">Tracker</TabsTrigger>
          <TabsTrigger value="lists" className="shrink-0 whitespace-nowrap">Lists &amp; Templates</TabsTrigger>
          <TabsTrigger value="report" className="shrink-0 whitespace-nowrap">Report</TabsTrigger>
          <TabsTrigger value="overdue-alerts" className="shrink-0 whitespace-nowrap">Overdue Alerts</TabsTrigger>
        </TabsList>
        <TabsContent value="tracker"><OnboardingTrackerPage /></TabsContent>
        <TabsContent value="lists"><OnboardingTemplatesPage /></TabsContent>
        <TabsContent value="report"><OnboardingReportPage /></TabsContent>
        <TabsContent value="overdue-alerts"><OnboardingOverdueAlertsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
