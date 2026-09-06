import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { loadGoogleMaps } from "@/components/Map";

export type VerifiedAddress = {
  address: string;
  city: string;
  state: string;
  zip: string;
};

type AddressAutocompleteInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSelectAddress: (address: VerifiedAddress) => void;
  onVerificationChange?: (verified: boolean) => void;
  placeholder?: string;
  disabled?: boolean;
};

function getComponent(
  components: google.maps.GeocoderAddressComponent[] | undefined,
  type: string,
  useShortName = false
): string {
  const component = components?.find(item => item.types.includes(type));
  return component ? (useShortName ? component.short_name : component.long_name) : "";
}

/**
 * A property-address input backed by Google Places. Selecting a suggestion fills
 * every address field from the canonical Google address and marks it verified.
 */
export function AddressAutocompleteInput({
  value,
  onChange,
  onSelectAddress,
  onVerificationChange,
  placeholder = "Start typing a street address",
  disabled,
}: AddressAutocompleteInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    let active = true;

    void loadGoogleMaps()
      .then(() => {
        if (!active || !inputRef.current || !window.google?.maps?.places) return;

        const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: "us" },
          fields: ["address_components", "formatted_address", "place_id"],
          types: ["address"],
        });
        autocompleteRef.current = autocomplete;
        setReady(true);

        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          const streetNumber = getComponent(place.address_components, "street_number");
          const route = getComponent(place.address_components, "route");
          const address = [streetNumber, route].filter(Boolean).join(" ") || place.formatted_address?.split(",")[0] || "";
          const city = getComponent(place.address_components, "locality")
            || getComponent(place.address_components, "postal_town")
            || getComponent(place.address_components, "sublocality");
          const state = getComponent(place.address_components, "administrative_area_level_1", true);
          const zip = getComponent(place.address_components, "postal_code");

          if (!address || !city || !state || !zip) {
            setVerified(false);
            onVerificationChange?.(false);
            return;
          }

          setVerified(true);
          onVerificationChange?.(true);
          onSelectAddress({ address, city, state, zip });
        });
      })
      .catch(() => {
        if (active) setReady(false);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      autocompleteRef.current = null;
    };
  }, [onSelectAddress, onVerificationChange]);

  return (
    <div className="space-y-1">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={value}
          onChange={event => {
            setVerified(false);
            onVerificationChange?.(false);
            onChange(event.target.value);
          }}
          className="pl-9 pr-8"
          placeholder={placeholder}
          autoComplete="off"
          disabled={disabled}
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        {!loading && verified && <CheckCircle2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />}
      </div>
      {verified ? (
        <p className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Verified with Google Maps</p>
      ) : ready ? (
        <p className="text-xs text-muted-foreground">Choose a suggested address to verify and fill City, State, and ZIP.</p>
      ) : !loading ? (
        <p className="text-xs text-muted-foreground">Address suggestions are unavailable; the address will still be verified when saved.</p>
      ) : null}
    </div>
  );
}

export default AddressAutocompleteInput;
