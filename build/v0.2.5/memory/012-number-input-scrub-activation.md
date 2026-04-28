# Number Input Scrub Activation

## Change
- Updated `src/components/ui/input.tsx` so number-field scrubbing is armed on pointer down but only activates after a small drag threshold.
- Native number spinner clicks are detected near the right edge of the input and left to the browser, with propagation stopped so they do not trigger surrounding drag handlers.
- Escape now cancels an active scrub by restoring the value from before the drag, dispatching an input event, and blurring the field.
- Pointer-lock loss during a scrub is treated as cancellation because browser Escape handling can unlock the pointer without delivering a normal keydown event.
- Restore now also invokes the captured `onChange` callback with the reverted input value so controlled fields that committed intermediate scrub values update their React state.
- Shared `Input` now snapshots the value on focus; pressing Escape during normal typing restores that focused value through `onChange` before blurring.
- Escape also blurs shared `Input` and `Textarea` controls when callers do not prevent the key event.

## Architecture Note
- The behavior remains inside the shared `Input` primitive because all inspector/settings number fields use this component.
- This keeps drag-to-scrub policy centralized and avoids adding one-off pointer guards to each inspector panel.
- Future number-input interaction fixes should reuse this primitive boundary rather than patching individual callers.
