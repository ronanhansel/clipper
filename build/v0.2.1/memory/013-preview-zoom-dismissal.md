# Preview Zoom Dismissal

- Updated the preview zoom popover so pointer-down events outside the zoom control and its trigger close it.
- Kept the outside-dismiss boundary in `App.tsx` around the existing relative trigger wrapper so clicking the zoom button itself still toggles normally.
- Reduced the `FrameZoomBar` panel and +/- button radii for a squarer, more utility-style control while preserving the existing dark toolbar visual language.
- Tightened the +/- zoom buttons from `40x36` to `32x32` and reduced the popover gap so the fixed-width panel gives more horizontal room to the slider.
