import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { Star, Users, CalendarDays, TrendingUp, ChevronRight, Search, Filter, MessageSquarePlus, Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-muted-foreground text-xs">No rating</span>;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} className={`h-3.5 w-3.5 ${s <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

export default function LeadershipDashboardPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [ratingFilter, setRatingFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Start 1-on-1 dialog state
  const [startOpen, setStartOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    agentUserId: "",
    meetingDate: new Date().toISOString().split("T")[0],
    summary: "",
    strengths: "",
    areasForImprovement: "",
    goals: "",
    followUpDate: "",
    rating: "",
    isPrivate: false,
  });
  const utils = trpc.useUtils();
  const createFeedback = trpc.leadership.create.useMutation({
    onSuccess: () => {
      utils.leadership.listAll.invalidate();
      setStartOpen(false);
      setNewForm({ agentUserId: "", meetingDate: new Date().toISOString().split("T")[0], summary: "", strengths: "", areasForImprovement: "", goals: "", followUpDate: "", rating: "", isPrivate: false });
      toast.success("1-on-1 notes saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: allData, isLoading } = trpc.leadership.listAll.useQuery({
    limit: 200,
    offset: 0,
  });

  const { data: agents } = trpc.users.list.useQuery({ role: "agent" });

  const rows = allData?.rows ?? [];

  // Summary stats
  const stats = useMemo(() => {
    const total = rows.length;
    const avgRating = rows.filter((r) => r.feedback.rating).length > 0
      ? rows.reduce((sum, r) => sum + (r.feedback.rating ?? 0), 0) / rows.filter((r) => r.feedback.rating).length
      : null;
    const uniqueAgents = new Set(rows.map((r) => r.feedback.agentUserId)).size;
    const thisMonth = rows.filter((r) => {
      const d = new Date(r.feedback.meetingDate ?? r.feedback.createdAt ?? 0);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    return { total, avgRating, uniqueAgents, thisMonth };
  }, [rows]);

  // Filtered rows
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (agentFilter !== "all" && String(r.feedback.agentUserId) !== agentFilter) return false;
      if (ratingFilter !== "all" && String(r.feedback.rating) !== ratingFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const agentName = r.agent?.name?.toLowerCase() ?? "";
        const summary = (r.feedback.summary ?? "").toLowerCase();
        const strengths = (r.feedback.strengths ?? "").toLowerCase();
        if (!agentName.includes(q) && !summary.includes(q) && !strengths.includes(q)) return false;
      }
      return true;
    });
  }, [rows, agentFilter, ratingFilter, search]);

  if (user?.role !== "admin") {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p>Access restricted to administrators.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Leadership Dashboard"
        subtitle="All 1-on-1 sessions across the team"
        actions={
          <Button onClick={() => setStartOpen(true)} className="gap-2">
            <MessageSquarePlus className="h-4 w-4" />
            Start 1-on-1
          </Button>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <CalendarDays className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Sessions</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
              <Star className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.avgRating ? stats.avgRating.toFixed(1) : "—"}</p>
              <p className="text-xs text-muted-foreground">Avg Rating</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.uniqueAgents}</p>
              <p className="text-xs text-muted-foreground">Agents Covered</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.thisMonth}</p>
              <p className="text-xs text-muted-foreground">This Month</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search agent, summary, strengths..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="All Agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                {(agents ?? []).map((a: any) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={ratingFilter} onValueChange={setRatingFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Any Rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Rating</SelectItem>
                {[5, 4, 3, 2, 1].map((r) => (
                  <SelectItem key={r} value={String(r)}>{r} Star{r !== 1 ? "s" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Sessions Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {filtered.length} Session{filtered.length !== 1 ? "s" : ""}
            {(agentFilter !== "all" || ratingFilter !== "all" || search) && (
              <span className="text-muted-foreground font-normal text-sm ml-2">(filtered)</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Loading sessions...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No sessions found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Agent</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Date</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Conducted By</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Rating</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Summary</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Follow-up</th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const meetingDate = row.feedback.meetingDate
                      ? format(new Date(row.feedback.meetingDate), "MMM d, yyyy")
                      : "—";
                    const followUpDate = row.feedback.followUpDate
                      ? format(new Date(row.feedback.followUpDate), "MMM d, yyyy")
                      : null;
                    const isOverdue = followUpDate && new Date(row.feedback.followUpDate!) < new Date();
                    return (
                      <tr key={row.feedback.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="py-3 px-4">
                          <button
                            className="font-medium hover:underline text-left"
                            onClick={() => navigate(`/agents/${row.feedback.agentUserId}`)}
                          >
                            {row.agent?.name ?? "Unknown"}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">{meetingDate}</td>
                        <td className="py-3 px-4 text-muted-foreground">{row.conductor?.name ?? "—"}</td>
                        <td className="py-3 px-4">
                          <StarRating rating={row.feedback.rating} />
                        </td>
                        <td className="py-3 px-4 max-w-[200px]">
                          <p className="truncate text-muted-foreground">{row.feedback.summary || "—"}</p>
                        </td>
                        <td className="py-3 px-4">
                          {followUpDate ? (
                            <Badge variant={isOverdue ? "destructive" : "outline"} className="text-xs">
                              {isOverdue ? "Overdue · " : ""}{followUpDate}
                            </Badge>
                          ) : "—"}
                        </td>
                        <td className="py-3 px-4">
                          <Button
                            size="sm" variant="ghost" className="h-7 px-2"
                            onClick={() => navigate(`/agents/${row.feedback.agentUserId}`)}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Start 1-on-1 Dialog */}
      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Start New 1-on-1</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Agent *</Label>
              <Select value={newForm.agentUserId} onValueChange={(v) => setNewForm({ ...newForm, agentUserId: v })}>
                <SelectTrigger className="h-8 text-sm mt-1">
                  <SelectValue placeholder="Select an agent..." />
                </SelectTrigger>
                <SelectContent>
                  {(agents ?? []).map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Meeting Date *</Label>
                <Input type="date" value={newForm.meetingDate} onChange={(e) => setNewForm({ ...newForm, meetingDate: e.target.value })} className="h-8 text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs">Follow-up Date</Label>
                <Input type="date" value={newForm.followUpDate} onChange={(e) => setNewForm({ ...newForm, followUpDate: e.target.value })} className="h-8 text-sm mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Overall Rating</Label>
              <div className="flex items-center gap-1 mt-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setNewForm({ ...newForm, rating: newForm.rating === String(n) ? "" : String(n) })} className="focus:outline-none">
                    <Star className={`h-6 w-6 transition-colors ${Number(newForm.rating) >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30 hover:text-amber-300"}`} />
                  </button>
                ))}
                {newForm.rating && <span className="text-xs text-muted-foreground ml-1">{newForm.rating}/5</span>}
              </div>
            </div>
            <div>
              <Label className="text-xs">Meeting Summary *</Label>
              <Textarea rows={3} placeholder="What was discussed?" value={newForm.summary} onChange={(e) => setNewForm({ ...newForm, summary: e.target.value })} className="text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Strengths</Label>
              <Textarea rows={2} placeholder="What is this agent doing well?" value={newForm.strengths} onChange={(e) => setNewForm({ ...newForm, strengths: e.target.value })} className="text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Areas for Improvement</Label>
              <Textarea rows={2} placeholder="What can they improve?" value={newForm.areasForImprovement} onChange={(e) => setNewForm({ ...newForm, areasForImprovement: e.target.value })} className="text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Goals / Action Items</Label>
              <Textarea rows={2} placeholder="What are the next steps or goals?" value={newForm.goals} onChange={(e) => setNewForm({ ...newForm, goals: e.target.value })} className="text-sm mt-1" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="ldPrivate" checked={newForm.isPrivate} onChange={(e) => setNewForm({ ...newForm, isPrivate: e.target.checked })} className="h-4 w-4 rounded border-border" />
              <Label htmlFor="ldPrivate" className="text-xs cursor-pointer">Mark as private (admin eyes only)</Label>
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setStartOpen(false)}>Cancel</Button>
            <Button
              disabled={!newForm.agentUserId || !newForm.meetingDate || !newForm.summary || createFeedback.isPending}
              onClick={() => {
                if (!newForm.agentUserId || !newForm.meetingDate || !newForm.summary) return;
                createFeedback.mutate({
                  agentUserId: parseInt(newForm.agentUserId),
                  meetingDate: newForm.meetingDate,
                  summary: newForm.summary,
                  strengths: newForm.strengths || null,
                  areasForImprovement: newForm.areasForImprovement || null,
                  goals: newForm.goals || null,
                  followUpDate: newForm.followUpDate || null,
                  rating: newForm.rating ? parseInt(newForm.rating) : null,
                  isPrivate: newForm.isPrivate,
                });
              }}
            >
              {createFeedback.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Notes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
