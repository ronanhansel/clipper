# 003 Tailwind UI Refactor

## Context

- User reported that the application still felt like a placeholder and that the in-app macOS traffic-light bar was an erroneous duplicate artifact when running under Electron native chrome.
- User requested project instructions to require Tailwind CSS classes instead of grouping component styles in a centralized CSS file.

## Work Log

- Added Tailwind CSS through the Vite plugin so renderer code can use utility classes directly.
- Updated `AGENTS.md` to require Tailwind utility classes for component styling and to keep CSS files limited to imports/base rules.
- Removed the in-app traffic-light cluster from the top toolbar so only the native macOS window controls remain.
- Refactored the editor shell away from centralized `src/styles.css` component selectors toward Tailwind utility classes in React markup.

## Verification

- `npm run typecheck` passes.
- `npm test` passes.
- `npm run build` passes.
