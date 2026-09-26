import { ChangeEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Archive, ArchiveRestore, ArrowLeft, AtSign, ChevronDown, ChevronRight, FileText, Hash, Image as ImageIcon, Loader2, Mail, MessageCircle, MessageSquare, MoreHorizontal, Paperclip, Pencil, Plus, Reply, Search, Send, Settings2, SmilePlus, Trash2, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "✅"] as const;

type Channel = { id: number; sectionId: number | null; type: "group" | "direct"; isPermanent: boolean; name: string; description: string | null; isArchived: boolean; unreadCount?: number; unreadMentionCount?: number; updatedAt: Date };
type Section = { id: number; name: string; description: string | null; sortOrder: number };
type Person = { id: number; name: string | null; email: string | null; role: string; profilePhotoUrl: string | null };
type WorkspaceSection = { section: Section; groups: Channel[] };
type PersonalChat = { channel: Channel; person: Person | null; participants: Person[]; title: string; lastMessageAt: Date; unreadCount: number; unreadMentionCount: number };
type Attachment = { id: number; fileName: string; fileUrl: string; mimeType: string; fileSize: number };
type ParentMessage = { message: { id: number; body: string; senderId: number; createdAt: Date }; sender: { id: number; name: string | null; email: string | null } };
type MessageRow = { message: { id: number; channelId: number; senderId: number; parentMessageId: number | null; body: string; editedAt: Date | null; createdAt: Date }; sender: Person; profilePhotoUrl: string | null; attachments: Attachment[]; mentions: Array<{ id: number; name: string | null; email: string | null }>; reactions: Array<{ emoji: string; count: number; reactedByMe: boolean }>; parent: ParentMessage | null };
type MemberRow = { membership: { id: number; channelId: number; userId: number; addedById: number; createdAt: Date }; user: Person; profilePhotoUrl: string | null };
type StagedAttachment = { id: number; fileName: string; mimeType: string; fileSize: number };
type PersonalChatMode = "direct" | "group";

function displayName(person: { name: string | null; email: string | null }) { return person.name?.trim() || person.email?.trim() || "Savvy teammate"; }
function initials(name: string) { return name.split(" ").filter(Boolean).map(part => part[0]).join("").slice(0, 2).toUpperCase(); }
function roleLabel(role: string) { return role === "isa" ? "ISA" : role === "agent_support" ? "Agent Support" : role.charAt(0).toUpperCase() + role.slice(1); }
function formatMessageTime(value: Date) { const date = new Date(value); const sameDay = date.toDateString() === new Date().toDateString(); return new Intl.DateTimeFormat("en-US", { month: sameDay ? undefined : "short", day: sameDay ? undefined : "numeric", hour: "numeric", minute: "2-digit" }).format(date); }
function formatFileSize(fileSize: number) { return fileSize < 1024 * 1024 ? `${Math.max(1, Math.round(fileSize / 1024))} KB` : `${(fileSize / (1024 * 1024)).toFixed(1)} MB`; }
function isImage(mimeType: string) { return mimeType.startsWith("image/"); }

function UnreadBadge({ count, mentionCount }: { count: number; mentionCount: number }) {
  if (!count) return null;
  return <span className="ml-auto flex items-center gap-1">{mentionCount > 0 && <AtSign className="h-3 w-3 text-amber-500" />}<span className="min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-primary-foreground">{count > 99 ? "99+" : count}</span></span>;
}

function ConversationRow({ channel, title, person, isSelected, onSelect }: { channel: Channel; title: string; person?: Person | null; isSelected: boolean; onSelect: () => void }) {
  return <button type="button" onClick={onSelect} className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${isSelected ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{person ? <Avatar className="h-5 w-5 shrink-0"><AvatarImage src={person.profilePhotoUrl ?? undefined} /><AvatarFallback className="bg-primary/10 text-[8px] text-primary">{initials(title)}</AvatarFallback></Avatar> : <Hash className="h-3.5 w-3.5 shrink-0" />}<span className="min-w-0 flex-1 truncate">{title}</span><UnreadBadge count={channel.unreadCount ?? 0} mentionCount={channel.unreadMentionCount ?? 0} /></button>;
}

function ChatSectionHeading({
  section,
  isCollapsed,
  isChatAdmin,
  onToggle,
  onChanged,
}: {
  section: Section;
  isCollapsed: boolean;
  isChatAdmin: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const archive = trpc.chat.sections.archive.useMutation({
    onSuccess: () => {
      toast.success("Section deleted");
      setConfirmDelete(false);
      onChanged();
    },
    onError: error => toast.error(error.message),
  });
  return (
    <>
      <div className="mb-1 flex min-w-0 items-center gap-0.5 px-1">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          onClick={onToggle}
        >
          {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">{section.name}</span>
        </button>
        {isChatAdmin && (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0 text-muted-foreground"
                title={`Edit ${section.name}`}
                onClick={event => event.stopPropagation()}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
                <span className="sr-only">Section actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onClick={() => {
                  setMenuOpen(false);
                  setEditOpen(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit / rename
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmDelete(true);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete section
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <EditSectionDialog section={section} open={editOpen} onOpenChange={setEditOpen} onChanged={onChanged} />
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {section.name}?</DialogTitle>
            <DialogDescription>
              This removes the section heading from Chat. Groups inside it stay available and are not deleted. You can restore the section later from Archived.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={archive.isPending}
              onClick={() => archive.mutate({ id: section.id })}
            >
              {archive.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ChatConversationList({
  workspaceLoading,
  personalChats,
  visiblePersonalChats,
  sectionGroups,
  unsectioned,
  allChannels,
  selectedChannelId,
  myChatsCollapsed,
  showAllMyChats,
  collapsedSections,
  isChatAdmin,
  onToggleMyChats,
  onToggleShowAllMyChats,
  onToggleSection,
  onSelect,
  onWorkspaceChanged,
}: {
  workspaceLoading: boolean;
  personalChats: PersonalChat[];
  visiblePersonalChats: PersonalChat[];
  sectionGroups: WorkspaceSection[];
  unsectioned: Channel[];
  allChannels: Channel[];
  selectedChannelId: number | null;
  myChatsCollapsed: boolean;
  showAllMyChats: boolean;
  collapsedSections: Set<number>;
  isChatAdmin: boolean;
  onToggleMyChats: () => void;
  onToggleShowAllMyChats: () => void;
  onToggleSection: (sectionId: number) => void;
  onSelect: (channelId: number) => void;
  onWorkspaceChanged: () => void;
}) {
  if (workspaceLoading) {
    return (
      <div className="space-y-2 px-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading conversations...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section>
        <button
          type="button"
          className="mb-1 flex w-full items-center gap-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          onClick={onToggleMyChats}
        >
          {myChatsCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          <span>My Chats</span>
          <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px]">
            {personalChats.length}
          </span>
        </button>
        {!myChatsCollapsed && (
          <div className="space-y-0.5">
            {visiblePersonalChats.map(item => (
              <ConversationRow
                key={item.channel.id}
                channel={{
                  ...item.channel,
                  unreadCount: item.unreadCount,
                  unreadMentionCount: item.unreadMentionCount,
                }}
                title={item.title}
                person={item.person}
                isSelected={selectedChannelId === item.channel.id}
                onSelect={() => onSelect(item.channel.id)}
              />
            ))}
            {personalChats.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                Start a direct message or group chat.
              </p>
            )}
            {personalChats.length > 3 && (
              <button
                type="button"
                className="w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-primary hover:bg-muted"
                onClick={onToggleShowAllMyChats}
              >
                {showAllMyChats ? "Show less" : "Show more..."}
              </button>
            )}
          </div>
        )}
      </section>
      {sectionGroups.map(({ section, groups }) => {
        const isCollapsed = collapsedSections.has(section.id);
        return (
          <section key={section.id}>
            <ChatSectionHeading
              section={section}
              isCollapsed={isCollapsed}
              isChatAdmin={isChatAdmin}
              onToggle={() => onToggleSection(section.id)}
              onChanged={onWorkspaceChanged}
            />
            {!isCollapsed && (
              <div className="space-y-0.5">
                {groups.map(group => (
                  <ConversationRow
                    key={group.id}
                    channel={group}
                    title={group.name}
                    isSelected={selectedChannelId === group.id}
                    onSelect={() => onSelect(group.id)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
      {unsectioned.length > 0 && (
        <section>
          <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Company groups
          </p>
          <div className="space-y-0.5">
            {unsectioned.map(group => (
              <ConversationRow
                key={group.id}
                channel={group}
                title={group.name}
                isSelected={selectedChannelId === group.id}
                onSelect={() => onSelect(group.id)}
              />
            ))}
          </div>
        </section>
      )}
      {allChannels.length === 0 && (
        <div className="rounded-lg border border-dashed px-3 py-7 text-center text-xs text-muted-foreground">
          <MessageSquare className="mx-auto mb-2 h-5 w-5 opacity-50" />
          No conversations yet.
        </div>
      )}
    </div>
  );
}

function NewSectionDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState(""); const [description, setDescription] = useState("");
  const create = trpc.chat.sections.create.useMutation({ onSuccess: () => { toast.success("Chat section created"); setName(""); setDescription(""); onOpenChange(false); onCreated(); }, onError: error => toast.error(error.message) });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>New Chat Section</DialogTitle><DialogDescription>Sections organize permanent company groups.</DialogDescription></DialogHeader><div className="space-y-4 py-2"><div className="space-y-1.5"><Label htmlFor="chat-section-name">Section name</Label><Input id="chat-section-name" value={name} maxLength={100} autoFocus placeholder="e.g. Operations" onChange={event => setName(event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="chat-section-description">Description <span className="text-muted-foreground">(optional)</span></Label><Textarea id="chat-section-description" value={description} maxLength={500} placeholder="What belongs here?" onChange={event => setDescription(event.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate({ name: name.trim(), description: description.trim() || null })}>{create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Section</Button></DialogFooter></DialogContent></Dialog>;
}

function EditSectionDialog({ section, open, onOpenChange, onChanged }: { section: Section; open: boolean; onOpenChange: (open: boolean) => void; onChanged: () => void }) {
  const [name, setName] = useState(section.name);
  const [description, setDescription] = useState(section.description ?? "");
  useEffect(() => {
    if (open) {
      setName(section.name);
      setDescription(section.description ?? "");
    }
  }, [open, section.description, section.name]);
  const update = trpc.chat.sections.update.useMutation({
    onSuccess: () => {
      toast.success("Section updated");
      onOpenChange(false);
      onChanged();
    },
    onError: error => toast.error(error.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit section</DialogTitle>
          <DialogDescription>Rename this heading. Groups inside it stay in place.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor={`edit-section-name-${section.id}`}>Section name</Label>
            <Input id={`edit-section-name-${section.id}`} value={name} maxLength={100} autoFocus onChange={event => setName(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit-section-description-${section.id}`}>Description <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea id={`edit-section-description-${section.id}`} value={description} maxLength={500} onChange={event => setDescription(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!name.trim() || update.isPending} onClick={() => update.mutate({ id: section.id, name: name.trim(), description: description.trim() || null })}>
            {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save section
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArchivedChatDialog({ open, onOpenChange, onRestored }: { open: boolean; onOpenChange: (open: boolean) => void; onRestored: () => void }) {
  const { data, isLoading } = trpc.chat.archived.list.useQuery(undefined, { enabled: open });
  const restoreSection = trpc.chat.sections.restore.useMutation({
    onSuccess: () => {
      toast.success("Section restored");
      onRestored();
    },
    onError: error => toast.error(error.message),
  });
  const restoreGroup = trpc.chat.groups.restore.useMutation({
    onSuccess: () => {
      toast.success("Channel restored");
      onRestored();
    },
    onError: error => toast.error(error.message),
  });
  const sections = (data?.sections ?? []) as Section[];
  const channels = (data?.channels ?? []) as Channel[];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Archived Chat</DialogTitle>
          <DialogDescription>Restore a deleted section heading or an archived company channel without losing messages.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="max-h-[420px] space-y-5 overflow-y-auto py-2">
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sections</p>
              {sections.length === 0 ? (
                <p className="text-sm text-muted-foreground">No deleted sections.</p>
              ) : sections.map(section => (
                <div key={section.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{section.name}</p>
                    {section.description && <p className="truncate text-xs text-muted-foreground">{section.description}</p>}
                  </div>
                  <Button size="sm" variant="outline" disabled={restoreSection.isPending} onClick={() => restoreSection.mutate({ id: section.id })}>
                    <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />
                    Restore
                  </Button>
                </div>
              ))}
            </section>
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Channels</p>
              {channels.length === 0 ? (
                <p className="text-sm text-muted-foreground">No archived channels.</p>
              ) : channels.map(channel => (
                <div key={channel.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">#{channel.name}</p>
                    {channel.description && <p className="truncate text-xs text-muted-foreground">{channel.description}</p>}
                  </div>
                  <Button size="sm" variant="outline" disabled={restoreGroup.isPending} onClick={() => restoreGroup.mutate({ id: channel.id })}>
                    <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />
                    Restore
                  </Button>
                </div>
              ))}
            </section>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewPermanentGroupDialog({ open, onOpenChange, sections, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; sections: Section[]; onCreated: (channelId: number) => void }) {
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [sectionId, setSectionId] = useState("");
  const create = trpc.chat.groups.create.useMutation({ onSuccess: result => { toast.success("Permanent company group created"); setName(""); setDescription(""); setSectionId(""); onOpenChange(false); onCreated(result.id); }, onError: error => toast.error(error.message) });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>New Permanent Group</DialogTitle><DialogDescription>This is a company group. It must belong to a section, Chat Admins manage it, and members cannot archive it.</DialogDescription></DialogHeader><div className="space-y-4 py-2"><div className="space-y-1.5"><Label htmlFor="permanent-group-name">Group name</Label><Input id="permanent-group-name" value={name} maxLength={100} autoFocus placeholder="e.g. ISA Team" onChange={event => setName(event.target.value)} /></div><div className="space-y-1.5"><Label>Section <span className="text-destructive">*</span></Label><Select value={sectionId} onValueChange={setSectionId}><SelectTrigger><SelectValue placeholder={sections.length ? "Choose a section" : "Create a section first"} /></SelectTrigger><SelectContent>{sections.map(section => <SelectItem key={section.id} value={String(section.id)}>{section.name}</SelectItem>)}</SelectContent></Select>{sections.length === 0 && <p className="text-xs text-muted-foreground">Create a section before adding a permanent group.</p>}</div><div className="space-y-1.5"><Label htmlFor="permanent-group-description">Purpose <span className="text-muted-foreground">(optional)</span></Label><Textarea id="permanent-group-description" value={description} maxLength={500} placeholder="A short description for this group" onChange={event => setDescription(event.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!name.trim() || !sectionId || create.isPending} onClick={() => create.mutate({ name: name.trim(), description: description.trim() || null, sectionId: Number(sectionId) })}>{create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Group</Button></DialogFooter></DialogContent></Dialog>;
}

function NewMessageDialog({
  open,
  initialMode,
  onOpenChange,
  onOpened,
}: {
  open: boolean;
  initialMode: PersonalChatMode;
  onOpenChange: (open: boolean) => void;
  onOpened: (channelId: number) => void;
}) {
  const { data: people = [] } = trpc.chat.people.list.useQuery(undefined, {
    enabled: open,
  });
  const [mode, setMode] = useState<PersonalChatMode>(initialMode);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [groupName, setGroupName] = useState("");

  useEffect(() => {
    if (open) setMode(initialMode);
  }, [initialMode, open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedIds([]);
      setGroupName("");
    }
  }, [open]);

  const create = trpc.chat.conversations.create.useMutation({
    onSuccess: result => {
      toast.success(
        result.type === "direct"
          ? result.created
            ? "Direct message started"
            : "Direct message opened"
          : "Group chat created"
      );
      onOpenChange(false);
      onOpened(result.channelId);
    },
    onError: error => toast.error(error.message),
  });

  const results = (people as Person[]).filter(person =>
    `${displayName(person)} ${person.email ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );
  const minimumPeople = mode === "group" ? 2 : 1;
  const canCreate = selectedIds.length >= minimumPeople;
  const chooseMode = (nextMode: PersonalChatMode) => {
    setMode(nextMode);
    if (nextMode === "direct") setSelectedIds(current => current.slice(0, 1));
  };
  const toggle = (userId: number) =>
    setSelectedIds(current => {
      if (mode === "direct") return current.includes(userId) ? [] : [userId];
      return current.includes(userId)
        ? current.filter(id => id !== userId)
        : [...current, userId];
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "group" ? "New Group Chat" : "New Message"}
          </DialogTitle>
          <DialogDescription>
            {mode === "group"
              ? "Choose at least two teammates for a private group chat."
              : "Choose one teammate for a direct message."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
          <button
            type="button"
            aria-pressed={mode === "direct"}
            onClick={() => chooseMode("direct")}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              mode === "direct"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Direct message
          </button>
          <button
            type="button"
            aria-pressed={mode === "group"}
            onClick={() => chooseMode("group")}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              mode === "group"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Group chat
          </button>
        </div>
        <Input
          autoFocus
          value={query}
          placeholder="Search teammates"
          onChange={event => setQuery(event.target.value)}
        />
        {mode === "group" && (
          <div className="space-y-1.5">
            <Label htmlFor="personal-group-name">
              Group name{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="personal-group-name"
              value={groupName}
              maxLength={100}
              placeholder="e.g. Asheville launch team"
              onChange={event => setGroupName(event.target.value)}
            />
          </div>
        )}
        <ScrollArea className="h-64 rounded-lg border">
          <div className="p-2">
            {results.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                No teammates match that search.
              </p>
            ) : (
              results.map(person => (
                <label
                  key={person.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted"
                >
                  <Checkbox
                    checked={selectedIds.includes(person.id)}
                    onCheckedChange={() => toggle(person.id)}
                  />
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={person.profilePhotoUrl ?? undefined} />
                    <AvatarFallback className="bg-primary/10 text-xs text-primary">
                      {initials(displayName(person))}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {displayName(person)}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {roleLabel(person.role)} · {person.email}
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canCreate || create.isPending}
            onClick={() =>
              create.mutate({
                userIds: selectedIds,
                name:
                  mode === "group" && groupName.trim()
                    ? groupName.trim()
                    : undefined,
              })
            }
          >
            {create.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {mode === "group" ? "Create Group Chat" : "Start Message"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChatAccessManagementDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const utils = trpc.useUtils();
  const { data: people = [], isLoading: peopleLoading } = trpc.chat.people.list.useQuery(undefined, { enabled: open });
  const { data: accessRows = [], isLoading: accessLoading } = trpc.chat.accessManagement.list.useQuery(undefined, { enabled: open });
  const [query, setQuery] = useState("");
  const setAccess = trpc.chat.accessManagement.set.useMutation({
    onSuccess: (_, variables) => { void utils.chat.accessManagement.list.invalidate(); toast.success(variables.isEnabled ? "Chat access enabled" : "Chat access removed"); },
    onError: error => toast.error(error.message),
  });
  const enabledIds = useMemo(() => new Set((accessRows as Array<{ userId: number; isEnabled: boolean }>).filter(row => row.isEnabled).map(row => row.userId)), [accessRows]);
  const visiblePeople = (people as Person[]).filter(person => `${displayName(person)} ${person.email ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[88vh] overflow-hidden sm:max-w-lg"><DialogHeader><DialogTitle>Chat access</DialogTitle><DialogDescription>Enable Chat without changing this person&apos;s company channels. Channel membership controls what they can see.</DialogDescription></DialogHeader><Input autoFocus value={query} placeholder="Search teammates" onChange={event => setQuery(event.target.value)} /><ScrollArea className="h-72 rounded-lg border"><div className="p-2">{peopleLoading || accessLoading ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : visiblePeople.length === 0 ? <p className="px-2 py-8 text-center text-sm text-muted-foreground">No teammates match that search.</p> : visiblePeople.map(person => { const enabled = enabledIds.has(person.id); const updating = setAccess.isPending && setAccess.variables?.userId === person.id; return <button key={person.id} type="button" className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted disabled:cursor-wait" disabled={updating} onClick={() => setAccess.mutate({ userId: person.id, isEnabled: !enabled })}><span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${enabled ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background text-transparent"}`}>✓</span><Avatar className="h-8 w-8"><AvatarImage src={person.profilePhotoUrl ?? undefined} /><AvatarFallback className="bg-primary/10 text-xs text-primary">{initials(displayName(person))}</AvatarFallback></Avatar><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{displayName(person)}</span><span className="block truncate text-xs text-muted-foreground">{roleLabel(person.role)} · {person.email}</span></span>{updating && <Loader2 className="h-4 w-4 animate-spin" />}</button>; })}</div></ScrollArea></DialogContent></Dialog>;
}

function SearchResultSection({ title, children }: { title: string; children: React.ReactNode }) { return <section><p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p><div className="space-y-0.5">{children}</div></section>; }
function ChatSearchDialog({ open, onOpenChange, onSelect }: { open: boolean; onOpenChange: (open: boolean) => void; onSelect: (channelId: number) => void }) {
  const [query, setQuery] = useState(""); const normalizedQuery = query.trim(); const { data, isFetching } = trpc.chat.search.useQuery({ query: normalizedQuery }, { enabled: open && normalizedQuery.length >= 2, staleTime: 15_000 });
  useEffect(() => { if (!open) setQuery(""); }, [open]); const choose = (channelId: number) => { onSelect(channelId); onOpenChange(false); }; const hint = normalizedQuery.length < 2 ? "Search messages, groups, people in messages, and file names." : isFetching ? "Searching Chat..." : "No Chat results found.";
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[82vh] overflow-hidden p-0 sm:max-w-2xl"><DialogHeader className="border-b px-5 py-4"><DialogTitle className="flex items-center gap-2"><Search className="h-5 w-5 text-primary" />Search Chat</DialogTitle><DialogDescription>Only searches conversations, messages, and attachments you are allowed to see.</DialogDescription></DialogHeader><div className="p-4 pb-0"><Input autoFocus value={query} placeholder="Search messages, groups, direct messages, or files" onChange={event => setQuery(event.target.value)} /></div><ScrollArea className="h-[430px] px-4 pb-4">{!data ? <p className="px-1 py-10 text-center text-sm text-muted-foreground">{hint}</p> : <div className="space-y-5 py-4">{data.conversations.length > 0 && <SearchResultSection title="Conversations">{data.conversations.map((item: any) => <button key={item.channel.id} type="button" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted" onClick={() => choose(item.channel.id)}>{item.person ? <Avatar className="h-8 w-8"><AvatarImage src={item.profilePhotoUrl ?? undefined} /><AvatarFallback className="text-[9px]">{initials(displayName(item.person))}</AvatarFallback></Avatar> : <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary"><Hash className="h-4 w-4" /></div>}<span className="min-w-0"><span className="block truncate text-sm font-medium">{item.person ? displayName(item.person) : item.channel.name}</span><span className="block truncate text-xs text-muted-foreground">{item.person ? "Direct message" : item.channel.description || "Group conversation"}</span></span></button>)}</SearchResultSection>}{data.messages.length > 0 && <SearchResultSection title="Messages">{data.messages.map((item: any) => <button key={item.message.id} type="button" className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-muted" onClick={() => choose(item.message.channelId)}><div className="flex items-center gap-2 text-xs text-muted-foreground"><MessageSquare className="h-3.5 w-3.5" /><span className="font-medium text-foreground">{item.channelType === "group" ? `#${item.channelTitle}` : item.channelTitle}</span><span>·</span><span>{displayName(item.sender)}</span><span>·</span><span>{formatMessageTime(item.message.createdAt)}</span></div><p className="mt-1 line-clamp-2 text-sm leading-5">{item.message.body}</p></button>)}</SearchResultSection>}{data.attachments.length > 0 && <SearchResultSection title="Files">{data.attachments.map((item: any) => <button key={item.attachment.id} type="button" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted" onClick={() => choose(item.message.channelId)}>{isImage(item.attachment.mimeType) ? <ImageIcon className="h-5 w-5 text-primary" /> : <FileText className="h-5 w-5 text-primary" />}<span className="min-w-0"><span className="block truncate text-sm font-medium">{item.attachment.fileName}</span><span className="block truncate text-xs text-muted-foreground">{item.channelType === "group" ? `#${item.channelTitle}` : item.channelTitle} · {displayName(item.sender)}</span></span></button>)}</SearchResultSection>}{data.conversations.length === 0 && data.messages.length === 0 && data.attachments.length === 0 && <p className="px-1 py-10 text-center text-sm text-muted-foreground">No Chat results found.</p>}</div>}</ScrollArea><div className="border-t px-5 py-2.5 text-xs text-muted-foreground">Search stays inside Chat. Press <kbd className="rounded border bg-muted px-1.5 py-0.5">Esc</kbd> to close.</div></DialogContent></Dialog>;
}

function ManageGroupDialog({ group, sections, open, onOpenChange, onChanged }: { group: Channel | null; sections: Section[]; open: boolean; onOpenChange: (open: boolean) => void; onChanged: () => void }) {
  const channelId = group?.id ?? 0; const { data: people = [] } = trpc.chat.people.list.useQuery(undefined, { enabled: open }); const { data: members = [] } = trpc.chat.members.list.useQuery({ channelId }, { enabled: open && channelId > 0 });
  const utils = trpc.useUtils();
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [sectionId, setSectionId] = useState(""); const [newMemberId, setNewMemberId] = useState("none"); const [confirmDelete, setConfirmDelete] = useState(false); const [confirmArchive, setConfirmArchive] = useState(false);
  const closeAfterSaveRef = useRef(false);
  useEffect(() => { if (group && open) { setName(group.name); setDescription(group.description ?? ""); setSectionId(group.sectionId == null ? "" : String(group.sectionId)); setNewMemberId("none"); closeAfterSaveRef.current = false; } }, [group, open]);
  const detailsDirty = !!group && (
    name.trim() !== group.name
    || (description.trim() || null) !== (group.description ?? null)
    || Number(sectionId || 0) !== (group.sectionId ?? 0)
  );
  const update = trpc.chat.groups.update.useMutation({
    onSuccess: () => {
      toast.success("Permanent group updated");
      onChanged();
      if (closeAfterSaveRef.current) {
        closeAfterSaveRef.current = false;
        onOpenChange(false);
      }
    },
    onError: error => toast.error(error.message),
  });
  const saveDetails = (closeOnSuccess = false) => {
    if (!group || !name.trim() || !sectionId || update.isPending) return;
    closeAfterSaveRef.current = closeOnSuccess;
    update.mutate({ id: group.id, name: name.trim(), description: description.trim() || null, sectionId: Number(sectionId) });
  };
  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    if (detailsDirty) {
      saveDetails(true);
      return;
    }
    onOpenChange(false);
  };
  const archiveGroup = trpc.chat.groups.archive.useMutation({ onSuccess: () => { toast.success("Channel archived"); setConfirmArchive(false); onOpenChange(false); onChanged(); }, onError: error => toast.error(error.message) }); const removeGroup = trpc.chat.groups.delete.useMutation({ onSuccess: () => { toast.success("Permanent group deleted"); setConfirmDelete(false); onOpenChange(false); onChanged(); }, onError: error => toast.error(error.message) });
  const addMember = trpc.chat.members.add.useMutation({ onSuccess: () => { void utils.chat.members.list.invalidate({ channelId }); toast.success("Person added to this group"); setNewMemberId("none"); onChanged(); }, onError: error => toast.error(error.message) }); const removeMember = trpc.chat.members.remove.useMutation({ onSuccess: () => { void utils.chat.members.list.invalidate({ channelId }); toast.success("Person removed from this group"); onChanged(); }, onError: error => toast.error(error.message) });
  const memberIds = useMemo(() => new Set((members as MemberRow[]).map(row => row.user.id)), [members]); const availablePeople = (people as Person[]).filter(person => !memberIds.has(person.id)); if (!group) return null;
  return <><Dialog open={open} onOpenChange={handleDialogOpenChange}><DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Manage #{group.name}</DialogTitle><DialogDescription>This is a permanent company group. Chat Admins manage its details and membership.</DialogDescription></DialogHeader><div className="grid gap-7 py-2 md:grid-cols-2"><section className="space-y-4"><div className="flex items-center gap-2 text-sm font-semibold"><Settings2 className="h-4 w-4 text-primary" />Group details</div><div className="space-y-1.5"><Label>Name</Label><Input value={name} maxLength={100} onChange={event => setName(event.target.value)} /></div><div className="space-y-1.5"><Label>Section <span className="text-destructive">*</span></Label><Select value={sectionId} onValueChange={setSectionId}><SelectTrigger><SelectValue placeholder="Choose a section" /></SelectTrigger><SelectContent>{sections.map(section => <SelectItem key={section.id} value={String(section.id)}>{section.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Purpose</Label><Textarea value={description} maxLength={500} onChange={event => setDescription(event.target.value)} /></div><Button className="w-full" disabled={!name.trim() || !sectionId || update.isPending} onClick={() => saveDetails(false)}>{update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Group Details</Button><div className="rounded-lg border bg-muted/30 p-3"><p className="text-sm font-medium">Archive this channel</p><p className="mt-1 text-xs text-muted-foreground">Hides the channel from Chat. Messages stay saved, and Chat Admins can restore it later from Archived.</p><Button variant="outline" size="sm" className="mt-3" onClick={() => setConfirmArchive(true)}><Archive className="mr-1.5 h-3.5 w-3.5" />Archive Channel</Button></div><div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3"><p className="text-sm font-medium">Delete this permanent group</p><p className="mt-1 text-xs text-muted-foreground">This permanently deletes the group, messages, reactions, and attachments. Prefer Archive if you may need it later.</p><Button variant="outline" size="sm" className="mt-3 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete Group</Button></div></section><section className="space-y-4 border-t pt-6 md:border-l md:border-t-0 md:pl-7 md:pt-0"><div className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-primary" />People with access <Badge variant="secondary">{(members as MemberRow[]).length}</Badge></div><div className="flex gap-2"><Select value={newMemberId} onValueChange={setNewMemberId}><SelectTrigger className="flex-1"><SelectValue placeholder="Add a SavvyOS user" /></SelectTrigger><SelectContent><SelectItem value="none">Select a person</SelectItem>{availablePeople.map(person => <SelectItem key={person.id} value={String(person.id)}>{displayName(person)} · {roleLabel(person.role)}</SelectItem>)}</SelectContent></Select><Button size="icon" title="Add to group" disabled={newMemberId === "none" || addMember.isPending} onClick={() => addMember.mutate({ channelId, userId: Number(newMemberId) })}>{addMember.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}</Button></div><div className="max-h-[315px] space-y-1 overflow-y-auto rounded-lg border p-2">{(members as MemberRow[]).length === 0 ? <p className="px-2 py-6 text-center text-sm text-muted-foreground">No one has been added yet.</p> : (members as MemberRow[]).map(member => <div key={member.membership.id} className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/60"><Avatar className="h-7 w-7"><AvatarImage src={member.profilePhotoUrl ?? undefined} /><AvatarFallback className="bg-primary/10 text-[10px] text-primary">{initials(displayName(member.user))}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{displayName(member.user)}</p><p className="truncate text-xs text-muted-foreground">{roleLabel(member.user.role)} · {member.user.email}</p></div><Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Remove from group" onClick={() => removeMember.mutate({ channelId, userId: member.user.id })}><X className="h-3.5 w-3.5" /></Button></div>)}</div></section></div><DialogFooter><Button variant="outline" disabled={update.isPending || (detailsDirty && (!name.trim() || !sectionId))} onClick={() => { if (detailsDirty) saveDetails(true); else onOpenChange(false); }}>{update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{detailsDirty ? "Save & Close" : "Done"}</Button></DialogFooter></DialogContent></Dialog><Dialog open={confirmArchive} onOpenChange={setConfirmArchive}><DialogContent><DialogHeader><DialogTitle>Archive #{group.name}?</DialogTitle><DialogDescription>This hides the channel from Chat. Messages stay saved, and Chat Admins can restore it later from Archived.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmArchive(false)}>Cancel</Button><Button disabled={archiveGroup.isPending} onClick={() => archiveGroup.mutate({ id: group.id })}>{archiveGroup.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Archive channel</Button></DialogFooter></DialogContent></Dialog><Dialog open={confirmDelete} onOpenChange={setConfirmDelete}><DialogContent><DialogHeader><DialogTitle>Delete #{group.name} permanently?</DialogTitle><DialogDescription>This cannot be reversed. The group and all of its messages, files, reactions, and membership records will be deleted for everyone.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button><Button variant="destructive" disabled={removeGroup.isPending} onClick={() => removeGroup.mutate({ id: group.id })}>{removeGroup.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Delete Permanently</Button></DialogFooter></DialogContent></Dialog></>;
}

function AttachmentView({ attachment }: { attachment: Attachment }) { if (isImage(attachment.mimeType)) return <a href={attachment.fileUrl} target="_blank" rel="noreferrer" className="mt-2 block w-fit"><img src={attachment.fileUrl} alt={attachment.fileName} className="max-h-64 max-w-full rounded-lg border object-contain" /></a>; return <a href={attachment.fileUrl} target="_blank" rel="noreferrer" className="mt-2 flex max-w-sm items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2 transition-colors hover:bg-muted"><FileText className="h-5 w-5 shrink-0 text-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{attachment.fileName}</span><span className="block text-xs text-muted-foreground">{formatFileSize(attachment.fileSize)}</span></span></a>; }
function ChatMessage({
  row,
  meId,
  onUpdate,
  onDelete,
  onReply,
  onReact,
  onMarkUnread,
}: {
  row: MessageRow;
  meId: number | null;
  onUpdate: (body: string) => void;
  onDelete: () => void;
  onReply: () => void;
  onReact: (emoji: (typeof REACTION_EMOJIS)[number]) => void;
  onMarkUnread: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.message.body);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const canManage = meId === row.message.senderId;
  const senderName = displayName(row.sender);
  return (
    <article className="group relative flex gap-3">
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarImage src={row.profilePhotoUrl ?? undefined} />
        <AvatarFallback className="bg-primary/10 text-xs text-primary">
          {initials(senderName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex min-h-6 items-center gap-2 pr-36">
          <span className="font-medium">{senderName}</span>
          <span className="text-xs text-muted-foreground">
            {formatMessageTime(row.message.createdAt)}
            {row.message.editedAt ? " · edited" : ""}
          </span>
          <div className="absolute right-0 top-0 z-10 flex items-center gap-0.5 rounded-md border bg-background p-0.5 shadow-sm md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100">
            <div className="relative">
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                title="Add reaction"
                onClick={() => setReactionPickerOpen(value => !value)}
              >
                <SmilePlus className="h-3.5 w-3.5" />
              </Button>
              {reactionPickerOpen && (
                <div className="absolute right-0 z-20 mt-1 flex gap-1 rounded-lg border bg-popover p-1 shadow-lg">
                  {REACTION_EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      className="rounded p-1 text-base hover:bg-muted"
                      onClick={() => {
                        onReact(emoji);
                        setReactionPickerOpen(false);
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              title="Reply"
              onClick={onReply}
            >
              <Reply className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              title="Mark unread from here"
              onClick={onMarkUnread}
            >
              <Mail className="h-3 w-3" />
            </Button>
            {canManage && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  title="Edit message"
                  onClick={() => {
                    setDraft(row.message.body);
                    setEditing(true);
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  title="Delete message"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        </div>
        {row.parent && (
          <button
            type="button"
            className="mt-1.5 block max-w-xl rounded border-l-2 border-primary/50 bg-muted/50 px-2.5 py-1.5 text-left text-xs hover:bg-muted"
          >
            <span className="font-medium text-primary">
              Replying to {displayName(row.parent.sender)}
            </span>
            <span className="mt-0.5 block truncate text-muted-foreground">
              {row.parent.message.body || "Attachment"}
            </span>
          </button>
        )}
        {editing ? (
          <div className="mt-1.5 space-y-2">
            <Textarea
              value={draft}
              className="min-h-[84px]"
              maxLength={8000}
              onChange={event => setDraft(event.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!draft.trim()}
                onClick={() => {
                  onUpdate(draft.trim());
                  setEditing(false);
                }}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <>
            {row.message.body && (
              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                {row.message.body}
              </p>
            )}
            {row.attachments.map(attachment => (
              <AttachmentView key={attachment.id} attachment={attachment} />
            ))}
          </>
        )}
        {row.reactions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {row.reactions.map(reaction => (
              <button
                key={reaction.emoji}
                type="button"
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${reaction.reactedByMe ? "border-primary/40 bg-primary/10 text-primary" : "bg-muted/40 hover:bg-muted"}`}
                onClick={() =>
                  onReact(reaction.emoji as (typeof REACTION_EMOJIS)[number])
                }
              >
                <span>{reaction.emoji}</span>
                <span>{reaction.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this message?</DialogTitle>
            <DialogDescription>
              This removes the message and its attachment records from the
              conversation.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onDelete();
                setConfirmDelete(false);
              }}
            >
              Delete Message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}

function Composer({
  channel,
  participants,
  replyTo,
  onCancelReply,
  onSent,
  canPost,
}: {
  channel: Channel;
  participants: Person[];
  replyTo: MessageRow | null;
  onCancelReply: () => void;
  onSent: () => void;
  canPost: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [stagedAttachments, setStagedAttachments] = useState<
    StagedAttachment[]
  >([]);
  const [mentionIds, setMentionIds] = useState<number[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const lastAt = draft.lastIndexOf("@");
  const mentionQuery =
    lastAt >= 0 && /(^|\s)@[^\n@]*$/.test(draft)
      ? draft.slice(lastAt + 1).toLowerCase()
      : "";
  const mentionChoices = participants
    .filter(person => displayName(person).toLowerCase().includes(mentionQuery))
    .slice(0, 6);
  const sendMessage = trpc.chat.messages.send.useMutation({
    onSuccess: () => {
      setDraft("");
      setStagedAttachments([]);
      setMentionIds([]);
      onCancelReply();
      onSent();
    },
    onError: error => toast.error(error.message),
  });
  useEffect(() => {
    setDraft("");
    setStagedAttachments([]);
    setMentionIds([]);
    onCancelReply();
  }, [channel.id]);
  const attachFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    if (stagedAttachments.length + files.length > 10) {
      toast.error("You can attach up to 10 files to one message.");
      return;
    }
    setIsUploading(true);
    try {
      const uploaded: StagedAttachment[] = [];
      for (const file of files) {
        const form = new FormData();
        form.append("channelId", String(channel.id));
        form.append("file", file);
        const response = await fetch("/api/chat/attachments/upload", {
          method: "POST",
          credentials: "include",
          body: form,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(payload.error ?? `Could not upload ${file.name}`);
        uploaded.push(payload);
      }
      setStagedAttachments(current => [...current, ...uploaded]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not upload attachment"
      );
    } finally {
      setIsUploading(false);
    }
  };
  const chooseMention = (person: Person) => {
    const before = draft.slice(0, lastAt);
    setDraft(`${before}@${displayName(person)} `);
    setMentionIds(current =>
      current.includes(person.id) ? current : [...current, person.id]
    );
    setMentionOpen(false);
  };
  const submit = () => {
    if (
      !canPost ||
      (!draft.trim() && !stagedAttachments.length) ||
      sendMessage.isPending ||
      isUploading
    )
      return;
    sendMessage.mutate({
      channelId: channel.id,
      body: draft.trim(),
      attachmentIds: stagedAttachments.map(item => item.id),
      mentionUserIds: mentionIds,
      parentMessageId: replyTo?.message.id ?? null,
    });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "@") setMentionOpen(true);
    if (event.key === "Escape") setMentionOpen(false);
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !(event.nativeEvent as any).isComposing
    ) {
      event.preventDefault();
      submit();
    }
  };
  return (
    <div className="shrink-0 border-t bg-background px-4 py-3 md:px-6">
      <div className="relative mx-auto max-w-4xl">
        {!canPost && (
          <p className="mb-2 text-sm text-muted-foreground">
            Only Chat Admins can post in this announcement channel.
          </p>
        )}
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border-l-2 border-primary bg-muted/60 px-3 py-2 text-xs">
            <Reply className="h-3.5 w-3.5 text-primary" />
            <span className="min-w-0 flex-1 truncate">
              Replying to <strong>{displayName(replyTo.sender)}</strong>:{" "}
              {replyTo.message.body || "Attachment"}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={onCancelReply}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {stagedAttachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {stagedAttachments.map(attachment => (
              <span
                key={attachment.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs"
              >
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span className="max-w-48 truncate">{attachment.fileName}</span>
                <span className="text-muted-foreground">
                  {formatFileSize(attachment.fileSize)}
                </span>
                <button
                  type="button"
                  className="ml-0.5 text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    setStagedAttachments(current =>
                      current.filter(item => item.id !== attachment.id)
                    )
                  }
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        {mentionOpen && lastAt >= 0 && (
          <div className="absolute bottom-full left-0 z-30 mb-2 w-72 overflow-hidden rounded-lg border bg-popover shadow-lg">
            <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
              Mention someone in this conversation
            </div>
            {mentionChoices.length ? (
              mentionChoices.map(person => (
                <button
                  key={person.id}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
                  onMouseDown={event => {
                    event.preventDefault();
                    chooseMention(person);
                  }}
                >
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={person.profilePhotoUrl ?? undefined} />
                    <AvatarFallback className="text-[8px]">
                      {initials(displayName(person))}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0">
                    <span className="block truncate text-sm">
                      {displayName(person)}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {roleLabel(person.role)}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <p className="px-3 py-3 text-sm text-muted-foreground">
                No conversation participant matches.
              </p>
            )}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,image/jpeg,image/png,image/webp,image/gif"
            onChange={attachFiles}
          />
          <Button
            size="icon"
            variant="outline"
            className="h-11 w-11 shrink-0"
            title="Attach files or images"
            disabled={!canPost || isUploading || stagedAttachments.length >= 10}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </Button>
          <Textarea
            value={draft}
            maxLength={8000}
            className="min-h-[48px] max-h-32 resize-none"
            placeholder={
              channel.type === "direct"
                ? "Write a direct message"
                : `Message #${channel.name}`
            }
            disabled={!canPost}
            onChange={event => {
              setDraft(event.target.value);
              if (event.target.value.lastIndexOf("@") >= 0)
                setMentionOpen(true);
            }}
            onKeyDown={onKeyDown}
          />
          <Button
            size="icon"
            className="h-11 w-11 shrink-0"
            disabled={
              !canPost ||
              (!draft.trim() && !stagedAttachments.length) ||
              sendMessage.isPending ||
              isUploading
            }
            onClick={submit}
          >
            {sendMessage.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
      <p className="mx-auto mt-1.5 max-w-4xl text-[11px] text-muted-foreground">
        Type @ to mention someone · Attach up to 10 files · Enter to send ·
        Shift + Enter for a new line
      </p>
    </div>
  );
}

export default function ChatPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: access, isLoading: accessLoading } =
    trpc.chat.access.useQuery(undefined, { refetchInterval: 30000 });
  const { data: workspace, isLoading: workspaceLoading } =
    trpc.chat.workspace.useQuery(undefined, {
      enabled: !!access?.canAccess,
      refetchInterval: 12_000,
    });
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(
    null
  );
  const [pendingChannelId, setPendingChannelId] = useState<number | null>(null);
  const openManageWhenReadyRef = useRef(false);
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [newMessageMode, setNewMessageMode] = useState<PersonalChatMode>("direct");
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newSectionOpen, setNewSectionOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [chatAccessManagementOpen, setChatAccessManagementOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [manageGroupOpen, setManageGroupOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(
    new Set()
  );
  const [myChatsCollapsed, setMyChatsCollapsed] = useState(false);
  const [showAllMyChats, setShowAllMyChats] = useState(false);
  const [replyTo, setReplyTo] = useState<MessageRow | null>(null);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [manualUnread, setManualUnread] = useState(false);
  const messageScrollAreaRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<number | null>(null);
  const lastMarkedReadMessageIdRef = useRef<number | null>(null);
  const isNearMessageBottomRef = useRef(true);
  const sectionGroups = (workspace?.sections ?? []) as WorkspaceSection[];
  const unsectioned = (workspace?.unsectioned ?? []) as Channel[];
  const personalChats = (workspace?.personalChats ?? []) as PersonalChat[];
  const allGroups = useMemo(
    () => [...sectionGroups.flatMap(item => item.groups), ...unsectioned],
    [sectionGroups, unsectioned]
  );
  const allChannels = useMemo(
    () => [...allGroups, ...personalChats.map(item => item.channel)],
    [allGroups, personalChats]
  );
  const selectedChannel =
    allChannels.find(channel => channel.id === selectedChannelId) ?? null;
  const selectedPersonal =
    personalChats.find(item => item.channel.id === selectedChannelId) ?? null;
  const allSections = sectionGroups.map(item => item.section);
  const visiblePersonalChats = showAllMyChats
    ? personalChats
    : personalChats.slice(0, 3);
  useEffect(() => {
    if (pendingChannelId && allChannels.some(channel => channel.id === pendingChannelId)) {
      setSelectedChannelId(pendingChannelId);
      setPendingChannelId(null);
      if (openManageWhenReadyRef.current) {
        openManageWhenReadyRef.current = false;
        setManageGroupOpen(true);
      }
      return;
    }
    if (!selectedChannelId && !pendingChannelId && allChannels[0])
      setSelectedChannelId(allChannels[0].id);
    if (
      selectedChannelId &&
      !pendingChannelId &&
      !allChannels.some(channel => channel.id === selectedChannelId)
    )
      setSelectedChannelId(allChannels[0]?.id ?? null);
  }, [allChannels, pendingChannelId, selectedChannelId]);
  const { data: messages = [], isLoading: messagesLoading } =
    trpc.chat.messages.list.useQuery(
      { channelId: selectedChannelId ?? 0, limit: 100 },
      { enabled: selectedChannelId != null, refetchInterval: 5_000 }
    );
  const { data: participants = [] } = trpc.chat.participants.list.useQuery(
    { channelId: selectedChannelId ?? 0 },
    { enabled: selectedChannelId != null, staleTime: 30_000 }
  );
  const { data: readState } = trpc.chat.messages.readState.useQuery(
    { channelId: selectedChannelId ?? 0 },
    { enabled: selectedChannelId != null, staleTime: 5_000 }
  );
  const markRead = trpc.chat.messages.markRead.useMutation({
    onSuccess: () => {
      void utils.chat.workspace.invalidate();
      void utils.chat.messages.readState.invalidate();
    },
  });
  const markUnread = trpc.chat.messages.markUnread.useMutation({
    onSuccess: () => {
      setManualUnread(true);
      setNewMessageCount(0);
      void utils.chat.workspace.invalidate();
      void utils.chat.messages.readState.invalidate();
      toast.success("Marked unread from this message");
    },
    onError: error => toast.error(error.message),
  });
  const updateMessage = trpc.chat.messages.update.useMutation({
    onSuccess: () => {
      refreshConversation();
      toast.success("Message updated");
    },
    onError: error => toast.error(error.message),
  });
  const deleteMessage = trpc.chat.messages.delete.useMutation({
    onSuccess: () => {
      refreshConversation();
      toast.success("Message deleted");
    },
    onError: error => toast.error(error.message),
  });
  const toggleReaction = trpc.chat.reactions.toggle.useMutation({
    onSuccess: () => refreshConversation(),
    onError: error => toast.error(error.message),
  });
  const archivePersonal = trpc.chat.conversations.archive.useMutation({
    onSuccess: () => {
      toast.success("Chat archived from My Chats");
      setReplyTo(null);
      refreshConversation();
    },
    onError: error => toast.error(error.message),
  });
  const refreshConversation = () => {
    void utils.chat.workspace.invalidate();
    if (selectedChannelId) {
      void utils.chat.messages.list.invalidate({
        channelId: selectedChannelId,
        limit: 100,
      });
      void utils.chat.participants.list.invalidate({
        channelId: selectedChannelId,
      });
    }
  };
  const getMessageViewport = useCallback(
    () =>
      messageScrollAreaRef.current?.querySelector<HTMLElement>(
        '[data-slot="scroll-area-viewport"]'
      ) ?? null,
    []
  );
  const scrollToLatestMessage = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const viewport = getMessageViewport();
      if (!viewport) return;
      viewport.scrollTo({ top: viewport.scrollHeight, behavior });
      isNearMessageBottomRef.current = true;
      setNewMessageCount(0);
    },
    [getMessageViewport]
  );
  const markVisibleMessagesRead = useCallback(() => {
    if (!selectedChannelId || manualUnread) return;
    const viewport = getMessageViewport();
    if (!viewport) return;
    const viewportRect = viewport.getBoundingClientRect();
    let lastVisibleMessageId: number | null = null;
    for (const messageElement of Array.from(
      viewport.querySelectorAll<HTMLElement>("[data-chat-message-id]")
    )) {
      const rect = messageElement.getBoundingClientRect();
      if (
        rect.top < viewportRect.bottom - 4 &&
        rect.bottom > viewportRect.top + 4
      ) {
        const messageId = Number(messageElement.dataset.chatMessageId);
        if (Number.isFinite(messageId)) lastVisibleMessageId = messageId;
      }
    }
    if (
      lastVisibleMessageId &&
      lastVisibleMessageId > (lastMarkedReadMessageIdRef.current ?? 0)
    ) {
      lastMarkedReadMessageIdRef.current = lastVisibleMessageId;
      markRead.mutate({
        channelId: selectedChannelId,
        messageId: lastVisibleMessageId,
      });
    }
  }, [getMessageViewport, manualUnread, markRead, selectedChannelId]);
  useEffect(() => {
    lastMessageIdRef.current = null;
    lastMarkedReadMessageIdRef.current = null;
    isNearMessageBottomRef.current = true;
    setNewMessageCount(0);
    setManualUnread(false);
  }, [selectedChannelId]);
  useEffect(() => {
    const rows = messages as MessageRow[];
    const latestMessageId = rows[rows.length - 1]?.message.id ?? null;
    if (!latestMessageId) {
      lastMessageIdRef.current = null;
      return;
    }
    const previousMessageId = lastMessageIdRef.current;
    if (previousMessageId === null) {
      window.requestAnimationFrame(() => {
        scrollToLatestMessage("auto");
        markVisibleMessagesRead();
      });
    } else if (latestMessageId > previousMessageId) {
      if (isNearMessageBottomRef.current) {
        window.requestAnimationFrame(() => {
          scrollToLatestMessage();
          markVisibleMessagesRead();
        });
      } else {
        setNewMessageCount(
          current => current + (latestMessageId - previousMessageId)
        );
      }
    }
    lastMessageIdRef.current = latestMessageId;
  }, [markVisibleMessagesRead, messages, scrollToLatestMessage]);
  useEffect(() => {
    const viewport = getMessageViewport();
    if (!viewport) return;
    let frame: number | null = null;
    const onScroll = () => {
      isNearMessageBottomRef.current =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 80;
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        markVisibleMessagesRead();
        frame = null;
      });
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [
    getMessageViewport,
    markVisibleMessagesRead,
    selectedChannelId,
    (messages as MessageRow[]).length,
  ]);
  if (accessLoading)
    return (
      <div className="flex h-full min-h-[360px] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  if (!access?.canAccess) {
    navigate("/");
    return null;
  }
  const title = selectedPersonal?.title ?? selectedChannel?.name ?? "";
  const description =
    selectedPersonal?.channel.type === "direct"
      ? `Direct message with ${title}`
      : selectedChannel?.description;
  const canArchivePersonal = !!selectedChannel && !selectedChannel.isPermanent;
  const canPostInSelectedChannel =
    selectedChannel?.name.toLowerCase() !== "announcements" ||
    !!workspace?.isChatAdmin;
  const messageRows = messages as MessageRow[];
  const firstUnreadMessageId = messageRows.find(
    row =>
      row.message.id > (readState?.lastReadMessageId ?? 0) &&
      row.message.senderId !== user?.id
  )?.message.id;
  const chooseChannel = (channelId: number) => {
    setSelectedChannelId(channelId);
    setPendingChannelId(null);
    openManageWhenReadyRef.current = false;
    setReplyTo(null);
    setMobileNavigationOpen(false);
  };
  const toggleSection = (sectionId: number) =>
    setCollapsedSections(previous => {
      const next = new Set(previous);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  const openPersonalChat = (mode: PersonalChatMode) => {
    setNewMessageMode(mode);
    setNewMessageOpen(true);
  };
  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background">
      <aside className="hidden min-h-0 w-[276px] shrink-0 flex-col border-r bg-muted/20 md:flex">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h1 className="font-semibold">Chat</h1>
          <div className="flex items-center gap-0.5">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title="Search Chat"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-4 w-4" />
            </Button>
            <div className="relative">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                title="Create a chat"
                onClick={() => setCreateMenuOpen(value => !value)}
              >
                <Plus className="h-4 w-4" />
              </Button>
              {createMenuOpen && (
                <div className="absolute right-0 z-30 mt-1 w-48 rounded-lg border bg-popover p-1 shadow-lg">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      setCreateMenuOpen(false);
                      openPersonalChat("direct");
                    }}
                  >
                    <MessageCircle className="h-4 w-4" />
                    New message
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      setCreateMenuOpen(false);
                      openPersonalChat("group");
                    }}
                  >
                    <Users className="h-4 w-4" />
                    New group chat
                  </button>
                  {workspace?.isChatAdmin && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        setCreateMenuOpen(false);
                        setNewGroupOpen(true);
                      }}
                    >
                      <Hash className="h-4 w-4" />
                      New company channel
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1 px-3 py-3">
          <ChatConversationList
            workspaceLoading={workspaceLoading}
            personalChats={personalChats}
            visiblePersonalChats={visiblePersonalChats}
            sectionGroups={sectionGroups}
            unsectioned={unsectioned}
            allChannels={allChannels}
            selectedChannelId={selectedChannelId}
            myChatsCollapsed={myChatsCollapsed}
            showAllMyChats={showAllMyChats}
            collapsedSections={collapsedSections}
            isChatAdmin={!!workspace?.isChatAdmin}
            onToggleMyChats={() => setMyChatsCollapsed(value => !value)}
            onToggleShowAllMyChats={() => setShowAllMyChats(value => !value)}
            onToggleSection={toggleSection}
            onSelect={chooseChannel}
            onWorkspaceChanged={refreshConversation}
          />
        </ScrollArea>
        {workspace?.isChatAdmin && (
          <div className="space-y-2 border-t p-3">
            <Button variant="outline" className="w-full justify-start" onClick={() => setChatAccessManagementOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Chat access
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => setNewSectionOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              New section
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground"
              onClick={() => setArchivedOpen(true)}
            >
              <Archive className="mr-2 h-4 w-4" />
              Archived
            </Button>
          </div>
        )}
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!selectedChannel ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MessageSquare className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">Start a conversation</h2>
            <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Create a direct message or invite several teammates into a private
              group chat.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button onClick={() => openPersonalChat("direct")}>
                <MessageCircle className="mr-2 h-4 w-4" />
                New Message
              </Button>
              <Button variant="outline" onClick={() => openPersonalChat("group")}>
                <Users className="mr-2 h-4 w-4" />
                New Group Chat
              </Button>
              <Button
                variant="outline"
                className="md:hidden"
                onClick={() => setMobileNavigationOpen(true)}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                Browse Chats
              </Button>
            </div>
          </div>
        ) : (
          <>
            <header className="flex min-h-[69px] shrink-0 items-center justify-between gap-3 border-b px-4 py-3 md:px-6">
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 gap-1.5 px-2 md:hidden"
                  title="Browse chats"
                  onClick={() => setMobileNavigationOpen(true)}
                >
                  <MessageSquare className="h-4 w-4" />
                  Chats
                </Button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {selectedPersonal?.person ? (
                      <Avatar className="h-6 w-6">
                        <AvatarImage
                          src={
                            selectedPersonal.person.profilePhotoUrl ?? undefined
                          }
                        />
                        <AvatarFallback className="text-[9px]">
                          {initials(title)}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <Hash className="h-5 w-5 shrink-0 text-muted-foreground" />
                    )}
                    <h2 className="truncate text-lg font-semibold">{title}</h2>
                  </div>
                  {description && (
                    <p className="mt-0.5 truncate pl-7 text-xs text-muted-foreground">
                      {description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canArchivePersonal && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      archivePersonal.mutate({ channelId: selectedChannel.id })
                    }
                  >
                    <Archive className="mr-1.5 h-3.5 w-3.5" />
                    Archive
                  </Button>
                )}
                {workspace?.isChatAdmin && selectedChannel.isPermanent && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setManageGroupOpen(true)}
                  >
                    <Settings2 className="mr-1.5 h-3.5 w-3.5" />
                    Manage
                  </Button>
                )}
              </div>
            </header>
            <div className="relative min-h-0 flex-1">
              <ScrollArea ref={messageScrollAreaRef} className="h-full">
                <div className="mx-auto max-w-4xl space-y-5 px-4 py-5 md:px-6">
                  {messagesLoading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : messageRows.length === 0 ? (
                    <div className="rounded-xl border border-dashed py-14 text-center">
                      <MessageSquare className="mx-auto mb-3 h-7 w-7 text-muted-foreground/50" />
                      <p className="font-medium">No messages yet</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Start the conversation in{" "}
                        {selectedChannel.type === "group" ? `#${title}` : title}
                        .
                      </p>
                    </div>
                  ) : (
                    messageRows.map(row => (
                      <div
                        key={row.message.id}
                        data-chat-message-id={row.message.id}
                      >
                        {firstUnreadMessageId === row.message.id && (
                          <div className="flex items-center gap-3 py-1 text-xs font-medium text-primary">
                            <span className="h-px flex-1 bg-primary/30" />
                            New messages
                            <span className="h-px flex-1 bg-primary/30" />
                          </div>
                        )}
                        <ChatMessage
                          row={row}
                          meId={user?.id ?? null}
                          onUpdate={body =>
                            updateMessage.mutate({
                              messageId: row.message.id,
                              body,
                            })
                          }
                          onDelete={() =>
                            deleteMessage.mutate({ messageId: row.message.id })
                          }
                          onReply={() => setReplyTo(row)}
                          onReact={emoji =>
                            toggleReaction.mutate({
                              messageId: row.message.id,
                              emoji,
                            })
                          }
                          onMarkUnread={() =>
                            markUnread.mutate({ messageId: row.message.id })
                          }
                        />
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
              {newMessageCount > 0 && (
                <div className="absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
                  <Button
                    size="sm"
                    className="rounded-full shadow-lg"
                    onClick={() => scrollToLatestMessage()}
                  >
                    {newMessageCount} new{" "}
                    {newMessageCount === 1 ? "message" : "messages"}
                    <ChevronDown className="ml-1.5 h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <Composer
              channel={selectedChannel}
              participants={participants as Person[]}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              onSent={refreshConversation}
              canPost={canPostInSelectedChannel}
            />
          </>
        )}
      </main>
      <Dialog
        open={mobileNavigationOpen}
        onOpenChange={setMobileNavigationOpen}
      >
        <DialogContent showCloseButton={false} className="inset-0 h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 p-0 sm:hidden">
          <div className="flex items-center justify-between gap-2 border-b px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="flex min-w-0 items-center gap-2">
              <Button variant="outline" size="sm" className="h-10 shrink-0 gap-1 px-2" onClick={() => setMobileNavigationOpen(false)}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <DialogHeader className="min-w-0 gap-0 text-left">
                <DialogTitle>Chats</DialogTitle>
                <DialogDescription className="truncate text-xs">Your conversations</DialogDescription>
              </DialogHeader>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9"
                title="Search Chat"
                onClick={() => {
                  setMobileNavigationOpen(false);
                  setSearchOpen(true);
                }}
              >
                <Search className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm">
                    <Plus className="mr-1.5 h-4 w-4" />
                    New
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={() => {
                      setMobileNavigationOpen(false);
                      openPersonalChat("direct");
                    }}
                  >
                    <MessageCircle className="h-4 w-4" />
                    New message
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setMobileNavigationOpen(false);
                      openPersonalChat("group");
                    }}
                  >
                    <Users className="h-4 w-4" />
                    New group chat
                  </DropdownMenuItem>
                  {workspace?.isChatAdmin && (
                    <DropdownMenuItem onClick={() => { setMobileNavigationOpen(false); setChatAccessManagementOpen(true); }}>
                      <UserPlus className="h-4 w-4" />
                      Chat access
                    </DropdownMenuItem>
                  )}
                  {workspace?.isChatAdmin && (
                    <DropdownMenuItem
                      onClick={() => {
                        setMobileNavigationOpen(false);
                        setNewGroupOpen(true);
                      }}
                    >
                      <Hash className="h-4 w-4" />
                      New company channel
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1 px-3 py-3">
            <ChatConversationList
              workspaceLoading={workspaceLoading}
              personalChats={personalChats}
              visiblePersonalChats={visiblePersonalChats}
              sectionGroups={sectionGroups}
              unsectioned={unsectioned}
              allChannels={allChannels}
              selectedChannelId={selectedChannelId}
              myChatsCollapsed={myChatsCollapsed}
              showAllMyChats={showAllMyChats}
              collapsedSections={collapsedSections}
              isChatAdmin={!!workspace?.isChatAdmin}
              onToggleMyChats={() => setMyChatsCollapsed(value => !value)}
              onToggleShowAllMyChats={() => setShowAllMyChats(value => !value)}
              onToggleSection={toggleSection}
              onSelect={chooseChannel}
              onWorkspaceChanged={refreshConversation}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
      <ChatSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelect={chooseChannel}
      />
      <NewSectionDialog
        open={newSectionOpen}
        onOpenChange={setNewSectionOpen}
        onCreated={refreshConversation}
      />
      <ArchivedChatDialog
        open={archivedOpen}
        onOpenChange={setArchivedOpen}
        onRestored={() => {
          void utils.chat.archived.list.invalidate();
          refreshConversation();
        }}
      />
      <ChatAccessManagementDialog
        open={chatAccessManagementOpen}
        onOpenChange={setChatAccessManagementOpen}
      />
      <NewPermanentGroupDialog
        open={newGroupOpen}
        onOpenChange={setNewGroupOpen}
        sections={allSections}
        onCreated={channelId => {
          refreshConversation();
          openManageWhenReadyRef.current = true;
          setManageGroupOpen(false);
          setPendingChannelId(channelId);
        }}
      />
      <NewMessageDialog
        open={newMessageOpen}
        initialMode={newMessageMode}
        onOpenChange={setNewMessageOpen}
        onOpened={channelId => {
          refreshConversation();
          openManageWhenReadyRef.current = false;
          setPendingChannelId(channelId);
        }}
      />
      <ManageGroupDialog
        group={selectedChannel?.isPermanent ? selectedChannel : null}
        sections={allSections}
        open={manageGroupOpen}
        onOpenChange={setManageGroupOpen}
        onChanged={() => {
          refreshConversation();
        }}
      />
    </div>
  );
}
