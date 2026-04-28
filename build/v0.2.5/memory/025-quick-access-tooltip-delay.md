# Quick Access Tooltip Delay

Updated `src/components/QuickAccessTooltip.tsx` so the playback/quick access toolbar buttons use the shared Radix tooltip primitive instead of the previous immediate CSS hover tooltip.

Architecture note: the wrapper remains the single feature-specific place for quick access tooltip copy and layout, while display behavior comes from `src/components/ui/tooltip.tsx`. Quick access tooltips now set `delayDuration={1000}` on a local `TooltipProvider`, so hovering a button requires a one-second pause before the tooltip opens without requiring app-wide provider wiring.

Reuse note: future quick access buttons should continue using `QuickAccessTooltip`; other app tooltips should use the shared `Tooltip`, `TooltipTrigger`, and `TooltipContent` primitives directly when they do not need this toolbar-specific delay/copy structure.
