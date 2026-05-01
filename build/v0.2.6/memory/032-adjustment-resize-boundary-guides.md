## Adjustment Resize Boundary Guides

- Adjustment layer resize now marks the active adjustment layer drag state once the pointer passes the drag threshold, matching adjustment moves and motion marker move/resize behavior.
- Timeline composition boundary guides reuse the existing `TimelineBoundaryGuides` component and now key off a single `showTimelineBoundaryGuides` boolean covering adjustment drags, motion drags, and effect drop previews.

Architecture note: the change stays in `src/components/timeline/TimelinePanel.tsx` because the issue is pointer-interaction state local to the timeline panel. The guide rendering remains modular through `TimelineBoundaryGuides`; future timeline interactions should toggle the shared active drag state rather than adding separate white-line overlays.
