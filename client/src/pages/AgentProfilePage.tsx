import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  TrendingUp,
  DollarSign,
  FileText,
  Users,
  CheckSquare,
  Building2,
  BarChart3,
  LogOut,
  LogIn,
  ClipboardList,
  Loader2,
  UserX,
  UserCheck,
  MessageSquarePlus,
  Star,
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Download,
  Upload,
  Pencil,
  Link2,
  GitMerge,
  Search,
} from "lucide-react";
import { formatPhone, isValidEmail, isValidPhone } from "@/lib/inputFormatters";
import { formatEmail } from "@/lib/format";
import { format } from "date-fns";
import UserExtendedProfileTab from "@/components/UserExtendedProfileTab";
import { safeFormat } from "@/lib/safeFormat";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  agent: "Agent",
  isa: "ISA",
  user: "User",
};

const PIE_COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b",
];

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  pending: "bg-yellow-100 text-yellow-800",
  under_contract: "bg-blue-100 text-blue-800",
  closed: "bg-gray-100 text-gray-700",
  terminated: "bg-red-100 text-red-800",
  expired: "bg-orange-100 text-orange-800",
};

function formatCurrency(v: number | string | null | undefined) {
  if (v == null) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function getInitials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export default function AgentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const agentId = parseInt(id ?? "0", 10);
  const [, navigate] = useLocation();
  const { user: currentUser } = useAuth();
  const [txPage, setTxPage] = useState(1);
  const [contactPage, setContactPage] = useState(1);
  const [taskPage, setTaskPage] = useState(1);
  const [offboardDialogOpen, setOffboardDialogOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  // Documents state
  const [docUploadOpen, setDocUploadOpen] = useState(false);
  const [docLabel, setDocLabel] = useState("");
  const [docCategory, setDocCategory] = useState("other");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docUploading, setDocUploading] = useState(false);
  const [oneOnOneOpen, setOneOnOneOpen] = useState(false);
  const [editFeedbackId, setEditFeedbackId] = useState<number | null>(null);
   const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [editProfileForm, setEditProfileForm] = useState({
    name: "", title: "", email: "", phone: "", commissionSplit: "", callBookingLink: "",
  });
  // ─── Request Connection state ────────────────────────────────────────────────
  const [reqConnOpen, setReqConnOpen] = useState(false);
  const [reqConnSearch, setReqConnSearch] = useState("");
  const [reqConnSelectedContact, setReqConnSelectedContact] = useState<{ id: number; firstName: string; lastName: string; email: string | null; phone: string | null } | null>(null);
  const [reqConnPipelineStatus, setReqConnPipelineStatus] = useState("new_lead");

  // Debounced search for contacts not yet connected to this agent
  const { data: reqConnResults = [] } = trpc.contacts.searchForRequest.useQuery(
    { search: reqConnSearch, agentId },
    { enabled: reqConnSearch.trim().length >= 2 }
  );

  const requestConnMut = trpc.connectionRequests.create.useMutation({
    onSuccess: () => {
      toast.success("Connection request submitted — an admin or ISA will review it");
      setReqConnOpen(false);
      setReqConnSearch("");
      setReqConnSelectedContact(null);
      setReqConnPipelineStatus("new_lead");
    },
    onError: (e) => toast.error(e.message),
  });

  const [feedbackForm, setFeedbackForm] = useState({
    meetingDate: new Date().toISOString().split("T")[0],
    summary: "",
    strengths: "",
    areasForImprovement: "",
    goals: "",
    followUpDate: "",
    rating: "" as string,
    isPrivate: false,
  });

  const { data: agent, isLoading: agentLoading } = trpc.users.getById.useQuery(
    { id: agentId },
    { enabled: !!agentId }
  );

  const { data: agentCoreProfile } = trpc.users.getCoreProfile.useQuery(
    { userId: agentId },
    { enabled: !!agentId }
  );

  const { data: markets = [] } = trpc.markets.list.useQuery();
  const { data: allUsers = [] } = trpc.users.list.useQuery({});

  const { data: txData } = trpc.transactions.list.useQuery(
    { agentId, page: txPage, limit: 20 },
    { enabled: !!agentId }
  );

  const { data: contactData } = trpc.contacts.list.useQuery(
    { agentId, page: contactPage, limit: 20 },
    { enabled: !!agentId }
  );

  const { data: taskData } = trpc.tasks.list.useQuery(
    { assignedToId: agentId, page: taskPage, limit: 20 },
    { enabled: !!agentId }
  );

  const { data: gciData } = trpc.analytics.monthlyGciTrend.useQuery(
    { months: 12, agentId },
    { enabled: !!agentId }
  );

  const { data: leadSourceData } = trpc.analytics.agentLeadSourceBreakdown.useQuery(
    { agentId },
    { enabled: !!agentId }
  );

  const { data: txTypeData } = trpc.analytics.agentTransactionTypeBreakdown.useQuery(
    { agentId },
    { enabled: !!agentId }
  );

  // Group leader status for badge (admin only — checks a specific user)
  const { data: groupLeaderData } = trpc.groups.isGroupLeaderForUser.useQuery(
    { userId: agentId },
    { enabled: !!agentId }
  );

  // Leadership 1-on-1 feedback (admin only)
  const isAdmin = currentUser?.role === "admin";

  // User documents
  const { data: userDocs = [], refetch: refetchDocs } = trpc.users.listDocuments.useQuery(
    { userId: agentId },
    { enabled: !!agentId }
  );
  const uploadDocMutation = trpc.users.uploadDocument.useMutation({
    onSuccess: () => {
      refetchDocs();
      setDocUploadOpen(false);
      setDocLabel("");
      setDocCategory("other");
      setDocFile(null);
      setDocUploading(false);
      toast.success("Document uploaded");
    },
    onError: (e) => { setDocUploading(false); toast.error(e.message); },
  });
  const deleteDocMutation = trpc.users.deleteDocument.useMutation({
    onSuccess: () => { refetchDocs(); toast.success("Document deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const handleDocUpload = () => {
    if (!docFile || !docLabel.trim()) return;
    setDocUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = (ev.target?.result as string).split(",")[1];
      uploadDocMutation.mutate({
        userId: agentId,
        label: docLabel.trim(),
        category: docCategory,
        fileName: docFile.name,
        mimeType: docFile.type || "application/octet-stream",
        fileSize: docFile.size,
        fileBase64: base64,
      });
    };
    reader.readAsDataURL(docFile);
  };

  const { data: feedbackList = [] } = trpc.leadership.listForAgent.useQuery(
    { agentUserId: agentId },
    { enabled: !!agentId && isAdmin }
  );
  const createFeedback = trpc.leadership.create.useMutation({
    onSuccess: () => {
      utils.leadership.listForAgent.invalidate({ agentUserId: agentId });
      setOneOnOneOpen(false);
      resetFeedbackForm();
      toast.success("1-on-1 notes saved");
    },
    onError: (e) => toast.error(e.message),
  });
  const updateFeedback = trpc.leadership.update.useMutation({
    onSuccess: () => {
      utils.leadership.listForAgent.invalidate({ agentUserId: agentId });
      setOneOnOneOpen(false);
      setEditFeedbackId(null);
      resetFeedbackForm();
      toast.success("Notes updated");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteFeedback = trpc.leadership.delete.useMutation({
    onSuccess: () => {
      utils.leadership.listForAgent.invalidate({ agentUserId: agentId });
      toast.success("Notes deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  function resetFeedbackForm() {
    setFeedbackForm({
      meetingDate: new Date().toISOString().split("T")[0],
      summary: "",
      strengths: "",
      areasForImprovement: "",
      goals: "",
      followUpDate: "",
      rating: "",
      isPrivate: false,
    });
  }

  function openEditFeedback(fb: any) {
    setEditFeedbackId(fb.id);
    setFeedbackForm({
      meetingDate: safeFormat(fb.meetingDate, "yyyy-MM-dd"),
      summary: fb.summary ?? "",
      strengths: fb.strengths ?? "",
      areasForImprovement: fb.areasForImprovement ?? "",
      goals: fb.goals ?? "",
      followUpDate: fb.followUpDate ? safeFormat(fb.followUpDate, "yyyy-MM-dd") : "",
      rating: fb.rating ? String(fb.rating) : "",
      isPrivate: fb.isPrivate ?? false,
    });
    setOneOnOneOpen(true);
  }

  // Onboarding/offboarding status and templates (admin only)
  const { data: agentOnboardingStatus } = trpc.onboarding.agentOnboardingStatus.useQuery(
    { agentUserId: agentId },
    { enabled: !!agentId && currentUser?.role === "admin" }
  );
  const { data: allTemplates } = trpc.onboarding.listTemplates.useQuery(
    undefined,
    { enabled: currentUser?.role === "admin" && offboardDialogOpen }
  );
  const offboardingTemplates = allTemplates?.filter((t) => t.type === "offboarding") ?? [];
  const onboardingTemplates = allTemplates?.filter((t) => t.type === "onboarding") ?? [];

  const utils = trpc.useUtils();
  const createInstanceMut = trpc.onboarding.createInstance.useMutation({
    onSuccess: (data) => {
      utils.onboarding.agentOnboardingStatus.invalidate();
      utils.onboarding.listInstances.invalidate();
      setOffboardDialogOpen(false);
      setSelectedTemplateId("");
      toast.success("Process started successfully");
    },
    onError: (err) => toast.error(err.message),
  });

  const activeOffboarding = agentOnboardingStatus?.filter((s) => s.template?.type === "offboarding") ?? [];
  const activeOnboarding = agentOnboardingStatus?.filter((s) => s.template?.type === "onboarding") ?? [];

  const updateUserMut = trpc.users.update.useMutation({
    onSuccess: () => {
      toast.success("Profile updated.");
      utils.users.getById.invalidate({ id: agentId });
      utils.users.list.invalidate();
      setEditProfileOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const toggleActiveMut = trpc.users.toggleActive.useMutation({
    onSuccess: (data) => {
      utils.users.getById.invalidate({ id: agentId });
      utils.users.list.invalidate();
      toast.success(data.isActive ? "Account activated" : "Account deactivated");
    },
    onError: (err) => toast.error(err.message),
  });

  if (agentLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading agent profile...
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Agent not found.</p>
        <Button variant="outline" onClick={() => navigate(-1 as any)}>Go Back</Button>
      </div>
    );
  }

  const agentData = agent as any;
  const isProtectedAccount = agentData?.email === "tyler@savvy.realty";
  const isSelf = currentUser?.id === agentId;
  const marketName = agentData.marketProfileId
    ? (markets as any[]).find((m) => m.id === agentData.marketProfileId)?.name
    : null;
  const reportsToUser = agentData.reportsToId
    ? (allUsers as any[]).find((u) => u.id === agentData.reportsToId)
    : null;

  const transactions = (txData as any)?.rows ?? [];
  const txTotal = (txData as any)?.total ?? 0;
  const contacts = (contactData as any)?.rows ?? [];
  const contactTotal = (contactData as any)?.total ?? 0;
  const tasks = (taskData as any)?.rows ?? [];
  const taskTotal = (taskData as any)?.total ?? 0;

  // Compute quick stats
  const closedTx = transactions.filter((t: any) => t.status === "closed");
  const totalGci = closedTx.reduce((sum: number, t: any) => sum + parseFloat(t.gci ?? "0"), 0);
  const activeTx = transactions.filter((t: any) => ["under_contract"].includes(t.status));
  const pendingTasks = tasks.filter((t: any) => t.status !== "completed");

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={() => navigate(-1 as any)} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </Button>

      {/* Header card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
            <Avatar className="h-20 w-20">
              {agentCoreProfile?.profilePhotoUrl && (
                <AvatarImage src={agentCoreProfile.profilePhotoUrl} alt={agentData.name ?? ""} className="object-cover" />
              )}
              <AvatarFallback className="bg-primary/10 text-primary font-bold text-2xl">
                {getInitials(agentData.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold">{agentData.name ?? "—"}</h1>
                <Badge variant="outline" className="capitalize">
                  {ROLE_LABELS[agentData.role] ?? agentData.role}
                </Badge>
                {!agentData.isActive && (
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                    Inactive
                  </Badge>
                )}
                {(groupLeaderData as any)?.isLeader && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    <Users className="h-3 w-3 mr-1" /> Group Leader
                  </Badge>
                )}
              </div>
              {agentData.title && (
                <p className="text-muted-foreground font-medium">{agentData.title}</p>
              )}
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-2">
                {agentData.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" /> {formatEmail(agentData.email)}
                  </span>
                )}
                {agentData.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" /> {formatPhone(agentData.phone)}
                  </span>
                )}
                {marketName && (
                  <button
                    className="flex items-center gap-1.5 text-primary hover:underline"
                    onClick={() => navigate(`/analytics/market/${agentData.marketProfileId}`)}
                    title="View market analytics"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors">
                      {marketName}
                    </Badge>
                  </button>
                )}
                {reportsToUser && (
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Reports to {reportsToUser.name}
                  </span>
                )}
              </div>
            </div>
            {isAdmin && (
              <div className="flex gap-2 mt-4 sm:mt-0 shrink-0 flex-wrap">
                {!isProtectedAccount && !isSelf && (
                  <Button
                    variant="outline"
                    size="sm"
                    className={agentData.isActive
                      ? "text-amber-600 border-amber-200 hover:bg-amber-50"
                      : "text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                    }
                    disabled={toggleActiveMut.isPending}
                    onClick={() => {
                      const action = agentData.isActive ? "deactivate" : "activate";
                      if (window.confirm(`Are you sure you want to ${action} ${agentData.name ?? "this user"}?`)) {
                        toggleActiveMut.mutate({ userId: agentId, isActive: !agentData.isActive });
                      }
                    }}
                  >
                    {toggleActiveMut.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : agentData.isActive ? (
                      <><UserX className="h-4 w-4 mr-1.5" /> Deactivate</>
                    ) : (
                      <><UserCheck className="h-4 w-4 mr-1.5" /> Activate</>
                    )}
                  </Button>
                )}
                {agentData.role === "agent" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => { setSelectedTemplateId(""); setOffboardDialogOpen(true); }}
                  >
                    <LogOut className="h-4 w-4 mr-1.5" /> Offboard Agent
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditProfileForm({
                      name: agentData.name ?? "",
                      title: agentData.title ?? "",
                      email: agentData.email ?? "",
                      phone: agentData.phone ?? "",
                      commissionSplit: agentData.commissionSplit != null ? String(agentData.commissionSplit) : "",
                      callBookingLink: (agentData as any).callBookingLink ?? "",
                    });
                    setEditProfileOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-1.5" /> Edit Profile
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                  onClick={() => { resetFeedbackForm(); setEditFeedbackId(null); setOneOnOneOpen(true); }}
                >
                  <MessageSquarePlus className="h-4 w-4 mr-1.5" /> Leadership 1-on-1
                </Button>
              </div>
            )}
            {/* Request Connection button — visible to admins and the agent themselves */}
            {(isAdmin || isSelf) && agentData.role === "agent" && (
              <div className={`flex gap-2 mt-4 sm:mt-0 shrink-0 ${isAdmin ? "" : ""}`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                  onClick={() => {
                    setReqConnSearch("");
                    setReqConnSelectedContact(null);
                    setReqConnPipelineStatus("new_lead");
                    setReqConnOpen(true);
                  }}
                >
                  <GitMerge className="h-4 w-4 mr-1.5" /> Request Connection
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Active On/Offboarding Status */}
      {isAdmin && agentOnboardingStatus && agentOnboardingStatus.length > 0 && (
        <div className="space-y-3">
          {agentOnboardingStatus.map((s) => {
            const isOff = s.template?.type === "offboarding";
            const total = Number(s.totalTasks);
            const completed = Number(s.completedTasks);
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
            return (
              <Card key={s.instance.id} className={isOff ? "border-red-200 bg-red-50/50" : "border-emerald-200 bg-emerald-50/50"}>
                <CardContent className="py-3 flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${isOff ? "bg-red-100" : "bg-emerald-100"}`}>
                    {isOff ? <LogOut className="h-5 w-5 text-red-600" /> : <LogIn className="h-5 w-5 text-emerald-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{s.template?.name ?? "Unknown Template"}</span>
                      <Badge variant="outline" className={`text-xs ${isOff ? "bg-red-100 text-red-700 border-red-200" : "bg-emerald-100 text-emerald-700 border-emerald-200"}`}>
                        {isOff ? "Offboarding" : "Onboarding"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {completed}/{total} tasks completed ({pct}%) — Started {safeFormat(s.instance.startedAt, "MMM d, yyyy")}
                    </p>
                  </div>
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${isOff ? "bg-red-500" : "bg-emerald-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Quick stats — GCI/Transactions only for agents */}
      <div className={`grid gap-4 ${agentData.role === "agent" ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2"}`}>
        {agentData.role === "agent" && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total GCI (Closed)</p>
                  <p className="text-lg font-bold">{formatCurrency(totalGci)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        {agentData.role === "agent" && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Active Transactions</p>
                  <p className="text-lg font-bold">{activeTx.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <Users className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Assigned Contacts</p>
                <p className="text-lg font-bold">{contactTotal}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <CheckSquare className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pending Tasks</p>
                <p className="text-lg font-bold">{pendingTasks.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue={agentData.role === "agent" ? "transactions" : "contacts"}>
        <TabsList>
          {agentData.role === "agent" && (
            <TabsTrigger value="transactions">
              <FileText className="h-4 w-4 mr-1.5" />
              Transactions ({txTotal})
            </TabsTrigger>
          )}
          <TabsTrigger value="contacts">
            <Users className="h-4 w-4 mr-1.5" />
            Contacts ({contactTotal})
          </TabsTrigger>
          <TabsTrigger value="tasks">
            <CheckSquare className="h-4 w-4 mr-1.5" />
            Tasks ({taskTotal})
          </TabsTrigger>
          {agentData.role === "agent" && (
            <TabsTrigger value="analytics">
              <BarChart3 className="h-4 w-4 mr-1.5" />
              Analytics
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="leadership">
              <MessageSquarePlus className="h-4 w-4 mr-1.5" />
              1-on-1s ({(feedbackList as any[]).length})
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="documents">
              <FolderOpen className="h-4 w-4 mr-1.5" />
              Documents {(userDocs as any[]).length > 0 && `(${(userDocs as any[]).length})`}
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="extended-profile">
              <ClipboardList className="h-4 w-4 mr-1.5" />
              Extended Profile
            </TabsTrigger>
          )}
        </TabsList>

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contact</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>GCI</TableHead>
                    <TableHead>Close Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No transactions found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((tx: any) => (
                      <TableRow
                        key={tx.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/transactions/${tx.id}`)}
                      >
                        <TableCell>
                          {tx.contactFirstName
                            ? `${tx.contactFirstName} ${tx.contactLastName ?? ""}`.trim()
                            : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {tx.propertyAddress ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`capitalize text-xs ${STATUS_COLORS[tx.status] ?? ""}`}
                          >
                            {tx.status?.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatCurrency(tx.gci)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {tx.closingDate
                            ? safeFormat(tx.closingDate, "MMM d, yyyy")
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {txTotal > 20 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <span className="text-sm text-muted-foreground">
                    Page {txPage} of {Math.ceil(txTotal / 20)}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={txPage <= 1}
                      onClick={() => setTxPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={txPage >= Math.ceil(txTotal / 20)}
                      onClick={() => setTxPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contacts Tab */}
        <TabsContent value="contacts" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>ISA Status</TableHead>
                    <TableHead>Lead Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No contacts assigned to this agent.
                      </TableCell>
                    </TableRow>
                  ) : (
                    contacts.map((c: any) => (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/contacts/${c.id}`)}
                      >
                        <TableCell className="font-medium">
                          {c.firstName} {c.lastName}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {c.email ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {c.phone ?? "—"}
                        </TableCell>
                        <TableCell>
                          {c.isaStatus ? (
                            <Badge variant="outline" className="capitalize text-xs">
                              {c.isaStatus.replace(/_/g, " ")}
                            </Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {c.leadSourceName ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {contactTotal > 20 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <span className="text-sm text-muted-foreground">
                    Page {contactPage} of {Math.ceil(contactTotal / 20)}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={contactPage <= 1}
                      onClick={() => setContactPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={contactPage >= Math.ceil(contactTotal / 20)}
                      onClick={() => setContactPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>Related Contact</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No tasks found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    tasks.map((task: any) => (
                      <TableRow key={task.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium">{task.title}</TableCell>
                        <TableCell
                          className="text-sm text-muted-foreground cursor-pointer hover:text-primary"
                          onClick={() => task.relatedContactId && navigate(`/contacts/${task.relatedContactId}`)}
                        >
                          {task.contactFirstName
                            ? `${task.contactFirstName} ${task.contactLastName ?? ""}`.trim()
                            : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {task.dueDate
                            ? safeFormat(task.dueDate, "MMM d, yyyy")
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {task.priority ? (
                            <Badge
                              variant="outline"
                              className={`capitalize text-xs ${
                                task.priority === "high"
                                  ? "bg-red-50 text-red-700 border-red-200"
                                  : task.priority === "medium"
                                  ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                                  : "bg-gray-50 text-gray-600 border-gray-200"
                              }`}
                            >
                              {task.priority}
                            </Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`capitalize text-xs ${
                              task.status === "completed"
                                ? "bg-green-50 text-green-700 border-green-200"
                                : task.status === "overdue"
                                ? "bg-red-50 text-red-700 border-red-200"
                                : "bg-blue-50 text-blue-700 border-blue-200"
                            }`}
                          >
                            {task.status?.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {taskTotal > 20 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <span className="text-sm text-muted-foreground">
                    Page {taskPage} of {Math.ceil(taskTotal / 20)}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={taskPage <= 1}
                      onClick={() => setTaskPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={taskPage >= Math.ceil(taskTotal / 20)}
                      onClick={() => setTaskPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly GCI Trend */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Monthly GCI Trend (Last 12 Months)</CardTitle>
              </CardHeader>
              <CardContent>
                {(gciData as any[])?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={(gciData as any[]).map((d: any) => ({
                      month: d.month,
                      gci: Number(d.gci ?? 0),
                      deals: Number(d.deals ?? 0),
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                      <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          name === "gci" ? formatCurrency(value) : value,
                          name === "gci" ? "GCI" : "Deals",
                        ]}
                        contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))" }}
                      />
                      <Bar dataKey="gci" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                    No closed transactions in the last 12 months.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Closed Deals Over Time */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Closed Deals Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                {(gciData as any[])?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={(gciData as any[]).map((d: any) => ({
                      month: d.month,
                      deals: Number(d.deals ?? 0),
                      avgPrice: Number(d.avgPrice ?? 0),
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                      <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          name === "avgPrice" ? formatCurrency(value) : value,
                          name === "deals" ? "Deals Closed" : "Avg Price",
                        ]}
                        contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))" }}
                      />
                      <Line type="monotone" dataKey="deals" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                    No closed deals data available.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Lead Source Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lead Source Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {(leadSourceData as any[])?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={(leadSourceData as any[]).map((d: any) => ({
                          name: d.source?.replace(/_/g, " ") ?? "Unknown",
                          value: Number(d.count ?? 0),
                        }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {(leadSourceData as any[]).map((_: any, i: number) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                    No lead source data for this agent.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Transaction Type Breakdown */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Transaction Type Breakdown (Closed)</CardTitle>
              </CardHeader>
              <CardContent>
                {(txTypeData as any[])?.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {(txTypeData as any[]).map((d: any) => (
                      <div key={d.type ?? "unknown"} className="rounded-lg border p-4 text-center">
                        <p className="text-sm text-muted-foreground capitalize">{d.type?.replace(/_/g, " ") ?? "Unknown"}</p>
                        <p className="text-2xl font-bold mt-1">{d.count}</p>
                        <p className="text-sm text-muted-foreground">deals</p>
                        <p className="text-lg font-semibold text-primary mt-1">{formatCurrency(d.totalGci)}</p>
                        <p className="text-xs text-muted-foreground">total GCI</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                    No closed transactions for this agent.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Leadership 1-on-1 Tab */}
        {isAdmin && (
          <TabsContent value="leadership" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Leadership 1-on-1 History</CardTitle>
                  <Button size="sm" onClick={() => { resetFeedbackForm(); setEditFeedbackId(null); setOneOnOneOpen(true); }}>
                    <MessageSquarePlus className="h-4 w-4 mr-1.5" /> New 1-on-1
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {(feedbackList as any[]).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <MessageSquarePlus className="h-8 w-8 mb-2 opacity-40" />
                    <p className="text-sm">No 1-on-1 notes yet. Click "New 1-on-1" to add the first one.</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {(feedbackList as any[]).map((row: any) => {
                      const fb = row.feedback ?? row;
                      const conductor = row.conductor;
                      return (
                        <div key={fb.id} className="p-4 hover:bg-muted/30 transition-colors">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{safeFormat(fb.meetingDate, "MMM d, yyyy")}</span>
                                {fb.rating && (
                                  <span className="flex items-center gap-0.5">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                      <Star key={i} className={`h-3.5 w-3.5 ${i < fb.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                                    ))}
                                  </span>
                                )}
                                {fb.isPrivate && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">Private</span>}
                                {fb.followUpDate && (
                                  <span className="text-xs text-muted-foreground">Follow-up: {safeFormat(fb.followUpDate, "MMM d, yyyy")}</span>
                                )}
                              </div>
                              {conductor?.name && (
                                <p className="text-xs text-muted-foreground mt-0.5">Conducted by {conductor.name}</p>
                              )}
                              <p className="text-sm mt-2 text-foreground/90">{fb.summary}</p>
                              {fb.strengths && (
                                <div className="mt-2">
                                  <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Strengths</span>
                                  <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{fb.strengths}</p>
                                </div>
                              )}
                              {fb.areasForImprovement && (
                                <div className="mt-2">
                                  <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Areas for Improvement</span>
                                  <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{fb.areasForImprovement}</p>
                                </div>
                              )}
                              {fb.goals && (
                                <div className="mt-2">
                                  <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Goals</span>
                                  <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{fb.goals}</p>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditFeedback(fb)}>
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => {
                                if (confirm("Delete this 1-on-1 note?")) deleteFeedback.mutate({ id: fb.id });
                              }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Documents Tab */}
        {isAdmin && (
          <TabsContent value="documents" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Profile Documents</CardTitle>
                  <Button size="sm" onClick={() => { setDocLabel(""); setDocCategory("other"); setDocFile(null); setDocUploadOpen(true); }}>
                    <Upload className="h-4 w-4 mr-1.5" /> Upload Document
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {(userDocs as any[]).length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <FolderOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No documents uploaded yet.</p>
                    <p className="text-xs mt-1">Upload contracts, IDs, licenses, or any other files for this user.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Label</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>File Name</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Uploaded</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(userDocs as any[]).map((doc: any) => (
                        <TableRow key={doc.id}>
                          <TableCell className="font-medium">{doc.label}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground capitalize">
                              {(doc.category ?? "other").replace(/_/g, " ")}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{doc.fileName}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(1)} KB` : "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(doc.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => window.open(doc.fileUrl, "_blank")}>
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive"
                                onClick={() => { if (confirm(`Delete "${doc.label}"?`)) deleteDocMutation.mutate({ documentId: doc.id }); }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Extended Profile Tab */}
        {isAdmin && (
          <TabsContent value="extended-profile" className="mt-4">
            <UserExtendedProfileTab
              userId={agentId}
              userRole={agentData.role as "agent" | "admin" | "isa"}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* ── Upload Document Dialog ── */}
      <Dialog open={docUploadOpen} onOpenChange={(open) => { if (!docUploading) setDocUploadOpen(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm">Label *</Label>
              <Input
                placeholder="e.g. Real Estate License, W-9, ID Copy"
                value={docLabel}
                onChange={(e) => setDocLabel(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm">Category</Label>
              <Select value={docCategory} onValueChange={setDocCategory}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="license">License</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="w9">W-9</SelectItem>
                  <SelectItem value="id">ID / Identification</SelectItem>
                  <SelectItem value="insurance">Insurance</SelectItem>
                  <SelectItem value="certification">Certification</SelectItem>
                  <SelectItem value="agreement">Agreement</SelectItem>
                  <SelectItem value="tax">Tax Document</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">File *</Label>
              <Input
                type="file"
                className="mt-1"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt,.xlsx,.csv"
                onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
              />
              {docFile && (
                <p className="text-xs text-muted-foreground mt-1">{docFile.name} ({(docFile.size / 1024).toFixed(1)} KB)</p>
              )}
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDocUploadOpen(false)} disabled={docUploading}>Cancel</Button>
            <Button onClick={handleDocUpload} disabled={!docFile || !docLabel.trim() || docUploading}>
              {docUploading ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Uploading...</> : <><Upload className="h-4 w-4 mr-1.5" /> Upload</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Leadership 1-on-1 Dialog ── */}
      <Dialog open={oneOnOneOpen} onOpenChange={(open) => { setOneOnOneOpen(open); if (!open) { setEditFeedbackId(null); resetFeedbackForm(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editFeedbackId ? "Edit 1-on-1 Notes" : "New Leadership 1-on-1"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Meeting Date *</Label>
                <Input type="date" value={feedbackForm.meetingDate} onChange={(e) => setFeedbackForm({ ...feedbackForm, meetingDate: e.target.value })} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Follow-up Date</Label>
                <Input type="date" value={feedbackForm.followUpDate} onChange={(e) => setFeedbackForm({ ...feedbackForm, followUpDate: e.target.value })} className="h-8 text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Overall Rating</Label>
              <div className="flex items-center gap-1 mt-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setFeedbackForm({ ...feedbackForm, rating: feedbackForm.rating === String(n) ? "" : String(n) })}
                    className="focus:outline-none"
                  >
                    <Star className={`h-6 w-6 transition-colors ${Number(feedbackForm.rating) >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30 hover:text-amber-300"}`} />
                  </button>
                ))}
                {feedbackForm.rating && <span className="text-xs text-muted-foreground ml-1">{feedbackForm.rating}/5</span>}
              </div>
            </div>
            <div>
              <Label className="text-xs">Meeting Summary *</Label>
              <Textarea rows={3} placeholder="What was discussed?" value={feedbackForm.summary} onChange={(e) => setFeedbackForm({ ...feedbackForm, summary: e.target.value })} className="text-sm" />
            </div>
            <div>
              <Label className="text-xs">Strengths</Label>
              <Textarea rows={2} placeholder="What is this agent doing well?" value={feedbackForm.strengths} onChange={(e) => setFeedbackForm({ ...feedbackForm, strengths: e.target.value })} className="text-sm" />
            </div>
            <div>
              <Label className="text-xs">Areas for Improvement</Label>
              <Textarea rows={2} placeholder="What can they improve?" value={feedbackForm.areasForImprovement} onChange={(e) => setFeedbackForm({ ...feedbackForm, areasForImprovement: e.target.value })} className="text-sm" />
            </div>
            <div>
              <Label className="text-xs">Goals / Action Items</Label>
              <Textarea rows={2} placeholder="What are the next steps or goals?" value={feedbackForm.goals} onChange={(e) => setFeedbackForm({ ...feedbackForm, goals: e.target.value })} className="text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isPrivate"
                checked={feedbackForm.isPrivate}
                onChange={(e) => setFeedbackForm({ ...feedbackForm, isPrivate: e.target.checked })}
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="isPrivate" className="text-xs cursor-pointer">Mark as private (admin eyes only)</Label>
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => { setOneOnOneOpen(false); setEditFeedbackId(null); resetFeedbackForm(); }}>Cancel</Button>
            <Button
              disabled={!feedbackForm.meetingDate || !feedbackForm.summary || createFeedback.isPending || updateFeedback.isPending}
              onClick={() => {
                if (!feedbackForm.meetingDate || !feedbackForm.summary) return;
                const payload = {
                  agentUserId: agentId,
                  meetingDate: feedbackForm.meetingDate,
                  summary: feedbackForm.summary,
                  strengths: feedbackForm.strengths || null,
                  areasForImprovement: feedbackForm.areasForImprovement || null,
                  goals: feedbackForm.goals || null,
                  followUpDate: feedbackForm.followUpDate || null,
                  rating: feedbackForm.rating ? parseInt(feedbackForm.rating) : null,
                  isPrivate: feedbackForm.isPrivate,
                };
                if (editFeedbackId) {
                  updateFeedback.mutate({ id: editFeedbackId, ...payload });
                } else {
                  createFeedback.mutate(payload);
                }
              }}
            >
              {(createFeedback.isPending || updateFeedback.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : editFeedbackId ? "Save Changes" : "Save Notes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Offboard / Start Process Dialog ── */}
      <Dialog open={offboardDialogOpen} onOpenChange={setOffboardDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start On/Offboarding Process</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select a template to start an onboarding or offboarding process for <strong>{agentData.name}</strong>.
            </p>

            {offboardingTemplates.length > 0 && (
              <div>
                <Label className="text-xs font-semibold text-red-600 uppercase tracking-wide">Offboarding Templates</Label>
                <div className="mt-2 space-y-2">
                  {offboardingTemplates.map((t) => (
                    <div
                      key={t.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedTemplateId === String(t.id)
                          ? "border-red-400 bg-red-50"
                          : "hover:border-red-200 hover:bg-red-50/50"
                      }`}
                      onClick={() => setSelectedTemplateId(String(t.id))}
                    >
                      <div className="flex items-center gap-2">
                        <LogOut className="h-4 w-4 text-red-500 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{t.name}</p>
                          <p className="text-xs text-muted-foreground">{Number(t.taskCount)} tasks</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {onboardingTemplates.length > 0 && (
              <div>
                <Label className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Onboarding Templates</Label>
                <div className="mt-2 space-y-2">
                  {onboardingTemplates.map((t) => (
                    <div
                      key={t.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedTemplateId === String(t.id)
                          ? "border-emerald-400 bg-emerald-50"
                          : "hover:border-emerald-200 hover:bg-emerald-50/50"
                      }`}
                      onClick={() => setSelectedTemplateId(String(t.id))}
                    >
                      <div className="flex items-center gap-2">
                        <LogIn className="h-4 w-4 text-emerald-500 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{t.name}</p>
                          <p className="text-xs text-muted-foreground">{Number(t.taskCount)} tasks</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {allTemplates && offboardingTemplates.length === 0 && onboardingTemplates.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No templates available. Create templates in On/Offboarding Lists first.</p>
              </div>
            )}

            {!allTemplates && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOffboardDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!selectedTemplateId || createInstanceMut.isPending}
              onClick={() => {
                if (!selectedTemplateId) return;
                createInstanceMut.mutate({
                  agentUserId: agentId,
                  templateId: parseInt(selectedTemplateId, 10),
                });
              }}
            >
              {createInstanceMut.isPending ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Starting...</>
              ) : (
                "Start Process"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Profile Dialog ── */}
      <Dialog open={editProfileOpen} onOpenChange={setEditProfileOpen}>
        <DialogContent className="max-w-lg w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Edit Profile — {agentData?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Full Name *</Label>
                <Input
                  className="mt-1"
                  value={editProfileForm.name}
                  onChange={(e) => setEditProfileForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <Label>Title</Label>
                <Input
                  className="mt-1"
                  value={editProfileForm.title}
                  onChange={(e) => setEditProfileForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Buyer's Agent"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input
                  className="mt-1"
                  type="email"
                  value={editProfileForm.email}
                  onChange={(e) => setEditProfileForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="jane@savvy.realty"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  className="mt-1"
                  value={editProfileForm.phone}
                  onChange={(e) => setEditProfileForm(f => ({ ...f, phone: formatPhone(e.target.value) }))}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>
            {agentData?.role === "agent" && (
              <div>
                <Label>Commission Split (%)</Label>
                <Input
                  className="mt-1"
                  type="number"
                  min={0}
                  max={100}
                  value={editProfileForm.commissionSplit}
                  onChange={(e) => setEditProfileForm(f => ({ ...f, commissionSplit: e.target.value }))}
                  placeholder="80"
                />
              </div>
            )}
            <div>
              <Label className="flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> Call Booking Link</Label>
              <Input
                className="mt-1"
                value={editProfileForm.callBookingLink}
                onChange={(e) => setEditProfileForm(f => ({ ...f, callBookingLink: e.target.value }))}
                placeholder="https://calendly.com/jane-smith"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProfileOpen(false)}>Cancel</Button>
            <Button
              disabled={updateUserMut.isPending}
              onClick={() => {
                if (!editProfileForm.name.trim()) { toast.error("Name is required."); return; }
                if (editProfileForm.email && !isValidEmail(editProfileForm.email)) { toast.error("Please enter a valid email address."); return; }
                if (editProfileForm.phone && !isValidPhone(editProfileForm.phone)) { toast.error("Please enter a valid phone number (9+ digits)."); return; }
                updateUserMut.mutate({
                  id: agentId,
                  name: editProfileForm.name.trim(),
                  title: editProfileForm.title.trim() || null,
                  email: editProfileForm.email.trim() || undefined,
                  phone: editProfileForm.phone.trim() || null,
                  commissionSplit: editProfileForm.commissionSplit ? parseInt(editProfileForm.commissionSplit, 10) : null,
                  callBookingLink: editProfileForm.callBookingLink.trim() || null,
                });
              }}
            >
              {updateUserMut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Request Connection Dialog ─────────────────────────────────────────── */}
      <Dialog open={reqConnOpen} onOpenChange={(o) => { if (!o) { setReqConnSearch(""); setReqConnSelectedContact(null); setReqConnPipelineStatus("new_lead"); } setReqConnOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-emerald-600" />
              Request Connection for {agentData?.name ?? "Agent"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Step 1: Search for a contact */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Search for a Lead / Contact</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Name, email, or phone…"
                  value={reqConnSearch}
                  onChange={(e) => { setReqConnSearch(e.target.value); setReqConnSelectedContact(null); }}
                />
              </div>
              {/* Search results */}
              {reqConnSearch.trim().length >= 2 && !reqConnSelectedContact && (
                <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                  {(reqConnResults as any[]).length === 0 ? (
                    <p className="text-sm text-muted-foreground px-3 py-2">No unconnected contacts found.</p>
                  ) : (
                    (reqConnResults as any[]).map((c: any) => (
                      <button
                        key={c.id}
                        className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                        onClick={() => { setReqConnSelectedContact(c); setReqConnSearch(`${c.firstName} ${c.lastName}`); }}
                      >
                        <p className="text-sm font-medium">{c.firstName} {c.lastName}</p>
                        <p className="text-xs text-muted-foreground">{c.email ?? c.phone ?? "No contact info"}</p>
                      </button>
                    ))
                  )}
                </div>
              )}
              {/* Selected contact chip */}
              {reqConnSelectedContact && (
                <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-md">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-emerald-800">{reqConnSelectedContact.firstName} {reqConnSelectedContact.lastName}</p>
                    <p className="text-xs text-emerald-600">{reqConnSelectedContact.email ?? reqConnSelectedContact.phone ?? "No contact info"}</p>
                  </div>
                  <button
                    className="text-emerald-500 hover:text-emerald-700 text-xs shrink-0"
                    onClick={() => { setReqConnSelectedContact(null); setReqConnSearch(""); }}
                  >
                    Change
                  </button>
                </div>
              )}
            </div>

            {/* Step 2: Pipeline status */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Requested Pipeline Stage</Label>
              <Select value={reqConnPipelineStatus} onValueChange={setReqConnPipelineStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_lead">New Lead</SelectItem>
                  <SelectItem value="attempted_contact">Attempted Contact</SelectItem>
                  <SelectItem value="nurture">Nurture</SelectItem>
                  <SelectItem value="active_client">Active Client</SelectItem>
                  <SelectItem value="under_contract">Under Contract</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">An admin or ISA will review and approve this request before the connection is created.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReqConnOpen(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!reqConnSelectedContact || requestConnMut.isPending}
              onClick={() => {
                if (!reqConnSelectedContact) return;
                requestConnMut.mutate({
                  contactId: reqConnSelectedContact.id,
                  requestedPipelineStatus: reqConnPipelineStatus as any,
                });
              }}
            >
              {requestConnMut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting…</> : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
