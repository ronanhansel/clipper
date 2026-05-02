# 001 - Version Bump

## Summary

The active project version is v0.2.9. Version-specific planning and memory should be written under `build/v0.2.9/`.

## Notes

- `package.json` already reports version `0.2.9`.
- `AGENTS.md` explicitly points agents at the current active version folder, `build/v0.2.9/`.
- `.gitignore` keeps general build output ignored while allowing `build/v0.2.9/` docs and memory to be tracked.
- Future agents should continue using `build/v0.2.9/memory/` for all code-change documentation until the project version changes again.
