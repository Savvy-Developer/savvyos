import { useEffect, useMemo, useRef, useState } from "react";
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
  ChevronDown,
  ChevronRight,
  Hash,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Send,
  Settings2,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

type Group = {
  id: number;
  sectionId: number | null;
  name: string;
  description: string | null;
  isArchived: boolean;
  createdById: number;
  createdAt: Date;
  updatedAt: Date;
};
type Section = {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
  isArchived: boolean;
  createdById: number;
  createdAt: Date;
  updatedAt: Date;
};
type WorkspaceSection = { section: Section; groups: Group[] };
type MessageRow = {
  message: {
    id: number;
    channelId: number;
    senderId: number;
    body: string;
    editedAt: Date | null;
    createdAt: Date;
  };
  sender: {
    id: number;
    name: string | null;
    email: string | null;
    role: string;
  };
  profilePhotoUrl: string | null;
};
type Person = {
  id: number;
  name: string | null;
  email: string | null;
  role: string;
  profilePhotoUrl: string | null;
};
type MemberRow = {
  membership: {
    id: number;
    channelId: number;
    userId: number;
    addedById: number;
    createdAt: Date;
  };
  user: { id: number; name: string | null; email: string | null; role: string };
  profilePhotoUrl: string | null;
};

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

function GroupRow({
  group,
  isSelected,
  onSelect,
}: {
  group: Group;
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
      <Hash className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{group.name}</span>
    </button>
  );
}

function NewSectionDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
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
        <DialogHeader>
          <DialogTitle>New Chat Section</DialogTitle>
          <DialogDescription>
            Use sections to keep related group conversations together.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="chat-section-name">Section name</Label>
            <Input
              id="chat-section-name"
              value={name}
              maxLength={100}
              autoFocus
              placeholder="e.g. Operations"
              onChange={event => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="chat-section-description">
              Description{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="chat-section-description"
              value={description}
              maxLength={500}
              placeholder="What belongs in this section?"
              onChange={event => setDescription(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || create.isPending}
            onClick={() =>
              create.mutate({
                name: name.trim(),
                description: description.trim() || null,
              })
            }
          >
            {create.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Create Section
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewGroupDialog({
  open,
  onOpenChange,
  sections,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: Section[];
  onCreated: (groupId: number) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sectionId, setSectionId] = useState("none");
  const create = trpc.chat.groups.create.useMutation({
    onSuccess: result => {
      toast.success(
        "Chat group created. Add people to make it visible to them."
      );
      setName("");
      setDescription("");
      setSectionId("none");
      onOpenChange(false);
      onCreated(result.id);
    },
    onError: error => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Chat Group</DialogTitle>
          <DialogDescription>
            A group is a private conversation. People see it only after a Chat
            Admin adds them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="chat-group-name">Group name</Label>
            <Input
              id="chat-group-name"
              value={name}
              maxLength={100}
              autoFocus
              placeholder="e.g. ISA Team"
              onChange={event => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Section</Label>
            <Select value={sectionId} onValueChange={setSectionId}>
              <SelectTrigger>
                <SelectValue placeholder="No section" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No section</SelectItem>
                {sections.map(section => (
                  <SelectItem key={section.id} value={String(section.id)}>
                    {section.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="chat-group-description">
              Purpose <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="chat-group-description"
              value={description}
              maxLength={500}
              placeholder="A short description for the people in this group"
              onChange={event => setDescription(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || create.isPending}
            onClick={() =>
              create.mutate({
                name: name.trim(),
                description: description.trim() || null,
                sectionId: sectionId === "none" ? null : Number(sectionId),
              })
            }
          >
            {create.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Create Group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageGroupDialog({
  group,
  sections,
  open,
  onOpenChange,
  onChanged,
}: {
  group: Group | null;
  sections: Section[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const groupId = group?.id ?? 0;
  const { data: people = [] } = trpc.chat.people.list.useQuery(undefined, {
    enabled: open,
  });
  const { data: members = [] } = trpc.chat.members.list.useQuery(
    { groupId },
    { enabled: open && groupId > 0 }
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sectionId, setSectionId] = useState("none");
  const [newMemberId, setNewMemberId] = useState("none");
  const [confirmArchive, setConfirmArchive] = useState(false);

  useEffect(() => {
    if (!group || !open) return;
    setName(group.name);
    setDescription(group.description ?? "");
    setSectionId(group.sectionId == null ? "none" : String(group.sectionId));
    setNewMemberId("none");
  }, [group, open]);

  const update = trpc.chat.groups.update.useMutation({
    onSuccess: () => {
      toast.success("Chat group updated");
      onChanged();
    },
    onError: error => toast.error(error.message),
  });
  const archive = trpc.chat.groups.archive.useMutation({
    onSuccess: () => {
      toast.success("Chat group archived");
      setConfirmArchive(false);
      onOpenChange(false);
      onChanged();
    },
    onError: error => toast.error(error.message),
  });
  const addMember = trpc.chat.members.add.useMutation({
    onSuccess: () => {
      toast.success("Person added to this group");
      setNewMemberId("none");
      onChanged();
    },
    onError: error => toast.error(error.message),
  });
  const removeMember = trpc.chat.members.remove.useMutation({
    onSuccess: () => {
      toast.success("Person removed from this group");
      onChanged();
    },
    onError: error => toast.error(error.message),
  });

  const memberIds = useMemo(
    () => new Set((members as MemberRow[]).map(row => row.user.id)),
    [members]
  );
  const availablePeople = (people as Person[]).filter(
    person => !memberIds.has(person.id)
  );

  if (!group) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage #{group.name}</DialogTitle>
            <DialogDescription>
              Chat Admins control the group setup and the people who can see its
              messages.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-7 py-2 md:grid-cols-2">
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Settings2 className="h-4 w-4 text-primary" /> Group details
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manage-chat-group-name">Name</Label>
                <Input
                  id="manage-chat-group-name"
                  value={name}
                  maxLength={100}
                  onChange={event => setName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Section</Label>
                <Select value={sectionId} onValueChange={setSectionId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No section</SelectItem>
                    {sections.map(section => (
                      <SelectItem key={section.id} value={String(section.id)}>
                        {section.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manage-chat-group-description">Purpose</Label>
                <Textarea
                  id="manage-chat-group-description"
                  value={description}
                  maxLength={500}
                  onChange={event => setDescription(event.target.value)}
                />
              </div>
              <Button
                className="w-full"
                disabled={!name.trim() || update.isPending}
                onClick={() =>
                  update.mutate({
                    id: group.id,
                    name: name.trim(),
                    description: description.trim() || null,
                    sectionId: sectionId === "none" ? null : Number(sectionId),
                  })
                }
              >
                {update.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save Group Details
              </Button>
              <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3">
                <p className="text-sm font-medium">Archive this group</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  It will disappear from everyone’s Chat workspace. Existing
                  messages remain retained.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 text-destructive hover:text-destructive"
                  onClick={() => setConfirmArchive(true)}
                >
                  <Archive className="mr-1.5 h-3.5 w-3.5" /> Archive Group
                </Button>
              </div>
            </section>
            <section className="space-y-4 border-t pt-6 md:border-l md:border-t-0 md:pl-7 md:pt-0">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4 text-primary" /> People with access{" "}
                <Badge variant="secondary">
                  {(members as MemberRow[]).length}
                </Badge>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Agents can be added now for the future mobile rollout, but they
                cannot see Chat until that rollout is enabled.
              </p>
              <div className="flex gap-2">
                <Select value={newMemberId} onValueChange={setNewMemberId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Add a SavvyOS user" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select a person</SelectItem>
                    {availablePeople.map(person => (
                      <SelectItem key={person.id} value={String(person.id)}>
                        {displayName(person)} · {roleLabel(person.role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  title="Add to group"
                  disabled={newMemberId === "none" || addMember.isPending}
                  onClick={() =>
                    addMember.mutate({ groupId, userId: Number(newMemberId) })
                  }
                >
                  {addMember.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="max-h-[315px] space-y-1 overflow-y-auto rounded-lg border p-2">
                {(members as MemberRow[]).length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                    No one has been added yet.
                  </p>
                ) : (
                  (members as MemberRow[]).map(member => {
                    const label = displayName(member.user);
                    return (
                      <div
                        key={member.membership.id}
                        className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/60"
                      >
                        <Avatar className="h-7 w-7">
                          <AvatarImage
                            src={member.profilePhotoUrl ?? undefined}
                          />
                          <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
                            {initials(label)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {label}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {roleLabel(member.user.role)} · {member.user.email}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title="Remove from group"
                          onClick={() =>
                            removeMember.mutate({
                              groupId,
                              userId: member.user.id,
                            })
                          }
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive #{group.name}?</DialogTitle>
            <DialogDescription>
              This hides the group from all members. You can retain the message
              history without leaving a live conversation open.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmArchive(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={archive.isPending}
              onClick={() => archive.mutate({ id: group.id })}
            >
              {archive.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}{" "}
              Archive Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function ChatPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: access, isLoading: accessLoading } =
    trpc.chat.access.useQuery();
  const { data: workspace, isLoading: workspaceLoading } =
    trpc.chat.workspace.useQuery(undefined, {
      enabled: !!access?.canAccess,
      refetchInterval: 15_000,
    });
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newSectionOpen, setNewSectionOpen] = useState(false);
  const [manageGroupOpen, setManageGroupOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(
    new Set()
  );
  const messageBottomRef = useRef<HTMLDivElement>(null);

  const sectionGroups = (workspace?.sections ?? []) as WorkspaceSection[];
  const unsectioned = (workspace?.unsectioned ?? []) as Group[];
  const allGroups = useMemo(
    () => [...sectionGroups.flatMap(item => item.groups), ...unsectioned],
    [sectionGroups, unsectioned]
  );
  const selectedGroup =
    allGroups.find(group => group.id === selectedGroupId) ?? null;
  const allSections = sectionGroups.map(item => item.section);

  useEffect(() => {
    if (!selectedGroupId && allGroups[0]) setSelectedGroupId(allGroups[0].id);
    if (
      selectedGroupId &&
      !allGroups.some(group => group.id === selectedGroupId)
    ) {
      setSelectedGroupId(allGroups[0]?.id ?? null);
    }
  }, [allGroups, selectedGroupId]);

  const { data: messages = [], isLoading: messagesLoading } =
    trpc.chat.messages.list.useQuery(
      { groupId: selectedGroupId ?? 0, limit: 100 },
      { enabled: selectedGroupId != null, refetchInterval: 5_000 }
    );

  useEffect(() => {
    messageBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedGroupId, (messages as MessageRow[]).length]);

  const refreshWorkspace = () => {
    void utils.chat.workspace.invalidate();
    if (selectedGroupId)
      void utils.chat.messages.list.invalidate({
        groupId: selectedGroupId,
        limit: 100,
      });
  };
  const sendMessage = trpc.chat.messages.send.useMutation({
    onSuccess: () => {
      setDraft("");
      if (selectedGroupId)
        void utils.chat.messages.list.invalidate({
          groupId: selectedGroupId,
          limit: 100,
        });
    },
    onError: error => toast.error(error.message),
  });
  const updateMessage = trpc.chat.messages.update.useMutation({
    onSuccess: () => {
      if (selectedGroupId)
        void utils.chat.messages.list.invalidate({
          groupId: selectedGroupId,
          limit: 100,
        });
      toast.success("Message updated");
    },
    onError: error => toast.error(error.message),
  });
  const deleteMessage = trpc.chat.messages.delete.useMutation({
    onSuccess: () => {
      if (selectedGroupId)
        void utils.chat.messages.list.invalidate({
          groupId: selectedGroupId,
          limit: 100,
        });
      toast.success("Message deleted");
    },
    onError: error => toast.error(error.message),
  });

  const submitMessage = () => {
    if (!selectedGroupId || !draft.trim() || sendMessage.isPending) return;
    sendMessage.mutate({ groupId: selectedGroupId, body: draft.trim() });
  };

  if (accessLoading) {
    return (
      <div className="flex h-full min-h-[360px] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!access?.canAccess) {
    navigate("/");
    return null;
  }

  return (
    <div className="-m-4 flex h-[calc(100vh-56px)] min-h-[520px] overflow-hidden bg-background md:-m-6">
      <aside className="hidden w-[276px] shrink-0 flex-col border-r bg-muted/20 md:flex">
        <div className="flex items-center justify-between border-b px-4 py-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <div>
              <h1 className="font-semibold">Chat</h1>
              <p className="text-[11px] text-muted-foreground">
                SavvyOS conversations
              </p>
            </div>
          </div>
          {workspace?.isChatAdmin && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title="Create Chat group"
              onClick={() => setNewGroupOpen(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
        <ScrollArea className="flex-1 px-3 py-3">
          {workspaceLoading ? (
            <div className="space-y-2 px-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading
              conversations...
            </div>
          ) : (
            <div className="space-y-4">
              {sectionGroups.map(({ section, groups }) => {
                const isCollapsed = collapsedSections.has(section.id);
                return (
                  <div key={section.id}>
                    <div className="mb-1 flex items-center justify-between px-1">
                      <button
                        type="button"
                        className="flex min-w-0 items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setCollapsedSections(previous => {
                            const next = new Set(previous);
                            if (next.has(section.id)) next.delete(section.id);
                            else next.add(section.id);
                            return next;
                          })
                        }
                      >
                        {isCollapsed ? (
                          <ChevronRight className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}{" "}
                        <span className="truncate">{section.name}</span>
                      </button>
                    </div>
                    {!isCollapsed && (
                      <div className="space-y-0.5">
                        {groups.map(group => (
                          <GroupRow
                            key={group.id}
                            group={group}
                            isSelected={selectedGroupId === group.id}
                            onSelect={() => setSelectedGroupId(group.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {unsectioned.length > 0 && (
                <div>
                  <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Other
                  </p>
                  <div className="space-y-0.5">
                    {unsectioned.map(group => (
                      <GroupRow
                        key={group.id}
                        group={group}
                        isSelected={selectedGroupId === group.id}
                        onSelect={() => setSelectedGroupId(group.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {allGroups.length === 0 && (
                <div className="rounded-lg border border-dashed px-3 py-7 text-center text-xs text-muted-foreground">
                  <MessageSquare className="mx-auto mb-2 h-5 w-5 opacity-50" />
                  No groups yet.
                </div>
              )}
            </div>
          )}
        </ScrollArea>
        {workspace?.isChatAdmin && (
          <div className="border-t p-3">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => setNewSectionOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" /> New section
            </Button>
          </div>
        )}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {!selectedGroup ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MessageSquare className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">
              {workspace?.isChatAdmin
                ? "Start the SavvyOS conversation"
                : "No Chat groups yet"}
            </h2>
            <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {workspace?.isChatAdmin
                ? "Create a section and a group, then choose who can see it. Groups are private by default."
                : "A Chat Admin will add you to the conversations that matter to your work."}
            </p>
            {workspace?.isChatAdmin && (
              <Button className="mt-5" onClick={() => setNewGroupOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Create first group
              </Button>
            )}
          </div>
        ) : (
          <>
            <header className="flex min-h-[69px] items-center justify-between gap-3 border-b px-4 py-3 md:px-6">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Hash className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <h2 className="truncate text-lg font-semibold">
                    {selectedGroup.name}
                  </h2>
                </div>
                {selectedGroup.description && (
                  <p className="mt-0.5 truncate pl-7 text-xs text-muted-foreground">
                    {selectedGroup.description}
                  </p>
                )}
              </div>
              {workspace?.isChatAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setManageGroupOpen(true)}
                >
                  <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Manage
                </Button>
              )}
            </header>
            <ScrollArea className="flex-1">
              <div className="mx-auto max-w-4xl space-y-5 px-4 py-5 md:px-6">
                {messagesLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (messages as MessageRow[]).length === 0 ? (
                  <div className="rounded-xl border border-dashed py-14 text-center">
                    <MessageSquare className="mx-auto mb-3 h-7 w-7 text-muted-foreground/50" />
                    <p className="font-medium">No messages yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Start the conversation in #{selectedGroup.name}.
                    </p>
                  </div>
                ) : (
                  (messages as MessageRow[]).map(row => (
                    <ChatMessage
                      key={row.message.id}
                      row={row}
                      meId={user?.id ?? null}
                      isChatAdmin={!!workspace?.isChatAdmin}
                      onUpdate={body =>
                        updateMessage.mutate({
                          messageId: row.message.id,
                          body,
                        })
                      }
                      onDelete={() =>
                        deleteMessage.mutate({ messageId: row.message.id })
                      }
                    />
                  ))
                )}
                <div ref={messageBottomRef} />
              </div>
            </ScrollArea>
            <div className="border-t bg-background px-4 py-3 md:px-6">
              <div className="mx-auto flex max-w-4xl items-end gap-2">
                <Textarea
                  value={draft}
                  maxLength={8000}
                  className="min-h-[48px] max-h-32 resize-none"
                  placeholder={`Message #${selectedGroup.name}`}
                  onChange={event => setDraft(event.target.value)}
                  onKeyDown={event => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !(event.nativeEvent as any).isComposing
                    ) {
                      event.preventDefault();
                      submitMessage();
                    }
                  }}
                />
                <Button
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  disabled={!draft.trim() || sendMessage.isPending}
                  onClick={submitMessage}
                >
                  {sendMessage.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="mx-auto mt-1.5 max-w-4xl text-[11px] text-muted-foreground">
                Press Enter to send · Shift + Enter for a new line
              </p>
            </div>
          </>
        )}
      </main>

      <NewSectionDialog
        open={newSectionOpen}
        onOpenChange={setNewSectionOpen}
        onCreated={refreshWorkspace}
      />
      <NewGroupDialog
        open={newGroupOpen}
        onOpenChange={setNewGroupOpen}
        sections={allSections}
        onCreated={groupId => {
          refreshWorkspace();
          setSelectedGroupId(groupId);
          setManageGroupOpen(true);
        }}
      />
      <ManageGroupDialog
        group={selectedGroup}
        sections={allSections}
        open={manageGroupOpen}
        onOpenChange={setManageGroupOpen}
        onChanged={refreshWorkspace}
      />
    </div>
  );
}

function ChatMessage({
  row,
  meId,
  isChatAdmin,
  onUpdate,
  onDelete,
}: {
  row: MessageRow;
  meId: number | null;
  isChatAdmin: boolean;
  onUpdate: (body: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.message.body);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canManage = meId === row.message.senderId || isChatAdmin;
  const senderName = displayName(row.sender);

  return (
    <article className="group flex gap-3">
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarImage src={row.profilePhotoUrl ?? undefined} />
        <AvatarFallback className="bg-primary/10 text-xs text-primary">
          {initials(senderName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-medium">{senderName}</span>
          <span className="text-xs text-muted-foreground">
            {formatMessageTime(row.message.createdAt)}
            {row.message.editedAt ? " · edited" : ""}
          </span>
          {canManage && (
            <div className="ml-auto hidden gap-1 group-hover:flex">
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
            </div>
          )}
        </div>
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
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
            {row.message.body}
          </p>
        )}
      </div>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this message?</DialogTitle>
            <DialogDescription>
              This is removed from the group conversation. The SavvyOS activity
              log will retain the deletion action.
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
