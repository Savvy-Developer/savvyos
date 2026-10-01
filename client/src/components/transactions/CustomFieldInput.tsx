import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

export type CustomField = {
  id: number;
  agentId: number;
  name: string;
  type: "date" | "money" | "number" | "percent" | "checkbox" | "select";
  options: string[] | null;
};

export function formatCustomFieldValue(field: CustomField, value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  if (field.type === "checkbox") return value === "true" ? "Yes" : "No";
  if (field.type === "money") return Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" });
  if (field.type === "percent") return `${value}%`;
  if (field.type === "date") {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  return value;
}

export function CustomFieldInput({ field, value, onChange, allowEmpty = true }: {
  field: CustomField;
  value: string;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
}) {
  if (field.type === "checkbox") {
    return <div className="flex h-9 items-center gap-2">
      <Checkbox aria-label={field.name} checked={value === "" ? "indeterminate" : value === "true"} onCheckedChange={checked => onChange(checked === true ? "true" : "false")} />
      <span className="text-sm text-muted-foreground">{value === "" ? "Not set" : value === "true" ? "Yes" : "No"}</span>
      {allowEmpty && value !== "" && <button type="button" className="text-xs text-muted-foreground underline" onClick={() => onChange("")}>Clear</button>}
    </div>;
  }
  if (field.type === "select") {
    return <select aria-label={field.name} value={value} onChange={e => onChange(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
      <option value="" disabled={!allowEmpty}>{allowEmpty ? "Not set" : "Choose a value"}</option>
      {(field.options ?? []).map(option => <option key={option} value={option}>{option}</option>)}
    </select>;
  }
  return <Input
    type={field.type === "date" ? "date" : "number"}
    step={field.type === "number" ? "0.0001" : "0.01"}
    min={field.type === "percent" ? 0 : undefined}
    max={field.type === "percent" ? 100 : undefined}
    value={value}
    onChange={e => onChange(e.target.value)}
    placeholder={field.type === "money" ? "Amount in USD" : field.type === "percent" ? "0–100" : undefined}
    className="h-9"
  />;
}
