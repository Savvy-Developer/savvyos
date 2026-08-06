/**
 * Savvy Talent Profile — Admin Page
 * Tabs: Results, Role Profiles, Item Bank, Audit Log
 */
import { useState } from "react";
import { trpc } from "../lib/trpc";

type AdminTab = "results" | "detail" | "role_profiles" | "role_profile_editor" | "item_bank" | "audit";

const DIMENSION_LABELS: Record<string, string> = {
  leadership_drive: "Leadership Drive",
  social_expression: "Social Expression",
  operating_tempo: "Operating Tempo",
  execution_structure: "Execution Structure",
  evidence_orientation: "Evidence Orientation",
  change_experimentation: "Change & Experimentation",
  pressure_stability: "Pressure Stability",
  interpersonal_approach: "Interpersonal Approach",
};

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-600",
  in_progress: "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
  expired: "bg-red-100 text-red-700",
};

export default function TalentProfileAdminPage() {
  const [tab, setTab] = useState<AdminTab>("results");
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [selectedRoleProfileId, setSelectedRoleProfileId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [sendLinkEmail, setSendLinkEmail] = useState("");
  const [sendLinkName, setSendLinkName] = useState("");
  const [sendLinkJobId, setSendLinkJobId] = useState("");
  const [sendLinkResult, setSendLinkResult] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState<string | null>(null);
  const [reportContent, setReportContent] = useState<Record<string, string>>({});
  const [roleProfileForm, setRoleProfileForm] = useState<any>({ title: "", department: "", status: "draft", dimensionRanges: [] });
  const [aiDraftLoading, setAiDraftLoading] = useState(false);
  const [aiDraftResult, setAiDraftResult] = useState<any>(null);

  const utils = trpc.useContext();

  const { data: sessions, isLoading: sessionsLoading } = trpc.talentProfile.listSessions.useQuery({
    status: filterStatus || undefined,
    limit: 100,
  });

  const { data: sessionDetail } = trpc.talentProfile.getSessionAdmin.useQuery(
    { sessionId: selectedSessionId! },
    { enabled: !!selectedSessionId && tab === "detail" }
  );

  const { data: roleProfiles } = trpc.talentProfile.listRoleProfiles.useQuery(undefined, { enabled: tab === "role_profiles" || tab === "role_profile_editor" });

  const { data: roleProfileDetail } = trpc.talentProfile.getRoleProfile.useQuery(
    { id: selectedRoleProfileId! },
    { enabled: !!selectedRoleProfileId && tab === "role_profile_editor" }
  );

  const { data: itemBank } = trpc.talentProfile.listItems.useQuery({}, { enabled: tab === "item_bank" });
  const { data: auditLog } = trpc.talentProfile.getAuditLog.useQuery({ limit: 100 }, { enabled: tab === "audit" });

  const createSessionMutation = trpc.talentProfile.createSession.useMutation();
  const generateReportMutation = trpc.talentProfile.generateReport.useMutation();
  const upsertRoleProfileMutation = trpc.talentProfile.upsertRoleProfile.useMutation();
  const aiDraftMutation = trpc.talentProfile.aiDraftRoleProfile.useMutation();
  const updateItemStatusMutation = trpc.talentProfile.updateItemStatus.useMutation();

  const handleSendLink = async () => {
    if (!sendLinkEmail) return;
    try {
      const result = await createSessionMutation.mutateAsync({
        candidateEmail: sendLinkEmail,
        candidateName: sendLinkName || undefined,
        jobPostingId: sendLinkJobId ? parseInt(sendLinkJobId) : undefined,
      });
      setSendLinkResult(result.assessmentLink);
      setSendLinkEmail("");
      setSendLinkName("");
      setSendLinkJobId("");
      utils.talentProfile.listSessions.invalidate();
    } catch (e: any) {
      setSendLinkResult(`Error: ${e.message}`);
    }
  };

  const handleGenerateReport = async (sessionId: number, reportType: "candidate" | "hiring" | "manager") => {
    const key = `${sessionId}_${reportType}`;
    setGeneratingReport(key);
    try {
      const result = await generateReportMutation.mutateAsync({ sessionId, reportType });
      setReportContent(prev => ({ ...prev, [key]: result.narrative }));
    } catch (e: any) {
      setReportContent(prev => ({ ...prev, [key]: `Error: ${e.message}` }));
    } finally {
      setGeneratingReport(null);
    }
  };

  const handleAiDraftRoleProfile = async () => {
    if (!roleProfileForm.jobDescription || !roleProfileForm.title) return;
    setAiDraftLoading(true);
    try {
      const result = await aiDraftMutation.mutateAsync({ jobDescription: roleProfileForm.jobDescription, title: roleProfileForm.title });
      setAiDraftResult(result.draft);
      if (result.draft.dimensionRanges) {
        setRoleProfileForm((prev: any) => ({ ...prev, dimensionRanges: result.draft.dimensionRanges }));
      }
    } catch {}
    setAiDraftLoading(false);
  };

  const handleSaveRoleProfile = async () => {
    try {
      await upsertRoleProfileMutation.mutateAsync({
        id: selectedRoleProfileId ?? undefined,
        ...roleProfileForm,
      });
      utils.talentProfile.listRoleProfiles.invalidate();
      setTab("role_profiles");
    } catch {}
  };

  const tabs = [
    { id: "results", label: "Assessment Results" },
    { id: "role_profiles", label: "Role Profiles" },
    { id: "item_bank", label: "Item Bank" },
    { id: "audit", label: "Audit Log" },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Savvy Talent Profile</h1>
        <p className="text-gray-500 text-sm mt-1">Workstyle assessment management — results, role profiles, and item bank</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as AdminTab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id || (tab === "detail" && t.id === "results") || (tab === "role_profile_editor" && t.id === "role_profiles")
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Results Tab ──────────────────────────────────────────────────────── */}
      {(tab === "results") && (
        <div className="space-y-6">
          {/* Send Assessment Link */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Send Assessment Link</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                type="email"
                placeholder="Candidate email *"
                value={sendLinkEmail}
                onChange={e => setSendLinkEmail(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Candidate name (optional)"
                value={sendLinkName}
                onChange={e => setSendLinkName(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="number"
                placeholder="Job posting ID (optional)"
                value={sendLinkJobId}
                onChange={e => setSendLinkJobId(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSendLink}
                disabled={!sendLinkEmail || createSessionMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm disabled:opacity-50 transition-colors"
              >
                {createSessionMutation.isPending ? "Creating..." : "Generate Link"}
              </button>
            </div>
            {sendLinkResult && (
              <div className={`mt-3 p-3 rounded-lg text-sm ${sendLinkResult.startsWith("Error") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}>
                {sendLinkResult.startsWith("Error") ? sendLinkResult : (
                  <div>
                    <strong>Assessment link created:</strong>
                    <div className="mt-1 font-mono text-xs break-all bg-white border border-green-200 rounded p-2">{sendLinkResult}</div>
                    <button onClick={() => navigator.clipboard.writeText(sendLinkResult)} className="mt-1 text-green-700 underline text-xs">Copy link</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Filter */}
          <div className="flex items-center gap-3">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All statuses</option>
              <option value="not_started">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="expired">Expired</option>
            </select>
            <span className="text-sm text-gray-500">{sessions?.total ?? 0} sessions</span>
          </div>

          {/* Sessions table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Candidate</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Top Strengths</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Confidence</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Completed</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessionsLoading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
                ) : (sessions?.sessions as any[])?.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No assessment sessions yet. Send a link above to get started.</td></tr>
                ) : (
                  ((sessions?.sessions as any[]) ?? []).map((s: any) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{s.candidateName ?? "—"}</div>
                        <div className="text-gray-500 text-xs">{s.candidateEmail}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[s.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {s.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs max-w-xs truncate">{s.topStrengths ?? "—"}</td>
                      <td className="px-4 py-3">
                        {s.confidenceLabel ? (
                          <span className={`text-xs font-medium ${
                            s.confidenceLabel === "Sufficient Evidence" ? "text-green-600" :
                            s.confidenceLabel === "Interpret with Context" ? "text-amber-600" :
                            "text-red-600"
                          }`}>{s.confidenceLabel}</span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {s.completedAt ? new Date(s.completedAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {s.status === "completed" && (
                          <button
                            onClick={() => { setSelectedSessionId(s.id); setTab("detail"); }}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                          >
                            View Results →
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Session Detail Tab ───────────────────────────────────────────────── */}
      {tab === "detail" && sessionDetail && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setTab("results")} className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1">
              ← Back to Results
            </button>
          </div>

          {/* Candidate header */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{sessionDetail.session.candidateName ?? "Unnamed Candidate"}</h2>
                <p className="text-gray-500">{sessionDetail.session.candidateEmail}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[sessionDetail.session.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {sessionDetail.session.status.replace("_", " ")}
                  </span>
                  {sessionDetail.confidence && (
                    <span className={`text-xs font-medium ${
                      sessionDetail.confidence.label === "Sufficient Evidence" ? "text-green-600" :
                      sessionDetail.confidence.label === "Interpret with Context" ? "text-amber-600" :
                      "text-red-600"
                    }`}>
                      {sessionDetail.confidence.label} ({Math.round((sessionDetail.confidence.completionRate ?? 0) * 100)}% complete)
                    </span>
                  )}
                </div>
              </div>
              {sessionDetail.session.completedAt && (
                <div className="text-right text-sm text-gray-500">
                  <div>Completed</div>
                  <div className="font-medium text-gray-700">{new Date(sessionDetail.session.completedAt).toLocaleDateString()}</div>
                </div>
              )}
            </div>
          </div>

          {/* Dimension Scores */}
          {Object.keys(sessionDetail.dimensions).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-5">Dimension Scores</h3>
              <div className="space-y-4">
                {Object.entries(sessionDetail.dimensions).map(([dimId, dim]: [string, any]) => (
                  <div key={dimId}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 text-sm">{dim.label}</span>
                        <span className="text-xs text-blue-600 font-medium">{dim.band}</span>
                      </div>
                      <span className="text-sm font-bold text-gray-700">{dim.scaledScore}/100</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${dim.scaledScore}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                      <span>{dim.description?.low?.substring(0, 40)}...</span>
                      <span className="text-right">{dim.description?.high?.substring(0, 40)}...</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Strengths */}
          {sessionDetail.topStrengths.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Work Strengths</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sessionDetail.topStrengths.map((s: any, i: number) => (
                  <div key={s.id} className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-6 h-6 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center font-bold">{i + 1}</span>
                      <span className="font-semibold text-gray-900 text-sm">{s.name}</span>
                      <span className="text-xs text-gray-500 ml-auto">{s.score}/100</span>
                    </div>
                    <p className="text-xs text-gray-600">{s.description}</p>
                    <p className="text-xs text-amber-600 mt-1 italic">Overuse risk: {s.overuseRisk}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Motivators */}
          {sessionDetail.motivators.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Motivator Rankings</h3>
              <div className="space-y-2">
                {sessionDetail.motivators.slice(0, 5).map((m: any) => (
                  <div key={m.motivator} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className="w-6 h-6 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center font-bold flex-shrink-0">{m.rank}</span>
                    <div>
                      <div className="font-medium text-gray-900 text-sm">{m.label}</div>
                      <div className="text-xs text-green-700">✓ {m.engagementCondition}</div>
                      <div className="text-xs text-red-600">✗ {m.drainer}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Strengths Under Pressure */}
          {sessionDetail.pressurePatterns.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Strengths Under Pressure</h3>
              <p className="text-xs text-gray-500 mb-4">Hypothetical overuse patterns — for interview exploration only, not selection criteria.</p>
              <div className="space-y-4">
                {sessionDetail.pressurePatterns.map((p: any) => (
                  <div key={p.id} className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-amber-900 text-sm">{p.strength}</span>
                      <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">{p.pattern}</span>
                    </div>
                    <p className="text-sm text-amber-800 mb-2">{p.description}</p>
                    <div className="bg-white rounded-lg p-3 border border-amber-200">
                      <p className="text-xs font-medium text-gray-700 mb-1">Suggested interview question:</p>
                      <p className="text-xs text-gray-600 italic">"{p.interviewQuestion}"</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-2"><strong>Management note:</strong> {p.managementNote}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Reports */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">AI-Generated Reports</h3>
            <p className="text-xs text-gray-500 mb-4">Reports are generated on demand using GPT-4o-mini. All AI output is labeled as provisional.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(["candidate", "hiring", "manager"] as const).map(type => {
                const key = `${selectedSessionId}_${type}`;
                const content = reportContent[key];
                const existingReport = (sessionDetail.reports as unknown as any[])?.find((r: any) => r.reportType === type);
                return (
                  <div key={type} className="border border-gray-200 rounded-xl p-4">
                    <h4 className="font-semibold text-gray-900 text-sm mb-1 capitalize">{type === "hiring" ? "Hiring Team" : type === "manager" ? "Manager/Onboarding" : "Candidate"} Report</h4>
                    <p className="text-xs text-gray-500 mb-3">
                      {type === "candidate" ? "Shareable with the candidate" : type === "hiring" ? "Private — hiring team only" : "Post-hire manager guide"}
                    </p>
                    {existingReport && !content && (
                      <p className="text-xs text-green-600 mb-2">✓ Generated {new Date(existingReport.generatedAt).toLocaleDateString()}</p>
                    )}
                    <button
                      onClick={() => handleGenerateReport(selectedSessionId!, type)}
                      disabled={generatingReport === key}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-2 px-3 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {generatingReport === key ? "Generating..." : existingReport ? "Regenerate" : "Generate"}
                    </button>
                    {content && (
                      <div className="mt-3 max-h-64 overflow-y-auto text-xs text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap border border-gray-200">
                        {content}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Disclaimer */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
            <strong>Important:</strong> {sessionDetail.disclaimer}
          </div>
        </div>
      )}

      {/* ── Role Profiles Tab ────────────────────────────────────────────────── */}
      {tab === "role_profiles" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Role Profiles</h2>
            <button
              onClick={() => { setSelectedRoleProfileId(null); setRoleProfileForm({ title: "", department: "", status: "draft", dimensionRanges: [] }); setAiDraftResult(null); setTab("role_profile_editor"); }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              + New Role Profile
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Role Title</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Department</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Version</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {!roleProfiles || (roleProfiles as any[]).length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No role profiles yet. Create one to start comparing candidates.</td></tr>
                ) : (
                  (roleProfiles as any[]).map((rp: any) => (
                    <tr key={rp.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{rp.title}</td>
                      <td className="px-4 py-3 text-gray-500">{rp.department ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${rp.status === "active" ? "bg-green-100 text-green-700" : rp.status === "draft" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600"}`}>
                          {rp.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">v{rp.version}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{new Date(rp.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => { setSelectedRoleProfileId(rp.id); setTab("role_profile_editor"); }}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                        >
                          Edit →
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Role Profile Editor ──────────────────────────────────────────────── */}
      {tab === "role_profile_editor" && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setTab("role_profiles")} className="text-gray-500 hover:text-gray-700 text-sm">← Back to Role Profiles</button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5">{selectedRoleProfileId ? "Edit Role Profile" : "New Role Profile"}</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role Title *</label>
                <input
                  type="text"
                  value={roleProfileForm.title}
                  onChange={e => setRoleProfileForm((p: any) => ({ ...p, title: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., STR Acquisition Agent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <input
                  type="text"
                  value={roleProfileForm.department ?? ""}
                  onChange={e => setRoleProfileForm((p: any) => ({ ...p, department: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Sales"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Description (for AI drafting)</label>
                <textarea
                  value={roleProfileForm.jobDescription ?? ""}
                  onChange={e => setRoleProfileForm((p: any) => ({ ...p, jobDescription: e.target.value }))}
                  rows={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Paste the job description here to let AI draft initial dimension ranges..."
                />
              </div>
            </div>

            <button
              onClick={handleAiDraftRoleProfile}
              disabled={aiDraftLoading || !roleProfileForm.title || !roleProfileForm.jobDescription}
              className="mb-6 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium py-2 px-4 rounded-lg disabled:opacity-50 transition-colors"
            >
              {aiDraftLoading ? "AI Drafting..." : "✨ AI Draft Dimension Ranges"}
            </button>

            {aiDraftResult && (
              <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-xl text-sm">
                <p className="font-medium text-purple-900 mb-2">AI Draft Generated — Review and adjust before saving</p>
                {aiDraftResult.criticalTasks && <p className="text-gray-700 mb-1"><strong>Critical Tasks:</strong> {aiDraftResult.criticalTasks}</p>}
                {aiDraftResult.successProfileNote && <p className="text-gray-700"><strong>Success Profile:</strong> {aiDraftResult.successProfileNote}</p>}
                <p className="text-xs text-purple-700 mt-2">⚠ AI-generated draft for human review only. All ranges must be reviewed before activating.</p>
              </div>
            )}

            {/* Dimension Ranges */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Dimension Ranges</h3>
              <div className="space-y-3">
                {Object.keys(DIMENSION_LABELS).map(dim => {
                  const existing = (roleProfileForm.dimensionRanges ?? []).find((r: any) => r.dimension === dim);
                  return (
                    <div key={dim} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-center p-3 bg-gray-50 rounded-lg">
                      <div className="col-span-2">
                        <span className="text-sm font-medium text-gray-700">{DIMENSION_LABELS[dim]}</span>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Pref Min</label>
                        <input type="number" min="0" max="100" value={existing?.preferredMin ?? ""} onChange={e => {
                          const val = e.target.value ? parseInt(e.target.value) : undefined;
                          setRoleProfileForm((p: any) => {
                            const ranges = [...(p.dimensionRanges ?? [])];
                            const idx = ranges.findIndex((r: any) => r.dimension === dim);
                            if (idx >= 0) ranges[idx] = { ...ranges[idx], preferredMin: val };
                            else ranges.push({ dimension: dim, preferredMin: val, importance: "neutral" });
                            return { ...p, dimensionRanges: ranges };
                          });
                        }} className="w-full border border-gray-300 rounded px-2 py-1 text-xs" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Pref Max</label>
                        <input type="number" min="0" max="100" value={existing?.preferredMax ?? ""} onChange={e => {
                          const val = e.target.value ? parseInt(e.target.value) : undefined;
                          setRoleProfileForm((p: any) => {
                            const ranges = [...(p.dimensionRanges ?? [])];
                            const idx = ranges.findIndex((r: any) => r.dimension === dim);
                            if (idx >= 0) ranges[idx] = { ...ranges[idx], preferredMax: val };
                            else ranges.push({ dimension: dim, preferredMax: val, importance: "neutral" });
                            return { ...p, dimensionRanges: ranges };
                          });
                        }} className="w-full border border-gray-300 rounded px-2 py-1 text-xs" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Importance</label>
                        <select value={existing?.importance ?? "neutral"} onChange={e => {
                          setRoleProfileForm((p: any) => {
                            const ranges = [...(p.dimensionRanges ?? [])];
                            const idx = ranges.findIndex((r: any) => r.dimension === dim);
                            if (idx >= 0) ranges[idx] = { ...ranges[idx], importance: e.target.value };
                            else ranges.push({ dimension: dim, importance: e.target.value });
                            return { ...p, dimensionRanges: ranges };
                          });
                        }} className="w-full border border-gray-300 rounded px-2 py-1 text-xs">
                          <option value="important">Important</option>
                          <option value="useful">Useful</option>
                          <option value="neutral">Neutral</option>
                          <option value="irrelevant">Irrelevant</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Score: {existing?.preferredMin ?? "—"}–{existing?.preferredMax ?? "—"}</label>
                        <div className="w-full bg-gray-200 rounded-full h-2 mt-1 relative">
                          {existing?.preferredMin !== undefined && existing?.preferredMax !== undefined && (
                            <div className="absolute h-2 bg-blue-500 rounded-full" style={{ left: `${existing.preferredMin}%`, width: `${existing.preferredMax - existing.preferredMin}%` }} />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <select
                value={roleProfileForm.status}
                onChange={e => setRoleProfileForm((p: any) => ({ ...p, status: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
              <button
                onClick={handleSaveRoleProfile}
                disabled={upsertRoleProfileMutation.isPending || !roleProfileForm.title}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg text-sm disabled:opacity-50 transition-colors"
              >
                {upsertRoleProfileMutation.isPending ? "Saving..." : "Save Role Profile"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Item Bank Tab ────────────────────────────────────────────────────── */}
      {tab === "item_bank" && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <strong>Item Bank Management:</strong> Retiring an item removes it from future assessments. Completed assessments are not affected. Do not retire items without reviewing impact on scoring balance.
          </div>

          {Object.keys(DIMENSION_LABELS).map(dim => {
            const dimItems = (itemBank as any[] ?? []).filter((i: any) => i.dimension === dim);
            if (dimItems.length === 0) return null;
            return (
              <div key={dim} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 text-sm">{DIMENSION_LABELS[dim]}</h3>
                  <span className="text-xs text-gray-500">{dimItems.filter((i: any) => i.status === "active").length} active items</span>
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {dimItems.map((item: any) => (
                      <tr key={item.id} className={item.status !== "active" ? "opacity-50" : ""}>
                        <td className="px-4 py-3 text-gray-700 max-w-lg">{item.itemText}</td>
                        <td className="px-4 py-3 text-center">
                          {item.isReversed ? <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Reversed</span> : null}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => updateItemStatusMutation.mutate({ id: item.id, status: item.status === "active" ? "retired" : "active" })}
                            className="text-xs text-gray-500 hover:text-gray-700 underline"
                          >
                            {item.status === "active" ? "Retire" : "Restore"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Audit Log Tab ────────────────────────────────────────────────────── */}
      {tab === "audit" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Timestamp</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Object Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Object ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(auditLog as any[] ?? []).map((entry: any) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(entry.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 font-mono text-xs text-blue-700">{entry.action}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{entry.objectType}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs font-mono">{entry.objectId}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{entry.userId ?? "system"}</td>
                </tr>
              ))}
              {(auditLog as any[] ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No audit entries yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
