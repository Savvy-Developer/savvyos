import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import { Plus, Building2, Search, ArrowRightLeft, List, Users, Upload, ArrowUpAZ, ArrowDownAZ } from "lucide-react";
import BulkUploadDialog, { type BulkUploadColumn } from "@/components/BulkUploadDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

const PROPERTY_TYPES = ["single_family","multi_family","condo","townhouse","cabin","vacation_rental","commercial","land","other"];

export default function PropertiesPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ address: "", city: "", state: "", zip: "", propertyType: "single_family", beds: "", baths: "", sqft: "", listPrice: "", notes: "" });

  const [bulkOpen, setBulkOpen] = useState(false);
  const bulkUploadMutation = trpc.properties.bulkUpload.useMutation();
  const utils = trpc.useUtils();

  const propertyBulkColumns: BulkUploadColumn[] = [
    { key: "address", label: "Address", required: true, example: "123 Main St" },
    { key: "city", label: "City", example: "Nashville" },
    { key: "state", label: "State", example: "TN" },
    { key: "zip", label: "Zip", example: "37201" },
    { key: "propertyType", label: "Property Type", example: "single_family" },
    { key: "beds", label: "Beds", example: "3" },
    { key: "baths", label: "Baths", example: "2" },
    { key: "sqft", label: "Sqft", example: "1800" },
    { key: "yearBuilt", label: "Year Built", example: "2005" },
    { key: "listPrice", label: "List Price", example: "350000" },
    { key: "strZoning", label: "STR Zoning", example: "" },
    { key: "notes", label: "Notes", example: "" },
    { key: "ownerFirstName", label: "Owner First Name", example: "John" },
    { key: "ownerLastName", label: "Owner Last Name", example: "Doe" },
    { key: "ownerEmail", label: "Owner Email", example: "john@example.com" },
    { key: "ownerPhone", label: "Owner Phone", example: "555-987-6543" },
  ];

  const { data: propertiesData, refetch } = trpc.properties.list.useQuery({ search: search || undefined, sortOrder });
  const properties = propertiesData as Array<{ property: any; transactionCount: number; listingCount: number; contactCount: number; transactionNames: string | null; listingNames: string | null; contactNames: string | null }> | undefined;
  const create = trpc.properties.create.useMutation({
    onSuccess: (data) => {
      toast.success("Property created");
      setOpen(false);
      setForm({ address: "", city: "", state: "", zip: "", propertyType: "single_family", beds: "", baths: "", sqft: "", listPrice: "", notes: "" });
      refetch();
      navigate(`/properties/${data.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Properties"
        subtitle="Track properties associated with contacts and transactions"
        actions={
          <div className="flex gap-2">
            {user?.role === "admin" && (
              <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
                <Upload className="h-4 w-4 mr-1" /> Bulk Upload
              </Button>
            )}
            <Button onClick={() => setOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> Add Property</Button>
          </div>
        }
      />
      <BulkUploadDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title="Bulk Upload Properties"
        columns={propertyBulkColumns}
        onUpload={async (rows) => {
          const result = await bulkUploadMutation.mutateAsync({ rows: rows as any });
          return result;
        }}
        onSuccess={() => {
          utils.properties.list.invalidate();
          toast.success("Properties imported successfully");
        }}
      />

      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search properties..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => setSortOrder(o => o === "asc" ? "desc" : "asc")}
          title={sortOrder === "asc" ? "Sorted A → Z" : "Sorted Z → A"}
        >
          {sortOrder === "asc" ? <><ArrowUpAZ className="h-4 w-4" /><span className="hidden sm:inline">A → Z</span></> : <><ArrowDownAZ className="h-4 w-4" /><span className="hidden sm:inline">Z → A</span></>}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Address</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Type</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Beds/Baths</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">List Price</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Linked To</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {!properties || properties.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted-foreground">
                    <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>{search ? "No properties match your search" : "No properties yet"}</p>
                  </td>
                </tr>
              ) : (
                properties.map(({ property, transactionCount, listingCount, contactCount, transactionNames, listingNames, contactNames }) => (
                  <tr key={property.id} className="border-b last:border-0 hover:bg-muted/20 cursor-pointer" onClick={() => navigate(`/properties/${property.id}`)}>
                    <td className="py-3 px-4">
                      <p className="font-medium">{property.address}</p>
                      <p className="text-xs text-muted-foreground">{[property.city, property.state, property.zip].filter(Boolean).join(", ")}</p>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground capitalize">{property.propertyType?.replace("_"," ") ?? "—"}</td>
                    <td className="py-3 px-4 text-muted-foreground">{property.beds && property.baths ? `${property.beds}bd / ${property.baths}ba` : "—"}</td>
                    <td className="py-3 px-4 text-right">{property.listPrice ? `$${Number(property.listPrice).toLocaleString()}` : "—"}</td>
                    <td className="py-3 px-4">
                      <TooltipProvider delayDuration={200}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {Number(transactionCount) > 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  className="inline-flex items-center gap-1 text-[10px] font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-full px-1.5 py-0.5 transition-colors"
                                  onClick={(e) => { e.stopPropagation(); navigate(`/properties/${property.id}#transactions`); }}
                                >
                                  <ArrowRightLeft className="h-2.5 w-2.5" />{transactionCount}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[200px]">
                                <p className="font-semibold text-xs mb-0.5">{transactionCount} Transaction{Number(transactionCount) !== 1 ? 's' : ''}</p>
                                {transactionNames && <p className="text-xs opacity-80">{transactionNames}{Number(transactionCount) > 3 ? ` +${Number(transactionCount) - 3} more` : ''}</p>}
                                <p className="text-[10px] opacity-60 mt-0.5">Click to view</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {Number(listingCount) > 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  className="inline-flex items-center gap-1 text-[10px] font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 rounded-full px-1.5 py-0.5 transition-colors"
                                  onClick={(e) => { e.stopPropagation(); navigate(`/properties/${property.id}#listings`); }}
                                >
                                  <List className="h-2.5 w-2.5" />{listingCount}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[200px]">
                                <p className="font-semibold text-xs mb-0.5">{listingCount} Listing{Number(listingCount) !== 1 ? 's' : ''}</p>
                                {listingNames && <p className="text-xs opacity-80">{listingNames}{Number(listingCount) > 3 ? ` +${Number(listingCount) - 3} more` : ''}</p>}
                                <p className="text-[10px] opacity-60 mt-0.5">Click to view</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {Number(contactCount) > 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  className="inline-flex items-center gap-1 text-[10px] font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-full px-1.5 py-0.5 transition-colors"
                                  onClick={(e) => { e.stopPropagation(); navigate(`/properties/${property.id}#contacts`); }}
                                >
                                  <Users className="h-2.5 w-2.5" />{contactCount}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[200px]">
                                <p className="font-semibold text-xs mb-0.5">{contactCount} Contact{Number(contactCount) !== 1 ? 's' : ''}</p>
                                {contactNames && <p className="text-xs opacity-80">{contactNames}{Number(contactCount) > 3 ? ` +${Number(contactCount) - 3} more` : ''}</p>}
                                <p className="text-[10px] opacity-60 mt-0.5">Click to view</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {Number(transactionCount) === 0 && Number(listingCount) === 0 && Number(contactCount) === 0 && (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </div>
                      </TooltipProvider>
                    </td>
                    <td className="py-3 px-4"><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); navigate(`/properties/${property.id}`); }}>View</Button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table></div></CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Property</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Address *</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div><Label>State</Label><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
              <div><Label>ZIP</Label><Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} /></div>
            </div>
            <div>
              <Label>Property Type</Label>
              <Select value={form.propertyType} onValueChange={(v) => setForm({ ...form, propertyType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PROPERTY_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_"," ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div><Label>Beds</Label><Input value={form.beds} onChange={(e) => setForm({ ...form, beds: e.target.value })} /></div>
              <div><Label>Baths</Label><Input value={form.baths} onChange={(e) => setForm({ ...form, baths: e.target.value })} /></div>
              <div><Label>Sqft</Label><Input type="number" value={form.sqft} onChange={(e) => setForm({ ...form, sqft: e.target.value })} /></div>
            </div>
            <div><Label>List Price</Label><Input placeholder="e.g. 450000" value={form.listPrice} onChange={(e) => setForm({ ...form, listPrice: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate({ address: form.address, city: form.city || null, state: form.state || null, zip: form.zip || null, propertyType: form.propertyType as any, beds: form.beds || null, baths: form.baths || null, sqft: form.sqft ? parseInt(form.sqft) : null, listPrice: form.listPrice || null, notes: form.notes || null })} disabled={!form.address || create.isPending}>
              {create.isPending ? "Creating..." : "Create Property"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
