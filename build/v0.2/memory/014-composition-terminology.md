# Composition Terminology

- Updated user-facing terminology so timeline parts are presented as "Compositions" in labels, tooltips, validation, source status, sample snapshot copy, and editor errors.
- Shortened the timeline composition lane label to "Comp" to fit the compact footer.
- Removed the grab/grabbing cursor styling from composition blocks in the timeline; drag behavior remains wired through native draggable handlers.
- Renamed the timeline mode tab label from "Composition" to "Direct" while preserving the internal `"composition"` timeline mode value.
- Renamed the left panel "Tools" tab to "Effects" while preserving the existing internal tab key.
- Swapped the left panel Effects tab icon from wrench to sparkles.
- Left internal `Part` type and part-source API names unchanged to avoid a broad schema/API migration.
