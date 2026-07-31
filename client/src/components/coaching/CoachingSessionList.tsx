import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CalendarDays,
  ChevronRight,
  Loader2,
  Plus,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { safeFormat } from "@/lib/safeFormat";

const SESSION_STATUS_COLORS: Record<string, string> = {
  Scheduled: "bg-blue-100 text-blue-700",
  "In Progress": "bg-amber-100 text-amber-700",
  Completed: "bg-emerald-100 text-emerald-700",
  Cancelled: "bg-gray-100 text-gray-500",
  "No Show": "bg-red-100 text-red-700",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "Completed") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (status === "In Progress") return <Clock className="h-3.5 w-3.5" />;
  if (status === "No Show") return <AlertCircle className="h-3.5 w-3.5" />;
  return <CalendarDays className="h-3.5 w-3.5" />;
}

export default function CoachingSessionList({
  agentId,
  agentName,
}: {
  agentId: number;
  agentName?: string;
}) {
  const [, navigate] = useLocation();
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data, isLoading } = trpc.coaching.listSessions.useQuery({
    agentId,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const sessions = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          Coaching Sessions ({total})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <CalendarDays className="h-7 w-7 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No sessions yet</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Coach</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>AI Summary</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((row: any) => {
                  const s = row.session;
                  const coach = row.coach;
                  return (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/coaching/session/${s.id}`)}
                    >
                      <TableCell>
                        <span className="text-sm font-medium">
                          {s.sessionDate ? safeFormat(s.sessionDate, "MMM d, yyyy h:mm a") : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{s.sessionType}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{coach?.name ?? "—"}</span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-xs gap-1 ${SESSION_STATUS_COLORS[s.status] ?? "bg-gray-100 text-gray-600"}`}
                          variant="secondary"
                        >
                          <StatusIcon status={s.status} />
                          {s.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {s.aiSummary ? (
                          <span className="flex items-center gap-1 text-xs text-violet-600">
                            <Sparkles className="h-3 w-3" />
                            Generated
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {s.durationMinutes ? `${s.durationMinutes} min` : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-xs text-muted-foreground">
                  Page {page} of {totalPages} ({total} sessions)
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
