/**
 * JobBoardAdminPage — /job-board (admin only)
 *
 * Tabs:
 *   - Job Postings: create, edit, toggle active, delete
 *   - Applications: list with status, completion %, AI insight badge
 *   - Applicant Detail: full profile, work history, education, AI insight, status management
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  submitted: "bg-blue-100 text-blue-700",
  reviewing: "bg-purple-100 text-purple-700",
  interviewing: "bg-indigo-100 text-indigo-700",
  offered: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-gray-100 text-gray-500",
};

const STATUS_OPTIONS = ["submitted", "reviewing", "interviewing", "offered", "rejected", "withdrawn"];
const EMPLOYMENT_LABELS: Record<string, string> = { full_time: "Full-Time", part_time: "Part-Time", contract: "Contract", internship: "Internship" };

function Badge({ status }: { status: string }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600"}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 16, c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="relative w-10 h-10 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="40" height="40">
        <circle cx="20" cy="20" r={r} fill="none" stroke="#e5e7eb" strokeWidth="3" />
        <circle cx="20" cy="20" r={r} fill="none" stroke="#0fc0df" strokeWidth="3" strokeDasharray={`${dash} ${c}`} strokeLinecap="round" />
      </svg>
      <span className="text-[10px] font-bold text-gray-700 z-10">{pct}%</span>
    </div>
  );
}

// ─── Job Form ─────────────────────────────────────────────────────────────────

function JobForm({ job, onSave, onCancel }: { job?: any; onSave: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState(job?.title ?? "");
  const [department, setDepartment] = useState(job?.department ?? "");
  const [location, setLocation] = useState(job?.location ?? "");
  const [employmentType, setEmploymentType] = useState(job?.employmentType ?? "full_time");
  const [description, setDescription] = useState(job?.description ?? "");
  const [requirements, setRequirements] = useState(job?.requirements ?? "");
  const [salaryRange, setSalaryRange] = useState(job?.salaryRange ?? "");
  const [isActive, setIsActive] = useState(job?.isActive ?? true);

  const createJob = trpc.jobBoard.createJob.useMutation({ onSuccess: () => { toast.success("Job created"); onSave(); }, onError: e => toast.error(e.message) });
  const updateJob = trpc.jobBoard.updateJob.useMutation({ onSuccess: () => { toast.success("Job updated"); onSave(); }, onError: e => toast.error(e.message) });

  function handleSave() {
    if (!title.trim() || !description.trim()) { toast.error("Title and description are required"); return; }
    const data = { title, department: department || undefined, location: location || undefined, employmentType: employmentType as any, description, requirements: requirements || undefined, salaryRange: salaryRange || undefined, isActive };
    if (job) updateJob.mutate({ id: job.id, ...data });
    else createJob.mutate(data);
  }

  const isPending = createJob.isPending || updateJob.isPending;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Job Title *</label><input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" /></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Department</label><input type="text" value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. Operations" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" /></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Location</label><input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Remote, Austin TX" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" /></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
          <select value={employmentType} onChange={e => setEmploymentType(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]">
            {Object.entries(EMPLOYMENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Salary Range</label><input type="text" value={salaryRange} onChange={e => setSalaryRange(e.target.value)} placeholder="e.g. $50,000–$70,000" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" /></div>
      </div>
      <div><label className="block text-sm font-medium text-gray-700 mb-1">Description *</label><textarea value={description} rows={5} onChange={e => setDescription(e.target.value)} placeholder="Describe the role, responsibilities, and what success looks like..." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df] resize-none" /></div>
      <div><label className="block text-sm font-medium text-gray-700 mb-1">Requirements</label><textarea value={requirements} rows={4} onChange={e => setRequirements(e.target.value)} placeholder="List required qualifications, skills, and experience..." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df] resize-none" /></div>
      <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} /><span className="text-sm text-gray-700">Active (visible on public careers page)</span></label>
      <div className="flex gap-3 pt-2">
        <button onClick={handleSave} disabled={isPending} className="px-5 py-2 bg-[#0fc0df] text-white rounded-lg text-sm font-semibold hover:bg-[#0aabca] disabled:opacity-50">{isPending ? "Saving..." : job ? "Save Changes" : "Create Job"}</button>
        <button onClick={onCancel} className="px-5 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  );
}

// ─── Custom Questions Manager ─────────────────────────────────────────────────

function CustomQuestionsPanel({ jobId }: { jobId: number }) {
  const utils = trpc.useUtils();
  const { data: questions = [] } = trpc.jobBoard.listCustomQuestions.useQuery({ jobPostingId: jobId });
  const upsert = trpc.jobBoard.upsertCustomQuestion.useMutation({ onSuccess: () => { utils.jobBoard.listCustomQuestions.invalidate(); toast.success("Question saved"); } });
  const del = trpc.jobBoard.deleteCustomQuestion.useMutation({ onSuccess: () => { utils.jobBoard.listCustomQuestions.invalidate(); toast.success("Question deleted"); } });

  const [adding, setAdding] = useState(false);
  const [newQ, setNewQ] = useState({ questionText: "", questionType: "textarea" as any, isRequired: false });

  return (
    <div className="mt-6 border-t border-gray-100 pt-6">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">Custom Application Questions</h3>
      <div className="space-y-3 mb-4">
        {(questions as any[]).map((q: any) => (
          <div key={q.id} className="flex items-start justify-between gap-3 bg-gray-50 rounded-lg p-3">
            <div>
              <p className="text-sm text-gray-800">{q.questionText}</p>
              <div className="flex gap-2 mt-1">
                <span className="text-xs text-gray-400 capitalize">{q.questionType.replace("_", " ")}</span>
                {q.isRequired && <span className="text-xs text-red-500">Required</span>}
              </div>
            </div>
            <button onClick={() => del.mutate({ id: q.id })} className="text-red-400 hover:text-red-600 text-xs shrink-0">Delete</button>
          </div>
        ))}
        {(questions as any[]).length === 0 && <p className="text-xs text-gray-400">No custom questions yet.</p>}
      </div>
      {adding ? (
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Question Text</label><input type="text" value={newQ.questionText} onChange={e => setNewQ(q => ({ ...q, questionText: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Question Type</label>
              <select value={newQ.questionType} onChange={e => setNewQ(q => ({ ...q, questionType: e.target.value as any }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]">
                <option value="textarea">Long Text</option>
                <option value="text">Short Text</option>
                <option value="yes_no">Yes / No</option>
                <option value="multiple_choice">Multiple Choice</option>
                <option value="rating">Rating (1–5)</option>
              </select>
            </div>
            <div className="flex items-end pb-1"><label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700"><input type="checkbox" checked={newQ.isRequired} onChange={e => setNewQ(q => ({ ...q, isRequired: e.target.checked }))} />Required</label></div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { upsert.mutate({ jobPostingId: jobId, ...newQ, sortOrder: (questions as any[]).length }); setNewQ({ questionText: "", questionType: "textarea", isRequired: false }); setAdding(false); }} disabled={!newQ.questionText || upsert.isPending} className="px-4 py-2 bg-[#0fc0df] text-white rounded-lg text-sm font-semibold hover:bg-[#0aabca] disabled:opacity-50">Add Question</button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="text-sm text-[#0fc0df] hover:underline">+ Add Question</button>
      )}
    </div>
  );
}

// ─── Applicant Detail ─────────────────────────────────────────────────────────

function ApplicantDetail({ appId, onBack }: { appId: number; onBack: () => void }) {
  const utils = trpc.useUtils();
  const { data: app, isLoading } = trpc.jobBoard.getApplicationDetail.useQuery({ id: appId });
  const updateStatus = trpc.jobBoard.updateApplicationStatus.useMutation({ onSuccess: () => { utils.jobBoard.getApplicationDetail.invalidate(); utils.jobBoard.listApplications.invalidate(); toast.success("Updated"); } });
  const generateInsight = trpc.jobBoard.generateAiInsight.useMutation({ onSuccess: () => { utils.jobBoard.getApplicationDetail.invalidate(); toast.success("AI insight generated"); } });
  const createAssessment = trpc.talentProfile.createSession.useMutation({ onSuccess: (data: any) => { toast.success("Assessment link copied to clipboard!"); navigator.clipboard.writeText(data.assessmentLink).catch(() => {}); } });

  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState("");

  if (isLoading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-[#0fc0df] border-t-transparent rounded-full animate-spin" /></div>;
  if (!app) return <div className="text-center py-20 text-gray-400">Applicant not found.</div>;

  const a = app as any;
  const customAnswers = a.customAnswers ? (() => { try { return JSON.parse(a.customAnswers); } catch { return {}; } })() : {};

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-600">← Back to applicants</button>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{a.firstName} {a.lastName}</h2>
            <p className="text-gray-500 text-sm mt-0.5">{a.email} {a.phone && `· ${a.phone}`}</p>
            {(a.city || a.state) && <p className="text-gray-400 text-sm">{[a.city, a.state].filter(Boolean).join(", ")}</p>}
            <div className="flex flex-wrap gap-2 mt-2">
              {a.linkedinUrl && <a href={a.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#0fc0df] underline">LinkedIn</a>}
              {a.portfolioUrl && <a href={a.portfolioUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#0fc0df] underline">Portfolio</a>}
              {a.resumeUrl && <a href={a.resumeUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#0fc0df] underline">📄 Resume</a>}
              {a.resumeLinkUrl && <a href={a.resumeLinkUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#0fc0df] underline">📄 Resume Link</a>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-2">
              <ProgressRing pct={a.completionPct ?? 0} />
              <Badge status={a.status} />
            </div>
            <div className="flex gap-2">
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={() => updateStatus.mutate({ id: a.id, rating: n })}
                  className={`text-lg transition-colors ${(a.rating ?? 0) >= n ? "text-yellow-400" : "text-gray-200 hover:text-yellow-300"}`}>★</button>
              ))}
            </div>
          </div>
        </div>

        {/* Status pipeline */}
        <div className="mt-6 pt-4 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 mb-2">Move to stage:</p>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map(s => (
              <button key={s} onClick={() => updateStatus.mutate({ id: a.id, status: s as any })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${a.status === s ? "bg-[#0fc0df] text-white border-[#0fc0df]" : "bg-white text-gray-600 border-gray-300 hover:border-[#0fc0df] hover:text-[#0fc0df]"}`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* AI Insight */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">🤖 AI Insight</h3>
          <button onClick={() => generateInsight.mutate({ id: a.id })} disabled={generateInsight.isPending}
            className="px-4 py-1.5 bg-[#0fc0df] text-white rounded-lg text-xs font-semibold hover:bg-[#0aabca] disabled:opacity-50">
            {generateInsight.isPending ? "Generating..." : a.aiInsight ? "Regenerate" : "Generate Insight"}
          </button>
        </div>
        {a.aiInsight ? (
          <div>
            <p className="text-sm text-gray-700 leading-relaxed">{a.aiInsight}</p>
            {a.aiInsightGeneratedAt && <p className="text-xs text-gray-400 mt-2">Generated {new Date(a.aiInsightGeneratedAt).toLocaleDateString()}</p>}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">No AI insight yet. Click "Generate Insight" to analyze this applicant.</p>
        )}
      </div>

      {/* Talent Profile Assessment */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">🧠 Talent Profile Assessment</h3>
            <p className="text-xs text-gray-500 mt-0.5">Workstyle personality assessment — send a link to the candidate</p>
          </div>
          <button
            onClick={() => createAssessment.mutate({ candidateEmail: a.email, candidateName: `${a.firstName} ${a.lastName}`, jobPostingId: a.jobPostingId })}
            disabled={createAssessment.isPending}
            className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors"
          >
            {createAssessment.isPending ? "Creating..." : "Send Assessment Link"}
          </button>
        </div>
        {createAssessment.data ? (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <p className="text-xs font-medium text-purple-900 mb-1">Assessment link created and copied to clipboard:</p>
            <p className="text-xs font-mono text-purple-700 break-all">{(createAssessment.data as any).assessmentLink}</p>
            <p className="text-xs text-purple-600 mt-1">Share this link with the candidate. They can complete the assessment without logging in.</p>
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">No assessment sent yet. Click "Send Assessment Link" to generate a unique link for this candidate.</p>
        )}
        <div className="mt-3 text-right">
          <a href="/talent-profile-admin" className="text-xs text-purple-600 hover:underline">View all assessment results →</a>
        </div>
      </div>

      {/* Application details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Work History */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Work History</h3>
          {(a.workHistory ?? []).length === 0 ? <p className="text-sm text-gray-400 italic">Not provided</p> : (
            <div className="space-y-4">
              {(a.workHistory as any[]).map((w: any, i: number) => (
                <div key={i} className="border-l-2 border-[#0fc0df]/30 pl-3">
                  <p className="font-medium text-gray-800 text-sm">{w.title}</p>
                  <p className="text-gray-600 text-sm">{w.company}</p>
                  <p className="text-gray-400 text-xs">{w.startDate} – {w.isCurrent ? "Present" : w.endDate}</p>
                  {w.description && <p className="text-gray-500 text-xs mt-1 line-clamp-2">{w.description}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Education */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Education</h3>
          {(a.education ?? []).length === 0 ? <p className="text-sm text-gray-400 italic">Not provided</p> : (
            <div className="space-y-4">
              {(a.education as any[]).map((e: any, i: number) => (
                <div key={i} className="border-l-2 border-[#0fc0df]/30 pl-3">
                  <p className="font-medium text-gray-800 text-sm">{e.degree} {e.fieldOfStudy && `in ${e.fieldOfStudy}`}</p>
                  <p className="text-gray-600 text-sm">{e.institution}</p>
                  <p className="text-gray-400 text-xs">{e.startYear} – {e.endYear}{e.gpa && ` · GPA: ${e.gpa}`}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cover Letter & Details */}
      {(a.coverLetter || a.whyInterested || a.salaryExpectation || a.availableStartDate) && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Cover Letter & Details</h3>
          <div className="space-y-4 text-sm">
            {a.coverLetter && <div><p className="text-xs font-medium text-gray-500 mb-1">Cover Letter</p><p className="text-gray-700 whitespace-pre-line">{a.coverLetter}</p></div>}
            {a.whyInterested && <div><p className="text-xs font-medium text-gray-500 mb-1">Why Interested</p><p className="text-gray-700 whitespace-pre-line">{a.whyInterested}</p></div>}
            <div className="flex gap-6">
              {a.salaryExpectation && <div><p className="text-xs font-medium text-gray-500">Salary Expectation</p><p className="text-gray-700">{a.salaryExpectation}</p></div>}
              {a.availableStartDate && <div><p className="text-xs font-medium text-gray-500">Available</p><p className="text-gray-700">{a.availableStartDate}</p></div>}
            </div>
          </div>
        </div>
      )}

      {/* Custom Question Answers */}
      {(a.customQuestions ?? []).length > 0 && Object.keys(customAnswers).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Custom Question Responses</h3>
          <div className="space-y-4">
            {(a.customQuestions as any[]).map((q: any) => (
              <div key={q.id}>
                <p className="text-xs font-medium text-gray-500 mb-1">{q.questionText}</p>
                <p className="text-sm text-gray-700">{customAnswers[String(q.id)] ?? <span className="italic text-gray-400">No answer</span>}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Admin Notes */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Admin Notes</h3>
          {!editingNotes && <button onClick={() => { setNotes(a.adminNotes ?? ""); setEditingNotes(true); }} className="text-xs text-[#0fc0df] hover:underline">Edit</button>}
        </div>
        {editingNotes ? (
          <div className="space-y-3">
            <textarea value={notes} rows={4} onChange={e => setNotes(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df] resize-none" placeholder="Internal notes about this applicant..." />
            <div className="flex gap-2">
              <button onClick={() => { updateStatus.mutate({ id: a.id, adminNotes: notes }); setEditingNotes(false); }} className="px-4 py-2 bg-[#0fc0df] text-white rounded-lg text-sm font-semibold hover:bg-[#0aabca]">Save Notes</button>
              <button onClick={() => setEditingNotes(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-600 whitespace-pre-line">{a.adminNotes || <span className="italic text-gray-400">No notes yet.</span>}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function JobBoardAdminPage() {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<"jobs" | "applications">("jobs");
  const [editingJob, setEditingJob] = useState<any | null>(null);
  const [creatingJob, setCreatingJob] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [filterJobId, setFilterJobId] = useState<number | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);

  const { data: jobs = [], isLoading: jobsLoading } = trpc.jobBoard.listJobs.useQuery();
  const { data: applications = [], isLoading: appsLoading } = trpc.jobBoard.listApplications.useQuery({ jobPostingId: filterJobId, status: filterStatus });
  const deleteJob = trpc.jobBoard.deleteJob.useMutation({ onSuccess: () => { utils.jobBoard.listJobs.invalidate(); toast.success("Job deleted"); } });
  const updateJob = trpc.jobBoard.updateJob.useMutation({ onSuccess: () => { utils.jobBoard.listJobs.invalidate(); } });

  if (selectedAppId) return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <ApplicantDetail appId={selectedAppId} onBack={() => setSelectedAppId(null)} />
    </div>
  );

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Job Board</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage job postings and review applications</p>
        </div>
        <a href="/careers" target="_blank" rel="noopener noreferrer"
          className="px-4 py-2 border border-[#0fc0df] text-[#0fc0df] rounded-lg text-sm font-semibold hover:bg-[#0fc0df]/5 transition-colors">
          View Public Page ↗
        </a>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(["jobs", "applications"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            {t === "jobs" ? `Job Postings (${(jobs as any[]).length})` : `Applications (${(applications as any[]).length})`}
          </button>
        ))}
      </div>

      {/* ── JOBS TAB ─────────────────────────────────────────────────────────── */}
      {tab === "jobs" && (
        <div className="space-y-4">
          {!creatingJob && !editingJob && (
            <button onClick={() => setCreatingJob(true)} className="px-5 py-2.5 bg-[#0fc0df] text-white rounded-lg text-sm font-semibold hover:bg-[#0aabca] transition-colors">+ New Job Posting</button>
          )}

          {creatingJob && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Create New Job Posting</h3>
              <JobForm onSave={() => { setCreatingJob(false); utils.jobBoard.listJobs.invalidate(); }} onCancel={() => setCreatingJob(false)} />
            </div>
          )}

          {jobsLoading ? (
            <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-[#0fc0df] border-t-transparent rounded-full animate-spin" /></div>
          ) : (jobs as any[]).length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
              <p className="text-gray-500">No job postings yet. Create your first one above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(jobs as any[]).map((job: any) => (
                <div key={job.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="p-5 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900">{job.title}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${job.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{job.isActive ? "Active" : "Hidden"}</span>
                        {job.employmentType && <span className="text-xs text-gray-400">{EMPLOYMENT_LABELS[job.employmentType]}</span>}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-gray-400 mt-1">
                        {job.department && <span>📁 {job.department}</span>}
                        {job.location && <span>📍 {job.location}</span>}
                        {job.salaryRange && <span>💰 {job.salaryRange}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => updateJob.mutate({ id: job.id, title: job.title, description: job.description, isActive: !job.isActive, employmentType: job.employmentType, department: job.department, location: job.location, requirements: job.requirements, salaryRange: job.salaryRange, sortOrder: job.sortOrder })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${job.isActive ? "border-gray-300 text-gray-600 hover:bg-gray-50" : "border-green-300 text-green-600 hover:bg-green-50"}`}>
                        {job.isActive ? "Deactivate" : "Activate"}
                      </button>
                      <button onClick={() => { setEditingJob(job); setExpandedJobId(job.id); }} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50">Edit</button>
                      <button onClick={() => { setTab("applications"); setFilterJobId(job.id); }} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[#0fc0df]/30 text-[#0fc0df] hover:bg-[#0fc0df]/5">Applications</button>
                      <button onClick={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)} className="text-gray-400 hover:text-gray-600 text-lg">{expandedJobId === job.id ? "▲" : "▼"}</button>
                    </div>
                  </div>

                  {expandedJobId === job.id && (
                    <div className="border-t border-gray-100 p-5">
                      {editingJob?.id === job.id ? (
                        <JobForm job={job} onSave={() => { setEditingJob(null); utils.jobBoard.listJobs.invalidate(); }} onCancel={() => setEditingJob(null)} />
                      ) : (
                        <div className="text-sm text-gray-600 space-y-3">
                          <div><p className="text-xs font-medium text-gray-500 mb-1">Description</p><p className="whitespace-pre-line">{job.description}</p></div>
                          {job.requirements && <div><p className="text-xs font-medium text-gray-500 mb-1">Requirements</p><p className="whitespace-pre-line">{job.requirements}</p></div>}
                        </div>
                      )}
                      <CustomQuestionsPanel jobId={job.id} />
                      {!editingJob && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <button onClick={() => { if (confirm("Delete this job posting? This cannot be undone.")) deleteJob.mutate({ id: job.id }); }} className="text-xs text-red-400 hover:text-red-600">Delete Job Posting</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── APPLICATIONS TAB ─────────────────────────────────────────────────── */}
      {tab === "applications" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <select value={filterJobId ?? ""} onChange={e => setFilterJobId(e.target.value ? Number(e.target.value) : undefined)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]">
              <option value="">All Jobs</option>
              {(jobs as any[]).map((j: any) => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
            <select value={filterStatus ?? ""} onChange={e => setFilterStatus(e.target.value || undefined)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc0df]">
              <option value="">All Statuses</option>
              {["draft", ...STATUS_OPTIONS].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            {(filterJobId || filterStatus) && <button onClick={() => { setFilterJobId(undefined); setFilterStatus(undefined); }} className="text-sm text-gray-400 hover:text-gray-600">Clear filters</button>}
          </div>

          {appsLoading ? (
            <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-[#0fc0df] border-t-transparent rounded-full animate-spin" /></div>
          ) : (applications as any[]).length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
              <p className="text-gray-500">No applications yet.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Applicant</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Position</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Progress</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">AI</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Applied</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(applications as any[]).map((row: any) => {
                    const app = row.application;
                    return (
                      <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{app.firstName ?? ""} {app.lastName ?? ""}</p>
                          <p className="text-xs text-gray-400">{app.email}</p>
                          {(app.rating ?? 0) > 0 && <p className="text-xs text-yellow-400">{"★".repeat(app.rating)}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-gray-700">{row.jobTitle ?? "—"}</p>
                          {row.jobDepartment && <p className="text-xs text-gray-400">{row.jobDepartment}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div className="h-full bg-[#0fc0df] rounded-full" style={{ width: `${app.completionPct ?? 0}%` }} />
                            </div>
                            <span className="text-xs text-gray-500">{app.completionPct ?? 0}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3"><Badge status={app.status} /></td>
                        <td className="px-4 py-3">
                          {app.aiInsight ? (
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">✓ Insight</span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {app.submittedAt ? new Date(app.submittedAt).toLocaleDateString() : app.isDraft ? "Draft" : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => setSelectedAppId(app.id)} className="text-xs text-[#0fc0df] hover:underline font-medium">View →</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
