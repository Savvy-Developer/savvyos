import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";
import OnboardingTrackerPage from "./OnboardingTrackerPage";
import OnboardingTemplatesPage from "./OnboardingTemplatesPage";
import OnboardingReportPage from "./OnboardingReportPage";

export default function OnboardingPage() {
  return (
    <div>
      <PageHeader
        title="On/Offboarding"
        subtitle="Manage onboarding and offboarding workflows, templates, and reports"
      />
      <Tabs defaultValue="tracker" className="space-y-6">
        <TabsList>
          <TabsTrigger value="tracker">Tracker</TabsTrigger>
          <TabsTrigger value="lists">Lists &amp; Templates</TabsTrigger>
          <TabsTrigger value="report">Report</TabsTrigger>
        </TabsList>
        <TabsContent value="tracker"><OnboardingTrackerPage /></TabsContent>
        <TabsContent value="lists"><OnboardingTemplatesPage /></TabsContent>
        <TabsContent value="report"><OnboardingReportPage /></TabsContent>
      </Tabs>
    </div>
  );
}
