import { useMemo, useState } from "react";
import { Bell, Check, CheckCircle2, CircleAlert, MessageCircle, AtSign, ListChecks, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

type NotificationActions = {
  clear: (item: any) => void;
  isClearing: boolean;
};

function NotificationRows({ items, isLoading, compact = false, actions }: { items: any[]; isLoading: boolean; compact?: boolean; actions: NotificationActions }) {
  const [showAll, setShowAll] = useState(false);
  const visibleItems = showAll ? items : items.slice(0, compact ? 4 : 8);
  if (isLoading) return <p className="py-2 text-sm text-muted-foreground">Loading notifications…</p>;
  if (!visibleItems.length) return <div className="flex items-center gap-2 rounded-md border border-dashed px-2 py-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-600" />You are caught up.</div>;
  return <><div className="space-y-1">{visibleItems.map((item: any) => {
    const href = item.meetingId ? `/pulse/meetings/${item.meetingId}` : "/pulse/dashboard";
    return <article key={`${item.kind}-${item.id}`} className="flex items-start gap-2 rounded-md border border-border/70 bg-background px-2 py-1.5"><span className="mt-0.5 shrink-0">{iconFor(item.notificationType)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5"><p className="text-sm font-medium">{item.headline}</p><span className="text-xs text-muted-foreground">· {item.meetingName ?? "Personal work"}</span></div><p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.body}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{formatEasternDateTime(item.createdAt, { includeYear: false })}</p></div><div className="flex shrink-0 items-center gap-0.5"><Button asChild type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Open notification source" title="Open source"><a href={href}><ExternalLink className="h-3.5 w-3.5" /></a></Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Clear notification" title="Clear notification" disabled={actions.isClearing} onClick={() => actions.clear(item)}><Check className="h-3.5 w-3.5" /></Button></div></article>;
  })}</div>{items.length > visibleItems.length ? <Button type="button" variant="ghost" size="sm" className="mt-1 h-8 w-full text-xs" onClick={() => setShowAll(true)}><ChevronDown className="mr-1 h-3.5 w-3.5" />Show {items.length - visibleItems.length} more</Button> : null}{showAll && items.length > (compact ? 4 : 8) ? <Button type="button" variant="ghost" size="sm" className="mt-1 h-8 w-full text-xs" onClick={() => setShowAll(false)}><ChevronUp className="mr-1 h-3.5 w-3.5" />Show less</Button> : null}</>;
}

function usePulseNotifications(meetingId?: string) {
  const utils = trpc.useUtils();
  const notifications = trpc.pulse.notifications.pending.useQuery();
  const clear = trpc.pulse.notifications.clear.useMutation({ onSuccess: () => { void notifications.refetch(); void utils.pulse.personal.invalidate(); toast.success("Notification cleared."); }, onError: (error) => toast.error(error.message) });
  const clearWorkItemNotification = trpc.pulse.notifications.clearWorkItemNotification.useMutation({ onSuccess: () => { void notifications.refetch(); void utils.pulse.personal.invalidate(); toast.success("Notification cleared."); }, onError: (error) => toast.error(error.message) });
  const items = useMemo(() => (notifications.data ?? []).filter((item: any) => !meetingId || item.meetingId === meetingId), [meetingId, notifications.data]);
  return {
    items,
    isLoading: notifications.isLoading,
    actions: {
      isClearing: clear.isPending || clearWorkItemNotification.isPending,
      clear: (item: any) => item.kind === "work_item_notification" ? clearWorkItemNotification.mutate({ notificationId: item.id }) : clear.mutate({ notificationId: item.id }),
    },
  };
}

export function PulseNotificationsPopover({ meetingId }: { meetingId?: string }) {
  const { items, isLoading, actions } = usePulseNotifications(meetingId);
  return <Popover><PopoverTrigger asChild><Button type="button" variant="outline" size="icon" className="relative h-10 w-10 shrink-0" aria-label={`Notifications${items.length ? ` (${items.length})` : ""}`} title="Notifications"><Bell className="h-4 w-4" />{items.length ? <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white ring-2 ring-background">{items.length > 99 ? "99+" : items.length}</span> : null}</Button></PopoverTrigger><PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-2"><div className="mb-2 flex items-center justify-between gap-2 px-1"><div><p className="text-sm font-semibold">Notifications</p><p className="text-xs text-muted-foreground">{items.length ? `${items.length} needing attention` : "You are caught up."}</p></div></div><div className="max-h-80 overflow-y-auto pr-1"><NotificationRows items={items} isLoading={isLoading} compact actions={actions} /></div></PopoverContent></Popover>;
}

export function PulseNotificationsInbox({ meetingId, compact = false, collapsible = false, defaultExpanded = true }: { meetingId?: string; compact?: boolean; collapsible?: boolean; defaultExpanded?: boolean }) {
  const { items, isLoading, actions } = usePulseNotifications(meetingId);
  const [expanded, setExpanded] = useState(() => collapsible ? defaultExpanded : true);
  const isCollapsed = collapsible && !expanded;
  const toggle = () => setExpanded((value) => !value);
  return <Card className="pulse-card-compact self-start"><CardHeader className="flex flex-row items-start justify-between gap-2 py-2"><div className="min-w-0"><CardTitle className="flex items-center gap-2 text-base"><span className="relative"><Bell className="h-4 w-4 text-primary" />{isCollapsed && items.length ? <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-background"><span className="sr-only">{items.length} unread notifications</span></span> : null}</span>Notifications inbox{items.length && !isCollapsed ? <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">{items.length}</span> : null}</CardTitle><CardDescription className="mt-0.5">{isCollapsed ? items.length ? `${items.length} unread notification${items.length === 1 ? "" : "s"}` : "You are caught up." : "Mentions, comments, owner updates, blockers, and work notifications."}</CardDescription></div>{collapsible ? <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" aria-expanded={expanded} aria-controls="pulse-notifications-inbox" onClick={toggle}>{expanded ? <><ChevronUp className="mr-1 h-3.5 w-3.5" />Collapse</> : <><ChevronDown className="mr-1 h-3.5 w-3.5" />Expand</>}</Button> : null}</CardHeader>{!isCollapsed ? <CardContent id="pulse-notifications-inbox" className="pt-0"><NotificationRows items={items} isLoading={isLoading} compact={compact} actions={actions} /></CardContent> : null}</Card>;
}
