/**
 * Job Board Admin Page
 *
 * Admin-only page at /job-board for managing job postings and reviewing applications.
 * The public-facing careers page lives at /careers (no auth required).
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  Users,
  ExternalLink,
  Eye,
  EyeOff,
  ChevronRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type EmploymentType = "full_time" | "part_time" | "contract" | "internship";
type ApplicationStatus = "new" | "reviewing" | "interviewing" | "offered" | "rejected" | "withdrawn";

const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "Full-Time",
  part_time: "Part-Time",
  contract: "Contract",
  internship: "Internship",
};

const APP_STATUS_LABELS: Record<ApplicationStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  interviewing: "Interviewing",
  offered: "Offered",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const APP_STATUS_COLORS: Record<ApplicationStatus, string> = {
  new: "bg-blue-100 text-blue-800",
  reviewing: "bg-yellow-100 text-yellow-800",
  interviewing: "bg-purple-100 text-purple-800",
  offered: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  withdrawn: "bg-gray-100 text-gray-600",
};

// ─── Job Form ─────────────────────────────────────────────────────────────────

type JobFormData = {
  title: string;
  department: string;
  location: string;
  employmentType: EmploymentType;
  description: string;
  requirements: string;
  salaryRange: string;
  isActive: boolean;
  sortOrder: number;
};

const EMPTY_JOB: JobFormData = {
  title: "",
  department: "",
  location: "",
  employmentType: "full_time",
  description: "",
  requirements: "",
  salaryRange: "",
  isActive: true,
  sortOrder: 0,
};

function JobFormDialog({
  open,
  onClose,
  initial,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial?: JobFormData & { id?: number };
  onSave: (data: JobFormData & { id?: number }) => void;
}) {
  const [form, setForm] = useState<JobFormData>(initial ?? EMPTY_JOB);

  const set = (k: keyof JobFormData, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (!form.description.trim()) { toast.error("Description is required"); return; }
    onSave({ ...form, id: initial?.id });
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit Job Posting" : "New Job Posting"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Job Title *</Label>
              <Input value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Real Estate Agent" />
            </div>
            <div>
              <Label>Department</Label>
              <Input value={form.department} onChange={e => set("department", e.target.value)} placeholder="e.g. Sales" />
            </div>
            <div>
              <Label>Location</Label>
              <Input value={form.location} onChange={e => set("location", e.target.value)} placeholder="e.g. Remote / Asheville, NC" />
            </div>
            <div>
              <Label>Employment Type</Label>
              <Select value={form.employmentType} onValueChange={v => set("employmentType", v as EmploymentType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Salary Range</Label>
              <Input value={form.salaryRange} onChange={e => set("salaryRange", e.target.value)} placeholder="e.g. $60,000 – $90,000 / yr" />
            </div>
          </div>
          <div>
            <Label>Description *</Label>
            <Textarea
              value={form.description}
              onChange={e => set("description", e.target.value)}
              rows={6}
              placeholder="Describe the role, responsibilities, and what success looks like..."
            />
          </div>
          <div>
            <Label>Requirements</Label>
            <Textarea
              value={form.requirements}
              onChange={e => set("requirements", e.target.value)}
              rows={4}
              placeholder="List qualifications, skills, or experience required..."
            />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={form.isActive} onCheckedChange={v => set("isActive", v)} id="isActive" />
              <Label htmlFor="isActive">Active (visible on public page)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Label>Sort Order</Label>
              <Input
                type="number"
                className="w-20"
                value={form.sortOrder}
                onChange={e => set("sortOrder", parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>
            {initial?.id ? "Save Changes" : "Create Posting"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Application Detail Dialog ────────────────────────────────────────────────

function AppDetailDialog({
  app,
  jobTitle,
  onClose,
  onStatusChange,
}: {
  app: any;
  jobTitle: string | null | undefined;
  onClose: () => void;
  onStatusChange: (id: number, status: ApplicationStatus, notes?: string) => void;
}) {
  const [notes, setNotes] = useState(app.notes ?? "");
  const [status, setStatus] = useState<ApplicationStatus>(app.status as ApplicationStatus);

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Application — {app.applicantName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-gray-500">Role:</span> <span className="font-medium">{jobTitle ?? "—"}</span></div>
            <div><span className="text-gray-500">Submitted:</span> {new Date(app.submittedAt).toLocaleDateString()}</div>
            <div><span className="text-gray-500">Email:</span> <a href={`mailto:${app.applicantEmail}`} className="text-blue-600 underline">{app.applicantEmail}</a></div>
            <div><span className="text-gray-500">Phone:</span> {app.applicantPhone ?? "—"}</div>
            {app.linkedinUrl && (
              <div className="col-span-2">
                <span className="text-gray-500">LinkedIn:</span>{" "}
                <a href={app.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline flex items-center gap-1 inline-flex">
                  {app.linkedinUrl} <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            {app.resumeUrl && (
              <div className="col-span-2">
                <a href={app.resumeUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline flex items-center gap-1 inline-flex">
                  View Resume <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
          {app.coverLetter && (
            <div>
              <p className="text-gray-500 font-medium mb-1">Cover Letter</p>
              <p className="whitespace-pre-wrap bg-gray-50 rounded p-3 text-xs leading-relaxed">{app.coverLetter}</p>
            </div>
          )}
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={v => setStatus(v as ApplicationStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(APP_STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Internal Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Add notes visible only to admins..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => { onStatusChange(app.id, status, notes); onClose(); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function JobBoardAdminPage() {
  const utils = trpc.useUtils();

  // Data
  const { data: jobs = [], isLoading: jobsLoading } = trpc.jobBoard.listJobs.useQuery();
  const { data: applications = [], isLoading: appsLoading } = trpc.jobBoard.listApplications.useQuery({});

  // Mutations
  const createJob = trpc.jobBoard.createJob.useMutation({
    onSuccess: () => { utils.jobBoard.listJobs.invalidate(); toast.success("Job posting created"); },
    onError: (e) => toast.error(e.message),
  });
  const updateJob = trpc.jobBoard.updateJob.useMutation({
    onSuccess: () => { utils.jobBoard.listJobs.invalidate(); toast.success("Job posting updated"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteJob = trpc.jobBoard.deleteJob.useMutation({
    onSuccess: () => { utils.jobBoard.listJobs.invalidate(); toast.success("Job posting deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const updateAppStatus = trpc.jobBoard.updateApplicationStatus.useMutation({
    onSuccess: () => { utils.jobBoard.listApplications.invalidate(); toast.success("Application updated"); },
    onError: (e) => toast.error(e.message),
  });

  // UI state
  const [jobDialog, setJobDialog] = useState<{ open: boolean; job?: any }>({ open: false });
  const [appDialog, setAppDialog] = useState<{ open: boolean; app?: any; jobTitle?: string | null }>({ open: false });
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const handleSaveJob = (data: any) => {
    if (data.id) {
      updateJob.mutate(data);
    } else {
      createJob.mutate(data);
    }
    setJobDialog({ open: false });
  };

  const publicUrl = `${window.location.origin}/careers`;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Briefcase className="w-6 h-6" /> Job Board
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage job postings and review applications. Public page:{" "}
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline inline-flex items-center gap-1">
              {publicUrl} <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>
        <Button onClick={() => setJobDialog({ open: true })}>
          <Plus className="w-4 h-4 mr-1" /> New Posting
        </Button>
      </div>

      <Tabs defaultValue="postings">
        <TabsList>
          <TabsTrigger value="postings">
            <Briefcase className="w-4 h-4 mr-1" /> Postings ({jobs.length})
          </TabsTrigger>
          <TabsTrigger value="applications">
            <Users className="w-4 h-4 mr-1" /> Applications ({applications.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Postings Tab ── */}
        <TabsContent value="postings" className="mt-4">
          {jobsLoading ? (
            <p className="text-gray-400 text-sm">Loading...</p>
          ) : jobs.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No job postings yet. Create one to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job: any) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium">{job.title}</TableCell>
                    <TableCell>{job.department ?? "—"}</TableCell>
                    <TableCell>{EMPLOYMENT_TYPE_LABELS[job.employmentType as EmploymentType] ?? job.employmentType}</TableCell>
                    <TableCell>{job.location ?? "—"}</TableCell>
                    <TableCell>
                      {job.isActive ? (
                        <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
                          <Eye className="w-3 h-3" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-gray-400 text-xs font-medium">
                          <EyeOff className="w-3 h-3" /> Hidden
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setJobDialog({ open: true, job })}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => setConfirmDelete(job.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* ── Applications Tab ── */}
        <TabsContent value="applications" className="mt-4">
          {appsLoading ? (
            <p className="text-gray-400 text-sm">Loading...</p>
          ) : applications.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No applications yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map(({ application: app, jobTitle }: any) => (
                  <TableRow key={app.id}>
                    <TableCell className="font-medium">{app.applicantName}</TableCell>
                    <TableCell>{jobTitle ?? "—"}</TableCell>
                    <TableCell className="text-sm text-gray-600">{app.applicantEmail}</TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {new Date(app.submittedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${APP_STATUS_COLORS[app.status as ApplicationStatus]}`}>
                        {APP_STATUS_LABELS[app.status as ApplicationStatus]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setAppDialog({ open: true, app, jobTitle })}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>

      {/* Job Form Dialog */}
      {jobDialog.open && (
        <JobFormDialog
          open={jobDialog.open}
          onClose={() => setJobDialog({ open: false })}
          initial={jobDialog.job}
          onSave={handleSaveJob}
        />
      )}

      {/* Application Detail Dialog */}
      {appDialog.open && appDialog.app && (
        <AppDetailDialog
          app={appDialog.app}
          jobTitle={appDialog.jobTitle}
          onClose={() => setAppDialog({ open: false })}
          onStatusChange={(id, status, notes) => updateAppStatus.mutate({ id, status, notes })}
        />
      )}

      {/* Delete Confirm Dialog */}
      <Dialog open={confirmDelete !== null} onOpenChange={v => { if (!v) setConfirmDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Job Posting?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">This will permanently delete the posting. Applications will remain in the database.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmDelete !== null) deleteJob.mutate({ id: confirmDelete });
                setConfirmDelete(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
