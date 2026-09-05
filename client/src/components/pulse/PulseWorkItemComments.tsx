import { useMemo, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { formatEasternDateTime } from "@/lib/format";

type Mention = { id: number; name: string };

type Props = {
  workItemId: string;
  comments?: any[];
  members?: any[];
  onChanged?: () => void;
  compact?: boolean;
};

function personName(person: any) {
  return person?.name ?? person?.email ?? "Teammate";
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?";
}

export function PulseWorkItemComments({ workItemId, comments = [], members = [], onChanged, compact = false }: Props) {
  const utils = trpc.useUtils();
  const [body, setBody] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [selectedMentions, setSelectedMentions] = useState<Mention[]>([]);
  const candidates = useMemo(() => (members ?? [])
    .filter((person: any) => !selectedMentions.some(mention => mention.id === person.id))
    .filter((person: any) => !mentionQuery || personName(person).toLowerCase().includes(mentionQuery.toLowerCase())), [members, mentionQuery, selectedMentions]);
  const addComment = trpc.pulse.workItems.addComment.useMutation({
    onSuccess: () => {
      setBody("");
      setMentionQuery(null);
      setSelectedMentions([]);
      void utils.pulse.workItems.invalidate();
      void utils.pulse.personal.invalidate();
      void utils.pulse.l10.invalidate();
      onChanged?.();
      toast.success("Comment posted.");
    },
    onError: error => toast.error(error.message),
  });
  const post = () => {
    if (!body.trim()) return;
    addComment.mutate({ workItemId, body: body.trim(), mentionedPersonIds: selectedMentions.map(mention => mention.id) });
  };
  const insertMention = (person: any) => {
    const name = personName(person);
    setSelectedMentions(current => current.some(mention => mention.id === person.id) ? current : [...current, { id: person.id, name }]);
    setBody(current => current.replace(/(^|\s)@[^\s@]*$/, `$1@${name} `));
    setMentionQuery(null);
  };
  return <section id={`pulse-work-item-${workItemId}-comments`} className={`rounded-md border bg-background ${compact ? "p-2" : "p-2.5"}`}>
    <div className="flex items-center justify-between gap-2"><h4 className="flex items-center gap-1.5 text-sm font-semibold"><MessageCircle className="h-4 w-4 text-primary" />Comments</h4><span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{comments.length}</span></div>
    {comments.length ? <div className="mt-2 divide-y">{comments.map((comment: any) => {
      const author = comment.authorName ?? "Teammate";
      return <article id={`pulse-work-item-${workItemId}-comment-${comment.id}`} key={comment.id} className="flex gap-2 py-2 first:pt-0 last:pb-0"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{initials(author)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><span className="text-xs font-semibold">{author}</span><span className="text-[11px] text-muted-foreground">{formatEasternDateTime(comment.createdAt)}</span></div><p className="mt-0.5 whitespace-pre-wrap text-sm">{comment.body}</p>{comment.mentions?.length ? <div className="mt-1 flex flex-wrap gap-1">{comment.mentions.map((mention: any) => <span key={mention.personId} className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">@{mention.name ?? "Teammate"}</span>)}</div> : null}</div></article>;
    })}</div> : <p className="mt-2 text-sm text-muted-foreground">No comments yet. Add context or @mention a meeting participant.</p>}
    <div className="relative mt-2"><Textarea value={body} onChange={event => { const value = event.target.value; setBody(value); const match = value.match(/(?:^|\s)@([^\s@]*)$/); setMentionQuery(match ? match[1] : null); }} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && body.trim()) { event.preventDefault(); post(); } }} className="min-h-20 resize-none text-sm" placeholder="Add a comment… Type @ to mention a meeting participant." />{mentionQuery !== null ? <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border bg-popover shadow-lg">{candidates.length ? <div className="max-h-44 overflow-y-auto py-1">{candidates.map((person: any) => <button type="button" key={person.id} onClick={() => insertMention(person)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">{initials(personName(person))}</span><span>{personName(person)}</span></button>)}</div> : <p className="px-3 py-2 text-xs text-muted-foreground">No matching meeting participants.</p>}</div> : null}</div>
    {selectedMentions.length ? <div className="mt-1.5 flex flex-wrap gap-1">{selectedMentions.map(mention => <span key={mention.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">@{mention.name}<button type="button" onClick={() => setSelectedMentions(current => current.filter(item => item.id !== mention.id))} aria-label={`Remove ${mention.name} mention`}><X className="h-3 w-3" /></button></span>)}</div> : null}
    <div className="mt-2 flex justify-end"><Button type="button" size="sm" className="h-8" disabled={!body.trim() || addComment.isPending} onClick={post}>{addComment.isPending ? "Posting…" : <><Send className="mr-1.5 h-3.5 w-3.5" />Post</>}</Button></div>
  </section>;
}
