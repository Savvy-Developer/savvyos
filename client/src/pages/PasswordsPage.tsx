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
import { Checkbox } from "@/components/ui/checkbox";
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
} from "lucide-react";
import { toast } from "sonner";

export default function PasswordsPage() {
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // ─── List CRUD state ────────────────────────────────────────────────────────
  const [showCreateList, setShowCreateList] = useState(false);
  const [editingList, setEditingList] = useState<any | null>(null);
  const [listForm, setListForm] = useState({ name: "", description: "", sharedUserIds: [] as number[] });

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
    onSuccess: () => { refetchLists(); setShowCreateList(false); setListForm({ name: "", description: "", sharedUserIds: [] }); toast.success("List created"); },
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

  function toggleSharedUser(userId: number) {
    setListForm((current) => ({
      ...current,
      sharedUserIds: current.sharedUserIds.includes(userId)
        ? current.sharedUserIds.filter((id) => id !== userId)
        : [...current.sharedUserIds, userId],
    }));
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
            <Button onClick={() => { setListForm({ name: "", description: "", sharedUserIds: [] }); setShowCreateList(true); }} variant="outline" size="sm">
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Lists sidebar */}
        <div className="lg:col-span-1 space-y-2">
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
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                  selectedListId === list.id && !isSearching
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-muted"
                }`}
              >
                <FolderOpen className="h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="block truncate">{list.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">Owner: {list.ownerName}</span>
                </div>
                {list.canManage && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingList(list); setListForm({ name: list.name, description: list.description || "", sharedUserIds: list.sharedUserIds || [] }); }}
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
        <div className="lg:col-span-3">
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
                  {selectedList.canManage ? (
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

                          {/* Actions are limited to the owner and designated super users. */}
                          {entry.canManage && (
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
        <DialogContent>
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
            <PasswordListShareSelector users={shareableUsers as any[]} selectedUserIds={listForm.sharedUserIds} onToggle={toggleSharedUser} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateList(false)}>Cancel</Button>
            <Button
              onClick={() => createList.mutate({ name: listForm.name, description: listForm.description || undefined, sharedUserIds: listForm.sharedUserIds })}
              disabled={!listForm.name.trim() || createList.isPending}
            >
              Create List
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit List Dialog ────────────────────────────────────────────────── */}
      <Dialog open={!!editingList} onOpenChange={() => setEditingList(null)}>
        <DialogContent>
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
            <PasswordListShareSelector users={shareableUsers as any[]} selectedUserIds={listForm.sharedUserIds} onToggle={toggleSharedUser} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingList(null)}>Cancel</Button>
            <Button
              onClick={() => editingList && updateList.mutate({ id: editingList.id, name: listForm.name, description: listForm.description || undefined, sharedUserIds: listForm.sharedUserIds })}
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
  selectedUserIds,
  onToggle,
}: {
  users: Array<{ id: number; name?: string | null; email?: string | null; role?: string | null }>;
  selectedUserIds: number[];
  onToggle: (userId: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className="text-sm font-medium">Share with</label>
        <p className="text-xs text-muted-foreground mt-1">Only the people selected here can see this list. They can view and copy credentials but cannot edit the list, entries, or sharing.</p>
      </div>
      <div className="max-h-44 overflow-y-auto rounded-md border divide-y">
        {users.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">No active users are available.</p>
        ) : users.map((user) => (
          <label key={user.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/50">
            <Checkbox
              checked={selectedUserIds.includes(user.id)}
              onCheckedChange={() => onToggle(user.id)}
            />
            <span className="min-w-0 text-sm">
              <span className="block truncate font-medium">{user.name || user.email || `User #${user.id}`}</span>
              {user.email && <span className="block truncate text-xs text-muted-foreground">{user.email}</span>}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
