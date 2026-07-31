import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Loader2, ListChecks, Download, Filter, ChevronRight } from "lucide-react";
import { safeFormat } from "@/lib/safeFormat";

const STATUS_COLORS: Record<string, string> = {
  "AI Suggested": "bg-purple-100 text-purple-700",
  "Not Started": "bg-gray-100 text-gray-700",
  "In Progress": "bg-blue-100 text-blue-700",
  "Submitted for Verification": "bg-amber-100 text-amber-700",
  Completed: "bg-emerald-100 text-emerald-700",
  "Partially Completed": "bg-teal-100 text-teal-700",
  Missed: "bg-red-100 text-red-700",
  Waived: "bg-gray-100 text-gray-500",
  "No Longer Relevant": "bg-gray-100 text-gray-500",
};

export default function CoachingCommitmentsView() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState("active");

  const queryParams = useMemo(() => {
    const params: any = { limit: 200 };
    if (statusFilter === "active") { params.includeCompleted = false; }
    else if (statusFilter === "all") { params.includeCompleted = true; }
    else if (statusFilter === "overdue") { params.overdueOnly = true; }
    else if (statusFilter === "ai") { params.aiSuggestedOnly = true; }
    else { params.status = statusFilter; params.includeCompleted = true; }
    return params;
  }, [statusFilter]);

  const { data, isLoading } = trpc.coaching.listCommitments.useQuery(queryParams);
  const rows = (data as any)?.rows ?? (Array.isArray(data) ? data : []);
  const total = (data as any)?.total ?? rows.length;

  const overdueCount = rows.filter((r: any) => {
    const c = r.commitment ?? r;
    return c.dueDate && new Date(c.dueDate) < new Date() && !["Completed", "Waived", "No Longer Relevant"].includes(c.status);
  }).length;
  const aiSuggestedCount = rows.filter((r: any) => (r.commitment ?? r).status === "AI Suggested").length;
  const completedCount = rows.filter((r: any) => (r.commitment ?? r).status === "Completed").length;
  const missedCount = rows.filter((r: any) => (r.commitment ?? r).status === "Missed").length;
  const completionRate = (completedCount + missedCount) > 0 ? Math.round((completedCount / (completedCount + missedCount)) * 100) : 0;

  function exportCSV() {
    const headers = ["Agent", "Commitment", "Owner", "Due Date", "Status", "Source", "Created"];
    const csvRows = rows.map((r: any) => {
      const c = r.commitment ?? r;
      return [r.agentName ?? "", (c.description ?? "").replace(/,/g, ";"), c.ownerId === c.agentId ? "Agent" : "Coach", c.dueDate ? safeFormat(c.dueDate, "yyyy-MM-dd") : "", c.status, c.isAiExtracted ? "AI" : "Manual", c.createdAt ? safeFormat(c.createdAt, "yyyy-MM-dd") : ""];
    });
    const csv = [headers, ...csvRows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "coaching_commitments.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="cursor-pointer hover:border-primary/30" onClick={() => setStatusFilter("active")}>
          <CardContent className="p-3 text-center"><p className="text-xl font-bold">{total}</p><p className="text-[10px] text-muted-foreground">Total Active</p></CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/30" onClick={() => setStatusFilter("overdue")}>
          <CardContent className="p-3 text-center"><p className={`text-xl font-bold ${overdueCount > 0 ? "text-red-600" : ""}`}>{overdueCount}</p><p className="text-[10px] text-muted-foreground">Overdue</p></CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/30" onClick={() => setStatusFilter("ai")}>
          <CardContent className="p-3 text-center"><p className="text-xl font-bold text-purple-700">{aiSuggestedCount}</p><p className="text-[10px] text-muted-foreground">AI Suggested</p></CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center"><p className="text-xl font-bold text-emerald-700">{completionRate}%</p><p className="text-[10px] text-muted-foreground">Completion Rate</p></CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center"><p className={`text-xl font-bold ${missedCount > 0 ? "text-red-600" : ""}`}>{missedCount}</p><p className="text-[10px] text-muted-foreground">Missed</p></CardContent>
        </Card>
      </div>

      {/* Filters & Export */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active (Open)</SelectItem>
              <SelectItem value="overdue">Overdue Only</SelectItem>
              <SelectItem value="ai">AI Suggested</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="Submitted for Verification">Awaiting Verification</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
              <SelectItem value="Missed">Missed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" onClick={exportCSV}><Download className="h-3.5 w-3.5 mr-1" />Export CSV</Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground"><ListChecks className="h-8 w-8 mx-auto mb-2 opacity-40" /><p className="text-sm">No commitments match this filter</p></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-[10px] min-w-[130px]">Agent</TableHead>
                  <TableHead className="text-[10px] min-w-[240px]">Commitment</TableHead>
                  <TableHead className="text-[10px]">Owner</TableHead>
                  <TableHead className="text-[10px]">Due</TableHead>
                  <TableHead className="text-[10px]">Status</TableHead>
                  <TableHead className="text-[10px]">Source</TableHead>
                  <TableHead className="text-[10px]">Repeated</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow></TableHeader>
                <TableBody>{rows.map((row: any) => {
                  const c = row.commitment ?? row;
                  const isOverdue = c.dueDate && new Date(c.dueDate) < new Date() && !["Completed", "Waived", "No Longer Relevant"].includes(c.status);
                  return (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/coaching/agent/${c.agentId}`)}>
                      <TableCell className="text-xs font-medium">{row.agentName ?? "—"}</TableCell>
                      <TableCell className="text-xs max-w-[300px]"><span className="line-clamp-2">{c.description ?? "—"}</span></TableCell>
                      <TableCell className="text-xs">{c.ownerId === c.agentId ? "Agent" : "Coach"}</TableCell>
                      <TableCell className={`text-xs ${isOverdue ? "text-red-600 font-semibold" : ""}`}>{c.dueDate ? safeFormat(c.dueDate, "MMM d") : "—"}{isOverdue && " ⚠"}</TableCell>
                      <TableCell><Badge className={`text-[10px] ${STATUS_COLORS[c.status] ?? ""}`} variant="secondary">{c.status}</Badge></TableCell>
                      <TableCell className="text-xs">{c.isAiExtracted ? <Badge variant="secondary" className="text-[9px]">AI</Badge> : "Manual"}</TableCell>
                      <TableCell className="text-xs">{c.isRepeated ? <span className="text-red-600 font-semibold">{c.repeatCount}x</span> : "—"}</TableCell>
                      <TableCell><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></TableCell>
                    </TableRow>
                  );
                })}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
