/**
 * Public Careers Page — /careers
 *
 * Accessible without login. Shows all active job postings from SavvyOS
 * and allows anyone to apply directly.
 *
 * Tagged noindex/nofollow by default (remove meta tags if you want SEO indexing).
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  MapPin,
  Briefcase,
  Clock,
  DollarSign,
  ChevronRight,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  Building2,
  Send,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type EmploymentType = "full_time" | "part_time" | "contract" | "internship";

const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "Full-Time",
  part_time: "Part-Time",
  contract: "Contract",
  internship: "Internship",
};

// ─── Application Form ─────────────────────────────────────────────────────────

type AppFormData = {
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  linkedinUrl: string;
  coverLetter: string;
  _hp: string;
};

const EMPTY_FORM: AppFormData = {
  applicantName: "",
  applicantEmail: "",
  applicantPhone: "",
  linkedinUrl: "",
  coverLetter: "",
  _hp: "",
};

function ApplyDialog({
  job,
  onClose,
}: {
  job: any;
  onClose: () => void;
}) {
  const [form, setForm] = useState<AppFormData>(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);

  const apply = trpc.jobBoard.applyToJob.useMutation({
    onSuccess: () => setSubmitted(true),
    onError: (e) => toast.error(e.message || "Something went wrong. Please try again."),
  });

  const set = (k: keyof AppFormData, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.applicantName.trim()) { toast.error("Name is required"); return; }
    if (!form.applicantEmail.trim()) { toast.error("Email is required"); return; }
    apply.mutate({
      jobPostingId: job.id,
      applicantName: form.applicantName,
      applicantEmail: form.applicantEmail,
      applicantPhone: form.applicantPhone || undefined,
      linkedinUrl: form.linkedinUrl || undefined,
      coverLetter: form.coverLetter || undefined,
      _hp: form._hp || undefined,
    });
  };

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {submitted ? (
          <div className="py-10 text-center space-y-4">
            <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto" />
            <h2 className="text-xl font-bold text-gray-900">Application Submitted!</h2>
            <p className="text-gray-500 text-sm leading-relaxed">
              Thank you for applying for <strong>{job.title}</strong>. Our team will review your application and reach out if there's a fit.
            </p>
            <Button onClick={onClose} variant="outline">Close</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Apply — {job.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Honeypot — hidden from humans, bots fill it */}
              <input
                type="text"
                name="_hp"
                value={form._hp}
                onChange={e => set("_hp", e.target.value)}
                style={{ display: "none" }}
                tabIndex={-1}
                autoComplete="off"
              />
              <div>
                <Label>Full Name *</Label>
                <Input
                  value={form.applicantName}
                  onChange={e => set("applicantName", e.target.value)}
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <Label>Email Address *</Label>
                <Input
                  type="email"
                  value={form.applicantEmail}
                  onChange={e => set("applicantEmail", e.target.value)}
                  placeholder="jane@example.com"
                />
              </div>
              <div>
                <Label>Phone Number</Label>
                <Input
                  type="tel"
                  value={form.applicantPhone}
                  onChange={e => set("applicantPhone", e.target.value)}
                  placeholder="(555) 000-0000"
                />
              </div>
              <div>
                <Label>LinkedIn Profile URL</Label>
                <Input
                  type="url"
                  value={form.linkedinUrl}
                  onChange={e => set("linkedinUrl", e.target.value)}
                  placeholder="https://linkedin.com/in/yourprofile"
                />
              </div>
              <div>
                <Label>Cover Letter / Message</Label>
                <Textarea
                  value={form.coverLetter}
                  onChange={e => set("coverLetter", e.target.value)}
                  rows={5}
                  placeholder="Tell us why you're a great fit for this role..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={apply.isPending}>
                {apply.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
                ) : (
                  <><Send className="w-4 h-4 mr-2" /> Submit Application</>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Job Detail View ──────────────────────────────────────────────────────────

function JobDetail({ job, onBack }: { job: any; onBack: () => void }) {
  const [applyOpen, setApplyOpen] = useState(false);

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to all openings
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{job.title}</h2>
            {job.department && (
              <p className="text-gray-500 text-sm mt-1">{job.department}</p>
            )}
          </div>
          <Button onClick={() => setApplyOpen(true)} size="lg" className="shrink-0">
            Apply Now
          </Button>
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-8 pb-8 border-b border-gray-100">
          {job.location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-gray-400" /> {job.location}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-gray-400" />
            {EMPLOYMENT_TYPE_LABELS[job.employmentType as EmploymentType] ?? job.employmentType}
          </span>
          {job.salaryRange && (
            <span className="flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-gray-400" /> {job.salaryRange}
            </span>
          )}
        </div>

        <div className="space-y-6 text-gray-700 text-sm leading-relaxed">
          <div>
            <h3 className="font-semibold text-gray-900 text-base mb-2">About the Role</h3>
            <div className="whitespace-pre-wrap">{job.description}</div>
          </div>
          {job.requirements && (
            <div>
              <h3 className="font-semibold text-gray-900 text-base mb-2">Requirements</h3>
              <div className="whitespace-pre-wrap">{job.requirements}</div>
            </div>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100">
          <Button onClick={() => setApplyOpen(true)} size="lg">
            Apply for This Position
          </Button>
        </div>
      </div>

      {applyOpen && <ApplyDialog job={job} onClose={() => setApplyOpen(false)} />}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CareersPage() {
  const { data: jobs = [], isLoading } = trpc.jobBoard.listActiveJobs.useQuery();
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [applyJob, setApplyJob] = useState<any | null>(null);

  // Set page meta
  useEffect(() => {
    document.title = "Careers — Savvy STR Agents";
    // Prevent search engine indexing (remove if you want SEO)
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[oklch(0.97_0.02_200)] to-[oklch(0.93_0.04_200)]">
      {/* Nav bar */}
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png"
            alt="Savvy STR Agents"
            className="h-7 object-contain"
          />
          <a
            href="https://savvy-agents.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            savvy-agents.com
          </a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {selectedJob ? (
          <JobDetail job={selectedJob} onBack={() => setSelectedJob(null)} />
        ) : (
          <>
            {/* Hero */}
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold text-gray-900 mb-3">Join the Savvy Team</h1>
              <p className="text-gray-500 text-lg max-w-xl mx-auto leading-relaxed">
                We're building the future of short-term rental investing. Come grow with us.
              </p>
            </div>

            {/* Job listings */}
            {isLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <Briefcase className="w-12 h-12 mx-auto text-gray-200 mb-4" />
                <h2 className="text-xl font-semibold text-gray-700 mb-2">No Open Positions</h2>
                <p className="text-gray-400 text-sm">
                  We don't have any open roles right now, but check back soon — we're always growing.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {jobs.map((job: any) => (
                  <div
                    key={job.id}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
                    onClick={() => setSelectedJob(job)}
                  >
                    <div className="p-6 flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h2 className="text-lg font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
                            {job.title}
                          </h2>
                          <span className="text-xs font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                            {EMPLOYMENT_TYPE_LABELS[job.employmentType as EmploymentType] ?? job.employmentType}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-3 text-sm text-gray-500">
                          {job.department && (
                            <span className="flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5" /> {job.department}
                            </span>
                          )}
                          {job.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" /> {job.location}
                            </span>
                          )}
                          {job.salaryRange && (
                            <span className="flex items-center gap-1">
                              <DollarSign className="w-3.5 h-3.5" /> {job.salaryRange}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Button
                          size="sm"
                          onClick={e => { e.stopPropagation(); setApplyJob(job); }}
                          className="hidden sm:flex"
                        >
                          Apply
                        </Button>
                        <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-8 text-xs text-gray-400 mt-8">
        © {new Date().getFullYear()} Savvy STR Agents. All rights reserved.
      </footer>

      {applyJob && <ApplyDialog job={applyJob} onClose={() => setApplyJob(null)} />}
    </div>
  );
}
