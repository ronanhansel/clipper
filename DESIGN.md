# DESIGN.md — Clipper

## Overview
Clipper's design system is a love letter to motion design. Muted charcoal foundations with a warm off-white accent create a calm canvas that lets creative work shine without making the app feel blacked out. Every interaction is animated, communicating the product's core value of motion.

## Colors

### Primary Palette
| Token | Hex | Usage |
|-------|-----|-------|
| `color-brand` | `var(--clipper-accent)` (`#F4EFE4`) | Primary warm off-white accent |
| `color-bg` | `#12141A` | Default app background; muted dark charcoal, not pure black |
| `color-text` | `#FFFFFF` | Primary text |
| `color-surface` | `#1A1A1A` | Panel backgrounds |
| `color-muted` | `#555555` | Secondary text |

### Background Direction
- Avoid pure black (`#000000`) for the app shell, default page background, and primary editor surfaces.
- Use muted dark charcoal values around `#12141A` to `#171920` as the baseline so the UI feels softer and less high-contrast.
- Reserve true black only for video frames, explicit blank clips, or content previews where black is part of the media itself.

## Typography

| Role | Family | Size | Weight |
|------|--------|------|--------|
| Display | Inter | 64px | 700 |
| Heading | Inter | 40px | 600 |
| Body | Inter | 16px | 400 |
| UI | Inter | 13px | 500 |

## Components

### Implementation Rules
- Use `lucide-react` for all interface icons. Do not create custom SVG/icon components unless a required product glyph is unavailable in Lucide.
- Use shared, themed primitives for UI fundamentals: checkboxes, dropdowns/selects, text fields, textareas, dialogs, sidebars, popovers, switches, and similar controls.
- When a primitive is missing, add it from a shadcn base, theme it for Clipper's dark surfaces and off-white accent, and reuse it everywhere instead of creating one-off inline controls.
- Use shared CSS color variables from `src/styles.css` for app colors. Do not hardcode accent hex values in components; use variables such as `var(--clipper-accent)`, `var(--clipper-accent-rgb)`, and `var(--clipper-accent-foreground)`.
- Existing ad hoc/default controls should be migrated to the shared primitive when touched.
- Style component layout and visuals with Tailwind CSS utility classes rather than centralized component CSS.
- Put app-wide/global behavior and styling in `src/styles.css` instead of repeating utilities across components.

### Canvas
- Infinite pan/zoom workspace
- Grid overlay with snap points
- Frame indicators with off-white outlines

### Property Panel
- Right sidebar, 280px width
- Collapsible sections: Layout, Style, Effects
- Numeric inputs with drag-to-adjust

### Component Browser
- Left panel, searchable grid
- Drag-to-canvas interaction
- Hover preview with animation playback

## Do's and Don'ts

### Do
- Animate all state transitions (150-300ms)
- Use off-white exclusively for selection and creation states
- Keep panel backgrounds distinct from canvas

### Don't
- Don't use static transitions — everything should move
- Don't use shadows in the editor UI
- Don't use text larger than 13px in panels
