# Effect Panel Phosphor Icons

## Goal
- Replace the repeated sparkle icon on effect list rows with clearer category-specific icons.

## Architecture Notes
- The Effects panel keeps icon selection local to `src/components/ToolsPanel.tsx` because this is purely presentation and does not belong in effect manifests or core registry data.
- `renderEffectButton` chooses by `EffectDefinition.category`, using Phosphor `WaveTriangleIcon` for motion effects and `CardsIcon` for adjustment effects.
- `@phosphor-icons/react` is now a runtime dependency for these UI icons.
