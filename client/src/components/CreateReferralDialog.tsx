import { useEffect, useMemo, useState } from "react";
import { Loader2, UserRound } from "lucide-react";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";

type ReferralAgent = {
  id: number;
  name: string;
  brokerage?: string | null;
};

type ContactSummary = {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
};

type ReferralDraft = {
  contactId: string;
  referralAgentId: string;
  referralType: "buyer" | "seller" | "buyer_seller" | "other";
  referralSentAt: string;
  locationNotes: string;
  notes: string;
};

const TYPE_LABELS: Record<ReferralDraft["referralType"], string> = {
  buyer: "Buyer",
  seller: "Seller",
  buyer_seller: "Buyer + Seller",
  other: "Other",
};

function blankReferral(contactId = ""): ReferralDraft {
  return {
    contactId,
    referralAgentId: "",
    referralType: "buyer",
    referralSentAt: new Date().toISOString().slice(0, 10),
    locationNotes: "",
    notes: "",
  };
}

function contactName(contact?: ContactSummary | null) {
  const name = `${contact?.firstName ?? ""} ${contact?.lastName ?? ""}`.trim();
  return name || "Selected contact";
}

function contactDescription(contact: ContactSummary) {
  return [contact.email, contact.phone].filter(Boolean).join(" · ") || "No contact details";
}

export function CreateReferralDialog({
  open,
  onOpenChange,
  agents,
  lockedContact,
  initialContactId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: ReferralAgent[];
  lockedContact?: ContactSummary | null;
  initialContactId?: string;
  onCreated?: (id: number) => void;
}) {
  const utils = trpc.useUtils();
  const selectedContactId = lockedContact
    ? String(lockedContact.id)
    : (initialContactId ?? "");
  const [draft, setDraft] = useState<ReferralDraft>(() => blankReferral(selectedContactId));
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<ContactSummary | null>(lockedContact ?? null);
  const shouldSearchContacts = open && !lockedContact && contactSearch.trim().length >= 2;
  const { data: contactsData, isFetching: contactsSearching } = trpc.contacts.list.useQuery(
    {
      search: contactSearch.trim(),
      page: 1,
      limit: 25,
      sortOrder: "asc",
      sortBy: "name",
    },
    { enabled: shouldSearchContacts }
  );
  const contacts = useMemo(
    () =>
      ((contactsData as any)?.rows ?? contactsData ?? []).map(
        (row: any) => row.contact ?? row
      ) as ContactSummary[],
    [contactsData]
  );
  const contactOptions = useMemo(() => {
    const matches = selectedContact && !contacts.some(contact => contact.id === selectedContact.id)
      ? [selectedContact, ...contacts]
      : contacts;
    return matches.map(contact => ({
      value: String(contact.id),
      label: contactName(contact),
      description: contactDescription(contact),
    }));
  }, [contacts, selectedContact]);

  const create = trpc.referrals.create.useMutation({
    onSuccess: ({ id }) => {
      toast.success("Outbound referral created");
      utils.referrals.list.invalidate();
      utils.referrals.overview.invalidate();
      utils.referrals.byContact.invalidate();
      onOpenChange(false);
      setDraft(blankReferral(selectedContactId));
      setContactSearch("");
      setSelectedContact(lockedContact ?? null);
      onCreated?.(id);
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (open) {
      setDraft(blankReferral(selectedContactId));
      setContactSearch("");
      setSelectedContact(lockedContact ?? null);
    }
  }, [open, selectedContactId, lockedContact]);

  function selectContact(contactId: string) {
    setSelectedContact(contacts.find(contact => String(contact.id) === contactId) ?? selectedContact);
    setDraft(current => ({ ...current, contactId }));
  }

  function submit() {
    if (!draft.contactId || !draft.referralAgentId) {
      toast.error("Select the Savvy contact and outside referral agent");
      return;
    }

    create.mutate({
      contactId: Number(draft.contactId),
      referralAgentId: Number(draft.referralAgentId),
      referralType: draft.referralType,
      locationNotes: draft.locationNotes || null,
      referralSentAt: draft.referralSentAt || null,
      notes: draft.notes || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl max-h-[92vh] overflow-x-hidden overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Create an outbound referral</DialogTitle>
          <DialogDescription>
            {lockedContact
              ? `Prepare the external referral for ${contactName(lockedContact)}. This contact stays associated with their SavvyOS profile.`
              : "Choose the Savvy contact and the outside agent who will serve them."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 sm:grid-cols-2">
          {lockedContact ? (
            <div className="space-y-1.5">
              <Label>Savvy contact</Label>
              <div className="flex min-h-10 items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate font-medium">{contactName(lockedContact)}</span>
                {lockedContact.email && (
                  <span className="min-w-0 truncate text-muted-foreground">· {lockedContact.email}</span>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Savvy contact *</Label>
              <SearchableSelect
                options={contactOptions}
                value={draft.contactId}
                onValueChange={selectContact}
                placeholder="Search for a contact"
                searchPlaceholder="Search name, email, or phone…"
                searchValue={contactSearch}
                onSearchChange={setContactSearch}
                emptyText={contactSearch.trim().length < 2
                  ? "Enter at least 2 characters to search the CRM."
                  : contactsSearching
                    ? "Searching contacts…"
                    : "No matching contacts found."}
              />
              <p className="text-xs text-muted-foreground">Search the full SavvyOS contact database by name, email, or phone.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Outside referral agent *</Label>
            <Select
              value={draft.referralAgentId}
              onValueChange={referralAgentId =>
                setDraft(current => ({ ...current, referralAgentId }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select outside agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map(agent => (
                  <SelectItem key={agent.id} value={String(agent.id)}>
                    {agent.name}{agent.brokerage ? ` · ${agent.brokerage}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Savvy fee, outside-agent coverage, and internal ownership are set automatically from the agent profile and referral record.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Referral type</Label>
            <Select
              value={draft.referralType}
              onValueChange={(referralType: ReferralDraft["referralType"]) =>
                setDraft(current => ({ ...current, referralType }))
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Date referral sent</Label>
            <Input
              type="date"
              value={draft.referralSentAt}
              onChange={event => setDraft(current => ({ ...current, referralSentAt: event.target.value }))}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Client location interest</Label>
            <Textarea
              value={draft.locationNotes}
              onChange={event => setDraft(current => ({ ...current, locationNotes: event.target.value }))}
              placeholder="Where is the client interested in buying or selling? Include any city, neighborhood, county, or other location context."
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Referral notes</Label>
            <Textarea
              value={draft.notes}
              onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))}
              placeholder="Context, introduction details, expectations, or service requirements."
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create referral
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
