/**
 * Public Partner Lead Intake Form
 *
 * Accessible without login. Partners submit client leads via a unique URL:
 *   /partner-lead?partner=PartnerName
 *
 * Rules:
 * - If ?partner= is missing or does not exactly match a known active lead source,
 *   show a 404 page. This prevents enumeration of our lead sources.
 * - The Partner/Lead Source dropdown is intentionally NOT shown to the public.
 * - Page is tagged noindex/nofollow to prevent search engine and LLM indexing.
 */

import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Loader2, Send, User, Phone, Mail, StickyNote, Building2 } from "lucide-react";

// ─── Form State ───────────────────────────────────────────────────────────────

type FormState = {
  clientName: string;
  phone: string;
  email: string;
  notes: string;
  partnerName: string;
  partnerEmail: string;
};

const EMPTY: FormState = {
  clientName: "",
  phone: "",
  email: "",
  notes: "",
  partnerName: "",
  partnerEmail: "",
};

// ─── 404 Page ─────────────────────────────────────────────────────────────────

function NotFoundPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[oklch(0.97_0.02_200)] to-[oklch(0.93_0.04_200)] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center space-y-4">
        <img
          src="https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png"
          alt="Savvy STR Agents"
          className="h-8 mx-auto object-contain"
        />
        <div>
          <p className="text-6xl font-bold text-gray-200 mt-4">404</p>
          <h1 className="text-xl font-bold text-gray-900 mt-2">Page Not Found</h1>
          <p className="text-gray-500 text-sm mt-2 leading-relaxed">
            This link is invalid or has expired. Please contact your Savvy representative for a valid partner link.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PartnerLeadForm() {
  // Inject noindex/nofollow meta tags to prevent search engine and LLM indexing
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow, noarchive, nosnippet";
    document.head.appendChild(meta);
    const metaGPT = document.createElement("meta");
    metaGPT.name = "googlebot";
    metaGPT.content = "noindex, nofollow";
    document.head.appendChild(metaGPT);
    return () => {
      document.head.removeChild(meta);
      document.head.removeChild(metaGPT);
    };
  }, []);

  const search = useSearch();
  const params = new URLSearchParams(search);
  const partnerParam = params.get("partner") ?? "";

  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  // Honeypot — hidden from real users, bots fill it
  const [hp, setHp] = useState("");

  // Validate the partner param against known active sources
  const { data: sources = [], isLoading: sourcesLoading } = trpc.webhooks.listPartnerSources.useQuery();

  // Resolved source — exact case-insensitive match required
  const resolvedSource = sources.find(
    (s) => s.name.toLowerCase() === partnerParam.toLowerCase()
  ) ?? null;

  // Track click — fire once when the resolved source is first confirmed
  const trackClick = trpc.webhooks.trackPartnerClick.useMutation();
  const [clickTracked, setClickTracked] = useState(false);
  useEffect(() => {
    if (resolvedSource && !clickTracked) {
      setClickTracked(true);
      trackClick.mutate({ leadSourceId: resolvedSource.id });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedSource?.id]);

  const submit = trpc.webhooks.submitPartnerLead.useMutation({
    onSuccess: () => setSubmitted(true),
    onError: (e) => toast.error(e.message || "Submission failed. Please try again."),
  });

  function set(k: keyof FormState, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  }

  function validate(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.clientName.trim()) errs.clientName = "Client name is required.";
    if (!form.phone.trim() && !form.email.trim()) {
      errs.phone = "At least one of phone or email is required.";
      errs.email = "At least one of phone or email is required.";
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = "Please enter a valid email address.";
    }
    if (form.partnerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.partnerEmail)) {
      errs.partnerEmail = "Please enter a valid email address.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    submit.mutate({
      clientName: form.clientName.trim(),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      notes: form.notes.trim() || undefined,
      partnerSourceId: resolvedSource?.id,
      partnerEmail: form.partnerEmail.trim() || undefined,
      partnerName: form.partnerName.trim() || undefined,
      _hp: hp || undefined,
    });
  }

  // ─── Loading state ─────────────────────────────────────────────────────────
  if (sourcesLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[oklch(0.97_0.02_200)] to-[oklch(0.93_0.04_200)] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[oklch(0.55_0.14_200)]" />
      </div>
    );
  }

  // ─── 404 — invalid or missing partner param ────────────────────────────────
  if (!partnerParam || !resolvedSource) {
    return <NotFoundPage />;
  }

  // ─── Thank-You Screen ──────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[oklch(0.97_0.02_200)] to-[oklch(0.93_0.04_200)] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center space-y-5">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-[oklch(0.74_0.14_200)]/15 flex items-center justify-center">
              <CheckCircle2 className="h-9 w-9 text-[oklch(0.55_0.14_200)]" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Thank You!</h1>
            <p className="text-gray-500 mt-2 leading-relaxed">
              Your lead has been successfully submitted to the Savvy STR Agents team.
              We'll be in touch with your client shortly.
            </p>
            {form.partnerEmail && (
              <p className="text-gray-400 text-sm mt-2">
                A confirmation has been sent to <span className="font-medium text-gray-600">{form.partnerEmail}</span>.
              </p>
            )}
          </div>
          <div className="bg-[oklch(0.97_0.02_200)] rounded-xl p-4 text-sm text-gray-600 text-left space-y-1">
            <p><span className="font-medium">Client:</span> {form.clientName}</p>
            {form.phone && <p><span className="font-medium">Phone:</span> {form.phone}</p>}
            {form.email && <p><span className="font-medium">Email:</span> {form.email}</p>}
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => { setForm(EMPTY); setSubmitted(false); }}
          >
            Submit Another Lead
          </Button>
        </div>
      </div>
    );
  }

  // ─── Form ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-[oklch(0.97_0.02_200)] to-[oklch(0.93_0.04_200)] flex items-start justify-center p-6 pt-12">
      <div className="w-full max-w-lg space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png"
            alt="Savvy STR Agents"
            className="h-8 mx-auto object-contain"
          />
          <h1 className="text-2xl font-bold text-gray-900 mt-4">Partner Lead Intake</h1>
          <p className="text-gray-500 text-sm leading-relaxed max-w-sm mx-auto">
            Submit a client lead and our team will follow up promptly.
            All information is kept confidential.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-5">

          {/* Partner source banner */}
          <div className="flex items-center gap-2.5 bg-[oklch(0.74_0.14_200)]/10 border border-[oklch(0.74_0.14_200)]/30 rounded-lg px-4 py-2.5 text-sm">
            <Building2 className="h-4 w-4 text-[oklch(0.55_0.14_200)] shrink-0" />
            <span className="text-[oklch(0.40_0.14_200)] font-medium">
              Submitting on behalf of: <span className="font-semibold">{resolvedSource.name}</span>
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>

            {/* Honeypot — hidden from real users */}
            <div style={{ position: "absolute", left: "-9999px", opacity: 0, pointerEvents: "none" }} aria-hidden="true" tabIndex={-1}>
              <input
                type="text"
                name="website"
                value={hp}
                onChange={(e) => setHp(e.target.value)}
                autoComplete="off"
                tabIndex={-1}
              />
            </div>

            {/* ── Client Info ──────────────────────────────────────────────── */}
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Client Information</p>
            </div>

            {/* Client Name */}
            <div className="space-y-1.5">
              <Label htmlFor="clientName" className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                <User className="h-3.5 w-3.5" /> Client Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="clientName"
                value={form.clientName}
                onChange={(e) => set("clientName", e.target.value)}
                placeholder="e.g. Jane Smith"
                className={errors.clientName ? "border-red-400 focus-visible:ring-red-300" : ""}
              />
              {errors.clientName && <p className="text-xs text-red-500">{errors.clientName}</p>}
            </div>

            {/* Phone + Email row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <Phone className="h-3.5 w-3.5" /> Phone
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="(555) 000-0000"
                  className={errors.phone ? "border-red-400 focus-visible:ring-red-300" : ""}
                />
                {errors.phone && <p className="text-xs text-red-500">{errors.phone}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <Mail className="h-3.5 w-3.5" /> Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="jane@example.com"
                  className={errors.email ? "border-red-400 focus-visible:ring-red-300" : ""}
                />
                {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
              </div>
            </div>
            <p className="text-xs text-gray-400 -mt-2">At least one of phone or email is required.</p>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes" className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                <StickyNote className="h-3.5 w-3.5" /> Notes
              </Label>
              <Textarea
                id="notes"
                rows={3}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Any relevant details about the client, their goals, budget, timeline, etc."
              />
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100 pt-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Your Information (Optional)</p>
            </div>

            {/* Partner Name + Email */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="partnerName" className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <User className="h-3.5 w-3.5" /> Your Name
                </Label>
                <Input
                  id="partnerName"
                  value={form.partnerName}
                  onChange={(e) => set("partnerName", e.target.value)}
                  placeholder="e.g. John Doe"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="partnerEmail" className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <Mail className="h-3.5 w-3.5" /> Your Email
                </Label>
                <Input
                  id="partnerEmail"
                  type="email"
                  value={form.partnerEmail}
                  onChange={(e) => set("partnerEmail", e.target.value)}
                  placeholder="you@example.com"
                  className={errors.partnerEmail ? "border-red-400 focus-visible:ring-red-300" : ""}
                />
                {errors.partnerEmail && <p className="text-xs text-red-500">{errors.partnerEmail}</p>}
              </div>
            </div>
            <p className="text-xs text-gray-400 -mt-2">
              Provide your email to receive a confirmation receipt when your lead is submitted.
            </p>



            {/* Submit */}
            <Button
              type="submit"
              className="w-full gap-2 bg-[oklch(0.55_0.14_200)] hover:bg-[oklch(0.48_0.14_200)] text-white"
              disabled={submit.isPending}
            >
              {submit.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
              ) : (
                <><Send className="h-4 w-4" /> Submit Lead</>
              )}
            </Button>

          </form>
        </div>

        <p className="text-center text-xs text-gray-400 pb-8">
          © {new Date().getFullYear()} Savvy STR Agents · All information is kept confidential
        </p>
      </div>
    </div>
  );
}
