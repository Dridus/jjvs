# Working with revisions

This guide covers how to create, navigate, describe, duplicate, abandon, split,
squash, restore, absorb, and revert revisions using jjvs commands. All commands
are accessible from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) under
the **Jujutsu** category, and from the right-click context menu in the
Revisions view.

**Prerequisites**: An open jj repository with the Revisions view visible. If
you have not yet set up jjvs, see [Installation](../getting-started/installation.md)
and [First steps](../getting-started/first-steps.md).

---

## Understanding the working copy

jj always has a *working copy* — a special revision (denoted `@`) that
represents the files currently on disk. When you edit files, the working copy
captures those changes automatically. Unlike git, there is no staging area:
every file save is immediately part of `@`.

The working copy revision is highlighted with an `→` arrow icon in the
Revisions view. Operations like `new` and `edit` change which revision is `@`.

---

## Creating a new revision

Use **Jujutsu: New Revision...** to create a new empty revision.

**From the command palette:**

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Type **Jujutsu: New Revision...** and press Enter.
3. Enter an optional description, or press Enter to leave it empty.

The new revision is created after the current working copy (`@`). If you have
a specific revision selected in the Revisions view, the new revision is created
as a child of that revision instead.

**From the Revisions view:**

- Click the **+** (Add) icon in the Revisions view toolbar, or
- Right-click any revision and choose **New Revision...** from the context menu.

When invoked from the context menu on a specific revision, the new revision
becomes a child of that revision — useful for inserting a revision into the
middle of a stack.

**What jjvs runs:**

```
jj new [<parent>] [--message <description>]
```

---

## Moving the working copy to a revision

Use **Jujutsu: Edit Revision** to move `@` to an existing revision without
creating a new one.

1. Open the Command Palette and type **Jujutsu: Edit Revision**, or
   right-click a revision and choose **Edit Revision**.
2. Select the revision from the picker (the currently selected tree item is
   pre-highlighted for quick confirmation).

After editing, `@` moves to the selected revision. Any file changes you make
will be recorded in that revision.

**What jjvs runs:**

```
jj edit <changeId>
```

> **Tip**: If you want to start working from a different point in history
> without discarding your current work, use **New Revision...** instead.
> `edit` rewrites the existing revision's content; `new` creates a fresh
> revision on top.

---

## Describing a revision

A description is jj's equivalent of a commit message. Unlike git, you can
update a description at any time without rewriting the full commit.

jjvs provides two describe variants: a quick inline input for short descriptions,
and a full editor for multi-line messages.

### Inline describe

Use **Jujutsu: Describe Revision...** for quick, single-line descriptions.

**Fast path**: If a mutable revision is already selected in the Revisions view,
invoking **Describe Revision...** opens an input box pre-filled with the current
description — no picker needed.

1. Open the Command Palette and type **Jujutsu: Describe Revision...**, or
   right-click a mutable revision and choose **Describe Revision...**.
2. If no mutable revision is selected, choose one from the picker.
3. Edit the description in the input box and press Enter.

Pressing Escape cancels without making changes. Leaving the input empty clears
the description.

**Via the SCM input box (working copy only):** For the working copy (`@`), you
can also edit the description directly in the Source Control view's input box
and press `Ctrl+Enter` / `Cmd+Enter`.

### Editor-based describe

Use **Jujutsu: Describe Revision in Editor...** for multi-line commit messages.

1. Open the Command Palette and type **Jujutsu: Describe Revision in Editor...**,
   or right-click a mutable revision and choose **Describe Revision in Editor...**.
2. If no mutable revision is selected, choose one from the picker.
3. A temporary `.jjmessage` file opens in the editor, pre-filled with the
   current description.
4. Edit the description freely — use multiple paragraphs, bullet points, etc.
5. Press `Ctrl+S` / `Cmd+S` to save. jjvs applies the description and closes
   the editor tab automatically.

Closing the editor tab without saving cancels the operation.

**What jjvs runs:**

```
jj describe --message <description> [<changeId>]
```

---

## Duplicating a revision

Use **Jujutsu: Duplicate Revision** to create an independent copy of a revision
at the same position in the DAG. The duplicate gets a new change ID and shares
no history with the original.

This is useful for:
- Experimenting with an alternative approach while keeping the original
- Creating a cherry-pick without removing the revision from its original position

1. Open the Command Palette and type **Jujutsu: Duplicate Revision**, or
   right-click a revision and choose **Duplicate Revision**.
2. Select the revision to duplicate from the picker.

The duplicate appears in the Revisions view as a sibling of the original.

**What jjvs runs:**

```
jj duplicate <changeId>
```

---

## Abandoning a revision

Use **Jujutsu: Abandon Revision** to permanently delete a revision. Any
descendant revisions are rebased onto the abandoned revision's parents.

> **Warning**: Abandon cannot be undone from within jjvs. If you abandon a
> revision by mistake, use `jj op undo` in the terminal to restore it via the
> operation log. The [Operation Log guide](operation-log.md) covers undo in
> detail.

1. Open the Command Palette and type **Jujutsu: Abandon Revision**, or
   right-click a non-immutable revision and choose **Abandon Revision**.
2. Select the revision to abandon (immutable revisions are excluded from the
   picker since jj cannot rewrite them).
3. Confirm the operation in the dialog that appears.

**What jjvs runs:**

```
jj abandon <changeId>
```

---

## Working with immutable revisions

Revisions marked **immutable** (shown with a 🔒 icon in the Revisions view)
cannot be rewritten. They are typically revisions that have been pushed to a
remote or that are ancestors of the root change.

| Command | Behaviour with immutable revisions |
|---|---|
| `edit` | Allowed — moves `@` to an immutable revision for inspection |
| `new` | Allowed — creates a mutable child of an immutable revision |
| `duplicate` | Allowed — the copy is mutable even if the original is immutable |
| `revert` | Allowed — creates a new inverse revision; the original is untouched |
| `abandon` | Excluded from picker — jj cannot abandon immutable revisions |
| `describe` | Excluded from picker — jj cannot rewrite immutable revisions |
| `split` | Excluded from picker — splitting rewrites the revision |
| `squash` | Excluded from source picker — squashing rewrites the source revision |
| `restore` | Excluded from picker — restoring rewrites the revision's files |
| `absorb` | N/A — always acts on the working copy (`@`) |

---

## Splitting a revision

Use **Jujutsu: Split Revision...** to divide a revision's changes into two
separate revisions. The original revision is replaced by the two new ones in
the DAG.

> **When to use split**: You made a large change and want to separate it into
> smaller, focused revisions before pushing. Split lets you do this without
> losing any work.

**Flow:**

1. Open the Command Palette and type **Jujutsu: Split Revision...**, or
   right-click a mutable revision and choose **Split Revision...**.
2. If no mutable revision is selected, choose one from the picker.
3. A list of all changed files in the revision appears. **Check the files that
   should go into the first (earlier) revision.** The unchecked files stay in
   the second revision.
4. Enter an optional description for the first revision, then press Enter.

The first revision contains the selected files. The second revision contains
the remaining files and keeps the original description.

> **Tip**: You cannot split a revision that has only one changed file (there is
> nothing to split).

**What jjvs runs:**

```
jj split -r <changeId> -- <selectedPaths...> [--message <firstDescription>]
```

---

## Squashing a revision

Use **Jujutsu: Squash Revision...** to merge a revision's changes into an
ancestor, removing the revision from the DAG. The default target is the direct
parent; you can also choose any other mutable ancestor.

> **When to use squash**: You have a "fixup" or "oops" commit that logically
> belongs to an earlier revision. Squash folds it in cleanly.

1. Open the Command Palette and type **Jujutsu: Squash Revision...**, or
   right-click a mutable revision and choose **Squash Revision...**.
2. If no mutable revision is selected, choose one from the picker.
3. Choose the squash target:
   - **Into parent** — squash directly into the parent (most common).
   - **Into specific ancestor...** — shows a second picker listing all mutable
     ancestors; use this when the change logically belongs further back in the
     stack (equivalent to `jj squash --into`).
4. Confirm the operation in the dialog.

After squashing, the target revision contains all changes from both revisions.

**What jjvs runs:**

```
jj squash -r <changeId> [--into <ancestorChangeId>]
```

---

## Restoring a revision to its parent state

Use **Jujutsu: Restore Revision...** to discard all changes in a revision and
reset its file contents to match its parent. This is most useful on the working
copy (`@`) to discard uncommitted changes.

> **Warning**: Restore discards all changes in the revision. This cannot be
> undone from within jjvs — use `jj op undo` in the terminal to recover via
> the operation log if needed.

1. Open the Command Palette and type **Jujutsu: Restore Revision...**, or
   right-click a mutable revision and choose **Restore Revision...**.
2. If no mutable revision is selected, choose one from the picker.
3. Confirm the operation in the dialog.

**What jjvs runs:**

```
jj restore [--into <changeId>]
```

(When restoring the working copy, `--into` is omitted and `@` is used by
default.)

---

## Absorbing working copy changes into ancestors

Use **Jujutsu: Absorb into Ancestors** to automatically move lines from the
working copy (`@`) into the ancestor revisions that last modified those same
lines. Only changes that can be unambiguously attributed to a single ancestor
are absorbed — the rest stay in the working copy.

> **When to use absorb**: You have a stack of revisions and you've made small
> tweaks to files already changed in earlier revisions. Absorb assigns each
> change to the right ancestor without you having to manually squash or split.

1. Open the Command Palette and type **Jujutsu: Absorb into Ancestors**, or
   right-click the working copy revision and choose **Absorb into Ancestors**.

No picker is needed — absorb always acts on the working copy (`@`).

**What jjvs runs:**

```
jj absorb
```

---

## Reverting a revision

Use **Jujutsu: Revert Revision...** to create a new revision whose changes are
the exact inverse of the selected revision. The inverse is placed on top of
the working copy, effectively undoing the selected revision's effect in the
current chain.

> **Revert vs. undo**: `revert` creates a NEW revision that cancels out the
> original — both remain in history. The Operation Log's undo command
> (`jj undo`) removes the entire operation from history. Use revert when you
> want to record the "un-doing" as an explicit change.

1. Open the Command Palette and type **Jujutsu: Revert Revision...**, or
   right-click any revision and choose **Revert Revision...**.
2. Select the revision to create an inverse of.
3. Confirm the operation in the dialog.

A new revision is created on top of the working copy with a description like
`"Revert '<original description>'"`.

**What jjvs runs:**

```
jj revert -r <changeId> --onto @
```

---

<!-- TODO(phase-9): add section on rebase -->

---

**Related**: [Commands reference](../reference/commands.md) |
[Revsets guide](revsets.md) | [Bookmarks guide](bookmarks.md) |
[Operation Log guide](operation-log.md)
