/**
 * CareersPage — Public job board + multi-step application
 * No login required.
 *
 * Flow:
 *   1. Listings view (with clickable job detail)
 *   2. Email gate (name + email)
 *   3. Upload step: Resume, Cover Letter, LinkedIn URL → AI analysis
 *   4. AI Review: Select which extracted fields to auto-fill
 *   5. Contact Info (pre-filled from AI)
 *   6. Work History (pre-filled from AI)
 *   7. Education (pre-filled from AI)
 *   8. Cover Letter & Details (pre-filled from AI)
 *   9. Custom Questions (if any)
 *   10. Review & Submit
 *
 * Draft save + email-only magic link to resume later.
 */
import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";

interface WorkEntry { company: string; title: string; startDate: string; endDate: string; isCurrent: boolean; description: string; }
interface EduEntry { institution: string; degree: string; fieldOfStudy: string; startYear: string; endYear: string; gpa: string; }

const SESSION_KEY = "savvy_careers_session";
function saveSession(email: string, token: string) { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ email, token })); }
function loadSession(): { email: string; token: string } | null { try { const r = sessionStorage.getItem(SESSION_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
function clearSession() { sessionStorage.removeItem(SESSION_KEY); }

const STEP_LABELS = ["Upload", "Contact", "Work History", "Education", "Cover Letter", "Questions", "Review"];
const EMPLOYMENT_LABELS: Record<string, string> = { full_time: "Full-Time", part_time: "Part-Time", contract: "Contract", internship: "Internship" };

function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = Math.round(((step - 1) / Math.max(total - 1, 1)) * 100);
  const labels = total === 7 ? STEP_LABELS : STEP_LABELS.filter(l => l !== "Questions");
  return (
    <div className="mb-8">
      <div className="flex justify-between mb-2">
        {labels.map((l, i) => <span key={i} className={`text-xs font-medium ${i + 1 <= step ? "text-[#0fc0df]" : "text-gray-400"}`}>{l}</span>)}
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-[#0fc0df] transition-all duration-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-400 mt-1 text-right">Step {step} of {total}</p>
    </div>
  );
}

export default function CareersPage() {
  const [searchParams] = [new URLSearchParams(window.location.search)];
  const urlToken = searchParams.get("token");
  const urlEmail = searchParams.get("email");

  const [view, setView] = useState<"listings" | "job-detail" | "apply" | "resume-draft" | "my-apps">("listings");
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [step, setStep] = useState(1);
  const [applicationId, setApplicationId] = useState<number | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 2 (Contact)
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  // Step 1 (Upload)
  const [resumeUrl, setResumeUrl] = useState("");
  const [resumeFileName, setResumeFileName] = useState("");
  const [resumeLinkUrl, setResumeLinkUrl] = useState("");
  const [coverLetterUrl, setCoverLetterUrl] = useState("");
  const [coverLetterFileName, setCoverLetterFileName] = useState("");
  const [uploadLinkedinUrl, setUploadLinkedinUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiExtracted, setAiExtracted] = useState<any>(null);
  const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>({});
  const [showAiReview, setShowAiReview] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [coverLetterFile, setCoverLetterFile] = useState<File | null>(null);
  // Step 3 (Work History)
  const [workHistory, setWorkHistory] = useState<WorkEntry[]>([]);
  // Step 4 (Education)
  const [education, setEducation] = useState<EduEntry[]>([]);
  // Step 5 (Cover Letter)
  const [coverLetter, setCoverLetter] = useState("");
  const [whyInterested, setWhyInterested] = useState("");
  const [salaryExpectation, setSalaryExpectation] = useState("");
  const [availableStartDate, setAvailableStartDate] = useState("");
  // Step 6 (Custom Questions)
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  // Magic link
  const [magicEmail, setMagicEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);

  const { data: jobs = [], isLoading: jobsLoading } = trpc.jobBoard.listActiveJobs.useQuery();
  const { data: jobDetail } = trpc.jobBoard.getJob.useQuery({ id: selectedJobId! }, { enabled: !!selectedJobId });
  const { data: myApps = [] } = trpc.jobBoard.getMyApplications.useQuery(
    { token: sessionToken!, email: sessionEmail! },
    { enabled: !!sessionToken && !!sessionEmail && view === "my-apps" }
  );

  const startApplication = trpc.jobBoard.startApplication.useMutation();
  const saveStep = trpc.jobBoard.saveApplicationStep.useMutation();
  const submitApplication = trpc.jobBoard.submitApplication.useMutation();
  const requestMagicLink = trpc.jobBoard.requestMagicLink.useMutation();
  const verifyMagicLink = trpc.jobBoard.verifyMagicLink.useMutation();

  useEffect(() => {
    document.title = "Careers — Savvy STR Agents";
    if (urlToken && urlEmail) {
      verifyMagicLink.mutate({ token: urlToken, email: urlEmail }, {
        onSuccess: () => {
          saveSession(urlEmail, urlToken);
          setSessionToken(urlToken); setSessionEmail(urlEmail);
          window.history.replaceState({}, "", "/careers");
          setView("my-apps");
        },
        onError: () => window.history.replaceState({}, "", "/careers"),
      });
    } else {
      const sess = loadSession();
      if (sess) { setSessionToken(sess.token); setSessionEmail(sess.email); }
    }
  }, []);

  function scheduleAutoSave() {
    if (!applicationId || !sessionToken) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => doSaveStep(step, false), 2000);
  }

  async function doSaveStep(currentStep: number, showSaving = true) {
    if (!applicationId || !sessionToken) return;
    if (showSaving) setIsSaving(true);
    setSaveError(null);
    try {
      await saveStep.mutateAsync({
        applicationId, token: sessionToken, step: currentStep,
        firstName, lastName, phone, city, state: stateName, linkedinUrl, portfolioUrl,
        resumeUrl, resumeFileName, resumeLinkUrl,
        coverLetter, whyInterested, salaryExpectation, availableStartDate,
        workHistory, education, customAnswers,
      });
    } catch (e: any) { setSaveError(e.message ?? "Failed to save."); }
    finally { if (showSaving) setIsSaving(false); }
  }

  async function handleAnalyzeUpload() {
    setIsAnalyzing(true);
    setSaveError(null);
    try {
      const fd = new FormData();
      if (resumeFile) fd.append("resume", resumeFile);
      if (coverLetterFile) fd.append("coverLetter", coverLetterFile);
      if (uploadLinkedinUrl) fd.append("linkedinUrl", uploadLinkedinUrl);
      if (jobDetail) {
        fd.append("jobTitle", jobDetail.title || "");
        fd.append("jobDescription", (jobDetail as any).description || "");
        fd.append("jobRequirements", (jobDetail as any).requirements || "");
      }

      const res = await fetch("/api/upload/analyze-application", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();

      // Store upload URLs
      if (data.resumeUrl) { setResumeUrl(data.resumeUrl); setResumeFileName(data.resumeFileName); }
      if (data.coverLetterUrl) { setCoverLetterUrl(data.coverLetterUrl); setCoverLetterFileName(data.coverLetterFileName); }
      if (uploadLinkedinUrl) setLinkedinUrl(uploadLinkedinUrl);

      if (data.extracted) {
        setAiExtracted(data.extracted);
        // Default all fields to selected
        const defaults: Record<string, boolean> = {};
        if (data.extracted.phone) defaults.phone = true;
        if (data.extracted.city) defaults.city = true;
        if (data.extracted.state) defaults.state = true;
        if (data.extracted.linkedinUrl) defaults.linkedinUrl = true;
        if (data.extracted.portfolioUrl) defaults.portfolioUrl = true;
        if (data.extracted.workHistory?.length > 0) defaults.workHistory = true;
        if (data.extracted.education?.length > 0) defaults.education = true;
        if (data.extracted.coverLetter) defaults.coverLetter = true;
        if (data.extracted.whyInterested) defaults.whyInterested = true;
        if (data.extracted.salaryExpectation) defaults.salaryExpectation = true;
        if (data.extracted.availableStartDate) defaults.availableStartDate = true;
        setSelectedFields(defaults);
        setShowAiReview(true);
      } else {
        // No AI data extracted, just proceed
        setStep(2);
      }
    } catch (e: any) {
      setSaveError(e.message ?? "Upload failed");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function applySelectedFields() {
    if (!aiExtracted) return;
    if (selectedFields.phone && aiExtracted.phone) setPhone(aiExtracted.phone);
    if (selectedFields.city && aiExtracted.city) setCity(aiExtracted.city);
    if (selectedFields.state && aiExtracted.state) setStateName(aiExtracted.state);
    if (selectedFields.linkedinUrl && aiExtracted.linkedinUrl) setLinkedinUrl(aiExtracted.linkedinUrl);
    if (selectedFields.portfolioUrl && aiExtracted.portfolioUrl) setPortfolioUrl(aiExtracted.portfolioUrl);
    if (selectedFields.workHistory && aiExtracted.workHistory?.length > 0) {
      setWorkHistory(aiExtracted.workHistory.map((w: any) => ({
        company: w.company || "", title: w.title || "",
        startDate: w.startDate || "", endDate: w.endDate || "",
        isCurrent: w.isCurrent || false, description: w.description || "",
      })));
    }
    if (selectedFields.education && aiExtracted.education?.length > 0) {
      setEducation(aiExtracted.education.map((e: any) => ({
        institution: e.institution || "", degree: e.degree || "",
        fieldOfStudy: e.fieldOfStudy || "", startYear: e.startYear || "",
        endYear: e.endYear || "", gpa: e.gpa || "",
      })));
    }
    if (selectedFields.coverLetter && aiExtracted.coverLetter) setCoverLetter(aiExtracted.coverLetter);
    if (selectedFields.whyInterested && aiExtracted.whyInterested) setWhyInterested(aiExtracted.whyInterested);
    if (selectedFields.salaryExpectation && aiExtracted.salaryExpectation) setSalaryExpectation(aiExtracted.salaryExpectation);
    if (selectedFields.availableStartDate && aiExtracted.availableStartDate) setAvailableStartDate(aiExtracted.availableStartDate);
    setShowAiReview(false);
    setStep(2);
  }

  async function handleNext() {
    await doSaveStep(step);
    setStep(s => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleBack() { setStep(s => Math.max(1, s - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }

  async function handleEmailSubmit() {
    if (!email || !selectedJobId) return;
    try {
      const result = await startApplication.mutateAsync({ jobPostingId: selectedJobId, email, firstName, lastName });
      setApplicationId(result.applicationId); setSessionToken(result.token); setSessionEmail(email);
      saveSession(email, result.token); setStep(1);
    } catch (e: any) { setSaveError(e.message); }
  }

  async function handleSubmit() {
    if (!applicationId || !sessionToken) return;
    await doSaveStep(step);
    try {
      await submitApplication.mutateAsync({ applicationId, token: sessionToken });
      setStep(99);
    } catch (e: any) { setSaveError(e.message); }
  }

  const customQuestions = (jobDetail?.customQuestions ?? []) as any[];
  const totalSteps = customQuestions.length > 0 ? 7 : 6;
  const job = jobDetail ?? (jobs as any[]).find(j => j.id === selectedJobId);

  const statusColor: Record<string, string> = {
    draft: "bg-yellow-100 text-yellow-800", submitted: "bg-blue-100 text-blue-800",
    reviewing: "bg-purple-100 text-purple-800", interviewing: "bg-indigo-100 text-indigo-800",
    offered: "bg-green-100 text-green-800", rejected: "bg-red-100 text-red-800",
    withdrawn: "bg-gray-100 text-gray-600",
  };

  // ── JOB DETAIL VIEW ─────────────────────────────────────────────────────────
  if (view === "job-detail" && selectedJobId) {
    const detailJob = jobDetail ?? (jobs as any[]).find(j => j.id === selectedJobId);
    return (
      <div className="min-h-screen bg-gradient-to-br from-[oklch(0.97_0.02_200)] to-[oklch(0.93_0.04_200)]">
        <header className="bg-white border-b border-gray-100 shadow-sm">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png" alt="Savvy STR Agents" className="h-7 object-contain" />
            <div className="flex items-center gap-4">
              {sessionEmail ? (
                <button onClick={() => setView("my-apps")} className="text-sm text-[#0fc0df] underline underline-offset-2">My Applications</button>
              ) : (
                <button onClick={() => setView("resume-draft")} className="text-sm text-gray-500 hover:text-gray-800">Resume Application</button>
              )}
              <a href="https://savvy-agents.com" target="_blank" rel="noopener noreferrer" className="text-sm text-gray-400 hover:text-gray-700">savvy-agents.com</a>
            </div>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-6 py-10">
          <button onClick={() => { setView("listings"); setSelectedJobId(null); }} className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-flex items-center gap-1">← Back to all openings</button>

          {!detailJob ? (
            <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-[#0fc0df] border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Header */}
              <div className="p-8 border-b border-gray-100">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">{detailJob.title}</h1>
                    <div className="flex flex-wrap gap-3 text-sm text-gray-500">
                      {detailJob.department && <span className="flex items-center gap-1">📁 {detailJob.department}</span>}
                      {detailJob.location && <span className="flex items-center gap-1">📍 {detailJob.location}</span>}
                      {detailJob.employmentType && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#0fc0df]/10 text-[#0fc0df] border border-[#0fc0df]/20">{EMPLOYMENT_LABELS[detailJob.employmentType] ?? detailJob.employmentType}</span>}
                    </div>
                    {detailJob.salaryRange && <p className="text-sm text-gray-600 mt-2 font-medium">💰 {detailJob.salaryRange}</p>}
                  </div>
                  <button onClick={() => setView("apply")}
                    className="shrink-0 px-6 py-3 bg-[#0fc0df] text-white rounded-lg font-semibold text-sm hover:bg-[#0aabca] transition-colors shadow-sm">
                    Apply Now →
                  </button>
                </div>
              </div>

              {/* Description */}
              <div className="p-8 space-y-8">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-3">About This Role</h2>
                  <div className="text-gray-700 text-sm leading-relaxed whitespace-pre-line">{detailJob.description}</div>
                </div>

                {detailJob.requirements && (
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 mb-3">Requirements</h2>
                    <div className="text-gray-700 text-sm leading-relaxed whitespace-pre-line">{detailJob.requirements}</div>
                  </div>
                )}

                {/* Apply CTA at bottom */}
                <div className="pt-6 border-t border-gray-100 text-center">
                  <p className="text-gray-500 text-sm mb-4">Interested in this role? We'd love to hear from you.</p>
                  <button onClick={() => setView("apply")}
                    className="px-8 py-3 bg-[#0fc0df] text-white rounded-lg font-semibold hover:bg-[#0aabca] transition-colors shadow-sm">
                    Apply for This Position
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
        <footer className="text-center py-8 text-xs text-gray-400">© {new Date().getFullYear()} Savvy STR Agents. All rights reserved.</footer>
      </div>
    );
  }

  // ── LISTINGS ────────────────────────────────────────────────────────────────
  if (view === "listings") return (
    <div className="min-h-screen bg-gradient-to-br from-[oklch(0.97_0.02_200)] to-[oklch(0.93_0.04_200)]">
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png" alt="Savvy STR Agents" className="h-7 object-contain" />
          <div className="flex items-center gap-4">
            {sessionEmail ? (
              <button onClick={() => setView("my-apps")} className="text-sm text-[#0fc0df] underline underline-offset-2">My Applications</button>
            ) : (
              <button onClick={() => setView("resume-draft")} className="text-sm text-gray-500 hover:text-gray-800">Resume Application</button>
            )}
            <a href="https://savvy-agents.com" target="_blank" rel="noopener noreferrer" className="text-sm text-gray-400 hover:text-gray-700">savvy-agents.com</a>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Join the Savvy Team</h1>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">We're building the future of short-term rental investing. Come grow with us.</p>
        </div>
        {jobsLoading ? (
          <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-[#0fc0df] border-t-transparent rounded-full animate-spin" /></div>
        ) : (jobs as any[]).length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-xl font-semibold text-gray-700 mb-2">No Open Positions</p>
            <p className="text-gray-400 text-sm">We don't have any open roles right now — check back soon.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {(jobs as any[]).map((job: any) => (
              <div key={job.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-6 cursor-pointer"
                onClick={() => { setSelectedJobId(job.id); setView("job-detail"); }}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h2 className="text-lg font-semibold text-gray-900 hover:text-[#0fc0df] transition-colors">{job.title}</h2>
                      {job.employmentType && <span className="text-xs font-medium bg-[#0fc0df]/10 text-[#0fc0df] border border-[#0fc0df]/20 px-2 py-0.5 rounded-full">{EMPLOYMENT_LABELS[job.employmentType] ?? job.employmentType}</span>}
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-gray-500 mb-2">
                      {job.department && <span>📁 {job.department}</span>}
                      {job.location && <span>📍 {job.location}</span>}
                      {job.salaryRange && <span>💰 {job.salaryRange}</span>}
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2 whitespace-pre-line">{job.description}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm text-[#0fc0df] font-medium hidden sm:inline">View Details →</span>
                    <button onClick={(e) => { e.stopPropagation(); setSelectedJobId(job.id); setView("apply"); }}
                      className="px-5 py-2.5 bg-[#0fc0df] text-white rounded-lg font-semibold text-sm hover:bg-[#0aabca] transition-colors">
                      Apply Now
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <footer className="text-center py-8 text-xs text-gray-400">© {new Date().getFullYear()} Savvy STR Agents. All rights reserved.</footer>
    </div>
  );

  // ── MAGIC LINK ──────────────────────────────────────────────────────────────
  if (view === "resume-draft") return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md w-full">
        <button onClick={() => setView("listings")} className="text-sm text-gray-400 hover:text-gray-600 mb-4">← Back to listings</button>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Resume Your Application</h2>
        <p className="text-sm text-gray-500 mb-6">Enter your email and we'll send you a link to pick up where you left off.</p>
        {magicSent ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800 text-sm">✅ Check your email for a link to resume your application. The link expires in 2 hours.</div>
        ) : (
          <div className="space-y-4">
            <input type="email" placeholder="your@email.com" value={magicEmail} onChange={e => setMagicEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" />
            <button onClick={() => requestMagicLink.mutate({ email: magicEmail }, { onSuccess: () => setMagicSent(true) })}
              disabled={!magicEmail || requestMagicLink.isPending}
              className="w-full py-2.5 bg-[#0fc0df] text-white rounded-lg font-semibold text-sm hover:bg-[#0aabca] disabled:opacity-50">
              {requestMagicLink.isPending ? "Sending..." : "Send Magic Link"}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // ── MY APPS ─────────────────────────────────────────────────────────────────
  if (view === "my-apps") return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <button onClick={() => setView("listings")} className="text-sm text-gray-400 hover:text-gray-600 mb-6">← Back to listings</button>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">My Applications</h2>
        <p className="text-sm text-gray-500 mb-6">{sessionEmail}</p>
        {(myApps as any[]).length === 0 ? <p className="text-gray-400">No applications found.</p> : (
          <div className="space-y-4">
            {(myApps as any[]).map((row: any) => {
              const app = row.application;
              return (
                <div key={app.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-gray-900">{row.jobTitle ?? "Position"}</h3>
                      {row.jobDepartment && <p className="text-sm text-gray-500">{row.jobDepartment}</p>}
                      <div className="flex items-center gap-3 mt-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[app.status] ?? "bg-gray-100 text-gray-600"}`}>{app.status.charAt(0).toUpperCase() + app.status.slice(1)}</span>
                        <span className="text-xs text-gray-400">{app.completionPct}% complete</span>
                      </div>
                    </div>
                    {app.isDraft && (
                      <button onClick={() => { setSelectedJobId(app.jobPostingId); setApplicationId(app.id); setEmail(app.email); setFirstName(app.firstName ?? ""); setLastName(app.lastName ?? ""); setStep(app.currentStep ?? 1); setView("apply"); }}
                        className="shrink-0 px-4 py-2 bg-[#0fc0df] text-white rounded-lg text-sm font-semibold hover:bg-[#0aabca]">Continue</button>
                    )}
                  </div>
                  <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#0fc0df] rounded-full" style={{ width: `${app.completionPct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <button onClick={() => { clearSession(); setSessionToken(null); setSessionEmail(null); setView("listings"); }} className="mt-8 text-sm text-gray-400 hover:text-gray-600">Sign out</button>
      </div>
    </div>
  );

  // ── EMAIL GATE ──────────────────────────────────────────────────────────────
  if (view === "apply" && !applicationId) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md w-full">
        <button onClick={() => setView("listings")} className="text-sm text-gray-400 hover:text-gray-600 mb-4">← Back to listings</button>
        {job && <div className="mb-6"><p className="text-xs text-[#0fc0df] font-semibold uppercase tracking-wide mb-1">Applying for</p><h2 className="text-xl font-bold text-gray-900">{job.title}</h2>{job.department && <p className="text-sm text-gray-500">{job.department}</p>}</div>}
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Let's get started</h3>
        <p className="text-sm text-gray-500 mb-6">Enter your name and email to begin. You can save your progress and return anytime.</p>
        {saveError && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{saveError}</div>}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <input type="text" placeholder="First name *" value={firstName} onChange={e => setFirstName(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" />
            <input type="text" placeholder="Last name *" value={lastName} onChange={e => setLastName(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" />
          </div>
          <input type="email" placeholder="Email address *" value={email} onChange={e => setEmail(e.target.value)} className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" />
          <button onClick={handleEmailSubmit} disabled={!email || !firstName || !lastName || startApplication.isPending} className="w-full py-3 bg-[#0fc0df] text-white rounded-lg font-semibold hover:bg-[#0aabca] disabled:opacity-50 transition-colors">
            {startApplication.isPending ? "Starting..." : "Start Application →"}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-4 text-center">Already started? <button onClick={() => setView("resume-draft")} className="text-[#0fc0df] underline">Resume your application</button></p>
      </div>
    </div>
  );

  // ── SUCCESS ─────────────────────────────────────────────────────────────────
  if (step === 99) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-10 max-w-md w-full text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Application Submitted!</h2>
        <p className="text-gray-500 mb-2">Thank you for applying for <strong>{job?.title ?? "this position"}</strong> at Savvy STR Agents.</p>
        <p className="text-sm text-gray-400 mb-8">A confirmation has been sent to <strong>{email}</strong>. We'll be in touch soon.</p>
        <button onClick={() => { setView("listings"); setStep(1); setApplicationId(null); setSelectedJobId(null); }} className="px-6 py-3 bg-[#0fc0df] text-white rounded-lg font-semibold hover:bg-[#0aabca]">View More Openings</button>
      </div>
    </div>
  );

  // ── AI REVIEW OVERLAY ───────────────────────────────────────────────────────
  if (showAiReview && aiExtracted) return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-[#0fc0df] flex items-center justify-center text-white text-lg">🤖</div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">AI Analysis Complete</h2>
              <p className="text-sm text-gray-500">We extracted the following from your documents. Select what you'd like auto-filled.</p>
            </div>
          </div>

          <div className="space-y-4 mb-8">
            {/* Contact Info */}
            {(aiExtracted.phone || aiExtracted.city || aiExtracted.state || aiExtracted.linkedinUrl || aiExtracted.portfolioUrl) && (
              <div className="border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Contact Information</h3>
                <div className="space-y-2">
                  {aiExtracted.phone && (
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={selectedFields.phone ?? false} onChange={e => setSelectedFields(f => ({ ...f, phone: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-[#0fc0df] focus:ring-[#0fc0df]" />
                      <span className="text-sm text-gray-700"><span className="text-gray-400">Phone:</span> {aiExtracted.phone}</span>
                    </label>
                  )}
                  {aiExtracted.city && (
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={selectedFields.city ?? false} onChange={e => setSelectedFields(f => ({ ...f, city: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-[#0fc0df] focus:ring-[#0fc0df]" />
                      <span className="text-sm text-gray-700"><span className="text-gray-400">City:</span> {aiExtracted.city}</span>
                    </label>
                  )}
                  {aiExtracted.state && (
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={selectedFields.state ?? false} onChange={e => setSelectedFields(f => ({ ...f, state: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-[#0fc0df] focus:ring-[#0fc0df]" />
                      <span className="text-sm text-gray-700"><span className="text-gray-400">State:</span> {aiExtracted.state}</span>
                    </label>
                  )}
                  {aiExtracted.linkedinUrl && (
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={selectedFields.linkedinUrl ?? false} onChange={e => setSelectedFields(f => ({ ...f, linkedinUrl: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-[#0fc0df] focus:ring-[#0fc0df]" />
                      <span className="text-sm text-gray-700"><span className="text-gray-400">LinkedIn:</span> {aiExtracted.linkedinUrl}</span>
                    </label>
                  )}
                  {aiExtracted.portfolioUrl && (
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={selectedFields.portfolioUrl ?? false} onChange={e => setSelectedFields(f => ({ ...f, portfolioUrl: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-[#0fc0df] focus:ring-[#0fc0df]" />
                      <span className="text-sm text-gray-700"><span className="text-gray-400">Portfolio:</span> {aiExtracted.portfolioUrl}</span>
                    </label>
                  )}
                </div>
              </div>
            )}

            {/* Work History */}
            {aiExtracted.workHistory?.length > 0 && (
              <div className="border border-gray-200 rounded-xl p-4">
                <label className="flex items-center gap-3 cursor-pointer mb-3">
                  <input type="checkbox" checked={selectedFields.workHistory ?? false} onChange={e => setSelectedFields(f => ({ ...f, workHistory: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-[#0fc0df] focus:ring-[#0fc0df]" />
                  <h3 className="text-sm font-semibold text-gray-800">Work History ({aiExtracted.workHistory.length} position{aiExtracted.workHistory.length > 1 ? "s" : ""})</h3>
                </label>
                <div className="space-y-2 ml-7">
                  {aiExtracted.workHistory.map((w: any, i: number) => (
                    <div key={i} className="text-sm text-gray-600">
                      <span className="font-medium text-gray-800">{w.title}</span> at {w.company}
                      <span className="text-gray-400 text-xs ml-2">{w.startDate} – {w.isCurrent ? "Present" : w.endDate}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Education */}
            {aiExtracted.education?.length > 0 && (
              <div className="border border-gray-200 rounded-xl p-4">
                <label className="flex items-center gap-3 cursor-pointer mb-3">
                  <input type="checkbox" checked={selectedFields.education ?? false} onChange={e => setSelectedFields(f => ({ ...f, education: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-[#0fc0df] focus:ring-[#0fc0df]" />
                  <h3 className="text-sm font-semibold text-gray-800">Education ({aiExtracted.education.length} entr{aiExtracted.education.length > 1 ? "ies" : "y"})</h3>
                </label>
                <div className="space-y-2 ml-7">
                  {aiExtracted.education.map((e: any, i: number) => (
                    <div key={i} className="text-sm text-gray-600">
                      <span className="font-medium text-gray-800">{e.degree} {e.fieldOfStudy && `in ${e.fieldOfStudy}`}</span> — {e.institution}
                      <span className="text-gray-400 text-xs ml-2">{e.startYear}–{e.endYear}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cover Letter & Details */}
            {(aiExtracted.coverLetter || aiExtracted.whyInterested || aiExtracted.salaryExpectation || aiExtracted.availableStartDate) && (
              <div className="border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Cover Letter & Details</h3>
                <div className="space-y-2">
                  {aiExtracted.coverLetter && (
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={selectedFields.coverLetter ?? false} onChange={e => setSelectedFields(f => ({ ...f, coverLetter: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-[#0fc0df] focus:ring-[#0fc0df] mt-0.5" />
                      <span className="text-sm text-gray-700"><span className="text-gray-400">Cover Letter:</span> <span className="line-clamp-2">{aiExtracted.coverLetter}</span></span>
                    </label>
                  )}
                  {aiExtracted.whyInterested && (
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={selectedFields.whyInterested ?? false} onChange={e => setSelectedFields(f => ({ ...f, whyInterested: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-[#0fc0df] focus:ring-[#0fc0df] mt-0.5" />
                      <span className="text-sm text-gray-700"><span className="text-gray-400">Why Interested:</span> {aiExtracted.whyInterested}</span>
                    </label>
                  )}
                  {aiExtracted.salaryExpectation && (
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={selectedFields.salaryExpectation ?? false} onChange={e => setSelectedFields(f => ({ ...f, salaryExpectation: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-[#0fc0df] focus:ring-[#0fc0df]" />
                      <span className="text-sm text-gray-700"><span className="text-gray-400">Salary:</span> {aiExtracted.salaryExpectation}</span>
                    </label>
                  )}
                  {aiExtracted.availableStartDate && (
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={selectedFields.availableStartDate ?? false} onChange={e => setSelectedFields(f => ({ ...f, availableStartDate: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-[#0fc0df] focus:ring-[#0fc0df]" />
                      <span className="text-sm text-gray-700"><span className="text-gray-400">Available:</span> {aiExtracted.availableStartDate}</span>
                    </label>
                  )}
                </div>
              </div>
            )}

            {/* Skills */}
            {aiExtracted.skills?.length > 0 && (
              <div className="border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-2">Skills Detected</h3>
                <div className="flex flex-wrap gap-2">
                  {aiExtracted.skills.map((s: string, i: number) => (
                    <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={applySelectedFields}
              className="flex-1 py-3 bg-[#0fc0df] text-white rounded-lg font-semibold hover:bg-[#0aabca] transition-colors">
              Auto-Fill Selected & Continue
            </button>
            <button onClick={() => { setShowAiReview(false); setStep(2); }}
              className="px-5 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
              Skip Auto-Fill
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── MULTI-STEP APPLICATION ───────────────────────────────────────────────────
  const isLastStep = (step === 6 && customQuestions.length === 0) || step === 7;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <button onClick={() => setView("listings")} className="text-sm text-gray-400 hover:text-gray-600 mb-4">← Back to listings</button>
        {job && (
          <div className="mb-6">
            <p className="text-xs text-[#0fc0df] font-semibold uppercase tracking-wide mb-0.5">Applying for</p>
            <h1 className="text-2xl font-bold text-gray-900">{job.title}</h1>
            <div className="flex flex-wrap gap-3 text-sm text-gray-500 mt-1">
              {job.department && <span>📁 {job.department}</span>}
              {job.location && <span>📍 {job.location}</span>}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
          <ProgressBar step={step} total={totalSteps} />

          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900">
              {step === 1 && "Upload Your Documents"}
              {step === 2 && "Contact Information"}
              {step === 3 && "Work History"}
              {step === 4 && "Education"}
              {step === 5 && "Cover Letter & Details"}
              {step === 6 && (customQuestions.length > 0 ? "Additional Questions" : "Review & Submit")}
              {step === 7 && "Review & Submit"}
            </h2>
            {isSaving ? <span className="text-xs text-gray-400 animate-pulse">Saving...</span> : applicationId ? <span className="text-xs text-green-500">✓ Draft saved</span> : null}
          </div>

          {saveError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex justify-between">
              <span>{saveError}</span>
              <button onClick={() => setSaveError(null)} className="ml-2 text-red-400 hover:text-red-600">✕</button>
            </div>
          )}

          {/* STEP 1: Upload Documents */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-100 rounded-xl p-4 mb-2">
                <p className="text-sm text-purple-900 font-medium">🤖 AI-Powered Application</p>
                <p className="text-xs text-purple-700 mt-1">Upload your resume and cover letter below. Our AI will analyze them and auto-fill the rest of your application — saving you time.</p>
              </div>

              {/* Resume Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Resume *</label>
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-[#0fc0df] transition-colors cursor-pointer"
                  onClick={() => document.getElementById("resume-input")?.click()}>
                  {resumeFile ? (
                    <div><p className="text-green-600 font-medium">✓ {resumeFile.name}</p><p className="text-xs text-gray-400 mt-1">Click to replace</p></div>
                  ) : (
                    <div><p className="text-gray-500 text-sm">Click to upload your resume</p><p className="text-xs text-gray-400 mt-1">PDF, DOC, DOCX up to 10MB</p></div>
                  )}
                </div>
                <input id="resume-input" type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setResumeFile(f); }} />
              </div>

              {/* Cover Letter Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Cover Letter <span className="text-gray-400 font-normal">(optional)</span></label>
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-[#0fc0df] transition-colors cursor-pointer"
                  onClick={() => document.getElementById("cover-letter-input")?.click()}>
                  {coverLetterFile ? (
                    <div><p className="text-green-600 font-medium">✓ {coverLetterFile.name}</p><p className="text-xs text-gray-400 mt-1">Click to replace</p></div>
                  ) : (
                    <div><p className="text-gray-500 text-sm">Click to upload your cover letter</p><p className="text-xs text-gray-400 mt-1">PDF, DOC, DOCX up to 10MB</p></div>
                  )}
                </div>
                <input id="cover-letter-input" type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setCoverLetterFile(f); }} />
              </div>

              {/* LinkedIn URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">LinkedIn Profile URL <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="url" value={uploadLinkedinUrl} onChange={e => setUploadLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/yourname"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" />
              </div>

              {/* Analyze Button */}
              <button onClick={handleAnalyzeUpload}
                disabled={!resumeFile || isAnalyzing}
                className="w-full py-3 bg-[#0fc0df] text-white rounded-lg font-semibold hover:bg-[#0aabca] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {isAnalyzing ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Analyzing your documents...</>
                ) : (
                  <>Upload & Analyze with AI →</>
                )}
              </button>

              <button onClick={() => setStep(2)} className="w-full text-center text-sm text-gray-400 hover:text-gray-600">
                Skip — I'll fill everything out manually
              </button>
            </div>
          )}

          {/* STEP 2: Contact */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label><input type="text" value={firstName} onChange={e => { setFirstName(e.target.value); scheduleAutoSave(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label><input type="text" value={lastName} onChange={e => { setLastName(e.target.value); scheduleAutoSave(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label><input type="email" value={email} readOnly className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-500" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label><input type="tel" value={phone} onChange={e => { setPhone(e.target.value); scheduleAutoSave(); }} placeholder="(555) 000-0000" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">City</label><input type="text" value={city} onChange={e => { setCity(e.target.value); scheduleAutoSave(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">State</label><input type="text" value={stateName} onChange={e => { setStateName(e.target.value); scheduleAutoSave(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">LinkedIn URL</label><input type="url" value={linkedinUrl} onChange={e => { setLinkedinUrl(e.target.value); scheduleAutoSave(); }} placeholder="https://linkedin.com/in/yourname" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Portfolio / Website</label><input type="url" value={portfolioUrl} onChange={e => { setPortfolioUrl(e.target.value); scheduleAutoSave(); }} placeholder="https://yourwebsite.com" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" /></div>
            </div>
          )}

          {/* STEP 3: Work History */}
          {step === 3 && (
            <div className="space-y-6">
              {workHistory.map((w, i) => (
                <div key={i} className="border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-center"><h4 className="font-medium text-gray-800">Position {i + 1}</h4><button onClick={() => setWorkHistory(wh => wh.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600 text-sm">Remove</button></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">Job Title *</label><input type="text" value={w.title} onChange={e => { const wh = [...workHistory]; wh[i].title = e.target.value; setWorkHistory(wh); scheduleAutoSave(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" /></div>
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">Company *</label><input type="text" value={w.company} onChange={e => { const wh = [...workHistory]; wh[i].company = e.target.value; setWorkHistory(wh); scheduleAutoSave(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label><input type="month" value={w.startDate} onChange={e => { const wh = [...workHistory]; wh[i].startDate = e.target.value; setWorkHistory(wh); scheduleAutoSave(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" /></div>
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">End Date</label><input type="month" value={w.endDate} disabled={w.isCurrent} onChange={e => { const wh = [...workHistory]; wh[i].endDate = e.target.value; setWorkHistory(wh); scheduleAutoSave(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df] disabled:bg-gray-50" /><label className="flex items-center gap-2 mt-1 text-xs text-gray-500 cursor-pointer"><input type="checkbox" checked={w.isCurrent} onChange={e => { const wh = [...workHistory]; wh[i].isCurrent = e.target.checked; if (e.target.checked) wh[i].endDate = ""; setWorkHistory(wh); scheduleAutoSave(); }} />Current position</label></div>
                  </div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Description</label><textarea value={w.description} rows={3} onChange={e => { const wh = [...workHistory]; wh[i].description = e.target.value; setWorkHistory(wh); scheduleAutoSave(); }} placeholder="Describe your responsibilities and achievements..." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df] resize-none" /></div>
                </div>
              ))}
              <button onClick={() => setWorkHistory(wh => [...wh, { company: "", title: "", startDate: "", endDate: "", isCurrent: false, description: "" }])} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-[#0fc0df] hover:text-[#0fc0df] transition-colors">+ Add Work Experience</button>
              {workHistory.length === 0 && <p className="text-xs text-gray-400 text-center">Work history is optional.</p>}
            </div>
          )}

          {/* STEP 4: Education */}
          {step === 4 && (
            <div className="space-y-6">
              {education.map((e, i) => (
                <div key={i} className="border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-center"><h4 className="font-medium text-gray-800">Education {i + 1}</h4><button onClick={() => setEducation(edu => edu.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600 text-sm">Remove</button></div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">School / Institution *</label><input type="text" value={e.institution} onChange={ev => { const edu = [...education]; edu[i].institution = ev.target.value; setEducation(edu); scheduleAutoSave(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">Degree</label><input type="text" value={e.degree} onChange={ev => { const edu = [...education]; edu[i].degree = ev.target.value; setEducation(edu); scheduleAutoSave(); }} placeholder="e.g. Bachelor's" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" /></div>
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">Field of Study</label><input type="text" value={e.fieldOfStudy} onChange={ev => { const edu = [...education]; edu[i].fieldOfStudy = ev.target.value; setEducation(edu); scheduleAutoSave(); }} placeholder="e.g. Business" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">Start Year</label><input type="text" value={e.startYear} onChange={ev => { const edu = [...education]; edu[i].startYear = ev.target.value; setEducation(edu); scheduleAutoSave(); }} placeholder="2018" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" /></div>
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">End Year</label><input type="text" value={e.endYear} onChange={ev => { const edu = [...education]; edu[i].endYear = ev.target.value; setEducation(edu); scheduleAutoSave(); }} placeholder="2022" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" /></div>
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">GPA</label><input type="text" value={e.gpa} onChange={ev => { const edu = [...education]; edu[i].gpa = ev.target.value; setEducation(edu); scheduleAutoSave(); }} placeholder="3.8" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" /></div>
                  </div>
                </div>
              ))}
              <button onClick={() => setEducation(edu => [...edu, { institution: "", degree: "", fieldOfStudy: "", startYear: "", endYear: "", gpa: "" }])} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-[#0fc0df] hover:text-[#0fc0df] transition-colors">+ Add Education</button>
              {education.length === 0 && <p className="text-xs text-gray-400 text-center">Education is optional.</p>}
            </div>
          )}

          {/* STEP 5: Cover Letter */}
          {step === 5 && (
            <div className="space-y-5">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Cover Letter</label><textarea value={coverLetter} rows={6} onChange={e => { setCoverLetter(e.target.value); scheduleAutoSave(); }} placeholder="Tell us about yourself and why you're a great fit..." className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df] resize-none" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Why are you interested in this role?</label><textarea value={whyInterested} rows={4} onChange={e => { setWhyInterested(e.target.value); scheduleAutoSave(); }} placeholder="What excites you about this opportunity?" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df] resize-none" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Salary Expectation</label><input type="text" value={salaryExpectation} onChange={e => { setSalaryExpectation(e.target.value); scheduleAutoSave(); }} placeholder="e.g. $60,000–$75,000" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Available Start Date</label><input type="date" value={availableStartDate} onChange={e => { setAvailableStartDate(e.target.value); scheduleAutoSave(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" /></div>
              </div>
            </div>
          )}

          {/* STEP 6: Custom Questions */}
          {step === 6 && customQuestions.length > 0 && (
            <div className="space-y-6">
              {customQuestions.map((q: any) => (
                <div key={q.id}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{q.questionText}{q.isRequired && <span className="text-red-500 ml-1">*</span>}</label>
                  {q.questionType === "textarea" && <textarea rows={4} value={customAnswers[String(q.id)] ?? ""} onChange={e => { setCustomAnswers(a => ({ ...a, [String(q.id)]: e.target.value })); scheduleAutoSave(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df] resize-none" />}
                  {q.questionType === "text" && <input type="text" value={customAnswers[String(q.id)] ?? ""} onChange={e => { setCustomAnswers(a => ({ ...a, [String(q.id)]: e.target.value })); scheduleAutoSave(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" />}
                  {q.questionType === "yes_no" && <div className="flex gap-4">{["Yes", "No"].map(opt => <label key={opt} className="flex items-center gap-2 cursor-pointer"><input type="radio" name={`q_${q.id}`} value={opt} checked={customAnswers[String(q.id)] === opt} onChange={() => { setCustomAnswers(a => ({ ...a, [String(q.id)]: opt })); scheduleAutoSave(); }} /><span className="text-sm text-gray-700">{opt}</span></label>)}</div>}
                  {q.questionType === "multiple_choice" && (() => { let opts: string[] = []; try { opts = JSON.parse(q.options ?? "[]"); } catch {} return <div className="space-y-2">{opts.map((opt: string) => <label key={opt} className="flex items-center gap-2 cursor-pointer"><input type="radio" name={`q_${q.id}`} value={opt} checked={customAnswers[String(q.id)] === opt} onChange={() => { setCustomAnswers(a => ({ ...a, [String(q.id)]: opt })); scheduleAutoSave(); }} /><span className="text-sm text-gray-700">{opt}</span></label>)}</div>; })()}
                  {q.questionType === "rating" && <div className="flex gap-3">{[1,2,3,4,5].map(n => <button key={n} onClick={() => { setCustomAnswers(a => ({ ...a, [String(q.id)]: String(n) })); scheduleAutoSave(); }} className={`w-10 h-10 rounded-lg border text-sm font-medium transition-colors ${customAnswers[String(q.id)] === String(n) ? "bg-[#0fc0df] text-white border-[#0fc0df]" : "bg-white text-gray-600 border-gray-300 hover:border-[#0fc0df]"}`}>{n}</button>)}</div>}
                </div>
              ))}
            </div>
          )}

          {/* STEP 6 (no custom Qs) or STEP 7: Review */}
          {isLastStep && (
            <div className="space-y-5 text-sm">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <h3 className="font-semibold text-gray-800 mb-3">Contact Information</h3>
                <p><span className="text-gray-500">Name:</span> {firstName} {lastName}</p>
                <p><span className="text-gray-500">Email:</span> {email}</p>
                {phone && <p><span className="text-gray-500">Phone:</span> {phone}</p>}
                {(city || stateName) && <p><span className="text-gray-500">Location:</span> {[city, stateName].filter(Boolean).join(", ")}</p>}
                {linkedinUrl && <p><span className="text-gray-500">LinkedIn:</span> <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-[#0fc0df] underline">{linkedinUrl}</a></p>}
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="font-semibold text-gray-800 mb-3">Resume</h3>
                {resumeFileName ? <p className="text-green-600">✓ {resumeFileName}</p> : resumeLinkUrl ? <a href={resumeLinkUrl} target="_blank" rel="noopener noreferrer" className="text-[#0fc0df] underline">{resumeLinkUrl}</a> : <p className="text-gray-400 italic">Not provided</p>}
              </div>
              {coverLetterFileName && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-800 mb-3">Cover Letter File</h3>
                  <p className="text-green-600">✓ {coverLetterFileName}</p>
                </div>
              )}
              {workHistory.length > 0 && <div className="bg-gray-50 rounded-xl p-4"><h3 className="font-semibold text-gray-800 mb-3">Work History</h3><div className="space-y-2">{workHistory.map((w, i) => <div key={i}><p className="font-medium text-gray-800">{w.title} at {w.company}</p><p className="text-gray-500 text-xs">{w.startDate} – {w.isCurrent ? "Present" : w.endDate}</p></div>)}</div></div>}
              {education.length > 0 && <div className="bg-gray-50 rounded-xl p-4"><h3 className="font-semibold text-gray-800 mb-3">Education</h3><div className="space-y-2">{education.map((e, i) => <div key={i}><p className="font-medium text-gray-800">{e.degree} {e.fieldOfStudy && `in ${e.fieldOfStudy}`}</p><p className="text-gray-500 text-xs">{e.institution} · {e.startYear}–{e.endYear}</p></div>)}</div></div>}
              {coverLetter && <div className="bg-gray-50 rounded-xl p-4"><h3 className="font-semibold text-gray-800 mb-2">Cover Letter</h3><p className="text-gray-600 whitespace-pre-line line-clamp-4">{coverLetter}</p></div>}
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-yellow-800 text-xs">By submitting, you confirm all information is accurate. A confirmation will be sent to <strong>{email}</strong>.</div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
            <button onClick={handleBack} disabled={step === 1} className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">← Back</button>
            {!isLastStep ? (
              <button onClick={handleNext} disabled={isSaving} className="px-6 py-2.5 bg-[#0fc0df] text-white rounded-lg text-sm font-semibold hover:bg-[#0aabca] disabled:opacity-50">
                {isSaving ? "Saving..." : "Next →"}
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={submitApplication.isPending || !firstName || !lastName} className="px-6 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                {submitApplication.isPending ? "Submitting..." : "Submit Application ✓"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
