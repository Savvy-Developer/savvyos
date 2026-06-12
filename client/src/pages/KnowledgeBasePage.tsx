import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  BookOpen,
  Plus,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  ChevronRight,
  FileText,
  FolderOpen,
  Globe,
  Lock,
  CheckCircle,
  Circle,
  ArrowLeft,
} from "lucide-react";
import { Streamdown } from "streamdown";

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = {
  id: number;
  name: string;
  type: "sop" | "reference" | "training";
  description: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

type ArticleListItem = {
  id: number;
  categoryId: number;
  title: string;
  visibleToRoles: string;
  status: "draft" | "published";
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  sop: "SOP",
  reference: "Reference",
  training: "Training",
};

const TYPE_COLORS: Record<string, string> = {
  sop: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  reference: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  training: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

function parseRoles(visibleToRoles: string): string[] {
  return visibleToRoles.split(",").map((r) => r.trim()).filter(Boolean);
}

function buildRolesString(roles: { admin: boolean; agent: boolean; isa: boolean }): string {
  const arr = ["admin"];
  if (roles.agent) arr.push("agent");
  if (roles.isa) arr.push("isa");
  return arr.join(",");
}

// ─── Category Dialog ──────────────────────────────────────────────────────────

function CategoryDialog({
  open,
  onClose,
  existing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  existing?: Category;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [type, setType] = useState<"sop" | "reference" | "training">(existing?.type ?? "reference");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [sortOrder, setSortOrder] = useState(existing?.sortOrder ?? 0);

  const utils = trpc.useUtils();
  const create = trpc.kb.createCategory.useMutation({
    onSuccess: () => { utils.kb.listCategories.invalidate(); toast.success("Category created"); onSaved(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.kb.updateCategory.useMutation({
    onSuccess: () => { utils.kb.listCategories.invalidate(); toast.success("Category updated"); onSaved(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (existing) {
      update.mutate({ id: existing.id, name: name.trim(), type, description: description || null, sortOrder });
    } else {
      create.mutate({ name: name.trim(), type, description: description || undefined, sortOrder });
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Category" : "New Category"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Agent Onboarding SOPs" />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sop">SOP</SelectItem>
                <SelectItem value="reference">Reference</SelectItem>
                <SelectItem value="training">Training</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional description…" />
          </div>
          <div className="space-y-1">
            <Label>Sort Order</Label>
            <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} className="w-24" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Article Editor Dialog ────────────────────────────────────────────────────

function ArticleEditorDialog({
  open,
  onClose,
  categoryId,
  existing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  categoryId: number;
  existing?: ArticleListItem & { content?: string };
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [content, setContent] = useState(existing?.content ?? "");
  const [status, setStatus] = useState<"draft" | "published">(existing?.status ?? "draft");
  const [sortOrder, setSortOrder] = useState(existing?.sortOrder ?? 0);
  const [roles, setRoles] = useState(() => {
    const r = parseRoles(existing?.visibleToRoles ?? "admin");
    return { admin: true, agent: r.includes("agent"), isa: r.includes("isa") };
  });
  const [preview, setPreview] = useState(false);

  const utils = trpc.useUtils();
  const create = trpc.kb.createArticle.useMutation({
    onSuccess: () => {
      utils.kb.listArticles.invalidate({ categoryId });
      toast.success("Article created");
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.kb.updateArticle.useMutation({
    onSuccess: () => {
      utils.kb.listArticles.invalidate({ categoryId });
      if (existing) utils.kb.getArticle.invalidate({ id: existing.id });
      toast.success("Article saved");
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    const visibleToRoles = buildRolesString(roles);
    if (existing) {
      update.mutate({ id: existing.id, title: title.trim(), content, status, sortOrder, visibleToRoles });
    } else {
      create.mutate({ categoryId, title: title.trim(), content, status, sortOrder, visibleToRoles });
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Article" : "New Article"}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
          <div className="space-y-1">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Article title…" />
          </div>

          {/* Visibility */}
          <div className="space-y-2">
            <Label>Visible to roles</Label>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <Checkbox checked disabled id="role-admin" />
                <label htmlFor="role-admin" className="text-sm text-muted-foreground">Admin (always)</label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="role-agent"
                  checked={roles.agent}
                  onCheckedChange={(c) => setRoles((r) => ({ ...r, agent: !!c }))}
                />
                <label htmlFor="role-agent" className="text-sm">Agent</label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="role-isa"
                  checked={roles.isa}
                  onCheckedChange={(c) => setRoles((r) => ({ ...r, isa: !!c }))}
                />
                <label htmlFor="role-isa" className="text-sm">ISA</label>
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-6">
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Sort Order</Label>
              <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} className="w-24" />
            </div>
          </div>

          {/* Content editor */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Content (Markdown supported)</Label>
              <Button variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
                {preview ? "Edit" : "Preview"}
              </Button>
            </div>
            {preview ? (
              <div className="min-h-[300px] rounded-md border p-4 prose prose-sm dark:prose-invert max-w-none overflow-auto">
                <Streamdown>{content || "_No content yet_"}</Streamdown>
              </div>
            ) : (
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={14}
                placeholder="Write your article content in Markdown…"
                className="font-mono text-sm"
              />
            )}
          </div>
        </div>
        <DialogFooter className="pt-2 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving…" : "Save Article"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Article Detail View ──────────────────────────────────────────────────────

function ArticleDetail({
  articleId,
  onBack,
  isAdmin,
  onEdit,
}: {
  articleId: number;
  onBack: () => void;
  isAdmin: boolean;
  onEdit: () => void;
}) {
  const { data: article, isLoading } = trpc.kb.getArticle.useQuery({ id: articleId });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!article) return null;

  const roles = parseRoles(article.visibleToRoles);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 pb-4 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold truncate">{article.title}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant={article.status === "published" ? "default" : "secondary"}>
                {article.status === "published" ? (
                  <><CheckCircle className="h-3 w-3 mr-1" />Published</>
                ) : (
                  <><Circle className="h-3 w-3 mr-1" />Draft</>
                )}
              </Badge>
              {roles.includes("agent") || roles.includes("isa") ? (
                <Badge variant="outline" className="text-xs">
                  <Globe className="h-3 w-3 mr-1" />
                  Visible to: {roles.filter((r) => r !== "admin").join(", ")}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs">
                  <Lock className="h-3 w-3 mr-1" />Admin only
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                Updated {new Date(article.updatedAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={onEdit} className="shrink-0">
            <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pt-6">
        {article.content ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <Streamdown>{article.content}</Streamdown>
          </div>
        ) : (
          <p className="text-muted-foreground italic">No content yet.</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function KnowledgeBasePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedArticleId, setSelectedArticleId] = useState<number | null>(null);

  // Dialogs
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | undefined>();
  const [articleDialogOpen, setArticleDialogOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<(ArticleListItem & { content?: string }) | undefined>();

  const utils = trpc.useUtils();

  // Data
  const { data: categories = [], isLoading: catsLoading } = trpc.kb.listCategories.useQuery();
  const { data: articles = [], isLoading: articlesLoading } = trpc.kb.listArticles.useQuery(
    { categoryId: selectedCategoryId! },
    { enabled: selectedCategoryId !== null }
  );
  const { data: searchResults = [] } = trpc.kb.search.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.trim().length >= 2 }
  );

  // Mutations
  const deleteCategory = trpc.kb.deleteCategory.useMutation({
    onSuccess: () => { utils.kb.listCategories.invalidate(); toast.success("Category deleted"); setSelectedCategoryId(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteArticle = trpc.kb.deleteArticle.useMutation({
    onSuccess: () => {
      if (selectedCategoryId) utils.kb.listArticles.invalidate({ categoryId: selectedCategoryId });
      toast.success("Article deleted");
      setSelectedArticleId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const setStatus = trpc.kb.setStatus.useMutation({
    onSuccess: () => {
      if (selectedCategoryId) utils.kb.listArticles.invalidate({ categoryId: selectedCategoryId });
      toast.success("Status updated");
    },
    onError: (e) => toast.error(e.message),
  });
  const setVisibility = trpc.kb.setVisibility.useMutation({
    onSuccess: () => {
      if (selectedCategoryId) utils.kb.listArticles.invalidate({ categoryId: selectedCategoryId });
      toast.success("Visibility updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const isSearching = searchQuery.trim().length >= 2;
  const displayArticles = isSearching ? searchResults : articles;

  const handleEditArticle = async (article: ArticleListItem) => {
    // Fetch full article with content
    const full = await utils.kb.getArticle.fetch({ id: article.id });
    setEditingArticle({ ...article, content: full?.content ?? "" });
    setArticleDialogOpen(true);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Page Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <div className="flex items-center gap-3">
          <BookOpen className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Knowledge Base</h1>
            <p className="text-sm text-muted-foreground">SOPs, reference materials, and training resources</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search articles…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 w-56"
            />
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => { setEditingCategory(undefined); setCatDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1.5" />New Category
            </Button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar: Categories */}
        <aside className="w-64 border-r flex flex-col shrink-0 overflow-y-auto">
          <div className="p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-2">Categories</p>
            {catsLoading ? (
              <div className="space-y-1">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-9 rounded-md bg-muted animate-pulse" />
                ))}
              </div>
            ) : categories.length === 0 ? (
              <p className="text-sm text-muted-foreground px-2 py-4 text-center">
                {isAdmin ? "No categories yet. Create one to get started." : "No content available."}
              </p>
            ) : (
              <div className="space-y-0.5">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className={`group flex items-center justify-between rounded-md px-2 py-1.5 cursor-pointer transition-colors ${
                      selectedCategoryId === cat.id
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted"
                    }`}
                    onClick={() => { setSelectedCategoryId(cat.id); setSelectedArticleId(null); setSearchQuery(""); }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FolderOpen className="h-4 w-4 shrink-0" />
                      <span className="text-sm truncate">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[cat.type]}`}>
                        {TYPE_LABELS[cat.type]}
                      </span>
                      {isAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
                              <MoreVertical className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditingCategory(cat as Category); setCatDialogOpen(true); }}>
                              <Pencil className="h-3.5 w-3.5 mr-2" />Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Delete category "${cat.name}" and all its articles?`)) {
                                  deleteCategory.mutate({ id: cat.id });
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" />Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Main content area */}
        <main className="flex-1 flex flex-col min-h-0 min-w-0">
          {selectedArticleId && !isSearching ? (
            /* Article Detail */
            <div className="flex-1 flex flex-col p-6 min-h-0">
              <ArticleDetail
                articleId={selectedArticleId}
                onBack={() => setSelectedArticleId(null)}
                isAdmin={isAdmin}
                onEdit={async () => {
                  const art = articles.find((a) => a.id === selectedArticleId);
                  if (art) await handleEditArticle(art);
                }}
              />
            </div>
          ) : (
            /* Article List */
            <div className="flex-1 flex flex-col min-h-0">
              {/* List header */}
              <div className="flex items-center justify-between px-6 py-3 border-b shrink-0">
                <div>
                  {isSearching ? (
                    <h2 className="font-medium">Search results for "{searchQuery}"</h2>
                  ) : selectedCategory ? (
                    <div>
                      <h2 className="font-medium">{selectedCategory.name}</h2>
                      {selectedCategory.description && (
                        <p className="text-sm text-muted-foreground">{selectedCategory.description}</p>
                      )}
                    </div>
                  ) : (
                    <h2 className="font-medium text-muted-foreground">Select a category</h2>
                  )}
                </div>
                {isAdmin && selectedCategoryId && !isSearching && (
                  <Button size="sm" onClick={() => { setEditingArticle(undefined); setArticleDialogOpen(true); }}>
                    <Plus className="h-4 w-4 mr-1.5" />New Article
                  </Button>
                )}
              </div>

              {/* Article list */}
              <div className="flex-1 overflow-y-auto">
                {!selectedCategoryId && !isSearching ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8 text-muted-foreground">
                    <BookOpen className="h-12 w-12 mb-4 opacity-30" />
                    <p className="font-medium">Select a category to browse articles</p>
                    <p className="text-sm mt-1">Or use the search bar to find specific content</p>
                  </div>
                ) : articlesLoading && !isSearching ? (
                  <div className="space-y-2 p-4">
                    {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-md bg-muted animate-pulse" />)}
                  </div>
                ) : displayArticles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8 text-muted-foreground">
                    <FileText className="h-10 w-10 mb-3 opacity-30" />
                    <p className="font-medium">{isSearching ? "No articles found" : "No articles in this category"}</p>
                    {isAdmin && !isSearching && (
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => { setEditingArticle(undefined); setArticleDialogOpen(true); }}>
                        <Plus className="h-4 w-4 mr-1.5" />Add first article
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="divide-y">
                    {displayArticles.map((article) => {
                      const roles = parseRoles(article.visibleToRoles);
                      const isPublic = roles.includes("agent") || roles.includes("isa");
                      return (
                        <div
                          key={article.id}
                          className="flex items-center justify-between px-6 py-3.5 hover:bg-muted/50 cursor-pointer group transition-colors"
                          onClick={() => {
                            if (isSearching) {
                              setSelectedCategoryId(article.categoryId);
                              setSearchQuery("");
                            }
                            setSelectedArticleId(article.id);
                          }}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{article.title}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Badge
                                  variant={article.status === "published" ? "default" : "secondary"}
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {article.status}
                                </Badge>
                                {isAdmin && (
                                  isPublic ? (
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                      <Globe className="h-2.5 w-2.5" />
                                      {roles.filter((r) => r !== "admin").join(", ")}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                      <Lock className="h-2.5 w-2.5" />Admin only
                                    </span>
                                  )
                                )}
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(article.updatedAt).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                            {isAdmin && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                                    <MoreVertical className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditArticle(article); }}>
                                    <Pencil className="h-3.5 w-3.5 mr-2" />Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setStatus.mutate({
                                        id: article.id,
                                        status: article.status === "published" ? "draft" : "published",
                                      });
                                    }}
                                  >
                                    {article.status === "published" ? (
                                      <><Circle className="h-3.5 w-3.5 mr-2" />Unpublish</>
                                    ) : (
                                      <><CheckCircle className="h-3.5 w-3.5 mr-2" />Publish</>
                                    )}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const r = parseRoles(article.visibleToRoles);
                                      const allRoles = "admin,agent,isa";
                                      const adminOnly = "admin";
                                      setVisibility.mutate({
                                        id: article.id,
                                        visibleToRoles: r.length > 1 ? adminOnly : allRoles,
                                      });
                                    }}
                                  >
                                    {parseRoles(article.visibleToRoles).length > 1 ? (
                                      <><Lock className="h-3.5 w-3.5 mr-2" />Make Admin-only</>
                                    ) : (
                                      <><Eye className="h-3.5 w-3.5 mr-2" />Make Visible to All</>
                                    )}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm(`Delete "${article.title}"?`)) {
                                        deleteArticle.mutate({ id: article.id });
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 mr-2" />Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Dialogs */}
      <CategoryDialog
        open={catDialogOpen}
        onClose={() => { setCatDialogOpen(false); setEditingCategory(undefined); }}
        existing={editingCategory}
        onSaved={() => {}}
      />
      {articleDialogOpen && (selectedCategoryId !== null || editingArticle) && (
        <ArticleEditorDialog
          open={articleDialogOpen}
          onClose={() => { setArticleDialogOpen(false); setEditingArticle(undefined); }}
          categoryId={editingArticle?.categoryId ?? selectedCategoryId!}
          existing={editingArticle}
          onSaved={() => {}}
        />
      )}
    </div>
  );
}
