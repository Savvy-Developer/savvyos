# Pulse Completion Celebration Design

## Trigger discipline

The celebration runs only after the completion mutation has returned success. It does not run while a save is pending, after a save error, on an item expansion, on ordinary edits, or when a completed item is moved to another status. Completion continues to write the entered definition-of-done or resolution note to the existing status-note and immutable activity records before the client receives the success response.

## Contextual variants

| Completed work | Variant | Behavior |
|---|---|---|
| To-Do | `todo` | A single compact burst of roughly 22 particles, emitted from the successful item’s status control. It lasts 1.0 seconds. |
| Issue resolved in IDS | `issue` | A restrained two-wave burst of approximately 34 particles in the same local origin. It lasts about 1.35 seconds. |
| Final Rock milestone | `milestone` | A distinct small acknowledgement with a gold check state and compact milestone burst only after the confirmed final milestone save. |

The effect is rendered in a small fixed canvas but originates from the triggering item’s bounding rectangle. It is non-blocking, does not change focus, and is removed after the short effect completes. Routine work never uses full-screen confetti.

## Reduced motion and confirmation

`prefers-reduced-motion: reduce` disables particle animation. The same completion returns an immediate non-moving success state: a highlighted completed check, a concise confirmation toast, and an accessible live-region announcement. These confirmations also occur after animated celebrations, ensuring that the result does not rely on motion or color alone.

## Shared integration

The shared Pulse item context panel owns To-Do and Issue completion, so a single completion hook serves My EOS, L10 dashboards, meeting tabs, and Run Meeting. The hook takes the confirmed mutation success as its only trigger. Rock final-milestone acknowledgement is isolated to the existing milestone completion response and checks that the returned post-save summary indicates no incomplete milestones remain.
