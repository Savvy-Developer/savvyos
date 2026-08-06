import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPhone, formatEmail, formatStreet, formatCityStateZip } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, FileText, Home, User, DollarSign, Phone, Mail, Building2,
  History, Link2, UserCheck, TrendingUp, ClipboardList, Calendar,
  Trash2, Search, ArrowRightLeft, AlertTriangle,
} from "lucide-react";
import { useLocation, useParams, Link } from "wouter";
import { safeFormat } from "@/lib/safeFormat";
import { useAppBack } from "@/lib/navigationHistory";
import { useAuth } from "@/_core/hooks/useAuth";
import { useAgentContactNav } from "@/_core/hooks/useAgentContactNav";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const TX_STATUS_COLORS: Record<string, string> = {
  under_contract: "bg-blue-100 text-blue-700",
  closed: "bg-green-100 text-green-700",
  terminated: "bg-red-100 text-red-700",
  active: "bg-yellow-100 text-yellow-700",
};
const LISTING_STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  terminated: "bg-red-100 text-red-700",
  expired: "bg-yellow-100 text-yellow-700",
  converted: "bg-blue-100 text-blue-700",
};

const OUTCOME_COLORS: Record<string, string> = {
  green: "bg-green-100 text-green-700",
  blue: "bg-blue-100 text-blue-700",
  red: "bg-red-100 text-red-700",
  orange: "bg-orange-100 text-orange-700",
  gray: "bg-gray-100 text-gray-700",
};

function formatCurrency(val: string | number | null | undefined): string {
  if (!val) return "—";
  return `$${Number(val).toLocaleString()}`;
}

function formatDate(val: Date | string | null | undefined): string {
  if (!val) return "—";
  try { return safeFormat(val, "MMM d, yyyy"); } catch { return "—"; }
}

type HistoryEvent = {
  id: string;
  type: "contact_linked" | "contact_owner" | "transaction" | "listing" | "activity";
  date: Date | null;
  title: string;
  subtitle: string;
  outcome?: string;
  outcomeColor?: string;
  contactId?: number;
  transactionId?: number;
  listingId?: number;
  meta?: Record<string, string | number | null>;
};

function EventIcon({ type }: { type: HistoryEvent["type"] }) {
  const cls = "h-4 w-4";
  if (type === "contact_linked") return <Link2 className={cls} />;
  if (type === "contact_owner") return <UserCheck className={cls} />;
  if (type === "transaction") return <TrendingUp className={cls} />;
  if (type === "listing") return <Home className={cls} />;
  return <ClipboardList className={cls} />;
}

function EventDotColor(type: HistoryEvent["type"]): string {
  if (type === "contact_linked") return "bg-violet-500";
  if (type === "contact_owner") return "bg-indigo-500";
  if (type === "transaction") return "bg-emerald-500";
  if (type === "listing") return "bg-amber-500";
  return "bg-slate-400";
}

function HistoryTimeline({ events, isAgent = false, goToContact }: { events: HistoryEvent[]; isAgent?: boolean; goToContact?: (id: number) => void }) {
  const [, navigate] = useLocation();
  if (events.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        <History className="h-8 w-8 mx-auto mb-2 opacity-30" />
        No history recorded for this property yet.
      </div>
    );
  }
  return (
    <div className="relative pl-6 py-2">
      <div className="absolute left-[11px] top-4 bottom-4 w-0.5 bg-border" />
      <div className="space-y-4">
        {events.map((event) => {
          const content = (
            <div className="flex items-start gap-3 relative">
              <div className={`absolute -left-6 mt-1.5 h-3 w-3 rounded-full ring-2 ring-background ${EventDotColor(event.type)}`} />
              <div className="flex-1 min-w-0 bg-card border rounded-lg p-3 hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <EventIcon type={event.type} />
                    <span className="text-sm font-medium truncate">{event.title}</span>
                  </div>
                  {event.outcome && (
                    <Badge className={`shrink-0 text-[10px] ${OUTCOME_COLORS[event.outcomeColor ?? "gray"]}`}>
                      {event.outcome}
                    </Badge>
                  )}
                </div>
                {event.subtitle && <p className="text-xs text-muted-foreground ml-6">{event.subtitle}</p>}
                {event.meta && Object.entries(event.meta).some(([, v]) => v != null) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 ml-6 text-[11px] text-muted-foreground">
                    {Object.entries(event.meta).filter(([, v]) => v != null).map(([k, v]) => (
                      <span key={k}><span className="capitalize">{k.replace(/([A-Z])/g, " $1").trim()}</span>: {v}</span>
                    ))}
                  </div>
                )}
                {event.date && (
                  <p className="text-[10px] text-muted-foreground mt-1 ml-6 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {formatDate(event.date)}
                  </p>
                )}
              </div>
            </div>
          );
          if (event.transactionId) return <Link key={event.id} href={`/transactions/${event.transactionId}`}>{content}</Link>;
          if (event.listingId) return <Link key={event.id} href={`/listings/${event.listingId}`}>{content}</Link>;
          if (event.contactId) {
            if (isAgent && goToContact) return <div key={event.id} className="cursor-pointer" onClick={() => goToContact(event.contactId!)}>{content}</div>;
            return <Link key={event.id} href={`/contacts/${event.contactId}`}>{content}</Link>;
          }
          return <div key={event.id}>{content}</div>;
        })}
      </div>
    </div>
  );
}

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const goBack = useAppBack("/properties");
  const propId = parseInt(id ?? "0");
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isAgent = user?.role === "agent";
  const goToContact = useAgentContactNav();
  const utils = trpc.useUtils();

  const { data: property } = trpc.properties.get.useQuery({ id: propId });
  const { data: associations } = trpc.properties.getAssociations.useQuery(
    { propertyId: propId },
    { enabled: !!propId }
  );
  const { data: historyData, isLoading: historyLoading } = trpc.properties.getHistory.useQuery(
    { propertyId: propId },
    { enabled: !!propId }
  );
  const { data: proformasData } = trpc.properties.listProformas.useQuery(
    { propertyId: propId },
    { enabled: !!propId }
  );

  // Delete state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBlocked, setDeleteBlocked] = useState<{ linkedTransactions: number; linkedListings: number; linkedContacts: number } | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferSearch, setTransferSearch] = useState("");
  const [transferTargetId, setTransferTargetId] = useState<number | null>(null);
  const [transferTargetName, setTransferTargetName] = useState("");

  const { data: transferSearchResults = [] } = trpc.properties.list.useQuery(
    { search: transferSearch, limit: 10 },
    { enabled: transferSearch.length >= 2 }
  );
  const transferProperties = (transferSearchResults as any[])?.filter((p: any) => p.property.id !== propId) ?? [];

  const deleteMutation = trpc.properties.delete.useMutation({
    onSuccess: () => {
      toast.success("Property deleted");
      navigate("/properties");
    },
    onError: (e) => {
      try {
        const parsed = JSON.parse(e.message);
        if (parsed.type === "PROPERTY_HAS_LINKED_RECORDS") {
          setDeleteBlocked(parsed);
          return;
        }
      } catch {}
      toast.error(e.message);
    },
  });

  const transferMutation = trpc.properties.transferRecords.useMutation({
    onSuccess: () => {
      toast.success("Records transferred successfully");
      setTransferOpen(false);
      setDeleteBlocked(null);
      // Now try to delete again
      deleteMutation.mutate({ id: propId });
    },
    onError: (e) => toast.error(e.message),
  });

  const handleDelete = () => {
    setDeleteBlocked(null);
    deleteMutation.mutate({ id: propId });
  };

  const handleTransfer = () => {
    if (!transferTargetId) {
      toast.error("Please select a property to transfer records to");
      return;
    }
    transferMutation.mutate({ fromPropertyId: propId, toPropertyId: transferTargetId });
  };

  if (!property) return <div className="p-6 text-muted-foreground">Loading...</div>;

  const txList = associations?.transactions ?? [];
  const listingList = associations?.listings ?? [];
  const contactList = associations?.contacts ?? [];
  const historyEvents: HistoryEvent[] = (historyData?.events ?? []) as HistoryEvent[];
  const proformasList = proformasData ?? [];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={goBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </div>
      <PageHeader
        title={formatStreet(property.address)}
        subtitle={formatCityStateZip(property.city, property.state, property.zip)}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => navigate(`/properties/${propId}/proforma`)}>
              <FileText className="h-4 w-4 mr-1" /> Create Pro-forma
            </Button>
            {isAdmin && (
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => { setDeleteOpen(true); setDeleteBlocked(null); }}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            )}
          </div>
        }
      />

      <Tabs defaultValue="overview" className="mt-6">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">
            History
            {historyEvents.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">{historyEvents.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="proformas">
            Pro-formas
            {proformasList.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">{proformasList.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ─── Overview Tab ──────────────────────────────────────────────────── */}
        <TabsContent value="overview">
          {/* Top row: Details + Contacts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Property Details */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> Property Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span className="capitalize">{property.propertyType?.replace(/_/g, " ") ?? "—"}</span>
                </div>
                {property.beds != null && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Beds</span><span>{property.beds}</span></div>
                )}
                {property.baths != null && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Baths</span><span>{property.baths}</span></div>
                )}
                {property.sqft != null && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Sqft</span><span>{property.sqft.toLocaleString()}</span></div>
                )}
                {property.listPrice && (
                  <div className="flex justify-between"><span className="text-muted-foreground">List Price</span><span className="font-semibold text-emerald-700">{formatCurrency(property.listPrice)}</span></div>
                )}
                {property.yearBuilt && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Year Built</span><span>{property.yearBuilt}</span></div>
                )}
                {property.notes && (
                  <div className="pt-2 border-t mt-2">
                    <p className="text-muted-foreground text-xs mb-1">Notes</p>
                    <p className="text-sm">{property.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Associated Contacts */}
            <Card id="contacts" className="lg:col-span-2 scroll-mt-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <User className="h-4 w-4" /> Associated Contacts ({contactList.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {contactList.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No contacts linked to this property.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {contactList.map((c: any) => (
                      <div key={c.id} className="cursor-pointer" onClick={() => goToContact(c.id)}>
                        <div className="p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">{c.firstName} {c.lastName}</span>
                            {c.relationship && (
                              <Badge variant="outline" className="text-xs capitalize">{c.relationship}</Badge>
                            )}
                          </div>
                          <div className="space-y-0.5">
                            {c.email && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Mail className="h-3 w-3" /> {formatEmail(c.email)}
                              </div>
                            )}
                            {c.phone && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Phone className="h-3 w-3" /> {formatPhone(c.phone)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Bottom row: Transactions + Listings */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            {/* Transactions */}
            <Card id="transactions" className="scroll-mt-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Transactions ({txList.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {txList.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No transactions linked to this property.</p>
                ) : (
                  <div className="space-y-2">
                    {txList.map((row: any) => (
                      <Link key={row.transaction.id} href={`/transactions/${row.transaction.id}`}>
                        <div className="p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium capitalize truncate">
                                {row.transaction.transactionType ?? "Transaction"}
                              </p>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                                {row.agent?.name && <span className="flex items-center gap-1"><User className="h-3 w-3" />{row.agent.name}</span>}
                                {row.contact && <span>{row.contact.firstName} {row.contact.lastName}</span>}
                                {row.transaction.purchasePrice && <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{formatCurrency(row.transaction.purchasePrice)}</span>}
                                {row.transaction.closingDate && <span>Closed: {formatDate(row.transaction.closingDate)}</span>}
                              </div>
                            </div>
                            <Badge className={`ml-2 shrink-0 ${TX_STATUS_COLORS[row.transaction.status] ?? "bg-gray-100 text-gray-700"}`}>
                              {row.transaction.status?.replace(/_/g, " ")}
                            </Badge>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Listings */}
            <Card id="listings" className="scroll-mt-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Home className="h-4 w-4" /> Listings ({listingList.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {listingList.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No listings linked to this property.</p>
                ) : (
                  <div className="space-y-2">
                    {listingList.map((row: any) => (
                      <Link key={row.listing.id} href={`/listings/${row.listing.id}`}>
                        <div className="p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {row.listing.mlsNumber ? `MLS# ${row.listing.mlsNumber}` : `Listing #${row.listing.id}`}
                              </p>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                                {row.agent?.name && <span className="flex items-center gap-1"><User className="h-3 w-3" />{row.agent.name}</span>}
                                {row.contact && <span>{row.contact.firstName} {row.contact.lastName}</span>}
                                {row.listing.listPrice && <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{formatCurrency(row.listing.listPrice)}</span>}
                                {row.listing.listDate && <span>Listed: {formatDate(row.listing.listDate)}</span>}
                              </div>
                            </div>
                            <Badge className={`ml-2 shrink-0 ${LISTING_STATUS_COLORS[row.listing.listingStatus] ?? "bg-gray-100 text-gray-700"}`}>
                              {row.listing.listingStatus}
                            </Badge>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── History Tab ───────────────────────────────────────────────────── */}
        <TabsContent value="history">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <History className="h-4 w-4" /> Property Timeline
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                All contacts linked, transactions, listings, and system events — newest first.
              </p>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              {historyLoading ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Loading history…</div>
              ) : (
                <HistoryTimeline events={historyEvents} isAgent={isAgent} goToContact={goToContact} />
              )}
            </CardContent>
          </Card>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground px-1">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-violet-500 inline-block" /> Contact linked</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-indigo-500 inline-block" /> Owner record</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block" /> Transaction</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500 inline-block" /> Listing</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-400 inline-block" /> System event</span>
          </div>
        </TabsContent>
        {/* ─── Pro-formas Tab ─────────────────────────────────────────────────── */}
        <TabsContent value="proformas">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Pro-formas
                </CardTitle>
                <Button size="sm" onClick={() => navigate(`/properties/${id}/proforma`)}>
                  <TrendingUp className="h-3.5 w-3.5 mr-1" /> Create Pro-forma
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {isAgent ? "Pro-formas you have created for this property." : "All pro-formas created for this property by any user."}
              </p>
            </CardHeader>
            <CardContent>
              {proformasList.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No pro-formas created yet for this property.
                </div>
              ) : (
                <div className="space-y-2">
                  {proformasList.map((pf: any) => (
                    <div key={pf.id} className="flex items-center justify-between border rounded-lg p-3 hover:bg-slate-50 transition-colors">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{pf.title || "Untitled Pro-forma"}</span>
                          {pf.purchasePrice && <Badge variant="outline" className="text-xs">${Number(pf.purchasePrice).toLocaleString()}</Badge>}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><User className="h-3 w-3" />{pf.creatorName || "Unknown"}</span>
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(pf.createdAt)}</span>
                          {pf.updatedAt && pf.updatedAt !== pf.createdAt && (
                            <span>Updated: {formatDate(pf.updatedAt)}</span>
                          )}
                          {pf.cashOnCash && <span>CoC: {(Number(pf.cashOnCash) * 100).toFixed(1)}%</span>}
                          {pf.capRate && <span>Cap: {(Number(pf.capRate) * 100).toFixed(1)}%</span>}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/properties/${id}/proforma?load=${pf.id}`)}>
                        View
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Delete Confirmation Dialog ─────────────────────────────────────── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" /> Delete Property
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteBlocked ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-amber-800">Cannot delete — linked records exist</p>
                        <ul className="text-xs text-amber-700 mt-1 space-y-0.5">
                          {deleteBlocked.linkedTransactions > 0 && <li>{deleteBlocked.linkedTransactions} transaction{deleteBlocked.linkedTransactions !== 1 ? "s" : ""}</li>}
                          {deleteBlocked.linkedListings > 0 && <li>{deleteBlocked.linkedListings} listing{deleteBlocked.linkedListings !== 1 ? "s" : ""}</li>}
                          {deleteBlocked.linkedContacts > 0 && <li>{deleteBlocked.linkedContacts} linked contact{deleteBlocked.linkedContacts !== 1 ? "s" : ""}</li>}
                        </ul>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-foreground">Would you like to transfer these records to another property?</p>
                </div>
              ) : (
                <span>Are you sure you want to permanently delete this property? This action cannot be undone.</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteBlocked(null)}>Cancel</AlertDialogCancel>
            {deleteBlocked ? (
              <Button
                variant="default"
                onClick={() => {
                  setDeleteOpen(false);
                  setTransferOpen(true);
                  setTransferSearch("");
                  setTransferTargetId(null);
                  setTransferTargetName("");
                }}
              >
                <ArrowRightLeft className="h-4 w-4 mr-1.5" /> Transfer Records
              </Button>
            ) : (
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete Property"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Transfer Records Dialog ─────────────────────────────────────── */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" /> Transfer Records to Another Property
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              All transactions, listings, and contacts linked to this property will be transferred to the selected property. After transfer, this property will be deleted.
            </p>
            <div>
              <label className="text-sm font-medium">Search for target property</label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by address..."
                  value={transferSearch}
                  onChange={(e) => { setTransferSearch(e.target.value); setTransferTargetId(null); setTransferTargetName(""); }}
                  className="pl-9"
                />
              </div>
            </div>
            {transferTargetId && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-800">{transferTargetName}</p>
                  <p className="text-xs text-green-600">Selected as transfer target</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setTransferTargetId(null); setTransferTargetName(""); }}>Change</Button>
              </div>
            )}
            {!transferTargetId && transferSearch.length >= 2 && (
              <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                {transferProperties.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No matching properties found</p>
                ) : (
                  transferProperties.map((row: any) => (
                    <button
                      key={row.property.id}
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                      onClick={() => {
                        setTransferTargetId(row.property.id);
                        setTransferTargetName([row.property.address, row.property.city, row.property.state].filter(Boolean).join(", "));
                      }}
                    >
                      <p className="text-sm font-medium">{row.property.address}</p>
                      <p className="text-xs text-muted-foreground">{[row.property.city, row.property.state, row.property.zip].filter(Boolean).join(", ")}</p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button
              onClick={handleTransfer}
              disabled={!transferTargetId || transferMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {transferMutation.isPending ? "Transferring..." : "Transfer & Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
