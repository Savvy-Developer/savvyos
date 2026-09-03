import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Bold, CalendarDays, Check, ChevronDown, Circle, FileText, Italic, Link as LinkIcon, List, ListChecks, ListOrdered, Loader2, MessageCircle, Paperclip, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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
  inline?: boolean;
  onSaved?: (result: { id: string; created: boolean }) => void;
};

const priorityOptions = [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["urgent", "Urgent"]] as const;
const todoStatuses = [["open", "Open"], ["done", "Done"], ["dropped", "Dropped"]] as const;
const issueStatuses = [["open", "Open"], ["discussing", "Discussing"], ["solved", "Solved"], ["dropped", "Dropped"]] as const;
const formatName = (person: any) => person.name?.trim() || person.email || "Unnamed teammate";
const defaultDueDate = () => { const date = new Date(); date.setDate(date.getDate() + 7); return date.toISOString().slice(0, 10); };
const dateLabel = (value?: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "No date";

function DetailEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false, bulletList: { keepMarks: true }, orderedList: { keepMarks: true } }), Link.configure({ autolink: true, linkOnPaste: true, openOnClick: false, HTMLAttributes: { class: "text-sky-600 font-semibold underline decoration-sky-400 underline-2 underline-offset-2 drop-shadow-[0_0_6px_rgba(14,165,233,0.45)] transition-colors hover:text-sky-700", rel: "noopener noreferrer", target: "_blank" } })],
    content: value,
    editorProps: { attributes: { class: "min-h-32 px-3 py-2 text-sm leading-6 outline-none prose prose-sm max-w-none [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_a]:text-sky-600 [&_a]:font-semibold [&_a]:underline [&_a]:decoration-sky-400 [&_a]:underline-offset-2 [&_a]:drop-shadow-[0_0_6px_rgba(14,165,233,0.45)]" } },
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

function ItemEditorFields({ open, onOpenChange, workItemId, defaultType = "todo", defaultDestinationId, sourceSessionId, inline = false, onSaved }: Props) {
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
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [priorityLevel, setPriorityLevel] = useState("medium");
  const [status, setStatus] = useState("open");
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
    setAssigneeId(item?.assigneeId ?? null); setDueDate(item?.dueDate ?? defaultDueDate()); setPriorityLevel(item?.priorityLevel ?? "medium");
    setStatus(item?.status ?? "open"); setIssueTimeframe(item?.issueTimeframe ?? "short_term"); setStatusNote(item?.status === "solved" ? item?.solvedNote ?? "" : ""); setPendingAttachments([]);
  }, [open, workItemId, detail.data, defaultType, defaultDestinationId]);

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
    if (type === "issue" && status === "solved" && !statusNote.trim()) return toast.error("Add a short resolution note before marking this Issue solved.");
    save.mutate({ workItemId: workItemId ?? undefined, type, title: itemTitle.trim(), description: description || null, assigneeId, dueDate, priorityLevel: priorityLevel as any, status: status as any, issueTimeframe: type === "issue" ? issueTimeframe as any : null, statusNote: statusNote.trim() || null, destinationId, sourceSessionId: sourceSessionId && destinationId === defaultDestinationId ? sourceSessionId : null, attachments: pendingAttachments });
  };

  if (detail.data?.item?.type === "rock") return <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Rocks are managed in their original L10 workspace. <a className="font-semibold underline" href={`/pulse/meetings/${detail.data.item.meetingId}`}>Open this Rock’s L10</a>.</div>;
  if (options.isLoading || (workItemId && detail.isLoading)) return <div className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />Loading item…</div>;
  const destination = options.data?.destinations.find((entry: any) => entry.id === destinationId);
  const statuses = type === "todo" ? todoStatuses : issueStatuses;
  const attachments = detail.data?.attachments ?? [];
  const comments = detail.data?.comments ?? [];
  const linkedSubTodos = detail.data?.linkedSubTodos ?? [];
  const savedLinks = Array.from(description.matchAll(/href=["']([^"']+)/gi), match => match[1]).filter((href, index, all) => all.indexOf(href) === index);
  return <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Item type</Label>{workItemId ? <div className="flex min-h-11 items-center rounded-md border bg-muted/30 px-3 font-medium">{type === "todo" ? "To-Do" : "Issue"}</div> : <Select value={type} onValueChange={(value) => { setType(value as ItemType); setStatus("open"); }}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todo">To-Do</SelectItem><SelectItem value="issue">Issue</SelectItem></SelectContent></Select>}</div><div className="space-y-2"><Label>Destination</Label><Select value={destinationId} onValueChange={setDestinationId}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent>{(options.data?.destinations ?? []).map((entry: any) => <SelectItem key={entry.id} value={entry.id}>{entry.type === "personal" ? "Personal work" : entry.name}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Lives in <span className="font-semibold text-foreground">{destination?.type === "personal" ? "your Personal work" : destination?.name ?? "the selected destination"}</span>.</p></div></div><div className="space-y-2"><Label htmlFor={`pulse-item-title-${workItemId ?? "new"}`}>Title</Label><Input id={`pulse-item-title-${workItemId ?? "new"}`} className="min-h-11" value={itemTitle} onChange={(event) => setItemTitle(event.target.value)} placeholder={type === "todo" ? "What will be complete?" : "What needs to be solved?"} /></div><div className="space-y-2"><Label>Details</Label><DetailEditor value={description} onChange={setDescription} /><p className="text-xs text-muted-foreground">Saved links glow blue. Use the list controls for bullets or numbered steps.</p></div>{savedLinks.length ? <section className="rounded-lg border border-sky-200 bg-sky-50/50 p-4"><h3 className="flex items-center gap-2 font-medium text-sky-950"><LinkIcon className="h-4 w-4 text-sky-600" />Saved links</h3><div className="mt-2 flex flex-col gap-2">{savedLinks.map((href) => <a key={href} href={href} target="_blank" rel="noreferrer" className="w-fit font-semibold text-sky-600 underline decoration-sky-400 underline-2 underline-offset-2 drop-shadow-[0_0_6px_rgba(14,165,233,0.45)] transition-colors hover:text-sky-700">{href}</a>)}</div></section> : null}<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="space-y-2"><Label>Assignee</Label><Select value={assigneeId ? String(assigneeId) : undefined} onValueChange={(value) => setAssigneeId(Number(value))}><SelectTrigger className="min-h-11"><SelectValue placeholder="Choose person" /></SelectTrigger><SelectContent>{people.map((person: any) => { const available = person.destinationIds.includes(destinationId); return <SelectItem key={person.id} value={String(person.id)} disabled={!available}>{formatName(person)}{available ? "" : " — not in destination"}</SelectItem>; })}</SelectContent></Select></div><div className="space-y-2"><Label>Due date</Label><Input className="min-h-11" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div><div className="space-y-2"><Label>Priority</Label><Select value={priorityLevel} onValueChange={setPriorityLevel}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent>{priorityOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent>{statuses.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div>{type === "issue" ? <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Issue timeframe</Label><Select value={issueTimeframe} onValueChange={setIssueTimeframe}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="short_term">Short-term</SelectItem><SelectItem value="long_term">Long-term</SelectItem></SelectContent></Select></div>{status === "solved" ? <div className="space-y-2"><Label>Resolution note</Label><Input className="min-h-11" value={statusNote} onChange={(event) => setStatusNote(event.target.value)} placeholder="What was decided?" /></div> : null}</div> : null}<section className="rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">Documents</p><p className="text-sm text-muted-foreground">Visible here after saving, with up to 10 documents per item.</p></div><input ref={inputRef} className="hidden" type="file" multiple onChange={(event) => void uploadFiles(event.target.files)} /><Button type="button" variant="outline" className="min-h-10" disabled={uploading} onClick={() => inputRef.current?.click()}>{uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Paperclip className="mr-2 h-4 w-4" />}Attach documents</Button></div>{[...attachments, ...pendingAttachments].length ? <div className="mt-3 divide-y">{attachments.map((attachment: any) => <div className="flex items-center justify-between gap-3 py-2 text-sm" key={attachment.id}><a className="inline-flex min-w-0 items-center gap-2 font-semibold text-sky-600 underline decoration-sky-400 underline-offset-2 drop-shadow-[0_0_5px_rgba(14,165,233,0.35)] hover:text-sky-700" href={attachment.url} target="_blank" rel="noreferrer"><FileText className="h-4 w-4 shrink-0" /><span className="truncate">{attachment.fileName}</span></a><Button type="button" variant="ghost" size="icon" disabled={removeAttachment.isPending} onClick={() => removeAttachment.mutate({ attachmentId: attachment.id })} aria-label={`Remove ${attachment.fileName}`}><Trash2 className="h-4 w-4" /></Button></div>)}{pendingAttachments.map((attachment, index) => <div className="flex items-center justify-between gap-3 py-2 text-sm" key={`${attachment.fileKey}-${index}`}><span className="inline-flex min-w-0 items-center gap-2 font-medium"><FileText className="h-4 w-4 shrink-0" /><span className="truncate">{attachment.fileName}</span><span className="text-xs font-normal text-muted-foreground">Ready to save</span></span><Button type="button" variant="ghost" size="icon" onClick={() => setPendingAttachments(items => items.filter((_, position) => position !== index))} aria-label={`Remove ${attachment.fileName}`}><Trash2 className="h-4 w-4" /></Button></div>)}</div> : null}</section>{workItemId ? <><section className="rounded-lg border p-4"><h3 className="font-medium">Comments</h3>{comments.length ? <div className="mt-3 space-y-3">{comments.map((entry: any) => <article key={entry.id} className="border-l-2 border-sky-300 pl-3"><p className="text-sm font-medium">{entry.authorName ?? "Teammate"}</p><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{entry.body}</p></article>)}</div> : <p className="mt-2 text-sm text-muted-foreground">No comments yet.</p>}<div className="mt-4 flex flex-col gap-2 sm:flex-row"><Textarea className="min-h-20 flex-1" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Leave a comment" /><Button type="button" className="min-h-11 self-end" disabled={!comment.trim() || addComment.isPending} onClick={() => addComment.mutate({ workItemId, body: comment.trim(), mentionedPersonIds: [] })}><Send className="mr-2 h-4 w-4" />Comment</Button></div></section>{type === "issue" && linkedSubTodos.length ? <section className="rounded-lg border p-4"><h3 className="flex items-center gap-2 font-medium"><ListChecks className="h-4 w-4 text-primary" />Linked sub-To-Dos</h3><div className="mt-3 divide-y">{linkedSubTodos.map((todo: any) => <div className="flex items-center justify-between gap-3 py-2 text-sm" key={todo.id}><span><span className={todo.status === "done" ? "line-through text-muted-foreground" : "font-medium"}>{todo.title}</span><span className="ml-2 text-muted-foreground">{todo.assigneeName ?? "Unassigned"} · {dateLabel(todo.dueDate)}</span></span><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{todo.status}</span></div>)}</div></section> : null}</> : null}<div className="flex flex-wrap justify-end gap-2 border-t pt-4">{!inline ? <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button> : null}<Button type="button" disabled={save.isPending || uploading || options.isLoading} onClick={submit}>{save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarDays className="mr-2 h-4 w-4" />}{workItemId ? "Save changes" : "Create item"}</Button></div></div>;
}

export function PulseItemEditor({ open, onOpenChange, inline = false, title, ...props }: Props) {
  if (inline) return open ? <div className="border-t border-primary/20 bg-primary/[0.025] p-4 sm:p-5"><div className="mb-5 flex items-start justify-between gap-3"><div><h3 className="font-semibold">{title ?? "Item details"}</h3><p className="mt-1 text-sm text-muted-foreground">Edit, review documents and blue links, leave comments, and see linked sub-To-Dos without leaving this page.</p></div><Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Collapse</Button></div><ItemEditorFields {...props} open={open} onOpenChange={onOpenChange} inline /></div> : null;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{title ?? (props.workItemId ? "Edit item" : "New Pulse item")}</DialogTitle><DialogDescription>{props.workItemId ? "Update the work itself. Destination changes are audited and never change access or membership." : "Set the destination, owner, schedule, and status before saving."}</DialogDescription></DialogHeader><ItemEditorFields {...props} open={open} onOpenChange={onOpenChange} /><DialogFooter /></DialogContent></Dialog>;
}

export function PulseInlineItemRow({ item, onChanged, defaultDestinationId, sourceSessionId }: { item: any; onChanged: () => void; defaultDestinationId?: string | null; sourceSessionId?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const details = item.description ? item.description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "";
  const indicator = (count: number, label: string, icon: ReactNode) => count > 0 ? <span title={`${count} ${label}`} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">{icon}{count}</span> : null;
  return <div className="overflow-hidden rounded-lg border border-border bg-card"><button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/45"><span className={"mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border " + (item.status === "done" || item.status === "solved" ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground")}>{item.status === "done" || item.status === "solved" ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className={item.status === "done" || item.status === "solved" ? "font-medium text-muted-foreground line-through" : "font-medium"}>{item.title}</span><span className="mt-1 block text-sm text-muted-foreground">{item.assigneeName ?? "Unassigned"} · {item.priorityLevel ?? "medium"} priority · due {dateLabel(item.dueDate)}{item.issueTimeframe ? ` · ${item.issueTimeframe === "long_term" ? "long-term" : "short-term"}` : ""}{item.meetingName ? ` · ${item.meetingName}` : ""}</span>{details ? <span className="mt-1 block truncate text-sm text-muted-foreground">{details}</span> : null}<span className="mt-2 flex flex-wrap gap-1.5">{indicator(Number(item.commentCount ?? 0), "comments", <MessageCircle className="h-3.5 w-3.5" />)}{indicator(Number(item.attachmentCount ?? 0), "documents", <Paperclip className="h-3.5 w-3.5" />)}{indicator(Number(item.linkedSubTodoCount ?? 0), "linked sub-To-Dos", <ListChecks className="h-3.5 w-3.5" />)}</span></span><ChevronDown className={`mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} /></button><PulseItemEditor inline open={expanded} onOpenChange={setExpanded} workItemId={item.id} defaultType={item.type === "issue" ? "issue" : "todo"} defaultDestinationId={defaultDestinationId ?? item.meetingId ?? null} sourceSessionId={sourceSessionId} title={item.title} onSaved={onChanged} /></div>;
}

export function PulseItemEditorButton({ children, ...props }: Omit<Props, "open" | "onOpenChange"> & { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <><Button type="button" onClick={() => setOpen(true)}>{children}</Button><PulseItemEditor {...props} open={open} onOpenChange={setOpen} /></>;
}
