import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function parseQuarterYear(value?: string | null) {
  const match = value?.trim().match(/^Q([1-4])\s+(\d{4})$/);
  return match ? Number(match[2]) : null;
}

export function currentProjectRockQuarter() {
  const now = new Date();
  return `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
}

export function projectRockQuarterOptions(selectedQuarter?: string | null) {
  const currentYear = new Date().getFullYear();
  const selectedYear = parseQuarterYear(selectedQuarter);
  const startYear = Math.min(currentYear - 1, selectedYear ?? currentYear - 1);
  const endYear = Math.max(currentYear + 3, selectedYear ?? currentYear + 3);

  return Array.from({ length: endYear - startYear + 1 }, (_, yearIndex) => {
    const year = startYear + yearIndex;
    return [1, 2, 3, 4].map(quarter => ({ value: `Q${quarter} ${year}`, label: `Q${quarter} ${year}` }));
  }).flat();
}

export function ProjectRockQuarterSelect({
  id,
  value,
  onValueChange,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
}) {
  return <Select value={value} onValueChange={onValueChange}>
    <SelectTrigger id={id}>
      <SelectValue placeholder="Select quarter" />
    </SelectTrigger>
    <SelectContent>
      {projectRockQuarterOptions(value).map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
    </SelectContent>
  </Select>;
}
