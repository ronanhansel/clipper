# Graph Running Head Tracker

## Summary
- Added an invisible `graph-running-head` object to Slide 04 (`prt_graph_interfaces`) in the white serif demo project manifest.
- The object starts at the chart line's first point and uses the same `delay`, `duration`, and eased path offsets as the animated template line head.
- Added it in both the scene composition and the composition library copy so tracker follow can target `graph-running-head` consistently.

## Architecture Note
- The existing graph line is a `template` object whose live SVG head is internal HTML, so tracker follow cannot target it directly through `followId`.
- A separate tiny transparent `rect` keeps tracker integration compatible with the existing camera follow path, which resolves frame objects by id and applies their motion translation.
- Future animated template elements that need tracker follow should expose a companion frame object with matching motion rather than relying on nested HTML/SVG ids.
