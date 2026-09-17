import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  moveTestimonial,
  normalizeTestimonials,
  type Testimonial,
} from "@shared/websiteTestimonials";

/**
 * Editing real customers' words.
 *
 * Each testimonial is a row with its own fields. The previous editor was one
 * textarea of "quote | name | role" lines, which could not hold a quote
 * containing a pipe or a line break, and failed silently by truncating rather
 * than by complaining. Real testimonials are several sentences and usually
 * arrive pasted with line breaks.
 *
 * Nothing here has a placeholder that could be mistaken for content. An empty
 * name stays empty and the row is not shown on the site, because a filler name
 * on a real quote is a claim about a person who did not say it.
 */
export function TestimonialsEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (rows: Testimonial[]) => void;
}) {
  const rows = normalizeTestimonialsForEditing(value);

  const update = (index: number, patch: Partial<Testimonial>) =>
    onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Testimonials</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...rows, { quote: "", name: "" }])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add
        </Button>
      </div>

      {rows.length === 0 && (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No testimonials yet. The section is hidden on the site until there is
          at least one with both a quote and a name.
        </p>
      )}

      {rows.map((row, index) => {
        const incomplete = !row.quote.trim() || !row.name.trim();
        return (
          <div key={index} className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground">
                {index + 1} of {rows.length}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={index === 0}
                  title="Move up"
                  onClick={() => onChange(moveTestimonial(rows, index, index - 1))}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={index === rows.length - 1}
                  title="Move down"
                  onClick={() => onChange(moveTestimonial(rows, index, index + 1))}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title="Remove"
                  onClick={() => onChange(rows.filter((_, at) => at !== index))}
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </Button>
              </div>
            </div>

            <Textarea
              rows={4}
              value={row.quote}
              placeholder="What they said, in their words"
              onChange={event => update(index, { quote: event.target.value })}
            />

            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label className="text-xs">Name</Label>
                <Input
                  value={row.name}
                  onChange={event => update(index, { name: event.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Title</Label>
                <Input
                  value={row.title || ""}
                  placeholder="STR Investor"
                  onChange={event => update(index, { title: event.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Location</Label>
                <Input
                  value={row.location || ""}
                  placeholder="Asheville, NC"
                  onChange={event =>
                    update(index, { location: event.target.value })
                  }
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={row.published !== false}
                onChange={event =>
                  update(index, { published: event.target.checked })
                }
              />
              Show on the site
            </label>

            {incomplete && (
              <p className="text-xs text-amber-600">
                Needs both a quote and a name before it appears on the site.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Rows for the form, which is not the same as rows for the site.
 *
 * normalizeTestimonials drops anything missing a quote or a name, which is
 * right for rendering and wrong here: it would delete a row the moment someone
 * clears a field to retype it. So stored rows are normalised, and rows being
 * typed are kept as they are.
 */
function normalizeTestimonialsForEditing(value: unknown): Testimonial[] {
  if (!Array.isArray(value)) return [];
  const normalized = normalizeTestimonials(value);
  if (normalized.length === value.length) return normalized;
  return value.map(row => {
    const source = (row || {}) as Record<string, unknown>;
    const out: Testimonial = {
      quote: typeof source.quote === "string" ? source.quote : "",
      name: typeof source.name === "string" ? source.name : "",
    };
    const title =
      (typeof source.title === "string" && source.title) ||
      (typeof source.role === "string" && source.role) ||
      "";
    if (title) out.title = title;
    if (typeof source.location === "string" && source.location)
      out.location = source.location;
    if (source.published === false) out.published = false;
    return out;
  });
}
