# 004 - Remove Explicit Names And IDs

## Summary

Composition and timeline identities should be derived from project-relative file paths. Explicit names and persisted IDs must not override path-derived identity for File Manager activation or drag/drop behavior.

## OsFileManager Timeline ID Fix

- Updated `src/components/OsFileManager.tsx` so `.timeline.json` nodes always set `timelineId` with `projectRelativeFilePath(childPath, projectDirectory)`.
- Directory tree loading no longer accepts `json.id` from `.timeline.json` contents as identity.
- The file contents are still parsed opportunistically to preserve validation/read behavior, but parsed metadata is not used for identity.

## Architecture Note

Path-derived identity keeps File Manager selection, timeline activation, and drag payloads aligned with the user's filesystem layout. Persisted timeline metadata can remain useful as optional document data, but it should not determine File Manager node identity.
