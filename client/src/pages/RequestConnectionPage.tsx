import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  GitMerge,
  Loader2,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { safeFormat } from "@/lib/safeFormat";

const PIPELINE_STATUS_LABELS: Record<string, string> = {
  new_lead: "New Lead",
  attempted_contact: "Attempted Contact",
  nurture: "Nurture",
  active_client: "Active Client",
  under_contract: "Under Contract",
  closed: "Closed",
};

const STATUS_BADGE: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  pending: { label: "Pending Review", className: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
  approved: { label: "Approved", className: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  denied: { label: "Denied", className: "bg-red-100 text-red-800 border-red-200", icon: XCircle },
};

export default function RequestConnectionPage() {
  const [search, setSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<{
    id: number; firstName: string; lastName: string; email: string | null; phone: string | null;
  } | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState("new_lead");
  const [submitted, setSubmitted] = useState(false);

  const { data: searchResults = [] } = trpc.contacts.searchForRequest.useQuery(
    { search },
    { enabled: search.trim().length >= 2 }
  );

  // My pending/recent connection requests
  const { data: myRequests = [], refetch: refetchRequests } = trpc.connectionRequests.myRequests.useQuery(
    undefined,
    { enabled: true }
  );

  const requestConnMut = trpc.connectionRequests.create.useMutation({
    onSuccess: () => {
      toast.success("Connection request submitted — an admin or ISA will review it shortly.");
      setSearch("");
      setSelectedContact(null);
      setPipelineStatus("new_lead");
      setSubmitted(true);
      refetchRequests();
      setTimeout(() => setSubmitted(false), 3000);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <GitMerge className="h-6 w-6 text-emerald-600" />
          Request a Lead Connection
        </h1>
        <p className="text-muted-foreground mt-1">
          Search for a contact in the CRM and request to have them added to your pipeline. An admin or ISA will review and approve the request.
        </p>
      </div>

      {/* Request Form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">New Connection Request</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Contact search */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Search for a Lead / Contact</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Type a name, email, or phone number…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSelectedContact(null); }}
              />
            </div>
            {/* Search results dropdown */}
            {search.trim().length >= 2 && !selectedContact && (
              <div className="border rounded-md divide-y max-h-56 overflow-y-auto shadow-sm">
                {(searchResults as any[]).length === 0 ? (
                  <p className="text-sm text-muted-foreground px-3 py-3 text-center">
                    No unconnected contacts found for "{search}".
                  </p>
                ) : (
                  (searchResults as any[]).map((c: any) => (
                    <button
                      key={c.id}
                      className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors"
                      onClick={() => { setSelectedContact(c); setSearch(`${c.firstName} ${c.lastName}`); }}
                    >
                      <p className="text-sm font-medium">{c.firstName} {c.lastName}</p>
                      <p className="text-xs text-muted-foreground">{c.email ?? c.phone ?? "No contact info"}</p>
                    </button>
                  ))
                )}
              </div>
            )}
            {/* Selected contact chip */}
            {selectedContact && (
              <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-md">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-emerald-800">{selectedContact.firstName} {selectedContact.lastName}</p>
                  <p className="text-xs text-emerald-600">{selectedContact.email ?? selectedContact.phone ?? "No contact info"}</p>
                </div>
                <button
                  className="text-xs text-emerald-600 hover:text-emerald-800 font-medium shrink-0"
                  onClick={() => { setSelectedContact(null); setSearch(""); }}
                >
                  Change
                </button>
              </div>
            )}
          </div>

          {/* Pipeline stage */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Requested Pipeline Stage</Label>
            <Select value={pipelineStatus} onValueChange={setPipelineStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PIPELINE_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              This is the pipeline stage you believe best fits this lead. The reviewing admin or ISA may adjust it.
            </p>
          </div>

          {/* Submit */}
          <div className="pt-2">
            {submitted ? (
              <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4" />
                Request submitted successfully!
              </div>
            ) : (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto"
                disabled={!selectedContact || requestConnMut.isPending}
                onClick={() => {
                  if (!selectedContact) return;
                  requestConnMut.mutate({
                    contactId: selectedContact.id,
                    requestedPipelineStatus: pipelineStatus as any,
                  });
                }}
              >
                {requestConnMut.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting…</>
                ) : (
                  <><GitMerge className="h-4 w-4 mr-2" />Submit Request</>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* My Recent Requests */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">My Connection Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {(myRequests as any[]).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              You haven't submitted any connection requests yet.
            </p>
          ) : (
            <div className="divide-y">
              {(myRequests as any[]).map((req: any) => {
                const statusInfo = STATUS_BADGE[req.status] ?? STATUS_BADGE.pending;
                const StatusIcon = statusInfo.icon;
                return (
                  <div key={req.id} className="py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {req.contact?.firstName} {req.contact?.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {req.contact?.email ?? req.contact?.phone ?? "No contact info"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Requested stage: <span className="font-medium">{PIPELINE_STATUS_LABELS[req.requestedPipelineStatus] ?? req.requestedPipelineStatus}</span>
                        {req.createdAt && (
                          <> · {safeFormat(req.createdAt, "MMM d, yyyy")}</>
                        )}
                      </p>
                      {req.status === "denied" && req.denialReason && (
                        <p className="text-xs text-red-600 mt-0.5">Reason: {req.denialReason}</p>
                      )}
                    </div>
                    <Badge className={`${statusInfo.className} border flex items-center gap-1 shrink-0`}>
                      <StatusIcon className="h-3 w-3" />
                      {statusInfo.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
