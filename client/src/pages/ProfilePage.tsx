import { useState, useRef, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import RichEmailEditor from "@/components/RichEmailEditor";
import { Upload, Camera, X, CheckCircle2, AlertCircle, Loader2, FileSignature, Save } from "lucide-react";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  agent: "Agent",
  isa: "ISA",
  agent_support: "Agent Support",
};

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const utils = trpc.useUtils();

  const profileQuery = trpc.users.getMyCoreProfile.useQuery(undefined, {
    enabled: !!user,
  });

  const updateAvatarMutation = trpc.users.updateAvatar.useMutation({
    onSuccess: () => {
      utils.users.getMyCoreProfile.invalidate();
      utils.auth.me.invalidate();
      utils.users.orgChart.invalidate();
      refresh();
    },
  });

  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [emailSignatureHtml, setEmailSignatureHtml] = useState("");
  const [signatureState, setSignatureState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentPhoto = preview ?? profileQuery.data?.profilePhotoUrl ?? null;
  const hasEmailSignature = emailSignatureHtml
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim().length > 0;

  useEffect(() => {
    if (!profileQuery.isLoading) {
      setEmailSignatureHtml(profileQuery.data?.emailSignatureHtml ?? "");
    }
  }, [profileQuery.data?.emailSignatureHtml, profileQuery.isLoading]);

  const updateEmailSignatureMutation = trpc.users.updateMyEmailSignature.useMutation({
    onSuccess: () => {
      setSignatureState("success");
      setSignatureError(null);
      utils.users.getMyCoreProfile.invalidate();
    },
    onError: (error) => {
      setSignatureState("error");
      setSignatureError(error.message ?? "Unable to save your Email Signature.");
    },
  });

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return "Only JPG, PNG, and WEBP images are allowed.";
    }
    if (file.size > MAX_SIZE_BYTES) {
      return "File must be under 2MB.";
    }
    return null;
  };

  const handleFile = useCallback((file: File) => {
    const err = validateFile(file);
    if (err) {
      setErrorMsg(err);
      setUploadState("error");
      return;
    }
    setErrorMsg(null);
    setUploadState("idle");
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploadState("uploading");
    setErrorMsg(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const res = await fetch("/api/upload/headshot", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Upload failed");
      }
      const { url } = await res.json();
      await updateAvatarMutation.mutateAsync({ avatarUrl: url });
      setUploadState("success");
      setSelectedFile(null);
      // Keep preview showing the new photo
    } catch (err: any) {
      setErrorMsg(err.message ?? "Upload failed. Please try again.");
      setUploadState("error");
    }
  };

  const handleCancel = () => {
    setPreview(null);
    setSelectedFile(null);
    setUploadState("idle");
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSaveEmailSignature = async () => {
    if (!hasEmailSignature) {
      setSignatureState("error");
      setSignatureError("Add your name and contact details before saving your Email Signature.");
      return;
    }
    setSignatureState("saving");
    setSignatureError(null);
    try {
      await updateEmailSignatureMutation.mutateAsync({ html: emailSignatureHtml });
    } catch {
      // The mutation's onError handler renders the user-facing error state.
    }
  };

  if (!user) return null;

  const initials = getInitials(user.name);
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your profile photo and account information.
        </p>
      </div>

      {/* Profile Photo Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Profile Photo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Current avatar + info */}
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20 ring-2 ring-border">
              {currentPhoto ? (
                <AvatarImage src={currentPhoto} alt={user.name ?? "Profile photo"} className="object-cover" />
              ) : null}
              <AvatarFallback className="bg-[oklch(0.74_0.14_200)] text-[oklch(0.08_0_0)] text-2xl font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-foreground">{user.name ?? "—"}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <Badge variant="outline" className="mt-1 text-xs">{roleLabel}</Badge>
            </div>
          </div>

          {/* Drag-and-drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
              ${dragOver
                ? "border-primary bg-primary/5 scale-[1.01]"
                : "border-border hover:border-primary/50 hover:bg-muted/30"
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleInputChange}
            />
            <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              {dragOver ? "Drop your photo here" : "Drag & drop or click to upload"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              JPG, PNG, or WEBP — max 2MB
            </p>
          </div>

          {/* Preview of selected file */}
          {selectedFile && preview && (
            <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/40 border border-border">
              <img
                src={preview}
                alt="Preview"
                className="h-16 w-16 rounded-full object-cover ring-2 ring-border shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(0)} KB
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  onClick={handleUpload}
                  disabled={uploadState === "uploading"}
                >
                  {uploadState === "uploading" ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Uploading…</>
                  ) : (
                    "Save Photo"
                  )}
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancel} disabled={uploadState === "uploading"}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Status messages */}
          {uploadState === "success" && (
            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Profile photo updated successfully.
            </div>
          )}
          {uploadState === "error" && errorMsg && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errorMsg}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email Signature Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSignature className="h-4 w-4" />
            Email Signature
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
            <strong>Required for Pipeline email.</strong> This signature is automatically appended to every Pipeline email you send. You cannot send a Pipeline email until it is saved.
          </div>
          <RichEmailEditor
            value={emailSignatureHtml}
            onChange={(html) => {
              setEmailSignatureHtml(html);
              if (signatureState !== "idle") setSignatureState("idle");
              setSignatureError(null);
            }}
            placeholder="Add your name, title, phone number, and links…"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {hasEmailSignature ? "Your saved signature will be appended after the email message." : "A non-empty Email Signature is required before you can send Pipeline email."}
            </p>
            <Button
              type="button"
              onClick={handleSaveEmailSignature}
              disabled={!hasEmailSignature || signatureState === "saving" || updateEmailSignatureMutation.isPending}
            >
              {signatureState === "saving" || updateEmailSignatureMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving…</>
              ) : (
                <><Save className="h-4 w-4 mr-1.5" />Save Email Signature</>
              )}
            </Button>
          </div>
          {signatureState === "success" && (
            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Email Signature saved. It will now be appended to your Pipeline emails.
            </div>
          )}
          {signatureState === "error" && signatureError && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {signatureError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Account Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground font-medium">Full Name</dt>
              <dd className="text-foreground mt-0.5">{user.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground font-medium">Email</dt>
              <dd className="text-foreground mt-0.5">{user.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground font-medium">Role</dt>
              <dd className="mt-0.5">
                <Badge variant="outline" className="text-xs">{roleLabel}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground font-medium">Phone</dt>
              <dd className="text-foreground mt-0.5">{user.phone ?? "—"}</dd>
            </div>
            {user.title && (
              <div>
                <dt className="text-muted-foreground font-medium">Title</dt>
                <dd className="text-foreground mt-0.5">{user.title}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
