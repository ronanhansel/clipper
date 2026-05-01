# Pan Target Rotation Reset

## Context

- The pan marker inspector lets users pick a target directly from the frame.
- Picking a pan target should temporarily reset camera rotation in the frame preview for clearer targeting.

## Architecture Notes

- The frame pick interaction is orchestrated in `src/App.tsx`, while the camera preview transform is computed in `src/core/camera.ts`.
- Pan target picking already suppresses pan layers through `pickingTranslationPosition`; rotation layers now use the same option so the preview is upright without mutating saved rotate markers.
