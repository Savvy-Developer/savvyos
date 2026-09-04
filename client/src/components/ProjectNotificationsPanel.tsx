import { useState } from "react";
import { useLocation } from "wouter";
import { Bell, Check, EyeOff, MessageSquare, StickyNote, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type NotificationItem = {
  type: "note" | "comment";
  id: number;
  taskId?: number;
  projectId: number;
  projectTitle: string;
  authorName: string | null;
  content: string;
  createdAt: Date;
  isUnread: boolean;
  isMentioned: boolean;
};

export default function ProjectNotificationsPanel() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const { data: countData, refetch: refetchCount } = trpc.pm.inbox.unreadCount.useQuery(undefined, { refetchInterval: 30000 });
  const { data: items = [], refetch: refetchItems } = trpc.pm.inbox.list.useQuery(undefined, { enabled: open });
  const markNoteRead = trpc.pm.notes.markRead.useMutation({ onSuccess: () => { void refetchItems(); void refetchCount(); } });
  const markNoteUnread = trpc.pm.notes.markUnread.useMutation({ onSuccess: () => { void refetchItems(); void refetchCount(); } });
  const markComment = trpc.pm.inbox.markCommentRead.useMutation({ onSuccess: () => { void refetchItems(); void refetchCount(); } });
  const dismiss = trpc.pm.inbox.dismiss.useMutation({ onSuccess: () => { toast.success("Notification removed"); void refetchItems(); void refetchCount(); }, onError: (error) => toast.error(error.message) });
  const unreadCount = (countData as any)?.count ?? 0;

  function visit(item: NotificationItem) {
    if (item.isUnread) {
      if (item.type === "note") markNoteRead.mutate({ noteId: item.id });
      else markComment.mutate({ commentId: item.id });
    }
    const target = item.type === "note"
      ? `/projects/${item.projectId}?tab=notes#note-${item.id}`
      : `/projects/${item.projectId}?tab=tasks#todo-${item.taskId}-comment-${item.id}`;
    navigate(target);
    setOpen(false);
  }

  function toggleUnread(event: React.MouseEvent, item: NotificationItem) {
    event.stopPropagation();
    if (item.type === "note") {
      if (item.isUnread) markNoteRead.mutate({ noteId: item.id });
      else markNoteUnread.mutate({ noteId: item.id });
    } else {
      markComment.mutate({ commentId: item.id, markedUnread: !item.isUnread });
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="relative">
          <Bell className="mr-1.5 h-4 w-4" /> Notifications
          {unreadCount > 0 && <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{unreadCount}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3"><div><p className="text-sm font-semibold">Notifications</p><p className="text-xs text-muted-foreground">Only activity from projects you can access</p></div>{unreadCount > 0 && <span className="text-xs text-muted-foreground">{unreadCount} unread</span>}</div>
        <div className="max-h-[28rem] overflow-y-auto">
          {(items as NotificationItem[]).length === 0 ? <div className="py-10 text-center text-muted-foreground"><Bell className="mx-auto mb-2 h-7 w-7 opacity-30" /><p className="text-sm">You are all caught up.</p></div> : <div className="divide-y divide-border">{(items as NotificationItem[]).map((item) => <button key={`${item.type}-${item.id}`} type="button" onClick={() => visit(item)} className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60 ${item.isUnread ? "bg-primary/5" : ""}`}>
            <span className="mt-0.5 shrink-0">{item.type === "note" ? <StickyNote className="h-4 w-4 text-primary" /> : <MessageSquare className="h-4 w-4 text-blue-500" />}</span>
            <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="truncate text-xs font-medium">{item.isMentioned ? `${item.authorName ?? "Someone"} mentioned you` : item.authorName ?? "Someone"}</span>{item.isUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}</span><span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{item.content}</span><span className="mt-1 block truncate text-[10px] text-muted-foreground">{item.projectTitle} · {formatDate(item.createdAt)}</span></span>
            <span className="flex shrink-0 flex-col gap-1"><span onClick={(event) => toggleUnread(event, item)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title={item.isUnread ? "Mark read" : "Mark unread"}>{item.isUnread ? <Check className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</span><span onClick={(event) => { event.stopPropagation(); dismiss.mutate({ type: item.type, id: item.id }); }} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive" title="Remove notification"><Trash2 className="h-3.5 w-3.5" /></span></span>
          </button>)}</div>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatDate(value: Date) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
