# App Feature State Extraction

## Goal

Move feature orchestration out of `src/App.tsx` into named feature folders. The first slice focuses on timeline state/provider boundaries and file-manager prop construction while preserving existing project mutation semantics.

## Architecture Notes

- `src/app/features/timeline` owns the Timeline panel provider boundary. It bridges the current App-level timeline controller into a scoped Zustand store so Timeline UI can subscribe through a feature-local provider instead of receiving a long prop chain directly from `App.tsx`.
- `src/app/features/file-manager` owns the File Manager prop assembly and related UI wiring. The project mutation callbacks still live in `App.tsx` for now because they close over persistence/history refs; future slices should move those mutations into a project-file controller hook once project history and implicit-save scheduling are extracted.
- This slice intentionally avoids changing timeline editing behavior. It introduces the folders and state boundary first, then later timeline mutation commands can migrate behind the provider one group at a time.

## Follow-Ups

- Move timeline mutation commands from `App.tsx` into `src/app/features/timeline/timelineCommands.ts` or a `useTimelineController` hook once project update/history APIs are exposed as a small service.
- Move asset/composition/timeline file mutations from `App.tsx` into a file-manager controller after implicit file-operation saves are extracted from the root component.

## Verification

- `npm run typecheck` passes after introducing `TimelineProvider`, `ConnectedTimelinePanel`, and `FileManagerWorkspace`.
