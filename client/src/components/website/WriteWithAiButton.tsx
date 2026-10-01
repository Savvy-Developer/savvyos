import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type Written = { metaTitle: string; metaDescription: string };

/**
 * "Write with AI" beside a meta title, meta description or excerpt field.
 * Sends what the form has (plus, on the server, the property facts and the
 * linked pro-forma's base-case numbers) and fills the field with the answer.
 * Nothing is saved until the person saves the form, so they can edit it.
 */
export function WriteWithAiButton({
  kind,
  propertyId,
  sourceProformaId,
  content,
  onWritten,
  label = "Write with AI",
}: {
  kind: "property" | "post" | "case";
  propertyId?: number | null;
  sourceProformaId?: number | null;
  /** Called on click, so it reads the form as it is right then. */
  content: () => Record<string, unknown>;
  onWritten: (written: Written) => void;
  label?: string;
}) {
  const write = trpc.website.writeSeoWithAi.useMutation({
    onSuccess: written => {
      onWritten(written);
      toast.success("Written. Check it and edit anything before saving.");
    },
    onError: error => toast.error(error.message),
  });
  return (
    <Button
      type="button"
      size="sm"
      variant="link"
      className="h-auto p-0 text-xs"
      disabled={write.isPending}
      onClick={() => {
        const raw = content();
        const cleaned: Record<string, string | number | string[] | null> = {};
        for (const [key, value] of Object.entries(raw)) {
          if (typeof value === "string") {
            if (value.trim()) cleaned[key] = value.slice(0, 60_000);
          } else if (typeof value === "number" && Number.isFinite(value)) {
            cleaned[key] = value;
          } else if (Array.isArray(value)) {
            const items = value.filter((item): item is string => typeof item === "string" && !!item.trim()).slice(0, 40);
            if (items.length) cleaned[key] = items.map(item => item.slice(0, 200));
          }
        }
        write.mutate({ kind, propertyId: propertyId ?? null, sourceProformaId: sourceProformaId ?? null, content: cleaned });
      }}
    >
      {write.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
      {write.isPending ? "Writing..." : label}
    </Button>
  );
}
