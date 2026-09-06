import * as React from "react";
import { Input } from "./input";
import { cn } from "@/lib/utils";

/**
 * CurrencyInput — a dollar input field that consistently displays $#,###.##.
 * Stores a raw numeric string (no commas or currency symbol) in parent state.
 */
interface CurrencyInputProps {
  value: string;
  onChange: (rawValue: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function CurrencyInput({ value, onChange, placeholder, className, disabled }: CurrencyInputProps) {
  const [focused, setFocused] = React.useState(false);
  const rawValue = value.replace(/[^0-9.]/g, "");
  const displayValue = React.useMemo(() => {
    if (!rawValue) return "";
    if (focused) return rawValue;
    const amount = Number(rawValue);
    if (!Number.isFinite(amount)) return "";
    return amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, [focused, rawValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = e.target.value.replace(/[^0-9.]/g, "");
    const [whole = "", ...decimalParts] = sanitized.split(".");
    const decimal = decimalParts.join("").slice(0, 2);
    const normalizedWhole = whole.replace(/^0+(?=\d)/, "") || (sanitized.startsWith(".") ? "0" : whole);
    onChange(decimalParts.length ? `${normalizedWhole}.${decimal}` : normalizedWhole);
  };

  return (
    <div className="relative">
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
      <Input
        className={cn("pl-6 h-8 text-sm", className)}
        value={displayValue}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        disabled={disabled}
        inputMode="decimal"
      />
    </div>
  );
}

export default CurrencyInput;
