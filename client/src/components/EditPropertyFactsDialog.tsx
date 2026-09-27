import { useEffect, useState } from "react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Edit a property's facts: price, beds, baths, size, type, year built, ZIP.
 *
 * Found while testing the agent flow on 27 Sep: after "Add Property" there was
 * no way to change or fill these in except "Import from Zillow" inside a
 * pro-forma, yet publishing to the website needs price, beds, baths and ZIP.
 * The street address is not edited here; changing it can collide with another
 * property, so that stays with admins.
 */

const TYPES: Array<[string, string]> = [
  ["single_family", "Single Family"],
  ["multi_family", "Multi Family"],
  ["condo", "Condo"],
  ["townhouse", "Townhouse"],
  ["cabin", "Cabin"],
  ["vacation_rental", "Vacation Rental"],
  ["commercial", "Commercial"],
  ["land", "Land"],
  ["other", "Other"],
];

const whole = (value: unknown) => {
  const n = Number(value);
  return value == null || value === "" || !Number.isFinite(n) ? "" : String(Math.round(n));
};

export default function EditPropertyFactsDialog({
  property,
  open,
  onOpenChange,
}: {
  property: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    listPrice: "",
    beds: "",
    baths: "",
    sqft: "",
    yearBuilt: "",
    propertyType: "",
    zip: "",
  });
  useEffect(() => {
    if (!open || !property) return;
    setForm({
      listPrice: property.listPrice ? String(Math.round(Number(property.listPrice))) : "",
      beds: whole(property.beds),
      baths: whole(property.baths),
      sqft: property.sqft != null ? String(property.sqft) : "",
      yearBuilt: property.yearBuilt != null ? String(property.yearBuilt) : "",
      propertyType: property.propertyType ?? "",
      zip: property.zip ?? "",
    });
  }, [open, property]);

  const update = trpc.properties.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.properties.get.invalidate({ id: property.id }),
        utils.website.propertyWebsiteContent.invalidate({ propertyId: property.id }),
      ]);
      toast.success("Property details saved.");
      onOpenChange(false);
    },
    onError: error => toast.error(error.message),
  });

  const set = (key: keyof typeof form, value: string) => setForm(prior => ({ ...prior, [key]: value }));

  function save() {
    // Only what changed is sent. The ZIP in particular is part of the address
    // key, so it is left out unless it was actually edited.
    const data: Record<string, unknown> = {};
    if (form.beds && form.beds !== whole(property.beds)) data.beds = form.beds;
    if (form.baths && form.baths !== whole(property.baths)) data.baths = form.baths;
    if (form.sqft && Number(form.sqft) !== property.sqft) data.sqft = Number(form.sqft);
    if (form.yearBuilt && Number(form.yearBuilt) !== property.yearBuilt) data.yearBuilt = Number(form.yearBuilt);
    if (form.listPrice && Number(form.listPrice) !== Number(property.listPrice ?? 0)) data.listPrice = form.listPrice;
    if (form.propertyType && form.propertyType !== property.propertyType) data.propertyType = form.propertyType;
    if (form.zip.trim() && form.zip.trim() !== (property.zip ?? "")) data.zip = form.zip.trim();
    if (Object.keys(data).length === 0) {
      onOpenChange(false);
      return;
    }
    update.mutate({ id: property.id, data: data as any });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit property details</DialogTitle>
          <DialogDescription>
            These are the facts the website listing shows. Price, beds, baths and ZIP are needed to publish.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>List price ($)</Label>
            <Input
              className="mt-1"
              inputMode="numeric"
              value={form.listPrice}
              onChange={e => set("listPrice", e.target.value.replace(/[^\d]/g, "").slice(0, 10))}
              placeholder="450000"
            />
          </div>
          <div>
            <Label>Beds</Label>
            <Input className="mt-1" inputMode="numeric" value={form.beds} onChange={e => set("beds", e.target.value.replace(/\D/g, "").slice(0, 2))} />
          </div>
          <div>
            <Label>Baths</Label>
            <Input className="mt-1" inputMode="numeric" value={form.baths} onChange={e => set("baths", e.target.value.replace(/\D/g, "").slice(0, 2))} />
          </div>
          <div>
            <Label>Sqft</Label>
            <Input className="mt-1" inputMode="numeric" value={form.sqft} onChange={e => set("sqft", e.target.value.replace(/\D/g, "").slice(0, 5))} />
          </div>
          <div>
            <Label>Year built</Label>
            <Input className="mt-1" inputMode="numeric" value={form.yearBuilt} onChange={e => set("yearBuilt", e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </div>
          <div>
            <Label>Property type</Label>
            <Select value={form.propertyType || undefined} onValueChange={value => set("propertyType", value)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Choose a type" />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>ZIP</Label>
            <Input className="mt-1" inputMode="numeric" value={form.zip} onChange={e => set("zip", e.target.value.replace(/[^0-9-]/g, "").slice(0, 10))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={update.isPending} onClick={save}>
            {update.isPending ? "Saving..." : "Save details"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
