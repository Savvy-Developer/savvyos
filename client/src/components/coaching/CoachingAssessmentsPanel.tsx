import { useState, useRef, useCallback } from "react";
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
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
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

  const createAssessment = trpc.coaching.createAssessment.useMutation({
    onSuccess: (result) => {
      toast.success("Assessment added — generating AI insights...");
      utils.coaching.listAssessments.invalidate({ agentId });
      setAddOpen(false);
      // Auto-trigger AI analysis if rawText was provided
      if (result.assessmentId) {
        generateSummary.mutate({ assessmentId: result.assessmentId });
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const generateSummary = trpc.coaching.generateAssessmentSummary.useMutation({
    onSuccess: () => {
      toast.success("AI insights generated and synthesized into agent profile");
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
        <p className="text-xs text-muted-foreground mt-1">
          Upload assessment files (PDF, DOC, TXT) or paste results. AI will automatically analyze and synthesize insights into the agent profile.
        </p>
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
            <p className="text-xs mt-1">Upload DISC, Kolbe, Myers-Briggs, or other assessment results for AI analysis</p>
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
                      {a.aiSummary ? (
                        <Badge className="text-xs bg-violet-100 text-violet-700 gap-1" variant="secondary">
                          <Sparkles className="h-3 w-3" />
                          AI Analyzed
                        </Badge>
                      ) : a.rawText ? (
                        <Badge className="text-xs bg-amber-100 text-amber-700 gap-1" variant="secondary">
                          <AlertCircle className="h-3 w-3" />
                          Needs Analysis
                        </Badge>
                      ) : null}
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
                          {a.aiSummary ? "Regenerate" : "Analyze"}
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
                      {a.rawText && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Raw Results</p>
                          <p className="text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">{a.rawText}</p>
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
    fileKey: "",
  });
  const [uploading, setUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "image/png",
      "image/jpeg",
      "image/webp",
    ];
    if (!allowed.includes(file.type)) {
      toast.error("Only PDF, DOC, DOCX, TXT, and image files are allowed");
      return;
    }

    if (file.size > 16 * 1024 * 1024) {
      toast.error("File must be under 16MB");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload/coaching-assessment", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Upload failed");
      }

      const data = await res.json();
      setForm((f) => ({ ...f, fileUrl: data.fileUrl, fileKey: data.fileKey }));
      setUploadedFileName(data.fileName ?? file.name);

      // If it's a text file, also read its content for AI analysis
      if (file.type === "text/plain") {
        const text = await file.text();
        setForm((f) => ({ ...f, rawText: text }));
        toast.success("File uploaded and text extracted for AI analysis");
      } else {
        toast.success("File uploaded successfully. Paste assessment text below for AI analysis.");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }, []);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Assessment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Assessment Type *</Label>
              <Select
                value={form.assessmentType}
                onValueChange={(v) => setForm((f) => ({ ...f, assessmentType: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["DISC", "Kolbe", "Myers-Briggs", "StrengthsFinder", "Enneagram", "16Personalities", "Predictive Index", "Working Genius", "Other"].map((t) => (
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
                onChange={(e) => setForm((f) => ({ ...f, assessmentDate: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Provider / Source</Label>
            <Input
              placeholder="e.g. Tony Robbins DISC, Crystal Knows"
              value={form.assessmentProvider}
              onChange={(e) => setForm((f) => ({ ...f, assessmentProvider: e.target.value }))}
            />
          </div>

          {/* File Upload Section */}
          <div className="space-y-1.5">
            <Label>Upload Assessment File</Label>
            <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
              {uploadedFileName ? (
                <div className="flex items-center justify-center gap-2 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{uploadedFileName}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => {
                      setUploadedFileName(null);
                      setForm((f) => ({ ...f, fileUrl: "", fileKey: "" }));
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ) : uploading ? (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Uploading...</span>
                </div>
              ) : (
                <div>
                  <Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground mb-2">
                    PDF, DOC, DOCX, TXT, or image (max 16MB)
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileText className="h-3.5 w-3.5 mr-1.5" />
                    Choose File
                  </Button>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
          </div>

          {/* Raw Text Section */}
          <div className="space-y-1.5">
            <Label>Full Results / Raw Text *</Label>
            <p className="text-[11px] text-muted-foreground">
              Paste the full assessment results here. AI will analyze this text to extract coaching insights.
            </p>
            <Textarea
              placeholder="Paste the full assessment results here for AI analysis. This is required for AI to generate coaching insights..."
              value={form.rawText}
              onChange={(e) => setForm((f) => ({ ...f, rawText: e.target.value }))}
              rows={6}
              className="text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() =>
              onSave({
                agentId: form.agentId,
                assessmentType: form.assessmentType,
                assessmentProvider: form.assessmentProvider || undefined,
                assessmentDate: form.assessmentDate || undefined,
                rawText: form.rawText || undefined,
                fileUrl: form.fileUrl || undefined,
                fileKey: form.fileKey || undefined,
              })
            }
            disabled={saving || !form.rawText.trim()}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save & Analyze
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
