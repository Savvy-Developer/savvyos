import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPhone, formatEmail, formatStreet, formatCityStateZip } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";
import {
  ArrowLeft, FileText, Home, User, DollarSign, Phone, Mail, Building2,
  History, Link2, UserCheck, TrendingUp, ClipboardList, Calendar,
} from "lucide-react";
import { useLocation, useParams, Link } from "wouter";
import { safeFormat } from "@/lib/safeFormat";

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

function HistoryTimeline({ events }: { events: HistoryEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No history recorded yet for this property.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
      <div className="space-y-0">
        {events.map((event, idx) => {
          const isLast = idx === events.length - 1;
          const dotColor = EventDotColor(event.type);
          const eventDate = event.date ? new Date(event.date) : null;

          const content = (
            <div
              className={`relative pl-14 pr-4 py-4 ${!isLast ? "border-b border-border/50" : ""} ${
                (event.contactId || event.transactionId || event.listingId)
                  ? "hover:bg-muted/40 cursor-pointer transition-colors rounded-r-lg"
                  : ""
              }`}
            >
              {/* Dot on timeline */}
              <div className={`absolute left-3.5 top-5 h-3 w-3 rounded-full border-2 border-background ${dotColor} shadow-sm`} />
              {/* Icon */}
              <div className="absolute left-8 top-4 text-muted-foreground">
                <EventIcon type={event.type} />
              </div>

              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug">{event.title}</p>
                  {event.subtitle && (
                    <p className="text-xs text-muted-foreground mt-0.5">{event.subtitle}</p>
                  )}
                  {/* Meta details */}
                  {event.meta && Object.keys(event.meta).length > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
                      {Object.entries(event.meta).map(([k, v]) => {
                        if (!v) return null;
                        const label = k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());
                        return (
                          <span key={k} className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground/70">{label}:</span> {v}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {event.outcome && (
                    <Badge className={`text-xs ${OUTCOME_COLORS[event.outcomeColor ?? "gray"] ?? "bg-gray-100 text-gray-700"}`}>
                      {event.outcome}
                    </Badge>
                  )}
                  {eventDate && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(eventDate)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );

          // Wrap in Link if navigable
          if (event.transactionId) {
            return <Link key={event.id} href={`/transactions/${event.transactionId}`}>{content}</Link>;
          }
          if (event.listingId) {
            return <Link key={event.id} href={`/listings/${event.listingId}`}>{content}</Link>;
          }
          if (event.contactId) {
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
  const propId = parseInt(id ?? "0");

  const { data: property } = trpc.properties.get.useQuery({ id: propId });
  const { data: associations } = trpc.properties.getAssociations.useQuery(
    { propertyId: propId },
    { enabled: !!propId }
  );
  const { data: historyData, isLoading: historyLoading } = trpc.properties.getHistory.useQuery(
    { propertyId: propId },
    { enabled: !!propId }
  );

  if (!property) return <div className="p-6 text-muted-foreground">Loading...</div>;

  const txList = associations?.transactions ?? [];
  const listingList = associations?.listings ?? [];
  const contactList = associations?.contacts ?? [];
  const historyEvents: HistoryEvent[] = (historyData?.events ?? []) as HistoryEvent[];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/properties")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </div>
      <PageHeader
        title={formatStreet(property.address)}
        subtitle={formatCityStateZip(property.city, property.state, property.zip)}
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
                      <Link key={c.id} href={`/contacts/${c.id}`}>
                        <div className="p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
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
                      </Link>
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
                <HistoryTimeline events={historyEvents} />
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
      </Tabs>
    </div>
  );
}
