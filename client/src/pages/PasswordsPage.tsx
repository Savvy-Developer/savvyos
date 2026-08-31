import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Search,
  Key,
  Trash2,
  Pencil,
  Eye,
  EyeOff,
  ExternalLink,
  Copy,
  FolderOpen,
  ArrowLeft,
  List,
  X,
} from "lucide-react";
import { toast } from "sonner";

export default function PasswordsPage() {
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // ─── List CRUD state ────────────────────────────────────────────────────────
  const [showCreateList, setShowCreateList] = useState(false);
  const [editingList, setEditingList] = useState<any | null>(null);
  const [listForm, setListForm] = useState({ name: "", description: "", shareGrants: [] as Array<{ userId: number; canView: boolean; canCreate: boolean; canEdit: boolean }> });

  // ─── Entry CRUD state ──────────────────────────────────────────────────────
  const [showCreateEntry, setShowCreateEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any | null>(null);
  const [entryForm, setEntryForm] = useState({ title: "", username: "", password: "", loginUrl: "", notes: "" });

  // ─── Password visibility ───────────────────────────────────────────────────
  const [visiblePasswords, setVisiblePasswords] = useState<Set<number>>(new Set());

  // ─── Queries ───────────────────────────────────────────────────────────────
  const { data: lists = [], refetch: refetchLists } = trpc.passwords.getLists.useQuery();
  const { data: passwordAccess } = trpc.passwords.hasAccessibleLists.useQuery();
  const { data: shareableUsers = [] } = trpc.passwords.getShareableUsers.useQuery(
    undefined,
    { enabled: showCreateList || !!editingList }
  );
  const { data: entries = [], refetch: refetchEntries } = trpc.passwords.getEntries.useQuery(
    { listId: selectedListId! },
    { enabled: selectedListId !== null && !isSearching }
  );
  const { data: searchResults = [], refetch: refetchSearch } = trpc.passwords.searchEntries.useQuery(
    { query: searchQuery },
    { enabled: isSearching && searchQuery.length > 0 }
  );

  // ─── Mutations ─────────────────────────────────────────────────────────────
  const createList = trpc.passwords.createList.useMutation({
    onSuccess: () => { refetchLists(); setShowCreateList(false); setListForm({ name: "", description: "", shareGrants: [] }); toast.success("List created"); },
    onError: (e) => toast.error(e.message),
  });
  const updateList = trpc.passwords.updateList.useMutation({
    onSuccess: () => { refetchLists(); setEditingList(null); toast.success("List updated"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteList = trpc.passwords.deleteList.useMutation({
    onSuccess: () => { refetchLists(); setSelectedListId(null); toast.success("List deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const createEntry = trpc.passwords.createEntry.useMutation({
    onSuccess: () => { refetchEntries(); setShowCreateEntry(false); resetEntryForm(); toast.success("Entry created"); },
    onError: (e) => toast.error(e.message),
  });
  const updateEntry = trpc.passwords.updateEntry.useMutation({
    onSuccess: () => { refetchEntries(); refetchSearch(); setEditingEntry(null); resetEntryForm(); toast.success("Entry updated"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteEntry = trpc.passwords.deleteEntry.useMutation({
    onSuccess: () => { refetchEntries(); refetchSearch(); toast.success("Entry deleted"); },
    onError: (e) => toast.error(e.message),
  });

  function resetEntryForm() {
    setEntryForm({ title: "", username: "", password: "", loginUrl: "", notes: "" });
  }

  function setShareGrants(shareGrants: Array<{ userId: number; canView: boolean; canCreate: boolean; canEdit: boolean }>) {
    setListForm((current) => ({ ...current, shareGrants }));
  }

  function togglePasswordVisibility(id: number) {
    setVisiblePasswords((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  }

  function handleSearch(q: string) {
    setSearchQuery(q);
    if (q.length > 0) {
      setIsSearching(true);
      setSelectedListId(null);
    } else {
      setIsSearching(false);
    }
  }

  const selectedList = lists.find((l: any) => l.id === selectedListId);
  const displayEntries = isSearching ? searchResults : entries;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Key className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">Passwords</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search all passwords..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {passwordAccess?.canCreateLists && (
            <Button onClick={() => { setListForm({ name: "", description: "", shareGrants: [] }); setShowCreateList(true); }} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-1" /> New List
            </Button>
          )}
        </div>
      </div>

      {/* Search results banner */}
      {isSearching && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-2">
          <Search className="h-4 w-4" />
          <span>Showing results for &quot;{searchQuery}&quot; across your visible lists</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => handleSearch("")}>
            Clear search
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[fit-content(28rem)_minmax(0,1fr)]">
        {/* Lists expand to the longest label within a bounded desktop column and stack on smaller screens. */}
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-1 mb-2">
            Lists
          </p>
          {lists.length === 0 ? (
            <p className="text-sm text-muted-foreground px-1">No lists yet. Create one to get started.</p>
          ) : (
            lists.map((list: any) => (
              <button
                key={list.id}
                onClick={() => { setSelectedListId(list.id); setIsSearching(false); setSearchQuery(""); }}
                className={`w-full flex items-start gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                  selectedListId === list.id && !isSearching
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-muted"
                }`}
              >
                <FolderOpen className="h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="block break-words leading-5">{list.name}</span>
                  <span className="block break-words text-[11px] leading-4 text-muted-foreground">Owner: {list.ownerName}</span>
                </div>
                {list.canManage && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingList(list); setListForm({ name: list.name, description: list.description || "", shareGrants: list.shareGrants || [] }); }}
                      className="p-1 hover:bg-muted rounded"
                      title="Edit list and sharing"
                    >
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${list.name}" and all its entries?`)) deleteList.mutate({ id: list.id }); }}
                      className="p-1 hover:bg-destructive/10 rounded"
                      title="Delete list"
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </button>
                  </div>
                )}
              </button>
            ))
          )}
        </div>

        {/* Entries main area */}
        <div className="min-w-0">
          {!selectedListId && !isSearching ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <List className="h-12 w-12 mb-4 opacity-40" />
              <p className="text-lg font-medium">Select a list to view passwords</p>
              <p className="text-sm mt-1">Or use the search bar to find entries across all lists</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* List header */}
              {selectedList && !isSearching && (
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">{selectedList.name}</h2>
                    {selectedList.description && (
                      <p className="text-sm text-muted-foreground">{selectedList.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">Owner: {selectedList.ownerName}</p>
                  </div>
                  {selectedList.canCreateEntries ? (
                    <Button onClick={() => { resetEntryForm(); setShowCreateEntry(true); }} size="sm">
                      <Plus className="h-4 w-4 mr-1" /> Add Entry
                    </Button>
                  ) : (
                    <Badge variant="secondary">Shared view</Badge>
                  )}
                </div>
              )}

              {/* Entries */}
              {displayEntries.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Key className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p>{isSearching ? "No results found" : "No entries in this list yet"}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {displayEntries.map((entry: any) => (
                    <Card key={entry.id} className="overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-sm">{entry.title}</h3>
                              {isSearching && entry.listName && (
                                <Badge variant="secondary" className="text-xs">{entry.listName}</Badge>
                              )}
                            </div>

                            {/* Fields grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                              {entry.username && (
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground w-20 shrink-0">Username:</span>
                                  <span className="font-mono truncate">{entry.username}</span>
                                  <button onClick={() => copyToClipboard(entry.username, "Username")} className="p-0.5 hover:bg-muted rounded shrink-0">
                                    <Copy className="h-3 w-3 text-muted-foreground" />
                                  </button>
                                </div>
                              )}
                              {entry.password && (
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground w-20 shrink-0">Password:</span>
                                  <span className="font-mono truncate">
                                    {visiblePasswords.has(entry.id) ? entry.password : "••••••••"}
                                  </span>
                                  <button onClick={() => togglePasswordVisibility(entry.id)} className="p-0.5 hover:bg-muted rounded shrink-0">
                                    {visiblePasswords.has(entry.id) ? <EyeOff className="h-3 w-3 text-muted-foreground" /> : <Eye className="h-3 w-3 text-muted-foreground" />}
                                  </button>
                                  <button onClick={() => copyToClipboard(entry.password, "Password")} className="p-0.5 hover:bg-muted rounded shrink-0">
                                    <Copy className="h-3 w-3 text-muted-foreground" />
                                  </button>
                                </div>
                              )}
                              {entry.loginUrl && (
                                <div className="flex items-center gap-2 md:col-span-2">
                                  <span className="text-muted-foreground w-20 shrink-0">Login URL:</span>
                                  <a
                                    href={entry.loginUrl.startsWith("http") ? entry.loginUrl : `https://${entry.loginUrl}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline truncate flex items-center gap-1"
                                  >
                                    {entry.loginUrl}
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                  </a>
                                </div>
                              )}
                              {entry.notes && (
                                <div className="md:col-span-2">
                                  <span className="text-muted-foreground text-xs">Notes:</span>
                                  <p className="text-sm mt-0.5 text-muted-foreground whitespace-pre-wrap">{entry.notes}</p>
                                </div>
                              )}
                            </div>
                          </div>

                          {entry.canEditEntries && (
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                  setEditingEntry(entry);
                                  setEntryForm({
                                    title: entry.title,
                                    username: entry.username || "",
                                    password: entry.password || "",
                                    loginUrl: entry.loginUrl || "",
                                    notes: entry.notes || "",
                                  });
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => { if (confirm("Delete this entry?")) deleteEntry.mutate({ id: entry.id }); }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Create List Dialog ──────────────────────────────────────────────── */}
      <Dialog open={showCreateList} onOpenChange={setShowCreateList}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New List</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">List Name *</label>
              <Input
                value={listForm.name}
                onChange={(e) => setListForm({ ...listForm, name: e.target.value })}
                placeholder="e.g., Social Media, Banking, Tools"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={listForm.description}
                onChange={(e) => setListForm({ ...listForm, description: e.target.value })}
                placeholder="Optional description..."
                rows={2}
              />
            </div>
            <PasswordListShareSelector key={showCreateList ? "create-open" : "create-closed"} users={shareableUsers as any[]} grants={listForm.shareGrants} onChange={setShareGrants} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateList(false)}>Cancel</Button>
            <Button
              onClick={() => createList.mutate({ name: listForm.name, description: listForm.description || undefined, shareGrants: listForm.shareGrants })}
              disabled={!listForm.name.trim() || createList.isPending}
            >
              Create List
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit List Dialog ────────────────────────────────────────────────── */}
      <Dialog open={!!editingList} onOpenChange={() => setEditingList(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit List</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">List Name *</label>
              <Input
                value={listForm.name}
                onChange={(e) => setListForm({ ...listForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={listForm.description}
                onChange={(e) => setListForm({ ...listForm, description: e.target.value })}
                rows={2}
              />
            </div>
            <PasswordListShareSelector key={editingList ? `edit-${editingList.id}` : "edit-closed"} users={shareableUsers as any[]} grants={listForm.shareGrants} onChange={setShareGrants} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingList(null)}>Cancel</Button>
            <Button
              onClick={() => editingList && updateList.mutate({ id: editingList.id, name: listForm.name, description: listForm.description || undefined, shareGrants: listForm.shareGrants })}
              disabled={!listForm.name.trim() || updateList.isPending}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Create Entry Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showCreateEntry} onOpenChange={setShowCreateEntry}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Password Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">What is this for? *</label>
              <Input
                value={entryForm.title}
                onChange={(e) => setEntryForm({ ...entryForm, title: e.target.value })}
                placeholder="e.g., Company Instagram, AWS Console"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Username</label>
              <Input
                value={entryForm.username}
                onChange={(e) => setEntryForm({ ...entryForm, username: e.target.value })}
                placeholder="Username or email"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Password</label>
              <Input
                value={entryForm.password}
                onChange={(e) => setEntryForm({ ...entryForm, password: e.target.value })}
                placeholder="Password"
                type="text"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Login URL</label>
              <Input
                value={entryForm.loginUrl}
                onChange={(e) => setEntryForm({ ...entryForm, loginUrl: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                value={entryForm.notes}
                onChange={(e) => setEntryForm({ ...entryForm, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateEntry(false)}>Cancel</Button>
            <Button
              onClick={() => createEntry.mutate({ listId: selectedListId!, title: entryForm.title, username: entryForm.username || undefined, password: entryForm.password || undefined, loginUrl: entryForm.loginUrl || undefined, notes: entryForm.notes || undefined })}
              disabled={!entryForm.title.trim() || createEntry.isPending}
            >
              Add Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Entry Dialog ───────────────────────────────────────────────── */}
      <Dialog open={!!editingEntry} onOpenChange={() => setEditingEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Password Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">What is this for? *</label>
              <Input
                value={entryForm.title}
                onChange={(e) => setEntryForm({ ...entryForm, title: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Username</label>
              <Input
                value={entryForm.username}
                onChange={(e) => setEntryForm({ ...entryForm, username: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Password</label>
              <Input
                value={entryForm.password}
                onChange={(e) => setEntryForm({ ...entryForm, password: e.target.value })}
                type="text"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Login URL</label>
              <Input
                value={entryForm.loginUrl}
                onChange={(e) => setEntryForm({ ...entryForm, loginUrl: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                value={entryForm.notes}
                onChange={(e) => setEntryForm({ ...entryForm, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEntry(null)}>Cancel</Button>
            <Button
              onClick={() => editingEntry && updateEntry.mutate({ id: editingEntry.id, title: entryForm.title, username: entryForm.username || undefined, password: entryForm.password || undefined, loginUrl: entryForm.loginUrl || undefined, notes: entryForm.notes || undefined })}
              disabled={!entryForm.title.trim() || updateEntry.isPending}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function PasswordListShareSelector({
  users,
  grants,
  onChange,
}: {
  users: Array<{
    id: number;
    name?: string | null;
    email?: string | null;
    role?: string | null;
  }>;
  grants: Array<{
    userId: number;
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
  }>;
  onChange: (
    grants: Array<{
      userId: number;
      canView: boolean;
      canCreate: boolean;
      canEdit: boolean;
    }>
  ) => void;
}) {
  const [step, setStep] = useState<"people" | "permissions">("people");
  const [search, setSearch] = useState("");
  const selectedUserIds = new Set(grants.map(grant => grant.userId));
  const selectedUsers = users.filter(user => selectedUserIds.has(user.id));
  const availableUsers = users.filter(user => {
    if (selectedUserIds.has(user.id)) return false;
    const query = search.trim().toLowerCase();
    return (
      !query ||
      [user.name, user.email, user.role].some(value =>
        value?.toLowerCase().includes(query)
      )
    );
  });
  const permissionOptions: Array<{
    label: string;
    detail: string;
    canCreate: boolean;
    canEdit: boolean;
  }> = [
    {
      label: "View only",
      detail: "View and copy credentials",
      canCreate: false,
      canEdit: false,
    },
    {
      label: "Add entries",
      detail: "View and add entries",
      canCreate: true,
      canEdit: false,
    },
    {
      label: "Edit entries",
      detail: "View, edit, and delete entries",
      canCreate: false,
      canEdit: true,
    },
    {
      label: "Full access",
      detail: "View, add, edit, and delete",
      canCreate: true,
      canEdit: true,
    },
  ];

  function addCollaborator(userId: number) {
    if (selectedUserIds.has(userId)) return;
    onChange([
      ...grants,
      { userId, canView: true, canCreate: false, canEdit: false },
    ]);
  }

  function removeCollaborator(userId: number) {
    onChange(grants.filter(grant => grant.userId !== userId));
  }

  function setPermission(userId: number, canCreate: boolean, canEdit: boolean) {
    onChange(
      grants.map(grant =>
        grant.userId === userId
          ? { ...grant, canView: true, canCreate, canEdit }
          : grant
      )
    );
  }

  const displayName = (user: {
    id: number;
    name?: string | null;
    email?: string | null;
  }) => user.name || user.email || `User #${user.id}`;

  return (
    <div className="rounded-lg border bg-muted/10 p-4">
      <div className="mb-4 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${step === "people" ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary"}`}
        >
          1
        </span>
        <span>Choose collaborators</span>
        <span className="h-px w-5 bg-border" />
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${step === "permissions" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
        >
          2
        </span>
        <span>Set permissions</span>
      </div>

      {step === "people" ? (
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Choose collaborators</label>
            <p className="mt-1 text-xs text-muted-foreground">
              Existing collaborators stay visible here. Select people first,
              then set access for only those people.
            </p>
          </div>

          {selectedUsers.length > 0 && (
            <div className="rounded-md border bg-background p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Collaborators ({selectedUsers.length})
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setStep("permissions")}
                >
                  Set permissions
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedUsers.map(user => (
                  <span
                    key={user.id}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/30 py-1 pl-2.5 pr-1 text-xs"
                  >
                    <span className="max-w-44 truncate font-medium">
                      {displayName(user)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCollaborator(user.id)}
                      className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-destructive"
                      aria-label={`Remove ${displayName(user)}`}
                      title={`Remove ${displayName(user)}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="pl-9"
              placeholder="Search people by name, email, or role…"
            />
          </div>

          <div className="max-h-[min(34vh,18rem)] overflow-y-auto rounded-md border bg-background divide-y">
            {users.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">
                No active users are available.
              </p>
            ) : availableUsers.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">
                {selectedUsers.length === users.length
                  ? "Everyone available has been selected."
                  : "No people match that search."}
              </p>
            ) : (
              availableUsers.map(user => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => addCollaborator(user.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {displayName(user)}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {user.email}
                      {user.role ? ` · ${user.role.replace(/_/g, " ")}` : ""}
                    </span>
                  </span>
                  <Plus className="h-4 w-4 shrink-0 text-primary" />
                </button>
              ))
            )}
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => setStep("permissions")}
              disabled={selectedUsers.length === 0}
            >
              Continue to permissions
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">
              Set collaborator permissions
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              Each collaborator can view credentials. Choose whether they can
              also add, edit, or delete password entries.
            </p>
          </div>
          <div className="max-h-[min(46vh,28rem)] space-y-3 overflow-y-auto pr-1">
            {selectedUsers.map(user => {
              const grant = grants.find(
                candidate => candidate.userId === user.id
              ) ?? {
                userId: user.id,
                canView: true,
                canCreate: false,
                canEdit: false,
              };
              return (
                <div
                  key={user.id}
                  className="rounded-md border bg-background p-3"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {displayName(user)}
                      </p>
                      {user.email && (
                        <p className="truncate text-xs text-muted-foreground">
                          {user.email}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => removeCollaborator(user.id)}
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {permissionOptions.map(option => {
                      const selected =
                        grant.canCreate === option.canCreate &&
                        grant.canEdit === option.canEdit;
                      return (
                        <button
                          key={option.label}
                          type="button"
                          aria-pressed={selected}
                          onClick={() =>
                            setPermission(
                              user.id,
                              option.canCreate,
                              option.canEdit
                            )
                          }
                          className={`rounded-md border px-3 py-2 text-left transition-colors ${selected ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted/60"}`}
                        >
                          <span className="block text-xs font-semibold">
                            {option.label}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {option.detail}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStep("people")}
            >
              Back
            </Button>
            <p className="text-right text-xs text-muted-foreground">
              Permissions are saved when you create or save this list.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
