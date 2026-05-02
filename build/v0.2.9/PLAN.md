# v0.2.9 Plan

## Focus

v0.2.9 hardens File Manager persistence and identity behavior so user-visible file operations are queued/durable and composition/timeline activation relies on project-relative paths instead of explicit names or embedded IDs.

## Goals

- Keep File Manager operations durable by routing mutations through queued host-side workflows.
- Treat composition and timeline identities as path-derived values for activation, drag/drop, and project state reconciliation.
- Remove reliance on explicit timeline IDs or manually supplied names where file paths already provide stable identity.
- Preserve component-authored composition source and avoid regenerating source into JSON/object-list authoring styles.

## Status

- Version documentation and memory live under `build/v0.2.9/`.
- File Manager timeline tree loading now derives timeline IDs from project-relative `.timeline.json` paths and ignores persisted `json.id` for identity.
