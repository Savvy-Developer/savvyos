import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { marked } from "marked";
import TurndownService from "turndown";
import { addMarkdownTableRules } from "@shared/markdownTables";
import { Button } from "@/components/ui/button";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Loader2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Rich text editing for website blog posts and case studies.
 *
 * Content is stored as markdown, not HTML. Two reasons: the bodies already in
 * the database are plain text, and plain text is valid markdown, so existing
 * posts keep rendering correctly instead of needing a migration. And markdown
 * in the database is safe to store, with sanitisation happening when it is
 * rendered rather than being relied on at write time.
 */

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});

// Tables go back to markdown as pipe tables, the form the public site
// renders and the form the old site's articles were imported in. Without
// this, turndown flattens a table to one run of text, and a post that was
// opened and saved lost its tables.
addMarkdownTableRules(turndown);

function markdownToHtml(markdown: string): string {
  if (!markdown || !markdown.trim()) return "";
  return marked.parse(markdown, { async: false }) as string;
}

function htmlToMarkdown(html: string): string {
  if (!html || !html.trim() || html === "<p></p>") return "";
  return turndown.turndown(html);
}

function ToolbarButton({
  active,
  disabled,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      aria-pressed={!!active}
      disabled={disabled}
      onClick={onClick}
      className={cn("h-8 w-8", active && "bg-slate-200 text-slate-900")}
    >
      {children}
    </Button>
  );
}

export default function WebsiteRichTextEditor({
  value,
  onChange,
  minHeight = 320,
}: {
  value: string;
  onChange: (markdown: string) => void;
  minHeight?: number;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      // Tables: several imported articles carry comparison tables.
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      // Pictures in the body. Stored in markdown as ![alt](url), which the
      // public site already renders through its safe image renderer.
      Image.configure({ inline: false }),
    ],
    content: markdownToHtml(value),
    onUpdate: ({ editor }) => onChange(htmlToMarkdown(editor.getHTML())),
  });

  // Pull external changes in, for instance when a different record is opened
  // into the same editor. Comparing markdown rather than HTML avoids a loop
  // caused by the round trip normalising whitespace.
  useEffect(() => {
    if (!editor) return;
    if (htmlToMarkdown(editor.getHTML()) === value) return;
    editor.commands.setContent(markdownToHtml(value ?? ""), {
      emitUpdate: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url })
      .run();
  }, [editor]);

  // Upload through the same website image route as cover photos, then drop
  // the picture in where the cursor is.
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const uploadImage = useCallback(
    async (file: File) => {
      if (!editor) return;
      setUploading(true);
      try {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch("/api/upload/website-image", {
          method: "POST",
          body,
          credentials: "include",
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Upload failed");
        editor.chain().focus().setImage({ src: json.url, alt: file.name.replace(/\.[^.]+$/, "") }).run();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed");
      } finally {
        setUploading(false);
        if (fileInput.current) fileInput.current.value = "";
      }
    },
    [editor]
  );

  if (!editor) return null;

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-slate-50 p-1">
        <ToolbarButton
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-slate-300" />
        <ToolbarButton
          label="Heading"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Subheading"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
        >
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-slate-300" />
        <ToolbarButton
          label="Link"
          active={editor.isActive("link")}
          onClick={setLink}
        >
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Align left"
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Align centre"
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Align right"
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Insert image"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImagePlus className="h-4 w-4" />
          )}
        </ToolbarButton>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={event => {
            const file = event.target.files?.[0];
            if (file) void uploadImage(file);
          }}
        />
        <span className="mx-1 h-5 w-px bg-slate-300" />
        <ToolbarButton
          label="Undo"
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Redo"
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo className="h-4 w-4" />
        </ToolbarButton>
      </div>
      <EditorContent
        editor={editor}
        className={cn(
          "prose prose-slate max-w-none px-4 py-3 [&_.ProseMirror]:outline-none",
          // Tables: give cells room and borders so figures don't run together.
          "[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
          "[&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold",
          "[&_td]:border [&_td]:border-slate-300 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top",
          "[&_th_p]:m-0 [&_td_p]:m-0",
          "[&_img]:my-4 [&_img]:max-h-96 [&_img]:rounded-lg",
        )}
        style={{ minHeight }}
      />
    </div>
  );
}
