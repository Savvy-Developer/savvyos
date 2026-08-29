import { useEffect, useMemo, useState } from "react";
import { CheckSquare, Loader2, Search, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

type NotificationUser = {
  id: number;
  name: string | null;
  email: string | null;
  role: string;
};

type NotificationTarget = {
  id: string;
  name: string;
  recipient: string;
};

interface NotificationRecipientsDialogProps {
  notification: NotificationTarget | null;
  users: NotificationUser[];
  selectedUserIds: number[];
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (recipientUserIds: number[]) => void;
}

function roleLabel(role: string) {
  if (role === "isa") return "ISA";
  if (role === "agent_support") return "Agent support";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function NotificationRecipientsDialog({
  notification,
  users,
  selectedUserIds,
  isSaving,
  onOpenChange,
  onSave,
}: NotificationRecipientsDialogProps) {
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<number[]>(selectedUserIds);

  useEffect(() => {
    setSearch("");
    setSelection(selectedUserIds);
  }, [notification?.id, selectedUserIds]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter(user =>
      `${user.name ?? ""} ${user.email ?? ""} ${user.role}`
        .toLowerCase()
        .includes(query)
    );
  }, [search, users]);

  const selected = new Set(selection);
  const allVisibleSelected =
    filteredUsers.length > 0 &&
    filteredUsers.every(user => selected.has(user.id));

  const toggleUser = (userId: number, checked: boolean) => {
    setSelection(current =>
      checked
        ? Array.from(new Set([...current, userId]))
        : current.filter(id => id !== userId)
    );
  };

  const toggleVisible = (checked: boolean) => {
    setSelection(current => {
      const visibleIds = new Set(filteredUsers.map(user => user.id));
      return checked
        ? Array.from(new Set([...current, ...Array.from(visibleIds)]))
        : current.filter(id => !visibleIds.has(id));
    });
  };

  return (
    <Dialog open={Boolean(notification)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UsersRound className="h-5 w-5 text-primary" />
            Notification recipients
          </DialogTitle>
          <DialogDescription>
            {notification?.name ?? "This notification"} normally goes to{" "}
            {notification?.recipient ?? "its default recipients"}. Select users
            below to replace that default audience.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
          Selected users receive individual copies of this email. Clearing all
          selections and saving restores the normal recipient logic for this
          notification.
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search active users…"
              className="pl-9"
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="notification-recipient-select-visible"
                checked={allVisibleSelected}
                onCheckedChange={checked => toggleVisible(checked === true)}
                aria-label="Select all visible users"
              />
              <Label
                htmlFor="notification-recipient-select-visible"
                className="cursor-pointer text-sm"
              >
                Select all visible
              </Label>
            </div>
            <span className="text-xs text-muted-foreground">
              {selection.length} selected
            </span>
          </div>

          <div className="max-h-80 divide-y overflow-y-auto rounded-md border">
            {filteredUsers.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                No active users match that search.
              </p>
            ) : (
              filteredUsers.map(user => {
                const label =
                  user.name?.trim() || user.email || `User #${user.id}`;
                return (
                  <label
                    key={user.id}
                    className="flex cursor-pointer items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={selected.has(user.id)}
                      onCheckedChange={checked =>
                        toggleUser(user.id, checked === true)
                      }
                      aria-label={`Send to ${label}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {roleLabel(user.role)}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onSave([])}
            disabled={isSaving || selection.length === 0}
          >
            Restore defaults
          </Button>
          <Button
            type="button"
            onClick={() => onSave(selection)}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <CheckSquare className="mr-2 h-4 w-4" />
                Save recipients
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
