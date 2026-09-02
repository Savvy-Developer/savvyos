import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Link, useLocation, useSearch } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import PageHeader from "@/components/PageHeader";
import {
  Eye,
  ChevronLeft,
  ChevronRight,
  Flame,
  ExternalLink,
  Loader2,
  CalendarDays,
  Mail,
  MousePointerClick,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CircleOff,
  Heart,
  FileSearch,
  ChevronDown,
  UserRoundPlus,
  MessageSquare,
  X,
} from "lucide-react";

type DaysFilter = "7" | "14" | "30" | "90";
type SortDir = "asc" | "desc";
type HotLeadTextType =
  | "property_views"
  | "return_visitors"
  | "email_engagement"
  | "property_favorites"
  | "analysis_requests"
  | "dead_connections";

// Sort keys for each tab
type PVSortKey =
  | "viewCount"
  | "lastViewed"
  | "contact"
  | "leadSource"
  | "leadScore";
type RVSortKey =
  | "distinctDays"
  | "totalViews"
  | "lastViewed"
  | "contact"
  | "leadSource"
  | "leadScore";
type EESortKey =
  | "clicks"
  | "opens"
  | "lastEngaged"
  | "contact"
  | "leadSource"
  | "leadScore";
type DCSortKey =
  | "deadConnectionCount"
  | "lastUpdatedAt"
  | "contact"
  | "leadSource"
  | "assignedIsa"
  | "leadScore";
type IntentSortKey =
  | "eventCount"
  | "lastEventAt"
  | "contact"
  | "leadSource"
  | "assignedIsa"
  | "leadScore";

const PIPELINE_STATUSES = [
  { value: "new_lead", label: "New Lead" },
  { value: "attempted_contact", label: "Attempted Contact" },
  { value: "nurture", label: "Nurture" },
  { value: "active_client", label: "Active Client" },
  { value: "under_contract", label: "Under Contract" },
  { value: "closed", label: "Closed" },
  { value: "dead", label: "Dead" },
];

const TEMPORARY_REMOVAL_OPTIONS = [
  { value: "1_day", label: "1 day" },
  { value: "7_days", label: "7 days" },
  { value: "14_days", label: "14 days" },
  { value: "30_days", label: "30 days" },
  { value: "90_days", label: "90 days" },
  { value: "6_months", label: "6 months" },
  { value: "1_year", label: "1 year" },
] as const;

type TemporaryRemovalOption =
  (typeof TEMPORARY_REMOVAL_OPTIONS)[number]["value"];
type DeadConnectionsRemovalMode = "permanent" | "temporary";

export default function HotLeadsPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const rawSearch = useSearch();
  const searchParams = useMemo(
    () => new URLSearchParams(rawSearch),
    [rawSearch]
  );
  const initialDeadConnectionsPage = Math.max(
    1,
    parseInt(searchParams.get("page") ?? "1", 10) || 1
  );
  const initialTab =
    searchParams.get("tab") === "dead-connections"
      ? "dead-connections"
      : "property-views";
  const role = (user as any)?.role as string | undefined;
  const isAgent = role === "agent";
  const isAdmin = role === "admin";
  const isAdminOrIsa = isAdmin || role === "isa";

  const [activeTab, setActiveTab] = useState(initialTab);
  const [pvPage, setPvPage] = useState(1);
  const [rvPage, setRvPage] = useState(1);
  const [eePage, setEePage] = useState(1);
  const [dcPage, setDcPage] = useState(initialDeadConnectionsPage);
  const [favoritesPage, setFavoritesPage] = useState(1);
  const [analysisPage, setAnalysisPage] = useState(1);
  const [days, setDays] = useState<DaysFilter>("7");
  const [isaFilter, setIsaFilter] = useState<string>("");
  const [agentFilter, setAgentFilter] = useState<string>("");
  const [leadSourceFilter, setLeadSourceFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [withoutConnectedAgents, setWithoutConnectedAgents] = useState(false);
  const [withoutAssignedIsa, setWithoutAssignedIsa] = useState(false);
  const [withoutContact, setWithoutContact] = useState(false);
  const [statsExpanded, setStatsExpanded] = useState(true);
  const [textLead, setTextLead] = useState<any | null>(null);
  const [textLeadType, setTextLeadType] =
    useState<HotLeadTextType>("property_views");
  const [textBody, setTextBody] = useState("");
  const limit = 50;

  // Sort state for each tab
  const [pvSortKey, setPvSortKey] = useState<PVSortKey>("viewCount");
  const [pvSortDir, setPvSortDir] = useState<SortDir>("desc");
  const [rvSortKey, setRvSortKey] = useState<RVSortKey>("distinctDays");
  const [rvSortDir, setRvSortDir] = useState<SortDir>("desc");
  const [eeSortKey, setEeSortKey] = useState<EESortKey>("clicks");
  const [eeSortDir, setEeSortDir] = useState<SortDir>("desc");
  const [dcSortKey, setDcSortKey] = useState<DCSortKey>("deadConnectionCount");
  const [dcSortDir, setDcSortDir] = useState<SortDir>("desc");
  const [favoritesSortKey, setFavoritesSortKey] =
    useState<IntentSortKey>("eventCount");
  const [favoritesSortDir, setFavoritesSortDir] = useState<SortDir>("desc");
  const [analysisSortKey, setAnalysisSortKey] =
    useState<IntentSortKey>("eventCount");
  const [analysisSortDir, setAnalysisSortDir] = useState<SortDir>("desc");
  const [deadConnectionToRemove, setDeadConnectionToRemove] = useState<
    any | null
  >(null);
  const [deadConnectionsRemovalMode, setDeadConnectionsRemovalMode] =
    useState<DeadConnectionsRemovalMode>("permanent");
  const [temporaryRemovalDuration, setTemporaryRemovalDuration] =
    useState<TemporaryRemovalOption>("7_days");
  const [deadConnectionsRemovalNote, setDeadConnectionsRemovalNote] =
    useState("");
  const [deadConnectionsRemovalError, setDeadConnectionsRemovalError] =
    useState<string | null>(null);
  const [deadConnectionToReconnect, setDeadConnectionToReconnect] = useState<
    any | null
  >(null);
  const [reconnectAgentId, setReconnectAgentId] = useState("");
  const [deadConnectionsReconnectError, setDeadConnectionsReconnectError] =
    useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("tab") === "dead-connections") {
      setActiveTab("dead-connections");
      setDcPage(initialDeadConnectionsPage);
    }
  }, [initialDeadConnectionsPage, searchParams]);

  const setDeadConnectionsPage = (nextPage: number) => {
    const normalizedPage = Math.max(1, nextPage);
    setDcPage(normalizedPage);
    const params = new URLSearchParams(rawSearch);
    params.set("tab", "dead-connections");
    if (normalizedPage === 1) {
      params.delete("page");
    } else {
      params.set("page", String(normalizedPage));
    }
    navigate(`/hot-leads?${params.toString()}`);
  };

  const handleTabChange = (nextTab: string) => {
    setActiveTab(nextTab);
    if (nextTab === "dead-connections") {
      setDeadConnectionsPage(dcPage);
      return;
    }
    if (searchParams.has("tab") || searchParams.has("page")) {
      navigate("/hot-leads");
    }
  };

  const deadConnectionsReturnTo = `/hot-leads?tab=dead-connections${dcPage > 1 ? `&page=${dcPage}` : ""}`;

  // Fetch ISA and agent lists for filter dropdowns (admin/ISA only)
  const { data: usersList = [] } = trpc.users.list.useQuery(undefined, {
    enabled: isAdminOrIsa,
  });
  const permissionsQuery = trpc.permissions.getMyPermissions.useQuery(
    undefined,
    { enabled: isAdmin }
  );
  const canUseMarketingTextInbox =
    isAdmin &&
    Boolean(
      (permissionsQuery.data as Record<string, boolean> | undefined)
        ?.canViewMarketingTextInbox
    );
  const isas = usersList.filter((u: any) => u.role === "isa");
  const agents = usersList.filter((u: any) => u.role === "agent");

  // Build query params
  const baseParams = {
    days,
    limit,
    ...(isAdminOrIsa && isaFilter ? { isaId: parseInt(isaFilter) } : {}),
    ...(isAdminOrIsa && agentFilter ? { agentId: parseInt(agentFilter) } : {}),
    ...(leadSourceFilter ? { leadSourceId: parseInt(leadSourceFilter) } : {}),
    ...(isAgent && statusFilter ? { pipelineStatus: statusFilter } : {}),
    ...(withoutConnectedAgents ? { hasNoConnectedAgents: true } : {}),
    ...(withoutAssignedIsa ? { hasNoAssignedIsa: true } : {}),
    ...(withoutContact ? { hasNoContact: true } : {}),
  };

  const activeHotLeadType: HotLeadTextType =
    activeTab === "property-views"
      ? "property_views"
      : activeTab === "return-visitors"
        ? "return_visitors"
        : activeTab === "email-engagement"
          ? "email_engagement"
          : activeTab === "property-favorites"
            ? "property_favorites"
            : activeTab === "analysis-requests"
              ? "analysis_requests"
              : "dead_connections";

  // Queries for each tab
  const propertyViews = trpc.hotLeads.propertyViews.useQuery(
    {
      ...baseParams,
      page: pvPage,
      sortBy: pvSortKey,
      sortDirection: pvSortDir,
    },
    { enabled: activeTab === "property-views" }
  );
  const returnVisitors = trpc.hotLeads.returnVisitors.useQuery(
    {
      ...baseParams,
      page: rvPage,
      sortBy: rvSortKey,
      sortDirection: rvSortDir,
    },
    { enabled: activeTab === "return-visitors" }
  );
  const emailEngagement = trpc.hotLeads.emailEngagement.useQuery(
    {
      ...baseParams,
      page: eePage,
      sortBy: eeSortKey,
      sortDirection: eeSortDir,
    },
    { enabled: activeTab === "email-engagement" }
  );
  const propertyFavorites = trpc.hotLeads.propertyFavorites.useQuery(
    {
      ...baseParams,
      page: favoritesPage,
      sortBy: favoritesSortKey,
      sortDirection: favoritesSortDir,
    },
    { enabled: activeTab === "property-favorites" }
  );
  const analysisRequests = trpc.hotLeads.analysisRequests.useQuery(
    {
      ...baseParams,
      page: analysisPage,
      sortBy: analysisSortKey,
      sortDirection: analysisSortDir,
    },
    { enabled: activeTab === "analysis-requests" }
  );
  const deadConnections = trpc.hotLeads.deadConnections.useQuery(
    {
      limit,
      page: dcPage,
      sortBy: dcSortKey,
      sortDirection: dcSortDir,
      ...(isAdminOrIsa && isaFilter ? { isaId: parseInt(isaFilter) } : {}),
      ...(isAdminOrIsa && agentFilter
        ? { agentId: parseInt(agentFilter) }
        : {}),
      ...(leadSourceFilter ? { leadSourceId: parseInt(leadSourceFilter) } : {}),
      ...(withoutConnectedAgents ? { hasNoConnectedAgents: true } : {}),
      ...(withoutAssignedIsa ? { hasNoAssignedIsa: true } : {}),
      ...(withoutContact ? { hasNoContact: true } : {}),
    },
    { enabled: isAdminOrIsa && activeTab === "dead-connections" }
  );
  const deadConnectionsActivities =
    trpc.hotLeads.deadConnectionsActivities.useQuery(
      { limit: 50 },
      { enabled: isAdmin && activeTab === "dead-connections" }
    );
  const trpcUtils = trpc.useUtils();
  const hotLeadStats = trpc.hotLeads.stats.useQuery({
    tab: activeHotLeadType,
    days,
    ...(isAdminOrIsa && isaFilter ? { isaId: parseInt(isaFilter) } : {}),
    ...(isAdminOrIsa && agentFilter ? { agentId: parseInt(agentFilter) } : {}),
    ...(leadSourceFilter ? { leadSourceId: parseInt(leadSourceFilter) } : {}),
    ...(isAgent && statusFilter ? { pipelineStatus: statusFilter } : {}),
    ...(withoutConnectedAgents ? { hasNoConnectedAgents: true } : {}),
    ...(withoutAssignedIsa ? { hasNoAssignedIsa: true } : {}),
    ...(withoutContact ? { hasNoContact: true } : {}),
  });
  const draftText = trpc.hotLeads.draftText.useMutation({
    onSuccess: result => setTextBody(result.body),
    onError: error => toast.error(error.message),
  });
  const sendText = trpc.hotLeads.sendText.useMutation({
    onSuccess: async () => {
      toast.success(
        "Hot Leads text sent through the Marketing Text Inbox line."
      );
      setTextLead(null);
      setTextBody("");
      await Promise.all([
        trpcUtils.hotLeads.propertyViews.invalidate(),
        trpcUtils.hotLeads.returnVisitors.invalidate(),
        trpcUtils.hotLeads.emailEngagement.invalidate(),
        trpcUtils.hotLeads.propertyFavorites.invalidate(),
        trpcUtils.hotLeads.analysisRequests.invalidate(),
        trpcUtils.hotLeads.deadConnections.invalidate(),
        trpcUtils.hotLeads.stats.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });
  const removeDeadConnection = trpc.hotLeads.removeDeadConnection.useMutation({
    onSuccess: async () => {
      await Promise.all([
        trpcUtils.hotLeads.deadConnections.invalidate(),
        trpcUtils.hotLeads.deadConnectionsActivities.invalidate(),
      ]);
      closeDeadConnectionsRemovalDialog();
    },
    onError: error => {
      setDeadConnectionsRemovalError(
        error.message ||
          "We couldn't take this contact off the list. Please try again."
      );
    },
  });
  const reconnectDeadConnection =
    trpc.hotLeads.reconnectDeadConnection.useMutation({
      onSuccess: async () => {
        await Promise.all([
          trpcUtils.hotLeads.deadConnections.invalidate(),
          trpcUtils.hotLeads.deadConnectionsActivities.invalidate(),
        ]);
        closeDeadConnectionsReconnectDialog();
      },
      onError: error => {
        setDeadConnectionsReconnectError(
          error.message ||
            "We couldn't reconnect this contact. Please try again."
        );
      },
    });

  // Client-side sorting for Property Views
  const sortedPvItems = useMemo(() => {
    const items = propertyViews.data?.items ?? [];
    if (!items.length) return items;
    const sorted = [...items];
    sorted.sort((a: any, b: any) => {
      let aVal: any, bVal: any;
      switch (pvSortKey) {
        case "viewCount":
          aVal = a.viewCount ?? 0;
          bVal = b.viewCount ?? 0;
          break;
        case "lastViewed":
          aVal = a.lastViewed ? new Date(a.lastViewed).getTime() : 0;
          bVal = b.lastViewed ? new Date(b.lastViewed).getTime() : 0;
          break;
        case "contact":
          aVal = `${a.firstName ?? ""} ${a.lastName ?? ""}`
            .trim()
            .toLowerCase();
          bVal = `${b.firstName ?? ""} ${b.lastName ?? ""}`
            .trim()
            .toLowerCase();
          break;
        case "leadSource":
          aVal = (a.leadSource ?? "").toLowerCase();
          bVal = (b.leadSource ?? "").toLowerCase();
          break;
        case "leadScore":
          aVal = a.leadScore ?? 0;
          bVal = b.leadScore ?? 0;
          break;
        default:
          aVal = a.viewCount ?? 0;
          bVal = b.viewCount ?? 0;
      }
      if (typeof aVal === "string") {
        const cmp = aVal.localeCompare(bVal);
        return pvSortDir === "asc" ? cmp : -cmp;
      }
      return pvSortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [propertyViews.data?.items, pvSortKey, pvSortDir]);

  // Client-side sorting for Return Visitors
  const sortedRvItems = useMemo(() => {
    const items = returnVisitors.data?.items ?? [];
    if (!items.length) return items;
    const sorted = [...items];
    sorted.sort((a: any, b: any) => {
      let aVal: any, bVal: any;
      switch (rvSortKey) {
        case "distinctDays":
          aVal = a.distinctDays ?? 0;
          bVal = b.distinctDays ?? 0;
          break;
        case "totalViews":
          aVal = a.totalViews ?? 0;
          bVal = b.totalViews ?? 0;
          break;
        case "lastViewed":
          aVal = a.lastViewed ? new Date(a.lastViewed).getTime() : 0;
          bVal = b.lastViewed ? new Date(b.lastViewed).getTime() : 0;
          break;
        case "contact":
          aVal = `${a.firstName ?? ""} ${a.lastName ?? ""}`
            .trim()
            .toLowerCase();
          bVal = `${b.firstName ?? ""} ${b.lastName ?? ""}`
            .trim()
            .toLowerCase();
          break;
        case "leadSource":
          aVal = (a.leadSource ?? "").toLowerCase();
          bVal = (b.leadSource ?? "").toLowerCase();
          break;
        case "leadScore":
          aVal = a.leadScore ?? 0;
          bVal = b.leadScore ?? 0;
          break;
        default:
          aVal = a.distinctDays ?? 0;
          bVal = b.distinctDays ?? 0;
      }
      if (typeof aVal === "string") {
        const cmp = aVal.localeCompare(bVal);
        return rvSortDir === "asc" ? cmp : -cmp;
      }
      return rvSortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [returnVisitors.data?.items, rvSortKey, rvSortDir]);

  // Client-side sorting for Email Engagement
  const sortedEeItems = useMemo(() => {
    const items = emailEngagement.data?.items ?? [];
    if (!items.length) return items;
    const sorted = [...items];
    sorted.sort((a: any, b: any) => {
      let aVal: any, bVal: any;
      switch (eeSortKey) {
        case "clicks":
          aVal = a.clicks ?? 0;
          bVal = b.clicks ?? 0;
          break;
        case "opens":
          aVal = a.opens ?? 0;
          bVal = b.opens ?? 0;
          break;
        case "lastEngaged":
          aVal = a.lastEngaged ? new Date(a.lastEngaged).getTime() : 0;
          bVal = b.lastEngaged ? new Date(b.lastEngaged).getTime() : 0;
          break;
        case "contact":
          aVal = `${a.firstName ?? ""} ${a.lastName ?? ""}`
            .trim()
            .toLowerCase();
          bVal = `${b.firstName ?? ""} ${b.lastName ?? ""}`
            .trim()
            .toLowerCase();
          break;
        case "leadSource":
          aVal = (a.leadSource ?? "").toLowerCase();
          bVal = (b.leadSource ?? "").toLowerCase();
          break;
        case "leadScore":
          aVal = a.leadScore ?? 0;
          bVal = b.leadScore ?? 0;
          break;
        default:
          aVal = a.clicks ?? 0;
          bVal = b.clicks ?? 0;
      }
      if (typeof aVal === "string") {
        const cmp = aVal.localeCompare(bVal);
        return eeSortDir === "asc" ? cmp : -cmp;
      }
      return eeSortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [emailEngagement.data?.items, eeSortKey, eeSortDir]);

  // Client-side sorting for Dead Connections
  const sortedDcItems = useMemo(() => {
    const items = deadConnections.data?.items ?? [];
    if (!items.length) return items;
    const sorted = [...items];
    sorted.sort((a: any, b: any) => {
      let aVal: any, bVal: any;
      switch (dcSortKey) {
        case "deadConnectionCount":
          aVal = a.deadConnectionCount ?? 0;
          bVal = b.deadConnectionCount ?? 0;
          break;
        case "lastUpdatedAt":
          aVal = a.lastUpdatedAt ? new Date(a.lastUpdatedAt).getTime() : 0;
          bVal = b.lastUpdatedAt ? new Date(b.lastUpdatedAt).getTime() : 0;
          break;
        case "contact":
          aVal = `${a.firstName ?? ""} ${a.lastName ?? ""}`
            .trim()
            .toLowerCase();
          bVal = `${b.firstName ?? ""} ${b.lastName ?? ""}`
            .trim()
            .toLowerCase();
          break;
        case "leadSource":
          aVal = (a.leadSource ?? "").toLowerCase();
          bVal = (b.leadSource ?? "").toLowerCase();
          break;
        case "assignedIsa":
          aVal = (a.assignedIsa ?? "").toLowerCase();
          bVal = (b.assignedIsa ?? "").toLowerCase();
          break;
        case "leadScore":
          aVal = a.leadScore ?? 0;
          bVal = b.leadScore ?? 0;
          break;
        default:
          aVal = a.lastUpdatedAt ? new Date(a.lastUpdatedAt).getTime() : 0;
          bVal = b.lastUpdatedAt ? new Date(b.lastUpdatedAt).getTime() : 0;
      }
      if (typeof aVal === "string") {
        const cmp = aVal.localeCompare(bVal);
        return dcSortDir === "asc" ? cmp : -cmp;
      }
      return dcSortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [deadConnections.data?.items, dcSortKey, dcSortDir]);

  // Sort handlers
  const handlePvSort = (key: PVSortKey) => {
    setPvPage(1);
    if (pvSortKey === key) {
      setPvSortDir(pvSortDir === "asc" ? "desc" : "asc");
    } else {
      setPvSortKey(key);
      setPvSortDir("desc");
    }
  };

  const handleRvSort = (key: RVSortKey) => {
    setRvPage(1);
    if (rvSortKey === key) {
      setRvSortDir(rvSortDir === "asc" ? "desc" : "asc");
    } else {
      setRvSortKey(key);
      setRvSortDir("desc");
    }
  };

  const handleEeSort = (key: EESortKey) => {
    setEePage(1);
    if (eeSortKey === key) {
      setEeSortDir(eeSortDir === "asc" ? "desc" : "asc");
    } else {
      setEeSortKey(key);
      setEeSortDir("desc");
    }
  };

  const handleDcSort = (key: DCSortKey) => {
    setDcPage(1);
    if (dcSortKey === key) {
      setDcSortDir(dcSortDir === "asc" ? "desc" : "asc");
    } else {
      setDcSortKey(key);
      setDcSortDir("desc");
    }
  };

  const handleFavoritesSort = (key: IntentSortKey) => {
    setFavoritesPage(1);
    if (favoritesSortKey === key) {
      setFavoritesSortDir(favoritesSortDir === "asc" ? "desc" : "asc");
    } else {
      setFavoritesSortKey(key);
      setFavoritesSortDir("desc");
    }
  };

  const handleAnalysisSort = (key: IntentSortKey) => {
    setAnalysisPage(1);
    if (analysisSortKey === key) {
      setAnalysisSortDir(analysisSortDir === "asc" ? "desc" : "asc");
    } else {
      setAnalysisSortKey(key);
      setAnalysisSortDir("desc");
    }
  };

  const openDeadConnectionsRemovalDialog = (lead: any) => {
    setDeadConnectionToRemove(lead);
    setDeadConnectionsRemovalMode("permanent");
    setTemporaryRemovalDuration("7_days");
    setDeadConnectionsRemovalNote("");
    setDeadConnectionsRemovalError(null);
  };

  const closeDeadConnectionsRemovalDialog = () => {
    if (removeDeadConnection.isPending) return;
    setDeadConnectionToRemove(null);
    setDeadConnectionsRemovalNote("");
    setDeadConnectionsRemovalError(null);
  };

  const submitDeadConnectionsRemoval = () => {
    if (!deadConnectionToRemove) return;
    if (!deadConnectionsRemovalNote.trim()) {
      setDeadConnectionsRemovalError(
        "Add a note before taking this contact off the list."
      );
      return;
    }
    setDeadConnectionsRemovalError(null);
    removeDeadConnection.mutate({
      contactId: deadConnectionToRemove.contactId,
      note: deadConnectionsRemovalNote.trim(),
      mode: deadConnectionsRemovalMode,
      ...(deadConnectionsRemovalMode === "temporary"
        ? { temporaryDuration: temporaryRemovalDuration }
        : {}),
    });
  };

  const openDeadConnectionsReconnectDialog = (lead: any) => {
    setDeadConnectionToReconnect(lead);
    setReconnectAgentId("");
    setDeadConnectionsReconnectError(null);
  };

  const closeDeadConnectionsReconnectDialog = () => {
    if (reconnectDeadConnection.isPending) return;
    setDeadConnectionToReconnect(null);
    setReconnectAgentId("");
    setDeadConnectionsReconnectError(null);
  };

  const submitDeadConnectionsReconnect = () => {
    if (!deadConnectionToReconnect || !reconnectAgentId) return;
    setDeadConnectionsReconnectError(null);
    reconnectDeadConnection.mutate({
      contactId: deadConnectionToReconnect.contactId,
      agentId: Number(reconnectAgentId),
    });
  };

  const openTextDialog = (lead: any, hotLeadType: HotLeadTextType) => {
    if (!lead.canText) return;
    setTextLead(lead);
    setTextLeadType(hotLeadType);
    setTextBody("");
    draftText.mutate({ contactId: lead.contactId, hotLeadType });
  };

  const handleDaysChange = (newDays: DaysFilter) => {
    setDays(newDays);
    resetPages();
  };

  const resetPages = () => {
    setPvPage(1);
    setRvPage(1);
    setEePage(1);
    setDcPage(1);
    setFavoritesPage(1);
    setAnalysisPage(1);
  };

  const handleIsaChange = (val: string) => {
    setIsaFilter(val === "all" ? "" : val);
    resetPages();
  };

  const handleAgentChange = (val: string) => {
    setAgentFilter(val === "all" ? "" : val);
    resetPages();
  };

  const handleLeadSourceChange = (val: string) => {
    setLeadSourceFilter(val === "all" ? "" : val);
    resetPages();
  };

  const handleStatusChange = (val: string) => {
    setStatusFilter(val === "all" ? "" : val);
    resetPages();
  };

  // Sort icon component
  const SortIcon = ({
    col,
    activeKey,
    activeDir,
  }: {
    col: string;
    activeKey: string;
    activeDir: SortDir;
  }) => {
    if (activeKey !== col)
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />;
    return activeDir === "asc" ? (
      <ArrowUp className="h-3 w-3 ml-1 text-primary" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1 text-primary" />
    );
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
      <PageHeader
        title="Hot Leads"
        subtitle="Contacts showing high engagement signals — prioritize outreach to these leads"
      />

      <HotLeadStatsPanel
        stats={hotLeadStats.data}
        isLoading={hotLeadStats.isLoading}
        expanded={statsExpanded}
        onExpandedChange={setStatsExpanded}
      />

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="w-full"
      >
        <TabsList
          className="mb-4 flex overflow-x-auto h-auto gap-0 w-full"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <TabsTrigger
            value="property-views"
            className="shrink-0 whitespace-nowrap gap-2"
          >
            <Eye className="h-4 w-4" />
            Property Views
          </TabsTrigger>
          <TabsTrigger
            value="return-visitors"
            className="shrink-0 whitespace-nowrap gap-2"
          >
            <CalendarDays className="h-4 w-4" />
            Return Visitors
          </TabsTrigger>
          <TabsTrigger
            value="email-engagement"
            className="shrink-0 whitespace-nowrap gap-2"
          >
            <Mail className="h-4 w-4" />
            Email Engagement
          </TabsTrigger>
          <TabsTrigger
            value="property-favorites"
            className="shrink-0 whitespace-nowrap gap-2"
          >
            <Heart className="h-4 w-4" />
            Properties Favorited
          </TabsTrigger>
          <TabsTrigger
            value="analysis-requests"
            className="shrink-0 whitespace-nowrap gap-2"
          >
            <FileSearch className="h-4 w-4" />
            Analysis Requested
          </TabsTrigger>
          {isAdminOrIsa && (
            <TabsTrigger
              value="dead-connections"
              className="shrink-0 whitespace-nowrap gap-2"
            >
              <CircleOff className="h-4 w-4" />
              Dead Connections
            </TabsTrigger>
          )}
        </TabsList>

        {/* ─── Property Views Tab ─────────────────────────────────────────── */}
        <TabsContent value="property-views">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <FiltersBar
                days={days}
                onDaysChange={handleDaysChange}
                isAdminOrIsa={isAdminOrIsa}
                isAgent={isAgent}
                isas={isas}
                agents={agents}
                isaFilter={isaFilter}
                agentFilter={agentFilter}
                leadSourceFilter={leadSourceFilter}
                statusFilter={statusFilter}
                onIsaChange={handleIsaChange}
                onAgentChange={handleAgentChange}
                onLeadSourceChange={handleLeadSourceChange}
                onStatusChange={handleStatusChange}
                withoutConnectedAgents={withoutConnectedAgents}
                withoutAssignedIsa={withoutAssignedIsa}
                withoutContact={withoutContact}
                onWithoutConnectedAgentsChange={value => {
                  setWithoutConnectedAgents(value);
                  resetPages();
                }}
                onWithoutAssignedIsaChange={value => {
                  setWithoutAssignedIsa(value);
                  resetPages();
                }}
                onWithoutContactChange={value => {
                  setWithoutContact(value);
                  resetPages();
                }}
              />
              <DataTable
                isLoading={propertyViews.isLoading}
                emptyIcon={<Eye className="h-10 w-10 mb-3 opacity-40" />}
                emptyMessage={`No property views in the last ${days} days`}
                totalCount={propertyViews.data?.totalCount ?? 0}
                summaryText={`viewed properties in the last ${days} days`}
                page={pvPage}
                totalPages={propertyViews.data?.totalPages ?? 1}
                onPageChange={setPvPage}
                limit={limit}
                compact
                headers={
                  <>
                    <TableHead className="w-[50px] text-center">#</TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handlePvSort("contact")}
                    >
                      <span className="inline-flex items-center">
                        Contact{" "}
                        <SortIcon
                          col="contact"
                          activeKey={pvSortKey}
                          activeDir={pvSortDir}
                        />
                      </span>
                    </TableHead>
                    <TableHead className="text-center">Text</TableHead>
                    <TableHead
                      className="text-center cursor-pointer select-none"
                      onClick={() => handlePvSort("viewCount")}
                    >
                      <span className="inline-flex items-center justify-center w-full">
                        Views{" "}
                        <SortIcon
                          col="viewCount"
                          activeKey={pvSortKey}
                          activeDir={pvSortDir}
                        />
                      </span>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handlePvSort("lastViewed")}
                    >
                      <span className="inline-flex items-center">
                        Last Viewed{" "}
                        <SortIcon
                          col="lastViewed"
                          activeKey={pvSortKey}
                          activeDir={pvSortDir}
                        />
                      </span>
                    </TableHead>
                    <TableHead>Last Contact</TableHead>
                    <TableHead>Last Contacted By</TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handlePvSort("leadScore")}
                    >
                      <span className="inline-flex items-center">
                        Lead Score{" "}
                        <SortIcon
                          col="leadScore"
                          activeKey={pvSortKey}
                          activeDir={pvSortDir}
                        />
                      </span>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handlePvSort("leadSource")}
                    >
                      <span className="inline-flex items-center">
                        Lead Source{" "}
                        <SortIcon
                          col="leadSource"
                          activeKey={pvSortKey}
                          activeDir={pvSortDir}
                        />
                      </span>
                    </TableHead>
                    {!isAgent && <TableHead>Assigned ISA</TableHead>}
                    {!isAgent && <TableHead>Connected Agents</TableHead>}
                  </>
                }
                rows={sortedPvItems.map((lead, idx) => (
                  <TableRow key={lead.contactId} className="hover:bg-muted/50">
                    <TableCell className="text-center text-muted-foreground text-xs">
                      {(pvPage - 1) * limit + idx + 1}
                    </TableCell>
                    <TableCell>
                      <ContactCell lead={lead} isAgent={isAgent} />
                    </TableCell>
                    <HotLeadTextCell
                      lead={lead}
                      hotLeadType="property_views"
                      onText={openTextDialog}
                      enabled={canUseMarketingTextInbox}
                    />
                    <TableCell className="text-center">
                      <ViewCountBadge count={lead.viewCount} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatRelativeDate(lead.lastViewed)}
                    </TableCell>
                    <LastContactCells lead={lead} />
                    <TableCell>
                      <LeadScoreBadge
                        score={lead.leadScore}
                        signals={lead.leadScoreSignals}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lead.leadSource || "—"}
                    </TableCell>
                    {!isAgent && (
                      <TableCell className="text-sm text-muted-foreground">
                        {lead.assignedIsa || "—"}
                      </TableCell>
                    )}
                    {!isAgent && (
                      <TableCell className="text-sm text-muted-foreground">
                        <AgentsList agents={lead.connectedAgents} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Return Visitors Tab ────────────────────────────────────────── */}
        <TabsContent value="return-visitors">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <FiltersBar
                days={days}
                onDaysChange={handleDaysChange}
                isAdminOrIsa={isAdminOrIsa}
                isAgent={isAgent}
                isas={isas}
                agents={agents}
                isaFilter={isaFilter}
                agentFilter={agentFilter}
                leadSourceFilter={leadSourceFilter}
                statusFilter={statusFilter}
                onIsaChange={handleIsaChange}
                onAgentChange={handleAgentChange}
                onLeadSourceChange={handleLeadSourceChange}
                onStatusChange={handleStatusChange}
                withoutConnectedAgents={withoutConnectedAgents}
                withoutAssignedIsa={withoutAssignedIsa}
                withoutContact={withoutContact}
                onWithoutConnectedAgentsChange={value => {
                  setWithoutConnectedAgents(value);
                  resetPages();
                }}
                onWithoutAssignedIsaChange={value => {
                  setWithoutAssignedIsa(value);
                  resetPages();
                }}
                onWithoutContactChange={value => {
                  setWithoutContact(value);
                  resetPages();
                }}
              />
              <DataTable
                isLoading={returnVisitors.isLoading}
                emptyIcon={
                  <CalendarDays className="h-10 w-10 mb-3 opacity-40" />
                }
                emptyMessage={`No return visitors in the last ${days} days`}
                totalCount={returnVisitors.data?.totalCount ?? 0}
                summaryText={`came back on multiple days in the last ${days} days`}
                page={rvPage}
                totalPages={returnVisitors.data?.totalPages ?? 1}
                onPageChange={setRvPage}
                limit={limit}
                headers={
                  <>
                    <TableHead className="w-[50px] text-center">#</TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleRvSort("contact")}
                    >
                      <span className="inline-flex items-center">
                        Contact{" "}
                        <SortIcon
                          col="contact"
                          activeKey={rvSortKey}
                          activeDir={rvSortDir}
                        />
                      </span>
                    </TableHead>
                    <TableHead className="text-center">Text</TableHead>
                    <TableHead
                      className="text-center cursor-pointer select-none"
                      onClick={() => handleRvSort("distinctDays")}
                    >
                      <span className="inline-flex items-center justify-center w-full">
                        Days Active{" "}
                        <SortIcon
                          col="distinctDays"
                          activeKey={rvSortKey}
                          activeDir={rvSortDir}
                        />
                      </span>
                    </TableHead>
                    <TableHead
                      className="text-center cursor-pointer select-none"
                      onClick={() => handleRvSort("totalViews")}
                    >
                      <span className="inline-flex items-center justify-center w-full">
                        Total Views{" "}
                        <SortIcon
                          col="totalViews"
                          activeKey={rvSortKey}
                          activeDir={rvSortDir}
                        />
                      </span>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleRvSort("lastViewed")}
                    >
                      <span className="inline-flex items-center">
                        Last Viewed{" "}
                        <SortIcon
                          col="lastViewed"
                          activeKey={rvSortKey}
                          activeDir={rvSortDir}
                        />
                      </span>
                    </TableHead>
                    <TableHead>Last Contact</TableHead>
                    <TableHead>Last Contacted By</TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleRvSort("leadScore")}
                    >
                      <span className="inline-flex items-center">
                        Lead Score{" "}
                        <SortIcon
                          col="leadScore"
                          activeKey={rvSortKey}
                          activeDir={rvSortDir}
                        />
                      </span>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleRvSort("leadSource")}
                    >
                      <span className="inline-flex items-center">
                        Lead Source{" "}
                        <SortIcon
                          col="leadSource"
                          activeKey={rvSortKey}
                          activeDir={rvSortDir}
                        />
                      </span>
                    </TableHead>
                    {!isAgent && <TableHead>Assigned ISA</TableHead>}
                    {!isAgent && <TableHead>Connected Agents</TableHead>}
                  </>
                }
                rows={sortedRvItems.map((lead, idx) => (
                  <TableRow key={lead.contactId} className="hover:bg-muted/50">
                    <TableCell className="text-center text-muted-foreground text-xs">
                      {(rvPage - 1) * limit + idx + 1}
                    </TableCell>
                    <TableCell>
                      <ContactCell lead={lead} isAgent={isAgent} />
                    </TableCell>
                    <HotLeadTextCell
                      lead={lead}
                      hotLeadType="return_visitors"
                      onText={openTextDialog}
                      enabled={canUseMarketingTextInbox}
                    />
                    <TableCell className="text-center">
                      <DaysBadge count={lead.distinctDays} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{lead.totalViews}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatRelativeDate(lead.lastViewed)}
                    </TableCell>
                    <LastContactCells lead={lead} />
                    <TableCell>
                      <LeadScoreBadge
                        score={lead.leadScore}
                        signals={lead.leadScoreSignals}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lead.leadSource || "—"}
                    </TableCell>
                    {!isAgent && (
                      <TableCell className="text-sm text-muted-foreground">
                        {lead.assignedIsa || "—"}
                      </TableCell>
                    )}
                    {!isAgent && (
                      <TableCell className="text-sm text-muted-foreground">
                        <AgentsList agents={lead.connectedAgents} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Email Engagement Tab ───────────────────────────────────────── */}
        <TabsContent value="email-engagement">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <FiltersBar
                days={days}
                onDaysChange={handleDaysChange}
                isAdminOrIsa={isAdminOrIsa}
                isAgent={isAgent}
                isas={isas}
                agents={agents}
                isaFilter={isaFilter}
                agentFilter={agentFilter}
                leadSourceFilter={leadSourceFilter}
                statusFilter={statusFilter}
                onIsaChange={handleIsaChange}
                onAgentChange={handleAgentChange}
                onLeadSourceChange={handleLeadSourceChange}
                onStatusChange={handleStatusChange}
                withoutConnectedAgents={withoutConnectedAgents}
                withoutAssignedIsa={withoutAssignedIsa}
                withoutContact={withoutContact}
                onWithoutConnectedAgentsChange={value => {
                  setWithoutConnectedAgents(value);
                  resetPages();
                }}
                onWithoutAssignedIsaChange={value => {
                  setWithoutAssignedIsa(value);
                  resetPages();
                }}
                onWithoutContactChange={value => {
                  setWithoutContact(value);
                  resetPages();
                }}
              />
              <DataTable
                isLoading={emailEngagement.isLoading}
                emptyIcon={<Mail className="h-10 w-10 mb-3 opacity-40" />}
                emptyMessage={`No email engagement in the last ${days} days`}
                totalCount={emailEngagement.data?.totalCount ?? 0}
                summaryText={`engaged with emails in the last ${days} days`}
                page={eePage}
                totalPages={emailEngagement.data?.totalPages ?? 1}
                onPageChange={setEePage}
                limit={limit}
                compact
                headers={
                  <>
                    <TableHead className="w-[50px] text-center">#</TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleEeSort("contact")}
                    >
                      <span className="inline-flex items-center">
                        Contact{" "}
                        <SortIcon
                          col="contact"
                          activeKey={eeSortKey}
                          activeDir={eeSortDir}
                        />
                      </span>
                    </TableHead>
                    <TableHead className="text-center">Text</TableHead>
                    <TableHead
                      className="text-center cursor-pointer select-none"
                      onClick={() => handleEeSort("clicks")}
                    >
                      <span className="inline-flex items-center justify-center w-full">
                        Clicks{" "}
                        <SortIcon
                          col="clicks"
                          activeKey={eeSortKey}
                          activeDir={eeSortDir}
                        />
                      </span>
                    </TableHead>
                    <TableHead
                      className="text-center cursor-pointer select-none"
                      onClick={() => handleEeSort("opens")}
                    >
                      <span className="inline-flex items-center justify-center w-full">
                        Opens{" "}
                        <SortIcon
                          col="opens"
                          activeKey={eeSortKey}
                          activeDir={eeSortDir}
                        />
                      </span>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleEeSort("lastEngaged")}
                    >
                      <span className="inline-flex items-center">
                        Last Engaged{" "}
                        <SortIcon
                          col="lastEngaged"
                          activeKey={eeSortKey}
                          activeDir={eeSortDir}
                        />
                      </span>
                    </TableHead>
                    <TableHead>Last Contact</TableHead>
                    <TableHead>Last Contacted By</TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleEeSort("leadScore")}
                    >
                      <span className="inline-flex items-center">
                        Lead Score{" "}
                        <SortIcon
                          col="leadScore"
                          activeKey={eeSortKey}
                          activeDir={eeSortDir}
                        />
                      </span>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleEeSort("leadSource")}
                    >
                      <span className="inline-flex items-center">
                        Lead Source{" "}
                        <SortIcon
                          col="leadSource"
                          activeKey={eeSortKey}
                          activeDir={eeSortDir}
                        />
                      </span>
                    </TableHead>
                    {!isAgent && <TableHead>Assigned ISA</TableHead>}
                    {!isAgent && <TableHead>Connected Agents</TableHead>}
                  </>
                }
                rows={sortedEeItems.map((lead, idx) => (
                  <TableRow key={lead.contactId} className="hover:bg-muted/50">
                    <TableCell className="text-center text-muted-foreground text-xs">
                      {(eePage - 1) * limit + idx + 1}
                    </TableCell>
                    <TableCell>
                      <ContactCell lead={lead} isAgent={isAgent} />
                    </TableCell>
                    <HotLeadTextCell
                      lead={lead}
                      hotLeadType="email_engagement"
                      onText={openTextDialog}
                      enabled={canUseMarketingTextInbox}
                    />
                    <TableCell className="text-center">
                      <ClicksBadge count={lead.clicks} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{lead.opens}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatRelativeDate(lead.lastEngaged)}
                    </TableCell>
                    <LastContactCells lead={lead} />
                    <TableCell>
                      <LeadScoreBadge
                        score={lead.leadScore}
                        signals={lead.leadScoreSignals}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lead.leadSource || "—"}
                    </TableCell>
                    {!isAgent && (
                      <TableCell className="text-sm text-muted-foreground">
                        {lead.assignedIsa || "—"}
                      </TableCell>
                    )}
                    {!isAgent && (
                      <TableCell className="text-sm text-muted-foreground">
                        <AgentsList agents={lead.connectedAgents} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <IntentLeadsTab
          value="property-favorites"
          eventLabel="Properties Favorited"
          eventDescription="Contacts in this list sent a deliberate property-favorite signal from the website. Use the Lead Score and recent activity to prioritize timely follow-up."
          Icon={Heart}
          query={propertyFavorites}
          page={favoritesPage}
          onPageChange={setFavoritesPage}
          limit={limit}
          days={days}
          isAdminOrIsa={isAdminOrIsa}
          isAgent={isAgent}
          isas={isas}
          agents={agents}
          isaFilter={isaFilter}
          agentFilter={agentFilter}
          leadSourceFilter={leadSourceFilter}
          statusFilter={statusFilter}
          onDaysChange={handleDaysChange}
          onIsaChange={handleIsaChange}
          onAgentChange={handleAgentChange}
          onLeadSourceChange={handleLeadSourceChange}
          onStatusChange={handleStatusChange}
          withoutConnectedAgents={withoutConnectedAgents}
          withoutAssignedIsa={withoutAssignedIsa}
          withoutContact={withoutContact}
          onWithoutConnectedAgentsChange={value => {
            setWithoutConnectedAgents(value);
            resetPages();
          }}
          onWithoutAssignedIsaChange={value => {
            setWithoutAssignedIsa(value);
            resetPages();
          }}
          onWithoutContactChange={value => {
            setWithoutContact(value);
            resetPages();
          }}
          sortKey={favoritesSortKey}
          sortDir={favoritesSortDir}
          onSort={handleFavoritesSort}
          onText={openTextDialog}
          canUseText={canUseMarketingTextInbox}
          showText
        />

        <IntentLeadsTab
          value="analysis-requests"
          eventLabel="Analysis Requests"
          eventDescription="Contacts in this list asked for a property analysis through the website. These are high-intent prospects and should receive prompt outreach."
          Icon={FileSearch}
          query={analysisRequests}
          page={analysisPage}
          onPageChange={setAnalysisPage}
          limit={limit}
          days={days}
          isAdminOrIsa={isAdminOrIsa}
          isAgent={isAgent}
          isas={isas}
          agents={agents}
          isaFilter={isaFilter}
          agentFilter={agentFilter}
          leadSourceFilter={leadSourceFilter}
          statusFilter={statusFilter}
          onDaysChange={handleDaysChange}
          onIsaChange={handleIsaChange}
          onAgentChange={handleAgentChange}
          onLeadSourceChange={handleLeadSourceChange}
          onStatusChange={handleStatusChange}
          withoutConnectedAgents={withoutConnectedAgents}
          withoutAssignedIsa={withoutAssignedIsa}
          withoutContact={withoutContact}
          onWithoutConnectedAgentsChange={value => {
            setWithoutConnectedAgents(value);
            resetPages();
          }}
          onWithoutAssignedIsaChange={value => {
            setWithoutAssignedIsa(value);
            resetPages();
          }}
          onWithoutContactChange={value => {
            setWithoutContact(value);
            resetPages();
          }}
          sortKey={analysisSortKey}
          sortDir={analysisSortDir}
          onSort={handleAnalysisSort}
          onText={openTextDialog}
          canUseText={canUseMarketingTextInbox}
          showText={false}
        />

        {/* ─── Dead Connections Tab (Admin / ISA only) ────────────────────── */}
        {isAdminOrIsa && (
          <TabsContent value="dead-connections">
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <div className="px-4 pt-4 text-sm text-muted-foreground">
                  Contacts appear here only when they have at least one agent
                  connection and every current connection is marked Dead. Use
                  this list to revisit prospects for a potential connection in
                  another market.
                </div>
                {isAdmin && (
                  <div className="px-4 pt-4">
                    <Collapsible className="rounded-lg border bg-muted/30">
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <span>
                            <span className="flex items-center gap-2 text-sm font-semibold">
                              ISA Activities
                              <Badge
                                variant="secondary"
                                className="font-normal"
                              >
                                Admin only
                              </Badge>
                            </span>
                            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                              Recent actions ISAs took from Dead Connections,
                              including removals and new agent connections.
                            </span>
                          </span>
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="border-t">
                        <div className="max-h-96 overflow-y-auto divide-y">
                          {deadConnectionsActivities.isLoading ? (
                            <div className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />{" "}
                              Loading ISA activity...
                            </div>
                          ) : (deadConnectionsActivities.data ?? []).length ===
                            0 ? (
                            <p className="px-4 py-5 text-sm text-muted-foreground">
                              No ISA Dead Connections activity has been recorded
                              yet.
                            </p>
                          ) : (
                            (deadConnectionsActivities.data ?? []).map(
                              (activity: any) => {
                                const details = activity.details ?? {};
                                const isReconnect =
                                  activity.action ===
                                  "dead_connections_reconnected";
                                const removalTiming =
                                  details.mode === "temporary"
                                    ? `temporarily removed${details.temporaryDuration ? ` for ${String(details.temporaryDuration).replace("_", " ")}` : ""}`
                                    : "permanently removed";
                                return (
                                  <div key={activity.id} className="px-4 py-3">
                                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                                      <p className="text-sm">
                                        <span className="font-medium">
                                          {activity.isaName || "Unknown ISA"}
                                        </span>{" "}
                                        {isReconnect ? (
                                          <>
                                            reconnected{" "}
                                            <span className="font-medium">
                                              {activity.contactName}
                                            </span>{" "}
                                            with{" "}
                                            <span className="font-medium">
                                              {details.agentName ||
                                                "a new agent"}
                                            </span>
                                            .
                                          </>
                                        ) : (
                                          <>
                                            <span className="font-medium">
                                              {removalTiming}
                                            </span>{" "}
                                            <span className="font-medium">
                                              {activity.contactName}
                                            </span>{" "}
                                            from Dead Connections.
                                          </>
                                        )}
                                      </p>
                                      <span className="shrink-0 text-xs text-muted-foreground">
                                        {formatRelativeDate(activity.createdAt)}
                                      </span>
                                    </div>
                                    {details.note && (
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        Note: {details.note}
                                      </p>
                                    )}
                                  </div>
                                );
                              }
                            )
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                )}
                <FiltersBar
                  showTimeRange={false}
                  days={days}
                  onDaysChange={handleDaysChange}
                  isAdminOrIsa={isAdminOrIsa}
                  isAgent={isAgent}
                  isas={isas}
                  agents={agents}
                  isaFilter={isaFilter}
                  agentFilter={agentFilter}
                  leadSourceFilter={leadSourceFilter}
                  statusFilter={statusFilter}
                  onIsaChange={handleIsaChange}
                  onAgentChange={handleAgentChange}
                  onLeadSourceChange={handleLeadSourceChange}
                  onStatusChange={handleStatusChange}
                  withoutConnectedAgents={withoutConnectedAgents}
                  withoutAssignedIsa={withoutAssignedIsa}
                  withoutContact={withoutContact}
                  onWithoutConnectedAgentsChange={value => {
                    setWithoutConnectedAgents(value);
                    resetPages();
                  }}
                  onWithoutAssignedIsaChange={value => {
                    setWithoutAssignedIsa(value);
                    resetPages();
                  }}
                  onWithoutContactChange={value => {
                    setWithoutContact(value);
                    resetPages();
                  }}
                />
                <DataTable
                  isLoading={deadConnections.isLoading}
                  emptyIcon={
                    <CircleOff className="h-10 w-10 mb-3 opacity-40" />
                  }
                  emptyMessage="No contacts currently have all agent connections marked dead"
                  totalCount={deadConnections.data?.totalCount ?? 0}
                  summaryText="have all agent connections marked dead"
                  page={dcPage}
                  totalPages={deadConnections.data?.totalPages ?? 1}
                  onPageChange={setDeadConnectionsPage}
                  limit={limit}
                  compact
                  headers={
                    <>
                      <TableHead className="w-[50px] text-center">#</TableHead>
                      <TableHead
                        className="cursor-pointer select-none"
                        onClick={() => handleDcSort("contact")}
                      >
                        <span className="inline-flex items-center">
                          Contact{" "}
                          <SortIcon
                            col="contact"
                            activeKey={dcSortKey}
                            activeDir={dcSortDir}
                          />
                        </span>
                      </TableHead>
                      <TableHead className="text-center">Text</TableHead>
                      <TableHead
                        className="text-center cursor-pointer select-none"
                        onClick={() => handleDcSort("deadConnectionCount")}
                      >
                        <span className="inline-flex items-center justify-center w-full">
                          Dead Connections{" "}
                          <SortIcon
                            col="deadConnectionCount"
                            activeKey={dcSortKey}
                            activeDir={dcSortDir}
                          />
                        </span>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer select-none"
                        onClick={() => handleDcSort("lastUpdatedAt")}
                      >
                        <span className="inline-flex items-center">
                          Last Updated{" "}
                          <SortIcon
                            col="lastUpdatedAt"
                            activeKey={dcSortKey}
                            activeDir={dcSortDir}
                          />
                        </span>
                      </TableHead>
                      <TableHead>Last Contact</TableHead>
                      <TableHead>Last Contacted By</TableHead>
                      <TableHead
                        className="cursor-pointer select-none"
                        onClick={() => handleDcSort("leadSource")}
                      >
                        <span className="inline-flex items-center">
                          Lead Source{" "}
                          <SortIcon
                            col="leadSource"
                            activeKey={dcSortKey}
                            activeDir={dcSortDir}
                          />
                        </span>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer select-none"
                        onClick={() => handleDcSort("assignedIsa")}
                      >
                        <span className="inline-flex items-center">
                          Assigned ISA{" "}
                          <SortIcon
                            col="assignedIsa"
                            activeKey={dcSortKey}
                            activeDir={dcSortDir}
                          />
                        </span>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer select-none"
                        onClick={() => handleDcSort("leadScore")}
                      >
                        <span className="inline-flex items-center">
                          Lead Score{" "}
                          <SortIcon
                            col="leadScore"
                            activeKey={dcSortKey}
                            activeDir={dcSortDir}
                          />
                        </span>
                      </TableHead>
                      <TableHead>Agents</TableHead>
                      <TableHead className="w-[84px] text-center">
                        <span className="sr-only">
                          Dead Connections actions
                        </span>
                      </TableHead>
                    </>
                  }
                  rows={(deadConnections.data?.items ?? []).map((lead, idx) => (
                    <TableRow
                      key={lead.contactId}
                      className="hover:bg-muted/50"
                    >
                      <TableCell className="text-center text-muted-foreground text-xs">
                        {(dcPage - 1) * limit + idx + 1}
                      </TableCell>
                      <TableCell>
                        <ContactCell
                          lead={lead}
                          isAgent={false}
                          returnTo={deadConnectionsReturnTo}
                        />
                      </TableCell>
                      <HotLeadTextCell
                        lead={lead}
                        hotLeadType="dead_connections"
                        onText={openTextDialog}
                        enabled={canUseMarketingTextInbox}
                      />
                      <TableCell className="text-center">
                        <Badge variant="destructive">
                          {lead.deadConnectionCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatRelativeDate(lead.lastUpdatedAt)}
                      </TableCell>
                      <LastContactCells lead={lead} />
                      <TableCell className="text-sm text-muted-foreground">
                        {lead.leadSource || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {lead.assignedIsa || "—"}
                      </TableCell>
                      <TableCell>
                        <LeadScoreBadge
                          score={lead.leadScore}
                          signals={lead.leadScoreSignals}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <AgentsList agents={lead.connectedAgents} />
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                            onClick={() =>
                              openDeadConnectionsReconnectDialog(lead)
                            }
                            title="Reconnect with a new agent"
                            aria-label={
                              `Reconnect ${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() +
                              " with a new agent"
                            }
                          >
                            <UserRoundPlus className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={() =>
                              openDeadConnectionsRemovalDialog(lead)
                            }
                            title="Take off Dead Connections list"
                            aria-label={
                              `Take ${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() +
                              " off Dead Connections list"
                            }
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <Dialog
        open={Boolean(textLead)}
        onOpenChange={open => {
          if (!open && !sendText.isPending) {
            setTextLead(null);
            setTextBody("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Draft Hot Leads text</DialogTitle>
            <DialogDescription>
              Review and edit the AI-assisted draft before sending it from the
              shared Marketing Text Inbox line to{" "}
              {textLead?.firstName || "this contact"} {textLead?.lastName || ""}
              .
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="hot-lead-text-body">Message</Label>
            <Textarea
              id="hot-lead-text-body"
              value={textBody}
              onChange={event => setTextBody(event.target.value)}
              rows={6}
              maxLength={1600}
              disabled={draftText.isPending || sendText.isPending}
              placeholder="Preparing a relevant text…"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {draftText.isPending
                  ? "Preparing a personalized draft…"
                  : "Replies will appear in Marketing Text Inbox."}
              </span>
              <span>{textBody.length}/1600</span>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTextLead(null);
                setTextBody("");
              }}
              disabled={sendText.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                textLead &&
                sendText.mutate({
                  contactId: textLead.contactId,
                  hotLeadType: textLeadType,
                  body: textBody.trim(),
                })
              }
              disabled={
                !textBody.trim() || draftText.isPending || sendText.isPending
              }
            >
              {sendText.isPending && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}{" "}
              Send text
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deadConnectionToRemove)}
        onOpenChange={open => {
          if (!open) closeDeadConnectionsRemovalDialog();
        }}
      >
        <DialogContent className="max-w-lg w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>
              Take {deadConnectionToRemove?.firstName}{" "}
              {deadConnectionToRemove?.lastName} off the list
            </DialogTitle>
            <DialogDescription>
              Choose a permanent or temporary removal, then add a required note.
              The choice and note will be saved in this contact's Notes history.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant={
                  deadConnectionsRemovalMode === "permanent"
                    ? "default"
                    : "outline"
                }
                className="h-auto min-h-16 whitespace-normal text-left justify-start"
                onClick={() => setDeadConnectionsRemovalMode("permanent")}
              >
                <span>
                  <span className="block font-semibold">
                    Permanently take off the list
                  </span>
                  <span className="block mt-1 text-xs opacity-80">
                    This contact will not return automatically.
                  </span>
                </span>
              </Button>
              <Button
                type="button"
                variant={
                  deadConnectionsRemovalMode === "temporary"
                    ? "default"
                    : "outline"
                }
                className="h-auto min-h-16 whitespace-normal text-left justify-start"
                onClick={() => setDeadConnectionsRemovalMode("temporary")}
              >
                <span>
                  <span className="block font-semibold">
                    Temporarily take off the list
                  </span>
                  <span className="block mt-1 text-xs opacity-80">
                    The contact returns automatically after the selected time.
                  </span>
                </span>
              </Button>
            </div>

            {deadConnectionsRemovalMode === "temporary" && (
              <div className="space-y-2">
                <Label>Bring this contact back after</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {TEMPORARY_REMOVAL_OPTIONS.map(option => (
                    <Button
                      key={option.value}
                      type="button"
                      variant={
                        temporaryRemovalDuration === option.value
                          ? "default"
                          : "outline"
                      }
                      size="sm"
                      onClick={() => setTemporaryRemovalDuration(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="dead-connections-removal-note">
                Required note
              </Label>
              <Textarea
                id="dead-connections-removal-note"
                value={deadConnectionsRemovalNote}
                onChange={event =>
                  setDeadConnectionsRemovalNote(event.target.value)
                }
                placeholder="Explain why this contact should be removed from the Dead Connections list."
                className="min-h-28"
                maxLength={2000}
              />
              <p className="text-xs text-muted-foreground">
                The contact note will record:{" "}
                {deadConnectionsRemovalMode === "permanent"
                  ? "permanent removal"
                  : `temporary removal for ${TEMPORARY_REMOVAL_OPTIONS.find(option => option.value === temporaryRemovalDuration)?.label}`}
                .
              </p>
              {deadConnectionsRemovalError && (
                <p className="text-sm text-destructive">
                  {deadConnectionsRemovalError}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeDeadConnectionsRemovalDialog}
              disabled={removeDeadConnection.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={submitDeadConnectionsRemoval}
              disabled={
                !deadConnectionsRemovalNote.trim() ||
                removeDeadConnection.isPending
              }
            >
              {removeDeadConnection.isPending ? "Saving..." : "Take off list"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deadConnectionToReconnect)}
        onOpenChange={open => {
          if (!open) closeDeadConnectionsReconnectDialog();
        }}
      >
        <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>
              Reconnect {deadConnectionToReconnect?.firstName}{" "}
              {deadConnectionToReconnect?.lastName}
            </DialogTitle>
            <DialogDescription>
              Create a new connection for this contact with another Savvy agent.
              The contact will leave Dead Connections and the action will be
              recorded for administrators.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="dead-connections-reconnect-agent">
              New connected agent
            </Label>
            <Select
              value={reconnectAgentId}
              onValueChange={setReconnectAgentId}
            >
              <SelectTrigger id="dead-connections-reconnect-agent">
                <SelectValue placeholder="Select an agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent: any) => (
                  <SelectItem key={agent.id} value={String(agent.id)}>
                    {agent.name || agent.email || `Agent #${agent.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {agents.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No active agents are available to select.
              </p>
            )}
            {deadConnectionsReconnectError && (
              <p className="text-sm text-destructive">
                {deadConnectionsReconnectError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeDeadConnectionsReconnectDialog}
              disabled={reconnectDeadConnection.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitDeadConnectionsReconnect}
              disabled={!reconnectAgentId || reconnectDeadConnection.isPending}
            >
              {reconnectDeadConnection.isPending
                ? "Reconnecting..."
                : "Reconnect contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────────────────────────

function HotLeadStatsPanel({
  stats,
  isLoading,
  expanded,
  onExpandedChange,
}: {
  stats: any;
  isLoading: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const metric = (
    label: string,
    value?: { count: number; percent: number }
  ) => (
    <div className="rounded-lg border bg-card px-3 py-2.5" key={label}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">
        {isLoading ? "—" : `${value?.percent ?? 0}%`}
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          {isLoading ? "" : `(${value?.count ?? 0})`}
        </span>
      </p>
    </div>
  );
  return (
    <Collapsible
      open={expanded}
      onOpenChange={onExpandedChange}
      className="mb-5 rounded-xl border bg-muted/20"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div>
          <h2 className="text-sm font-semibold">List performance</h2>
          <p className="text-xs text-muted-foreground">
            Assignment coverage and most-recent SavvyOS contact activity for the
            active list.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            {isLoading ? "Updating…" : `${stats?.totalCount ?? 0} contacts`}
          </p>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5"
              aria-label={
                expanded
                  ? "Collapse list performance"
                  : "Expand list performance"
              }
            >
              {expanded ? "Hide" : "Show"}
              <ChevronDown
                className={`h-4 w-4 transition-transform ${expanded ? "" : "-rotate-90"}`}
              />
            </Button>
          </CollapsibleTrigger>
        </div>
      </div>
      <CollapsibleContent>
        <div className="grid grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-3 xl:grid-cols-6">
          {metric("Assigned ISA", stats?.assignedIsa)}
          {metric("Agent Connected", stats?.connectedAgent)}
          {metric("Contacted 24h", stats?.contacted?.["24h"])}
          {metric("Contacted 48h", stats?.contacted?.["48h"])}
          {metric("Contacted 72h", stats?.contacted?.["72h"])}
          {metric("Contacted 7d", stats?.contacted?.["7d"])}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function FiltersBar({
  showTimeRange = true,
  days,
  onDaysChange,
  isAdminOrIsa,
  isAgent,
  isas,
  agents,
  isaFilter,
  agentFilter,
  leadSourceFilter,
  statusFilter,
  onIsaChange,
  onAgentChange,
  onLeadSourceChange,
  onStatusChange,
  withoutConnectedAgents,
  withoutAssignedIsa,
  withoutContact,
  onWithoutConnectedAgentsChange,
  onWithoutAssignedIsaChange,
  onWithoutContactChange,
}: {
  showTimeRange?: boolean;
  days: DaysFilter;
  onDaysChange: (d: DaysFilter) => void;
  isAdminOrIsa: boolean;
  isAgent: boolean;
  isas: any[];
  agents: any[];
  isaFilter: string;
  agentFilter: string;
  leadSourceFilter: string;
  statusFilter: string;
  onIsaChange: (v: string) => void;
  onAgentChange: (v: string) => void;
  onLeadSourceChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  withoutConnectedAgents: boolean;
  withoutAssignedIsa: boolean;
  withoutContact: boolean;
  onWithoutConnectedAgentsChange: (value: boolean) => void;
  onWithoutAssignedIsaChange: (value: boolean) => void;
  onWithoutContactChange: (value: boolean) => void;
}) {
  const { data: rawLeadSources = [] } = trpc.leadSources.listFlat.useQuery();
  const leadSources = rawLeadSources
    .map((row: any) => row.ls ?? row)
    .sort((a: any, b: any) => (a.name ?? "").localeCompare(b.name ?? ""));
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b">
      {/* Time range */}
      {showTimeRange && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            Time:
          </span>
          <div className="flex items-center gap-1">
            {(["7", "14", "30", "90"] as DaysFilter[]).map(d => (
              <Button
                key={d}
                variant={days === d ? "default" : "outline"}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => onDaysChange(d)}
              >
                {d}d
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Admin/ISA filters */}
      {isAdminOrIsa && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              ISA:
            </span>
            <Select value={isaFilter || "all"} onValueChange={onIsaChange}>
              <SelectTrigger className="h-7 w-[160px] text-xs">
                <SelectValue placeholder="All ISAs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ISAs</SelectItem>
                {isas.map((isa: any) => (
                  <SelectItem key={isa.id} value={String(isa.id)}>
                    {isa.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              Agent:
            </span>
            <Select value={agentFilter || "all"} onValueChange={onAgentChange}>
              <SelectTrigger className="h-7 w-[160px] text-xs">
                <SelectValue placeholder="All Agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                {agents
                  .sort((a: any, b: any) =>
                    (a.name ?? "").localeCompare(b.name ?? "")
                  )
                  .map((agent: any) => (
                    <SelectItem key={agent.id} value={String(agent.id)}>
                      {agent.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">
          Lead Source:
        </span>
        <Select
          value={leadSourceFilter || "all"}
          onValueChange={onLeadSourceChange}
        >
          <SelectTrigger className="h-7 w-[180px] text-xs">
            <SelectValue placeholder="All Lead Sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Lead Sources</SelectItem>
            {leadSources.map((source: any) => (
              <SelectItem key={source.id} value={String(source.id)}>
                {source.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border bg-muted/20 px-2.5 py-1.5">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
          <Checkbox
            checked={withoutConnectedAgents}
            onCheckedChange={checked =>
              onWithoutConnectedAgentsChange(checked === true)
            }
          />
          Has no connected agents
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
          <Checkbox
            checked={withoutAssignedIsa}
            onCheckedChange={checked =>
              onWithoutAssignedIsaChange(checked === true)
            }
          />
          Has no assigned ISA
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
          <Checkbox
            checked={withoutContact}
            onCheckedChange={checked =>
              onWithoutContactChange(checked === true)
            }
          />
          No Contact
        </label>
      </div>

      {/* Agent filter: pipeline status */}
      {isAgent && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            Status:
          </span>
          <Select value={statusFilter || "all"} onValueChange={onStatusChange}>
            <SelectTrigger className="h-7 w-[170px] text-xs">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {PIPELINE_STATUSES.map(s => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

type IntentLeadsTabProps = {
  value: string;
  eventLabel: string;
  eventDescription: string;
  Icon: any;
  query: any;
  page: number;
  onPageChange: (page: number) => void;
  limit: number;
  days: DaysFilter;
  isAdminOrIsa: boolean;
  isAgent: boolean;
  isas: any[];
  agents: any[];
  isaFilter: string;
  agentFilter: string;
  leadSourceFilter: string;
  statusFilter: string;
  onDaysChange: (days: DaysFilter) => void;
  onIsaChange: (value: string) => void;
  onAgentChange: (value: string) => void;
  onLeadSourceChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  withoutConnectedAgents: boolean;
  withoutAssignedIsa: boolean;
  withoutContact: boolean;
  onWithoutConnectedAgentsChange: (value: boolean) => void;
  onWithoutAssignedIsaChange: (value: boolean) => void;
  onWithoutContactChange: (value: boolean) => void;
  sortKey: IntentSortKey;
  sortDir: SortDir;
  onSort: (key: IntentSortKey) => void;
  onText: (lead: any, type: HotLeadTextType) => void;
  canUseText: boolean;
  showText: boolean;
};

function IntentLeadsTab({
  value,
  eventLabel,
  eventDescription,
  Icon,
  query,
  page,
  onPageChange,
  limit,
  days,
  isAdminOrIsa,
  isAgent,
  isas,
  agents,
  isaFilter,
  agentFilter,
  leadSourceFilter,
  statusFilter,
  onDaysChange,
  onIsaChange,
  onAgentChange,
  onLeadSourceChange,
  onStatusChange,
  withoutConnectedAgents,
  withoutAssignedIsa,
  withoutContact,
  onWithoutConnectedAgentsChange,
  onWithoutAssignedIsaChange,
  onWithoutContactChange,
  sortKey,
  sortDir,
  onSort,
  onText,
  canUseText,
  showText,
}: IntentLeadsTabProps) {
  const SortIcon = ({ col }: { col: IntentSortKey }) => {
    if (sortKey !== col)
      return <ArrowUpDown className="ml-1 h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3 text-primary" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3 text-primary" />
    );
  };
  const items = query.data?.items ?? [];
  const showLastProperty = value !== "property-favorites";

  return (
    <TabsContent value={value}>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className="px-4 pt-4 text-sm text-muted-foreground">
            {eventDescription}
          </div>
          <FiltersBar
            days={days}
            onDaysChange={onDaysChange}
            isAdminOrIsa={isAdminOrIsa}
            isAgent={isAgent}
            isas={isas}
            agents={agents}
            isaFilter={isaFilter}
            agentFilter={agentFilter}
            leadSourceFilter={leadSourceFilter}
            statusFilter={statusFilter}
            onIsaChange={onIsaChange}
            onAgentChange={onAgentChange}
            onLeadSourceChange={onLeadSourceChange}
            onStatusChange={onStatusChange}
            withoutConnectedAgents={withoutConnectedAgents}
            withoutAssignedIsa={withoutAssignedIsa}
            withoutContact={withoutContact}
            onWithoutConnectedAgentsChange={onWithoutConnectedAgentsChange}
            onWithoutAssignedIsaChange={onWithoutAssignedIsaChange}
            onWithoutContactChange={onWithoutContactChange}
          />
          <DataTable
            isLoading={query.isLoading}
            emptyIcon={<Icon className="mb-3 h-10 w-10 opacity-40" />}
            emptyMessage={`No ${eventLabel.toLowerCase()} in the last ${days} days`}
            totalCount={query.data?.totalCount ?? 0}
            summaryText={`${eventLabel.toLowerCase()} in the last ${days} days`}
            page={page}
            totalPages={query.data?.totalPages ?? 1}
            onPageChange={onPageChange}
            limit={limit}
            compact={value === "property-favorites"}
            headers={
              <>
                <TableHead className="w-[50px] text-center">#</TableHead>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => onSort("contact")}
                >
                  <span className="inline-flex items-center">
                    Contact <SortIcon col="contact" />
                  </span>
                </TableHead>
                {showText && (
                  <TableHead className="text-center">Text</TableHead>
                )}
                <TableHead
                  className="cursor-pointer select-none text-center"
                  onClick={() => onSort("eventCount")}
                >
                  <span className="inline-flex w-full items-center justify-center">
                    {eventLabel} <SortIcon col="eventCount" />
                  </span>
                </TableHead>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => onSort("lastEventAt")}
                >
                  <span className="inline-flex items-center">
                    Most Recent <SortIcon col="lastEventAt" />
                  </span>
                </TableHead>
                {showLastProperty && <TableHead>Last Property</TableHead>}
                <TableHead>Last Contact</TableHead>
                <TableHead>Last Contacted By</TableHead>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => onSort("leadScore")}
                >
                  <span className="inline-flex items-center">
                    Lead Score <SortIcon col="leadScore" />
                  </span>
                </TableHead>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => onSort("leadSource")}
                >
                  <span className="inline-flex items-center">
                    Lead Source <SortIcon col="leadSource" />
                  </span>
                </TableHead>
                {!isAgent && (
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => onSort("assignedIsa")}
                  >
                    <span className="inline-flex items-center">
                      Assigned ISA <SortIcon col="assignedIsa" />
                    </span>
                  </TableHead>
                )}
                {!isAgent && <TableHead>Connected Agents</TableHead>}
              </>
            }
            rows={items.map((lead: any, index: number) => (
              <TableRow key={lead.contactId} className="hover:bg-muted/50">
                <TableCell className="text-center text-xs text-muted-foreground">
                  {(page - 1) * limit + index + 1}
                </TableCell>
                <TableCell>
                  <ContactCell lead={lead} isAgent={isAgent} />
                </TableCell>
                {showText && (
                  <HotLeadTextCell
                    lead={lead}
                    hotLeadType={
                      value === "property-favorites"
                        ? "property_favorites"
                        : "analysis_requests"
                    }
                    onText={onText}
                    enabled={canUseText}
                  />
                )}
                <TableCell className="text-center">
                  <Badge variant="secondary">{lead.eventCount}</Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {formatRelativeDate(lead.lastEventAt)}
                </TableCell>
                {showLastProperty && (
                  <TableCell
                    className="max-w-[200px] truncate text-sm"
                    title={lead.lastPropertyAddress ?? ""}
                  >
                    {lead.lastPropertyAddress || "—"}
                  </TableCell>
                )}
                <LastContactCells lead={lead} />
                <TableCell>
                  <LeadScoreBadge
                    score={lead.leadScore}
                    signals={lead.leadScoreSignals}
                  />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {lead.leadSource || "—"}
                </TableCell>
                {!isAgent && (
                  <TableCell className="text-sm text-muted-foreground">
                    {lead.assignedIsa || "—"}
                  </TableCell>
                )}
                {!isAgent && (
                  <TableCell className="text-sm text-muted-foreground">
                    <AgentsList agents={lead.connectedAgents} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          />
        </CardContent>
      </Card>
    </TabsContent>
  );
}

function AgentsList({
  agents,
}: {
  agents: Array<{ name: string; connectionId: number }>;
}) {
  if (!agents || agents.length === 0) return <span>—</span>;
  if (agents.length === 1) return <span>{agents[0].name}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {agents.map((a, i) => (
        <Badge key={i} variant="secondary" className="text-xs font-normal">
          {a.name}
        </Badge>
      ))}
    </div>
  );
}

function LastContactCells({
  lead,
}: {
  lead: { lastContacted?: string | null; lastContactedBy?: string | null };
}) {
  return (
    <>
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
        {formatRelativeDate(lead.lastContacted ?? null)}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {lead.lastContactedBy || "—"}
      </TableCell>
    </>
  );
}

function HotLeadTextCell({
  lead,
  hotLeadType,
  onText,
  enabled,
}: {
  lead: {
    firstName?: string | null;
    lastName?: string | null;
    canText?: boolean;
    nextTextAvailableAt?: string | null;
  };
  hotLeadType: HotLeadTextType;
  onText: (lead: any, type: HotLeadTextType) => void;
  enabled: boolean;
}) {
  const name =
    `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() || "this contact";
  if (!enabled || !lead.canText) {
    const cooldown = lead.nextTextAvailableAt
      ? `Available ${formatRelativeDate(lead.nextTextAvailableAt)}`
      : "Text unavailable";
    return (
      <TableCell
        className="whitespace-nowrap text-center text-xs text-muted-foreground"
        title={cooldown}
      >
        —
      </TableCell>
    );
  }
  return (
    <TableCell className="text-center">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onText(lead, hotLeadType)}
        title={`Draft text for ${name}`}
      >
        <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Text
      </Button>
    </TableCell>
  );
}

function ContactCell({
  lead,
  isAgent,
  returnTo,
}: {
  lead: {
    contactId: number;
    connectedAgents: Array<{ name: string; connectionId: number }>;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  };
  isAgent: boolean;
  returnTo?: string;
}) {
  const link =
    isAgent && lead.connectedAgents.length > 0
      ? `/pipeline/${lead.connectedAgents[0].connectionId}`
      : `/contacts/${lead.contactId}`;
  const contactLink = returnTo
    ? `${link}?returnTo=${encodeURIComponent(returnTo)}`
    : link;

  return (
    <div className="flex flex-col">
      <Link
        href={contactLink}
        className="font-medium text-foreground hover:text-primary hover:underline flex items-center gap-1"
      >
        {lead.firstName} {lead.lastName}
        <ExternalLink className="h-3 w-3 opacity-50" />
      </Link>
      <span className="text-xs text-muted-foreground">
        {lead.email || lead.phone || "—"}
      </span>
    </div>
  );
}

interface DataTableProps {
  isLoading: boolean;
  emptyIcon: React.ReactNode;
  emptyMessage: string;
  totalCount: number;
  summaryText: string;
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  limit: number;
  headers: React.ReactNode;
  rows: React.ReactNode[] | undefined;
  compact?: boolean;
}

function DataTable({
  isLoading,
  emptyIcon,
  emptyMessage,
  totalCount,
  summaryText,
  page,
  totalPages,
  onPageChange,
  limit,
  headers,
  rows,
  compact = false,
}: DataTableProps) {
  const paginationItems = getPaginationItems(page, totalPages);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading hot leads...</span>
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        {emptyIcon}
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      {/* Summary bar */}
      <div className="flex items-center gap-4 px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" />
          <span className="text-sm font-medium">
            {totalCount} contact{totalCount !== 1 ? "s" : ""} {summaryText}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <Table
          className={
            compact
              ? "table-fixed text-xs [&_th]:h-8 [&_th]:whitespace-normal [&_th]:px-1 [&_td]:whitespace-normal [&_td]:px-1 [&_td]:py-1.5"
              : undefined
          }
        >
          <TableHeader>
            <TableRow>{headers}</TableRow>
          </TableHeader>
          <TableBody>{rows}</TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({totalCount} total)
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <div
              className="hidden items-center gap-1 sm:flex"
              aria-label="Pagination"
            >
              {paginationItems.map((item, index) =>
                item === "ellipsis" ? (
                  <span
                    key={`ellipsis-${index}`}
                    className="px-1 text-sm text-muted-foreground"
                    aria-hidden="true"
                  >
                    …
                  </span>
                ) : (
                  <Button
                    key={item}
                    type="button"
                    variant={item === page ? "default" : "outline"}
                    size="sm"
                    className="h-8 min-w-8 px-2"
                    onClick={() => onPageChange(item)}
                    aria-label={`Go to page ${item}`}
                    aria-current={item === page ? "page" : undefined}
                  >
                    {item}
                  </Button>
                )
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function getPaginationItems(
  currentPage: number,
  totalPages: number
): Array<number | "ellipsis"> {
  if (totalPages <= 7)
    return Array.from({ length: totalPages }, (_, index) => index + 1);

  const nearbyPages = new Set([1, totalPages]);
  for (
    let page = Math.max(2, currentPage - 2);
    page <= Math.min(totalPages - 1, currentPage + 2);
    page += 1
  ) {
    nearbyPages.add(page);
  }

  const orderedPages = Array.from(nearbyPages).sort((a, b) => a - b);
  const items: Array<number | "ellipsis"> = [];
  orderedPages.forEach((page, index) => {
    const previousPage = orderedPages[index - 1];
    if (previousPage && page - previousPage > 1) items.push("ellipsis");
    items.push(page);
  });

  return items;
}

// ─── Badge Components ─────────────────────────────────────────────────────────

function ViewCountBadge({ count }: { count: number }) {
  if (count >= 50) {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
        <Flame className="h-3 w-3 mr-1" />
        {count}
      </Badge>
    );
  }
  if (count >= 20) {
    return (
      <Badge className="bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800">
        <Eye className="h-3 w-3 mr-1" />
        {count}
      </Badge>
    );
  }
  if (count >= 10) {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">
        {count}
      </Badge>
    );
  }
  return <Badge variant="secondary">{count}</Badge>;
}

function DaysBadge({ count }: { count: number }) {
  if (count >= 5) {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
        <CalendarDays className="h-3 w-3 mr-1" />
        {count} days
      </Badge>
    );
  }
  if (count >= 3) {
    return (
      <Badge className="bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800">
        <CalendarDays className="h-3 w-3 mr-1" />
        {count} days
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <CalendarDays className="h-3 w-3 mr-1" />
      {count} days
    </Badge>
  );
}

function LeadScoreBadge({
  score,
  signals,
}: {
  score?: number;
  signals?: string[];
}) {
  const normalizedScore = Math.max(0, Math.min(100, Number(score ?? 0)));
  const label = `Lead Score ${normalizedScore}/100${signals?.length ? ` — ${signals.join(" • ")}` : " — No additional recent engagement signals"}`;
  if (normalizedScore >= 70) {
    return (
      <Badge
        title={label}
        className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
      >
        <Flame className="mr-1 h-3 w-3" />
        {normalizedScore}/100
      </Badge>
    );
  }
  if (normalizedScore >= 40) {
    return (
      <Badge
        title={label}
        className="bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800"
      >
        {normalizedScore}/100
      </Badge>
    );
  }
  if (normalizedScore >= 1) {
    return (
      <Badge
        title={label}
        className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800"
      >
        {normalizedScore}/100
      </Badge>
    );
  }
  return (
    <Badge title={label} variant="secondary">
      0/100
    </Badge>
  );
}

function ClicksBadge({ count }: { count: number }) {
  if (count >= 10) {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
        <MousePointerClick className="h-3 w-3 mr-1" />
        {count}
      </Badge>
    );
  }
  if (count >= 5) {
    return (
      <Badge className="bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800">
        <MousePointerClick className="h-3 w-3 mr-1" />
        {count}
      </Badge>
    );
  }
  if (count >= 1) {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">
        <MousePointerClick className="h-3 w-3 mr-1" />
        {count}
      </Badge>
    );
  }
  return <Badge variant="secondary">0</Badge>;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "—";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  // Guard against negative values (clock skew or future timestamps)
  if (diffMs < 0) return "Just now";

  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
