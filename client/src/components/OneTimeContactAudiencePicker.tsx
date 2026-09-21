import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Plus, Search, X } from "lucide-react";

export type PickedContact = {
  id: number;
  name: string;
  email: string | null;
};

const MIN_SEARCH_LENGTH = 2;
const RESULT_LIMIT = 20;

function contactLabel(contact: PickedContact): string {
  return contact.name || contact.email || `Contact #${contact.id}`;
}

/**
 * Pick individual contacts for a One Time Send.
 *
 * Searching rather than browsing, because the contact table is far too long to
 * scroll and the person building the send already knows who they want. The
 * chosen contacts stay pinned above the results so the list being built is
 * visible while searching for the next one.
 */
export default function OneTimeContactAudiencePicker({
  selectedContacts,
  onSelectedContactsChange,
  disabled = false,
}: {
  selectedContacts: PickedContact[];
  onSelectedContactsChange: (contacts: PickedContact[]) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const trimmedSearch = search.trim();

  const results = trpc.contacts.list.useQuery(
    { search: trimmedSearch, page: 1, limit: RESULT_LIMIT },
    { enabled: trimmedSearch.length >= MIN_SEARCH_LENGTH }
  );

  const selectedIds = new Set(selectedContacts.map(contact => contact.id));

  const addContact = (contact: PickedContact) => {
    if (selectedIds.has(contact.id)) return;
    onSelectedContactsChange([...selectedContacts, contact]);
  };

  const removeContact = (id: number) => {
    onSelectedContactsChange(selectedContacts.filter(contact => contact.id !== id));
  };

  const rows = ((results.data?.rows ?? []) as any[]).map(row => {
    const contact = row.contact ?? row;
    return {
      id: contact.id as number,
      name: `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim(),
      email: (contact.email ?? null) as string | null,
    };
  });

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {selectedContacts.length
            ? `${selectedContacts.length} contact${selectedContacts.length === 1 ? "" : "s"} selected`
            : "Search for contacts to add"}
        </p>
        {selectedContacts.length > 0 && (
          <button
            type="button"
            onClick={() => onSelectedContactsChange([])}
            disabled={disabled}
            className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" /> Clear selection
          </button>
        )}
      </div>

      {selectedContacts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {selectedContacts.map(contact => (
            <span
              key={contact.id}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
            >
              <span className="truncate">{contactLabel(contact)}</span>
              <button
                type="button"
                onClick={() => removeContact(contact.id)}
                disabled={disabled}
                aria-label={`Remove ${contactLabel(contact)}`}
                className="rounded-full p-0.5 hover:bg-primary/20 disabled:pointer-events-none disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search contacts"
          className="pl-9"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search by name, email or phone..."
          disabled={disabled}
        />
      </div>

      <div className="mt-3 max-h-72 divide-y overflow-y-auto rounded-md border">
        {rows.map(contact => (
          <div key={contact.id} className="flex min-h-11 items-center gap-2 px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <span className="block truncate">{contactLabel(contact)}</span>
              {contact.email && contact.name && (
                <span className="block truncate text-xs text-muted-foreground">
                  {contact.email}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => addContact(contact)}
              disabled={disabled || selectedIds.has(contact.id)}
              className="inline-flex shrink-0 items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
            >
              <Plus className="h-3 w-3" />
              {selectedIds.has(contact.id) ? "Added" : "Add"}
            </button>
          </div>
        ))}
        {!rows.length && (
          <p className="px-3 py-7 text-center text-sm text-muted-foreground">
            {trimmedSearch.length < MIN_SEARCH_LENGTH
              ? "Type at least two characters to search."
              : results.isLoading
                ? "Searching..."
                : `No contacts match “${trimmedSearch}”.`}
          </p>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Only the contacts listed above receive this send. The usual do-not-contact,
        unsubscribe and bounce rules still apply.
      </p>
    </div>
  );
}
