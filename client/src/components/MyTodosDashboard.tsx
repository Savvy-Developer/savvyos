import { format, isPast, isToday } from "date-fns";
import {
  Check,
  CheckCircle2,
  Circle,
  ClipboardList,
  ExternalLink,
  FolderKanban,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

function duePresentation(value: Date | string | null) {
  if (!value)
    return { label: "No due date", className: "text-muted-foreground" };
  const due = new Date(value);
  if (isPast(due) && !isToday(due))
    return {
      label: `Overdue · ${format(due, "MMM d")}`,
      className: "font-medium text-destructive",
    };
  if (isToday(due))
    return { label: "Due today", className: "font-medium text-amber-700" };
  return {
    label: `Due ${format(due, "MMM d, yyyy")}`,
    className: "text-muted-foreground",
  };
}

export default function MyTodosDashboard() {
  const utils = trpc.useUtils();
  const { data: todos = [], isLoading } = trpc.pm.myTodos.listOpen.useQuery();
  const complete = trpc.pm.myTodos.complete.useMutation({
    onSuccess: (_, input) => {
      toast.success(
        input.source === "l10"
          ? "L10 To-Do completed and sent for acknowledgement."
          : "Project To-Do completed."
      );
      void utils.pm.myTodos.invalidate();
      void utils.pm.projects.invalidate();
      void utils.pm.l10Todos.invalidate();
      void utils.pulse.workItems.invalidate();
      void utils.pulse.l10.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const items = todos as any[];

  return (
    <section className="mb-6 rounded-lg border border-primary/25 bg-primary/[0.025]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-primary/15 p-4">
        <div className="flex gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ClipboardList className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold">My To-Dos</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Open commitments assigned to you from L10 meetings and Projects.
              Completing an item updates its original source.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-primary/20 bg-background px-2.5 py-1 text-xs font-semibold text-primary">
          {items.length} open
        </span>
      </div>
      <div className="divide-y divide-border/70">
        {isLoading ? (
          <div className="p-5 text-sm text-muted-foreground">
            Loading your To-Dos…
          </div>
        ) : null}
        {!isLoading && items.length === 0 ? (
          <div className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            You have no open L10 or Project To-Dos.
          </div>
        ) : null}
        {items.map(todo => {
          const due = duePresentation(todo.dueDate);
          const isL10 = todo.source === "l10";
          const href = isL10
            ? `/pulse/meetings/${todo.meetingId}`
            : `/projects/${todo.projectId}?tab=tasks#todo-${todo.sourceId}`;
          const sourceText = isL10
            ? `L10 · ${todo.sourceLabel}${todo.sourceDate ? ` · ${format(new Date(todo.sourceDate), "MMM d, yyyy")}` : ""}`
            : `Project · ${todo.sourceLabel}`;
          return (
            <article
              key={todo.id}
              className="flex gap-3 p-4 transition-colors hover:bg-background/80"
            >
              <Checkbox
                checked={false}
                disabled={complete.isPending}
                onCheckedChange={checked => {
                  if (checked === true)
                    complete.mutate({
                      source: todo.source,
                      sourceId: todo.sourceId,
                    });
                }}
                aria-label={`Complete ${todo.title}`}
                className="mt-0.5 h-5 w-5 rounded-full data-[state=checked]:border-emerald-500 data-[state=checked]:bg-emerald-500"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="min-w-0 font-medium">{todo.title}</h3>
                  <span className={`shrink-0 text-xs ${due.className}`}>
                    {due.label}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <a
                    href={href}
                    className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors hover:brightness-95 ${isL10 ? "border-violet-200 bg-violet-50 text-violet-800" : "border-primary/20 bg-primary/10 text-primary"}`}
                  >
                    <span className="truncate">{sourceText}</span>
                    {isL10 ? (
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    ) : (
                      <FolderKanban className="h-3 w-3 shrink-0" />
                    )}
                  </a>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
