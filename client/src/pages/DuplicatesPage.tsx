import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircle,
  CheckCircle2,
  GitMerge,
  RefreshCw,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Users,
  Phone,
  Mail,
  MapPin,
  Loader2,
  Link2,
  Heart,
} from "lucide-react";

type ContactSummary = {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  secondaryEmail: string | null;
  phone: string | null;
  secondaryPhone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type PairRow = {
  id: number;
  contactAId: number;
  contactBId: number;
  matchType: "email" | "phone" | "name_address" | "fuzzy_name";
  confidence: number;
  status: "pending" | "merged" | "dismissed";
  contactA: ContactSummary | null;
  contactB: ContactSummary | null;
};

const MATCH_LABELS: Record<string, string> = {
  email: "Same Email",
  phone: "Same Phone",
  name_address: "Same Name + Address",
  fuzzy_name: "Similar Name",
};

const MATCH_COLORS: Record<string, string> = {
  email: "bg-red-100 text-red-700 border-red-200",
  phone: "bg-orange-100 text-orange-700 border-orange-200",
  name_address: "bg-yellow-100 text-yellow-700 border-yellow-200",
  fuzzy_name: "bg-blue-100 text-blue-700 border-blue-200",
};

// Fields shown in the side-by-side comparison (excluding email which gets special treatment)
const COMPARE_FIELDS: Array<{ key: keyof ContactSummary; label: string }> = [
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
];

const RELATIONSHIP_TYPES = [
  { value: "spouse", label: "Spouse" },
  { value: "partner", label: "Partner" },
  { value: "business_partner", label: "Business Partner" },
  { value: "unknown_relationship", label: "Unknown Relationship" },
] as const;

function ContactCard({
  contact,
  label,
  isWinner,
  onSetWinner,
}: {
  contact: ContactSummary;
  label: string;
  isWinner: boolean;
  onSetWinner: () => void;
}) {
  return (
    <div
      className={`rounded-lg border-2 p-3 transition-all cursor-pointer min-w-0 ${
        isWinner ? "border-green-500 bg-green-50" : "border-border bg-card hover:border-muted-foreground"
      }`}
      onClick={onSetWinner}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
        {isWinner && (
          <Badge className="bg-green-600 text-white text-xs">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Keep
          </Badge>
        )}
      </div>
      <div className="font-semibold text-sm mb-2 truncate">
        {contact.firstName} {contact.lastName}
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        {contact.email && (
          <div className="flex items-center gap-1.5">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{contact.email}</span>
          </div>
        )}
        {contact.secondaryEmail && (
          <div className="flex items-center gap-1.5">
            <Mail className="h-3 w-3 shrink-0 opacity-50" />
            <span className="truncate text-muted-foreground/70">{contact.secondaryEmail}</span>
          </div>
        )}
        {contact.phone && (
          <div className="flex items-center gap-1.5">
            <Phone className="h-3 w-3 shrink-0" />
            <span>{contact.phone}</span>
          </div>
        )}
        {(contact.address || contact.city) && (
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {[contact.address, contact.city, contact.state].filter(Boolean).join(", ")}
            </span>
          </div>
        )}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        ID #{contact.id} · Updated {new Date(contact.updatedAt).toLocaleDateString()}
      </div>
    </div>
  );
}

function MergeDialog({
  pair,
  onClose,
  onMerged,
}: {
  pair: PairRow;
  onClose: () => void;
  onMerged: () => void;
}) {
  const utils = trpc.useUtils();

  const [winnerId, setWinnerId] = useState<number>(pair.contactAId);
  const loserId = winnerId === pair.contactAId ? pair.contactBId : pair.contactAId;
  const winner = winnerId === pair.contactAId ? pair.contactA : pair.contactB;
  const loser = loserId === pair.contactAId ? pair.contactA : pair.contactB;

  // Field-level overrides: key → "winner" | "loser"
  const [fieldChoices, setFieldChoices] = useState<Record<string, "winner" | "loser">>({});

  // Multiple email retention: user selects which emails to keep
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());

  // Relationship linking mode
  const [linkMode, setLinkMode] = useState(false);
  const [relationshipType, setRelationshipType] = useState<string>("spouse");

  // Collect all unique emails from both contacts
  const allEmails: Array<{ value: string; source: string }> = [];
  if (winner?.email) allEmails.push({ value: winner.email, source: `${winner.firstName} (primary)` });
  if (winner?.secondaryEmail) allEmails.push({ value: winner.secondaryEmail, source: `${winner.firstName} (secondary)` });
  if (loser?.email) allEmails.push({ value: loser.email, source: `${loser.firstName} (primary)` });
  if (loser?.secondaryEmail) allEmails.push({ value: loser.secondaryEmail, source: `${loser.firstName} (secondary)` });
  // Deduplicate
  const uniqueEmails = allEmails.filter(
    (e, i, arr) => arr.findIndex((x) => x.value.toLowerCase() === e.value.toLowerCase()) === i
  );

  // Initialize selected emails with the winner's primary email
  useEffect(() => {
    if (winner?.email && selectedEmails.size === 0) {
      setSelectedEmails(new Set([winner.email]));
    }
  }, [winner?.email]);

  const mergeMutation = trpc.duplicates.merge.useMutation({
    onSuccess: () => {
      toast.success("Contacts merged — the duplicate has been consolidated.");
      utils.duplicates.listPairs.invalidate();
      utils.duplicates.getStats.invalidate();
      onMerged();
    },
    onError: (err) => {
      toast.error(`Merge failed: ${err.message}`);
    },
  });

  const linkMutation = trpc.duplicates.linkAsRelationship.useMutation({
    onSuccess: (data) => {
      const typeLabel = RELATIONSHIP_TYPES.find((t) => t.value === data.relationshipType)?.label ?? data.relationshipType;
      toast.success(`Contacts linked as "${typeLabel}" — pair resolved.`);
      utils.duplicates.listPairs.invalidate();
      utils.duplicates.getStats.invalidate();
      onMerged();
    },
    onError: (err) => {
      toast.error(`Link failed: ${err.message}`);
    },
  });

  function buildOverrides() {
    const overrides: Record<string, string | number | null> = {};
    for (const [field, choice] of Object.entries(fieldChoices)) {
      if (choice === "loser" && loser) {
        overrides[field] = (loser as Record<string, unknown>)[field] as string | number | null;
      }
    }
    return overrides;
  }

  function handleMerge() {
    // Build retainEmails from selected emails
    const retainEmails: Array<{ field: "email" | "secondaryEmail"; value: string }> = [];
    const emailsArr = Array.from(selectedEmails);
    if (emailsArr.length > 0) {
      retainEmails.push({ field: "email", value: emailsArr[0] });
    }
    if (emailsArr.length > 1) {
      retainEmails.push({ field: "secondaryEmail", value: emailsArr[1] });
    }

    mergeMutation.mutate({
      pairId: pair.id,
      winnerId,
      loserId,
      fieldOverrides: buildOverrides(),
      retainEmails: retainEmails.length > 0 ? retainEmails : undefined,
    });
  }

  function handleLink() {
    if (!pair.contactA || !pair.contactB) return;
    linkMutation.mutate({
      pairId: pair.id,
      contactAId: pair.contactAId,
      contactBId: pair.contactBId,
      relationshipType: relationshipType as "spouse" | "partner" | "business_partner" | "unknown_relationship",
    });
  }

  function toggleEmail(email: string) {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) {
        next.delete(email);
      } else {
        // Max 2 emails (primary + secondary)
        if (next.size >= 2) {
          toast.error("Maximum 2 emails can be retained (primary + secondary).");
          return prev;
        }
        next.add(email);
      }
      return next;
    });
  }

  if (!winner || !loser) return null;

  // Detect conflicting fields (excluding email which is handled separately)
  const conflicts = COMPARE_FIELDS.filter(({ key }) => {
    const wv = winner[key];
    const lv = loser[key];
    return wv && lv && wv !== lv;
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl w-[calc(100vw-2rem)] max-h-[90vh] flex flex-col overflow-hidden p-0">
        <div className="flex-shrink-0 p-6 pb-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-primary" />
              Review & Merge Duplicate Contacts
            </DialogTitle>
            <DialogDescription>
              Click a contact card to select which record to keep, or link them as a relationship instead.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
          {/* Mode toggle: Merge vs Link */}
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border">
            <Button
              variant={!linkMode ? "default" : "ghost"}
              size="sm"
              onClick={() => setLinkMode(false)}
              className="flex-1"
            >
              <GitMerge className="h-3.5 w-3.5 mr-1.5" />
              Merge Contacts
            </Button>
            <Button
              variant={linkMode ? "default" : "ghost"}
              size="sm"
              onClick={() => setLinkMode(true)}
              className="flex-1"
            >
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              Link as Relationship
            </Button>
          </div>

          {/* Side-by-side cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ContactCard
              contact={pair.contactA!}
              label="Contact A"
              isWinner={!linkMode && winnerId === pair.contactAId}
              onSetWinner={() => { if (!linkMode) setWinnerId(pair.contactAId); }}
            />
            <ContactCard
              contact={pair.contactB!}
              label="Contact B"
              isWinner={!linkMode && winnerId === pair.contactBId}
              onSetWinner={() => { if (!linkMode) setWinnerId(pair.contactBId); }}
            />
          </div>

          {/* ─── LINK MODE ─────────────────────────────────────────────────────── */}
          {linkMode && (
            <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Heart className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-900">Link as Relationship</span>
              </div>
              <p className="text-xs text-purple-700">
                Instead of merging, keep both contacts and link them with a relationship.
                The duplicate pair will be marked as resolved.
              </p>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium whitespace-nowrap">Relationship Type:</span>
                <Select value={relationshipType} onValueChange={setRelationshipType}>
                  <SelectTrigger className="w-full max-w-[220px] bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_TYPES.map((rt) => (
                      <SelectItem key={rt.value} value={rt.value}>
                        {rt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* ─── MERGE MODE ────────────────────────────────────────────────────── */}
          {!linkMode && (
            <>
              {/* Multiple Email Retention */}
              {uniqueEmails.length > 0 && (
                <div className="rounded-lg border p-3 bg-muted/30">
                  <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                    <Mail className="h-4 w-4 text-blue-500" />
                    Select emails to retain (max 2):
                  </p>
                  <div className="space-y-1.5">
                    {uniqueEmails.map(({ value, source }) => {
                      const isSelected = selectedEmails.has(value);
                      return (
                        <label
                          key={value}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-all text-sm ${
                            isSelected
                              ? "border-blue-500 bg-blue-50 font-medium"
                              : "border-border hover:border-muted-foreground bg-background"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleEmail(value)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="truncate flex-1">{value}</span>
                          <span className="text-xs text-muted-foreground shrink-0">({source})</span>
                        </label>
                      );
                    })}
                  </div>
                  {selectedEmails.size > 1 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      First selected = Primary email, Second = Secondary email on the merged record.
                    </p>
                  )}
                </div>
              )}

              {/* Conflict resolution */}
              {conflicts.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    Conflicting fields — choose which value to keep:
                  </p>
                  <div className="space-y-2">
                    {conflicts.map(({ key, label }) => {
                      const winnerVal = String(winner[key] ?? "");
                      const loserVal = String(loser[key] ?? "");
                      const choice = fieldChoices[key] ?? "winner";
                      return (
                        <div key={key} className="flex items-center gap-3 rounded-md border p-2.5 bg-muted/30">
                          <span className="text-xs font-medium w-16 shrink-0">{label}</span>
                          <div className="flex-1 grid grid-cols-2 gap-2 text-xs min-w-0">
                            <button
                              onClick={() => setFieldChoices((p) => ({ ...p, [key]: "winner" }))}
                              className={`text-left px-2 py-1.5 rounded border transition-all truncate ${
                                choice === "winner"
                                  ? "border-green-500 bg-green-50 font-medium"
                                  : "border-border hover:border-muted-foreground"
                              }`}
                              title={winnerVal}
                            >
                              {winnerVal}
                            </button>
                            <button
                              onClick={() => setFieldChoices((p) => ({ ...p, [key]: "loser" }))}
                              className={`text-left px-2 py-1.5 rounded border transition-all truncate ${
                                choice === "loser"
                                  ? "border-green-500 bg-green-50 font-medium"
                                  : "border-border hover:border-muted-foreground"
                              }`}
                              title={loserVal}
                            >
                              {loserVal}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Fixed footer */}
        <div className="flex-shrink-0 border-t p-4 bg-background">
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            {linkMode ? (
              <Button
                onClick={handleLink}
                disabled={linkMutation.isPending}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {linkMutation.isPending ? "Linking…" : "Link as Relationship"}
              </Button>
            ) : (
              <Button
                onClick={handleMerge}
                disabled={mergeMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {mergeMutation.isPending ? "Merging…" : "Confirm Merge"}
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PairRowComponent({
  pair,
  onMerge,
  onDismiss,
}: {
  pair: PairRow;
  onMerge: (pair: PairRow) => void;
  onDismiss: (pairId: number) => void;
}) {
  const a = pair.contactA;
  const b = pair.contactB;

  return (
    <div className="rounded-lg border bg-card p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge variant="outline" className={`text-xs ${MATCH_COLORS[pair.matchType]}`}>
              {MATCH_LABELS[pair.matchType]}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {pair.confidence}% confidence
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="font-medium text-sm">
                {a?.firstName} {a?.lastName}
              </p>
              <p className="text-xs text-muted-foreground truncate">{a?.email ?? "—"}</p>
              <p className="text-xs text-muted-foreground">{a?.phone ?? "—"}</p>
            </div>
            <div>
              <p className="font-medium text-sm">
                {b?.firstName} {b?.lastName}
              </p>
              <p className="text-xs text-muted-foreground truncate">{b?.email ?? "—"}</p>
              <p className="text-xs text-muted-foreground">{b?.phone ?? "—"}</p>
            </div>
          </div>
        </div>
        {pair.status === "pending" && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => onDismiss(pair.id)}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Not a Dup
            </Button>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => onMerge(pair)}
            >
              <GitMerge className="h-3.5 w-3.5 mr-1" />
              Merge
            </Button>
          </div>
        )}
        {pair.status === "merged" && (
          <Badge className="bg-green-100 text-green-700 border-green-200 shrink-0">Merged</Badge>
        )}
        {pair.status === "dismissed" && (
          <Badge variant="outline" className="text-muted-foreground shrink-0">Dismissed</Badge>
        )}
      </div>
    </div>
  );
}

export default function DuplicatesPage() {
  const utils = trpc.useUtils();

  const [statusFilter, setStatusFilter] = useState<"pending" | "merged" | "dismissed" | "all">("pending");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const [mergeTarget, setMergeTarget] = useState<PairRow | null>(null);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);

  const statsQuery = trpc.duplicates.getStats.useQuery();
  const pairsQuery = trpc.duplicates.listPairs.useQuery({
    status: statusFilter,
    page,
    pageSize: PAGE_SIZE,
  });

  // Poll the latest scan job on mount to resume tracking if a job is running
  const latestJobQuery = trpc.duplicates.getLatestScanJob.useQuery(undefined, {
    refetchInterval: activeJobId ? false : 0,
  });
  useEffect(() => {
    const job = latestJobQuery.data as any;
    if (job && job.status === "running" && !activeJobId) {
      setActiveJobId(job.id);
    }
  }, [latestJobQuery.data]);

  // Poll the active job for progress
  const jobStatusQuery = trpc.duplicates.getScanJob.useQuery(
    { jobId: activeJobId! },
    {
      enabled: activeJobId !== null,
      refetchInterval: (data: any) => {
        if (!data) return 2000;
        if ((data as any)?.status === "running") return 2000;
        return false;
      },
    }
  );
  useEffect(() => {
    const job = jobStatusQuery.data as any;
    if (!job) return;
    if (job.status === "completed") {
      toast.success(`Scan complete — ${job.detected} pairs detected, ${job.inserted} new pairs added.`);
      utils.duplicates.listPairs.invalidate();
      utils.duplicates.getStats.invalidate();
    } else if (job.status === "failed") {
      toast.error(`Scan failed: ${job.errorMessage ?? "Unknown error"}`);
    }
  }, [(jobStatusQuery.data as any)?.status]);

  const activeJob = jobStatusQuery.data as any;
  const isScanning = activeJob?.status === "running";

  const scanMutation = trpc.duplicates.scan.useMutation({
    onSuccess: (data: any) => {
      if (data.alreadyRunning) {
        toast.info("A scan is already running — tracking progress below.");
      } else {
        toast.success("Scan started in the background — tracking progress below.");
      }
      setActiveJobId(data.jobId);
    },
    onError: (err) => {
      toast.error(`Scan failed to start: ${err.message}`);
    },
  });

  const dismissMutation = trpc.duplicates.dismiss.useMutation({
    onSuccess: () => {
      toast.success("Pair dismissed — marked as not a duplicate.");
      utils.duplicates.listPairs.invalidate();
      utils.duplicates.getStats.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const stats = statsQuery.data;
  const pairs = (pairsQuery.data?.pairs ?? []) as PairRow[];
  const total = pairsQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function handleTabChange(val: string) {
    setStatusFilter(val as typeof statusFilter);
    setPage(1);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Duplicate Contacts
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Identify and merge duplicate contact records across the database.
          </p>
        </div>
        <Button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending || isScanning}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${(scanMutation.isPending || isScanning) ? "animate-spin" : ""}`} />
          {isScanning ? "Scanning…" : scanMutation.isPending ? "Starting…" : "Run Scan"}
        </Button>
      </div>

      {/* Scan Progress */}
      {activeJob && (activeJob.status === "running" || activeJob.status === "completed" || activeJob.status === "failed") && (
        <div className={`rounded-lg border p-4 mb-6 ${
          activeJob.status === "running" ? "bg-blue-50 border-blue-200" :
          activeJob.status === "completed" ? "bg-green-50 border-green-200" :
          "bg-red-50 border-red-200"
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {activeJob.status === "running" ? (
                <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
              ) : activeJob.status === "completed" ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600" />
              )}
              <span className="text-sm font-medium">
                {activeJob.status === "running" ? "Scan in progress…" :
                 activeJob.status === "completed" ? "Scan complete" :
                 "Scan failed"}
              </span>
              <span className="text-xs text-muted-foreground capitalize">
                Phase: {activeJob.phase?.replace(/_/g, " ")}
              </span>
            </div>
            {activeJob.status !== "running" && (
              <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setActiveJobId(null)}>Dismiss</button>
            )}
          </div>
          {activeJob.total > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{activeJob.processed.toLocaleString()} / {activeJob.total.toLocaleString()} contacts processed</span>
                <span>{Math.round((activeJob.processed / activeJob.total) * 100)}%</span>
              </div>
              <div className="w-full bg-white/60 rounded-full h-2 border">
                <div
                  className={`h-2 rounded-full transition-all ${
                    activeJob.status === "completed" ? "bg-green-500" :
                    activeJob.status === "failed" ? "bg-red-500" :
                    "bg-blue-500"
                  }`}
                  style={{ width: `${Math.round((activeJob.processed / activeJob.total) * 100)}%` }}
                />
              </div>
            </div>
          )}
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
            <span>{activeJob.detected} pairs detected</span>
            <span>{activeJob.inserted} new pairs inserted</span>
            {activeJob.errorMessage && activeJob.status !== "failed" && (
              <span className="text-amber-600">{activeJob.errorMessage}</span>
            )}
          </div>
          {activeJob.status === "failed" && activeJob.errorMessage && (
            <p className="text-xs text-red-600 mt-1">{activeJob.errorMessage}</p>
          )}
        </div>
      )}

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Pairs</p>
              <p className="text-2xl font-bold mt-1">{stats.total}</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-amber-600 uppercase tracking-wide">Pending Review</p>
              <p className="text-2xl font-bold mt-1 text-amber-700">{stats.pending}</p>
            </CardContent>
          </Card>
          <Card className="border-green-200">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-green-600 uppercase tracking-wide">Merged</p>
              <p className="text-2xl font-bold mt-1 text-green-700">{stats.merged}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Dismissed</p>
              <p className="text-2xl font-bold mt-1">{stats.dismissed}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={statusFilter} onValueChange={handleTabChange}>
        <TabsList className="mb-4">
          <TabsTrigger value="pending">
            Pending {stats?.pending ? `(${stats.pending})` : ""}
          </TabsTrigger>
          <TabsTrigger value="merged">Merged</TabsTrigger>
          <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={statusFilter}>
          {pairsQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : pairs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No {statusFilter === "all" ? "" : statusFilter} pairs found</p>
              {statusFilter === "pending" && (
                <p className="text-sm mt-1">
                  Click <strong>Run Scan</strong> to detect duplicates across the contact database.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {pairs.map((pair) => (
                <PairRowComponent
                  key={pair.id}
                  pair={pair}
                  onMerge={setMergeTarget}
                  onDismiss={(id) => dismissMutation.mutate({ pairId: id })}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Merge dialog */}
      {mergeTarget && (
        <MergeDialog
          pair={mergeTarget}
          onClose={() => setMergeTarget(null)}
          onMerged={() => setMergeTarget(null)}
        />
      )}
    </div>
  );
}
