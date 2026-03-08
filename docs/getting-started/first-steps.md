# First steps

This guide explains the jjvs UI layout and what each panel shows after you open a jj repository.

## Prerequisites

- jjvs installed and activated (see [Installation](installation.md))
- A jj repository open in VSCode

## Opening a jj repository

Open a folder that contains a `.jj/` directory using **File → Open Folder**. jjvs activates
automatically when it detects a `.jj/` directory.

For colocated repositories (those with both `.jj/` and `.git/` directories), jjvs detects
the colocated state at startup and will surface git-specific operations when they become
available in a later phase.

## The UI layout

### Activity Bar: Jujutsu icon

The Jujutsu icon in the Activity Bar (left sidebar) opens the **Jujutsu panel**, which
contains three tree views stacked vertically:

| View | What it shows |
|------|---------------|
| **Revisions** | The revision log — your commit history as a navigable tree |
| **Bookmarks** | Local and remote bookmarks *(available in Phase 10)* |
| **Operation Log** | The jj operation history for undo/redo *(available in Phase 11)* |

### The Revisions view

The Revisions view is the primary navigation surface. It shows the revision log in the
same order as `jj log`, with each revision displayed on its own row.

Each row shows:

- **Graph characters** — the DAG graph prefix (e.g., `◉`, `○`, `│`, `╭`) showing the
  revision's position in the history graph
- **Change ID** — the first 12 characters of the revision's change ID
- **Author** — the author's name
- **Relative timestamp** — how long ago the revision was created (e.g., `2 hours ago`)
- **Description** — the first line of the commit message, or `(no description set)` if empty
- **Bookmark badges** — any bookmarks pointing at this revision

The working-copy revision (the one you are currently editing) is highlighted with `@`.

By default the view shows up to 50 revisions. A **Load more** item appears at the bottom
if more revisions exist. You can change the limit with the `jjvs.logLimit` setting.

### The Source Control view

jjvs also registers a **Jujutsu** provider in VSCode's built-in Source Control view
(`Ctrl+Shift+G` / `Cmd+Shift+G`). This view shows:

- **Working copy changes** — files that have been modified, added, or deleted in the
  current working-copy revision, grouped by change type
- **SCM input box** — the description of the current working-copy revision; editing this
  text and pressing `Ctrl+Enter` (or clicking the ✓ button) runs `jj describe`

File entries in the SCM view have colored badges indicating their status:

| Badge | Meaning |
|-------|---------|
| `M` | Modified |
| `A` | Added |
| `D` | Deleted |
| `R` | Renamed |
| `C` | Copied |
| `!` | Conflict |

### Inline gutter diffs

When you open a file that has been modified in the working copy, jjvs provides inline
gutter diff indicators (green bars for additions, red triangles for deletions) in the
editor. These show the diff against the parent revision's version of the file.

Clicking a gutter indicator opens a diff hunk in the editor gutter, exactly as VSCode's
built-in git diff integration works.

### The status bar

jjvs does not yet add status bar items (planned for Phase 10). The Jujutsu output channel
(`View → Output → Jujutsu`) shows diagnostic information including the detected jj version
and repository path.

## jj's working-copy model

jj's working copy works differently from git's:

- In jj, the working copy is always a revision. Changes you make to files are automatically
  part of the current working-copy revision (there is no "staging area").
- The concept of "uncommitted changes" in git maps to "changes in the working-copy revision"
  in jj. You do not need to stage files before describing or creating a new revision.
- `jj describe` sets the description (commit message) of the working-copy revision without
  creating a new revision. `jj new` creates a new empty revision on top of the current one.

This is why the SCM input box in jjvs shows the current revision's description rather than
a "new commit" message: editing it changes the description of the revision you are already on.

## What's next

- [Basic workflow](basic-workflow.md) — a guided walkthrough of viewing changes, describing work, and creating new revisions
- [Revsets guide](../guides/revsets.md) — filtering the revision log with revset expressions
