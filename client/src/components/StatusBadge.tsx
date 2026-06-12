import { Badge } from "@/components/ui/badge";

const PIPELINE_LABELS: Record<string, { label: string; className: string }> = {
  new_lead: { label: "New Lead", className: "bg-blue-100 text-blue-800 border-blue-200" },
  attempted_contact: { label: "Attempted", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  nurture: { label: "Nurture", className: "bg-purple-100 text-purple-800 border-purple-200" },
  active_client: { label: "Active", className: "bg-green-100 text-green-800 border-green-200" },
  under_contract: { label: "Under Contract", className: "bg-orange-100 text-orange-800 border-orange-200" },
  closed: { label: "Closed", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  dead: { label: "Dead", className: "bg-gray-100 text-gray-500 border-gray-200" },
};

const TX_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-blue-100 text-blue-800 border-blue-200" },
  under_contract: { label: "Under Contract", className: "bg-orange-100 text-orange-800 border-orange-200" },
  closed: { label: "Closed", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  terminated: { label: "Terminated", className: "bg-red-100 text-red-800 border-red-200" },
};

const PRIORITY_LABELS: Record<string, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-gray-100 text-gray-600 border-gray-200" },
  medium: { label: "Medium", className: "bg-blue-100 text-blue-700 border-blue-200" },
  high: { label: "High", className: "bg-orange-100 text-orange-700 border-orange-200" },
  urgent: { label: "Urgent", className: "bg-red-100 text-red-700 border-red-200" },
};

export const PIPELINE_STAGE_OPTIONS = [
  { value: "new_lead", label: "New Lead" },
  { value: "attempted_contact", label: "Attempted Contact" },
  { value: "nurture", label: "Nurture" },
  { value: "active_client", label: "Active Client" },
  { value: "under_contract", label: "Under Contract" },
  { value: "closed", label: "Closed" },
  { value: "dead", label: "Dead" },
];

export function PipelineStatusBadge({ status }: { status: string }) {
  const config = PIPELINE_LABELS[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
      {config.label}
    </span>
  );
}

export function TransactionStatusBadge({ status }: { status: string }) {
  const config = TX_LABELS[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
      {config.label}
    </span>
  );
}

export function IsaStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const config = PIPELINE_LABELS[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
      ISA: {config.label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const config = PRIORITY_LABELS[priority] ?? { label: priority, className: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
      {config.label}
    </span>
  );
}
