import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { useState, useEffect, useCallback } from "react";
import { marked } from "marked";
import TurndownService from "turndown";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Link as LinkIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Code,
  Code2,
  Undo,
  Redo,
  Heading1,
  Heading2,
  Heading3,
  Strikethrough,
  Minus,
  Sparkles,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Turndown instance (HTML → Markdown) ─────────────────────────────────────

const td = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function markdownToHtml(md: string): string {
  if (!md || md.trim() === "") return "";
  // marked.parse returns string | Promise<string> — synchronous when no async
  const result = marked.parse(md, { async: false });
  return result as string;
}

function htmlToMarkdown(html: string): string {
  if (!html || html.trim() === "" || html === "<p></p>") return "";
  return td.turndown(html);
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  /** Current markdown value */
  value: string;
  /** Called with new markdown value on every change */
  onChange: (markdown: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function KBArticleEditor({
  value,
  onChange,
  placeholder = "Write your article content here…",
  className,
  minHeight = 400,
}: Props) {
  const [isFormatting, setIsFormatting] = useState(false);

  // tRPC mutation for AI formatting
  const formatWithAI = trpc.kb.formatWithAI.useMutation({
    onSuccess: (data) => {
      if (editor && data.markdown) {
        const html = markdownToHtml(data.markdown);
        editor.commands.setContent(html);
        onChange(data.markdown);
        toast.success(data.source === "fallback" ? "Content cleaned up with safe formatting" : "Content formatted by AI");
      }
    },
    onError: (e) => {
      toast.error(`AI formatting failed: ${e.message}`);
    },
    onSettled: () => {
      setIsFormatting(false);
    },
  });

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: markdownToHtml(value),
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(htmlToMarkdown(html));
    },
  });

  // Sync external value changes into editor (e.g. when loading a saved article)
  useEffect(() => {
    if (!editor) return;
    const currentMd = htmlToMarkdown(editor.getHTML());
    if (currentMd !== value) {
      const html = markdownToHtml(value ?? "");
      // In tiptap v3, setContent accepts (content, options) where options is SetContentOptions
      editor.commands.setContent(html, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href ?? "";
    const url = window.prompt("Enter URL", prev);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  }, [editor]);

  const handleFormatWithAI = useCallback(() => {
    if (!editor) return;
    const currentMarkdown = htmlToMarkdown(editor.getHTML());
    if (!currentMarkdown.trim()) {
      toast.error("Nothing to format — add some content first.");
      return;
    }
    setIsFormatting(true);
    formatWithAI.mutate({ content: currentMarkdown });
  }, [editor, formatWithAI]);

  if (!editor) return null;

  return (
    <div className={cn("border rounded-md overflow-hidden bg-background", className)}>
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b bg-muted/30">
        {/* History */}
        <Button
          type="button" variant="ghost" size="icon" className="h-7 w-7"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo"
        >
          <Undo className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button" variant="ghost" size="icon" className="h-7 w-7"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo"
        >
          <Redo className="h-3.5 w-3.5" />
        </Button>
        <div className="w-px h-5 bg-border mx-1" />

        {/* Headings */}
        <Button
          type="button" variant="ghost" size="icon"
          className={cn("h-7 w-7", editor.isActive("heading", { level: 1 }) && "bg-accent")}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Heading 1"
        >
          <Heading1 className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button" variant="ghost" size="icon"
          className={cn("h-7 w-7", editor.isActive("heading", { level: 2 }) && "bg-accent")}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
        >
          <Heading2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button" variant="ghost" size="icon"
          className={cn("h-7 w-7", editor.isActive("heading", { level: 3 }) && "bg-accent")}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Heading 3"
        >
          <Heading3 className="h-3.5 w-3.5" />
        </Button>
        <div className="w-px h-5 bg-border mx-1" />

        {/* Inline formatting */}
        <Button
          type="button" variant="ghost" size="icon"
          className={cn("h-7 w-7", editor.isActive("bold") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button" variant="ghost" size="icon"
          className={cn("h-7 w-7", editor.isActive("italic") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button" variant="ghost" size="icon"
          className={cn("h-7 w-7", editor.isActive("underline") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline"
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button" variant="ghost" size="icon"
          className={cn("h-7 w-7", editor.isActive("strike") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button" variant="ghost" size="icon"
          className={cn("h-7 w-7", editor.isActive("link") && "bg-accent")}
          onClick={setLink}
          title="Insert Link"
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button" variant="ghost" size="icon"
          className={cn("h-7 w-7", editor.isActive("code") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleCode().run()}
          title="Inline Code"
        >
          <Code className="h-3.5 w-3.5" />
        </Button>
        <div className="w-px h-5 bg-border mx-1" />

        {/* Alignment */}
        <Button
          type="button" variant="ghost" size="icon"
          className={cn("h-7 w-7", editor.isActive({ textAlign: "left" }) && "bg-accent")}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          title="Align Left"
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button" variant="ghost" size="icon"
          className={cn("h-7 w-7", editor.isActive({ textAlign: "center" }) && "bg-accent")}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          title="Align Center"
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button" variant="ghost" size="icon"
          className={cn("h-7 w-7", editor.isActive({ textAlign: "right" }) && "bg-accent")}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          title="Align Right"
        >
          <AlignRight className="h-3.5 w-3.5" />
        </Button>
        <div className="w-px h-5 bg-border mx-1" />

        {/* Lists */}
        <Button
          type="button" variant="ghost" size="icon"
          className={cn("h-7 w-7", editor.isActive("bulletList") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet List"
        >
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button" variant="ghost" size="icon"
          className={cn("h-7 w-7", editor.isActive("orderedList") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numbered List"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button" variant="ghost" size="icon"
          className={cn("h-7 w-7", editor.isActive("codeBlock") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          title="Code Block"
        >
          <Code2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button" variant="ghost" size="icon" className="h-7 w-7"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal Rule"
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>

        {/* ── AI Format button — right side ── */}
        <div className="ml-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
            onClick={handleFormatWithAI}
            disabled={isFormatting}
            title="Let AI clean up and reformat this content"
          >
            {isFormatting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {isFormatting ? "Formatting…" : "Format with AI"}
          </Button>
        </div>
      </div>

      {/* ── Editor area ── */}
      <EditorContent
        editor={editor}
        className={cn(
          "prose prose-sm dark:prose-invert max-w-none p-4",
          "focus-within:outline-none",
          "[&_.ProseMirror]:outline-none",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0",
        )}
        style={{ minHeight }}
      />

      {/* ── AI hint footer ── */}
      <div className="px-3 py-1.5 border-t bg-muted/20 flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground">
          Paste unformatted content, then click <strong>Format with AI</strong> to clean it up automatically.
        </span>
      </div>
    </div>
  );
}
