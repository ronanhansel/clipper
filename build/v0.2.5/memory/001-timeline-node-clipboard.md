# Timeline Node Clipboard

## Goal

Enable Cmd/Ctrl+C, Cmd/Ctrl+X, and Cmd/Ctrl+V for timeline nodes while keeping compositions unavailable for copy/paste. Add right-click context menus for timeline nodes.

## Architecture Note

The feature lives in `App.tsx` because clipboard contents depend on canonical project state, selection state, history updates, and context menu actions. `TimelinePanel.tsx` only reports node right-clicks with node identity so rendering stays separate from project mutation. Reuse this split for future timeline node actions: keep DOM/menu event wiring in the panel and mutation/selection logic in the app shell.
