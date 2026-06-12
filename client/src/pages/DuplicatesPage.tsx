import { useState } from "react";
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
} from "lucide-react";

type ContactSummary = {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
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

// Fields shown in the side-by-side comparison
const COMPARE_FIELDS: Array<{ key: keyof ContactSummary; label: string }> = [
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
];

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
      className={`rounded-lg border-2 p-4 transition-all cursor-pointer ${
        isWinner ? "border-green-500 bg-green-50" : "border-border bg-card hover:border-muted-foreground"
      }`}
      onClick={onSetWinner}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
        {isWinner && (
          <Badge className="bg-green-600 text-white text-xs">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Keep This
          </Badge>
        )}
      </div>
      <div className="font-semibold text-base mb-2">
        {contact.firstName} {contact.lastName}
      </div>
      <div className="space-y-1 text-sm text-muted-foreground">
        {contact.email && (
          <div className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{contact.email}</span>
          </div>
        )}
        {contact.phone && (
          <div className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span>{contact.phone}</span>
          </div>
        )}
        {(contact.address || contact.city) && (
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {[contact.address, contact.city, contact.state].filter(Boolean).join(", ")}
            </span>
          </div>
        )}
      </div>
      <div className="mt-3 text-xs text-muted-foreground">
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
    mergeMutation.mutate({
      pairId: pair.id,
      winnerId,
      loserId,
      fieldOverrides: buildOverrides(),
    });
  }

  if (!winner || !loser) return null;

  // Detect conflicting fields
  const conflicts = COMPARE_FIELDS.filter(({ key }) => {
    const wv = winner[key];
    const lv = loser[key];
    return wv && lv && wv !== lv;
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-primary" />
            Review & Merge Duplicate Contacts
          </DialogTitle>
          <DialogDescription>
            Click a contact card to select which record to keep. The other will be archived and all its data
            transferred to the kept record.
          </DialogDescription>
        </DialogHeader>

        {/* Side-by-side cards */}
        <div className="grid grid-cols-2 gap-4 mt-2">
          <ContactCard
            contact={winner}
            label="Contact A"
            isWinner={winnerId === winner.id}
            onSetWinner={() => setWinnerId(winner.id)}
          />
          <ContactCard
            contact={loser}
            label="Contact B"
            isWinner={winnerId === loser.id}
            onSetWinner={() => setWinnerId(loser.id)}
          />
        </div>

        {/* Conflict resolution */}
        {conflicts.length > 0 && (
          <div className="mt-4">
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
                  <div key={key} className="flex items-center gap-3 rounded-md border p-3 bg-muted/30">
                    <span className="text-sm font-medium w-20 shrink-0">{label}</span>
                    <div className="flex-1 grid grid-cols-2 gap-2 text-sm">
                      <button
                        onClick={() => setFieldChoices((p) => ({ ...p, [key]: "winner" }))}
                        className={`text-left px-2 py-1 rounded border transition-all ${
                          choice === "winner"
                            ? "border-green-500 bg-green-50 font-medium"
                            : "border-border hover:border-muted-foreground"
                        }`}
                      >
                        {winnerVal}
                      </button>
                      <button
                        onClick={() => setFieldChoices((p) => ({ ...p, [key]: "loser" }))}
                        className={`text-left px-2 py-1 rounded border transition-all ${
                          choice === "loser"
                            ? "border-green-500 bg-green-50 font-medium"
                            : "border-border hover:border-muted-foreground"
                        }`}
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

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleMerge}
            disabled={mergeMutation.isPending}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {mergeMutation.isPending ? "Merging…" : "Confirm Merge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PairRow({
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

  const statsQuery = trpc.duplicates.getStats.useQuery();
  const pairsQuery = trpc.duplicates.listPairs.useQuery({
    status: statusFilter,
    page,
    pageSize: PAGE_SIZE,
  });

  const scanMutation = trpc.duplicates.scan.useMutation({
    onSuccess: (data) => {
      toast.success(`Scan complete — ${data.detected} pairs detected, ${data.inserted} new pairs added for review.`);
      utils.duplicates.listPairs.invalidate();
      utils.duplicates.getStats.invalidate();
    },
    onError: (err) => {
      toast.error(`Scan failed: ${err.message}`);
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
          disabled={scanMutation.isPending}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${scanMutation.isPending ? "animate-spin" : ""}`} />
          {scanMutation.isPending ? "Scanning…" : "Run Scan"}
        </Button>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
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
                <PairRow
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
