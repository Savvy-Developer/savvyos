import { CheckCircle2, Radio } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type MeetingOption = {
  id: string;
  name: string;
  label?: string | null;
  purpose?: string | null;
};

function meetingTypeLabel(label?: string | null) {
  if (label === "level_10") return "L10";
  if (label === "one_on_one") return "1:1";
  return "Meeting";
}

export function RockMeetingRoutingSelector({
  meetings,
  selectedMeetingIds,
  onChange,
  disabled = false,
}: {
  meetings: MeetingOption[];
  selectedMeetingIds: string[];
  onChange: (meetingIds: string[]) => void;
  disabled?: boolean;
}) {
  const selected = new Set(selectedMeetingIds);

  return <div className="rounded-md border border-border bg-background p-2.5">
    <div className="flex items-start gap-2">
      <Radio className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div>
        <Label>Route this Rock to Pulse meetings</Label>
        <p className="mt-0.5 text-xs leading-4 text-muted-foreground">Selected L10s and meetings review the same Project Rock; nothing is copied.</p>
      </div>
    </div>
    {meetings.length ? <div className="mt-2 space-y-1.5">{meetings.map((meeting) => {
      const checked = selected.has(meeting.id);
      return <label key={meeting.id} className={`flex min-h-10 cursor-pointer items-start gap-2.5 rounded-md border px-2.5 py-2 transition-colors ${checked ? "border-primary/40 bg-primary/[0.04]" : "border-border hover:bg-muted/50"}`}>
        <Checkbox checked={checked} disabled={disabled} onCheckedChange={(value) => {
          const next = value === true
            ? Array.from(new Set([...selectedMeetingIds, meeting.id]))
            : selectedMeetingIds.filter((meetingId) => meetingId !== meeting.id);
          onChange(next);
        }} />
        <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-1.5"><span className="font-medium">{meeting.name}</span><span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{meetingTypeLabel(meeting.label)}</span>{checked ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : null}</span>{meeting.purpose ? <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">{meeting.purpose}</span> : null}</span>
      </label>;
    })}</div> : <p className="mt-2 rounded-md border border-dashed px-2.5 py-2 text-xs leading-4 text-muted-foreground">No authorized active Pulse meetings are available to route this Rock to. Meeting routing appears when you have access to manage an L10 or meeting.</p>}
  </div>;
}
