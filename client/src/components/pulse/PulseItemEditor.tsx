import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Bold, CalendarDays, FileText, Italic, Link as LinkIcon, List, ListOrdered, Loader2, Paperclip, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ItemType = "todo" | "issue";
type PendingAttachment = { fileName: string; fileKey: string; url: string; mimeType: string | null; fileSize: number | null };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workItemId?: string | null;
  defaultType?: ItemType;
  defaultDestinationId?: string | null;
  sourceSessionId?: string | null;
  title?: string;
  onSaved?: (result: { id: string; created: boolean }) => void;
};

const priorityOptions = [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["urgent", "Urgent"]] as const;
const todoStatuses = [["open", "Open"], ["done", "Done"], ["dropped", "Dropped"]] as const;
const issueStatuses = [["open", "Open"], ["discussing", "Discussing"], ["solved", "Solved"], ["dropped", "Dropped"]] as const;
const formatName = (person: any) => person.name?.trim() || person.email || "Unnamed teammate";
const defaultDueDate = () => { const date = new Date(); date.setDate(date.getDate() + 7); return date.toISOString().slice(0, 10); };

function DetailEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false }), Link.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } })],
    content: value,
    editorProps: { attributes: { class: "min-h-32 px-3 py-2 text-sm leading-6 outline-none prose prose-sm max-w-none" } },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });
  useEffect(() => {
    if (editor && editor.getHTML() !== value) editor.commands.setContent(value || "", { emitUpdate: false });
  }, [editor, value]);
  if (!editor) return <div className="min-h-40 rounded-md border border-input" />;
  const toggleLink = () => {
    const current = editor.getAttributes("link").href ?? "";
    const href = window.prompt("Paste a complete https:// link", current);
    if (href === null) return;
    if (!href.trim()) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else if (/^(https?:|mailto:)/i.test(href.trim())) editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
    else toast.error("Use a complete https://, http://, or mailto: link.");
  };
  const control = (active: boolean, label: string, action: () => void, icon: React.ReactNode) => <Button type="button" size="icon" variant="ghost" className={`h-8 w-8 ${active ? "bg-muted" : ""}`} onClick={action} title={label} aria-label={label}>{icon}</Button>;
  return <div className="overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring/30"><div className="flex flex-wrap gap-1 border-b bg-muted/30 p-1.5">{control(editor.isActive("bold"), "Bold", () => editor.chain().focus().toggleBold().run(), <Bold className="h-4 w-4" />)}{control(editor.isActive("italic"), "Italic", () => editor.chain().focus().toggleItalic().run(), <Italic className="h-4 w-4" />)}{control(editor.isActive("bulletList"), "Bulleted list", () => editor.chain().focus().toggleBulletList().run(), <List className="h-4 w-4" />)}{control(editor.isActive("orderedList"), "Numbered list", () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered className="h-4 w-4" />)}{control(editor.isActive("link"), "Insert or edit link", toggleLink, <LinkIcon className="h-4 w-4" />)}</div><EditorContent editor={editor} /></div>;
}

export function PulseItemEditor({ open, onOpenChange, workItemId, defaultType = "todo", defaultDestinationId, sourceSessionId, title, onSaved }: Props) {
  const utils = trpc.useUtils();
  const options = trpc.pulse.workItems.editorOptions.useQuery(undefined, { enabled: open });
  const detail = trpc.pulse.workItems.detail.useQuery({ workItemId: workItemId! }, { enabled: open && Boolean(workItemId) });
  const save = trpc.pulse.workItems.saveEditor.useMutation({
    onSuccess: (result) => { toast.success(result.created ? "Pulse item created." : "Pulse item saved."); void utils.pulse.workItems.invalidate(); void utils.pulse.personal.invalidate(); void utils.pulse.l10.invalidate(); onSaved?.(result); onOpenChange(false); },
    onError: (error) => toast.error(error.message),
  });
  const removeAttachment = trpc.pulse.workItems.removeAttachment.useMutation({ onSuccess: () => { void detail.refetch(); toast.success("Attachment removed."); }, onError: (error) => toast.error(error.message) });
  const [type, setType] = useState<ItemType>(defaultType);
  const [itemTitle, setItemTitle] = useState("");
  const [description, setDescription] = useState("");
  const [destinationId, setDestinationId] = useState(defaultDestinationId ?? "personal");
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [priorityLevel, setPriorityLevel] = useState("medium");
  const [status, setStatus] = useState("open");
  const [issueTimeframe, setIssueTimeframe] = useState("short_term");
  const [statusNote, setStatusNote] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const item = detail.data?.item;
    if (workItemId && !item) return;
    setType((item?.type === "issue" ? "issue" : defaultType) as ItemType);
    setItemTitle(item?.title ?? "");
    setDescription(item?.description ?? "");
    setDestinationId(item?.meetingId ?? defaultDestinationId ?? "personal");
    setAssigneeId(item?.assigneeId ?? null);
    setDueDate(item?.dueDate ?? defaultDueDate());
    setPriorityLevel(item?.priorityLevel ?? "medium");
    setStatus(item?.status ?? "open");
    setIssueTimeframe(item?.issueTimeframe ?? "short_term");
    setStatusNote(item?.status === "solved" ? item?.solvedNote ?? "" : "");
    setPendingAttachments([]);
  }, [open, workItemId, detail.data, defaultType, defaultDestinationId]);

  const people = useMemo(() => {
    const all = options.data?.people ?? [];
    return [...all].sort((a: any, b: any) => {
      const aHasDestination = a.destinationIds.includes(destinationId) ? 0 : 1;
      const bHasDestination = b.destinationIds.includes(destinationId) ? 0 : 1;
      return aHasDestination - bHasDestination || formatName(a).localeCompare(formatName(b));
    });
  }, [options.data?.people, destinationId]);
  const accessiblePeople = people.filter((person: any) => person.destinationIds.includes(destinationId));
  useEffect(() => { if (accessiblePeople.length && !accessiblePeople.some((person: any) => person.id === assigneeId)) setAssigneeId(accessiblePeople[0].id); }, [destinationId, accessiblePeople, assigneeId]);

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const next = Array.from(files);
    if (pendingAttachments.length + (detail.data?.attachments?.length ?? 0) + next.length > 10) return toast.error("Attach up to 10 documents to one item.");
    if (next.some(file => file.size > 16 * 1024 * 1024)) return toast.error("Each document must be 16 MB or smaller.");
    setUploading(true);
    try {
      const uploaded = await Promise.all(next.map(async file => {
        const form = new FormData();
        form.append("file", file);
        form.append("fileKey", `pulse-work-items/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
        const response = await fetch("/api/documents/upload", { method: "POST", body: form });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? `Unable to upload ${file.name}.`);
        return { fileName: file.name, fileKey: body.fileKey, url: body.url, mimeType: file.type || null, fileSize: file.size } as PendingAttachment;
      }));
      setPendingAttachments(current => [...current, ...uploaded]);
    } catch (error: any) { toast.error(error.message ?? "Document upload failed."); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  };
  const submit = () => {
    if (!itemTitle.trim()) return toast.error("Enter a title.");
    if (!dueDate) return toast.error("Choose a due date so this item can be tracked.");
    if (!assigneeId) return toast.error("Choose an assignee.");
    if (type === "issue" && !issueTimeframe) return toast.error("Choose a timeframe for this issue.");
    if (type === "issue" && status === "solved" && !statusNote.trim()) return toast.error("Add a short resolution note before marking this Issue solved.");
    save.mutate({ workItemId: workItemId ?? undefined, type, title: itemTitle.trim(), description: description || null, assigneeId, dueDate, priorityLevel: priorityLevel as any, status: status as any, issueTimeframe: type === "issue" ? issueTimeframe as any : null, statusNote: statusNote.trim() || null, destinationId, sourceSessionId: sourceSessionId && destinationId === defaultDestinationId ? sourceSessionId : null, attachments: pendingAttachments });
  };
  const statuses = type === "todo" ? todoStatuses : issueStatuses;
  const destination = options.data?.destinations.find((entry: any) => entry.id === destinationId);
  const savedAttachments = detail.data?.attachments ?? [];
  const isRock = detail.data?.item?.type === "rock";
  if (isRock) return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Rocks are managed in their L10</DialogTitle><DialogDescription>Rocks remain global quarterly commitments and are reviewed in their original meeting workspace. The shared editor is purpose-built for To-Dos and Issues.</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>{detail.data?.item?.meetingId ? <Button asChild><a href={`/pulse/meetings/${detail.data.item.meetingId}`}>Open Rock’s L10</a></Button> : null}</DialogFooter></DialogContent></Dialog>;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{title ?? (workItemId ? `Edit ${type === "todo" ? "To-Do" : "Issue"}` : `New ${type === "todo" ? "To-Do" : "Issue"}`)}</DialogTitle><DialogDescription>{workItemId ? "Update the work itself. Changing destination creates an audit record only; it never changes access or membership." : "Set the meeting home, owner, schedule, and status before saving."}</DialogDescription></DialogHeader>{(options.isLoading || (workItemId && detail.isLoading)) ? <div className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />Loading editor…</div> : <div className="space-y-5 py-1"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Item type</Label>{workItemId ? <div className="flex min-h-11 items-center rounded-md border bg-muted/30 px-3 font-medium">{type === "todo" ? "To-Do" : "Issue"}</div> : <Select value={type} onValueChange={(value) => { setType(value as ItemType); setStatus("open"); }}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todo">To-Do</SelectItem><SelectItem value="issue">Issue</SelectItem></SelectContent></Select>}</div><div className="space-y-2"><Label>Destination</Label><Select value={destinationId} onValueChange={setDestinationId}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent>{(options.data?.destinations ?? []).map((entry: any) => <SelectItem key={entry.id} value={entry.id}>{entry.type === "personal" ? "Personal work" : entry.name}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">This item will live in <span className="font-semibold text-foreground">{destination?.type === "personal" ? "your Personal work" : destination?.name ?? "the selected destination"}</span>.</p></div></div><div className="space-y-2"><Label htmlFor="pulse-item-title">Title</Label><Input id="pulse-item-title" className="min-h-11" value={itemTitle} onChange={(event) => setItemTitle(event.target.value)} placeholder={type === "todo" ? "What will be complete?" : "What needs to be solved?"} /></div><div className="space-y-2"><Label>Details</Label><DetailEditor value={description} onChange={setDescription} /><p className="text-xs text-muted-foreground">Use bold, italics, bullets, numbered lists, links, and line breaks to give the assignee useful context.</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="space-y-2"><Label>Assignee</Label><Select value={assigneeId ? String(assigneeId) : undefined} onValueChange={(value) => setAssigneeId(Number(value))}><SelectTrigger className="min-h-11"><SelectValue placeholder="Choose person" /></SelectTrigger><SelectContent>{people.map((person: any) => { const available = person.destinationIds.includes(destinationId); return <SelectItem key={person.id} value={String(person.id)} disabled={!available}>{formatName(person)}{available ? "" : " — not in destination"}</SelectItem>; })}</SelectContent></Select><p className="text-xs text-muted-foreground">People in this destination are listed first, alphabetically.</p></div><div className="space-y-2"><Label>Due date</Label><Input className="min-h-11" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div><div className="space-y-2"><Label>Priority</Label><Select value={priorityLevel} onValueChange={setPriorityLevel}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent>{priorityOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent>{statuses.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div>{type === "issue" ? <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Issue timeframe</Label><Select value={issueTimeframe} onValueChange={setIssueTimeframe}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="short_term">Short-term</SelectItem><SelectItem value="long_term">Long-term</SelectItem></SelectContent></Select></div>{status === "solved" ? <div className="space-y-2"><Label>Resolution note</Label><Input className="min-h-11" value={statusNote} onChange={(event) => setStatusNote(event.target.value)} placeholder="What was decided?" /></div> : null}</div> : null}<section className="rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">Documents</p><p className="text-sm text-muted-foreground">Attach up to 10 documents, 16 MB each, using SavvyOS document storage.</p></div><input ref={inputRef} className="hidden" type="file" multiple onChange={(event) => void uploadFiles(event.target.files)} /><Button type="button" variant="outline" className="min-h-10" disabled={uploading} onClick={() => inputRef.current?.click()}>{uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Paperclip className="mr-2 h-4 w-4" />}Attach documents</Button></div>{[...savedAttachments, ...pendingAttachments].length ? <div className="mt-3 divide-y">{savedAttachments.map((attachment: any) => <div className="flex items-center justify-between gap-3 py-2 text-sm" key={attachment.id}><a className="inline-flex min-w-0 items-center gap-2 font-medium text-primary hover:underline" href={attachment.url} target="_blank" rel="noreferrer"><FileText className="h-4 w-4 shrink-0" /><span className="truncate">{attachment.fileName}</span></a><Button type="button" variant="ghost" size="icon" disabled={removeAttachment.isPending} onClick={() => removeAttachment.mutate({ attachmentId: attachment.id })} aria-label={`Remove ${attachment.fileName}`}><Trash2 className="h-4 w-4" /></Button></div>)}{pendingAttachments.map((attachment, index) => <div className="flex items-center justify-between gap-3 py-2 text-sm" key={`${attachment.fileKey}-${index}`}><span className="inline-flex min-w-0 items-center gap-2 font-medium"><FileText className="h-4 w-4 shrink-0" /><span className="truncate">{attachment.fileName}</span><span className="text-xs font-normal text-muted-foreground">Ready to attach</span></span><Button type="button" variant="ghost" size="icon" onClick={() => setPendingAttachments(items => items.filter((_, position) => position !== index))} aria-label={`Remove ${attachment.fileName}`}><Trash2 className="h-4 w-4" /></Button></div>)}</div> : null}</section></div>}<DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="button" disabled={save.isPending || uploading || options.isLoading} onClick={submit}>{save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarDays className="mr-2 h-4 w-4" />}{workItemId ? "Save item" : "Create item"}</Button></DialogFooter></DialogContent></Dialog>;
}

export function PulseItemEditorButton({ children, ...props }: Omit<Props, "open" | "onOpenChange"> & { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <><Button type="button" onClick={() => setOpen(true)}>{children}</Button><PulseItemEditor {...props} open={open} onOpenChange={setOpen} /></>;
}
