import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Brain, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Minus, CheckCircle2, XCircle, Shield, MessageSquare, Target, Lightbulb, Clock } from "lucide-react";
import { toast } from "sonner";

interface Props {
  agentId: number;
  profile: any;
  onRefresh: () => void;
}

export function CoachingAIInsightsTab({ agentId, profile, onRefresh }: Props) {
  const [localInsights, setLocalInsights] = useState<any>(null);
  const generateInsights = trpc.coaching.generateAgentInsights.useMutation({
    onSuccess: (data) => {
      toast.success("AI insights generated and saved");
      setLocalInsights(data.insights);
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });

  // Use local insights if just generated, otherwise parse from profile
  const insights = localInsights ?? (profile?.aiInsightsJson
    ? (typeof profile.aiInsightsJson === "string" ? JSON.parse(profile.aiInsightsJson) : profile.aiInsightsJson)
    : null);

  const generatedAt = profile?.aiInsightsGeneratedAt;

  if (!insights) {
    return (
      <div className="flex min-h-60 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-5 text-center">
        <Brain className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="font-semibold text-base">No AI Coaching Insights Generated Yet</p>
        <p className="mt-2 text-sm text-muted-foreground max-w-md">
          Click below to generate a comprehensive AI analysis of this agent's performance, coaching history,
          personality assessments, and recommended coaching approach.
        </p>
        <Button className="mt-4" onClick={() => generateInsights.mutate({ agentId })} disabled={generateInsights.isPending}>
          {generateInsights.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Brain className="h-4 w-4 mr-2" />}
          {generateInsights.isPending ? "Analyzing Agent Data..." : "Generate AI Coaching Insights"}
        </Button>
        <p className="mt-3 text-[10px] text-muted-foreground">This pulls production, pipeline, goals, leads, tasks, assessments, coaching history, and company benchmarks.</p>
      </div>
    );
  }

  const trajectoryIcon = insights.productionAnalysis?.trajectory === "up"
    ? <TrendingUp className="h-4 w-4 text-green-600" />
    : insights.productionAnalysis?.trajectory === "down"
    ? <TrendingDown className="h-4 w-4 text-red-600" />
    : <Minus className="h-4 w-4 text-yellow-600" />;

  const diagConfidence = insights.performanceDiagnosis?.confidence;
  const confBadge = diagConfidence === "high" ? "bg-green-100 text-green-800" : diagConfidence === "medium" ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary p-2 text-primary-foreground"><Brain className="h-5 w-5" /></div>
          <div>
            <h3 className="font-semibold text-base">AI Coaching Intelligence</h3>
            {generatedAt && <p className="text-[11px] text-muted-foreground">Generated: {new Date(generatedAt).toLocaleString()}</p>}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => generateInsights.mutate({ agentId })} disabled={generateInsights.isPending}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${generateInsights.isPending ? "animate-spin" : ""}`} />
          {generateInsights.isPending ? "Regenerating..." : "Regenerate"}
        </Button>
      </div>

      {/* Section 1: Executive Summary */}
      <Card className="border-primary/15 bg-gradient-to-br from-primary/[0.03] to-background">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4" />Executive Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm leading-7 whitespace-pre-wrap text-foreground/90">{insights.executiveSummary}</div>
        </CardContent>
      </Card>

      {/* Section 2: Performance Diagnosis (Four-C) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Performance Diagnosis (Four-C Framework)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Diagnosis Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {["Commitment", "Capability", "Cadence", "Capacity"].map((d) => {
              const isPrimary = insights.performanceDiagnosis?.primaryDiagnosis === d;
              const isSecondary = insights.performanceDiagnosis?.secondaryDiagnosis === d;
              return (
                <div key={d} className={`rounded-lg border p-3 text-center transition-all ${isPrimary ? "border-primary bg-primary/5 ring-1 ring-primary/30" : isSecondary ? "border-yellow-400 bg-yellow-50" : "border-muted"}`}>
                  <p className={`text-sm font-semibold ${isPrimary ? "text-primary" : isSecondary ? "text-yellow-700" : "text-muted-foreground"}`}>{d}</p>
                  {isPrimary && <p className="text-[10px] text-primary mt-0.5 font-medium">PRIMARY</p>}
                  {isSecondary && <p className="text-[10px] text-yellow-700 mt-0.5 font-medium">SECONDARY</p>}
                </div>
              );
            })}
          </div>
          {/* Confidence */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Confidence:</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${confBadge}`}>{diagConfidence?.toUpperCase()}</span>
          </div>
          {/* Evidence */}
          {insights.performanceDiagnosis?.evidence?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Evidence:</p>
              <ul className="space-y-1">
                {insights.performanceDiagnosis.evidence.map((e: string, i: number) => (
                  <li key={i} className="text-xs flex items-start gap-2"><CheckCircle2 className="h-3 w-3 mt-0.5 text-primary shrink-0" /><span>{e}</span></li>
                ))}
              </ul>
            </div>
          )}
          {/* Root Cause */}
          {insights.performanceDiagnosis?.rootCauseAnalysis && (
            <div className="rounded-lg bg-muted/30 p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Root Cause Analysis:</p>
              <p className="text-xs leading-5">{insights.performanceDiagnosis.rootCauseAnalysis}</p>
            </div>
          )}
          {/* Benchmark Comparison */}
          {insights.performanceDiagnosis?.comparedToBenchmark && (
            <div className="rounded-lg bg-blue-50 p-3">
              <p className="text-xs font-semibold text-blue-700 mb-1">vs. Company Benchmark:</p>
              <p className="text-xs leading-5 text-blue-900">{insights.performanceDiagnosis.comparedToBenchmark}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Coaching History Synthesis */}
      {insights.coachingHistorySynthesis && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" />Coaching History Synthesis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {insights.coachingHistorySynthesis.recurringThemes?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Recurring Themes:</p>
                <div className="flex flex-wrap gap-1.5">
                  {insights.coachingHistorySynthesis.recurringThemes.map((t: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">{t}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {insights.coachingHistorySynthesis.approachesThatWorked?.length > 0 && (
                <div className="rounded-lg bg-green-50 p-3">
                  <p className="text-xs font-semibold text-green-700 mb-1.5">What Worked:</p>
                  <ul className="space-y-1">
                    {insights.coachingHistorySynthesis.approachesThatWorked.map((a: string, i: number) => (
                      <li key={i} className="text-xs flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 mt-0.5 text-green-600 shrink-0" /><span className="text-green-900">{a}</span></li>
                    ))}
                  </ul>
                </div>
              )}
              {insights.coachingHistorySynthesis.approachesThatDidntWork?.length > 0 && (
                <div className="rounded-lg bg-red-50 p-3">
                  <p className="text-xs font-semibold text-red-700 mb-1.5">What Didn't Work:</p>
                  <ul className="space-y-1">
                    {insights.coachingHistorySynthesis.approachesThatDidntWork.map((a: string, i: number) => (
                      <li key={i} className="text-xs flex items-start gap-1.5"><XCircle className="h-3 w-3 mt-0.5 text-red-600 shrink-0" /><span className="text-red-900">{a}</span></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {insights.coachingHistorySynthesis.commitmentCompletionRate && (
              <p className="text-xs"><span className="font-medium">Commitment Completion:</span> {insights.coachingHistorySynthesis.commitmentCompletionRate}</p>
            )}
            {insights.coachingHistorySynthesis.sessionEngagementTrend && (
              <p className="text-xs"><span className="font-medium">Engagement Trend:</span> {insights.coachingHistorySynthesis.sessionEngagementTrend}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Section 4: Personality & Coaching Style */}
      {insights.personalityAndStyle && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="h-4 w-4" />Personality & Coaching Style</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {insights.personalityAndStyle.communicationApproach && (
              <div className="rounded-lg bg-purple-50 p-3">
                <p className="text-xs font-semibold text-purple-700 mb-1">Communication Approach:</p>
                <p className="text-xs leading-5 text-purple-900">{insights.personalityAndStyle.communicationApproach}</p>
              </div>
            )}
            {insights.personalityAndStyle.motivationalDrivers?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Motivational Drivers:</p>
                <div className="flex flex-wrap gap-1.5">
                  {insights.personalityAndStyle.motivationalDrivers.map((m: string, i: number) => (
                    <Badge key={i} variant="outline" className="text-[10px] border-purple-200 text-purple-700">{m}</Badge>
                  ))}
                </div>
              </div>
            )}
            {insights.personalityAndStyle.accountabilityStyle && (
              <p className="text-xs"><span className="font-medium">Accountability Style:</span> {insights.personalityAndStyle.accountabilityStyle}</p>
            )}
            {insights.personalityAndStyle.potentialTriggers?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Potential Triggers (Avoid):</p>
                <ul className="space-y-0.5">
                  {insights.personalityAndStyle.potentialTriggers.map((t: string, i: number) => (
                    <li key={i} className="text-xs flex items-start gap-1.5"><AlertTriangle className="h-3 w-3 mt-0.5 text-amber-500 shrink-0" /><span>{t}</span></li>
                  ))}
                </ul>
              </div>
            )}
            {insights.personalityAndStyle.coachingDosAndDonts && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-green-50 p-3">
                  <p className="text-xs font-semibold text-green-700 mb-1.5">DO:</p>
                  <ul className="space-y-0.5">
                    {(insights.personalityAndStyle.coachingDosAndDonts.do ?? []).map((d: string, i: number) => (
                      <li key={i} className="text-xs text-green-900">• {d}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg bg-red-50 p-3">
                  <p className="text-xs font-semibold text-red-700 mb-1.5">DON'T:</p>
                  <ul className="space-y-0.5">
                    {(insights.personalityAndStyle.coachingDosAndDonts.dont ?? []).map((d: string, i: number) => (
                      <li key={i} className="text-xs text-red-900">• {d}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Section 5: Production Analysis */}
      {insights.productionAnalysis && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">{trajectoryIcon}Production Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium">Trajectory:</span>
              <Badge variant={insights.productionAnalysis.trajectory === "up" ? "default" : insights.productionAnalysis.trajectory === "down" ? "destructive" : "secondary"} className="text-[10px]">
                {insights.productionAnalysis.trajectory?.toUpperCase()}
              </Badge>
            </div>
            {insights.productionAnalysis.trajectoryDetail && (
              <p className="text-xs leading-5">{insights.productionAnalysis.trajectoryDetail}</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {insights.productionAnalysis.strengthAreas?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-green-700 mb-1">Strengths:</p>
                  <ul className="space-y-0.5">
                    {insights.productionAnalysis.strengthAreas.map((s: string, i: number) => (
                      <li key={i} className="text-xs">✓ {s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {insights.productionAnalysis.gapAreas?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-700 mb-1">Gaps:</p>
                  <ul className="space-y-0.5">
                    {insights.productionAnalysis.gapAreas.map((g: string, i: number) => (
                      <li key={i} className="text-xs">✗ {g}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {insights.productionAnalysis.terminationAnalysis && (
              <p className="text-xs"><span className="font-medium">Terminations:</span> {insights.productionAnalysis.terminationAnalysis}</p>
            )}
            {insights.productionAnalysis.pipelineHealth && (
              <p className="text-xs"><span className="font-medium">Pipeline Health:</span> {insights.productionAnalysis.pipelineHealth}</p>
            )}
            {insights.productionAnalysis.goalProgress && (
              <p className="text-xs"><span className="font-medium">Goal Progress:</span> {insights.productionAnalysis.goalProgress}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Section 6: Risk Assessment */}
      {insights.riskAssessment && (
        <Card className={insights.riskAssessment.retentionRisk === "Critical" ? "border-red-300 bg-red-50/30" : insights.riskAssessment.retentionRisk === "Elevated" ? "border-orange-300 bg-orange-50/30" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4" />Risk Assessment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">Retention Risk:</span>
              <Badge variant={insights.riskAssessment.retentionRisk === "Critical" ? "destructive" : insights.riskAssessment.retentionRisk === "Elevated" ? "destructive" : "secondary"} className="text-[10px]">
                {insights.riskAssessment.retentionRisk}
              </Badge>
            </div>
            {insights.riskAssessment.retentionRiskReasoning && (
              <p className="text-xs leading-5">{insights.riskAssessment.retentionRiskReasoning}</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {insights.riskAssessment.riskFactors?.length > 0 && (
                <div className="rounded-lg bg-red-50 p-3">
                  <p className="text-xs font-semibold text-red-700 mb-1.5">Risk Factors:</p>
                  <ul className="space-y-0.5">
                    {insights.riskAssessment.riskFactors.map((r: string, i: number) => (
                      <li key={i} className="text-xs text-red-900">⚠ {r}</li>
                    ))}
                  </ul>
                </div>
              )}
              {insights.riskAssessment.positiveSignals?.length > 0 && (
                <div className="rounded-lg bg-green-50 p-3">
                  <p className="text-xs font-semibold text-green-700 mb-1.5">Positive Signals:</p>
                  <ul className="space-y-0.5">
                    {insights.riskAssessment.positiveSignals.map((s: string, i: number) => (
                      <li key={i} className="text-xs text-green-900">✓ {s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {insights.riskAssessment.earlyWarningIndicators?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Early Warning Indicators to Watch:</p>
                <ul className="space-y-0.5">
                  {insights.riskAssessment.earlyWarningIndicators.map((w: string, i: number) => (
                    <li key={i} className="text-xs">👁 {w}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Section 7: Recommendations */}
      {insights.recommendations && (
        <Card className="border-primary/15">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Lightbulb className="h-4 w-4" />Coaching Recommendations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Development Priority */}
            {insights.recommendations.developmentPriority && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                <p className="text-xs font-semibold text-primary mb-1">Development Priority:</p>
                <p className="text-sm font-medium">{insights.recommendations.developmentPriority}</p>
              </div>
            )}
            {/* Recommended Session Type */}
            {insights.recommendations.recommendedSessionType && (
              <p className="text-xs"><span className="font-medium">Recommended Next Session Type:</span> <Badge variant="outline" className="text-[10px] ml-1">{insights.recommendations.recommendedSessionType}</Badge></p>
            )}
            {/* Recommended Agenda */}
            {insights.recommendations.recommendedAgenda?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">Recommended Agenda:</p>
                <ol className="space-y-1.5">
                  {insights.recommendations.recommendedAgenda.map((a: string, i: number) => (
                    <li key={i} className="text-xs flex items-start gap-2">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {/* Power Questions */}
            {insights.recommendations.powerQuestions?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">Power Questions:</p>
                <ul className="space-y-1.5 bg-muted/20 rounded-lg p-3">
                  {insights.recommendations.powerQuestions.map((q: string, i: number) => (
                    <li key={i} className="text-xs italic text-foreground/80">"{q}"</li>
                  ))}
                </ul>
              </div>
            )}
            {/* Suggested Commitments */}
            {insights.recommendations.suggestedCommitments?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">Suggested Commitments:</p>
                <div className="space-y-2">
                  {insights.recommendations.suggestedCommitments.map((c: any, i: number) => (
                    <div key={i} className="rounded-lg border p-3">
                      <p className="text-xs font-medium">{c.description}</p>
                      {c.rationale && <p className="text-[11px] text-muted-foreground mt-0.5">Why: {c.rationale}</p>}
                      <div className="flex gap-3 mt-1">
                        {c.metric && <span className="text-[10px] text-muted-foreground">Metric: {c.metric}</span>}
                        {c.timeline && <span className="text-[10px] text-muted-foreground">Timeline: {c.timeline}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Next Session Focus */}
            {insights.recommendations.nextSessionFocus && (
              <p className="text-xs"><span className="font-medium">Next Session Focus:</span> {insights.recommendations.nextSessionFocus}</p>
            )}
            {/* Escalation Recommendation */}
            {insights.recommendations.escalationRecommendation && insights.recommendations.escalationRecommendation !== "None" && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                <p className="text-xs font-semibold text-amber-700 mb-1">Escalation Recommendation:</p>
                <p className="text-xs text-amber-900">{insights.recommendations.escalationRecommendation}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Section 8: Data Quality Warnings */}
      {insights.dataQualityWarnings?.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-700"><AlertTriangle className="h-4 w-4" />Data Quality Warnings</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {insights.dataQualityWarnings.map((w: string, i: number) => (
                <li key={i} className="text-xs flex items-start gap-2"><AlertTriangle className="h-3 w-3 mt-0.5 text-amber-500 shrink-0" /><span className="text-amber-900">{w}</span></li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
