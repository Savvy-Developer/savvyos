import { useState } from "react";
import { LockKeyhole, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  PAYOUT_STATUSES,
  PAYOUT_STATUS_LABELS,
  resolvePayoutStatus,
  type PayoutStatus,
} from "@shared/payoutStatus";

const STATUS_STYLES: Record<PayoutStatus, string> = {
  unreviewed: "border-slate-300 bg-slate-100 text-slate-800",
  reviewed: "border-sky-300 bg-sky-100 text-sky-800",
  paid: "border-emerald-300 bg-emerald-100 text-emerald-800",
  settled: "border-violet-300 bg-violet-100 text-violet-900",
};

export function PayoutStatusBadge({
  status,
  isPaid = false,
  locked = false,
  className = "",
}: {
  status?: string | null;
  isPaid?: boolean;
  locked?: boolean;
  className?: string;
}) {
  const normalized = resolvePayoutStatus(status, isPaid);
  return (
    <Badge
      variant="outline"
      className={`gap-1 whitespace-nowrap ${STATUS_STYLES[normalized]} ${className}`}
    >
      {locked || normalized === "settled" ? (
        <LockKeyhole className="h-3 w-3" aria-hidden="true" />
      ) : null}
      {PAYOUT_STATUS_LABELS[normalized]}
    </Badge>
  );
}

type StatusChange = {
  status: PayoutStatus;
  confirmSettlement?: boolean;
  overrideSettled?: boolean;
  overrideReason?: string;
};

export function PayoutStatusControl({
  status,
  isPaid = false,
  canEdit,
  canOverrideSettled,
  isPending = false,
  onChange,
  className = "",
}: {
  status?: string | null;
  isPaid?: boolean;
  canEdit: boolean;
  canOverrideSettled: boolean;
  isPending?: boolean;
  onChange: (change: StatusChange) => void;
  className?: string;
}) {
  const currentStatus = resolvePayoutStatus(status, isPaid);
  const [settlementTarget, setSettlementTarget] = useState<PayoutStatus | null>(
    null
  );
  const [overrideTarget, setOverrideTarget] = useState<PayoutStatus | null>(
    null
  );
  const [overrideReason, setOverrideReason] = useState("");

  function requestChange(nextStatus: PayoutStatus) {
    if (nextStatus === currentStatus) return;
    if (currentStatus === "settled") {
      if (canOverrideSettled) setOverrideTarget(nextStatus);
      return;
    }
    if (nextStatus === "settled") {
      setSettlementTarget(nextStatus);
      return;
    }
    onChange({ status: nextStatus });
  }

  if (currentStatus === "settled") {
    if (!canOverrideSettled) {
      return (
        <div className={`flex items-center gap-1.5 ${className}`}>
          <PayoutStatusBadge status={currentStatus} locked />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            Locked
          </span>
        </div>
      );
    }

    return (
      <>
        <Select
          value={currentStatus}
          onValueChange={value => requestChange(value as PayoutStatus)}
          disabled={isPending}
        >
          <SelectTrigger
            className={`h-8 w-[142px] text-xs border-violet-300 bg-violet-50 ${className}`}
            aria-label="Override settled payout status"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYOUT_STATUSES.map(value => (
              <SelectItem key={value} value={value} className="text-xs">
                {value === "settled"
                  ? "Settled (locked)"
                  : PAYOUT_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <AlertDialog
          open={overrideTarget !== null}
          onOpenChange={open => {
            if (!open) {
              setOverrideTarget(null);
              setOverrideReason("");
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Override settled payout?</AlertDialogTitle>
              <AlertDialogDescription>
                This deliberately unlocks a settled payee and changes its status
                to{" "}
                {overrideTarget
                  ? PAYOUT_STATUS_LABELS[overrideTarget]
                  : "the selected status"}
                . The override will be recorded in the transaction activity
                history.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-1.5">
              <label
                htmlFor="settled-override-reason"
                className="text-sm font-medium"
              >
                Reason{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </label>
              <textarea
                id="settled-override-reason"
                value={overrideReason}
                onChange={event => setOverrideReason(event.target.value)}
                maxLength={1000}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Why is this settled payout being changed?"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-violet-700 hover:bg-violet-800"
                disabled={isPending || !overrideTarget}
                onClick={event => {
                  event.preventDefault();
                  if (!overrideTarget) return;
                  onChange({
                    status: overrideTarget,
                    overrideSettled: true,
                    overrideReason: overrideReason.trim() || undefined,
                  });
                  setOverrideTarget(null);
                  setOverrideReason("");
                }}
              >
                {isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LockKeyhole className="mr-1.5 h-3.5 w-3.5" />
                )}
                Confirm override
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  if (!canEdit) return <PayoutStatusBadge status={currentStatus} />;

  return (
    <>
      <Select
        value={currentStatus}
        onValueChange={value => requestChange(value as PayoutStatus)}
        disabled={isPending}
      >
        <SelectTrigger
          className={`h-8 w-[126px] text-xs ${className}`}
          aria-label="Change payout status"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PAYOUT_STATUSES.map(value => (
            <SelectItem key={value} value={value} className="text-xs">
              {PAYOUT_STATUS_LABELS[value]}
              {value === "settled" ? " (locks)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <AlertDialog
        open={settlementTarget !== null}
        onOpenChange={open => {
          if (!open) setSettlementTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Settle and lock this payout?</AlertDialogTitle>
            <AlertDialogDescription>
              Settled status is locked for normal users. Only a Transactions
              Admin can deliberately override it, and that override is recorded
              in the transaction activity history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-violet-700 hover:bg-violet-800"
              disabled={isPending}
              onClick={event => {
                event.preventDefault();
                if (!settlementTarget) return;
                onChange({ status: settlementTarget, confirmSettlement: true });
                setSettlementTarget(null);
              }}
            >
              {isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <LockKeyhole className="mr-1.5 h-3.5 w-3.5" />
              )}
              Settle and lock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
