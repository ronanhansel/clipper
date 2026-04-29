## Compose Layer Front-To-Back Order

The compose Layers panel now presents layers top-to-bottom as front-to-back.

Architecture note: `src/components/compose/ComposeLayersPanel.tsx` keeps the underlying `Part.objects` array in render order, where later objects render in front. The panel reverses object and background-element display lists for layer readability, and maps Arborist drop indices back to render-order insertion indices before calling `onReorderObjects`. This keeps preview/render semantics centralized in the existing composition object order while making the UI match standard layer-stack expectations.

Future work should reuse this display-index-to-render-index mapping if adding explicit layer ordering controls, keyboard moves, or context-menu actions in the compose layer panel.
