## Neutral Tracker Indicators

- Removed missing-tracker red text styling from the pan tracker `Input` in `TranslationInspector`.
- Removed missing-tracker red coloring from the timeline block tracker link icon. Tracker icons now remain neutral white when a `followId` is present.

Architecture note: tracker presence remains visible in `TimelineBlock` content through the shared motion block rendering path, but missing tracker validation should not be communicated with red timeline or inspector field styling unless a dedicated validation UX is added.
