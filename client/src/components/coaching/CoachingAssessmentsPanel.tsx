import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Brain,
  Plus,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { safeFormat } from "@/lib/safeFormat";
import { toast } from "sonner";

export default function CoachingAssessmentsPanel({
  agentId,
  agentName,
}: {
  agentId: number;
  agentName?: string;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: assessments, isLoading } = trpc.coaching.listAssessments.useQuery({ agentId });

  // Use createAssessment (not addAssessment)
  const createAssessment = trpc.coaching.createAssessment.useMutation({
    onSuccess: () => {
      toast.success("Assessment added");
      utils.coaching.listAssessments.invalidate({ agentId });
      setAddOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  // Use generateAssessmentSummary (not generateAssessmentInsights)
  const generateSummary = trpc.coaching.generateAssessmentSummary.useMutation({
    onSuccess: () => {
      toast.success("AI insights generated");
      utils.coaching.listAssessments.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Personality & Coaching Assessments ({(assessments ?? []).length})
          </CardTitle>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Assessment
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (assessments ?? []).length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Brain className="h-7 w-7 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No assessments on file</p>
            <p className="text-xs mt-1">Add DISC, Kolbe, Myers-Briggs, or other assessment results</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(assessments ?? []).map((a: any) => {
              const isExpanded = expandedId === a.id;
              return (
                <div key={a.id} className="border rounded-lg overflow-hidden">
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50"
                    onClick={() => setExpandedId(isExpanded ? null : a.id)}
                  >
                    <div className="flex items-center gap-3">
                      <Brain className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">{a.assessmentType}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.assessmentDate ? safeFormat(a.assessmentDate, "MMM d, yyyy") : "Date unknown"}
                          {a.assessmentProvider && ` · ${a.assessmentProvider}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.aiSummary && (
                        <Badge className="text-xs bg-violet-100 text-violet-700 gap-1" variant="secondary">
                          <Sparkles className="h-3 w-3" />
                          AI Insights
                        </Badge>
                      )}
                      {a.rawText && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            generateSummary.mutate({ assessmentId: a.id });
                          }}
                          disabled={generateSummary.isPending}
                        >
                          {generateSummary.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3 mr-1" />
                          )}
                          {a.aiSummary ? "Regenerate" : "Generate Insights"}
                        </Button>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t p-4 bg-muted/20 space-y-4">
                      {a.rawText && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Raw Results</p>
                          <p className="text-sm whitespace-pre-wrap">{a.rawText}</p>
                        </div>
                      )}
                      {a.aiSummary && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600 mb-1 flex items-center gap-1">
                            <Sparkles className="h-3 w-3" />
                            AI Coaching Insights
                          </p>
                          <p className="text-sm whitespace-pre-wrap">{a.aiSummary}</p>
                        </div>
                      )}
                      {a.communicationStyle && (
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Communication Style</p>
                            <p>{a.communicationStyle}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Decision Making</p>
                            <p>{a.decisionMakingStyle ?? "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Motivators</p>
                            <p>{a.motivators ?? "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Under Stress</p>
                            <p>{a.stressBehaviors ?? "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Preferred Coaching Style</p>
                            <p>{a.preferredCoachingStyle ?? "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Coaching Risks</p>
                            <p>{a.potentialCoachingRisks ?? "—"}</p>
                          </div>
                          {a.likelyStrengths && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">Likely Strengths</p>
                              <p>{a.likelyStrengths}</p>
                            </div>
                          )}
                          {a.likelyBlindSpots && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">Likely Blind Spots</p>
                              <p>{a.likelyBlindSpots}</p>
                            </div>
                          )}
                        </div>
                      )}
                      {a.fileUrl && (
                        <a
                          href={a.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View Full Report
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {addOpen && (
        <AddAssessmentDialog
          agentId={agentId}
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onSave={(data) => createAssessment.mutate(data)}
          saving={createAssessment.isPending}
        />
      )}
    </Card>
  );
}

function AddAssessmentDialog({
  agentId,
  open,
  onClose,
  onSave,
  saving,
}: {
  agentId: number;
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    agentId,
    assessmentType: "DISC",
    assessmentProvider: "",
    assessmentDate: "",
    rawText: "",
    fileUrl: "",
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Assessment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Assessment Type *</Label>
              <Select
                value={form.assessmentType}
                onValueChange={(v) => setForm(f => ({ ...f, assessmentType: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["DISC", "Kolbe", "Myers-Briggs", "StrengthsFinder", "Enneagram", "16Personalities", "Predictive Index", "Other"].map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assessment Date</Label>
              <Input
                type="date"
                value={form.assessmentDate}
                onChange={(e) => setForm(f => ({ ...f, assessmentDate: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Provider / Source</Label>
            <Input
              placeholder="e.g. Tony Robbins DISC, Crystal Knows"
              value={form.assessmentProvider}
              onChange={(e) => setForm(f => ({ ...f, assessmentProvider: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Full Results / Raw Text</Label>
            <Textarea
              placeholder="Paste the full assessment results here for AI analysis..."
              value={form.rawText}
              onChange={(e) => setForm(f => ({ ...f, rawText: e.target.value }))}
              rows={5}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Report URL</Label>
            <Input
              placeholder="https://..."
              value={form.fileUrl}
              onChange={(e) => setForm(f => ({ ...f, fileUrl: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onSave({
              agentId: form.agentId,
              assessmentType: form.assessmentType,
              assessmentProvider: form.assessmentProvider || undefined,
              assessmentDate: form.assessmentDate || undefined,
              rawText: form.rawText || undefined,
              fileUrl: form.fileUrl || undefined,
            })}
            disabled={saving}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Assessment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
