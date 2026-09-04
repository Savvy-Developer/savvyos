# Pulse Layout Density and Scroll Review

## Intent

Pulse should give agents enough visual clearance to scan and act without control collisions, clipped content, or inaccessible scrolling. Density should come from compact hierarchy and efficient grouping, not from reducing controls below usable touch targets or eliminating meaningful separation.

## Shared Spacing Rules

| Surface | Rule | Purpose |
|---|---|---|
| Page frame | `max-w-6xl`, responsive 16px/24px horizontal gutters, 32px section cadence | Keeps desktop content readable while preserving mobile clearance. |
| Primary headers | 20px desktop padding, 16px mobile padding; controls wrap with an 8px gap | Prevents heading/action overlap when names or actions are long. |
| Cards | 16px content padding as normal; 20–24px only for high-priority hero or long-form panels | Avoids excessive dead space while preserving scannability. |
| Item rows | 8px vertical and 12px horizontal padding, 8px internal gap | Allows dense active lists without crowding the completion circle, title, metadata, indicators, or sub-To-Do control. |
| Lists | 8px row spacing for independent cards; divider-based 8–12px spacing within a card | Distinguishes records efficiently without repeated large gaps. |
| Forms | 12px field groups and 16px section groups; full-width controls on narrow viewports | Keeps entry flows readable and prevents awkward responsive wrapping. |
| Expanded context | 12px panel padding, 12px section separation, `min-w-0` for text regions | Provides clear context without turning one open item into a disproportionate page block. |
| Tables | Horizontal scroll container with a minimum data width and compact 12px/16px cells | Avoids columns overlapping or being truncated on smaller screens. |

## Scroll and Responsive Rules

The normal dashboard and L10 workspace use document scrolling. No internal panel should force a fixed height except deliberate rich-editor or document-content regions. Every horizontally dense control group wraps or scrolls horizontally with a visible, non-overlapping container. The Run Meeting shell uses one controlled vertical scroll area between a stable header/progress area and a stable footer, preventing footer actions from covering agenda content.

## High-Risk Surfaces

The active focus areas are My EOS action cards and work grids; L10 overview cards, scorecard tables, tabs, and archive grid; Run Meeting header, agenda chips, central content card, and footer; shared item editor, inline context panel, completed history, weekly preparation, and rock milestones. Layout adjustments remain strictly presentation-only: they do not alter Pulse permissions, item routing, workflows, history, or data.

## Validation

Validate at compact mobile, standard laptop, and wide desktop widths. Confirm that buttons and badges do not collide, tabs and scorecards remain accessible horizontally, fixed runner controls do not cover central content, and active work remains compact enough to scan without excess vertical gaps.
