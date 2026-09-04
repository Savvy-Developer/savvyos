import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Bold, CalendarDays, Check, ChevronDown, Circle, FileText, Italic, Link as LinkIcon, List, ListChecks, ListOrdered, ListPlus, Loader2, MessageCircle, Paperclip, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PulseItemContextPanel } from "@/components/pulse/PulseItemContextPanel";
import { PulseCompletionCelebration, usePulseCompletionCelebration } from "@/components/pulse/PulseCompletionCelebration";
import { priorityBadgeClass, PulsePriorityBadge, PulseStatusBadge, statusBadgeClass } from "@/components/pulse/PulseWorkItemBadges";

type ItemType = "todo" | "issue";
type PendingAttachment = { fileName: string; fileKey: string; url: string; mimeType: string | null; fileSize: number | null };
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workItemId?: string | null;
  defaultType?: ItemType;
  defaultDestinationId?: string | null;
  defaultAssigneeId?: number | null;
  defaultDueDate?: string | null;
  defaultPriorityLevel?: string | null;
  parentWorkItemId?: string | null;
  sourceSessionId?: string | null;
  title?: string;
  inline?: boolean;
  onSaved?: (result: { id: string; created: boolean }) => void;
};

const priorityOptions = [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["urgent", "Urgent"]] as const;
const todoStatuses = [["not_started", "Not Started"], ["in_progress", "In Progress"], ["blocked", "Blocked"], ["completed", "Completed"]] as const;
const issueStatuses = todoStatuses;
const formatName = (person: any) => person.name?.trim() || person.email || "Unnamed teammate";
const defaultDueDate = () => { const date = new Date(); date.setDate(date.getDate() + 7); return date.toISOString().slice(0, 10); };
const dateLabel = (value?: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "No date";

function DetailEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false, bulletList: { keepMarks: true }, orderedList: { keepMarks: true } }), Link.configure({ autolink: true, linkOnPaste: true, openOnClick: false, HTMLAttributes: { class: "text-sky-600 font-semibold underline decoration-sky-400 underline-2 underline-offset-2 drop-shadow-[0_0_6px_rgba(14,165,233,0.45)] transition-colors hover:text-sky-700", rel: "noopener noreferrer", target: "_blank" } })],
    content: value,
    editorProps: { attributes: { class: "min-h-24 px-3 py-2 text-sm leading-6 outline-none prose prose-sm max-w-none [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_a]:text-sky-600 [&_a]:font-semibold [&_a]:underline [&_a]:decoration-sky-400 [&_a]:underline-offset-2 [&_a]:drop-shadow-[0_0_6px_rgba(14,165,233,0.45)]" } },
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
  });
  useEffect(() => { if (editor && editor.getHTML() !== value) editor.commands.setContent(value || "", { emitUpdate: false }); }, [editor, value]);
  if (!editor) return <div className="min-h-40 rounded-md border border-input" />;
  const toggleLink = () => {
    const current = editor.getAttributes("link").href ?? "";
    const href = window.prompt("Paste a complete https:// link. Select text first, or paste a link directly into the details area.", current);
    if (href === null) return;
    if (!href.trim()) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else if (/^(https?:|mailto:)/i.test(href.trim())) editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
    else toast.error("Use a complete https://, http://, or mailto: link.");
  };
  const control = (active: boolean, label: string, action: () => void, icon: ReactNode) => <Button type="button" size="icon" variant="ghost" className={`h-8 w-8 ${active ? "bg-muted" : ""}`} onMouseDown={(event) => event.preventDefault()} onClick={action} title={label} aria-label={label}>{icon}</Button>;
  return <div className="overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring/30"><div className="flex flex-wrap gap-1 border-b bg-muted/30 p-1.5">{control(editor.isActive("bold"), "Bold", () => editor.chain().focus().toggleBold().run(), <Bold className="h-4 w-4" />)}{control(editor.isActive("italic"), "Italic", () => editor.chain().focus().toggleItalic().run(), <Italic className="h-4 w-4" />)}{control(editor.isActive("bulletList"), "Bulleted list", () => editor.chain().focus().toggleBulletList().run(), <List className="h-4 w-4" />)}{control(editor.isActive("orderedList"), "Numbered list", () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered className="h-4 w-4" />)}{control(editor.isActive("link"), "Insert or edit link", toggleLink, <LinkIcon className="h-4 w-4" />)}</div><EditorContent editor={editor} /></div>;
}

function ItemEditorFields({ open, onOpenChange, workItemId, defaultType = "todo", defaultDestinationId, defaultAssigneeId, defaultDueDate: initialDueDate, defaultPriorityLevel, parentWorkItemId, sourceSessionId, inline = false, onSaved }: Props) {
  const utils = trpc.useUtils();
  const options = trpc.pulse.workItems.editorOptions.useQuery(undefined, { enabled: open });
  const detail = trpc.pulse.workItems.detail.useQuery({ workItemId: workItemId! }, { enabled: open && Boolean(workItemId) });
  const save = trpc.pulse.workItems.saveEditor.useMutation({
    onSuccess: (result) => { toast.success(result.created ? "Pulse item created." : "Pulse item saved."); void utils.pulse.workItems.invalidate(); void utils.pulse.personal.invalidate(); void utils.pulse.l10.invalidate(); onSaved?.(result); if (!inline) onOpenChange(false); else void detail.refetch(); },
    onError: (error) => toast.error(error.message),
  });
  const removeAttachment = trpc.pulse.workItems.removeAttachment.useMutation({ onSuccess: () => { void detail.refetch(); toast.success("Attachment removed."); }, onError: (error) => toast.error(error.message) });
  const addComment = trpc.pulse.workItems.addComment.useMutation({ onSuccess: () => { setComment(""); void detail.refetch(); void utils.pulse.workItems.invalidate(); }, onError: (error) => toast.error(error.message) });
  const [type, setType] = useState<ItemType>(defaultType);
  const [itemTitle, setItemTitle] = useState("");
  const [description, setDescription] = useState("");
  const [destinationId, setDestinationId] = useState(defaultDestinationId ?? "personal");
  const [assigneeId, setAssigneeId] = useState<number | null>(defaultAssigneeId ?? null);
  const [dueDate, setDueDate] = useState(initialDueDate ?? defaultDueDate());
  const [priorityLevel, setPriorityLevel] = useState(defaultPriorityLevel ?? "medium");
  const [status, setStatus] = useState("not_started");
  const [issueTimeframe, setIssueTimeframe] = useState("short_term");
  const [statusNote, setStatusNote] = useState("");
  const [comment, setComment] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const item = detail.data?.item;
    if (workItemId && !item) return;
    setType((item?.type === "issue" ? "issue" : defaultType) as ItemType);
    setItemTitle(item?.title ?? ""); setDescription(item?.description ?? ""); setDestinationId(item?.meetingId ?? defaultDestinationId ?? "personal");
    setAssigneeId(item?.assigneeId ?? defaultAssigneeId ?? null); setDueDate(item?.dueDate ?? initialDueDate ?? defaultDueDate()); setPriorityLevel(item?.priorityLevel ?? defaultPriorityLevel ?? "medium");
    setStatus(item?.status ?? "not_started"); setIssueTimeframe(item?.issueTimeframe ?? "short_term"); setStatusNote(item?.status === "completed" ? item?.solvedNote ?? "" : ""); setPendingAttachments([]);
  }, [open, workItemId, detail.data, defaultType, defaultDestinationId, defaultAssigneeId, initialDueDate, defaultPriorityLevel]);

  const people = useMemo(() => [...(options.data?.people ?? [])].sort((a: any, b: any) => (a.destinationIds.includes(destinationId) ? 0 : 1) - (b.destinationIds.includes(destinationId) ? 0 : 1) || formatName(a).localeCompare(formatName(b))), [options.data?.people, destinationId]);
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
        const form = new FormData(); form.append("file", file); form.append("fileKey", `pulse-work-items/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
        const response = await fetch("/api/documents/upload", { method: "POST", body: form }); const body = await response.json();
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
    if (type === "issue" && status === "completed" && !statusNote.trim()) return toast.error("Add a short resolution note before marking this Issue solved.");
    save.mutate({ workItemId: workItemId ?? undefined, type, title: itemTitle.trim(), description: description || null, assigneeId, dueDate, priorityLevel: priorityLevel as any, status: status as any, issueTimeframe: type === "issue" ? issueTimeframe as any : null, statusNote: statusNote.trim() || null, destinationId, sourceSessionId: sourceSessionId && destinationId === defaultDestinationId ? sourceSessionId : null, parentWorkItemId: parentWorkItemId ?? undefined, attachments: pendingAttachments });
  };

  if (detail.data?.item?.type === "rock") return <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Rocks are managed in their original L10 workspace. <a className="font-semibold underline" href={`/pulse/meetings/${detail.data.item.meetingId}`}>Open this Rock’s L10</a>.</div>;
  if (options.isLoading || (workItemId && detail.isLoading)) return <div className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />Loading item…</div>;
  const destination = options.data?.destinations.find((entry: any) => entry.id === destinationId);
  const statuses = type === "todo" ? todoStatuses : issueStatuses;
  const attachments = detail.data?.attachments ?? [];
  const comments = detail.data?.comments ?? [];
  const linkedSubTodos = detail.data?.linkedSubTodos ?? [];
  const savedLinks = Array.from(description.matchAll(/href=["']([^"']+)/gi), match => match[1]).filter((href, index, all) => all.indexOf(href) === index);
  return <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label>Item type</Label>{workItemId ? <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 font-medium">{type === "todo" ? "To-Do" : "Issue"}</div> : <Select value={type} onValueChange={(value) => { setType(value as ItemType); setStatus("not_started"); }}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todo">To-Do</SelectItem><SelectItem value="issue">Issue</SelectItem></SelectContent></Select>}</div><div className="space-y-1"><Label>Destination</Label><Select value={destinationId} onValueChange={setDestinationId} disabled={Boolean(parentWorkItemId)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{(options.data?.destinations ?? []).map((entry: any) => <SelectItem key={entry.id} value={entry.id}>{entry.type === "personal" ? "Personal work" : entry.name}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">{parentWorkItemId ? "Inherited from the parent: " : "Lives in "}<span className="font-semibold text-foreground">{destination?.type === "personal" ? "your Personal work" : destination?.name ?? "the selected destination"}</span>.</p></div></div><div className="space-y-1"><Label htmlFor={`pulse-item-title-${workItemId ?? "new"}`}>Title</Label><Input id={`pulse-item-title-${workItemId ?? "new"}`} className="h-9" value={itemTitle} onChange={(event) => setItemTitle(event.target.value)} placeholder={type === "todo" ? "What will be complete?" : "What needs to be solved?"} /></div><div className="space-y-1"><Label>Details</Label><DetailEditor value={description} onChange={setDescription} /><p className="text-xs text-muted-foreground">Saved links glow blue. Use the list controls for bullets or numbered steps.</p></div>{savedLinks.length ? <section className="rounded-lg border border-sky-200 bg-sky-50/50 p-3"><h3 className="flex items-center gap-2 font-medium text-sky-950"><LinkIcon className="h-4 w-4 text-sky-600" />Saved links</h3><div className="mt-2 flex flex-col gap-2">{savedLinks.map((href) => <a key={href} href={href} target="_blank" rel="noreferrer" className="w-fit font-semibold text-sky-600 underline decoration-sky-400 underline-2 underline-offset-2 drop-shadow-[0_0_6px_rgba(14,165,233,0.45)] transition-colors hover:text-sky-700">{href}</a>)}</div></section> : null}<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="space-y-1"><Label>Assignee</Label><Select value={assigneeId ? String(assigneeId) : undefined} onValueChange={(value) => setAssigneeId(Number(value))}><SelectTrigger className="h-9"><SelectValue placeholder="Choose person" /></SelectTrigger><SelectContent>{people.map((person: any) => { const available = person.destinationIds.includes(destinationId); return <SelectItem key={person.id} value={String(person.id)} disabled={!available}>{formatName(person)}{available ? "" : " — not in destination"}</SelectItem>; })}</SelectContent></Select></div><div className="space-y-1"><Label>Due date</Label><Input className="h-9" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div><div className="space-y-1"><Label>Priority</Label><Select value={priorityLevel} onValueChange={setPriorityLevel}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{priorityOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label>Status{workItemId ? " (change in context)" : ""}</Label><Select value={status} onValueChange={setStatus} disabled={Boolean(workItemId)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{statuses.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div>{type === "issue" ? <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label>Issue timeframe</Label><Select value={issueTimeframe} onValueChange={setIssueTimeframe}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="short_term">Short-term</SelectItem><SelectItem value="long_term">Long-term</SelectItem></SelectContent></Select></div>{status === "completed" ? <div className="space-y-1"><Label>What does completed look like?</Label><Input className="h-9" value={statusNote} onChange={(event) => setStatusNote(event.target.value)} placeholder="Describe the outcome or definition of done" /></div> : null}</div> : null}<section className="rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">Documents</p><p className="text-sm text-muted-foreground">Visible here after saving, with up to 10 documents per item.</p></div><input ref={inputRef} className="hidden" type="file" multiple onChange={(event) => void uploadFiles(event.target.files)} /><Button type="button" variant="outline" className="min-h-10" disabled={uploading} onClick={() => inputRef.current?.click()}>{uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Paperclip className="mr-2 h-4 w-4" />}Attach documents</Button></div>{[...attachments, ...pendingAttachments].length ? <div className="mt-2 divide-y">{attachments.map((attachment: any) => <div className="flex items-center justify-between gap-3 py-2 text-sm" key={attachment.id}><a className="inline-flex min-w-0 items-center gap-2 font-semibold text-sky-600 underline decoration-sky-400 underline-offset-2 drop-shadow-[0_0_5px_rgba(14,165,233,0.35)] hover:text-sky-700" href={attachment.url} target="_blank" rel="noreferrer"><FileText className="h-4 w-4 shrink-0" /><span className="truncate">{attachment.fileName}</span></a><Button type="button" variant="ghost" size="icon" disabled={removeAttachment.isPending} onClick={() => removeAttachment.mutate({ attachmentId: attachment.id })} aria-label={`Remove ${attachment.fileName}`}><Trash2 className="h-4 w-4" /></Button></div>)}{pendingAttachments.map((attachment, index) => <div className="flex items-center justify-between gap-3 py-2 text-sm" key={`${attachment.fileKey}-${index}`}><span className="inline-flex min-w-0 items-center gap-2 font-medium"><FileText className="h-4 w-4 shrink-0" /><span className="truncate">{attachment.fileName}</span><span className="text-xs font-normal text-muted-foreground">Ready to save</span></span><Button type="button" variant="ghost" size="icon" onClick={() => setPendingAttachments(items => items.filter((_, position) => position !== index))} aria-label={`Remove ${attachment.fileName}`}><Trash2 className="h-4 w-4" /></Button></div>)}</div> : null}</section>{workItemId ? <><section className="rounded-lg border p-3"><h3 className="font-medium">Comments</h3>{comments.length ? <div className="mt-2 space-y-3">{comments.map((entry: any) => <article key={entry.id} className="border-l-2 border-sky-300 pl-3"><p className="text-sm font-medium">{entry.authorName ?? "Teammate"}</p><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{entry.body}</p></article>)}</div> : <p className="mt-2 text-sm text-muted-foreground">No comments yet.</p>}<div className="mt-2 flex flex-col gap-2 sm:flex-row"><Textarea className="min-h-20 flex-1" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Leave a comment" /><Button type="button" className="h-9 self-end" disabled={!comment.trim() || addComment.isPending} onClick={() => addComment.mutate({ workItemId, body: comment.trim(), mentionedPersonIds: [] })}><Send className="mr-2 h-4 w-4" />Comment</Button></div></section>{linkedSubTodos.length ? <section className="rounded-lg border p-3"><h3 className="flex items-center gap-2 font-medium"><ListChecks className="h-4 w-4 text-primary" />Sub-To-Dos</h3><div className="mt-2 divide-y"><div className="space-y-1 border-l-2 border-primary/20 pl-2">{linkedSubTodos.map((todo: any) => <PulseInlineItemRow key={todo.id} item={todo} defaultDestinationId={todo.meetingId ?? null} sourceSessionId={sourceSessionId} onChanged={() => { void detail.refetch(); onSaved?.({ id: workItemId!, created: false }); }} />)}</div></div></section> : null}</> : null}<div className="flex flex-wrap justify-end gap-2 border-t pt-4">{!inline ? <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button> : null}<Button type="button" disabled={save.isPending || uploading || options.isLoading} onClick={submit}>{save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarDays className="mr-2 h-4 w-4" />}{workItemId ? "Save changes" : "Create item"}</Button></div></div>;
}

export function PulseItemEditor({ open, onOpenChange, inline = false, title, ...props }: Props) {
  if (inline) return open ? <div className="border-t border-primary/20 bg-primary/[0.025] p-3 sm:p-5"><div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="font-semibold">{title ?? "Item details"}</h3><p className="mt-1 text-sm text-muted-foreground">Edit, review documents and blue links, leave comments, and see linked sub-To-Dos without leaving this page.</p></div><Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Collapse</Button></div><ItemEditorFields {...props} open={open} onOpenChange={onOpenChange} inline /></div> : null;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{title ?? (props.workItemId ? "Edit item" : "New Pulse item")}</DialogTitle><DialogDescription>{props.workItemId ? "Update the work itself. Destination changes are audited and never change access or membership." : "Set the destination, owner, schedule, and status before saving."}</DialogDescription></DialogHeader><ItemEditorFields {...props} open={open} onOpenChange={onOpenChange} /><DialogFooter /></DialogContent></Dialog>;
}

function PulseQuickTodoControls({ item, onChanged }: { item: any; onChanged: () => void }) {
  const utils = trpc.useUtils();
  const options = trpc.pulse.workItems.editorOptions.useQuery();
  const [nextStatus, setNextStatus] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState("");
  const [blockerPersonId, setBlockerPersonId] = useState("");
  const statusAnchor = useRef<HTMLDivElement>(null);
  const { celebration, celebrate } = usePulseCompletionCelebration();
  const destinationId = item.meetingId ?? "personal";
  const people = useMemo(() => [...(options.data?.people ?? [])]
    .filter((person: any) => person.destinationIds.includes(destinationId))
    .sort((a: any, b: any) => formatName(a).localeCompare(formatName(b))), [options.data?.people, destinationId]);
  const quickUpdate = trpc.pulse.workItems.updateQuickTodoFields.useMutation({
    onSuccess: () => { toast.success("To-Do updated."); void utils.pulse.workItems.invalidate(); void utils.pulse.personal.invalidate(); void utils.pulse.l10.invalidate(); onChanged(); },
    onError: (error) => toast.error(error.message),
  });
  const setStatus = trpc.pulse.workItems.setWorkflowStatus.useMutation({
    onSuccess: (_result, variables) => { if (variables.status === "completed") celebrate(statusAnchor.current, "todo", "To-Do completed"); toast.success(variables.status === "completed" ? "To-Do completed" : "Status update saved."); setNextStatus(null); setStatusNote(""); setBlockerPersonId(""); void utils.pulse.workItems.invalidate(); void utils.pulse.personal.invalidate(); void utils.pulse.l10.invalidate(); onChanged(); },
    onError: (error) => toast.error(error.message),
  });
  return <div ref={statusAnchor} className="order-last flex basis-full flex-wrap items-center gap-1.5 pt-1.5 pl-7 xl:order-none xl:basis-auto xl:pt-0 xl:pl-0" onClick={event => event.stopPropagation()}>
    <Input aria-label="To-Do due date" type="date" value={item.dueDate ?? ""} onChange={event => quickUpdate.mutate({ workItemId: item.id, dueDate: event.target.value })} disabled={quickUpdate.isPending} className="h-7 w-[8.35rem] bg-background px-1.5 text-xs" />
    <Select value={item.priorityLevel ?? "medium"} onValueChange={value => quickUpdate.mutate({ workItemId: item.id, priorityLevel: value as any })} disabled={quickUpdate.isPending}><SelectTrigger aria-label="To-Do priority" className={`h-7 w-[6.6rem] px-2 text-xs ${priorityBadgeClass(item.priorityLevel)}`}><SelectValue /></SelectTrigger><SelectContent>{priorityOptions.map(([value, name]) => <SelectItem key={value} value={value}>{name}</SelectItem>)}</SelectContent></Select>
    <Select value={item.assigneeId ? String(item.assigneeId) : undefined} onValueChange={value => quickUpdate.mutate({ workItemId: item.id, assigneeId: Number(value) })} disabled={quickUpdate.isPending || options.isLoading}><SelectTrigger aria-label="To-Do assignee" className="h-7 w-[8.5rem] bg-background px-2 text-xs"><SelectValue placeholder="Assignee" /></SelectTrigger><SelectContent>{people.map((person: any) => <SelectItem key={person.id} value={String(person.id)}>{formatName(person)}</SelectItem>)}</SelectContent></Select>
    <PulseCompletionCelebration celebration={celebration} /><Select value={item.status ?? "not_started"} onValueChange={value => { if (value !== item.status) setNextStatus(value); }}><SelectTrigger aria-label="To-Do status" className={`h-7 w-[8rem] px-2 text-xs ${statusBadgeClass(item.status)}`}><SelectValue /></SelectTrigger><SelectContent>{todoStatuses.map(([value, name]) => <SelectItem key={value} value={value}>{name}</SelectItem>)}</SelectContent></Select>
    <Dialog open={Boolean(nextStatus)} onOpenChange={open => { if (!open) { setNextStatus(null); setStatusNote(""); setBlockerPersonId(""); } }}><DialogContent><DialogHeader><DialogTitle>Save status update</DialogTitle><DialogDescription>{nextStatus === "completed" ? "Before completing this To-Do, define what done looks like." : "A written update is required whenever status changes."}</DialogDescription></DialogHeader>{nextStatus === "blocked" && people.length ? <div className="space-y-2"><Label htmlFor={`pulse-quick-blocker-${item.id}`}>Who can unblock this To-Do?</Label><Select value={blockerPersonId} onValueChange={setBlockerPersonId}><SelectTrigger id={`pulse-quick-blocker-${item.id}`}><SelectValue placeholder="Choose the blocker" /></SelectTrigger><SelectContent>{people.map((person: any) => <SelectItem key={person.id} value={String(person.id)}>{formatName(person)}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">This person receives a notification with the item and your update.</p></div> : null}<div className="space-y-2"><Label htmlFor={`pulse-quick-status-note-${item.id}`}>{nextStatus === "completed" ? "Definition of done" : "Describe this status update"}</Label><Textarea id={`pulse-quick-status-note-${item.id}`} autoFocus value={statusNote} onChange={event => setStatusNote(event.target.value)} className="min-h-24" placeholder={nextStatus === "completed" ? "Describe the completed outcome, deliverable, or definition of done…" : "What changed, what is blocked, or what is moving forward?"} /></div><DialogFooter><Button variant="outline" onClick={() => { setNextStatus(null); setStatusNote(""); }}>Cancel</Button><Button disabled={!statusNote.trim() || (nextStatus === "blocked" && people.length > 0 && !blockerPersonId) || setStatus.isPending} onClick={() => nextStatus && setStatus.mutate({ workItemId: item.id, status: nextStatus as any, statusNote: statusNote.trim(), blockerPersonId: nextStatus === "blocked" && blockerPersonId ? Number(blockerPersonId) : null })}>Save update</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

export function PulseInlineItemRow({ item, onChanged, defaultDestinationId, sourceSessionId, canReopen = true }: { item: any; onChanged: () => void; defaultDestinationId?: string | null; sourceSessionId?: string | null; canReopen?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addingSubTodo, setAddingSubTodo] = useState(false);
  const [completionRequest, setCompletionRequest] = useState(0);
  // Meeting list projections can omit `type`; every non-Rock root row rendered here is a valid Pulse parent.
  const parentEligible = Boolean(item?.id) && !item.parentWorkItemId && item.type !== "rock";
  const indicator = (count: number, label: string, icon: ReactNode) => count > 0 ? <span title={String(count) + " " + label} className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{icon}{count}</span> : null;
  const completed = item.status === "completed";
  const timeframe = item.issueTimeframe ? " · " + (item.issueTimeframe === "long_term" ? "long-term" : "short-term") : "";
  const destination = item.meetingName ? " · " + item.meetingName : "";
  const completeLabel = item.type === "issue" ? "Resolve Issue" : "Complete To-Do";
  const requestCompletion = () => { if (completed) { setExpanded(true); return; } setExpanded(true); setCompletionRequest(request => request + 1); };
  return <div className="overflow-hidden rounded-md border border-border bg-card"><div className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/45"><button type="button" aria-label={completed ? "Completed. Open context to change status." : completeLabel} title={completed ? "Completed" : "Complete or resolve — add the required note"} onClick={requestCompletion} className={"flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 " + (completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700")}><span className="sr-only">{completed ? "Completed" : completeLabel}</span>{completed ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}</button><button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="flex min-w-0 flex-1 items-center gap-2 text-left"><span className="min-w-0 flex-1"><span className={completed ? "block truncate text-sm font-medium text-muted-foreground line-through" : "block truncate text-sm font-medium"}>{item.title}</span><span className="block truncate text-xs text-muted-foreground">{item.assigneeName ?? "Unassigned"} · due {dateLabel(item.dueDate)}{timeframe}{destination}</span><span className="mt-1 flex flex-wrap items-center gap-1">{item.type !== "rock" ? <PulsePriorityBadge value={item.priorityLevel} compact /> : null}<PulseStatusBadge value={item.status} compact /></span></span><span className="flex shrink-0 items-center gap-1">{indicator(Number(item.commentCount ?? 0), "comments", <MessageCircle className="h-3.5 w-3.5" />)}{indicator(Number(item.attachmentCount ?? 0), "documents", <Paperclip className="h-3.5 w-3.5" />)}{indicator(Number(item.linkedSubTodoCount ?? 0), "sub-To-Dos", <ListChecks className="h-3.5 w-3.5 text-primary" />)}</span><ChevronDown className={"h-4 w-4 shrink-0 text-muted-foreground transition-transform " + (expanded ? "rotate-180" : "")} /></button>{parentEligible ? <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={() => setAddingSubTodo(true)} title="Add a sub-To-Do under this parent"><ListPlus className="mr-1 h-3.5 w-3.5" />Add sub-To-Do</Button> : null}{item.type === "todo" ? <PulseQuickTodoControls item={item} onChanged={onChanged} /> : null}</div>{expanded ? <PulseItemContextPanel workItemId={item.id} title={item.title} completionRequest={completionRequest} onEdit={() => setEditing(true)} onAddSubTodo={parentEligible ? () => setAddingSubTodo(true) : undefined} canReopen={canReopen} onChanged={onChanged} sourceSessionId={sourceSessionId} renderSubTodo={todo => <PulseInlineItemRow key={todo.id} item={{ ...todo, type: "todo", meetingId: todo.meetingId ?? item.meetingId, meetingName: todo.meetingName ?? item.meetingName, commentCount: todo.commentCount ?? 0, attachmentCount: todo.attachmentCount ?? 0, linkedSubTodoCount: todo.linkedSubTodoCount ?? 0 }} onChanged={onChanged} defaultDestinationId={defaultDestinationId ?? item.meetingId ?? null} sourceSessionId={sourceSessionId} canReopen={canReopen} />} /> : null}<PulseItemEditor open={editing} onOpenChange={setEditing} workItemId={item.id} defaultType={item.type === "issue" ? "issue" : "todo"} defaultDestinationId={defaultDestinationId ?? item.meetingId ?? null} sourceSessionId={sourceSessionId} title={"Edit " + item.title} onSaved={() => { onChanged(); setEditing(false); }} /><PulseItemEditor open={addingSubTodo} onOpenChange={setAddingSubTodo} defaultType="todo" defaultDestinationId={item.meetingId ?? defaultDestinationId ?? null} defaultAssigneeId={item.assigneeId ?? null} defaultDueDate={item.dueDate ?? null} defaultPriorityLevel={item.priorityLevel ?? "medium"} parentWorkItemId={item.id} sourceSessionId={sourceSessionId} title={"Add sub-To-Do under " + item.title} onSaved={() => { onChanged(); setAddingSubTodo(false); setExpanded(true); }} /></div>;
}

export function PulseItemEditorButton({ children, ...props }: Omit<Props, "open" | "onOpenChange"> & { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <><Button type="button" onClick={() => setOpen(true)}>{children}</Button><PulseItemEditor {...props} open={open} onOpenChange={setOpen} /></>;
}
