import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield, Lock } from "lucide-react";
import { toast } from "sonner";

interface AdminPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId: number;
  targetUserName: string;
  targetUserEmail: string;
}

// Groups in display order
const GROUP_ORDER = [
  "Overview",
  "CRM",
  "Transactions",
  "Operations",
  "Admin",
  "Dev Tools",
  "Resources",
  "Projects & Plans",
];

export default function AdminPermissionsDialog({
  open,
  onOpenChange,
  targetUserId,
  targetUserName,
  targetUserEmail,
}: AdminPermissionsDialogProps) {
  const utils = trpc.useUtils();

  const { data: definitions = [] } = trpc.permissions.getDefinitions.useQuery(undefined, {
    enabled: open,
  });

  const { data: permData, isLoading: loadingPerms } = trpc.permissions.getForUser.useQuery(
    { userId: targetUserId },
    { enabled: open && targetUserId > 0 }
  );

  const updateMut = trpc.permissions.updateForUser.useMutation({
    onSuccess: () => {
      toast.success("Permissions updated");
      utils.permissions.getForUser.invalidate({ userId: targetUserId });
      utils.permissions.getMyPermissions.invalidate();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to update permissions");
    },
  });

  const [localPerms, setLocalPerms] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (permData?.permissions) {
      setLocalPerms({ ...permData.permissions });
    }
  }, [permData]);

  const isProtected = permData?.isProtected ?? false;

  const handleToggle = (key: string, value: boolean) => {
    setLocalPerms((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    updateMut.mutate({ userId: targetUserId, permissions: localPerms });
  };

  // Group definitions by group name
  const grouped: Record<string, typeof definitions> = {};
  for (const def of definitions) {
    if (!grouped[def.group]) grouped[def.group] = [];
    grouped[def.group].push(def);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Admin Permissions
          </DialogTitle>
          <DialogDescription>
            Control which pages <strong>{targetUserName}</strong> can access in the admin navigation.
          </DialogDescription>
        </DialogHeader>

        {isProtected ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
            <Lock className="h-10 w-10 text-muted-foreground opacity-50" />
            <p className="font-semibold text-base">Protected Account</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Tyler's permissions cannot be modified. This account always has full access to all pages.
            </p>
          </div>
        ) : loadingPerms ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {GROUP_ORDER.map((groupName) => {
              const items = grouped[groupName];
              if (!items || items.length === 0) return null;
              return (
                <div key={groupName}>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {groupName}
                    </p>
                    {groupName === "Projects & Plans" && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-200 bg-amber-50">
                        Off by default
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {items.map((def) => {
                      const checked = localPerms[def.key] ?? true;
                      return (
                        <div
                          key={def.key}
                          className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2.5 hover:bg-accent/50 transition-colors cursor-pointer"
                          onClick={() => handleToggle(def.key, !checked)}
                        >
                          <Checkbox
                            id={def.key}
                            checked={checked}
                            onCheckedChange={(val) => handleToggle(def.key, !!val)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <Label
                            htmlFor={def.key}
                            className="text-sm cursor-pointer flex-1 leading-tight"
                          >
                            {def.label}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isProtected && (
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={updateMut.isPending}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateMut.isPending || loadingPerms}>
              {updateMut.isPending ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</>
              ) : (
                "Save Permissions"
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
