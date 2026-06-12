import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import { Upload, FileText, ExternalLink, Trash2 } from "lucide-react";
import { safeFormat } from "@/lib/safeFormat";

const DOC_TYPES = ["contract","disclosure","addendum","inspection","appraisal","title","closing","other"];

export default function DocumentsPage() {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ documentType: "contract", title: "", transactionId: "", contactId: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: documents, refetch } = trpc.documents.list.useQuery({});
  const { data: transactionsData } = trpc.transactions.list.useQuery({ limit: 100 });
  const transactions = transactionsData?.rows ?? [];
  const { data: contactsData } = trpc.contacts.list.useQuery({ limit: 100 });
  const contacts = contactsData?.rows ?? [];

  const getUploadUrl = trpc.documents.getUploadUrl.useMutation();
  const save = trpc.documents.save.useMutation({
    onSuccess: () => { toast.success("Document uploaded"); setOpen(false); setFile(null); setForm({ documentType: "contract", title: "", transactionId: "", contactId: "" }); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const remove = trpc.documents.delete.useMutation({
    onSuccess: () => { toast.success("Document deleted"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const { fileKey } = await getUploadUrl.mutateAsync({ fileName: file.name, mimeType: file.type, fileSize: file.size, documentType: form.documentType as any });
      // Upload via server storage helper — use the save endpoint with a placeholder URL
      // We'll upload directly to S3 via a fetch PUT using a presigned URL approach
      // For now, use the server-side upload endpoint
      const formData = new FormData();
      formData.append("file", file);
      formData.append("fileKey", fileKey);
      const uploadRes = await fetch("/api/documents/upload", { method: "POST", body: formData });
      const { url: fileUrl } = await uploadRes.json();
      await save.mutateAsync({
        name: form.title || file.name,
        documentType: form.documentType as any,
        fileUrl,
        fileKey,
        mimeType: file.type,
        fileSize: file.size,
        relatedTransactionId: form.transactionId ? parseInt(form.transactionId) : null,
        relatedContactId: form.contactId ? parseInt(form.contactId) : null,
      });
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const formatBytes = (b: number) => b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle="Manage contracts, disclosures, and transaction files"
        actions={<Button onClick={() => setOpen(true)} size="sm"><Upload className="h-4 w-4 mr-1" /> Upload</Button>}
      />

      <Card>
        <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Document</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Type</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Size</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Uploaded</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {!documents || documents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>No documents yet. Upload your first file.</p>
                  </td>
                </tr>
              ) : (
                documents.map(({ document: doc }) => (
                  <tr key={doc.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="font-medium">{doc.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground capitalize">{doc.documentType?.replace("_"," ") ?? "—"}</td>
                    <td className="py-3 px-4 text-muted-foreground">{doc.fileSize ? formatBytes(doc.fileSize) : "—"}</td>
                    <td className="py-3 px-4 text-muted-foreground text-xs">{safeFormat(doc.createdAt, "MMM d, yyyy")}</td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" asChild>
                          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => remove.mutate({ id: doc.id })}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table></div></CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Upload Document</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>File *</Label>
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                {file ? (
                  <div>
                    <FileText className="h-6 w-6 mx-auto mb-1 text-primary" />
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                  </div>
                ) : (
                  <div>
                    <Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Click to select file</p>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Optional — defaults to filename" /></div>
            <div>
              <Label>Document Type</Label>
              <Select value={form.documentType} onValueChange={(v) => setForm({ ...form, documentType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Link to Transaction (optional)</Label>
              <Select value={form.transactionId} onValueChange={(v) => setForm({ ...form, transactionId: v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {(transactions ?? []).map(({ transaction }) => (
                    <SelectItem key={transaction.id} value={String(transaction.id)}>{transaction.transactionNumber}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Link to Contact (optional)</Label>
              <Select value={form.contactId} onValueChange={(v) => setForm({ ...form, contactId: v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {(contacts ?? []).map(({ contact }) => (
                    <SelectItem key={contact.id} value={String(contact.id)}>{contact.firstName} {contact.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={!file || uploading}>
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
