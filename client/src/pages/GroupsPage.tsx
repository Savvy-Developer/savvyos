import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Shield, UserPlus, X, Users, Percent } from "lucide-react";

type GroupRow = {
  group: { id: number; name: string; leaderId: number | null; leaderCommissionSplit: number | null; createdAt: Date };
  leader: { id: number; name: string | null; email: string | null } | null;
};

type Member = {
  member: { id: number; groupId: number; userId: number; leaderSplitOverride: number | null; createdAt: Date };
  user: { id: number; name: string | null; email: string | null; role: string } | null;
};

type UserRow = { id: number; name: string | null; email: string | null; role: string };

/** Validate a split value string: must be numeric and 0–100 */
function isValidSplit(v: string) {
  if (v === "" || v === "default") return true;
  const n = Number(v);
  return !isNaN(n) && n >= 0 && n <= 100;
}

/** Inline member badges shown on the card itself */
function GroupMembersBadges({ groupId }: { groupId: number }) {
  const { data: gMembers = [] } = trpc.groups.members.list.useQuery({ groupId });
  const membersList = gMembers as Member[];
  if (membersList.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No members yet</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {membersList.map((m) => (
        <Badge key={m.member.id} variant="secondary" className="text-xs font-normal">
          {m.user?.name ?? "Unknown"}
          {m.member.leaderSplitOverride != null && (
            <span className="ml-1 text-primary">({m.member.leaderSplitOverride}%)</span>
          )}
        </Badge>
      ))}
    </div>
  );
}

export default function GroupsPage() {
  const utils = trpc.useUtils();
  const { data: groups = [], isLoading } = trpc.groups.list.useQuery();
  const { data: allUsers = [] } = trpc.users.list.useQuery({});

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<GroupRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GroupRow | null>(null);
  const [membersGroup, setMembersGroup] = useState<GroupRow | null>(null);
  const [addMemberUserId, setAddMemberUserId] = useState("");

  const [form, setForm] = useState({ name: "", leaderId: "", leaderCommissionSplit: "" });

  const { data: members = [] } = trpc.groups.members.list.useQuery(
    { groupId: membersGroup?.group.id ?? 0 },
    { enabled: !!membersGroup }
  );

  const createMutation = trpc.groups.create.useMutation({
    onSuccess: () => { toast.success("Group created"); utils.groups.list.invalidate(); setAddOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMutation = trpc.groups.update.useMutation({
    onSuccess: () => { toast.success("Group updated"); utils.groups.list.invalidate(); setEditTarget(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = trpc.groups.delete.useMutation({
    onSuccess: () => { toast.success("Group deleted"); utils.groups.list.invalidate(); setDeleteTarget(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const addMemberMutation = trpc.groups.members.add.useMutation({
    onSuccess: () => {
      toast.success("Member added");
      utils.groups.members.list.invalidate({ groupId: membersGroup?.group.id ?? 0 });
      utils.groups.list.invalidate();
      setAddMemberUserId("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeMemberMutation = trpc.groups.members.remove.useMutation({
    onSuccess: () => {
      toast.success("Member removed");
      utils.groups.members.list.invalidate({ groupId: membersGroup?.group.id ?? 0 });
      utils.groups.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateSplitMutation = trpc.groups.members.updateSplit.useMutation({
    onSuccess: () => {
      toast.success("Split updated");
      utils.groups.members.list.invalidate({ groupId: membersGroup?.group.id ?? 0 });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function openAdd() {
    setForm({ name: "", leaderId: "", leaderCommissionSplit: "" });
    setAddOpen(true);
  }

  function openEdit(g: GroupRow) {
    setForm({
      name: g.group.name,
      leaderId: g.group.leaderId?.toString() ?? "",
      leaderCommissionSplit: g.group.leaderCommissionSplit?.toString() ?? "",
    });
    setEditTarget(g);
  }

  // Only agents can be assigned to groups
  const agentUsers = (allUsers as UserRow[]).filter((u) => u.role === "agent");

  // Build a set of agent IDs already assigned to any group (as member or leader)
  const groupsList = groups as GroupRow[];
  const leaderIds = new Set(
    groupsList.map((g) => g.group.leaderId).filter(Boolean) as number[]
  );

  const availableLeadersForAdd = agentUsers.filter((u) => !leaderIds.has(u.id));
  const availableLeadersForEdit = agentUsers.filter(
    (u) => !leaderIds.has(u.id) || u.id === editTarget?.group.leaderId
  );

  const memberUserIds = new Set((members as Member[]).map((m) => m.member.userId));
  const availableToAdd = agentUsers.filter((u) => !memberUserIds.has(u.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-6 w-6" /> Groups
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Organize agents into teams with designated group leaders and commission splits.
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4 mr-2" /> Create Group
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading groups...</div>
      ) : groupsList.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border rounded-lg bg-card">
          <Shield className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No groups yet</p>
          <p className="text-sm mt-1">Create your first group to organize your team.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groupsList.map((g) => (
            <Card key={g.group.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{g.group.name}</CardTitle>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(g)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(g)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {g.leader && (
                  <p className="text-xs text-muted-foreground">
                    Leader: <span className="font-medium text-foreground">{g.leader.name}</span>
                  </p>
                )}
                {g.group.leaderCommissionSplit != null && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Percent className="h-3 w-3" />
                    Leader Commission: <span className="font-medium text-primary">{g.group.leaderCommissionSplit}%</span>
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Users className="h-3 w-3" /> Members
                  </p>
                  <GroupMembersBadges groupId={g.group.id} />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setMembersGroup(g)}
                >
                  <UserPlus className="h-3.5 w-3.5 mr-2" />
                  Manage Members
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Add Group Dialog ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Group</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Group Name *</Label>
              <Input
                placeholder="e.g. North Team"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Group Leader <span className="text-muted-foreground text-xs">(Agents only)</span></Label>
              <Select value={form.leaderId} onValueChange={(v) => setForm((f) => ({ ...f, leaderId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a leader (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {availableLeadersForAdd.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No available agents</div>
                  ) : (
                    availableLeadersForAdd.map((u) => (
                      <SelectItem key={u.id} value={u.id.toString()}>
                        {u.name ?? u.email ?? `Agent #${u.id}`}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Leader Commission Split (%)</Label>
              <p className="text-xs text-muted-foreground">Default % the group leader earns on each member's deal</p>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={0} max={100} step={1}
                  placeholder="e.g. 10"
                  value={form.leaderCommissionSplit}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || (Number(v) >= 0 && Number(v) <= 100)) setForm((f) => ({ ...f, leaderCommissionSplit: v }));
                  }}
                  className={!isValidSplit(form.leaderCommissionSplit) ? "border-red-500" : ""}
                />
                {form.leaderCommissionSplit && isValidSplit(form.leaderCommissionSplit) && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{form.leaderCommissionSplit}% to leader</span>
                )}
              </div>
              {!isValidSplit(form.leaderCommissionSplit) && <p className="text-xs text-red-500">Must be 0–100</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate({
                name: form.name,
                leaderId: form.leaderId ? parseInt(form.leaderId) : null,
                leaderCommissionSplit: form.leaderCommissionSplit ? parseInt(form.leaderCommissionSplit) : null,
              })}
              disabled={!form.name || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Group Dialog ── */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Group</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Group Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Group Leader <span className="text-muted-foreground text-xs">(Agents only)</span></Label>
              <Select value={form.leaderId} onValueChange={(v) => setForm((f) => ({ ...f, leaderId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a leader (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {availableLeadersForEdit.map((u) => (
                    <SelectItem key={u.id} value={u.id.toString()}>
                      {u.name ?? u.email ?? `Agent #${u.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Leader Commission Split (%)</Label>
              <p className="text-xs text-muted-foreground">Default % the group leader earns on each member's deal</p>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={0} max={100} step={1}
                  placeholder="e.g. 10"
                  value={form.leaderCommissionSplit}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || (Number(v) >= 0 && Number(v) <= 100)) setForm((f) => ({ ...f, leaderCommissionSplit: v }));
                  }}
                  className={!isValidSplit(form.leaderCommissionSplit) ? "border-red-500" : ""}
                />
                {form.leaderCommissionSplit && isValidSplit(form.leaderCommissionSplit) && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{form.leaderCommissionSplit}% to leader</span>
                )}
              </div>
              {!isValidSplit(form.leaderCommissionSplit) && <p className="text-xs text-red-500">Must be 0–100</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button
              onClick={() => editTarget && updateMutation.mutate({
                id: editTarget.group.id,
                name: form.name,
                leaderId: form.leaderId && form.leaderId !== "none" ? parseInt(form.leaderId) : null,
                leaderCommissionSplit: form.leaderCommissionSplit && form.leaderCommissionSplit !== "none" ? parseInt(form.leaderCommissionSplit) : null,
              })}
              disabled={!form.name || updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Group</DialogTitle></DialogHeader>
          <p className="text-muted-foreground text-sm">
            Are you sure you want to delete <strong>{deleteTarget?.group.name}</strong>? All members will be removed from this group.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.group.id })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Manage Members Dialog ── */}
      <Dialog open={!!membersGroup} onOpenChange={(o) => !o && setMembersGroup(null)}>
        <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Members — {membersGroup?.group.name}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            Only Agents can be added. Each agent can only belong to one group.
            {membersGroup?.group.leaderCommissionSplit != null && (
              <> Default leader split: <strong>{membersGroup.group.leaderCommissionSplit}%</strong>. Override per member below.</>
            )}
          </p>
          <div className="space-y-4">
            {/* Current members */}
            <div className="space-y-2">
              {(members as Member[]).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No members yet.</p>
              ) : (
                (members as Member[]).map((m) => (
                  <div key={m.member.id} className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-muted/50 gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {m.user?.name?.charAt(0).toUpperCase() ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-tight truncate">{m.user?.name ?? "Unknown"}</p>
                        <p className="text-xs text-muted-foreground capitalize">{m.user?.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1">
                        <Input
                          type="number" min={0} max={100} step={1}
                          className="w-[80px] h-8 text-xs"
                          placeholder={membersGroup?.group.leaderCommissionSplit != null ? `${membersGroup.group.leaderCommissionSplit} (def)` : "Default"}
                          value={m.member.leaderSplitOverride?.toString() ?? ""}
                          onChange={(e) => {
                            if (!membersGroup) return;
                            const v = e.target.value;
                            const parsed = v === "" ? null : parseInt(v, 10);
                            if (v !== "" && (isNaN(parsed!) || parsed! < 0 || parsed! > 100)) return;
                            updateSplitMutation.mutate({
                              groupId: membersGroup.group.id,
                              userId: m.member.userId,
                              leaderSplitOverride: parsed,
                            });
                          }}
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => membersGroup && removeMemberMutation.mutate({
                          groupId: membersGroup.group.id,
                          userId: m.member.userId,
                        })}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add member */}
            {availableToAdd.length > 0 ? (
              <div className="flex gap-2 pt-2 border-t">
                <Select value={addMemberUserId} onValueChange={setAddMemberUserId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Add an agent..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableToAdd.map((u) => (
                      <SelectItem key={u.id} value={u.id.toString()}>
                        {u.name ?? u.email ?? `Agent #${u.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!addMemberUserId || addMemberMutation.isPending}
                  onClick={() => membersGroup && addMemberUserId && addMemberMutation.mutate({
                    groupId: membersGroup.group.id,
                    userId: parseInt(addMemberUserId),
                  })}
                >
                  Add
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center pt-2 border-t">
                All available agents are already assigned to groups.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMembersGroup(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
