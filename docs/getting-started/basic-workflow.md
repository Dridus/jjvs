# Basic workflow

This guide walks through the most common day-to-day jj workflow using jjvs: viewing
the revision log, making file changes, describing your work, creating new revisions,
and filtering with a revset expression.

## Prerequisites

- jjvs installed and activated (see [Installation](installation.md))
- A jj repository open in VSCode (see [First steps](first-steps.md))

## Step 1: View the revision log

Open the Jujutsu panel by clicking the Jujutsu icon in the Activity Bar, then expand the
**Revisions** view.

You will see your repository's revision history. The working-copy revision (where your
current edits go) is marked with `@` in the graph prefix. Revisions above it are ancestors;
revisions below that branch off are other lines of work.

Each row shows the change ID, author, age, and description. If a revision has bookmarks
(branches) pointing at it, they appear as small pills on the row.

## Step 2: Make changes to files

Edit files in your workspace as you normally would. jjvs watches `.jj/repo/op_heads/`
for changes and automatically refreshes the views when your repository state changes.

As soon as you save a file, the change appears in the **Source Control** view
(`Ctrl+Shift+G` / `Cmd+Shift+G`) under the Jujutsu provider. Files are grouped by status
(modified, added, deleted).

You can click any file in the Source Control view to open a diff editor showing exactly
what changed relative to the parent revision.

## Step 3: Describe your changes

The SCM input box at the top of the Jujutsu Source Control provider shows the description
of your current working-copy revision.

To set or update the description:

1. Click in the SCM input box (it may show `(no description set)` if empty)
2. Type a description — conventionally a short summary on the first line, followed by
   an optional blank line and more detail
3. Press `Ctrl+Enter` (or `Cmd+Enter` on macOS), or click the ✓ button

This runs `jj describe` in the background and updates the revision's description. The
revision tree refreshes to show the new description.

## Step 4: Create a new revision

To start working on a new, separate piece of work on top of your current revision, run
`jj new` from the terminal:

```
jj new
```

jjvs detects the change (via the op_heads watcher) and refreshes the views. The new
empty revision becomes the working-copy revision (shown with `@`), and your previous
revision is now a parent.

Revision commands like `jj new`, `jj edit`, and `jj abandon` are planned as UI commands
in Phase 7 and will be available from the Revisions view context menu and command palette.
For now, run them from the integrated terminal.

## Step 5: Filter the revision log with a revset

For larger repositories, you can filter the Revisions view to show only revisions matching
a [revset expression](https://martinvonz.github.io/jj/latest/revsets/).

Click the **Filter by Revset...** icon (funnel icon) in the Revisions view toolbar, or
run the command `Jujutsu: Filter by Revset...` from the command palette.

A quick-pick input box appears with:

- A text field for typing a revset expression
- Autocomplete suggestions for built-in functions, your bookmarks, and revset aliases
- A history of previously used revset expressions

Some useful filters to try:

| Revset | Shows |
|--------|-------|
| `mine()` | Only revisions you authored |
| `trunk()..` | Revisions between trunk and all heads (your local work) |
| `description(fix)` | Revisions whose description contains "fix" |
| `bookmarks()` | Revisions with local bookmarks |
| `conflicts()` | Revisions with unresolved conflicts |

Press `Enter` to apply the filter. The Revisions view title updates to show the active
filter (e.g., `filter: mine()`). To clear the filter, open the input again and use the
**Clear filter** button, or delete the expression and confirm.

For a full explanation of revsets and the autocomplete system, see the
[Revsets guide](../guides/revsets.md) and the
[Revset functions reference](../reference/revset-functions.md).

## What's next

- [Revsets guide](../guides/revsets.md) — detailed explanation of the revset system and common patterns
- [Commands reference](../reference/commands.md) — all available commands
- [Settings reference](../reference/settings.md) — customizing jjvs behavior
