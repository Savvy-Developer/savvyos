/**
 * Savvy Talent Profile — Candidate-Facing Assessment Page
 * Accessible at /talent-profile?token=...
 * No login required. Fully public.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useSearch } from "wouter";
import { trpc } from "../lib/trpc";

const LIKERT_LABELS = [
  { value: 1, label: "Strongly Disagree" },
  { value: 2, label: "Disagree" },
  { value: 3, label: "Slightly Disagree" },
  { value: 4, label: "Slightly Agree" },
  { value: 5, label: "Agree" },
  { value: 6, label: "Strongly Agree" },
];

const MOTIVATOR_DESCRIPTIONS: Record<string, string> = {
  achievement: "Reaching clear goals and seeing measurable results",
  autonomy: "Having freedom to decide how and when work gets done",
  mastery: "Developing deep expertise and improving continuously",
  recognition: "Having contributions acknowledged and appreciated",
  influence: "Shaping strategy, direction, and key decisions",
  connection: "Building strong relationships and a sense of belonging",
  service: "Helping others and contributing to a meaningful mission",
  stability: "Working in a predictable, secure, and consistent environment",
  creativity: "Generating new ideas and solving problems in original ways",
  purpose: "Doing work that aligns with personal values and feels meaningful",
};

type Section = "welcome" | "consent" | "workstyle" | "motivators" | "complete" | "report";

export default function TalentProfilePage() {
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const token = searchParams.get("token") ?? "";

  const [section, setSection] = useState<Section>("welcome");
  const [responses, setResponses] = useState<Record<number, number>>({});
  const [motivatorRankings, setMotivatorRankings] = useState<Array<{ motivatorId: string; rank: number }>>([]);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedMotivator, setDraggedMotivator] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading, isError } = trpc.talentProfile.getAssessmentItems.useQuery(
    { token },
    { enabled: !!token, retry: 1 }
  );

  const saveAnswersMutation = trpc.talentProfile.saveAnswers.useMutation();
  const saveMotivatorsMutation = trpc.talentProfile.saveMotivatorRankings.useMutation();
  const recordConsentMutation = trpc.talentProfile.recordConsent.useMutation();
  const submitMutation = trpc.talentProfile.submitAssessment.useMutation();

  const { data: resultsData } = trpc.talentProfile.getCandidateResults.useQuery(
    { token },
    { enabled: section === "report" && !!token, retry: 1 }
  );

  // Restore session state
  useEffect(() => {
    if (data?.session) {
      const saved = data.session.responsesJson ?? {};
      const workstyleResponses: Record<number, number> = {};
      for (const [k, v] of Object.entries(saved)) {
        if (k !== "__motivator_rankings") workstyleResponses[parseInt(k)] = v as number;
      }
      if (Object.keys(workstyleResponses).length > 0) setResponses(workstyleResponses);

      if (saved.__motivator_rankings && Array.isArray(saved.__motivator_rankings)) {
        setMotivatorRankings(saved.__motivator_rankings);
      }

      if (data.session.status === "completed") {
        setSection("report");
      } else if (data.session.status === "in_progress") {
        if (data.session.currentSection === "motivators") setSection("motivators");
        else if (data.session.currentSection === "workstyle") setSection("workstyle");
        else setSection("consent");
      }
    }
  }, [data]);

  // Initialize motivator rankings if empty
  useEffect(() => {
    if (data?.motivatorItems && motivatorRankings.length === 0) {
      setMotivatorRankings(
        data.motivatorItems.map((m, i) => ({ motivatorId: m.motivatorId, rank: i + 1 }))
      );
    }
  }, [data?.motivatorItems]);

  // Auto-save debounce
  const scheduleSave = useCallback((newResponses: Record<number, number>) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await saveAnswersMutation.mutateAsync({ token, responses: Object.fromEntries(Object.entries(newResponses).map(([k, v]) => [k, v])), currentSection: "workstyle" });
      } catch {}
    }, 1500);
  }, [token]);

  const handleLikertResponse = (itemId: number, value: number) => {
    const newResponses = { ...responses, [itemId]: value };
    setResponses(newResponses);
    scheduleSave(newResponses);

    // Auto-advance to next item
    const items = data?.workstyleItems ?? [];
    if (currentItemIndex < items.length - 1) {
      setTimeout(() => setCurrentItemIndex(i => i + 1), 300);
    }
  };

  const handleConsent = async () => {
    try {
      await recordConsentMutation.mutateAsync({
        token,
        consentGiven: true,
        consentText: "I understand this assessment measures natural workstyle tendencies. Results are provisional and one input in a broader evaluation process. I consent to my responses being used for hiring consideration.",
      });
      setSection("workstyle");
    } catch (e: any) {
      setError(e.message ?? "Failed to record consent.");
    }
  };

  const handleWorkstyleComplete = async () => {
    setSaving(true);
    try {
      await saveAnswersMutation.mutateAsync({
        token,
        responses: Object.fromEntries(Object.entries(responses).map(([k, v]) => [k, v])),
        currentSection: "motivators",
      });
      setSection("motivators");
    } catch (e: any) {
      setError(e.message ?? "Failed to save responses.");
    } finally {
      setSaving(false);
    }
  };

  const handleMotivatorSave = async () => {
    setSaving(true);
    try {
      await saveMotivatorsMutation.mutateAsync({ token, rankings: motivatorRankings });
    } catch {}
    setSaving(false);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await saveMotivatorsMutation.mutateAsync({ token, rankings: motivatorRankings });
      await submitMutation.mutateAsync({ token });
      setSection("report");
    } catch (e: any) {
      setError(e.message ?? "Failed to submit assessment.");
    } finally {
      setSubmitting(false);
    }
  };

  // Motivator drag-and-drop ranking
  const moveMotivator = (motivatorId: string, direction: "up" | "down") => {
    const sorted = [...motivatorRankings].sort((a, b) => a.rank - b.rank);
    const idx = sorted.findIndex(m => m.motivatorId === motivatorId);
    if (direction === "up" && idx > 0) {
      const newRankings = sorted.map((m, i) => {
        if (i === idx) return { ...m, rank: sorted[idx - 1].rank };
        if (i === idx - 1) return { ...m, rank: sorted[idx].rank };
        return m;
      });
      setMotivatorRankings(newRankings);
    } else if (direction === "down" && idx < sorted.length - 1) {
      const newRankings = sorted.map((m, i) => {
        if (i === idx) return { ...m, rank: sorted[idx + 1].rank };
        if (i === idx + 1) return { ...m, rank: sorted[idx].rank };
        return m;
      });
      setMotivatorRankings(newRankings);
    }
  };

  const workstyleItems = data?.workstyleItems ?? [];
  const answeredCount = workstyleItems.filter(i => responses[i.id] !== undefined).length;
  const totalItems = workstyleItems.length;
  const progressPercent = totalItems > 0 ? Math.round((answeredCount / totalItems) * 100) : 0;

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Link</h1>
          <p className="text-gray-600">This assessment link is missing a token. Please use the link provided in your email.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading your assessment...</p>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8 max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Link Expired or Invalid</h1>
          <p className="text-gray-600">This assessment link may have expired or already been used. Please contact the hiring team for a new link.</p>
        </div>
      </div>
    );
  }

  const candidateName = data.session.candidateName ?? "there";

  // ── Welcome Screen ─────────────────────────────────────────────────────────
  if (section === "welcome") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-blue-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8 md:p-12">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Savvy Talent Profile</h1>
            <p className="text-blue-600 font-medium">Workstyle Assessment</p>
          </div>

          <div className="space-y-4 mb-8">
            <p className="text-gray-700 text-lg">
              Hi {candidateName}! This assessment helps us understand how you naturally approach work — your decision-making style, communication preferences, and what motivates you.
            </p>
            <p className="text-gray-600">
              There are no right or wrong answers. We're looking for an honest picture of how you actually operate, not how you think a "perfect candidate" would respond.
            </p>
          </div>

          <div className="bg-blue-50 rounded-xl p-5 mb-8 space-y-3">
            <h3 className="font-semibold text-blue-900">What to expect:</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="flex items-start gap-2">
                <span className="text-blue-600 font-bold mt-0.5">①</span>
                <div>
                  <div className="font-medium text-gray-800">Workstyle Questions</div>
                  <div className="text-gray-600">{workstyleItems.length} statements, 6-point scale</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-600 font-bold mt-0.5">②</span>
                <div>
                  <div className="font-medium text-gray-800">Motivator Ranking</div>
                  <div className="text-gray-600">Rank 10 motivators by priority</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-600 font-bold mt-0.5">③</span>
                <div>
                  <div className="font-medium text-gray-800">Your Report</div>
                  <div className="text-gray-600">View your results immediately</div>
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-500 pt-1">⏱ Takes approximately 15–20 minutes. Your progress saves automatically.</p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 text-sm text-amber-800">
            <strong>Provisional Notice:</strong> This assessment is in its initial deployment phase. Scoring ranges have not yet been validated against a normative sample. Results should be treated as one perspective — not a definitive characterization.
          </div>

          <button
            onClick={() => setSection("consent")}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-8 rounded-xl text-lg transition-colors"
          >
            Begin Assessment →
          </button>
        </div>
      </div>
    );
  }

  // ── Consent Screen ─────────────────────────────────────────────────────────
  if (section === "consent") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-blue-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8 md:p-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Before You Begin</h2>

          <div className="space-y-4 text-gray-700 mb-8">
            <p>Please read and acknowledge the following before starting your assessment:</p>
            <ul className="space-y-3">
              {[
                "This assessment measures natural workstyle tendencies, not intelligence, skills, or job performance.",
                "Your results will be shared with the hiring team as one input in the evaluation process.",
                "No personality result will be used as a standalone reason to advance or reject your application.",
                "Results are provisional and have not been validated against a normative sample.",
                "You may request to discuss your results with a member of the hiring team.",
                "Your responses will be stored securely and used only for this hiring process.",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-red-700 text-sm">{error}</div>
          )}

          <div className="flex gap-4">
            <button
              onClick={() => setSection("welcome")}
              className="flex-1 border border-gray-300 text-gray-700 font-medium py-3 px-6 rounded-xl hover:bg-gray-50 transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={handleConsent}
              disabled={recordConsentMutation.isPending}
              className="flex-2 flex-grow bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-xl transition-colors disabled:opacity-50"
            >
              {recordConsentMutation.isPending ? "Saving..." : "I Understand — Start Assessment"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Workstyle Questions ────────────────────────────────────────────────────
  if (section === "workstyle") {
    const currentItem = workstyleItems[currentItemIndex];
    const dimInfo = data.dimensions.find(d => d.id === currentItem?.dimension);

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Workstyle Questions</span>
              <span className="text-sm text-gray-500">{answeredCount} of {totalItems} answered</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-8">
          {/* Navigation pills */}
          <div className="flex flex-wrap gap-1 mb-8">
            {workstyleItems.map((item, i) => (
              <button
                key={item.id}
                onClick={() => setCurrentItemIndex(i)}
                className={`w-7 h-7 rounded-full text-xs font-medium transition-colors ${
                  responses[item.id] !== undefined
                    ? "bg-blue-600 text-white"
                    : i === currentItemIndex
                    ? "bg-blue-100 text-blue-700 border-2 border-blue-600"
                    : "bg-gray-200 text-gray-500 hover:bg-gray-300"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          {/* Current item */}
          {currentItem && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6">
              {dimInfo && (
                <div className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-3">
                  {dimInfo.label}
                </div>
              )}
              <h2 className="text-xl font-semibold text-gray-900 mb-8 leading-relaxed">
                "{currentItem.itemText}"
              </h2>

              <div className="space-y-3">
                {LIKERT_LABELS.map(option => (
                  <button
                    key={option.value}
                    onClick={() => handleLikertResponse(currentItem.id, option.value)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                      responses[currentItem.id] === option.value
                        ? "border-blue-600 bg-blue-50 text-blue-900"
                        : "border-gray-200 hover:border-blue-300 hover:bg-gray-50 text-gray-700"
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      responses[currentItem.id] === option.value
                        ? "border-blue-600 bg-blue-600"
                        : "border-gray-300"
                    }`}>
                      {responses[currentItem.id] === option.value && (
                        <div className="w-2.5 h-2.5 bg-white rounded-full" />
                      )}
                    </div>
                    <div>
                      <span className="font-medium">{option.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentItemIndex(i => Math.max(0, i - 1))}
              disabled={currentItemIndex === 0}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed font-medium py-2 px-4 rounded-lg hover:bg-gray-100 transition-colors"
            >
              ← Previous
            </button>

            {currentItemIndex < workstyleItems.length - 1 ? (
              <button
                onClick={() => setCurrentItemIndex(i => i + 1)}
                className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium py-2 px-4 rounded-lg hover:bg-blue-50 transition-colors"
              >
                Next →
              </button>
            ) : (
              <button
                onClick={handleWorkstyleComplete}
                disabled={saving || answeredCount < Math.floor(totalItems * 0.6)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-xl transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Continue to Motivators →"}
              </button>
            )}
          </div>

          {answeredCount < Math.floor(totalItems * 0.6) && currentItemIndex === workstyleItems.length - 1 && (
            <p className="text-center text-amber-600 text-sm mt-4">
              Please answer at least {Math.floor(totalItems * 0.6)} questions before continuing ({answeredCount}/{Math.floor(totalItems * 0.6)} answered).
            </p>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-4 text-red-700 text-sm">{error}</div>
          )}
        </div>
      </div>
    );
  }

  // ── Motivator Ranking ──────────────────────────────────────────────────────
  if (section === "motivators") {
    const sortedMotivators = [...motivatorRankings].sort((a, b) => a.rank - b.rank);

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">Step 2 of 2 — Motivator Ranking</span>
              <span className="text-sm text-gray-500">Almost done!</span>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-3">What Motivates You?</h2>
            <p className="text-gray-600 mb-6">
              Rank these 10 motivators from most important (1) to least important (10) in your work life. Use the arrows to reorder them. Be honest — there are no "right" answers.
            </p>

            <div className="space-y-2">
              {sortedMotivators.map((m, idx) => {
                const motivatorItem = data.motivatorItems.find(mi => mi.motivatorId === m.motivatorId);
                const description = MOTIVATOR_DESCRIPTIONS[m.motivatorId] ?? "";
                return (
                  <div
                    key={m.motivatorId}
                    className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200 hover:border-blue-200 transition-colors"
                  >
                    <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900">{motivatorItem?.label ?? m.motivatorId}</div>
                      <div className="text-sm text-gray-500 truncate">{description}</div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => moveMotivator(m.motivatorId, "up")}
                        disabled={idx === 0}
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-blue-100 text-gray-500 hover:text-blue-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveMotivator(m.motivatorId, "down")}
                        disabled={idx === sortedMotivators.length - 1}
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-blue-100 text-gray-500 hover:text-blue-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-red-700 text-sm">{error}</div>
          )}

          <div className="flex gap-4">
            <button
              onClick={() => setSection("workstyle")}
              className="border border-gray-300 text-gray-700 font-medium py-3 px-6 rounded-xl hover:bg-gray-50 transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-8 rounded-xl text-lg transition-colors disabled:opacity-50"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Submitting...
                </span>
              ) : (
                "Submit & View My Results →"
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Results Report ─────────────────────────────────────────────────────────
  if (section === "report") {
    if (!resultsData) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Calculating your results...</p>
          </div>
        </div>
      );
    }

    const dims = Object.entries(resultsData.dimensions);

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-blue-900 text-white py-12 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold mb-2">Your Savvy Talent Profile</h1>
            <p className="text-blue-200">{resultsData.session.candidateName} — Assessment Complete</p>
            {resultsData.confidence && (
              <div className={`inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full text-sm font-medium ${
                resultsData.confidence.label === "Sufficient Evidence" ? "bg-green-500/20 text-green-200" :
                resultsData.confidence.label === "Interpret with Context" ? "bg-amber-500/20 text-amber-200" :
                "bg-red-500/20 text-red-200"
              }`}>
                <span>●</span> {resultsData.confidence.label}
              </div>
            )}
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
          {/* Disclaimer */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <strong>Provisional:</strong> {resultsData.disclaimer}
          </div>

          {/* Dimension Scores */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Your 8 Workstyle Dimensions</h2>
            <div className="space-y-5">
              {dims.map(([dimId, dim]: [string, any]) => (
                <div key={dimId}>
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <span className="font-semibold text-gray-900">{dim.label}</span>
                      <span className="ml-2 text-sm text-blue-600 font-medium">{dim.band}</span>
                    </div>
                    <span className="text-sm font-bold text-gray-700">{dim.scaledScore}/100</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 mb-1">
                    <div
                      className="bg-blue-600 h-3 rounded-full transition-all"
                      style={{ width: `${dim.scaledScore}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{dim.description?.low?.split(" — ")[0] ?? "Low"}</span>
                    <span>{dim.description?.high?.split(" — ")[0] ?? "High"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Work Strengths */}
          {resultsData.topStrengths.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Your Top Work Strengths</h2>
              <p className="text-gray-500 text-sm mb-6">Calculated from your dimension scores. These reflect your natural operating tendencies.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {resultsData.topStrengths.map((s: any, i: number) => (
                  <div key={s.id} className={`p-5 rounded-xl border-2 ${i === 0 ? "border-blue-600 bg-blue-50" : "border-gray-200"}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${i === 0 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>
                        {i + 1}
                      </div>
                      <h3 className="font-bold text-gray-900">{s.name}</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{s.description}</p>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${s.score}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Motivators */}
          {resultsData.motivators.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Your Top Motivators</h2>
              <p className="text-gray-500 text-sm mb-6">Based on your ranking. These are the conditions that most energize you at work.</p>
              <div className="space-y-3">
                {resultsData.motivators.slice(0, 5).map((m: any) => (
                  <div key={m.motivator} className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
                    <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {m.rank}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{m.label}</div>
                      <div className="text-sm text-green-700 mt-0.5">✓ {m.engagementCondition}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Strengths Under Pressure */}
          {resultsData.pressurePatterns.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Strengths Under Pressure</h2>
              <p className="text-gray-500 text-sm mb-6">
                These are hypothetical patterns that sometimes emerge when your natural strengths are overextended under stress. They are not predictions — they are areas worth being aware of.
              </p>
              <div className="space-y-4">
                {resultsData.pressurePatterns.slice(0, 3).map((p: any) => (
                  <div key={p.id} className="p-5 bg-amber-50 rounded-xl border border-amber-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-amber-900">{p.strength}</span>
                      <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">{p.pattern}</span>
                    </div>
                    <p className="text-sm text-amber-800">{p.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="text-center py-8 text-gray-400 text-sm">
            <p>Savvy Talent Profile · Assessment complete</p>
            <p className="mt-1">A member of the hiring team will be in touch regarding next steps.</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
