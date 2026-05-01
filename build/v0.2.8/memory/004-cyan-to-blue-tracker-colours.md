## Cyan to Blue Tracker Colours

- Replaced cyan (#37d6c2) with blue (#159dff / `selectorBlue`) across tracker-related active/picking states for visual consistency.
- Changed files:
  - `FramePreview.tsx`: picking frame ring (both focus and tracker), central point dot
  - `InspectorPanels.tsx` (MotionInspector): focus picker, position picker, and tracker picker button active/hover states
  - `PlaybackBar.tsx`: Magnetic scrub, Snap selector, and Preview zoom toggle active backgrounds and shadows

Architecture note: the canonical blue is `selectorBlue` defined in `src/app/config.ts`. Future active-state accents for picker/toggle UI should reference this constant or the `#159dff` hex value.

## Reset Camera on All Picker Modes

- When any target selection button is clicked (focus, position, or tracker), all motion effects are now reset so users can select objects on a flat, untransformed frame.
- Previously only tracker picking reset motion; now `focusPicking`, `pickingTranslationPosition`, and `pickingZoomFocus` also trigger `resetMotionEffects` in `getLayeredCameraPreviewTransform`.
- The `focusPicking` prop was also added to the `useMemo` dependency array in `FramePreview.tsx`.
