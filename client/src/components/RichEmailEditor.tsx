import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
};

export default function RichEmailEditor({ value, onChange, placeholder, className }: Props) {
  const [isHtmlMode, setIsHtmlMode] = useState(false);
  const [rawHtml, setRawHtml] = useState(value ?? "");

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: value ?? "",
    onUpdate: ({ editor }) => {
      if (!isHtmlMode) {
        onChange(editor.getHTML());
      }
    },
  });

  // Sync external value changes into editor (e.g. when loading a draft)
  useEffect(() => {
    if (!editor || isHtmlMode) return;
    const current = editor.getHTML();
    if (current !== value && value !== undefined) {
      editor.commands.setContent(value ?? "");
    }
  }, [value, editor, isHtmlMode]);

  const switchToHtml = useCallback(() => {
    if (!editor) return;
    setRawHtml(editor.getHTML());
    setIsHtmlMode(true);
  }, [editor]);

  const switchToWysiwyg = useCallback(() => {
    if (!editor) return;
    editor.commands.setContent(rawHtml);
    onChange(rawHtml);
    setIsHtmlMode(false);
  }, [editor, rawHtml, onChange]);

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

  if (!editor) return null;

  return (
    <div className={cn("border rounded-md overflow-hidden", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b bg-muted/30">
        {!isHtmlMode && (
          <>
            {/* History */}
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
              <Undo className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
              <Redo className="h-3.5 w-3.5" />
            </Button>
            <div className="w-px h-5 bg-border mx-1" />

            {/* Headings */}
            <Button type="button" variant="ghost" size="icon" className={cn("h-7 w-7", editor.isActive("heading", { level: 1 }) && "bg-accent")} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
              <Heading1 className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className={cn("h-7 w-7", editor.isActive("heading", { level: 2 }) && "bg-accent")} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
              <Heading2 className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className={cn("h-7 w-7", editor.isActive("heading", { level: 3 }) && "bg-accent")} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
              <Heading3 className="h-3.5 w-3.5" />
            </Button>
            <div className="w-px h-5 bg-border mx-1" />

            {/* Inline formatting */}
            <Button type="button" variant="ghost" size="icon" className={cn("h-7 w-7", editor.isActive("bold") && "bg-accent")} onClick={() => editor.chain().focus().toggleBold().run()}>
              <Bold className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className={cn("h-7 w-7", editor.isActive("italic") && "bg-accent")} onClick={() => editor.chain().focus().toggleItalic().run()}>
              <Italic className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className={cn("h-7 w-7", editor.isActive("underline") && "bg-accent")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
              <UnderlineIcon className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className={cn("h-7 w-7", editor.isActive("link") && "bg-accent")} onClick={setLink}>
              <LinkIcon className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className={cn("h-7 w-7", editor.isActive("code") && "bg-accent")} onClick={() => editor.chain().focus().toggleCode().run()}>
              <Code className="h-3.5 w-3.5" />
            </Button>
            <div className="w-px h-5 bg-border mx-1" />

            {/* Alignment */}
            <Button type="button" variant="ghost" size="icon" className={cn("h-7 w-7", editor.isActive({ textAlign: "left" }) && "bg-accent")} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
              <AlignLeft className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className={cn("h-7 w-7", editor.isActive({ textAlign: "center" }) && "bg-accent")} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
              <AlignCenter className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className={cn("h-7 w-7", editor.isActive({ textAlign: "right" }) && "bg-accent")} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
              <AlignRight className="h-3.5 w-3.5" />
            </Button>
            <div className="w-px h-5 bg-border mx-1" />

            {/* Lists */}
            <Button type="button" variant="ghost" size="icon" className={cn("h-7 w-7", editor.isActive("bulletList") && "bg-accent")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
              <List className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className={cn("h-7 w-7", editor.isActive("orderedList") && "bg-accent")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
              <ListOrdered className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className={cn("h-7 w-7", editor.isActive("codeBlock") && "bg-accent")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
              <Code2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}

        {/* HTML/WYSIWYG toggle — always visible */}
        <div className="ml-auto">
          <Button
            type="button"
            variant={isHtmlMode ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={isHtmlMode ? switchToWysiwyg : switchToHtml}
          >
            <Code2 className="h-3 w-3" />
            {isHtmlMode ? "Switch to Visual" : "Edit HTML"}
          </Button>
        </div>
      </div>

      {/* Editor area */}
      {isHtmlMode ? (
        <Textarea
          className="font-mono text-xs rounded-none border-0 focus-visible:ring-0 min-h-[200px] resize-y"
          value={rawHtml}
          onChange={(e) => {
            setRawHtml(e.target.value);
            onChange(e.target.value);
          }}
          placeholder="<p>Enter raw HTML here...</p>"
        />
      ) : (
        <EditorContent
          editor={editor}
          className="prose prose-sm max-w-none p-3 min-h-[200px] focus-within:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[180px]"
        />
      )}

      {/* Merge tag helper */}
      <div className="flex flex-wrap gap-1.5 p-2 border-t bg-muted/20">
        <span className="text-xs text-muted-foreground mr-1 self-center">Merge tags:</span>
        {["{{first_name}}", "{{last_name}}", "{{full_name}}", "{{agent_name}}", "{{lead_source}}"].map((tag) => (
          <button
            key={tag}
            type="button"
            className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded hover:bg-primary/20 transition-colors font-mono"
            onClick={() => {
              if (isHtmlMode) {
                setRawHtml((prev) => prev + tag);
                onChange(rawHtml + tag);
              } else {
                editor.chain().focus().insertContent(tag).run();
              }
            }}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}
