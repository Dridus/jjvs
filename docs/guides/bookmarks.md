# Bookmarks

This guide covers browsing bookmarks in the Bookmarks tree view, and creating,
moving, deleting, tracking, and untracking remote bookmarks.

**Prerequisites**: A jj repository is open in VSCode/Cursor. For remote bookmark
operations (track, untrack), you need a colocated (jj+git) repository with at least
one configured remote.

---

## Understanding jj bookmarks

In jj, a **bookmark** is a named pointer to a revision — similar to a git branch.
Bookmarks come in two kinds:

| Kind | What it is |
|------|-----------|
| **Local** | A bookmark you've created or fetched. Lives in your repository. |
| **Remote** | A reference to a bookmark on a remote (e.g., `main@origin`). Shown as `name@remote`. |

Unlike git branches, jj bookmarks do **not** automatically advance when you create
new revisions. You move them explicitly with `jj bookmark move` or by pushing to a
remote.

**Tracked vs untracked remote bookmarks**: A remote bookmark can be *tracked* (jj
maintains a local reference that `jj git fetch` updates) or *untracked* (the remote
bookmark exists but jj ignores it on fetch). When you clone a repository, all remote
bookmarks start as tracked.

---

## Browsing bookmarks

The **Bookmarks** view (in the Jujutsu activity bar panel) shows two sections:

- **Local** — your local bookmarks, sorted alphabetically
- **Remote** — remote-tracking bookmarks, shown as `name@remote`

Each bookmark item shows:
- The bookmark name (local) or `name@remote` (remote)
- The target commit ID (first 12 characters) after `→`
- A warning icon if the bookmark is **conflicted** (multiple commits claim the same name)
- A tracking state icon: `$(cloud)` for tracked, `$(cloud-download)` for untracked

The section header shows the count of bookmarks in that section.

Hover over any bookmark item to see the full commit ID and tracking details.

---

## Creating a bookmark

Create a new local bookmark and attach it to a revision.

### From the Bookmarks view toolbar

1. Click the **+** (Create Bookmark) icon in the Bookmarks view toolbar.
2. In the input box, type a name for the bookmark (no spaces allowed).
3. A revision picker appears — select the revision to attach the bookmark to.
   The working copy (`@`) is pre-selected.
4. Press **Enter** to confirm.

### From the Command Palette

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Run **Jujutsu: Create Bookmark...**.
3. Follow the same prompts as above.

Equivalent to: `jj bookmark create <name> -r <changeId>`

---

## Moving a bookmark

Move a local bookmark to point to a different revision.

### From the Bookmarks view

1. Right-click a **local** bookmark item.
2. Select **Move Bookmark...**.
3. A revision picker appears — select the new target revision.
4. Press **Enter** to confirm.

### From the Command Palette

1. Run **Jujutsu: Move Bookmark...**.
2. Select the bookmark to move from the QuickPick list.
3. Select the new target revision.

Equivalent to: `jj bookmark move <name> --to <changeId>`

> **Note**: jj prevents moving a bookmark backwards (to an ancestor of its current
> target) by default. If you need to move a bookmark backwards, you must do so from
> the terminal with `jj bookmark move --allow-backwards <name> -r <revset>`.

---

## Deleting a bookmark

Remove a local bookmark. When you next push to a remote, the bookmark will be
deleted on the remote as well.

### From the Bookmarks view

1. Right-click a **local** bookmark item.
2. Select **Delete Bookmark**.
3. Confirm in the modal dialog.

### From the Command Palette

1. Run **Jujutsu: Delete Bookmark**.
2. Select the bookmark from the QuickPick list.
3. Confirm.

Equivalent to: `jj bookmark delete <name>`

> **Tip**: Use **Forget Bookmark** instead of **Delete** if you want to remove the
> local reference without affecting the remote bookmark.

---

## Forgetting a bookmark

Remove the local bookmark reference without affecting the remote. The remote
bookmark remains intact; jj simply stops tracking it locally.

### From the Bookmarks view

1. Right-click a **local** bookmark item.
2. Select **Forget Bookmark**.
3. Confirm in the modal dialog.

### From the Command Palette

1. Run **Jujutsu: Forget Bookmark**.
2. Select the bookmark from the QuickPick list.
3. Confirm.

Equivalent to: `jj bookmark forget <name>`

| Operation | Local removed? | Remote affected? |
|-----------|---------------|-----------------|
| Delete    | Yes           | Yes (on next push) |
| Forget    | Yes           | No               |

---

## Tracking a remote bookmark

Start tracking an untracked remote bookmark. After tracking, `jj git fetch` updates
the local reference when the remote bookmark moves.

### From the Bookmarks view

1. In the **Remote** section, find an untracked bookmark (shown with `$(cloud-download)` icon).
2. Right-click the item.
3. Select **Track Remote Bookmark**.

### From the Command Palette

1. Run **Jujutsu: Track Remote Bookmark**.
2. A QuickPick lists all untracked remote bookmarks — select one.

Equivalent to: `jj bookmark track <name>@<remote>`

---

## Untracking a remote bookmark

Stop tracking a remote bookmark. The remote bookmark remains on the server; jj
removes the local tracking reference.

### From the Bookmarks view

1. In the **Remote** section, find a tracked bookmark (shown with `$(cloud)` icon).
2. Right-click the item.
3. Select **Untrack Remote Bookmark**.

### From the Command Palette

1. Run **Jujutsu: Untrack Remote Bookmark**.
2. A QuickPick lists all tracked remote bookmarks — select one.

Equivalent to: `jj bookmark untrack <name>@<remote>`

---

## Undoing bookmark operations

All bookmark operations go through jj's operation log, so they can be undone.

From the Command Palette, run **Jujutsu: Undo Last Operation** after a bookmark
change to roll back.

<!-- TODO(phase-11): add direct link to operation log guide once Phase 11 is implemented -->

---

## Examples

### Creating a feature bookmark on the current working copy

1. Click **+** in the Bookmarks view toolbar.
2. Enter `feature-login` as the bookmark name.
3. Accept the pre-selected working copy (`@`) in the revision picker.

Equivalent to: `jj bookmark create feature-login -r @`

### Marking a release bookmark on a specific revision

1. Run **Jujutsu: Create Bookmark...** from the Command Palette.
2. Enter `v1.0` as the name.
3. In the revision picker, navigate to the release revision and press Enter.

Equivalent to: `jj bookmark create v1.0 -r <commitId>`

### Moving a bookmark after squashing

After squashing two revisions together, the bookmark on the old revision is now
pointing to an abandoned commit. Move it to the new squashed revision:

1. Right-click the affected local bookmark in the Bookmarks view.
2. Select **Move Bookmark...**.
3. Select the new squashed revision.

Equivalent to: `jj bookmark move <name> --to <newChangeId>`

---

**Related**: [Commands reference](../reference/commands.md) | [Git integration](git-integration.md) | [Revision operations](revisions.md)
