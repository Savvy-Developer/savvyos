import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelect } from "@/components/ui/multi-select";
import { AlertCircle, CheckCircle2, Loader2, Save } from "lucide-react";
import { formatPhone, isValidPhone } from "@/lib/inputFormatters";

const DIRECTORY_SPECIALTY_OPTIONS = [
  "Short-Term Rentals",
  "Investment Properties",
  "Luxury",
  "Second Homes",
  "Vacation Homes",
  "Cabins & Mountain Homes",
  "Beach & Coastal",
  "Urban STRs",
  "New Construction",
  "Multi-Family",
  "1031 Exchange",
  "Buyer Representation",
  "Seller Representation",
  "Relocation",
  "Remote Investors",
  "Land & Development",
];

const DIRECTORY_LANGUAGE_OPTIONS = [
  "English",
  "Spanish",
  "French",
  "Portuguese",
  "German",
  "Italian",
  "Mandarin",
  "Cantonese",
  "Korean",
  "Japanese",
  "Arabic",
  "Hindi",
  "ASL",
];

const EMPTY_FORM = {
  preferredName: "",
  dateOfBirth: "",
  personalEmail: "",
  primaryPhone: "",
  secondaryPhone: "",
  timeZone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  zip: "",
  country: "US",
  spouseName: "",
  childrenNotes: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  emergencyContactRelationship: "",
  hobbies: "",
  giftNotes: "",
  shirtSize: "",
  personalNotes: "",
  licenseNumber: "",
  licenseState: "",
  additionalLicenseStates: "",
  licenseExpirationDate: "",
  brokerageAffiliation: "",
  brokerFullName: "",
  brokerEmail: "",
  brokerOfficeNumber: "",
  bio: "",
  instagramUrl: "",
  facebookUrl: "",
  linkedinUrl: "",
  youtubeUrl: "",
  tiktokUrl: "",
  personalWebsiteUrl: "",
  googleBusinessUrl: "",
  directorySpecialties: [] as string[],
  directoryLanguages: [] as string[],
  directoryProductionLevel: "" as
    | ""
    | "emerging"
    | "growing"
    | "established"
    | "elite",
  boardAssociation: "",
  mlsId: "",
  narId: "",
  personalBrandNotes: "",
  birthdayRecognitionOptIn: true,
  anniversaryRecognitionOptIn: true,
};

type ExtendedProfileForm = typeof EMPTY_FORM;
type SaveState = "idle" | "saving" | "saved" | "invalid" | "error";

function toInputDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function splitValues(value: string | null | undefined): string[] {
  return Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .map(item => item.trim())
        .filter(Boolean)
    )
  );
}

function selectOptions(defaultOptions: string[], values: string[]) {
  return Array.from(new Set([...defaultOptions, ...values]))
    .sort((left, right) => left.localeCompare(right))
    .map(value => ({ value, label: value }));
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  );
}

function isValidForm(form: ExtendedProfileForm): boolean {
  return [
    form.primaryPhone,
    form.secondaryPhone,
    form.emergencyContactPhone,
    form.brokerOfficeNumber,
  ].every(isValidPhone);
}

function buildPayload(form: ExtendedProfileForm) {
  return {
    core: {
      preferredName: form.preferredName || null,
      dateOfBirth: form.dateOfBirth || null,
      personalEmail: form.personalEmail || null,
      primaryPhone: form.primaryPhone || null,
      secondaryPhone: form.secondaryPhone || null,
      timeZone: form.timeZone || null,
      addressLine1: form.addressLine1 || null,
      addressLine2: form.addressLine2 || null,
      city: form.city || null,
      state: form.state || null,
      zip: form.zip || null,
      country: form.country || null,
      spouseName: form.spouseName || null,
      childrenNotes: form.childrenNotes || null,
      emergencyContactName: form.emergencyContactName || null,
      emergencyContactPhone: form.emergencyContactPhone || null,
      emergencyContactRelationship: form.emergencyContactRelationship || null,
      hobbies: form.hobbies || null,
      giftNotes: form.giftNotes || null,
      shirtSize: form.shirtSize || null,
      personalNotes: form.personalNotes || null,
    },
    agent: {
      licenseNumber: form.licenseNumber || null,
      licenseState: form.licenseState || null,
      additionalLicenseStates: form.additionalLicenseStates || null,
      licenseExpirationDate: form.licenseExpirationDate || null,
      brokerageAffiliation: form.brokerageAffiliation || null,
      brokerFullName: form.brokerFullName || null,
      brokerEmail: form.brokerEmail || null,
      brokerOfficeNumber: form.brokerOfficeNumber || null,
      bio: form.bio || null,
      instagramUrl: form.instagramUrl || null,
      facebookUrl: form.facebookUrl || null,
      linkedinUrl: form.linkedinUrl || null,
      youtubeUrl: form.youtubeUrl || null,
      tiktokUrl: form.tiktokUrl || null,
      personalWebsiteUrl: form.personalWebsiteUrl || null,
      googleBusinessUrl: form.googleBusinessUrl || null,
      directorySpecialties: form.directorySpecialties.join(", ") || null,
      directoryLanguages: form.directoryLanguages.join(", ") || null,
      directoryProductionLevel: form.directoryProductionLevel || null,
      boardAssociation: form.boardAssociation || null,
      mlsId: form.mlsId || null,
      narId: form.narId || null,
      personalBrandNotes: form.personalBrandNotes || null,
      birthdayRecognitionOptIn: form.birthdayRecognitionOptIn,
      anniversaryRecognitionOptIn: form.anniversaryRecognitionOptIn,
    },
  };
}

export default function AgentExtendedProfileEditor() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const coreQuery = trpc.users.getCoreProfile.useQuery(
    { userId: user?.id ?? 0 },
    { enabled: Boolean(user?.id) }
  );
  const agentQuery = trpc.users.getAgentProfile.useQuery(
    { userId: user?.id ?? 0 },
    { enabled: Boolean(user?.id) }
  );
  const saveMutation = trpc.users.updateMyExtendedProfile.useMutation();
  const [form, setForm] = useState<ExtendedProfileForm>(EMPTY_FORM);
  const formRef = useRef(form);
  const initializedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueueRef = useRef(Promise.resolve());
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    if (!coreQuery.isSuccess || !agentQuery.isSuccess || initializedRef.current)
      return;
    const core = coreQuery.data;
    const agent = agentQuery.data;
    const initial: ExtendedProfileForm = {
      ...EMPTY_FORM,
      preferredName: core?.preferredName ?? "",
      dateOfBirth: toInputDate(core?.dateOfBirth),
      personalEmail: core?.personalEmail ?? "",
      primaryPhone: core?.primaryPhone ?? "",
      secondaryPhone: core?.secondaryPhone ?? "",
      timeZone: core?.timeZone ?? "",
      addressLine1: core?.addressLine1 ?? "",
      addressLine2: core?.addressLine2 ?? "",
      city: core?.city ?? "",
      state: core?.state ?? "",
      zip: core?.zip ?? "",
      country: core?.country ?? "US",
      spouseName: core?.spouseName ?? "",
      childrenNotes: core?.childrenNotes ?? "",
      emergencyContactName: core?.emergencyContactName ?? "",
      emergencyContactPhone: core?.emergencyContactPhone ?? "",
      emergencyContactRelationship: core?.emergencyContactRelationship ?? "",
      hobbies: core?.hobbies ?? "",
      giftNotes: core?.giftNotes ?? "",
      shirtSize: core?.shirtSize ?? "",
      personalNotes: core?.personalNotes ?? "",
      licenseNumber: agent?.licenseNumber ?? "",
      licenseState: agent?.licenseState ?? "",
      additionalLicenseStates: agent?.additionalLicenseStates ?? "",
      licenseExpirationDate: toInputDate(agent?.licenseExpirationDate),
      brokerageAffiliation: agent?.brokerageAffiliation ?? "",
      brokerFullName: agent?.brokerFullName ?? "",
      brokerEmail: agent?.brokerEmail ?? "",
      brokerOfficeNumber: agent?.brokerOfficeNumber ?? "",
      bio: agent?.bio ?? "",
      instagramUrl: agent?.instagramUrl ?? "",
      facebookUrl: agent?.facebookUrl ?? "",
      linkedinUrl: agent?.linkedinUrl ?? "",
      youtubeUrl: agent?.youtubeUrl ?? "",
      tiktokUrl: agent?.tiktokUrl ?? "",
      personalWebsiteUrl: agent?.personalWebsiteUrl ?? "",
      googleBusinessUrl: agent?.googleBusinessUrl ?? "",
      directorySpecialties: splitValues(agent?.directorySpecialties),
      directoryLanguages: splitValues(agent?.directoryLanguages),
      directoryProductionLevel: (agent?.directoryProductionLevel ??
        "") as ExtendedProfileForm["directoryProductionLevel"],
      boardAssociation: agent?.boardAssociation ?? "",
      mlsId: agent?.mlsId ?? "",
      narId: agent?.narId ?? "",
      personalBrandNotes: agent?.personalBrandNotes ?? "",
      birthdayRecognitionOptIn: agent?.birthdayRecognitionOptIn ?? true,
      anniversaryRecognitionOptIn: agent?.anniversaryRecognitionOptIn ?? true,
    };
    formRef.current = initial;
    setForm(initial);
    initializedRef.current = true;
  }, [
    agentQuery.data,
    agentQuery.isSuccess,
    coreQuery.data,
    coreQuery.isSuccess,
  ]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const persist = useCallback(
    (next: ExtendedProfileForm) => {
      if (!initializedRef.current) return;
      if (!isValidForm(next)) {
        setSaveState("invalid");
        setSaveError("Finish any phone number before it can be saved.");
        return;
      }
      setSaveState("saving");
      setSaveError(null);
      const payload = buildPayload(next);
      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(() => saveMutation.mutateAsync(payload))
        .then(() => {
          setSaveState("saved");
          void utils.users.getCoreProfile.invalidate({ userId: user?.id ?? 0 });
          void utils.users.getAgentProfile.invalidate({
            userId: user?.id ?? 0,
          });
        })
        .catch((error: Error) => {
          setSaveState("error");
          setSaveError(
            error.message ||
              "We could not save your profile changes. Please try again."
          );
        });
    },
    [
      saveMutation,
      user?.id,
      utils.users.getAgentProfile,
      utils.users.getCoreProfile,
    ]
  );

  const scheduleSave = useCallback(
    (next: ExtendedProfileForm) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (!isValidForm(next)) {
        setSaveState("invalid");
        setSaveError("Finish any phone number before it can be saved.");
        return;
      }
      setSaveState("saving");
      setSaveError(null);
      timerRef.current = setTimeout(() => persist(next), 450);
    },
    [persist]
  );

  const updateField = <Key extends keyof ExtendedProfileForm>(
    key: Key,
    value: ExtendedProfileForm[Key]
  ) => {
    const next = { ...formRef.current, [key]: value } as ExtendedProfileForm;
    formRef.current = next;
    setForm(next);
    scheduleSave(next);
  };

  const flushSave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    persist(formRef.current);
  };

  if (!user || user.role !== "agent") return null;
  if (coreQuery.isLoading || agentQuery.isLoading) {
    return (
      <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading your extended profile…
      </div>
    );
  }

  return (
    <div className="space-y-5" onBlurCapture={flushSave}>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-primary/20 bg-primary/[0.03] p-4">
        <div>
          <p className="font-medium">
            Complete your Savvy profile at your own pace
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Every change saves automatically, so you can leave and continue
            exactly where you stopped.
          </p>
        </div>
        <div
          className="flex items-center gap-2 text-xs font-medium text-muted-foreground"
          aria-live="polite"
        >
          {saveState === "saving" && (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving…
            </>
          )}
          {saveState === "saved" && (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-emerald-700">Saved</span>
            </>
          )}
          {(saveState === "idle" ||
            saveState === "invalid" ||
            saveState === "error") && (
            <>
              <Save className="h-3.5 w-3.5" />
              Auto-save on
            </>
          )}
        </div>
      </div>

      {(saveState === "invalid" || saveState === "error") && saveError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      <Accordion
        type="multiple"
        defaultValue={[
          "contact",
          "licensing",
          "marketing",
          "directory",
          "personal",
        ]}
        className="space-y-3"
      >
        <AccordionItem value="contact" className="rounded-lg border px-4">
          <AccordionTrigger className="text-sm font-semibold">
            Contact & Home Details
          </AccordionTrigger>
          <AccordionContent className="pb-4 pt-1">
            <FieldGrid>
              <Field label="Preferred Name / Nickname">
                <Input
                  value={form.preferredName}
                  onChange={event =>
                    updateField("preferredName", event.target.value)
                  }
                  placeholder="e.g. Mike"
                />
              </Field>
              <Field label="Date of Birth">
                <Input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={event =>
                    updateField("dateOfBirth", event.target.value)
                  }
                />
              </Field>
              <Field label="Personal Email">
                <Input
                  type="email"
                  value={form.personalEmail}
                  onChange={event =>
                    updateField("personalEmail", event.target.value)
                  }
                  placeholder="personal@email.com"
                />
              </Field>
              <Field label="Primary Phone">
                <Input
                  type="tel"
                  inputMode="numeric"
                  maxLength={14}
                  value={form.primaryPhone}
                  onChange={event =>
                    updateField("primaryPhone", formatPhone(event.target.value))
                  }
                  placeholder="(555) 000-0000"
                />
              </Field>
              <Field label="Secondary Phone">
                <Input
                  type="tel"
                  inputMode="numeric"
                  maxLength={14}
                  value={form.secondaryPhone}
                  onChange={event =>
                    updateField(
                      "secondaryPhone",
                      formatPhone(event.target.value)
                    )
                  }
                  placeholder="(555) 000-0000"
                />
              </Field>
              <Field label="Time Zone">
                <Input
                  value={form.timeZone}
                  onChange={event =>
                    updateField("timeZone", event.target.value)
                  }
                  placeholder="e.g. America/New_York"
                />
              </Field>
              <Field label="Address Line 1">
                <Input
                  value={form.addressLine1}
                  onChange={event =>
                    updateField("addressLine1", event.target.value)
                  }
                  placeholder="123 Main St"
                />
              </Field>
              <Field label="Address Line 2">
                <Input
                  value={form.addressLine2}
                  onChange={event =>
                    updateField("addressLine2", event.target.value)
                  }
                  placeholder="Apt 4B"
                />
              </Field>
              <Field label="City">
                <Input
                  value={form.city}
                  onChange={event => updateField("city", event.target.value)}
                  placeholder="Nashville"
                />
              </Field>
              <Field label="State">
                <Input
                  value={form.state}
                  onChange={event => updateField("state", event.target.value)}
                  placeholder="TN"
                />
              </Field>
              <Field label="ZIP Code">
                <Input
                  value={form.zip}
                  onChange={event => updateField("zip", event.target.value)}
                  placeholder="37201"
                />
              </Field>
              <Field label="Country">
                <Input
                  value={form.country}
                  onChange={event => updateField("country", event.target.value)}
                  placeholder="US"
                />
              </Field>
            </FieldGrid>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="licensing" className="rounded-lg border px-4">
          <AccordionTrigger className="text-sm font-semibold">
            Licensing & Brokerage
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4 pt-1">
            <FieldGrid>
              <Field label="License Number">
                <Input
                  value={form.licenseNumber}
                  onChange={event =>
                    updateField("licenseNumber", event.target.value)
                  }
                />
              </Field>
              <Field label="License State">
                <Input
                  value={form.licenseState}
                  onChange={event =>
                    updateField("licenseState", event.target.value)
                  }
                  placeholder="TN"
                />
              </Field>
              <Field label="License Expiration Date">
                <Input
                  type="date"
                  value={form.licenseExpirationDate}
                  onChange={event =>
                    updateField("licenseExpirationDate", event.target.value)
                  }
                />
              </Field>
              <Field label="Additional License States">
                <Input
                  value={form.additionalLicenseStates}
                  onChange={event =>
                    updateField("additionalLicenseStates", event.target.value)
                  }
                  placeholder="GA, FL (comma-separated)"
                />
              </Field>
              <Field label="Brokerage Affiliation">
                <Input
                  value={form.brokerageAffiliation}
                  onChange={event =>
                    updateField("brokerageAffiliation", event.target.value)
                  }
                />
              </Field>
              <Field label="Broker Full Name">
                <Input
                  value={form.brokerFullName}
                  onChange={event =>
                    updateField("brokerFullName", event.target.value)
                  }
                />
              </Field>
              <Field label="Broker Email">
                <Input
                  type="email"
                  value={form.brokerEmail}
                  onChange={event =>
                    updateField("brokerEmail", event.target.value)
                  }
                />
              </Field>
              <Field label="Broker Office Number">
                <Input
                  type="tel"
                  inputMode="numeric"
                  maxLength={14}
                  value={form.brokerOfficeNumber}
                  onChange={event =>
                    updateField(
                      "brokerOfficeNumber",
                      formatPhone(event.target.value)
                    )
                  }
                  placeholder="(615) 555-0100"
                />
              </Field>
            </FieldGrid>
            <Field label="Board / Association">
              <Input
                value={form.boardAssociation}
                onChange={event =>
                  updateField("boardAssociation", event.target.value)
                }
              />
            </Field>
            <FieldGrid>
              <Field label="MLS ID">
                <Input
                  value={form.mlsId}
                  onChange={event => updateField("mlsId", event.target.value)}
                />
              </Field>
              <Field label="NAR ID">
                <Input
                  value={form.narId}
                  onChange={event => updateField("narId", event.target.value)}
                />
              </Field>
            </FieldGrid>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="marketing" className="rounded-lg border px-4">
          <AccordionTrigger className="text-sm font-semibold">
            Marketing & Public Presence
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4 pt-1">
            <Field label="Biography">
              <Textarea
                className="min-h-24"
                value={form.bio}
                onChange={event => updateField("bio", event.target.value)}
                placeholder="Tell clients about yourself and your expertise…"
              />
            </Field>
            <FieldGrid>
              <Field label="Instagram URL">
                <Input
                  type="url"
                  value={form.instagramUrl}
                  onChange={event =>
                    updateField("instagramUrl", event.target.value)
                  }
                  placeholder="https://instagram.com/..."
                />
              </Field>
              <Field label="Facebook URL">
                <Input
                  type="url"
                  value={form.facebookUrl}
                  onChange={event =>
                    updateField("facebookUrl", event.target.value)
                  }
                  placeholder="https://facebook.com/..."
                />
              </Field>
              <Field label="LinkedIn URL">
                <Input
                  type="url"
                  value={form.linkedinUrl}
                  onChange={event =>
                    updateField("linkedinUrl", event.target.value)
                  }
                  placeholder="https://linkedin.com/in/..."
                />
              </Field>
              <Field label="YouTube URL">
                <Input
                  type="url"
                  value={form.youtubeUrl}
                  onChange={event =>
                    updateField("youtubeUrl", event.target.value)
                  }
                  placeholder="https://youtube.com/..."
                />
              </Field>
              <Field label="TikTok URL">
                <Input
                  type="url"
                  value={form.tiktokUrl}
                  onChange={event =>
                    updateField("tiktokUrl", event.target.value)
                  }
                  placeholder="https://tiktok.com/@..."
                />
              </Field>
              <Field label="Personal Website URL">
                <Input
                  type="url"
                  value={form.personalWebsiteUrl}
                  onChange={event =>
                    updateField("personalWebsiteUrl", event.target.value)
                  }
                  placeholder="https://..."
                />
              </Field>
              <Field label="Google Business Profile URL">
                <Input
                  type="url"
                  value={form.googleBusinessUrl}
                  onChange={event =>
                    updateField("googleBusinessUrl", event.target.value)
                  }
                  placeholder="https://g.page/..."
                />
              </Field>
            </FieldGrid>
            <Field label="Personal Brand Notes">
              <Textarea
                className="min-h-20"
                value={form.personalBrandNotes}
                onChange={event =>
                  updateField("personalBrandNotes", event.target.value)
                }
                placeholder="Voice, specialties, preferred messaging, or other brand details…"
              />
            </Field>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="directory" className="rounded-lg border px-4">
          <AccordionTrigger className="text-sm font-semibold">
            Agent Directory
          </AccordionTrigger>
          <AccordionContent className="pb-4 pt-1">
            <FieldGrid>
              <Field label="Directory Specialties">
                <MultiSelect
                  options={selectOptions(
                    DIRECTORY_SPECIALTY_OPTIONS,
                    form.directorySpecialties
                  )}
                  value={form.directorySpecialties}
                  onValueChange={value =>
                    updateField("directorySpecialties", value)
                  }
                  placeholder="Select specialties…"
                  searchPlaceholder="Search specialties…"
                />
              </Field>
              <Field label="Directory Languages">
                <MultiSelect
                  options={selectOptions(
                    DIRECTORY_LANGUAGE_OPTIONS,
                    form.directoryLanguages
                  )}
                  value={form.directoryLanguages}
                  onValueChange={value =>
                    updateField("directoryLanguages", value)
                  }
                  placeholder="Select languages…"
                  searchPlaceholder="Search languages…"
                />
              </Field>
              <Field label="Directory Production Level">
                <Select
                  value={form.directoryProductionLevel || "none"}
                  onValueChange={value =>
                    updateField(
                      "directoryProductionLevel",
                      (value === "none"
                        ? ""
                        : value) as ExtendedProfileForm["directoryProductionLevel"]
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    <SelectItem value="emerging">Emerging</SelectItem>
                    <SelectItem value="growing">Growing</SelectItem>
                    <SelectItem value="established">Established</SelectItem>
                    <SelectItem value="elite">Elite</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGrid>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="personal" className="rounded-lg border px-4">
          <AccordionTrigger className="text-sm font-semibold">
            Personal & Recognition Details
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4 pt-1">
            <FieldGrid>
              <Field label="Spouse / Partner Name">
                <Input
                  value={form.spouseName}
                  onChange={event =>
                    updateField("spouseName", event.target.value)
                  }
                />
              </Field>
              <Field label="Shirt Size">
                <Select
                  value={form.shirtSize || "none"}
                  onValueChange={value =>
                    updateField("shirtSize", value === "none" ? "" : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    {["XS", "S", "M", "L", "XL", "XXL", "XXXL"].map(size => (
                      <SelectItem key={size} value={size}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Emergency Contact Name">
                <Input
                  value={form.emergencyContactName}
                  onChange={event =>
                    updateField("emergencyContactName", event.target.value)
                  }
                />
              </Field>
              <Field label="Emergency Contact Phone">
                <Input
                  type="tel"
                  inputMode="numeric"
                  maxLength={14}
                  value={form.emergencyContactPhone}
                  onChange={event =>
                    updateField(
                      "emergencyContactPhone",
                      formatPhone(event.target.value)
                    )
                  }
                  placeholder="(555) 000-0000"
                />
              </Field>
              <Field label="Emergency Contact Relationship">
                <Input
                  value={form.emergencyContactRelationship}
                  onChange={event =>
                    updateField(
                      "emergencyContactRelationship",
                      event.target.value
                    )
                  }
                  placeholder="Spouse, parent, etc."
                />
              </Field>
            </FieldGrid>
            <Field label="Children Notes">
              <Textarea
                className="min-h-16"
                value={form.childrenNotes}
                onChange={event =>
                  updateField("childrenNotes", event.target.value)
                }
                placeholder="Names, ages, etc."
              />
            </Field>
            <Field label="Hobbies & Interests">
              <Textarea
                className="min-h-16"
                value={form.hobbies}
                onChange={event => updateField("hobbies", event.target.value)}
              />
            </Field>
            <Field label="Favorite Food, Drink & Gift Notes">
              <Textarea
                className="min-h-16"
                value={form.giftNotes}
                onChange={event => updateField("giftNotes", event.target.value)}
              />
            </Field>
            <Field label="Anything Else You'd Like Us To Know">
              <Textarea
                className="min-h-20"
                value={form.personalNotes}
                onChange={event =>
                  updateField("personalNotes", event.target.value)
                }
              />
            </Field>
            <div className="flex flex-wrap gap-x-8 gap-y-3 pt-1">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.birthdayRecognitionOptIn}
                  onCheckedChange={value =>
                    updateField("birthdayRecognitionOptIn", value)
                  }
                />
                <Label>Birthday recognition opt-in</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.anniversaryRecognitionOptIn}
                  onCheckedChange={value =>
                    updateField("anniversaryRecognitionOptIn", value)
                  }
                />
                <Label>Anniversary recognition opt-in</Label>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
