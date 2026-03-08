# Rebasing revisions

This guide covers how to rebase revisions using jjvs — moving one or more
commits from their current position in the DAG to a new location.

**Prerequisites**: A jj repository open in VSCode with the Revisions view
visible. You should be familiar with the basics of the Revisions view — see
[First steps](../getting-started/first-steps.md) if you are new to jjvs.

---

## Understanding jj rebase

In jj, `jj rebase` moves a set of revisions from one location in the commit
graph to another. Unlike git, jj never loses work: if the rebase creates
conflicts, those conflicts are stored inside the commits rather than blocking
the operation. You can continue working and resolve them at your own pace. See
[Working with conflicts](conflicts.md) for conflict resolution details.

jj rebase is flexible. It can move:
- **A single revision** (leaving descendants behind)
- **A revision and all its descendants** (the entire subtree)
- **An entire branch** (all connected revisions in a bookmark or branch)

And it can place the rebased revisions:
- **Onto** a destination (as its child) — the standard rebase
- **After** a destination (between it and its children)
- **Before** a destination (between it and its parents)
- **Insert after/before** — DAG insertion variants

---

## Running a rebase

### From the Revisions view

1. Select the revision you want to rebase in the **Revisions** view.
2. Press `B` (or right-click and choose **Rebase Revision...**).
3. Work through the three-step picker:

#### Step 1 of 3 — Source mode

Choose how much to rebase:

| Option | jj flag | Effect |
|--------|---------|--------|
| This revision only | `-r` | Moves only the selected revision; descendants stay in place |
| This revision and all descendants | `-s` | Moves the selected revision and its entire subtree |
| Entire branch | `-b` | Moves all connected revisions in the same branch |

**When to use each mode:**
- Use `-r` when you want to cherry-pick a commit to a different branch and
  leave its descendants where they are.
- Use `-s` (source) for the most common case: "move this commit and everything
  that depends on it."
- Use `-b` when all of your local work on a feature branch should be rebased
  together.

#### Step 2 of 3 — Destination

Select the revision you want to rebase *onto*. This is the revision that will
become the new parent (for the **Onto** placement).

Type to filter by change ID, description, or bookmark name. The source
revision is excluded from the list to prevent creating a circular graph.

#### Step 3 of 3 — Placement

Choose where to place the rebased revisions relative to the destination:

| Option | jj flag | Effect |
|--------|---------|--------|
| Onto (as a child) | `--destination` | Standard rebase: source becomes a child of destination |
| After (insert before its children) | `--after` | Source slides between destination and its children |
| Before (insert after its parents) | `--before` | Source slides between destination and its parents |
| Insert after | `--insert-after` | DAG insertion variant of after |
| Insert before | `--insert-before` | DAG insertion variant of before |

For most rebases, **Onto** is what you want. The insert variants are useful
when rearranging commits within a linear stack without disturbing ancestors or
descendants outside the moved section.

---

## Handling conflicts after rebase

jj rebase always succeeds — even if the rebase creates conflicts in one or
more revisions. Conflicted revisions are committed with conflict markers in
their files.

When a rebase creates conflicts, jjvs shows a notification:

> **Rebase succeeded. N revisions have conflicts. Resolve them to continue.**

Click **Resolve Conflicts** to open the conflict resolver immediately, or
dismiss the message and resolve conflicts later. The Revisions view marks all
conflicted revisions with a warning icon `⚠`.

### Resolving conflict cascades

When a rebase creates conflicts in multiple revisions (a common outcome when
rebasing a long chain), resolve from the oldest affected revision forward:

1. Select the oldest conflicted revision in the Revisions view.
2. Run **Resolve Conflicts...** (keybinding `R` or right-click → Resolve
   Conflicts...) and work through the merge tool.
3. After saving, refresh the view (`jjvs.refresh`).
4. Check whether descendant conflicts resolved automatically — jj propagates
   resolutions through the chain when possible.
5. Repeat for any remaining conflicted revisions.

See [Working with conflicts](conflicts.md) for a detailed walkthrough of
the conflict resolution workflow.

---

## Undoing a rebase

If a rebase produces unexpected results, use `jj undo` to restore the
repository to the state before the rebase:

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Run **Jujutsu: Undo Last Operation**.

<!-- TODO(phase-11): link to operation log guide when available -->

---

## Examples

### Move a single commit to a different parent

To move commit `abc123` (and only that commit) to be a child of `main`:

1. Select `abc123` in the Revisions view.
2. Press `B`.
3. Step 1: choose **This revision only** (`-r`).
4. Step 2: select `main`.
5. Step 3: choose **Onto (as a child)**.

Equivalent to: `jj rebase -r abc123 --destination main`

### Rebase a feature branch onto updated main

To rebase an entire feature branch (including all descendants of the
branch root) onto the tip of `main`:

1. Select the root of the feature branch in the Revisions view.
2. Press `B`.
3. Step 1: choose **This revision and all descendants** (`-s`).
4. Step 2: select `main`.
5. Step 3: choose **Onto (as a child)**.

Equivalent to: `jj rebase -s <branch-root> --destination main`

### Insert a commit between two existing commits

To insert commit `xyz789` between `parent` and `child` without disturbing
other branches:

1. Select `xyz789` in the Revisions view.
2. Press `B`.
3. Step 1: choose **This revision only** (`-r`).
4. Step 2: select `parent`.
5. Step 3: choose **After (insert before its children)**.

Equivalent to: `jj rebase -r xyz789 --after parent`

---

**Related**:
[Commands reference — jjvs.rebase](../reference/commands.md#jjvsrebase) |
[Working with conflicts](conflicts.md) |
[Revisions guide](revisions.md) |
[Keyboard shortcuts](../reference/keyboard-shortcuts.md)
