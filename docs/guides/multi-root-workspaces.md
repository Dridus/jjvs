# Multi-root workspaces

This guide explains how jjvs handles multiple jj repositories in a VSCode
[multi-root workspace](https://code.visualstudio.com/docs/editor/multi-root-workspaces).

**Prerequisites**: jjvs installed and activated, a multi-root workspace configured.

---

## What is a multi-root workspace?

A multi-root workspace is a VSCode workspace that contains more than one root folder.
You create one by adding folders via **File → Add Folder to Workspace...** and saving
the resulting `.code-workspace` file. This is common when working on projects that
span multiple repositories — for example, a monorepo with separately checked-out
satellite repos, or a client/server project with independent version histories.

---

## How jjvs discovers repositories

On activation, jjvs scans every root folder in the workspace for a `.jj/` directory.
Each root folder that contains one becomes an independently managed repository.

- **One SCM provider per repository**: each discovered repo gets its own Jujutsu
  Source Control provider entry in the Source Control view.
- **One revision tree per workspace**: the Revisions, Bookmarks, Operation Log, and
  Evolution Log views show data from the currently *active* repository (determined by
  which file you have open in the editor, similar to how VSCode's built-in git
  extension switches context).
- **Auto-refresh is per-repository**: each repo has its own op_heads watcher. Changes
  in one repository do not trigger a refresh of the other.

---

## The active repository

jjvs tracks which repository is currently active. The active repository is the one
associated with the file you have open in the active editor. When no file is open (or
the open file does not belong to any jj repository), jjvs uses the first discovered
repository as the fallback.

The Revisions view title and the status bar items reflect the active repository.

### Switching between repositories

- **Open a file** from the repository you want to work with — the views update
  automatically to show that repo's state.
- If you have multiple repositories and want to pin the view to one, use the
  **Filter by Revset...** command to set a repository-specific revset like
  `trunk().. | @`.

---

## Commands in a multi-root workspace

All jjvs commands operate on the active repository. When you run a command such as
**Jujutsu: New Revision...** or **Jujutsu: Rebase Revision...**, jjvs targets the
repository that was active at the moment you triggered the command.

If you need to run a command on a non-active repository, first open a file from that
repository to switch the active context.

---

## Context keys in a multi-root workspace

When-clause context keys reflect the aggregate state across all repositories:

| Key | Multi-repo behaviour |
|-----|---------------------|
| `jjvs:hasRepository` | `true` if any root folder has a jj repo |
| `jjvs:isColocated` | `true` if the *active* repository is colocated |
| `jjvs:hasConflicts` | `true` if the *active* repository has conflicts |
| `jjvs:revisionSelected` | set by the Revisions view, regardless of which repo is active |
| `jjvs:fileSelected` | set by the Details view, regardless of which repo is active |

---

## Known limitations

- **Repository switching is implicit**: there is no explicit repository switcher UI.
  Switching happens automatically when you open a file from a different repo. If the
  behaviour feels surprising, check which file is currently focused in the editor.
- **Nested repositories are not supported**: if you open a folder that is itself a jj
  repo AND contains a sub-folder that is also a jj repo, jjvs only recognises the
  outermost repo for that root.
- **SCM view may show multiple providers**: VSCode shows all SCM providers side by
  side. If you have two jj repos, you will see two Jujutsu providers in the Source
  Control view. This is expected.

---

**Related**: [Settings reference](../reference/settings.md) |
[Context keys reference](../reference/context-keys.md) |
[Commands reference](../reference/commands.md)
