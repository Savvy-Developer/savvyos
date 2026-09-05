import { CheckCircle2, ExternalLink, ListFilter, Loader2, PhoneCall, Plus, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type RecordDrilldownItem = {
  recordId: number;
  recordType: "call" | "contact";
  contactId: number;
  contactName: string;
  leadSourceName: string;
  agentName: string;
  occurredAt?: string | null;
  lastCallAt?: string | null;
  direction?: string;
  duration?: number;
  hasTranscript?: boolean;
  calls?: number;
  transcriptCalls?: number;
  intentTier?: string;
  intentScore?: number;
  appointmentSet?: boolean;
  firstContractAt?: string | null;
  firstCloseAt?: string | null;
  closedGci?: number;
  recordedSavvyNet?: number;
  nextBestAction?: string;
  hasOpenTask?: boolean;
  firstCallSpeedHours?: number | null;
};

function integer(value: number | null | undefined): string {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number).toLocaleString() : "—";
}

function title(value: string | null | undefined): string {
  return (value ?? "Unknown").replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

export function RecordDrilldownDialog({
  open,
  onOpenChange,
  data,
  isLoading,
  error,
  onPreviousPage,
  onNextPage,
  onOpenContact,
  onOpenRecord,
  onCreateTask,
  onResolveReview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data?: { title: string; description: string; recordNoun: string; total: number; page: number; limit: number; records: RecordDrilldownItem[] };
  isLoading: boolean;
  error?: string | null;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onOpenContact: (contactId: number) => void;
  onOpenRecord?: (record: RecordDrilldownItem) => void;
  onCreateTask?: (record: RecordDrilldownItem) => void;
  onResolveReview?: (record: RecordDrilldownItem) => void;
}) {
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const hasCalls = data?.records.some(record => record.recordType === "call");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-6xl overflow-hidden p-0">
        <DialogHeader className="border-b px-5 pb-4 pt-5 pr-12">
          <DialogTitle className="flex items-center gap-2 text-base"><ListFilter className="h-4 w-4 text-primary" />{data?.title ?? "Underlying records"}</DialogTitle>
          <DialogDescription>{data?.description ?? "Loading the scoped SavvyOS records behind this metric."}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-auto px-5 py-4">
          {isLoading ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading underlying records…</div>
            : error ? <div className="rounded-lg border border-destructive/35 bg-destructive/5 p-4 text-sm"><p className="font-semibold">Records could not load</p><p className="mt-1 text-muted-foreground">{error}</p></div>
            : !data?.records.length ? <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No underlying records match the active report filters.</div>
            : <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[920px] text-sm"><thead className="sticky top-0 z-10 bg-muted/95 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-3">{hasCalls ? "Contact / call" : "Contact"}</th><th className="px-3 py-3">Current context</th><th className="px-3 py-3">Evidence / outcome</th><th className="px-3 py-3">Recommended next step</th><th className="px-3 py-3 text-right">Action</th></tr></thead><tbody>{data.records.map(record => <tr key={`${record.recordType}-${record.recordId}`} className="border-t align-top hover:bg-muted/20"><td className="px-3 py-3">{record.contactId ? <button type="button" onClick={() => onOpenContact(record.contactId)} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">{record.contactName}<ExternalLink className="h-3.5 w-3.5" /></button> : <p className="font-semibold">{record.contactName}</p>}<p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">{record.recordType === "call" ? <PhoneCall className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}{record.recordType === "call" ? `${title(record.direction)} · ${integer(record.duration)}s · ${record.occurredAt ?? "—"}` : `${integer(record.calls)} calls · ${integer(record.transcriptCalls)} transcript${record.transcriptCalls === 1 ? "" : "s"} · last call ${record.lastCallAt ?? "—"}`}</p></td><td className="px-3 py-3"><p>{record.agentName}</p><p className="mt-1 text-xs text-muted-foreground">{record.leadSourceName}</p>{record.intentTier && <Badge className="mt-2" variant={record.intentTier === "priority" ? "default" : "outline"}>{title(record.intentTier)} · {integer(record.intentScore)}</Badge>}</td><td className="px-3 py-3 text-xs leading-5 text-muted-foreground">{record.recordType === "call" ? <span>{record.hasTranscript ? "Native transcript available" : "No native transcript"}</span> : <div className="space-y-1"><p>{record.appointmentSet ? "Recorded appointment" : "No recorded appointment"}</p>{record.firstContractAt && <p>Contract: {record.firstContractAt}</p>}{record.firstCloseAt && <p>Closed: {record.firstCloseAt}</p>}{record.firstCallSpeedHours !== null && record.firstCallSpeedHours !== undefined && <p>First call: {record.firstCallSpeedHours < 1 ? `${Math.round(record.firstCallSpeedHours * 60)}m` : `${record.firstCallSpeedHours.toFixed(1)}h`}</p>}</div>}</td><td className="max-w-[280px] px-3 py-3 text-sm leading-5">{record.nextBestAction || (record.hasOpenTask ? "Open task already exists; review its status before creating more work." : "Open the contact, review the evidence, and record one clear next action.")}</td><td className="px-3 py-3 text-right"><div className="flex justify-end gap-2">{record.recordType === "call" && onOpenRecord ? <Button size="sm" variant="outline" onClick={() => onOpenRecord(record)}>Details</Button> : record.contactId ? <Button size="sm" variant="outline" onClick={() => onOpenContact(record.contactId)}>Open</Button> : null}{onCreateTask && record.recordType === "contact" && !record.hasOpenTask && <Button size="sm" onClick={() => onCreateTask(record)}><Plus className="mr-1 h-3.5 w-3.5" />Task</Button>}{onResolveReview && record.recordType === "contact" && !record.hasOpenTask && <Button size="sm" variant="ghost" onClick={() => onResolveReview(record)} title="Mark reviewed until a new intelligence profile is generated"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Reviewed</Button>}</div></td></tr>)}</tbody></table></div>}
        </div>
        <DialogFooter className="border-t px-5 py-3 sm:justify-between"><p className="text-xs text-muted-foreground">{data ? `${integer(data.total)} ${data.recordNoun} · page ${data.page} of ${totalPages}` : ""}</p><div className="flex gap-2"><Button size="sm" variant="outline" onClick={onPreviousPage} disabled={isLoading || !data || data.page <= 1}>Previous</Button><Button size="sm" variant="outline" onClick={onNextPage} disabled={isLoading || !data || data.page >= totalPages}>Next</Button></div></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
