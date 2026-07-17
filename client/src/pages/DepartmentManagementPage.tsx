import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Building2, ArrowLeft } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useAppBack } from "@/lib/navigationHistory";

export default function DepartmentManagementPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const goBack = useAppBack("/projects");

  // Redirect non-admins
  if (user && user.role !== "admin") {
    navigate("/");
    return null;
  }

  const { data: departments = [], refetch } = trpc.pm.departments.list.useQuery();

  const createDept = trpc.pm.departments.create.useMutation({
    onSuccess: () => { toast.success("Department created"); refetch(); setNewName(""); setCreateOpen(false); },
    onError: (e) => toast.error(e.message),
  });

  const renameDept = trpc.pm.departments.rename.useMutation({
    onSuccess: () => { toast.success("Department renamed"); refetch(); setRenameOpen(false); setEditingDept(null); },
    onError: (e) => toast.error(e.message),
  });

  const deleteDept = trpc.pm.departments.delete.useMutation({
    onSuccess: () => { toast.success("Department deleted"); refetch(); setDeleteOpen(false); setDeletingDept(null); },
    onError: (e) => toast.error(e.message),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const [renameOpen, setRenameOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<{ id: number; name: string } | null>(null);
  const [renameName, setRenameName] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingDept, setDeletingDept] = useState<{ id: number; name: string } | null>(null);

  function openRename(dept: { id: number; name: string }) {
    setEditingDept(dept);
    setRenameName(dept.name);
    setRenameOpen(true);
  }

  function openDelete(dept: { id: number; name: string }) {
    setDeletingDept(dept);
    setDeleteOpen(true);
  }

  return (
    <div>
      <button
        onClick={goBack}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <PageHeader
        title="Department Management"
        subtitle="Manage the departments used to categorize projects."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> New Department
          </Button>
        }
      />

      <Card className="mt-5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Departments ({departments.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {departments.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No departments yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(departments as any[]).map((dept: any) => (
                <div key={dept.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary/60" />
                    <span className="font-medium text-sm">{dept.name}</span>
                    {dept.projectCount != null && (
                      <span className="text-xs text-muted-foreground">
                        {dept.projectCount} project{dept.projectCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => openRename(dept)}
                      title="Rename"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => openDelete(dept)}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Department</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder="Department name..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && newName.trim()) createDept.mutate({ name: newName.trim() }); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={!newName.trim() || createDept.isPending}
              onClick={() => createDept.mutate({ name: newName.trim() })}
            >
              {createDept.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Department</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder="New name..."
              value={renameName}
              onChange={e => setRenameName(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && renameName.trim() && editingDept)
                  renameDept.mutate({ id: editingDept.id, name: renameName.trim() });
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button
              disabled={!renameName.trim() || renameDept.isPending || !editingDept}
              onClick={() => editingDept && renameDept.mutate({ id: editingDept.id, name: renameName.trim() })}
            >
              {renameDept.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Department</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Are you sure you want to delete <strong>{deletingDept?.name}</strong>?
            Projects in this department will have their department cleared.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteDept.isPending || !deletingDept}
              onClick={() => deletingDept && deleteDept.mutate({ id: deletingDept.id })}
            >
              {deleteDept.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
