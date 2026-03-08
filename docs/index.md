# Jujutsu for VSCode — Documentation

**jjvs** is an open-source [Jujutsu (jj)](https://github.com/martinvonz/jj) extension for VSCode
and Cursor. It brings revision history navigation, SCM integration, revset filtering, and the
core jj workflow into VSCode's native UI paradigms.

---

## Current feature status

| Feature | Status |
|---------|--------|
| Revision log tree view | Available (Phase 6) |
| SCM provider (Source Control view) | Available (Phase 5) |
| Inline gutter diffs | Available (Phase 5) |
| File decorations (modified/added/deleted/conflicted) | Available (Phase 5) |
| Revset filtering with autocomplete | Available (Phase 6) |
| Auto-refresh on repository changes | Available (Phase 4) |
| Multi-repository workspace support | Available (Phase 4) |
| Bookmarks tree view | Planned (Phase 10) |
| Operation log tree view | Planned (Phase 11) |
| Revision commands (new, edit, abandon, etc.) | Planned (Phase 7) |
| Conflict handling | Planned (Phase 8) |
| Rebase | Planned (Phase 9) |
| Git push/fetch | Planned (Phase 10) |
| Revision details view | Planned (Phase 12) |
| Preview panel | Planned (Phase 13) |
| Graph webview | Planned (Phase 14) |

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
- [Revisions](guides/revisions.md) — creating, editing, abandoning, splitting, and squashing *(Phase 7)*
- [Bookmarks](guides/bookmarks.md) — browsing and managing bookmarks *(Phase 10)*
- [Rebasing](guides/rebasing.md) — rebase workflows *(Phase 9)*
- [Conflicts](guides/conflicts.md) — understanding and resolving jj conflicts *(Phase 8)*
- [Git integration](guides/git-integration.md) — push, fetch, colocated repos *(Phase 10)*
- [Operation log](guides/operation-log.md) — undo, redo, restoring previous state *(Phase 11)*
- [Multi-root workspaces](guides/multi-root-workspaces.md) — multiple repositories *(Phase 15)*

### Reference

Exhaustive lookup tables:

- [Commands](reference/commands.md) — all registered commands with IDs and descriptions
- [Settings](reference/settings.md) — all `jjvs.*` settings with types, defaults, and examples
- [Revset functions](reference/revset-functions.md) — built-in revset functions with signatures
- [Context keys](reference/context-keys.md) — when-clause context keys for keybinding customization *(Phase 15)*
- [Keyboard shortcuts](reference/keyboard-shortcuts.md) — default keybindings *(Phase 7)*
- [Troubleshooting](reference/troubleshooting.md) — common problems and solutions *(Phase 15)*
