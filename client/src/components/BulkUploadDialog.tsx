import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, CheckCircle2, XCircle, AlertCircle, FileText } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BulkUploadColumn {
  key: string;
  label: string;
  aliases?: string[];
  required?: boolean;
  example?: string;
}

export interface BulkUploadResult {
  row: number;
  status: "created" | "skipped" | "error";
  reason?: string;
  name?: string;
  address?: string;
  label?: string;
}

export interface BulkUploadSummary {
  created: number;
  skipped: number;
  errors: number;
  results: BulkUploadResult[];
}

interface BulkUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  columns: BulkUploadColumn[];
  onUpload: (rows: Record<string, string>[]) => Promise<BulkUploadSummary>;
  onSuccess?: () => void;
}

// ─── CSV Parsing ──────────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  // Parse a single CSV line respecting quoted fields
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
  return { headers, rows };
}

// ─── Template Download ────────────────────────────────────────────────────────

function downloadTemplate(columns: BulkUploadColumn[], filename: string) {
  const headers = columns.map((c) => c.label).join(",");
  const example = columns.map((c) => c.example ?? "").join(",");
  const csv = `${headers}\n${example}\n`;
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ────────────────────────────────────────────────────────────────

type Step = "upload" | "preview" | "results";

export default function BulkUploadDialog({
  open,
  onOpenChange,
  title,
  columns,
  onUpload,
  onSuccess,
}: BulkUploadDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BulkUploadSummary | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const reset = () => {
    setStep("upload");
    setParsedRows([]);
    setParseError(null);
    setSummary(null);
    setUploading(false);
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleClose = () => {
    if (step === "results" && summary && summary.created > 0) onSuccess?.();
    reset();
    onOpenChange(false);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { rows } = parseCSV(text);
      if (rows.length === 0) {
        setParseError("No data rows found. Make sure your CSV has a header row and at least one data row.");
        return;
      }
      // Map CSV headers (case-insensitive) to column keys
      const firstRow = rows[0];
      const csvHeaders = Object.keys(firstRow);
      const mapped = rows.map((row) => {
        const out: Record<string, string> = {};
        columns.forEach((col) => {
          // Try exact match, then case-insensitive
          const acceptedHeaders = [col.label, col.key, ...(col.aliases ?? [])]
            .map((header) => header.toLowerCase());
          const match = csvHeaders.find((header) => acceptedHeaders.includes(header.toLowerCase()));
          out[col.key] = match ? (row[match] ?? "") : "";
        });
        return out;
      });
      setParsedRows(mapped);
      setStep("preview");
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setUploading(true);
    try {
      const result = await onUpload(parsedRows);
      setSummary(result);
      setStep("results");
    } catch (err: any) {
      setParseError(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  // Preview: show first 10 rows
  const previewRows = parsedRows.slice(0, 10);
  const previewCols = columns.slice(0, 6); // cap columns shown in preview

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {/* Step: Upload */}
        {step === "upload" && (
          <div className="space-y-5 py-2">
            {/* Template download */}
            <div className="rounded-lg border bg-muted/30 p-4 flex items-start gap-3">
              <FileText className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Step 1 — Download the CSV template</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Fill in your data using the template. Required columns are marked with *.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {columns.map((c) => (
                    <span key={c.key} className={`text-xs px-2 py-0.5 rounded-full border ${c.required ? "border-primary/40 bg-primary/5 text-primary" : "border-border bg-background text-muted-foreground"}`}>
                      {c.label}{c.required ? " *" : ""}
                    </span>
                  ))}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadTemplate(columns, `${title.toLowerCase().replace(/\s+/g, "-")}-template.csv`)}
              >
                <Download className="h-4 w-4 mr-1.5" />
                Template
              </Button>
            </div>

            {/* File picker */}
            <div className="rounded-lg border-2 border-dashed border-border p-8 text-center">
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium mb-1">Step 2 — Upload your filled CSV</p>
              <p className="text-xs text-muted-foreground mb-4">CSV files only, up to 1,000 rows</p>
              <Button size="sm" onClick={() => fileRef.current?.click()}>
                Choose File
              </Button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
              {fileName && <p className="text-xs text-muted-foreground mt-3">{fileName}</p>}
            </div>

            {parseError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
                <XCircle className="h-4 w-4 shrink-0" />
                {parseError}
              </div>
            )}
          </div>
        )}

        {/* Step: Preview */}
        {step === "preview" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{parsedRows.length}</span> rows detected
                {parsedRows.length > 10 && " — showing first 10"}
              </p>
              <Button size="sm" variant="ghost" onClick={() => { setStep("upload"); if (fileRef.current) fileRef.current.value = ""; }}>
                Change file
              </Button>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">#</th>
                    {previewCols.map((c) => (
                      <th key={c.key} className="text-left py-2 px-3 text-muted-foreground font-medium whitespace-nowrap">
                        {c.label}{c.required ? " *" : ""}
                      </th>
                    ))}
                    {columns.length > 6 && <th className="py-2 px-3 text-muted-foreground font-medium">+{columns.length - 6} more</th>}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="py-2 px-3 text-muted-foreground">{i + 1}</td>
                      {previewCols.map((c) => (
                        <td key={c.key} className={`py-2 px-3 max-w-[160px] truncate ${c.required && !row[c.key] ? "text-destructive font-medium" : ""}`}>
                          {row[c.key] || <span className="text-muted-foreground/50 italic">empty</span>}
                        </td>
                      ))}
                      {columns.length > 6 && <td className="py-2 px-3 text-muted-foreground">…</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {parseError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
                <XCircle className="h-4 w-4 shrink-0" />
                {parseError}
              </div>
            )}
          </div>
        )}

        {/* Step: Results */}
        {step === "results" && summary && (
          <div className="space-y-4 py-2">
            {/* Summary badges */}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <div>
                  <p className="text-xl font-bold text-emerald-700">{summary.created}</p>
                  <p className="text-xs text-emerald-600">Created</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="text-xl font-bold text-amber-700">{summary.skipped}</p>
                  <p className="text-xs text-amber-600">Skipped (duplicates)</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                <XCircle className="h-5 w-5 text-red-600" />
                <div>
                  <p className="text-xl font-bold text-red-700">{summary.errors}</p>
                  <p className="text-xs text-red-600">Errors</p>
                </div>
              </div>
            </div>

            {/* Row-level results (only show non-created) */}
            {(summary.skipped > 0 || summary.errors > 0) && (
              <div className="rounded-lg border overflow-hidden">
                <div className="bg-muted/30 px-4 py-2 border-b">
                  <p className="text-xs font-medium text-muted-foreground">Skipped & Error Details</p>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y">
                  {summary.results
                    .filter((r) => r.status !== "created")
                    .map((r) => (
                      <div key={r.row} className="flex items-start gap-3 px-4 py-2.5">
                        {r.status === "skipped"
                          ? <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                          : <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-xs font-medium">Row {r.row}{r.name || r.address || r.label ? ` — ${r.name ?? r.address ?? r.label}` : ""}</p>
                          <p className="text-xs text-muted-foreground">{r.reason}</p>
                        </div>
                        <Badge variant="outline" className={`ml-auto shrink-0 text-xs ${r.status === "skipped" ? "border-amber-300 text-amber-700" : "border-red-300 text-red-700"}`}>
                          {r.status}
                        </Badge>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "upload" && (
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleImport} disabled={uploading || parsedRows.length === 0}>
                {uploading ? "Importing…" : `Import ${parsedRows.length} rows`}
              </Button>
            </>
          )}
          {step === "results" && (
            <>
              <Button variant="outline" onClick={() => { reset(); }}>Upload another file</Button>
              <Button onClick={handleClose}>Done</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
