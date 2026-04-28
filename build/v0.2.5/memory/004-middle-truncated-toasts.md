## Middle Truncated Toasts

Updated for v0.2.5 to prevent long project/export paths from expanding toast notifications beyond the viewport.

Architecture note: path-bearing toast content now lives in `PathToastMessage` inside `src/App.tsx`, next to the toast call sites it serves. The component keeps the action label separate from the path and splits the path into flex children so the middle can collapse while the trailing filename remains visible. The shared `Toaster` style also has a viewport-safe max width, so future toast content should not rely on unbounded intrinsic sizing.

Reuse: future success toasts that include filesystem paths should use `PathToastMessage` instead of pre-shortening strings with `truncateMiddle`, so the UI can adapt to the available toast width.

Update: the shared toaster is positioned at the bottom-left of the app window.
