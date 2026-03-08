# Working with revisions

This guide covers how to create, navigate, describe, duplicate, and abandon
revisions using jjvs commands. All commands are accessible from the Command
Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) under the **Jujutsu** category, and
from the right-click context menu in the Revisions view.

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

- `abandon` and `describe` exclude immutable revisions from their pickers.
- `edit` allows moving `@` to an immutable revision (read-only inspection).
- `new` can create a child of an immutable revision (branching from it).
- `duplicate` can copy an immutable revision (the copy is mutable).

---

## Planned features

The following operations are planned for later phases:

<!-- TODO(phase-7b): add section on split -->
<!-- TODO(phase-7b): add section on squash -->
<!-- TODO(phase-9): add section on rebase -->

---

**Related**: [Commands reference](../reference/commands.md) |
[Revsets guide](revsets.md) | [Bookmarks guide](bookmarks.md) |
[Operation Log guide](operation-log.md)
