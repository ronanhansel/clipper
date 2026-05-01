## Motion Layer Reorder Menu

Added motion layer reorder actions to the ellipsis menu in `src/components/timeline/TimelinePanel.tsx`. The menu now shows `Move up` and `Move down` for motion layers, disabling the actions at the top and bottom bounds.

Architecture note: the reorder operation stays inside `TimelinePanel` because the layer menu already owns add/remove/hide actions and receives `onTimelineLayersChange`. It updates only `TimelineLayerState.motionLayers` through the existing history-backed editor state path, so the visual rail and timeline lanes both update from the same ordered source without introducing a new App-level callback.

Future layer menu actions should reuse `LayerLabel`'s fixed-position portal menu and route timeline layer state changes through `onTimelineLayersChange` unless the action needs scene/project mutations outside `TimelineLayerState`.
