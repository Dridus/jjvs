# Commands reference

All commands currently registered by jjvs. Commands are accessible from the Command
Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) under the **Jujutsu** category, from view
toolbars, and from context menus.

Commands are verified against `package.json` contribution points as of Phase 8.

---

## jjvs.refresh

**Title**: Refresh  
**Category**: Jujutsu  
**Icon**: `$(refresh)`  
**Enablement**: Always available  

Refreshes all jjvs views by re-querying the jj repository. Triggers the same refresh
cycle that the auto-refresh file watcher triggers automatically.

Accessible from:
- Command palette: **Jujutsu: Refresh**
- Revisions view toolbar (refresh icon)
- Source Control view title bar (when the Jujutsu provider is active)

---

## jjvs.describeWorkingCopy

**Title**: Describe Working Copy  
**Category**: Jujutsu  
**Icon**: `$(edit)`  
**Enablement**: `jjvs:hasRepository`

Sets the description of the current working-copy revision by reading the text from the
SCM input box. Equivalent to running `jj describe -m "<text>"`.

This command is wired as the `acceptInputCommand` for the Jujutsu SCM provider. It is
triggered when you press `Ctrl+Enter` / `Cmd+Enter` in the SCM input box, or click the
✓ button.

---

## jjvs.revision.copyChangeId

**Title**: Copy Change ID  
**Category**: Jujutsu  
**Enablement**: `jjvs:revisionSelected`

Copies the full change ID of the selected revision to the clipboard. A confirmation
toast shows the first 12 characters of the copied ID.

Accessible from:
- Command palette (when a revision is selected in the Revisions view)
- Revisions view context menu: **Copy Change ID**

---

## jjvs.revision.copyCommitId

**Title**: Copy Commit ID  
**Category**: Jujutsu  
**Enablement**: `jjvs:revisionSelected`

Copies the full commit ID (git-compatible SHA) of the selected revision to the clipboard.
A confirmation toast shows the first 12 characters of the copied ID.

Accessible from:
- Command palette (when a revision is selected in the Revisions view)
- Revisions view context menu: **Copy Commit ID**

---

## jjvs.revisions.setRevset

**Title**: Filter by Revset...  
**Category**: Jujutsu  
**Icon**: `$(filter)`  
**Enablement**: `jjvs:hasRepository`

Opens the revset input quick-pick for filtering the Revisions view. The input provides:

- Autocomplete for built-in functions, revset aliases, bookmarks, and tags
- Session history (previously used revset expressions)
- A **Clear filter** button to remove the current filter

Accessible from:
- Command palette: **Jujutsu: Filter by Revset...**
- Revisions view toolbar (filter icon)

For details on writing revset expressions, see the [Revsets guide](../guides/revsets.md).

---

## jjvs.revision.new

**Title**: New Revision...  
**Category**: Jujutsu  
**Icon**: `$(add)`  
**Enablement**: `jjvs:hasRepository`

Creates a new empty revision. Prompts for an optional description. If a non-working-copy
revision is selected in the Revisions view, the new revision is created as a child of
that revision; otherwise it is created after the working copy (`@`).

Accessible from:
- Command palette: **Jujutsu: New Revision...**
- Revisions view toolbar (+ icon)
- Revisions view context menu: **New Revision...**

Equivalent to: `jj new [<parent>] [--message <description>]`

For usage details, see [Revisions guide — Creating a new revision](../guides/revisions.md#creating-a-new-revision).

---

## jjvs.revision.edit

**Title**: Edit Revision  
**Category**: Jujutsu  
**Icon**: `$(arrow-right)`  
**Enablement**: `jjvs:hasRepository`

Moves the working copy (`@`) to an existing revision. Shows a revision picker
pre-selecting the currently highlighted tree item.

Context menu: visible on non-working-copy revision items (`viewItem =~ /^revision/ && !(viewItem =~ /workingCopy/)`)

Equivalent to: `jj edit <changeId>`

For usage details, see [Revisions guide — Moving the working copy](../guides/revisions.md#moving-the-working-copy-to-a-revision).

---

## jjvs.revision.describe

**Title**: Describe Revision...  
**Category**: Jujutsu  
**Icon**: `$(edit)`  
**Enablement**: `jjvs:hasRepository`

Sets the description of a mutable revision. Opens an inline input box pre-populated
with the current description. If a mutable revision is already selected in the tree,
the picker is skipped.

Context menu: visible on mutable revision items (`viewItem =~ /^revision/ && !(viewItem =~ /immutable/)`)

Equivalent to: `jj describe --message <description> [<changeId>]`

For usage details, see [Revisions guide — Describing a revision](../guides/revisions.md#describing-a-revision).

---

## jjvs.revision.describeInEditor

**Title**: Describe Revision in Editor...  
**Category**: Jujutsu  
**Icon**: `$(go-to-file)`  
**Enablement**: `jjvs:hasRepository`

Opens the revision's current description in a full VSCode text editor for
multi-line editing. Useful for longer commit messages that are awkward to
write in the single-line InputBox of `jjvs.revision.describe`.

**Workflow**: Select a mutable revision → a temporary `.jjmessage` file opens
with the current description → edit freely → press `Ctrl+S` / `Cmd+S` to save
and apply → the editor tab closes automatically.

Context menu: visible on mutable revision items (`viewItem =~ /^revision/ && !(viewItem =~ /immutable/)`)

Equivalent to: `jj describe --message <file-contents> [<changeId>]`

For usage details, see [Revisions guide — Editor-based describe](../guides/revisions.md#editor-based-describe).

---

## jjvs.revision.duplicate

**Title**: Duplicate Revision  
**Category**: Jujutsu  
**Icon**: `$(copy)`  
**Enablement**: `jjvs:hasRepository`

Creates an independent copy of a revision at the same position in the DAG. The
duplicate gets a new change ID and shares no history with the original.

Context menu: visible on all revision items

Equivalent to: `jj duplicate <changeId>`

For usage details, see [Revisions guide — Duplicating a revision](../guides/revisions.md#duplicating-a-revision).

---

## jjvs.revision.abandon

**Title**: Abandon Revision  
**Category**: Jujutsu  
**Icon**: `$(trash)`  
**Enablement**: `jjvs:hasRepository`

Permanently removes a revision. Descendants are rebased onto the abandoned revision's
parents. Immutable revisions are excluded. Requires confirmation before proceeding.

Context menu: visible on mutable revision items (`viewItem =~ /^revision/ && !(viewItem =~ /immutable/)`)

Equivalent to: `jj abandon <changeId>`

For usage details, see [Revisions guide — Abandoning a revision](../guides/revisions.md#abandoning-a-revision).

---

## jjvs.revision.split

**Title**: Split Revision...
**Category**: Jujutsu
**Icon**: `$(split-horizontal)`
**Enablement**: `jjvs:hasRepository`

Splits a revision into two. The user selects which changed files go into the
first (earlier) revision; the remaining files stay in the second revision.

**Flow**: Select a mutable revision → multi-select files for the first revision
→ enter an optional description for the first revision → the two new revisions
replace the original in the DAG.

Context menu: visible on mutable revision items (`viewItem =~ /^revision/ && !(viewItem =~ /immutable/)`)

Default keybinding (Revisions view focused): `S`

Equivalent to: `jj split -r <changeId> -- <paths...> [--message <description>]`

For usage details, see [Revisions guide — Splitting a revision](../guides/revisions.md#splitting-a-revision).

---

## jjvs.revision.squash

**Title**: Squash Revision...
**Category**: Jujutsu
**Icon**: `$(fold-down)`
**Enablement**: `jjvs:hasRepository`

Merges a revision's changes into a target ancestor, removing the revision from
the DAG. The default target is the direct parent. A second step lets the user
pick any mutable ancestor as an alternative target (`jj squash --into`).
Requires confirmation before proceeding.

Context menu: visible on mutable revision items (`viewItem =~ /^revision/ && !(viewItem =~ /immutable/)`)

Default keybinding (Revisions view focused): `Q`

Equivalent to: `jj squash -r <changeId> [--into <target>]`

For usage details, see [Revisions guide — Squashing a revision](../guides/revisions.md#squashing-a-revision-into-its-parent).

---

## jjvs.revision.restore

**Title**: Restore Revision...
**Category**: Jujutsu
**Icon**: `$(discard)`
**Enablement**: `jjvs:hasRepository`

Discards all changes in a revision by restoring its file contents to match its
parent. Requires confirmation since changes are not recoverable within jjvs.

Context menu: visible on mutable revision items (`viewItem =~ /^revision/ && !(viewItem =~ /immutable/)`)

Equivalent to: `jj restore [--into <changeId>]`

For usage details, see [Revisions guide — Restoring a revision](../guides/revisions.md#restoring-a-revision-to-its-parent-state).

---

## jjvs.revision.absorb

**Title**: Absorb into Ancestors
**Category**: Jujutsu
**Icon**: `$(arrow-up)`
**Enablement**: `jjvs:hasRepository`

Absorbs lines from the working copy (`@`) into the ancestor revisions that last
modified those regions. Lines that cannot be unambiguously attributed to an
ancestor remain in the working copy.

Context menu: visible on working copy revision items (`viewItem =~ /workingCopy/`)

Default keybinding (Revisions view focused): `A`

Equivalent to: `jj absorb`

For usage details, see [Revisions guide — Absorbing changes](../guides/revisions.md#absorbing-working-copy-changes-into-ancestors).

---

## jjvs.revision.revert

**Title**: Revert Revision...
**Category**: Jujutsu
**Icon**: `$(history)`
**Enablement**: `jjvs:hasRepository`

Creates a new revision whose changes are the exact inverse of the selected
revision, effectively undoing that revision's effect in the working copy.
The inverse revision is placed on top of the current working copy (`@`).

Context menu: visible on all revision items

Equivalent to: `jj revert -r <changeId> --onto @`

For usage details, see [Revisions guide — Reverting a revision](../guides/revisions.md#reverting-a-revision).

---

## jjvs.conflict.resolve

**Title**: Resolve Conflicts...  
**Category**: Jujutsu  
**Icon**: `$(tools)`  
**Enablement**: `jjvs:hasConflicts`

Opens an integrated terminal and runs `jj resolve -r <changeId>` to launch the
configured merge tool for a conflicted revision. After the terminal session ends,
the repository view refreshes automatically.

**Resolution flow:**

1. If a conflicted revision is selected in the Revisions view, it is used directly.
2. If only one conflicted revision exists in the current view, it is selected
   automatically.
3. If multiple conflicted revisions exist, a picker appears to let you choose.

Context menu: visible on conflicted revision items (`viewItem =~ /conflict/`)

Default keybinding (Revisions view focused, conflicts exist): `R`

Equivalent to: `jj resolve -r <changeId>`

For details on the full conflict resolution workflow, see
[Conflicts guide](../guides/conflicts.md).

---

## Planned commands

The following commands are planned for future phases and are not yet registered:

| Command ID | Phase | Description |
|------------|-------|-------------|
| `jjvs.rebase` | 9 | Rebase with source/target picker (`jj rebase`) |
| `jjvs.git.push` | 10 | Push to remote (`jj git push`) |
| `jjvs.git.fetch` | 10 | Fetch from remote (`jj git fetch`) |
| `jjvs.oplog.undo` | 11 | Undo the last operation (`jj undo`) |
| `jjvs.oplog.redo` | 11 | Redo the last undone operation |
