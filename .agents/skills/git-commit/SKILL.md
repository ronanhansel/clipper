---
name: git-commit
description: Commits all current changes with a structured, conventional commit message. Inspects git status, diff, recent log, and memory files in build/[version]/memory/ to produce a descriptive message that summarizes every change with bullet points. Triggers on "commit", "git commit", "commit changes", "commit all", or similar requests to stage and commit work.
user-invocable: true
allowed-tools: Bash(git *), Read(*), Glob(*), Grep(*)
---

# Git Commit

Produces a well-formed conventional commit from the current working tree. Every change gets inventoried and summarized so reviewers can understand the full delta at a glance without re-reading the diff.

## Workflow

1. **Assess the working tree.**
   Run `git status --short` and `git diff --stat` to find all changed files (staged and unstaged). If there are no changes, stop and report nothing to commit.

2. **Read the full diff.**
   Run `git diff` (unstaged) and `git diff --cached` (staged) to understand the substance of every change. Pay attention to:
   - New files, deleted files, renames
   - New functions, classes, components, hooks, types
   - Behavioral changes, bug fixes, refactors
   - Configuration, dependency, or build changes
   - UI/styling changes

3. **Collect relevant memory context.**
   Search `build/[version]/memory/` for memory files that reference the modified files or feature areas. Use Grep to find relevant memory entries. Note any memory file IDs and their topic summaries that relate to the current changes.

4. **Review recent commit history.**
   Run `git log --oneline -10` to see the project's commit style and pick an appropriate type prefix.

5. **Draft the commit message.**

   ```
   <type>: <concise summary>
   
   - <change 1 summary>
   - <change 2 summary>
   - ...
   ```

   **First line rules:**
   - Use a conventional commit type: `feat`, `fix`, `refactor`, `chore`, `docs`, `style`, `test`, `perf`, `ci`, `build`
   - Keep the summary under 72 characters, imperative mood ("add" not "adds" / "added")
   - No trailing period

   **Body rules:**
   - One `-` bullet per logical change, not per file
   - Describe the *what and why*, not the *how*
   - Group related file changes into a single bullet when they serve the same purpose
   - Mention new files explicitly when significant (new components, modules, etc.)
   - Keep bullets ordered from most impactful to least

6. **Stage and commit.**
   ```bash
   git add -A
   git commit -m "<full message>"
   ```

   (destructive/force commands are never run without explicit user approval)

7. **Verify.**
   Run `git status` to confirm the working tree is clean and the commit succeeded.

## Commit Message Examples

Good:
```
feat: add WelcomeScreen with recent-projects list

- Add WelcomeScreen component with project list and new-project flow
- Wire platform bridge to expose recent-project paths from Electron
- Show WelcomeScreen when no active project is loaded on boot
- Persist recent project entries to app store for cross-session access
```

Bad (too vague):
```
feat: updated
```

Bad (per-file bullets with no synthesis):
```
feat: stuff

- electron/main.ts: added things
- src/App.tsx: changed some lines
- src/components/WelcomeScreen.tsx: new file
```

## Guidelines

- **One commit per cohesive unit of work.** Do not squash unrelated changes.
- **Respect `.gitignore`.** Never stage files listed in `.gitignore`.
- **Do not commit secrets or credentials.** Warn the user if any appear in the diff.
- **If the diff is large (>20 files, >300 lines),** consider asking the user whether they want to split into multiple commits.
