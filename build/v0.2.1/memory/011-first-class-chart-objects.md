# First-Class Chart Objects

## Goal

Make charts editable as atomic frame objects instead of generated loose rect/text/svg parts. A selected chart should expose all supported chart configuration in the inspector, render its internal axes/marks privately, and support spreadsheet-style data editing.

## Architecture Notes

- Chart schema and generation live in `src/core/chart.ts` so the editor preview, inspector, tests, and authored part API share one source of truth.
- `FrameObjectType` includes `chart`, and `FrameObject.chart` stores the canonical `ChartSpec`. The object `bounds` remains the editor's transform/selection box and is kept in sync with `chart.bounds` by object updates.
- `clipper/projects/part-api.ts` re-exports chart types and helpers from core. `defineChart()` returns both a first-class `object` and generated `objects` for compatibility with existing authored sources.
- Preview renders chart objects atomically by generating private evaluated child objects inside the wrapper. Inner chart elements do not receive `data-object-id` and are `pointer-events-none`, so clicks select the chart wrapper.
- The inspector should route `object.type === "chart"` to `ChartInspector`, including a themed spreadsheet data dialog.

## Reuse Guidance

- Reuse `generateChartObjects()` whenever chart internals are needed for rendering/export previews.
- Prefer updating `FrameObject.chart` through the chart inspector rather than editing generated internals.
- If chart export/rendering gains a separate runtime, use the core chart generator instead of duplicating chart layout logic.

## Implementation Status

- Added `src/core/chart.ts` with shared chart schema, `defineChart()`, first-class `chartObject()`, and `generateChartObjects()`.
- `defineChart().objects` now returns the atomic chart object for existing authored `objects: chart.objects` usage; generated internals are available as `generatedObjects`.
- Preview renders `chart` objects through private generated children with pointer events disabled.
- Inspector routes chart selections to `ChartInspector`, including typed controls for supported chart options and a Glide Data Grid data editor dialog.
- Migrated `prt_chart_showcase.ts` from old baked generated chart pieces to authored first-class `defineChart()` card objects so selecting a showcase chart opens chart settings.
- Tests, typecheck, and production build passed after the change.
