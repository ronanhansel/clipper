# 003 - Queued File Operations

## Summary

File Manager operations for v0.2.9 are expected to be queued and durable so filesystem mutations are serialized through the app's host/project workflows instead of being treated as disposable UI-only actions.

## Architecture Note

- Keep durable file mutation concerns near the File Manager and host filesystem adapter boundaries.
- UI components should request semantic operations and let the queued operation layer handle ordering, persistence, and failure reporting.
- Avoid broad project writes during transient UI interactions; commit final file operation results once each operation resolves.

## Final Safety

- Added rollback compensation to `MoveCommand` so multi-path moves reverse already-applied renames if a later rename fails. Rollback is attempted in reverse order and incomplete rollback is surfaced with an `AggregateError`.
- Hardened the project document filesystem queue with a generation counter and recovery promise. A filesystem failure advances the generation, cancels stale queued operations before they mutate disk, starts an authoritative reload, and allows later operations to proceed after recovery.
- Restored saved project and composition-source snapshots during optimistic rollback so failed implicit saves do not mark failed optimistic state as saved.
- Added targeted tests for chained optimistic path rebasing (`A -> B -> C`) and partial rollback for multi-path move failures.

## Reuse Guidance

When adding new File Manager mutations, reuse the queued operation path rather than adding direct ad hoc filesystem calls from drag, rename, create, delete, or move handlers.
