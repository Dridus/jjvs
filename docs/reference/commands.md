# Commands reference

All commands currently registered by jjvs. Commands are accessible from the Command
Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) under the **Jujutsu** category, from view
toolbars, and from context menus.

Commands are verified against `package.json` contribution points as of Phase 14b.

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
**Default keybinding**: `X` (Revisions view focused, revision selected)

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

## jjvs.rebase

**Title**: Rebase Revision...  
**Category**: Jujutsu  
**Icon**: `$(git-merge)`  
**Enablement**: `jjvs:hasRepository`

Runs a multi-step QuickPick to rebase one or more revisions to a new
location in the commit graph.

**Three-step flow:**

1. **Source mode** — choose how much to rebase:
   - *This revision only* (`-r`): move only the selected revision
   - *This revision and all descendants* (`-s`): move the subtree
   - *Entire branch* (`-b`): move all connected revisions in the branch
2. **Destination** — select the revision to rebase onto
3. **Placement** — choose where to place relative to the destination:
   `onto` (as child), `after`, `before`, `insert-after`, `insert-before`

After a successful rebase, jjvs detects any conflict cascade and shows an
information message with a **Resolve Conflicts** shortcut if needed.

Accessible from:
- Revisions view context menu (right-click any revision)
- Revisions view keybinding: `B` (when a revision is selected)
- Command Palette

Default keybinding (Revisions view focused, revision selected): `B`

Equivalent to: `jj rebase [-r|-s|-b] <source> [--destination|--after|--before|...] <dest>`

For a full usage walkthrough, see [Rebasing guide](../guides/rebasing.md).

---

## jjvs.bookmark.create

**Title**: Create Bookmark...  
**Category**: Jujutsu  
**Icon**: `$(add)`  
**Enablement**: `jjvs:hasRepository`

Creates a new local bookmark and attaches it to a chosen revision.

**Flow:**
1. Prompt for a bookmark name (InputBox, no spaces allowed).
2. Show a revision picker — select the target revision. The working copy (`@`) is pre-selected.

Accessible from:
- Bookmarks view toolbar (+ icon)
- Command Palette

Equivalent to: `jj bookmark create <name> -r <changeId>`

For a usage walkthrough, see [Bookmarks guide](../guides/bookmarks.md#creating-a-bookmark).

---

## jjvs.bookmark.move

**Title**: Move Bookmark...  
**Category**: Jujutsu  
**Icon**: `$(arrow-right)`  
**Enablement**: `jjvs:hasRepository`

Moves a local bookmark to a different revision.

**Flow:**
1. Resolve the bookmark name from the tree selection or a QuickPick list of local bookmarks.
2. Show a revision picker — select the new target revision.

Accessible from:
- Bookmarks view context menu (right-click a local bookmark)
- Command Palette

Equivalent to: `jj bookmark move <name> --to <changeId>`

For a usage walkthrough, see [Bookmarks guide](../guides/bookmarks.md#moving-a-bookmark).

---

## jjvs.bookmark.delete

**Title**: Delete Bookmark  
**Category**: Jujutsu  
**Icon**: `$(trash)`  
**Enablement**: `jjvs:hasRepository`

Deletes a local bookmark after confirmation. On the next push, the bookmark will
be deleted on the remote as well.

Accessible from:
- Bookmarks view context menu (right-click a local bookmark)
- Command Palette

Equivalent to: `jj bookmark delete <name>`

For a usage walkthrough, see [Bookmarks guide](../guides/bookmarks.md#deleting-a-bookmark).

---

## jjvs.bookmark.forget

**Title**: Forget Bookmark  
**Category**: Jujutsu  
**Icon**: `$(close)`  
**Enablement**: `jjvs:hasRepository`

Removes the local bookmark reference without affecting the remote. Unlike
`jjvs.bookmark.delete`, the bookmark is not deleted from the remote on next push.

Accessible from:
- Bookmarks view context menu (right-click a local bookmark)
- Command Palette

Equivalent to: `jj bookmark forget <name>`

For a usage walkthrough, see [Bookmarks guide](../guides/bookmarks.md#forgetting-a-bookmark).

---

## jjvs.bookmark.track

**Title**: Track Remote Bookmark  
**Category**: Jujutsu  
**Enablement**: `jjvs:hasRepository`

Starts tracking an untracked remote bookmark. After tracking, `jj git fetch` keeps
the local reference up to date when the remote bookmark moves.

Accessible from:
- Bookmarks view context menu (right-click an untracked remote bookmark)
- Command Palette

Equivalent to: `jj bookmark track <name>@<remote>`

For a usage walkthrough, see [Bookmarks guide](../guides/bookmarks.md#tracking-a-remote-bookmark).

---

## jjvs.bookmark.untrack

**Title**: Untrack Remote Bookmark  
**Category**: Jujutsu  
**Enablement**: `jjvs:hasRepository`

Stops tracking a remote bookmark. The remote bookmark is not affected; only the
local tracking reference is removed.

Accessible from:
- Bookmarks view context menu (right-click a tracked remote bookmark)
- Command Palette

Equivalent to: `jj bookmark untrack <name>@<remote>`

For a usage walkthrough, see [Bookmarks guide](../guides/bookmarks.md#untracking-a-remote-bookmark).

---

## jjvs.git.push

**Title**: Push...  
**Category**: Jujutsu  
**Icon**: `$(cloud-upload)`  
**Enablement**: `jjvs:hasRepository && jjvs:isColocated`

Push tracked bookmarks to a git remote. Only available for colocated jj+git
repositories (hidden for native jj repos).

Shows a remote picker pre-populated with the remotes extracted from your
bookmark data. The default remote (`jjvs.git.defaultRemote`, default `"origin"`)
is listed first. You can also type any remote name not shown in the list.

After selecting a remote, runs `jj git push --remote <remote>`. All tracked
bookmarks that have moved since the last push are sent.

Accessible from:
- Status bar push button (`$(cloud-upload)`) — colocated repos only
- Bookmarks view toolbar — colocated repos only
- Command Palette

Equivalent to: `jj git push --remote <remote>`

For a usage walkthrough, see [Git integration guide](../guides/git-integration.md).

---

## jjvs.git.fetch

**Title**: Fetch...  
**Category**: Jujutsu  
**Icon**: `$(cloud-download)`  
**Enablement**: `jjvs:hasRepository && jjvs:isColocated`

Fetch new commits and update remote-tracking bookmarks from a git remote. Only
available for colocated jj+git repositories.

Shows the same remote picker as push. After selecting a remote, runs
`jj git fetch --remote <remote>`.

Accessible from:
- Status bar fetch button (`$(cloud-download)`) — colocated repos only
- Bookmarks view toolbar — colocated repos only
- Command Palette

Equivalent to: `jj git fetch --remote <remote>`

For a usage walkthrough, see [Git integration guide](../guides/git-integration.md).

---

## jjvs.oplog.undo

**Title**: Undo Last Operation  
**Category**: Jujutsu  
**Icon**: `$(discard)`  
**Enablement**: `jjvs:hasRepository`  
**Default keybinding**: `U` (Operation Log view focused)

Undoes the most recent jj operation. Equivalent to `jj undo`. Shows a
confirmation dialog before making any change.

> Undo is itself an operation. Undoing an undo re-applies the original
> operation (effectively a redo).

Accessible from:
- Operation Log view toolbar (discard icon)
- Command palette: **Jujutsu: Undo Last Operation**

Equivalent to: `jj undo`

For a usage walkthrough, see [Operation log guide](../guides/operation-log.md).

---

## jjvs.oplog.restore

**Title**: Restore to Operation  
**Category**: Jujutsu  
**Icon**: `$(history)`  
**Enablement**: `jjvs:hasRepository`  
**Default keybinding**: `Enter` (Operation Log view focused, operation selected)

Restores the repository to the state captured by a chosen operation. Use this
to jump back several operations at once when `jjvs.oplog.undo` is insufficient.

**Flow:**
1. If an operation is selected in the Operation Log view, it is used directly.
2. Otherwise a QuickPick shows all available operations with their descriptions
   and relative timestamps.
3. A confirmation dialog appears before any change is made.

Accessible from:
- Operation Log view context menu: right-click any operation → **Restore to Operation**
- Command palette: **Jujutsu: Restore to Operation**

Equivalent to: `jj op restore <operation-id>`

For a usage walkthrough, see [Operation log guide](../guides/operation-log.md).

---

## jjvs.details.openDiff

**Title**: Open Diff  
**Category**: Jujutsu  
**Icon**: `$(diff)`  
**Enablement**: `jjvs:fileSelected`

Opens a VSCode diff editor showing the changes to the selected file in the
currently selected revision.

The diff editor shows:
- **Left (before)**: the file at the revision's parent
- **Right (after)**: the file at the selected revision

For **added** files, the left side is empty. For **deleted** files, the right
side is empty. For **renamed** or **copied** files, the left side shows the
original path.

This command is invoked automatically when you click a file in the
**Jujutsu Details** view. It can also be invoked from the context menu by
right-clicking a file in the Details view.

Accessible from:
- Clicking any file in the **Jujutsu Details** view (SCM sidebar)
- Details view context menu: right-click any file → **Open Diff**
- Command palette (when a file is selected in the Details view)

> **Note**: This command uses the same `jj-original:` URI scheme as the
> QuickDiff gutter indicators. The content is served by the extension's
> built-in `JjOriginalContentProvider`.

---

## jjvs.details.restoreFile

**Title**: Restore File...  
**Category**: Jujutsu  
**Icon**: `$(discard)`  
**Enablement**: `jjvs:fileSelected`

Restores a single file in the selected revision to its state in the revision's
parent, discarding that file's changes only. Other files in the revision are
not affected.

Requires confirmation before proceeding. The operation is the file-level
equivalent of `jjvs.revision.restore`.

Context menu: visible on mutable file change items in the Details view
(`viewItem =~ /^fileChange/ && viewItem =~ /mutable/`)

Equivalent to: `jj restore [--into <changeId>] -- <filePath>`

For usage details, see [Revisions guide — File-level operations](../guides/revisions.md#file-level-operations).

---

## jjvs.details.squashFile

**Title**: Squash File into Parent  
**Category**: Jujutsu  
**Icon**: `$(fold-down)`  
**Enablement**: `jjvs:fileSelected`

Squashes a single file's changes from the selected revision into its direct
parent. After squashing, the file's changes live in the parent revision; the
source revision no longer includes changes to that file.

Requires confirmation before proceeding. The operation is the file-level
equivalent of `jjvs.revision.squash`.

Context menu: visible on mutable file change items in the Details view
(`viewItem =~ /^fileChange/ && viewItem =~ /mutable/`)

Equivalent to: `jj squash -r <changeId> -- <filePath>`

For usage details, see [Revisions guide — File-level operations](../guides/revisions.md#file-level-operations).

---

## jjvs.details.splitFile

**Title**: Split File into New Revision...  
**Category**: Jujutsu  
**Icon**: `$(split-horizontal)`  
**Enablement**: `jjvs:fileSelected`

Splits a single file out of the selected revision into a new separate revision.
The selected file goes into a new first revision; remaining files stay in the
second revision. The user is prompted for an optional description for the new
first revision.

The operation is the file-level equivalent of `jjvs.revision.split`.

Context menu: visible on mutable file change items in the Details view
(`viewItem =~ /^fileChange/ && viewItem =~ /mutable/`)

Equivalent to: `jj split -r <changeId> -- <filePath> [--message <description>]`

For usage details, see [Revisions guide — File-level operations](../guides/revisions.md#file-level-operations).

---

## jjvs.details.showFileHistory

**Title**: Show File History  
**Category**: Jujutsu  
**Icon**: `$(history)`  
**Enablement**: `jjvs:fileSelected`

Filters the Revisions view to show only revisions that modified the selected
file. Applies the `file("<path>")` revset function and navigates to the
Revisions view automatically. Use **Filter by Revset...** to clear or update
the filter.

Context menu: visible on all file change items in the Details view
(`viewItem =~ /^fileChange/`)

Equivalent to: sets the Revisions view revset to `file("<path>")`

For usage details, see [Revisions guide — Viewing a file's revision history](../guides/revisions.md#viewing-a-files-revision-history).

---

## jjvs.preview.show

**Title**: Show Preview Panel  
**Category**: Jujutsu  
**Icon**: `$(preview)`  
**Enablement**: `jjvs:hasRepository`

Opens the Jujutsu Preview panel, which shows the full `jj show` output for the
currently selected revision with ANSI color rendering. If the panel is already
open, reveals it without stealing focus.

The panel position is controlled by the `jjvs.preview.position` setting
(`"auto"`, `"beside"`, or `"below"`). The panel auto-updates as you navigate
revisions in the Revisions tree view.

Accessible from:
- Command palette: **Jujutsu: Show Preview Panel**

For configuration details, see [Settings reference](settings.md#jjvspreviewposition).

---

## jjvs.preview.toggle

**Title**: Toggle Preview Panel  
**Category**: Jujutsu  
**Icon**: `$(preview)`  
**Enablement**: `jjvs:hasRepository`

Opens the preview panel if it is closed, or closes it if it is currently open.
Useful for binding to a keyboard shortcut to quickly show or hide the preview
while navigating revisions.

Accessible from:
- Command palette: **Jujutsu: Toggle Preview Panel**
- Revisions view toolbar (preview icon)

For configuration details, see [Settings reference](settings.md#jjvspreviewposition).

---

## jjvs.graph.show

**Title**: Show Revision Graph  
**Category**: Jujutsu  
**Icon**: `$(type-hierarchy)`  
**Enablement**: `jjvs:hasRepository`

Opens the Jujutsu Revision Graph webview panel, which displays the revision DAG
as an interactive SVG graph. Each revision appears as a colored circle connected
to its parents by smooth bezier curves. The color indicates the revision type:

| Color  | Node type     |
|--------|---------------|
| Yellow | Working copy  |
| Red    | Conflicted    |
| Blue   | Immutable     |
| Green  | Mutable       |
| Outline| Empty         |

If the panel is already open, reveals it without stealing focus.

**Interaction:**
- Click a revision node or row to select it. The selection synchronizes with the
  Details, Evolution Log, and Preview panels.
- Right-click a node or row to open a context menu with revision actions.
- `↑`/`↓` arrow keys move the selection up and down the revision list.

**Zoom and pan:**
- **Mouse wheel** (no modifier): scroll vertically. **Shift + wheel**: scroll horizontally.
- **Ctrl+Wheel** / **⌘+Wheel**: zoom in or out, centered on the cursor position.
- **Drag background**: click and drag any empty area of the graph to pan.
- **Zoom toolbar** (bottom-right corner): click `−`/`+` buttons to zoom out/in;
  click the percentage label to reset to 100% at the origin.
- **Ctrl+−** / **Ctrl+=**: zoom out / zoom in from the keyboard.
- **Ctrl+0**: reset zoom and pan to the default (100%, top-left origin).

**Drag-and-drop rebase:**
- Drag any mutable revision node or row and drop it onto another revision to rebase
  it: `jj rebase -r <source> -d <target>`. This is equivalent to using
  `jjvs.rebase` in single-revision mode but requires no pickers.
- A floating label follows the cursor showing the source change ID. When hovering
  over a valid drop target the label turns green and shows both IDs.
- Immutable revisions cannot be dragged or used as drop targets.
- **Right-click** or **Escape** during a drag cancels the operation.

Accessible from:
- Command palette: **Jujutsu: Show Revision Graph**

To auto-open this panel on activation, set `jjvs.graphStyle` to `"webview"`.
See [Settings reference](settings.md#jjvsgraphstyle).

---

## jjvs.graph.toggle

**Title**: Toggle Revision Graph  
**Category**: Jujutsu  
**Icon**: `$(type-hierarchy)`  
**Enablement**: `jjvs:hasRepository`

Opens the graph panel if it is closed, or closes it if it is currently open.

Accessible from:
- Command palette: **Jujutsu: Toggle Revision Graph**
- Revisions view toolbar (graph icon)
