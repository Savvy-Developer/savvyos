import { useEffect, type ReactNode } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import {
  Bold,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const linkClassName =
  "text-sky-600 font-semibold underline decoration-sky-400 underline-2 underline-offset-2 drop-shadow-[0_0_6px_rgba(14,165,233,0.45)] transition-colors hover:text-sky-700";

export function ProjectTodoDetailsContent({
  value,
  className = "",
}: {
  value?: string | null;
  className?: string;
}) {
  if (!value) return null;

  return (
    <div
      className={`prose prose-sm max-w-none break-words text-sm [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:my-1 [&_a]:text-sky-600 [&_a]:font-semibold [&_a]:underline [&_a]:decoration-sky-400 [&_a]:underline-offset-2 [&_a]:drop-shadow-[0_0_6px_rgba(14,165,233,0.45)] ${className}`}
      // Server-side sanitization limits this to basic text, lists, and safe links.
      dangerouslySetInnerHTML={{ __html: value }}
    />
  );
}

export function ProjectTodoDetailsEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Link.configure({
        autolink: true,
        linkOnPaste: true,
        openOnClick: false,
        HTMLAttributes: {
          class: linkClassName,
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class:
          "min-h-24 px-3 py-2 text-sm leading-6 outline-none prose prose-sm max-w-none [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_a]:text-sky-600 [&_a]:font-semibold [&_a]:underline [&_a]:decoration-sky-400 [&_a]:underline-offset-2 [&_a]:drop-shadow-[0_0_6px_rgba(14,165,233,0.45)]",
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
  });

  useEffect(() => {
    if (editor && editor.getHTML() !== value) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) {
    return <div className="min-h-28 rounded-md border border-input" />;
  }

  const toggleLink = () => {
    const current = editor.getAttributes("link").href ?? "";
    const href = window.prompt(
      "Paste a complete https:// link. Select text first, or paste a link directly into the details area.",
      current
    );
    if (href === null) return;
    if (!href.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (/^(https?:|mailto:)/i.test(href.trim())) {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: href.trim() })
        .run();
      return;
    }
    toast.error("Use a complete https://, http://, or mailto: link.");
  };

  const control = (
    active: boolean,
    label: string,
    action: () => void,
    icon: ReactNode
  ) => (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={`h-8 w-8 ${active ? "bg-muted" : ""}`}
      onMouseDown={event => event.preventDefault()}
      onClick={action}
      title={label}
      aria-label={label}
    >
      {icon}
    </Button>
  );

  return (
    <div className="overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring/30">
      <div className="flex flex-wrap gap-1 border-b bg-muted/30 p-1.5">
        {control(
          editor.isActive("bold"),
          "Bold",
          () => editor.chain().focus().toggleBold().run(),
          <Bold className="h-4 w-4" />
        )}
        {control(
          editor.isActive("italic"),
          "Italic",
          () => editor.chain().focus().toggleItalic().run(),
          <Italic className="h-4 w-4" />
        )}
        {control(
          editor.isActive("bulletList"),
          "Bulleted list",
          () => editor.chain().focus().toggleBulletList().run(),
          <List className="h-4 w-4" />
        )}
        {control(
          editor.isActive("orderedList"),
          "Numbered list",
          () => editor.chain().focus().toggleOrderedList().run(),
          <ListOrdered className="h-4 w-4" />
        )}
        {control(
          editor.isActive("link"),
          "Insert or edit link",
          toggleLink,
          <LinkIcon className="h-4 w-4" />
        )}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
