# Unify Empty Parts

- Removed the `Part.kind` discriminator from the core project model so empty/spacer clips are represented as normal parts with empty `objects` arrays.
- Updated source loading, agent context export, sample data, persisted sample project data, and timeline tests to stop emitting or expecting `frame`/`blank` part kinds.
- Removed special blank-spacer preview and resize behavior so empty parts render through the same path as every other part.
- Parts with no foreground objects or background elements are still visually greyed in the parts timeline as a derived empty state, not a separate part kind.
- Tightened the timeline stack so pan, zoom, and parts rows sit directly on top of each other with square row edges and square part-row ends.
- Added extra tick-row height above the stacked timeline layers so time labels remain clear while the rows stay flush.
