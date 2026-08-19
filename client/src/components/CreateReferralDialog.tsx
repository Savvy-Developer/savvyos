import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, UserRound, UsersRound } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";

type ReferralStatus = {
  key: string;
  name: string;
  isActive: boolean;
};

type ReferralAgent = {
  id: number;
  name: string;
  brokerage?: string | null;
  defaultSavvyReferralPct?: string | number | null;
};

type ReferralOwner = {
  id: number;
  name?: string | null;
  email?: string | null;
};

type ContactSummary = {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

type ReferralDraft = {
  contactId: string;
  referralAgentId: string;
  relationshipOwnerId: string;
  referralType: "buyer" | "seller" | "buyer_seller" | "other";
  statusKey: string;
  savvyReferralPct: string;
  market: string;
  metro: string;
  state: string;
  areasServed: string;
  referralSentAt: string;
  notes: string;
};

const TYPE_LABELS: Record<ReferralDraft["referralType"], string> = {
  buyer: "Buyer",
  seller: "Seller",
  buyer_seller: "Buyer + Seller",
  other: "Other",
};

function blankReferral(
  contactId = "",
  statusKey = "referral_sent"
): ReferralDraft {
  return {
    contactId,
    referralAgentId: "",
    relationshipOwnerId: "",
    referralType: "buyer",
    statusKey,
    savvyReferralPct: "",
    market: "",
    metro: "",
    state: "",
    areasServed: "",
    referralSentAt: new Date().toISOString().slice(0, 10),
    notes: "",
  };
}

function contactName(contact?: ContactSummary | null) {
  const name = `${contact?.firstName ?? ""} ${contact?.lastName ?? ""}`.trim();
  return name || "Selected contact";
}

export function CreateReferralDialog({
  open,
  onOpenChange,
  statuses,
  agents,
  owners,
  lockedContact,
  initialContactId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statuses: ReferralStatus[];
  agents: ReferralAgent[];
  owners: ReferralOwner[];
  lockedContact?: ContactSummary | null;
  initialContactId?: string;
  onCreated?: (id: number) => void;
}) {
  const utils = trpc.useUtils();
  const selectedContactId = lockedContact
    ? String(lockedContact.id)
    : (initialContactId ?? "");
  const [draft, setDraft] = useState<ReferralDraft>(() =>
    blankReferral(selectedContactId, statuses[0]?.key ?? "referral_sent")
  );
  const { data: contactsData } = trpc.contacts.list.useQuery(
    { search: "", page: 1, limit: 100, sortOrder: "desc" },
    { enabled: open && !lockedContact }
  );
  const contacts = useMemo(
    () =>
      ((contactsData as any)?.rows ?? contactsData ?? []).map(
        (row: any) => row.contact ?? row
      ),
    [contactsData]
  );

  const create = trpc.referrals.create.useMutation({
    onSuccess: ({ id }) => {
      toast.success("Outbound referral created");
      utils.referrals.list.invalidate();
      utils.referrals.overview.invalidate();
      utils.referrals.byContact.invalidate();
      onOpenChange(false);
      setDraft(
        blankReferral(selectedContactId, statuses[0]?.key ?? "referral_sent")
      );
      onCreated?.(id);
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (open) {
      setDraft(
        blankReferral(selectedContactId, statuses[0]?.key ?? "referral_sent")
      );
    }
  }, [open, selectedContactId, statuses]);

  function selectAgent(referralAgentId: string) {
    const agent = agents.find(
      candidate => String(candidate.id) === referralAgentId
    );
    setDraft(current => ({
      ...current,
      referralAgentId,
      savvyReferralPct:
        agent?.defaultSavvyReferralPct == null
          ? ""
          : String(agent.defaultSavvyReferralPct),
    }));
  }

  function submit() {
    if (!draft.contactId || !draft.referralAgentId) {
      toast.error("Select the Savvy contact and outside referral agent");
      return;
    }
    if (!draft.savvyReferralPct) {
      toast.error(
        "The selected referral agent needs a Savvy referral percentage"
      );
      return;
    }

    create.mutate({
      contactId: Number(draft.contactId),
      referralAgentId: Number(draft.referralAgentId),
      relationshipOwnerId: draft.relationshipOwnerId
        ? Number(draft.relationshipOwnerId)
        : null,
      referralType: draft.referralType,
      statusKey: draft.statusKey,
      savvyReferralPct: draft.savvyReferralPct,
      market: draft.market || null,
      metro: draft.metro || null,
      state: draft.state || null,
      areasServed: draft.areasServed || null,
      referralSentAt: draft.referralSentAt || null,
      notes: draft.notes || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-3xl max-h-[92vh] overflow-x-hidden overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Create an outbound referral</DialogTitle>
          <DialogDescription>
            {lockedContact
              ? `Prepare the external referral for ${contactName(lockedContact)}. This contact stays associated with their SavvyOS profile.`
              : "Keep the Savvy contact in SavvyOS while assigning outside-agent service."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 sm:grid-cols-2">
          {lockedContact ? (
            <div className="space-y-1.5">
              <Label>Savvy contact</Label>
              <div className="flex min-h-10 items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate font-medium">
                  {contactName(lockedContact)}
                </span>
                {lockedContact.email && (
                  <span className="min-w-0 truncate text-muted-foreground">
                    · {lockedContact.email}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Savvy contact *</Label>
              <Select
                value={draft.contactId}
                onValueChange={contactId =>
                  setDraft(current => ({ ...current, contactId }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select contact" />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((contact: ContactSummary) => (
                    <SelectItem key={contact.id} value={String(contact.id)}>
                      {contactName(contact)}
                      {contact.email ? ` · ${contact.email}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Outside referral agent *</Label>
            <Select value={draft.referralAgentId} onValueChange={selectAgent}>
              <SelectTrigger>
                <SelectValue placeholder="Select outside agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map(agent => (
                  <SelectItem key={agent.id} value={String(agent.id)}>
                    {agent.name}
                    {agent.brokerage ? ` · ${agent.brokerage}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Referral type</Label>
            <Select
              value={draft.referralType}
              onValueChange={(referralType: ReferralDraft["referralType"]) =>
                setDraft(current => ({ ...current, referralType }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Initial referral status</Label>
            <Select
              value={draft.statusKey}
              onValueChange={statusKey =>
                setDraft(current => ({ ...current, statusKey }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses
                  .filter(status => status.isActive)
                  .map(status => (
                    <SelectItem key={status.key} value={status.key}>
                      {status.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Savvy referral percentage</Label>
            <div className="flex min-h-10 items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <span className="truncate text-muted-foreground">
                From selected referral agent
              </span>
              <span className="shrink-0 font-semibold">
                {draft.savvyReferralPct ? `${draft.savvyReferralPct}%` : "—"}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Date referral sent</Label>
            <Input
              type="date"
              value={draft.referralSentAt}
              onChange={event =>
                setDraft(current => ({
                  ...current,
                  referralSentAt: event.target.value,
                }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label>Market / location</Label>
            <Input
              value={draft.market}
              onChange={event =>
                setDraft(current => ({
                  ...current,
                  market: event.target.value,
                }))
              }
              placeholder="e.g., Asheville"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>State</Label>
              <Input
                value={draft.state}
                onChange={event =>
                  setDraft(current => ({
                    ...current,
                    state: event.target.value,
                  }))
                }
                placeholder="NC"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Metro</Label>
              <Input
                value={draft.metro}
                onChange={event =>
                  setDraft(current => ({
                    ...current,
                    metro: event.target.value,
                  }))
                }
                placeholder="Metro"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Savvy relationship owner</Label>
            <Select
              value={draft.relationshipOwnerId || "none"}
              onValueChange={relationshipOwnerId =>
                setDraft(current => ({
                  ...current,
                  relationshipOwnerId:
                    relationshipOwnerId === "none" ? "" : relationshipOwnerId,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Use agent owner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  Use agent owner / current user
                </SelectItem>
                {owners.map(owner => (
                  <SelectItem key={owner.id} value={String(owner.id)}>
                    {owner.name ?? owner.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Areas served</Label>
            <Input
              value={draft.areasServed}
              onChange={event =>
                setDraft(current => ({
                  ...current,
                  areasServed: event.target.value,
                }))
              }
              placeholder="Neighborhoods or counties"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Referral notes</Label>
            <Textarea
              value={draft.notes}
              onChange={event =>
                setDraft(current => ({ ...current, notes: event.target.value }))
              }
              placeholder="Context, introduction details, expectations, or service requirements."
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Create referral
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
