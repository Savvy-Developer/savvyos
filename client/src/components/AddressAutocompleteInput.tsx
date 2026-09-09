import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";

export type VerifiedAddress = {
  address: string;
  city: string;
  state: string;
  zip: string;
};

type AddressSuggestion = {
  placeId: string;
  description: string;
};

type AddressAutocompleteInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSelectAddress: (address: VerifiedAddress) => void;
  onVerificationChange?: (verified: boolean) => void;
  placeholder?: string;
  disabled?: boolean;
};

/**
 * A property-address input backed by an authenticated server-side Google Places
 * request. It deliberately avoids a browser build-time Maps key, which can be
 * missing in an otherwise healthy production deployment.
 */
export function AddressAutocompleteInput({
  value,
  onChange,
  onSelectAddress,
  onVerificationChange,
  placeholder = "Start typing a street address",
  disabled,
}: AddressAutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verificationProvider, setVerificationProvider] = useState("address lookup");
  const [unavailable, setUnavailable] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const query = value.trim();
    setSuggestions([]);
    if (query.length < 3) {
      setLoading(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      const currentRequest = ++requestId.current;
      setLoading(true);
      try {
        const response = await fetch("/api/external/address-suggestions", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Address suggestions are temporarily unavailable.");
        if (requestId.current === currentRequest) {
          setSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions : []);
          setUnavailable(false);
        }
      } catch {
        if (requestId.current === currentRequest) {
          setSuggestions([]);
          setUnavailable(true);
        }
      } finally {
        if (requestId.current === currentRequest) setLoading(false);
      }
    }, 280);
    return () => window.clearTimeout(timer);
  }, [value]);

  async function selectSuggestion(suggestion: AddressSuggestion) {
    setSelecting(true);
    setSuggestions([]);
    try {
      const response = await fetch("/api/external/address-suggestions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: suggestion.placeId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.address) throw new Error(payload.error || "Unable to retrieve address details.");
      const address = payload.address as VerifiedAddress;
      if (!address.address || !address.city || !address.state || !address.zip) {
        setUnavailable(true);
        onChange(payload.address.formattedAddress || suggestion.description);
        return;
      }
      setVerified(true);
      setVerificationProvider(payload.provider === "census" ? "U.S. Census Bureau" : "Google Maps");
      onVerificationChange?.(true);
      onSelectAddress(address);
    } catch {
      setUnavailable(true);
    } finally {
      setSelecting(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={event => {
            setVerified(false);
            setVerificationProvider("address lookup");
            onVerificationChange?.(false);
            onChange(event.target.value);
          }}
          onBlur={() => window.setTimeout(() => setSuggestions([]), 150)}
          className="pl-9 pr-8"
          placeholder={placeholder}
          autoComplete="off"
          disabled={disabled}
        />
        {(loading || selecting) && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        {!loading && !selecting && verified && <CheckCircle2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />}
        {suggestions.length > 0 && (
          <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
            {suggestions.map(suggestion => (
              <button
                key={suggestion.placeId}
                type="button"
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none"
                onMouseDown={event => event.preventDefault()}
                onClick={() => void selectSuggestion(suggestion)}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{suggestion.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {verified ? (
        <p className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Verified with {verificationProvider}</p>
      ) : unavailable ? (
        <p className="text-xs text-muted-foreground">Address suggestions are temporarily unavailable; the address will still be verified when saved.</p>
      ) : (
        <p className="text-xs text-muted-foreground">Choose a suggested address to verify and fill City, State, and ZIP.</p>
      )}
    </div>
  );
}

export default AddressAutocompleteInput;
