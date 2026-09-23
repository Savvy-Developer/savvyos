import {
  AlertTriangle,
  BriefcaseBusiness,
  CalendarDays,
  CheckSquare,
  Flag,
  UsersRound,
} from "lucide-react";
import { format } from "date-fns";
import { trpc } from "@/lib/trpc";

function heatColor(value: number, max: number) {
  if (value === 0) return "bg-muted text-muted-foreground";
  const ratio = max ? value / max : 0;
  if (ratio >= 0.75) return "bg-primary text-primary-foreground";
  if (ratio >= 0.45) return "bg-primary/70 text-primary-foreground";
  return "bg-primary/25 text-primary";
}

export default function ProjectsWorkloadView() {
  const { data, isLoading, error } = trpc.pm.workload.get.useQuery();
  if (isLoading)
    return (
      <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">
        Loading team workload…
      </div>
    );
  if (error)
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
        Workload is not available for this account.
      </div>
    );
  if (!data) return null;
  const members = data.members as any[];
  const weeks = data.weeks as { key: string; label: string }[];
  const maxWeek = Math.max(
    1,
    ...members.flatMap((member: any) => member.weeklyDue as number[])
  );

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <UsersRound className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Workload</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Open work across active team members. Due counts combine L10 and
          Project To-Dos; overdue work is included in the current week and
          undated work is kept separate.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[1050px] text-sm">
          <thead className="border-b bg-muted/35 text-xs text-muted-foreground">
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 min-w-48 bg-card px-3 py-3 text-left font-semibold"
              >
                Team member
              </th>
              <th scope="col" className="px-2 py-3 text-center font-semibold">
                <span className="inline-flex items-center gap-1">
                  <Flag className="h-3.5 w-3.5" />
                  Rocks
                </span>
              </th>
              <th scope="col" className="px-2 py-3 text-center font-semibold">
                <span className="inline-flex items-center gap-1">
                  <BriefcaseBusiness className="h-3.5 w-3.5" />
                  Projects
                </span>
              </th>
              <th scope="col" className="px-2 py-3 text-center font-semibold">
                L10 To-Dos
              </th>
              <th scope="col" className="px-2 py-3 text-center font-semibold">
                Project To-Dos
              </th>
              <th scope="col" className="px-2 py-3 text-center font-semibold">
                <span className="inline-flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Overdue
                </span>
              </th>
              <th scope="col" className="px-2 py-3 text-center font-semibold">
                No due date
              </th>
              {weeks.map(week => (
                <th
                  key={week.key}
                  scope="col"
                  className="min-w-16 px-1 py-3 text-center font-semibold"
                  title={`Week of ${format(new Date(`${week.key}T12:00:00`), "MMM d, yyyy")}`}
                >
                  {week.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((member: any) => (
              <tr
                key={member.id}
                className="border-b last:border-b-0 hover:bg-muted/25"
              >
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-card px-3 py-3 text-left font-medium"
                >
                  <div>{member.name ?? member.email}</div>
                  {member.email && member.name ? (
                    <div className="mt-0.5 text-xs font-normal text-muted-foreground">
                      {member.email}
                    </div>
                  ) : null}
                </th>
                <td className="px-2 py-3 text-center font-medium">
                  {member.activeRocks}
                </td>
                <td className="px-2 py-3 text-center font-medium">
                  {member.activeProjects}
                </td>
                <td className="px-2 py-3 text-center font-medium">
                  {member.l10Todos}
                </td>
                <td className="px-2 py-3 text-center font-medium">
                  {member.projectTodos}
                </td>
                <td
                  className={`px-2 py-3 text-center font-semibold ${member.overdue ? "text-destructive" : ""}`}
                >
                  {member.overdue}
                </td>
                <td className="px-2 py-3 text-center font-medium">
                  {member.noDueDate}
                </td>
                {(member.weeklyDue as number[]).map((count, index) => (
                  <td
                    key={weeks[index]?.key ?? index}
                    className="px-1 py-3 text-center"
                  >
                    <span
                      className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-xs font-semibold ${heatColor(count, maxWeek)}`}
                    >
                      {count}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
            {members.length === 0 ? (
              <tr>
                <td
                  colSpan={7 + weeks.length}
                  className="p-10 text-center text-sm text-muted-foreground"
                >
                  No active team members were found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CheckSquare className="h-3.5 w-3.5" />
          Heat map: open To-Dos due each week
        </span>
        <span>Current week includes overdue items</span>
      </div>
    </section>
  );
}
