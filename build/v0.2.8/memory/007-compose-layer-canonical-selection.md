## Compose Layer Canonical Selection

Layer-row selection in Compose now survives the app-wide outside-pointer clear and can select background elements as canonical frame objects.

Architecture note: `src/components/compose/ComposeLayersPanel.tsx` marks the layer tree surface with `data-compose-layers-panel`, and `src/App.tsx` treats that surface like the inspector/code editor/select popovers in `clearFrameSelectionOnOutsidePointer()`. Rows with a `FrameObject`, including background elements, route through `selectComposeLayerObjects()` into `selectedObjectId` and `selectionPayload`; Arborist's internal drag selection remains limited to foreground object rows so background rows do not become reorder targets. `useEditorDerivedState()` and App's selection-payload refresh resolve selected objects from both `part.objects` and `part.background.elements`, and `App.updateObject()` updates either collection so the inspector can edit the selected layer object.

Layer pointer-down events stop propagation so native outside-pointer listeners cannot clear the new object selection after React handles the row. Object layer selection also clears timeline/composition clip selection (`selectedPartId`/`selectedParts`) instead of marking the active composition clip selected, keeping the inspector and blue frame selector keyed to the object selection only.

Future Compose side-panel controls that are expected to preserve canvas object selection should live inside this marked surface or add their own explicit outside-clear exemption.

The frame preview now renders the composition content inside a clipped `data-clipper-frame-preview` viewport, but renders selected object boxes as a sibling overlay in an unclipped parent. The parent reserves an invisible bleed around the frame and offsets selector coordinates into that bleed, avoiding negative-position handle clipping when an object matches or exceeds the frame bounds. This preserves exported/preview clipping for oversized objects while keeping blue selection edges and handles visible.

Selection handles are always centered on selector corners now. The previous edge-case logic pinned handles inside the frame when the selected bounds touched the frame edge, which made exact-frame selections look clipped even after moving the overlay outside the clipped viewport.

Because selector boxes now live as siblings of `data-clipper-frame-preview`, App's imperative selection-box preview helpers query from `frameViewportRef.current.parentElement` rather than inside the clipped viewport. Resize start also captures the pointer on `frameViewportRef.current`, ensuring the existing frame-level pointer move/up handlers continue to receive drag events even when the resize handle is outside the clipped frame element.

FramePreview receives `previewSelectionObjects` from App instead of the raw canonical `selectionPayload.objects`. App keeps canonical source bounds for editing, drag, and resize state, but maps the overlay objects through `evaluateFrameObject()` at the current `previewTime` and applies supported CSS transform pieces (`translate`, `translateX/Y`, `scale`, `scaleX/Y`) to selector bounds. This keeps blue boxes on the visible animated position without rewriting object source bounds.

The imperative live resize preview uses the same display-bounds mapping before writing selection-box `left/top/width/height`. Without this, resize would temporarily draw the blue box at the object's rest/source bounds during pointer movement, then jump back to the animated position after React re-rendered on release.

Selector edge resize hit targets are intentionally wider than their visible strokes. `SelectionOverlayBox` renders invisible 12px edge hit bands containing the existing 1px/2px blue line, preserving the current visual appearance while making horizontal and vertical resize gestures easier to start.

Resize math rounds transformed object edges rather than independently rounding position and size. This keeps the opposite edge stable during left/right/top/bottom and diagonal resize previews instead of letting it drift by a few pixels from accumulated rounding. Edge hit bands avoid a generic pointer cursor so resize cursors show consistently.

Animated object resize is display-bounds aware. `ObjectResize` stores the display-time selection box plus each resized object's current preview transform, and `getResizedObjects()` resizes in display space before inverting translate/scale back into canonical source bounds. This prevents a resize gesture on an animated/translated/scaled object from behaving like a move because the handles are drawn at the display position while source bounds live at the rest position.

Holding Shift during object resize preserves the display selection box aspect ratio. App tracks the latest Shift state during pointer movement and passes it through preview and commit, while `getResizedBounds()` constrains the active edge/corner around the opposite anchored side.

App also listens for global Shift keydown/keyup during an active resize and reschedules the preview with the current pointer delta. This makes the selector snap to or from the preserved aspect ratio immediately when Shift is pressed/released, without requiring another pointer movement.

Compose layer row highlights now treat App's `selectedObjectIds` as canonical. `ComposeLayersPanel` clears `selectedLayerIds` when frame/canvas selection is cleared, so outside-click or interactive-screen deselection no longer leaves a stale highlighted object row in the Layers panel.
