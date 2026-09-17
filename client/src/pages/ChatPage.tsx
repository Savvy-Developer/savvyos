import { ChangeEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Archive,
  AtSign,
  ChevronDown,
  ChevronRight,
  FileText,
  Hash,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Reply,
  Send,
  Settings2,
  SmilePlus,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "✅"] as const;

type Channel = {
  id: number;
  sectionId: number | null;
  type: "group" | "direct";
  name: string;
  description: string | null;
  isArchived: boolean;
  unreadCount: number;
  unreadMentionCount: number;
};
type Section = {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
};
type Person = {
  id: number;
  name: string | null;
  email: string | null;
  role: string;
  profilePhotoUrl: string | null;
};
type WorkspaceSection = { section: Section; groups: Channel[] };
type DirectConversation = {
  channel: Channel;
  person: Person;
  unreadCount: number;
  unreadMentionCount: number;
};
type Attachment = {
  id: number;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
};
type ParentMessage = {
  message: { id: number; body: string; senderId: number; createdAt: Date };
  sender: { id: number; name: string | null; email: string | null };
};
type MessageRow = {
  message: {
    id: number;
    channelId: number;
    senderId: number;
    parentMessageId: number | null;
    body: string;
    editedAt: Date | null;
    createdAt: Date;
  };
  sender: Person;
  profilePhotoUrl: string | null;
  attachments: Attachment[];
  mentions: Array<{ id: number; name: string | null; email: string | null }>;
  reactions: Array<{ emoji: string; count: number; reactedByMe: boolean }>;
  parent: ParentMessage | null;
};
type MemberRow = {
  membership: { id: number; channelId: number; userId: number; addedById: number; createdAt: Date };
  user: Person;
  profilePhotoUrl: string | null;
};
type StagedAttachment = { id: number; fileName: string; mimeType: string; fileSize: number };

function displayName(person: { name: string | null; email: string | null }) {
  return person.name?.trim() || person.email?.trim() || "Savvy teammate";
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function roleLabel(role: string) {
  return role === "isa"
    ? "ISA"
    : role === "agent_support"
      ? "Agent Support"
      : role.charAt(0).toUpperCase() + role.slice(1);
}

function formatMessageTime(value: Date) {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat("en-US", {
    month: sameDay ? undefined : "short",
    day: sameDay ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatFileSize(fileSize: number) {
  if (fileSize < 1024 * 1024) return `${Math.max(1, Math.round(fileSize / 1024))} KB`;
  return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mimeType: string) {
  return mimeType.startsWith("image/");
}

function UnreadBadge({ count, mentionCount }: { count: number; mentionCount: number }) {
  if (!count) return null;
  return (
    <span className="ml-auto flex items-center gap-1">
      {mentionCount > 0 && <AtSign className="h-3 w-3 text-amber-500" />}
      <span className="min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-primary-foreground">
        {count > 99 ? "99+" : count}
      </span>
    </span>
  );
}

function ConversationRow({
  channel,
  title,
  person,
  isSelected,
  onSelect,
}: {
  channel: Channel;
  title: string;
  person?: Person | null;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
        isSelected
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {person ? (
        <Avatar className="h-5 w-5 shrink-0">
          <AvatarImage src={person.profilePhotoUrl ?? undefined} />
          <AvatarFallback className="bg-primary/10 text-[8px] text-primary">{initials(title)}</AvatarFallback>
        </Avatar>
      ) : (
        <Hash className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <UnreadBadge count={channel.unreadCount} mentionCount={channel.unreadMentionCount} />
    </button>
  );
}

function NewSectionDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const create = trpc.chat.sections.create.useMutation({
    onSuccess: () => {
      toast.success("Chat section created");
      setName("");
      setDescription("");
      onOpenChange(false);
      onCreated();
    },
    onError: error => toast.error(error.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Chat Section</DialogTitle><DialogDescription>Use sections to keep related group conversations together.</DialogDescription></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5"><Label htmlFor="chat-section-name">Section name</Label><Input id="chat-section-name" value={name} maxLength={100} autoFocus placeholder="e.g. Operations" onChange={event => setName(event.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="chat-section-description">Description <span className="text-muted-foreground">(optional)</span></Label><Textarea id="chat-section-description" value={description} maxLength={500} placeholder="What belongs in this section?" onChange={event => setDescription(event.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate({ name: name.trim(), description: description.trim() || null })}>{create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Section</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewGroupDialog({ open, onOpenChange, sections, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; sections: Section[]; onCreated: (channelId: number) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sectionId, setSectionId] = useState("none");
  const create = trpc.chat.groups.create.useMutation({
    onSuccess: result => {
      toast.success("Chat group created. Add people to make it visible to them.");
      setName(""); setDescription(""); setSectionId("none"); onOpenChange(false); onCreated(result.id);
    },
    onError: error => toast.error(error.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Chat Group</DialogTitle><DialogDescription>A group is private until a Chat Admin adds people to it.</DialogDescription></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5"><Label htmlFor="chat-group-name">Group name</Label><Input id="chat-group-name" value={name} maxLength={100} autoFocus placeholder="e.g. ISA Team" onChange={event => setName(event.target.value)} /></div>
          <div className="space-y-1.5"><Label>Section</Label><Select value={sectionId} onValueChange={setSectionId}><SelectTrigger><SelectValue placeholder="No section" /></SelectTrigger><SelectContent><SelectItem value="none">No section</SelectItem>{sections.map(section => <SelectItem key={section.id} value={String(section.id)}>{section.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="chat-group-description">Purpose <span className="text-muted-foreground">(optional)</span></Label><Textarea id="chat-group-description" value={description} maxLength={500} placeholder="A short description for the people in this group" onChange={event => setDescription(event.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate({ name: name.trim(), description: description.trim() || null, sectionId: sectionId === "none" ? null : Number(sectionId) })}>{create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Group</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewDirectDialog({ open, onOpenChange, onOpened }: { open: boolean; onOpenChange: (open: boolean) => void; onOpened: (channelId: number) => void }) {
  const { data: people = [] } = trpc.chat.people.list.useQuery(undefined, { enabled: open });
  const [query, setQuery] = useState("");
  const openDirect = trpc.chat.directs.open.useMutation({
    onSuccess: result => { toast.success(result.created ? "Direct message started" : "Direct message opened"); onOpenChange(false); onOpened(result.channelId); },
    onError: error => toast.error(error.message),
  });
  const results = (people as Person[]).filter(person => `${displayName(person)} ${person.email ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>New direct message</DialogTitle><DialogDescription>Start a private conversation with a SavvyOS Chat user.</DialogDescription></DialogHeader>
        <Input autoFocus value={query} placeholder="Search people" onChange={event => setQuery(event.target.value)} />
        <ScrollArea className="h-72 rounded-lg border">
          <div className="p-2">{results.map(person => <button key={person.id} type="button" disabled={openDirect.isPending} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted disabled:opacity-50" onClick={() => openDirect.mutate({ userId: person.id })}><Avatar className="h-8 w-8"><AvatarImage src={person.profilePhotoUrl ?? undefined} /><AvatarFallback className="bg-primary/10 text-xs text-primary">{initials(displayName(person))}</AvatarFallback></Avatar><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{displayName(person)}</span><span className="block truncate text-xs text-muted-foreground">{roleLabel(person.role)} · {person.email}</span></span>{openDirect.isPending && <Loader2 className="h-4 w-4 animate-spin" />}</button>)}</div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function ManageGroupDialog({ group, sections, open, onOpenChange, onChanged }: { group: Channel | null; sections: Section[]; open: boolean; onOpenChange: (open: boolean) => void; onChanged: () => void }) {
  const channelId = group?.id ?? 0;
  const { data: people = [] } = trpc.chat.people.list.useQuery(undefined, { enabled: open });
  const { data: members = [] } = trpc.chat.members.list.useQuery({ channelId }, { enabled: open && channelId > 0 });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sectionId, setSectionId] = useState("none");
  const [newMemberId, setNewMemberId] = useState("none");
  const [confirmArchive, setConfirmArchive] = useState(false);
  useEffect(() => { if (group && open) { setName(group.name); setDescription(group.description ?? ""); setSectionId(group.sectionId == null ? "none" : String(group.sectionId)); setNewMemberId("none"); } }, [group, open]);
  const update = trpc.chat.groups.update.useMutation({ onSuccess: () => { toast.success("Chat group updated"); onChanged(); }, onError: error => toast.error(error.message) });
  const archive = trpc.chat.groups.archive.useMutation({ onSuccess: () => { toast.success("Chat group archived"); setConfirmArchive(false); onOpenChange(false); onChanged(); }, onError: error => toast.error(error.message) });
  const addMember = trpc.chat.members.add.useMutation({ onSuccess: () => { toast.success("Person added to this group"); setNewMemberId("none"); onChanged(); }, onError: error => toast.error(error.message) });
  const removeMember = trpc.chat.members.remove.useMutation({ onSuccess: () => { toast.success("Person removed from this group"); onChanged(); }, onError: error => toast.error(error.message) });
  const memberIds = useMemo(() => new Set((members as MemberRow[]).map(row => row.user.id)), [members]);
  const availablePeople = (people as Person[]).filter(person => !memberIds.has(person.id));
  if (!group) return null;
  return <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Manage #{group.name}</DialogTitle><DialogDescription>Chat Admins control group setup and who can see the messages.</DialogDescription></DialogHeader>
        <div className="grid gap-7 py-2 md:grid-cols-2">
          <section className="space-y-4"><div className="flex items-center gap-2 text-sm font-semibold"><Settings2 className="h-4 w-4 text-primary" />Group details</div><div className="space-y-1.5"><Label>Name</Label><Input value={name} maxLength={100} onChange={event => setName(event.target.value)} /></div><div className="space-y-1.5"><Label>Section</Label><Select value={sectionId} onValueChange={setSectionId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No section</SelectItem>{sections.map(section => <SelectItem key={section.id} value={String(section.id)}>{section.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Purpose</Label><Textarea value={description} maxLength={500} onChange={event => setDescription(event.target.value)} /></div><Button className="w-full" disabled={!name.trim() || update.isPending} onClick={() => update.mutate({ id: group.id, name: name.trim(), description: description.trim() || null, sectionId: sectionId === "none" ? null : Number(sectionId) })}>{update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Group Details</Button><div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3"><p className="text-sm font-medium">Archive this group</p><p className="mt-1 text-xs text-muted-foreground">It disappears for all members while retaining the message history.</p><Button variant="outline" size="sm" className="mt-3 text-destructive hover:text-destructive" onClick={() => setConfirmArchive(true)}><Archive className="mr-1.5 h-3.5 w-3.5" />Archive Group</Button></div></section>
          <section className="space-y-4 border-t pt-6 md:border-l md:border-t-0 md:pl-7 md:pt-0"><div className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-primary" />People with access <Badge variant="secondary">{(members as MemberRow[]).length}</Badge></div><p className="text-xs leading-relaxed text-muted-foreground">You can assign groups now. Agents remain unable to open Chat until the agent rollout is enabled.</p><div className="flex gap-2"><Select value={newMemberId} onValueChange={setNewMemberId}><SelectTrigger className="flex-1"><SelectValue placeholder="Add a SavvyOS user" /></SelectTrigger><SelectContent><SelectItem value="none">Select a person</SelectItem>{availablePeople.map(person => <SelectItem key={person.id} value={String(person.id)}>{displayName(person)} · {roleLabel(person.role)}</SelectItem>)}</SelectContent></Select><Button size="icon" title="Add to group" disabled={newMemberId === "none" || addMember.isPending} onClick={() => addMember.mutate({ channelId, userId: Number(newMemberId) })}>{addMember.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}</Button></div><div className="max-h-[315px] space-y-1 overflow-y-auto rounded-lg border p-2">{(members as MemberRow[]).length === 0 ? <p className="px-2 py-6 text-center text-sm text-muted-foreground">No one has been added yet.</p> : (members as MemberRow[]).map(member => <div key={member.membership.id} className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/60"><Avatar className="h-7 w-7"><AvatarImage src={member.profilePhotoUrl ?? undefined} /><AvatarFallback className="bg-primary/10 text-[10px] text-primary">{initials(displayName(member.user))}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{displayName(member.user)}</p><p className="truncate text-xs text-muted-foreground">{roleLabel(member.user.role)} · {member.user.email}</p></div><Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Remove from group" onClick={() => removeMember.mutate({ channelId, userId: member.user.id })}><X className="h-3.5 w-3.5" /></Button></div>)}</div></section>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={confirmArchive} onOpenChange={setConfirmArchive}><DialogContent><DialogHeader><DialogTitle>Archive #{group.name}?</DialogTitle><DialogDescription>This hides the group from every member. Existing messages remain retained.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmArchive(false)}>Cancel</Button><Button variant="destructive" disabled={archive.isPending} onClick={() => archive.mutate({ id: group.id })}>{archive.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Archive Group</Button></DialogFooter></DialogContent></Dialog>
  </>;
}

function AttachmentView({ attachment }: { attachment: Attachment }) {
  if (isImage(attachment.mimeType)) return <a href={attachment.fileUrl} target="_blank" rel="noreferrer" className="mt-2 block w-fit"><img src={attachment.fileUrl} alt={attachment.fileName} className="max-h-64 max-w-full rounded-lg border object-contain" /></a>;
  return <a href={attachment.fileUrl} target="_blank" rel="noreferrer" className="mt-2 flex max-w-sm items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2 transition-colors hover:bg-muted"><FileText className="h-5 w-5 shrink-0 text-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{attachment.fileName}</span><span className="block text-xs text-muted-foreground">{formatFileSize(attachment.fileSize)}</span></span></a>;
}

function ChatMessage({ row, meId, isChatAdmin, onUpdate, onDelete, onReply, onReact }: { row: MessageRow; meId: number | null; isChatAdmin: boolean; onUpdate: (body: string) => void; onDelete: () => void; onReply: () => void; onReact: (emoji: typeof REACTION_EMOJIS[number]) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.message.body);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const canManage = meId === row.message.senderId || isChatAdmin;
  const senderName = displayName(row.sender);
  return <article className="group flex gap-3">
    <Avatar className="h-9 w-9 shrink-0"><AvatarImage src={row.profilePhotoUrl ?? undefined} /><AvatarFallback className="bg-primary/10 text-xs text-primary">{initials(senderName)}</AvatarFallback></Avatar>
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline gap-2"><span className="font-medium">{senderName}</span><span className="text-xs text-muted-foreground">{formatMessageTime(row.message.createdAt)}{row.message.editedAt ? " · edited" : ""}</span><div className="ml-auto hidden items-center gap-0.5 group-hover:flex"><div className="relative"><Button size="icon" variant="ghost" className="h-6 w-6" title="Add reaction" onClick={() => setReactionPickerOpen(open => !open)}><SmilePlus className="h-3.5 w-3.5" /></Button>{reactionPickerOpen && <div className="absolute right-0 z-20 mt-1 flex gap-1 rounded-lg border bg-popover p-1 shadow-lg">{REACTION_EMOJIS.map(emoji => <button key={emoji} type="button" className="rounded p-1 text-base hover:bg-muted" onClick={() => { onReact(emoji); setReactionPickerOpen(false); }}>{emoji}</button>)}</div>}</div><Button size="icon" variant="ghost" className="h-6 w-6" title="Reply" onClick={onReply}><Reply className="h-3 w-3" /></Button>{canManage && <><Button size="icon" variant="ghost" className="h-6 w-6" title="Edit message" onClick={() => { setDraft(row.message.body); setEditing(true); }}><Pencil className="h-3 w-3" /></Button><Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" title="Delete message" onClick={() => setConfirmDelete(true)}><Trash2 className="h-3 w-3" /></Button></>}</div></div>
      {row.parent && <button type="button" className="mt-1.5 block max-w-xl rounded border-l-2 border-primary/50 bg-muted/50 px-2.5 py-1.5 text-left text-xs hover:bg-muted"><span className="font-medium text-primary">Replying to {displayName(row.parent.sender)}</span><span className="mt-0.5 block truncate text-muted-foreground">{row.parent.message.body || "Attachment"}</span></button>}
      {editing ? <div className="mt-1.5 space-y-2"><Textarea value={draft} className="min-h-[84px]" maxLength={8000} onChange={event => setDraft(event.target.value)} /><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button><Button size="sm" disabled={!draft.trim()} onClick={() => { onUpdate(draft.trim()); setEditing(false); }}>Save</Button></div></div> : <>{row.message.body && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{row.message.body}</p>}{row.attachments.map(attachment => <AttachmentView key={attachment.id} attachment={attachment} />)}</>}
      {row.reactions.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{row.reactions.map(reaction => <button key={reaction.emoji} type="button" className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${reaction.reactedByMe ? "border-primary/40 bg-primary/10 text-primary" : "bg-muted/40 hover:bg-muted"}`} onClick={() => onReact(reaction.emoji as typeof REACTION_EMOJIS[number])}><span>{reaction.emoji}</span><span>{reaction.count}</span></button>)}</div>}
    </div>
    <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}><DialogContent><DialogHeader><DialogTitle>Delete this message?</DialogTitle><DialogDescription>This removes the message and its attachment records from the conversation.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button><Button variant="destructive" onClick={() => { onDelete(); setConfirmDelete(false); }}>Delete Message</Button></DialogFooter></DialogContent></Dialog>
  </article>;
}

function Composer({ channel, participants, replyTo, onCancelReply, onSent, refreshConversation }: { channel: Channel; participants: Person[]; replyTo: MessageRow | null; onCancelReply: () => void; onSent: () => void; refreshConversation: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [stagedAttachments, setStagedAttachments] = useState<StagedAttachment[]>([]);
  const [mentionIds, setMentionIds] = useState<number[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const lastAt = draft.lastIndexOf("@");
  const mentionQuery = lastAt >= 0 && /(^|\s)@[^\n@]*$/.test(draft) ? draft.slice(lastAt + 1).toLowerCase() : "";
  const mentionChoices = participants.filter(person => displayName(person).toLowerCase().includes(mentionQuery)).slice(0, 6);
  const sendMessage = trpc.chat.messages.send.useMutation({
    onSuccess: () => { setDraft(""); setStagedAttachments([]); setMentionIds([]); onCancelReply(); onSent(); },
    onError: error => toast.error(error.message),
  });
  useEffect(() => { setDraft(""); setStagedAttachments([]); setMentionIds([]); onCancelReply(); }, [channel.id]);
  const attachFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    if (stagedAttachments.length + files.length > 10) { toast.error("You can attach up to 10 files to one message."); return; }
    setIsUploading(true);
    try {
      const uploaded: StagedAttachment[] = [];
      for (const file of files) {
        const form = new FormData(); form.append("channelId", String(channel.id)); form.append("file", file);
        const response = await fetch("/api/chat/attachments/upload", { method: "POST", credentials: "include", body: form });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? `Could not upload ${file.name}`);
        uploaded.push(payload);
      }
      setStagedAttachments(current => [...current, ...uploaded]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not upload attachment"); }
    finally { setIsUploading(false); }
  };
  const chooseMention = (person: Person) => {
    const before = draft.slice(0, lastAt);
    const replacement = `@${displayName(person)} `;
    setDraft(`${before}${replacement}`);
    setMentionIds(current => current.includes(person.id) ? current : [...current, person.id]);
    setMentionOpen(false);
  };
  const submit = () => {
    if ((!draft.trim() && !stagedAttachments.length) || sendMessage.isPending || isUploading) return;
    sendMessage.mutate({ channelId: channel.id, body: draft.trim(), attachmentIds: stagedAttachments.map(item => item.id), mentionUserIds: mentionIds, parentMessageId: replyTo?.message.id ?? null });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "@") setMentionOpen(true);
    if (event.key === "Escape") setMentionOpen(false);
    if (event.key === "Enter" && !event.shiftKey && !(event.nativeEvent as any).isComposing) { event.preventDefault(); submit(); }
  };
  return <div className="border-t bg-background px-4 py-3 md:px-6"><div className="relative mx-auto max-w-4xl">{replyTo && <div className="mb-2 flex items-center gap-2 rounded-lg border-l-2 border-primary bg-muted/60 px-3 py-2 text-xs"><Reply className="h-3.5 w-3.5 text-primary" /><span className="min-w-0 flex-1 truncate">Replying to <strong>{displayName(replyTo.sender)}</strong>: {replyTo.message.body || "Attachment"}</span><Button size="icon" variant="ghost" className="h-6 w-6" onClick={onCancelReply}><X className="h-3.5 w-3.5" /></Button></div>}{stagedAttachments.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{stagedAttachments.map(attachment => <span key={attachment.id} className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs"><FileText className="h-3.5 w-3.5 text-primary" /><span className="max-w-48 truncate">{attachment.fileName}</span><span className="text-muted-foreground">{formatFileSize(attachment.fileSize)}</span><button type="button" className="ml-0.5 text-muted-foreground hover:text-destructive" onClick={() => setStagedAttachments(current => current.filter(item => item.id !== attachment.id))}><X className="h-3.5 w-3.5" /></button></span>)}</div>}{mentionOpen && lastAt >= 0 && <div className="absolute bottom-full left-0 z-30 mb-2 w-72 overflow-hidden rounded-lg border bg-popover shadow-lg"><div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Mention someone in this conversation</div>{mentionChoices.length ? mentionChoices.map(person => <button key={person.id} type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted" onMouseDown={event => { event.preventDefault(); chooseMention(person); }}><Avatar className="h-6 w-6"><AvatarImage src={person.profilePhotoUrl ?? undefined} /><AvatarFallback className="text-[8px]">{initials(displayName(person))}</AvatarFallback></Avatar><span className="min-w-0"><span className="block truncate text-sm">{displayName(person)}</span><span className="block truncate text-xs text-muted-foreground">{roleLabel(person.role)}</span></span></button>) : <p className="px-3 py-3 text-sm text-muted-foreground">No conversation participant matches.</p>}</div>}<div className="flex items-end gap-2"><input ref={fileInputRef} type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,image/jpeg,image/png,image/webp,image/gif" onChange={attachFiles} /><Button size="icon" variant="outline" className="h-11 w-11 shrink-0" title="Attach files or images" disabled={isUploading || stagedAttachments.length >= 10} onClick={() => fileInputRef.current?.click()}>{isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}</Button><Textarea value={draft} maxLength={8000} className="min-h-[48px] max-h-32 resize-none" placeholder={channel.type === "direct" ? "Write a direct message" : `Message #${channel.name}`} onChange={event => { setDraft(event.target.value); if (event.target.value.lastIndexOf("@") >= 0) setMentionOpen(true); }} onKeyDown={onKeyDown} /><Button size="icon" className="h-11 w-11 shrink-0" disabled={(!draft.trim() && !stagedAttachments.length) || sendMessage.isPending || isUploading} onClick={submit}>{sendMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button></div></div><p className="mx-auto mt-1.5 max-w-4xl text-[11px] text-muted-foreground">Type @ to mention someone · Attach up to 10 files · Enter to send · Shift + Enter for a new line</p></div>;
}

export default function ChatPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: access, isLoading: accessLoading } = trpc.chat.access.useQuery();
  const { data: workspace, isLoading: workspaceLoading } = trpc.chat.workspace.useQuery(undefined, { enabled: !!access?.canAccess, refetchInterval: 12_000 });
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newSectionOpen, setNewSectionOpen] = useState(false);
  const [newDirectOpen, setNewDirectOpen] = useState(false);
  const [manageGroupOpen, setManageGroupOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());
  const [replyTo, setReplyTo] = useState<MessageRow | null>(null);
  const messageBottomRef = useRef<HTMLDivElement>(null);
  const sectionGroups = (workspace?.sections ?? []) as WorkspaceSection[];
  const unsectioned = (workspace?.unsectioned ?? []) as Channel[];
  const directs = (workspace?.directs ?? []) as DirectConversation[];
  const allGroups = useMemo(() => [...sectionGroups.flatMap(item => item.groups), ...unsectioned], [sectionGroups, unsectioned]);
  const allChannels = useMemo(() => [...allGroups, ...directs.map(item => item.channel)], [allGroups, directs]);
  const selectedChannel = allChannels.find(channel => channel.id === selectedChannelId) ?? null;
  const selectedDirect = directs.find(item => item.channel.id === selectedChannelId) ?? null;
  const allSections = sectionGroups.map(item => item.section);
  useEffect(() => { if (!selectedChannelId && allChannels[0]) setSelectedChannelId(allChannels[0].id); if (selectedChannelId && !allChannels.some(channel => channel.id === selectedChannelId)) setSelectedChannelId(allChannels[0]?.id ?? null); }, [allChannels, selectedChannelId]);
  const { data: messages = [], isLoading: messagesLoading } = trpc.chat.messages.list.useQuery({ channelId: selectedChannelId ?? 0, limit: 100 }, { enabled: selectedChannelId != null, refetchInterval: 5_000 });
  const { data: participants = [] } = trpc.chat.participants.list.useQuery({ channelId: selectedChannelId ?? 0 }, { enabled: selectedChannelId != null, staleTime: 30_000 });
  const markRead = trpc.chat.messages.markRead.useMutation({ onSuccess: () => void utils.chat.workspace.invalidate() });
  const updateMessage = trpc.chat.messages.update.useMutation({ onSuccess: () => { refreshConversation(); toast.success("Message updated"); }, onError: error => toast.error(error.message) });
  const deleteMessage = trpc.chat.messages.delete.useMutation({ onSuccess: () => { refreshConversation(); toast.success("Message deleted"); }, onError: error => toast.error(error.message) });
  const toggleReaction = trpc.chat.reactions.toggle.useMutation({ onSuccess: () => refreshConversation(), onError: error => toast.error(error.message) });
  const refreshConversation = () => { void utils.chat.workspace.invalidate(); if (selectedChannelId) { void utils.chat.messages.list.invalidate({ channelId: selectedChannelId, limit: 100 }); void utils.chat.participants.list.invalidate({ channelId: selectedChannelId }); } };
  useEffect(() => { const rows = messages as MessageRow[]; messageBottomRef.current?.scrollIntoView({ behavior: "smooth" }); if (selectedChannelId && rows.length) markRead.mutate({ channelId: selectedChannelId, messageId: rows[rows.length - 1].message.id }); }, [selectedChannelId, (messages as MessageRow[]).length]);
  if (accessLoading) return <div className="flex h-full min-h-[360px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  if (!access?.canAccess) { navigate("/"); return null; }
  const title = selectedDirect ? displayName(selectedDirect.person) : selectedChannel?.name ?? "";
  const description = selectedDirect ? `Direct message with ${displayName(selectedDirect.person)}` : selectedChannel?.description;
  return <div className="-m-4 flex h-[calc(100vh-56px)] min-h-[520px] overflow-hidden bg-background md:-m-6">
    <aside className="hidden w-[276px] shrink-0 flex-col border-r bg-muted/20 md:flex"><div className="flex items-center justify-between border-b px-4 py-4"><div className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-primary" /><div><h1 className="font-semibold">Chat</h1><p className="text-[11px] text-muted-foreground">SavvyOS conversations</p></div></div><div className="flex"><Button size="icon" variant="ghost" className="h-8 w-8" title="New direct message" onClick={() => setNewDirectOpen(true)}><MessageCircle className="h-4 w-4" /></Button>{workspace?.isChatAdmin && <Button size="icon" variant="ghost" className="h-8 w-8" title="Create Chat group" onClick={() => setNewGroupOpen(true)}><Plus className="h-4 w-4" /></Button>}</div></div><ScrollArea className="flex-1 px-3 py-3">{workspaceLoading ? <div className="space-y-2 px-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading conversations...</div> : <div className="space-y-4">{directs.length > 0 && <div><p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Direct messages</p><div className="space-y-0.5">{directs.map(item => <ConversationRow key={item.channel.id} channel={{ ...item.channel, unreadCount: item.unreadCount, unreadMentionCount: item.unreadMentionCount }} title={displayName(item.person)} person={item.person} isSelected={selectedChannelId === item.channel.id} onSelect={() => { setSelectedChannelId(item.channel.id); setReplyTo(null); }} />)}</div></div>}{sectionGroups.map(({ section, groups }) => { const isCollapsed = collapsedSections.has(section.id); return <div key={section.id}><div className="mb-1 flex items-center justify-between px-1"><button type="button" className="flex min-w-0 items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground" onClick={() => setCollapsedSections(previous => { const next = new Set(previous); if (next.has(section.id)) next.delete(section.id); else next.add(section.id); return next; })}>{isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}<span className="truncate">{section.name}</span></button></div>{!isCollapsed && <div className="space-y-0.5">{groups.map(group => <ConversationRow key={group.id} channel={group} title={group.name} isSelected={selectedChannelId === group.id} onSelect={() => { setSelectedChannelId(group.id); setReplyTo(null); }} />)}</div>}</div>; })}{unsectioned.length > 0 && <div><p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Other</p><div className="space-y-0.5">{unsectioned.map(group => <ConversationRow key={group.id} channel={group} title={group.name} isSelected={selectedChannelId === group.id} onSelect={() => { setSelectedChannelId(group.id); setReplyTo(null); }} />)}</div></div>}{allChannels.length === 0 && <div className="rounded-lg border border-dashed px-3 py-7 text-center text-xs text-muted-foreground"><MessageSquare className="mx-auto mb-2 h-5 w-5 opacity-50" />No conversations yet.</div>}</div>}</ScrollArea>{workspace?.isChatAdmin && <div className="border-t p-3"><Button variant="outline" className="w-full justify-start" onClick={() => setNewSectionOpen(true)}><Plus className="mr-2 h-4 w-4" />New section</Button></div>}</aside>
    <main className="flex min-w-0 flex-1 flex-col">{!selectedChannel ? <div className="flex flex-1 flex-col items-center justify-center px-6 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><MessageSquare className="h-6 w-6" /></div><h2 className="mt-4 text-lg font-semibold">Start a SavvyOS conversation</h2><p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">Create a direct message or a private group. Conversations only appear for the people who are entitled to see them.</p><Button className="mt-5" onClick={() => setNewDirectOpen(true)}><MessageCircle className="mr-2 h-4 w-4" />New direct message</Button></div> : <><header className="flex min-h-[69px] items-center justify-between gap-3 border-b px-4 py-3 md:px-6"><div className="min-w-0"><div className="flex items-center gap-2">{selectedDirect ? <Avatar className="h-6 w-6"><AvatarImage src={selectedDirect.person.profilePhotoUrl ?? undefined} /><AvatarFallback className="text-[9px]">{initials(title)}</AvatarFallback></Avatar> : <Hash className="h-5 w-5 shrink-0 text-muted-foreground" />}<h2 className="truncate text-lg font-semibold">{title}</h2></div>{description && <p className="mt-0.5 truncate pl-7 text-xs text-muted-foreground">{description}</p>}</div>{workspace?.isChatAdmin && selectedChannel.type === "group" && <Button variant="outline" size="sm" onClick={() => setManageGroupOpen(true)}><Settings2 className="mr-1.5 h-3.5 w-3.5" />Manage</Button>}</header><ScrollArea className="flex-1"><div className="mx-auto max-w-4xl space-y-5 px-4 py-5 md:px-6">{messagesLoading ? <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : (messages as MessageRow[]).length === 0 ? <div className="rounded-xl border border-dashed py-14 text-center"><MessageSquare className="mx-auto mb-3 h-7 w-7 text-muted-foreground/50" /><p className="font-medium">No messages yet</p><p className="mt-1 text-sm text-muted-foreground">Start the conversation in {selectedChannel.type === "group" ? `#${title}` : title}.</p></div> : (messages as MessageRow[]).map(row => <ChatMessage key={row.message.id} row={row} meId={user?.id ?? null} isChatAdmin={!!workspace?.isChatAdmin && selectedChannel.type === "group"} onUpdate={body => updateMessage.mutate({ messageId: row.message.id, body })} onDelete={() => deleteMessage.mutate({ messageId: row.message.id })} onReply={() => setReplyTo(row)} onReact={emoji => toggleReaction.mutate({ messageId: row.message.id, emoji })} />)}<div ref={messageBottomRef} /></div></ScrollArea><Composer channel={selectedChannel} participants={participants as Person[]} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onSent={refreshConversation} refreshConversation={refreshConversation} /></>}</main>
    <NewSectionDialog open={newSectionOpen} onOpenChange={setNewSectionOpen} onCreated={refreshConversation} /><NewGroupDialog open={newGroupOpen} onOpenChange={setNewGroupOpen} sections={allSections} onCreated={channelId => { refreshConversation(); setSelectedChannelId(channelId); setManageGroupOpen(true); }} /><NewDirectDialog open={newDirectOpen} onOpenChange={setNewDirectOpen} onOpened={channelId => { refreshConversation(); setSelectedChannelId(channelId); }} /><ManageGroupDialog group={selectedChannel?.type === "group" ? selectedChannel : null} sections={allSections} open={manageGroupOpen} onOpenChange={setManageGroupOpen} onChanged={refreshConversation} />
  </div>;
}
