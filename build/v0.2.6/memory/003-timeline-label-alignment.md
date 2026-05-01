## Timeline Label Alignment

- Adjusted `TimelinePanel` layer label buttons so their text starts at the same left edge as the timeline title above the lane rail.
- Kept the Edit/Direct mode pill compact; do not force it to the layer rail width when aligning the rail content.
- Kept the existing `LayerLabel` component boundary and only changed its button inset, so visibility/menu controls and lane sizing continue to use the existing timeline layout.
- Tightened timeline lane block layout by clipping the timeline viewport vertically, anchoring adjustment, motion, and comp blocks to their full row height, keeping bottom scrollbar space outside the lane stack, and moving selected-block outlines/shadows inside the block bounds so they do not bleed into adjacent rows.
- Moved vertical scrolling onto the same timeline viewport that owns horizontal scrolling so the horizontal scrollbar stays pinned at the bottom of the visible timeline while scrolling rows vertically. The left layer rail is translated from the timeline viewport scroll position to stay aligned.
- Removed the visible border from row resize separators and changed timeline block edge decoration from full inset rings to left/right inset shadows only, preventing top/bottom border pixels from reading as block gaps or bleed.
- User confirmed the desired final behavior: keep clear visible borders between timeline layers, but draw them as overlay row-boundary separators via `LayerResizeSeparator`, not as top/bottom borders on timeline blocks. Blocks should remain full-height within their rows with no vertical gap above and no bleed below, while the horizontal scrollbar stays pinned in the timeline viewport during vertical row scrolling.
- Row-boundary resize handles should resize the row below the separator (`edge: "top"`). The topmost layer has its own dedicated top-edge `LayerResizeSeparator` at `top={0}` so it can be resized without changing boundary handles to target the row above.
