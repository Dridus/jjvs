# Jujutsu for VSCode — Documentation

**jjvs** is an open-source [Jujutsu (jj)](https://github.com/martinvonz/jj) extension for VSCode
and Cursor. It brings revision history navigation, SCM integration, revset filtering, and the
core jj workflow into VSCode's native UI paradigms.

---

## Current feature status

| Feature | Status |
|---------|--------|
| Revision log tree view | Available |
| SCM provider (Source Control view) | Available |
| Inline gutter diffs | Available |
| File decorations (modified/added/deleted/conflicted) | Available |
| Revset filtering with autocomplete | Available |
| Auto-refresh on repository changes | Available |
| Multi-repository workspace support | Available |
| Bookmarks tree view | Available |
| Operation log tree view | Available |
| Evolution log view | Available |
| Revision commands (new, edit, abandon, split, squash, etc.) | Available |
| Conflict handling | Available |
| Rebase | Available |
| Git push/fetch | Available |
| Revision details view | Available |
| File-level operations (restore, squash, split by file) | Available |
| Preview panel | Available |
| Revision graph webview | Available |

---

## Documentation structure

This documentation follows the [Diataxis framework](https://diataxis.fr/), organizing
content by the reader's goal rather than by feature area.

### Getting started

Step-by-step tutorials for new users:

- [Installation](getting-started/installation.md) — prerequisites, installation, and first-run verification
- [First steps](getting-started/first-steps.md) — the UI layout and what each view shows
- [Basic workflow](getting-started/basic-workflow.md) — viewing revisions, making changes, describing work

### Guides

Task-oriented how-to articles for specific workflows:

- [Revsets](guides/revsets.md) — filtering the revision log with revset expressions
- [Revisions](guides/revisions.md) — creating, editing, abandoning, splitting, and squashing
- [Bookmarks](guides/bookmarks.md) — browsing and managing bookmarks
- [Rebasing](guides/rebasing.md) — rebase workflows
- [Conflicts](guides/conflicts.md) — understanding and resolving jj conflicts
- [Git integration](guides/git-integration.md) — push, fetch, colocated repos
- [Operation log](guides/operation-log.md) — undo, redo, restoring previous state
- [Multi-root workspaces](guides/multi-root-workspaces.md) — multiple repositories

### Reference

Exhaustive lookup tables:

- [Commands](reference/commands.md) — all registered commands with IDs and descriptions
- [Settings](reference/settings.md) — all `jjvs.*` settings with types, defaults, and examples
- [Revset functions](reference/revset-functions.md) — built-in revset functions with signatures
- [Context keys](reference/context-keys.md) — when-clause context keys for keybinding customization
- [Keyboard shortcuts](reference/keyboard-shortcuts.md) — default keybindings
- [Troubleshooting](reference/troubleshooting.md) — common problems and solutions
