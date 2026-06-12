import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save } from "lucide-react";

interface Props {
  userId: number;
  userRole: "agent" | "admin" | "isa";
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function toInputDate(val: Date | string | null | undefined): string {
  if (!val) return "";
  const d = new Date(val);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function SectionGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>;
}

// ── Core Profile Section ─────────────────────────────────────────────────────
function CoreProfileSection({ userId }: { userId: number }) {
  const { data: profile, refetch } = trpc.users.getCoreProfile.useQuery({ userId });
  const upsert = trpc.users.upsertCoreProfile.useMutation({
    onSuccess: () => { toast.success("Core profile saved"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const [form, setForm] = useState({
    preferredName: "", profilePhotoUrl: "", dateOfBirth: "", personalEmail: "",
    primaryPhone: "", secondaryPhone: "", timeZone: "",
    addressLine1: "", addressLine2: "", city: "", state: "", zip: "", country: "US",
    spouseName: "", childrenNotes: "", emergencyContactName: "", emergencyContactPhone: "",
    emergencyContactRelationship: "", hobbies: "", giftNotes: "", shirtSize: "", personalNotes: "",
    employmentStatus: "active" as string, onboardedDate: "", offboardedDate: "",
    referredBy: "", workAnniversaryDate: "", internalNotes: "",
  });

  useEffect(() => {
    if (profile) {
      setForm({
        preferredName: profile.preferredName ?? "",
        profilePhotoUrl: profile.profilePhotoUrl ?? "",
        dateOfBirth: toInputDate(profile.dateOfBirth),
        personalEmail: profile.personalEmail ?? "",
        primaryPhone: profile.primaryPhone ?? "",
        secondaryPhone: profile.secondaryPhone ?? "",
        timeZone: profile.timeZone ?? "",
        addressLine1: profile.addressLine1 ?? "",
        addressLine2: profile.addressLine2 ?? "",
        city: profile.city ?? "",
        state: profile.state ?? "",
        zip: profile.zip ?? "",
        country: profile.country ?? "US",
        spouseName: profile.spouseName ?? "",
        childrenNotes: profile.childrenNotes ?? "",
        emergencyContactName: profile.emergencyContactName ?? "",
        emergencyContactPhone: profile.emergencyContactPhone ?? "",
        emergencyContactRelationship: profile.emergencyContactRelationship ?? "",
        hobbies: profile.hobbies ?? "",
        giftNotes: profile.giftNotes ?? "",
        shirtSize: profile.shirtSize ?? "",
        personalNotes: profile.personalNotes ?? "",
        employmentStatus: profile.employmentStatus ?? "active",
        onboardedDate: toInputDate(profile.onboardedDate),
        offboardedDate: toInputDate(profile.offboardedDate),
        referredBy: profile.referredBy ?? "",
        workAnniversaryDate: toInputDate(profile.workAnniversaryDate),
        internalNotes: profile.internalNotes ?? "",
      });
    }
  }, [profile]);

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleSave = () => {
    upsert.mutate({
      userId,
      ...form,
      employmentStatus: form.employmentStatus as any,
      dateOfBirth: form.dateOfBirth || null,
      onboardedDate: form.onboardedDate || null,
      offboardedDate: form.offboardedDate || null,
      workAnniversaryDate: form.workAnniversaryDate || null,
    });
  };

  return (
    <div className="space-y-6">
      <Accordion type="multiple" defaultValue={["identity", "address", "hr", "lifecycle"]} className="space-y-2">
        {/* Identity */}
        <AccordionItem value="identity" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold py-3">Identity</AccordionTrigger>
          <AccordionContent className="pb-4">
            <SectionGrid>
              <Field label="Preferred Name / Nickname">
                <Input className="h-8 text-sm" value={form.preferredName} onChange={f("preferredName")} placeholder="e.g. Mike" />
              </Field>
              <Field label="Date of Birth">
                <Input className="h-8 text-sm" type="date" value={form.dateOfBirth} onChange={f("dateOfBirth")} />
              </Field>
              <Field label="Personal Email">
                <Input className="h-8 text-sm" type="email" value={form.personalEmail} onChange={f("personalEmail")} placeholder="personal@email.com" />
              </Field>
              <Field label="Primary Phone">
                <Input className="h-8 text-sm" value={form.primaryPhone} onChange={f("primaryPhone")} placeholder="(555) 000-0000" />
              </Field>
              <Field label="Secondary Phone">
                <Input className="h-8 text-sm" value={form.secondaryPhone} onChange={f("secondaryPhone")} placeholder="(555) 000-0000" />
              </Field>
              <Field label="Time Zone">
                <Input className="h-8 text-sm" value={form.timeZone} onChange={f("timeZone")} placeholder="e.g. America/New_York" />
              </Field>
            </SectionGrid>
          </AccordionContent>
        </AccordionItem>

        {/* Address */}
        <AccordionItem value="address" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold py-3">Home Address</AccordionTrigger>
          <AccordionContent className="pb-4">
            <SectionGrid>
              <Field label="Address Line 1">
                <Input className="h-8 text-sm" value={form.addressLine1} onChange={f("addressLine1")} placeholder="123 Main St" />
              </Field>
              <Field label="Address Line 2">
                <Input className="h-8 text-sm" value={form.addressLine2} onChange={f("addressLine2")} placeholder="Apt 4B" />
              </Field>
              <Field label="City">
                <Input className="h-8 text-sm" value={form.city} onChange={f("city")} placeholder="Nashville" />
              </Field>
              <Field label="State">
                <Input className="h-8 text-sm" value={form.state} onChange={f("state")} placeholder="TN" />
              </Field>
              <Field label="Zip Code">
                <Input className="h-8 text-sm" value={form.zip} onChange={f("zip")} placeholder="37201" />
              </Field>
              <Field label="Country">
                <Input className="h-8 text-sm" value={form.country} onChange={f("country")} placeholder="US" />
              </Field>
            </SectionGrid>
          </AccordionContent>
        </AccordionItem>

        {/* Personal / HR */}
        <AccordionItem value="hr" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold py-3">Personal / HR</AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-4">
              <SectionGrid>
                <Field label="Spouse / Partner Name">
                  <Input className="h-8 text-sm" value={form.spouseName} onChange={f("spouseName")} />
                </Field>
                <Field label="Shirt Size">
                  <Select value={form.shirtSize || ""} onValueChange={(v) => setForm((p) => ({ ...p, shirtSize: v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select size" /></SelectTrigger>
                    <SelectContent>
                      {["XS","S","M","L","XL","XXL","XXXL"].map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </SectionGrid>
              <Field label="Children Notes">
                <Textarea className="text-sm min-h-[60px]" value={form.childrenNotes} onChange={f("childrenNotes")} placeholder="Names, ages, etc." />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Emergency Contact Name">
                  <Input className="h-8 text-sm" value={form.emergencyContactName} onChange={f("emergencyContactName")} />
                </Field>
                <Field label="Emergency Contact Phone">
                  <Input className="h-8 text-sm" value={form.emergencyContactPhone} onChange={f("emergencyContactPhone")} />
                </Field>
                <Field label="Relationship">
                  <Input className="h-8 text-sm" value={form.emergencyContactRelationship} onChange={f("emergencyContactRelationship")} placeholder="Spouse, Parent, etc." />
                </Field>
              </div>
              <Field label="Hobbies / Interests">
                <Textarea className="text-sm min-h-[60px]" value={form.hobbies} onChange={f("hobbies")} />
              </Field>
              <Field label="Favorite Food / Drink / Gift Notes">
                <Textarea className="text-sm min-h-[60px]" value={form.giftNotes} onChange={f("giftNotes")} />
              </Field>
              <Field label="Personal Notes">
                <Textarea className="text-sm min-h-[60px]" value={form.personalNotes} onChange={f("personalNotes")} />
              </Field>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Company Lifecycle */}
        <AccordionItem value="lifecycle" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold py-3">Company Lifecycle</AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-4">
              <SectionGrid>
                <Field label="Employment Status">
                  <Select value={form.employmentStatus} onValueChange={(v) => setForm((p) => ({ ...p, employmentStatus: v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="on_leave">On Leave</SelectItem>
                      <SelectItem value="offboarded">Offboarded</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Onboarded Date">
                  <Input className="h-8 text-sm" type="date" value={form.onboardedDate} onChange={f("onboardedDate")} />
                </Field>
                <Field label="Offboarded Date">
                  <Input className="h-8 text-sm" type="date" value={form.offboardedDate} onChange={f("offboardedDate")} />
                </Field>
                <Field label="Referred By">
                  <Input className="h-8 text-sm" value={form.referredBy} onChange={f("referredBy")} />
                </Field>
                <Field label="Work Anniversary Date">
                  <Input className="h-8 text-sm" type="date" value={form.workAnniversaryDate} onChange={f("workAnniversaryDate")} />
                </Field>
              </SectionGrid>
              <Field label="Internal Notes">
                <Textarea className="text-sm min-h-[80px]" value={form.internalNotes} onChange={f("internalNotes")} />
              </Field>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>
          {upsert.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
          Save Core Profile
        </Button>
      </div>
    </div>
  );
}

// ── Agent Profile Section ─────────────────────────────────────────────────────
function AgentProfileSection({ userId }: { userId: number }) {
  const { data: profile, refetch } = trpc.users.getAgentProfile.useQuery({ userId });
  const upsert = trpc.users.upsertAgentProfile.useMutation({
    onSuccess: () => { toast.success("Agent profile saved"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const [form, setForm] = useState({
    licenseNumber: "", licenseState: "", additionalLicenseStates: "",
    licenseExpirationDate: "", brokerageAffiliation: "", bio: "",
    instagramUrl: "", facebookUrl: "", linkedinUrl: "", youtubeUrl: "",
    tiktokUrl: "", personalWebsiteUrl: "", googleBusinessUrl: "",
    agentStatus: "active" as string, startDateWithSavvy: "", endDateWithSavvy: "",
    boardAssociation: "", mlsId: "", narId: "", showingServiceLoginNotes: "",
    transactionCoordinatorAssigned: "", assistantAssigned: "",
    personalBrandNotes: "", specialInternalNotes: "",
    birthdayRecognitionOptIn: true, anniversaryRecognitionOptIn: true,
  });

  useEffect(() => {
    if (profile) {
      setForm({
        licenseNumber: profile.licenseNumber ?? "",
        licenseState: profile.licenseState ?? "",
        additionalLicenseStates: profile.additionalLicenseStates ?? "",
        licenseExpirationDate: toInputDate(profile.licenseExpirationDate),
        brokerageAffiliation: profile.brokerageAffiliation ?? "",
        bio: profile.bio ?? "",
        instagramUrl: profile.instagramUrl ?? "",
        facebookUrl: profile.facebookUrl ?? "",
        linkedinUrl: profile.linkedinUrl ?? "",
        youtubeUrl: profile.youtubeUrl ?? "",
        tiktokUrl: profile.tiktokUrl ?? "",
        personalWebsiteUrl: profile.personalWebsiteUrl ?? "",
        googleBusinessUrl: profile.googleBusinessUrl ?? "",
        agentStatus: profile.agentStatus ?? "active",
        startDateWithSavvy: toInputDate(profile.startDateWithSavvy),
        endDateWithSavvy: toInputDate(profile.endDateWithSavvy),
        boardAssociation: profile.boardAssociation ?? "",
        mlsId: profile.mlsId ?? "",
        narId: profile.narId ?? "",
        showingServiceLoginNotes: profile.showingServiceLoginNotes ?? "",
        transactionCoordinatorAssigned: profile.transactionCoordinatorAssigned ?? "",
        assistantAssigned: profile.assistantAssigned ?? "",
        personalBrandNotes: profile.personalBrandNotes ?? "",
        specialInternalNotes: profile.specialInternalNotes ?? "",
        birthdayRecognitionOptIn: profile.birthdayRecognitionOptIn ?? true,
        anniversaryRecognitionOptIn: profile.anniversaryRecognitionOptIn ?? true,
      });
    }
  }, [profile]);

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleSave = () => {
    upsert.mutate({
      userId,
      ...form,
      agentStatus: form.agentStatus as any,
      licenseExpirationDate: form.licenseExpirationDate || null,
      startDateWithSavvy: form.startDateWithSavvy || null,
      endDateWithSavvy: form.endDateWithSavvy || null,
    });
  };

  return (
    <div className="space-y-6">
      <Accordion type="multiple" defaultValue={["licensing", "marketing", "operations"]} className="space-y-2">
        {/* Licensing */}
        <AccordionItem value="licensing" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold py-3">Licensing & Brokerage</AccordionTrigger>
          <AccordionContent className="pb-4">
            <SectionGrid>
              <Field label="License Number">
                <Input className="h-8 text-sm" value={form.licenseNumber} onChange={f("licenseNumber")} />
              </Field>
              <Field label="License State">
                <Input className="h-8 text-sm" value={form.licenseState} onChange={f("licenseState")} placeholder="TN" />
              </Field>
              <Field label="License Expiration Date">
                <Input className="h-8 text-sm" type="date" value={form.licenseExpirationDate} onChange={f("licenseExpirationDate")} />
              </Field>
              <Field label="Additional License States">
                <Input className="h-8 text-sm" value={form.additionalLicenseStates} onChange={f("additionalLicenseStates")} placeholder="GA, FL (comma-separated)" />
              </Field>
              <Field label="Brokerage Affiliation">
                <Input className="h-8 text-sm" value={form.brokerageAffiliation} onChange={f("brokerageAffiliation")} />
              </Field>
            </SectionGrid>
          </AccordionContent>
        </AccordionItem>

        {/* Marketing */}
        <AccordionItem value="marketing" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold py-3">Marketing & Public Presence</AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-4">
              <Field label="Bio">
                <Textarea className="text-sm min-h-[80px]" value={form.bio} onChange={f("bio")} placeholder="Agent bio for public profile..." />
              </Field>
              <SectionGrid>
                <Field label="Instagram URL">
                  <Input className="h-8 text-sm" value={form.instagramUrl} onChange={f("instagramUrl")} placeholder="https://instagram.com/..." />
                </Field>
                <Field label="Facebook URL">
                  <Input className="h-8 text-sm" value={form.facebookUrl} onChange={f("facebookUrl")} placeholder="https://facebook.com/..." />
                </Field>
                <Field label="LinkedIn URL">
                  <Input className="h-8 text-sm" value={form.linkedinUrl} onChange={f("linkedinUrl")} placeholder="https://linkedin.com/in/..." />
                </Field>
                <Field label="YouTube URL">
                  <Input className="h-8 text-sm" value={form.youtubeUrl} onChange={f("youtubeUrl")} placeholder="https://youtube.com/..." />
                </Field>
                <Field label="TikTok URL">
                  <Input className="h-8 text-sm" value={form.tiktokUrl} onChange={f("tiktokUrl")} placeholder="https://tiktok.com/@..." />
                </Field>
                <Field label="Personal Website URL">
                  <Input className="h-8 text-sm" value={form.personalWebsiteUrl} onChange={f("personalWebsiteUrl")} placeholder="https://..." />
                </Field>
                <Field label="Google Business Profile URL">
                  <Input className="h-8 text-sm" value={form.googleBusinessUrl} onChange={f("googleBusinessUrl")} placeholder="https://g.page/..." />
                </Field>
              </SectionGrid>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Operations */}
        <AccordionItem value="operations" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold py-3">Agent Operations</AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-4">
              <SectionGrid>
                <Field label="Agent Status">
                  <Select value={form.agentStatus} onValueChange={(v) => setForm((p) => ({ ...p, agentStatus: v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="recruiting">Recruiting</SelectItem>
                      <SelectItem value="offboarded">Offboarded</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Start Date with Savvy">
                  <Input className="h-8 text-sm" type="date" value={form.startDateWithSavvy} onChange={f("startDateWithSavvy")} />
                </Field>
                <Field label="End Date with Savvy">
                  <Input className="h-8 text-sm" type="date" value={form.endDateWithSavvy} onChange={f("endDateWithSavvy")} />
                </Field>
                <Field label="Board / Association">
                  <Input className="h-8 text-sm" value={form.boardAssociation} onChange={f("boardAssociation")} />
                </Field>
                <Field label="MLS ID">
                  <Input className="h-8 text-sm" value={form.mlsId} onChange={f("mlsId")} />
                </Field>
                <Field label="NAR ID">
                  <Input className="h-8 text-sm" value={form.narId} onChange={f("narId")} />
                </Field>
                <Field label="Transaction Coordinator Assigned">
                  <Input className="h-8 text-sm" value={form.transactionCoordinatorAssigned} onChange={f("transactionCoordinatorAssigned")} />
                </Field>
                <Field label="Assistant Assigned">
                  <Input className="h-8 text-sm" value={form.assistantAssigned} onChange={f("assistantAssigned")} />
                </Field>
              </SectionGrid>
              <Field label="Showing Service Login Notes">
                <Textarea className="text-sm min-h-[60px]" value={form.showingServiceLoginNotes} onChange={f("showingServiceLoginNotes")} />
              </Field>
              <Field label="Personal Brand Notes">
                <Textarea className="text-sm min-h-[60px]" value={form.personalBrandNotes} onChange={f("personalBrandNotes")} />
              </Field>
              <Field label="Special Notes for Internal Team">
                <Textarea className="text-sm min-h-[60px]" value={form.specialInternalNotes} onChange={f("specialInternalNotes")} />
              </Field>
              <div className="flex items-center gap-6 pt-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.birthdayRecognitionOptIn}
                    onCheckedChange={(v) => setForm((p) => ({ ...p, birthdayRecognitionOptIn: v }))}
                  />
                  <Label className="text-sm">Birthday Recognition Opt-In</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.anniversaryRecognitionOptIn}
                    onCheckedChange={(v) => setForm((p) => ({ ...p, anniversaryRecognitionOptIn: v }))}
                  />
                  <Label className="text-sm">Anniversary Recognition Opt-In</Label>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>
          {upsert.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
          Save Agent Profile
        </Button>
      </div>
    </div>
  );
}

// ── ISA Profile Section ───────────────────────────────────────────────────────
function IsaProfileSection({ userId }: { userId: number }) {
  const { data: profile, refetch } = trpc.users.getIsaProfile.useQuery({ userId });
  const upsert = trpc.users.upsertIsaProfile.useMutation({
    onSuccess: () => { toast.success("ISA profile saved"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const [form, setForm] = useState({
    isaStatus: "active" as string, startDateWithSavvy: "", endDateWithSavvy: "",
    managerId: "" as string, dialerUserId: "", crmUserId: "", slackHandle: "",
    callRecordingLink: "", trainingStartDate: "", trainingCompletionDate: "",
    currentTrainingStatus: "", scriptVersionAssigned: "", notes: "",
  });

  useEffect(() => {
    if (profile) {
      setForm({
        isaStatus: profile.isaStatus ?? "active",
        startDateWithSavvy: toInputDate(profile.startDateWithSavvy),
        endDateWithSavvy: toInputDate(profile.endDateWithSavvy),
        managerId: profile.managerId ? String(profile.managerId) : "",
        dialerUserId: profile.dialerUserId ?? "",
        crmUserId: profile.crmUserId ?? "",
        slackHandle: profile.slackHandle ?? "",
        callRecordingLink: profile.callRecordingLink ?? "",
        trainingStartDate: toInputDate(profile.trainingStartDate),
        trainingCompletionDate: toInputDate(profile.trainingCompletionDate),
        currentTrainingStatus: profile.currentTrainingStatus ?? "",
        scriptVersionAssigned: profile.scriptVersionAssigned ?? "",
        notes: profile.notes ?? "",
      });
    }
  }, [profile]);

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleSave = () => {
    upsert.mutate({
      userId,
      isaStatus: form.isaStatus as any,
      startDateWithSavvy: form.startDateWithSavvy || null,
      endDateWithSavvy: form.endDateWithSavvy || null,
      managerId: form.managerId ? parseInt(form.managerId) : null,
      dialerUserId: form.dialerUserId || null,
      crmUserId: form.crmUserId || null,
      slackHandle: form.slackHandle || null,
      callRecordingLink: form.callRecordingLink || null,
      trainingStartDate: form.trainingStartDate || null,
      trainingCompletionDate: form.trainingCompletionDate || null,
      currentTrainingStatus: form.currentTrainingStatus || null,
      scriptVersionAssigned: form.scriptVersionAssigned || null,
      notes: form.notes || null,
    });
  };

  return (
    <div className="space-y-6">
      <Accordion type="multiple" defaultValue={["isa-ops"]} className="space-y-2">
        <AccordionItem value="isa-ops" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold py-3">ISA Employment Details</AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-4">
              <SectionGrid>
                <Field label="ISA Status">
                  <Select value={form.isaStatus} onValueChange={(v) => setForm((p) => ({ ...p, isaStatus: v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="on_leave">On Leave</SelectItem>
                      <SelectItem value="offboarded">Offboarded</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Start Date with Savvy">
                  <Input className="h-8 text-sm" type="date" value={form.startDateWithSavvy} onChange={f("startDateWithSavvy")} />
                </Field>
                <Field label="End Date with Savvy">
                  <Input className="h-8 text-sm" type="date" value={form.endDateWithSavvy} onChange={f("endDateWithSavvy")} />
                </Field>
                <Field label="Dialer / Calling Platform User ID">
                  <Input className="h-8 text-sm" value={form.dialerUserId} onChange={f("dialerUserId")} />
                </Field>
                <Field label="CRM User ID">
                  <Input className="h-8 text-sm" value={form.crmUserId} onChange={f("crmUserId")} />
                </Field>
                <Field label="Slack Handle">
                  <Input className="h-8 text-sm" value={form.slackHandle} onChange={f("slackHandle")} placeholder="@username" />
                </Field>
                <Field label="Training Start Date">
                  <Input className="h-8 text-sm" type="date" value={form.trainingStartDate} onChange={f("trainingStartDate")} />
                </Field>
                <Field label="Training Completion Date">
                  <Input className="h-8 text-sm" type="date" value={form.trainingCompletionDate} onChange={f("trainingCompletionDate")} />
                </Field>
                <Field label="Current Training Status">
                  <Input className="h-8 text-sm" value={form.currentTrainingStatus} onChange={f("currentTrainingStatus")} placeholder="e.g. Module 3 of 5" />
                </Field>
                <Field label="Script Version Assigned">
                  <Input className="h-8 text-sm" value={form.scriptVersionAssigned} onChange={f("scriptVersionAssigned")} placeholder="e.g. v2.3" />
                </Field>
              </SectionGrid>
              <Field label="Call Recording Link / Folder">
                <Input className="h-8 text-sm" value={form.callRecordingLink} onChange={f("callRecordingLink")} placeholder="https://..." />
              </Field>
              <Field label="Notes">
                <Textarea className="text-sm min-h-[80px]" value={form.notes} onChange={f("notes")} />
              </Field>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>
          {upsert.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
          Save ISA Profile
        </Button>
      </div>
    </div>
  );
}

// ── Admin Profile Section ─────────────────────────────────────────────────────
function AdminProfileSection({ userId }: { userId: number }) {
  const { data: profile, refetch } = trpc.users.getAdminProfile.useQuery({ userId });
  const upsert = trpc.users.upsertAdminProfile.useMutation({
    onSuccess: () => { toast.success("Admin profile saved"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const [form, setForm] = useState({
    adminStatus: "active" as string, startDateWithSavvy: "", endDateWithSavvy: "",
    managerId: "" as string, slackHandle: "", adminType: "" as string,
    primaryResponsibilityNotes: "", backupResponsibilityNotes: "",
    sopOwnerNotes: "", notes: "",
  });

  useEffect(() => {
    if (profile) {
      setForm({
        adminStatus: profile.adminStatus ?? "active",
        startDateWithSavvy: toInputDate(profile.startDateWithSavvy),
        endDateWithSavvy: toInputDate(profile.endDateWithSavvy),
        managerId: profile.managerId ? String(profile.managerId) : "",
        slackHandle: profile.slackHandle ?? "",
        adminType: profile.adminType ?? "",
        primaryResponsibilityNotes: profile.primaryResponsibilityNotes ?? "",
        backupResponsibilityNotes: profile.backupResponsibilityNotes ?? "",
        sopOwnerNotes: profile.sopOwnerNotes ?? "",
        notes: profile.notes ?? "",
      });
    }
  }, [profile]);

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleSave = () => {
    upsert.mutate({
      userId,
      adminStatus: form.adminStatus as any,
      startDateWithSavvy: form.startDateWithSavvy || null,
      endDateWithSavvy: form.endDateWithSavvy || null,
      managerId: form.managerId ? parseInt(form.managerId) : null,
      slackHandle: form.slackHandle || null,
      adminType: (form.adminType || null) as any,
      primaryResponsibilityNotes: form.primaryResponsibilityNotes || null,
      backupResponsibilityNotes: form.backupResponsibilityNotes || null,
      sopOwnerNotes: form.sopOwnerNotes || null,
      notes: form.notes || null,
    });
  };

  return (
    <div className="space-y-6">
      <Accordion type="multiple" defaultValue={["admin-ops"]} className="space-y-2">
        <AccordionItem value="admin-ops" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold py-3">Admin Employment Details</AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-4">
              <SectionGrid>
                <Field label="Admin Status">
                  <Select value={form.adminStatus} onValueChange={(v) => setForm((p) => ({ ...p, adminStatus: v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="on_leave">On Leave</SelectItem>
                      <SelectItem value="offboarded">Offboarded</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Admin Type">
                  <Select value={form.adminType || ""} onValueChange={(v) => setForm((p) => ({ ...p, adminType: v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="executive">Executive</SelectItem>
                      <SelectItem value="operations">Operations</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="expansion">Expansion</SelectItem>
                      <SelectItem value="finance">Finance</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Start Date with Savvy">
                  <Input className="h-8 text-sm" type="date" value={form.startDateWithSavvy} onChange={f("startDateWithSavvy")} />
                </Field>
                <Field label="End Date with Savvy">
                  <Input className="h-8 text-sm" type="date" value={form.endDateWithSavvy} onChange={f("endDateWithSavvy")} />
                </Field>
                <Field label="Slack Handle">
                  <Input className="h-8 text-sm" value={form.slackHandle} onChange={f("slackHandle")} placeholder="@username" />
                </Field>
              </SectionGrid>
              <Field label="Primary Responsibility Notes">
                <Textarea className="text-sm min-h-[60px]" value={form.primaryResponsibilityNotes} onChange={f("primaryResponsibilityNotes")} />
              </Field>
              <Field label="Backup Responsibility Notes">
                <Textarea className="text-sm min-h-[60px]" value={form.backupResponsibilityNotes} onChange={f("backupResponsibilityNotes")} />
              </Field>
              <Field label="SOP / Documentation Owner Notes">
                <Textarea className="text-sm min-h-[60px]" value={form.sopOwnerNotes} onChange={f("sopOwnerNotes")} />
              </Field>
              <Field label="Notes">
                <Textarea className="text-sm min-h-[60px]" value={form.notes} onChange={f("notes")} />
              </Field>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>
          {upsert.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
          Save Admin Profile
        </Button>
      </div>
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
export default function UserExtendedProfileTab({ userId, userRole }: Props) {
  return (
    <div className="space-y-8">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Core Profile</CardTitle>
          <p className="text-xs text-muted-foreground">Identity, address, personal/HR details, and company lifecycle fields shared across all roles.</p>
        </CardHeader>
        <CardContent>
          <CoreProfileSection userId={userId} />
        </CardContent>
      </Card>

      {userRole === "agent" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Agent Profile</CardTitle>
            <p className="text-xs text-muted-foreground">Licensing, marketing presence, and agent-specific operational details.</p>
          </CardHeader>
          <CardContent>
            <AgentProfileSection userId={userId} />
          </CardContent>
        </Card>
      )}

      {userRole === "isa" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">ISA Profile</CardTitle>
            <p className="text-xs text-muted-foreground">ISA-specific employment, training, and operational details.</p>
          </CardHeader>
          <CardContent>
            <IsaProfileSection userId={userId} />
          </CardContent>
        </Card>
      )}

      {userRole === "admin" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Admin Profile</CardTitle>
            <p className="text-xs text-muted-foreground">Admin-specific employment, responsibilities, and operational details.</p>
          </CardHeader>
          <CardContent>
            <AdminProfileSection userId={userId} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
