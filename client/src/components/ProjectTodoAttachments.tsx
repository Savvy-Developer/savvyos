import { useRef, useState } from "react";
import {
  ExternalLink,
  FileText,
  Loader2,
  Paperclip,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

export type ProjectTodoAttachmentUpload = {
  id: number;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
};

type ProjectTodoAttachmentsProps = {
  projectId: number;
  taskId?: number;
  pendingUploads?: ProjectTodoAttachmentUpload[];
  onPendingUploadsChange?: (uploads: ProjectTodoAttachmentUpload[]) => void;
  onChanged?: () => void;
};

function fileSizeLabel(value: number | null) {
  if (!value) return null;
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Project-only task document surface. Files are staged and authorized through
 * the Project attachment endpoint; download URLs are minted only after the
 * caller passes a Project access check.
 */
export default function ProjectTodoAttachments({
  projectId,
  taskId,
  pendingUploads = [],
  onPendingUploadsChange,
  onChanged,
}: ProjectTodoAttachmentsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const utils = trpc.useUtils();
  const {
    data: attachments = [],
    refetch,
    isLoading,
  } = trpc.pm.tasks.getAttachments.useQuery(
    { taskId: taskId! },
    { enabled: Boolean(taskId) }
  );
  const attachUploads = trpc.pm.tasks.addAttachments.useMutation({
    onError: error => toast.error(error.message),
  });
  const discardUpload = trpc.pm.tasks.discardAttachmentUpload.useMutation({
    onError: error => toast.error(error.message),
  });
  const removeAttachment = trpc.pm.tasks.removeAttachment.useMutation({
    onError: error => toast.error(error.message),
  });
  const downloadAttachment = trpc.pm.tasks.getAttachmentDownloadUrl.useMutation(
    {
      onSuccess: ({ url }) => {
        window.open(url, "_blank", "noopener,noreferrer");
      },
      onError: error => toast.error(error.message),
    }
  );

  const existingCount = taskId ? attachments.length : pendingUploads.length;
  const busy =
    uploading ||
    attachUploads.isPending ||
    discardUpload.isPending ||
    removeAttachment.isPending;

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    if (existingCount + selected.length > 10) {
      toast.error("Attach up to 10 documents to one Project To-Do.");
      return;
    }
    if (selected.some(file => file.size > 16 * 1024 * 1024)) {
      toast.error("Each document must be 16 MB or smaller.");
      return;
    }

    setUploading(true);
    const uploaded: ProjectTodoAttachmentUpload[] = [];
    try {
      for (const file of selected) {
        const form = new FormData();
        form.append("file", file);
        form.append("projectId", String(projectId));
        const response = await fetch("/api/projects/todos/attachments/upload", {
          method: "POST",
          body: form,
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body.error ?? `Unable to upload ${file.name}.`);
        }
        uploaded.push(body as ProjectTodoAttachmentUpload);
      }

      if (taskId) {
        await attachUploads.mutateAsync({
          taskId,
          attachmentUploadIds: uploaded.map(attachment => attachment.id),
        });
        await refetch();
        await utils.pm.projects.getById.invalidate({ id: projectId });
        onChanged?.();
        toast.success(
          uploaded.length === 1 ? "Document attached." : "Documents attached."
        );
      } else {
        onPendingUploadsChange?.([...pendingUploads, ...uploaded]);
      }
    } catch (error: any) {
      await Promise.allSettled(
        uploaded.map(attachment =>
          discardUpload.mutateAsync({ attachmentId: attachment.id })
        )
      );
      toast.error(error.message ?? "Document upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function discardPending(attachmentId: number) {
    try {
      await discardUpload.mutateAsync({ attachmentId });
      onPendingUploadsChange?.(
        pendingUploads.filter(attachment => attachment.id !== attachmentId)
      );
    } catch {
      // The mutation reports the user-facing failure toast.
    }
  }

  async function removeSaved(attachmentId: number) {
    try {
      await removeAttachment.mutateAsync({ attachmentId });
      await refetch();
      await utils.pm.projects.getById.invalidate({ id: projectId });
      onChanged?.();
      toast.success("Document removed.");
    } catch {
      // The mutation reports the user-facing failure toast.
    }
  }

  const hasFiles = taskId ? attachments.length > 0 : pendingUploads.length > 0;

  return (
    <section className="rounded-md border bg-background p-2 sm:p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            <Paperclip className="h-4 w-4 text-primary" /> Documents
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Attach up to 10 files, 16 MB each. Project collaborators can open
            the documents here.
          </p>
        </div>
        <input
          ref={inputRef}
          className="hidden"
          type="file"
          multiple
          onChange={event => void uploadFiles(event.target.files)}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          disabled={busy || isLoading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Paperclip className="mr-1.5 h-3.5 w-3.5" />
          )}
          Attach documents
        </Button>
      </div>
      {hasFiles ? (
        <div className="mt-2 divide-y rounded border bg-muted/10 px-2">
          {taskId
            ? attachments.map(attachment => (
                <div
                  key={attachment.id}
                  className="flex min-w-0 items-center gap-2 py-1.5 text-sm"
                >
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left font-medium text-sky-700 underline decoration-sky-400 underline-offset-2 hover:text-sky-900"
                    title={`Open ${attachment.fileName}`}
                    disabled={downloadAttachment.isPending}
                    onClick={() =>
                      downloadAttachment.mutate({ attachmentId: attachment.id })
                    }
                  >
                    {attachment.fileName}
                  </button>
                  {fileSizeLabel(attachment.fileSize) ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {fileSizeLabel(attachment.fileSize)}
                    </span>
                  ) : null}
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={busy}
                    title={`Remove ${attachment.fileName}`}
                    aria-label={`Remove ${attachment.fileName}`}
                    onClick={() => void removeSaved(attachment.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            : pendingUploads.map(attachment => (
                <div
                  key={attachment.id}
                  className="flex min-w-0 items-center gap-2 py-1.5 text-sm"
                >
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {attachment.fileName}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    Ready to save
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={busy}
                    title={`Remove ${attachment.fileName}`}
                    aria-label={`Remove ${attachment.fileName}`}
                    onClick={() => void discardPending(attachment.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
        </div>
      ) : null}
    </section>
  );
}
