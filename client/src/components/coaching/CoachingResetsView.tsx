import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { ChevronRight, Loader2, AlertTriangle, Shield } from "lucide-react";
import { safeFormat } from "@/lib/safeFormat";

const RESET_STATUS_COLORS: Record<string, string> = {
  Active: "bg-red-100 text-red-800",
  Improving: "bg-amber-100 text-amber-800",
  "Extension Requested": "bg-orange-100 text-orange-800",
  "Completed Successfully": "bg-emerald-100 text-emerald-800",
  "Failed - Coach Out": "bg-red-200 text-red-900",
  "Failed - Terminated": "bg-red-200 text-red-900",
  Paused: "bg-slate-100 text-slate-700",
};

export default function CoachingResetsView() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("active");

  const { data, isLoading } = trpc.coaching.listResets.useQuery({
    status: statusFilter === "active" ? "Active" : statusFilter === "all" ? undefined : statusFilter,
  });

  const rows = (data as any)?.rows ?? (Array.isArray(data) ? data : []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          Performance Resets
        </h2>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="Improving">Improving</SelectItem>
            <SelectItem value="Extension Requested">Extension Requested</SelectItem>
            <SelectItem value="Completed Successfully">Completed</SelectItem>
            <SelectItem value="Failed - Coach Out">Failed</SelectItem>
            <SelectItem value="Paused">Paused</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No performance resets match this filter</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px] min-w-[140px]">Agent</TableHead>
                    <TableHead className="text-[11px]">Status</TableHead>
                    <TableHead className="text-[11px]">Diagnosis</TableHead>
                    <TableHead className="text-[11px]">Start Date</TableHead>
                    <TableHead className="text-[11px]">Target End</TableHead>
                    <TableHead className="text-[11px]">Days Remaining</TableHead>
                    <TableHead className="text-[11px]">Requirements</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row: any) => {
                    const r = row.reset ?? row;
                    const targetEnd = r.targetEndDate ? new Date(r.targetEndDate) : null;
                    const daysRemaining = targetEnd ? Math.ceil((targetEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                    return (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/coaching/agent/${r.agentId}`)}
                      >
                        <TableCell className="text-xs font-medium">{row.agentName ?? "—"}</TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] ${RESET_STATUS_COLORS[r.status] ?? ""}`} variant="secondary">
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.primaryDiagnosis ?? "—"}</TableCell>
                        <TableCell className="text-xs">{safeFormat(r.startDate, "MMM d, yyyy")}</TableCell>
                        <TableCell className="text-xs">{safeFormat(r.targetEndDate, "MMM d, yyyy")}</TableCell>
                        <TableCell className="text-xs">
                          {daysRemaining !== null ? (
                            <span className={daysRemaining <= 7 ? "text-red-600 font-medium" : daysRemaining <= 14 ? "text-amber-600" : ""}>
                              {daysRemaining > 0 ? `${daysRemaining}d` : "Overdue"}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.requirementsMet ?? 0}/{r.requirementsTotal ?? 0}
                        </TableCell>
                        <TableCell><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
