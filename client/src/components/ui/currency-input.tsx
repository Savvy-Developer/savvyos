import * as React from "react";
import { Input } from "./input";
import { cn } from "@/lib/utils";

/**
 * CurrencyInput — a dollar input field that auto-formats with commas as the user types.
 * Stores the raw numeric string (no commas, no $) in the parent state via onChange.
 * Displays with commas in the input box and a $ prefix label.
 */
interface CurrencyInputProps {
  value: string;
  onChange: (rawValue: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function CurrencyInput({ value, onChange, placeholder, className, disabled }: CurrencyInputProps) {
  // Format the display value with commas
  const displayValue = React.useMemo(() => {
    const raw = value.replace(/[^0-9]/g, "");
    if (!raw) return "";
    const cleaned = raw.replace(/^0+(?=\d)/, "");
    return cleaned.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip to raw digits only for storage
    const raw = e.target.value.replace(/[^0-9]/g, "");
    onChange(raw);
  };

  return (
    <div className="relative">
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
      <Input
        className={cn("pl-6 h-8 text-sm", className)}
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}

export default CurrencyInput;
