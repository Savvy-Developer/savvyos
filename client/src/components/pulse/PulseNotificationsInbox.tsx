import { useMemo, useState } from "react";
import { Bell, Check, CheckCircle2, CircleAlert, MessageCircle, AtSign, ClipboardCheck, ListChecks, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { formatEasternDateTime } from "@/lib/format";

const iconFor = (type?: string) => {
  if (type === "mention") return <AtSign className="h-4 w-4 text-violet-600" />;
  if (type === "comment") return <MessageCircle className="h-4 w-4 text-sky-600" />;
  if (type === "completion" || type === "rock_done") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (type === "blocker" || type === "overdue") return <CircleAlert className="h-4 w-4 text-rose-600" />;
  if (type === "assignment") return <ListChecks className="h-4 w-4 text-primary" />;
  return <Bell className="h-4 w-4 text-muted-foreground" />;
};

export function PulseNotificationsInbox({ meetingId, compact = false, collapsible = false, defaultExpanded = true }: { meetingId?: string; compact?: boolean; collapsible?: boolean; defaultExpanded?: boolean }) {
  const utils = trpc.useUtils();
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState(() => collapsible ? defaultExpanded : true);
  const notifications = trpc.pulse.notifications.pending.useQuery();
  const clear = trpc.pulse.notifications.clear.useMutation({
    onSuccess: () => { void notifications.refetch(); void utils.pulse.personal.invalidate(); toast.success("Notification cleared."); },
    onError: (error) => toast.error(error.message),
  });
  const clearWorkItemNotification = trpc.pulse.notifications.clearWorkItemNotification.useMutation({
    onSuccess: () => { void notifications.refetch(); void utils.pulse.personal.invalidate(); toast.success("Notification cleared."); },
    onError: (error) => toast.error(error.message),
  });

  const items = useMemo(() => (notifications.data ?? []).filter((item: any) => !meetingId || item.meetingId === meetingId), [meetingId, notifications.data]);
  const visibleItems = showAll ? items : items.slice(0, compact ? 4 : 8);
  const isClearing = clear.isPending || clearWorkItemNotification.isPending;
  const isCollapsed = collapsible && !expanded;
  const toggle = () => { setExpanded((value) => !value); if (expanded) setShowAll(false); };

  return <Card className="pulse-card-compact self-start"><CardHeader className="flex flex-row items-start justify-between gap-2 py-2"><div className="min-w-0"><CardTitle className="flex items-center gap-2 text-base"><span className="relative"><Bell className="h-4 w-4 text-primary" />{isCollapsed && items.length ? <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-background"><span className="sr-only">{items.length} unread notification{items.length === 1 ? "" : "s"}</span></span> : null}</span>Notifications inbox{items.length && !isCollapsed ? <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">{items.length}</span> : null}</CardTitle>{isCollapsed ? <CardDescription className="mt-0.5">{items.length ? `${items.length} unread notification${items.length === 1 ? "" : "s"}` : "You are caught up."}</CardDescription> : <CardDescription className="mt-0.5">Mentions, comments, owner updates, blockers, and work notifications.</CardDescription>}</div>{collapsible ? <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" aria-expanded={expanded} aria-controls="pulse-notifications-inbox" onClick={toggle}>{expanded ? <><ChevronUp className="mr-1 h-3.5 w-3.5" />Collapse</> : <><ChevronDown className="mr-1 h-3.5 w-3.5" />Expand</>}</Button> : null}</CardHeader>{!isCollapsed ? <CardContent id="pulse-notifications-inbox" className="space-y-1 pt-0">{notifications.isLoading ? <p className="py-2 text-sm text-muted-foreground">Loading notifications…</p> : visibleItems.length ? visibleItems.map((item: any) => {
    const href = item.meetingId ? `/pulse/meetings/${item.meetingId}` : "/pulse/dashboard";
    return <article key={`${item.kind}-${item.id}`} className="flex items-start gap-2 rounded-md border border-border/70 bg-background px-2 py-1"><span className="mt-0.5 shrink-0">{iconFor(item.notificationType)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5"><p className="text-sm font-medium">{item.headline}</p><span className="text-xs text-muted-foreground">· {item.meetingName ?? "Personal work"}</span></div><p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.body}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{formatEasternDateTime(item.createdAt, { includeYear: false })}</p></div><div className="flex shrink-0 items-center gap-0.5"><Button asChild type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Open notification source" title="Open source"><a href={href}><ExternalLink className="h-3.5 w-3.5" /></a></Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Clear notification" title="Clear notification" disabled={isClearing} onClick={() => item.kind === "work_item_notification" ? clearWorkItemNotification.mutate({ notificationId: item.id }) : clear.mutate({ notificationId: item.id })}><Check className="h-3.5 w-3.5" /></Button></div></article>;
  }) : <div className="flex items-center gap-2 rounded-md border border-dashed px-2 py-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-600" />You are caught up.</div>}{items.length > visibleItems.length ? <Button type="button" variant="ghost" size="sm" className="h-8 w-full text-xs" onClick={() => setShowAll(true)}><ChevronDown className="mr-1 h-3.5 w-3.5" />Show {items.length - visibleItems.length} more</Button> : null}{showAll && items.length > (compact ? 4 : 8) ? <Button type="button" variant="ghost" size="sm" className="h-8 w-full text-xs" onClick={() => setShowAll(false)}>Show less</Button> : null}</CardContent> : null}</Card>;
}
