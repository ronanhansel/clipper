# Part Duration Limit

- Increased `MAX_PART_DURATION_SECONDS` from `10` to `60` in `src/core/types.ts` so individual parts can run up to one minute.
- Updated the part validation error copy in `src/core/timeline.ts` to describe the one-minute limit.
- Left `MAX_SCENE_DURATION_SECONDS` unchanged at `30 * 60`, preserving the existing scene limit.
