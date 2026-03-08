# Commands reference

All commands currently registered by jjvs. Commands are accessible from the Command
Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) under the **Jujutsu** category, from view
toolbars, and from context menus.

Commands are verified against `package.json` contribution points as of Phase 6.

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

## Planned commands

The following commands are planned for future phases and are not yet registered:

| Command ID | Phase | Description |
|------------|-------|-------------|
| `jjvs.revision.new` | 7 | Create a new revision (`jj new`) |
| `jjvs.revision.edit` | 7 | Edit a revision (`jj edit`) |
| `jjvs.revision.abandon` | 7 | Abandon a revision (`jj abandon`) |
| `jjvs.revision.describe` | 7 | Describe a revision in an editor (`jj describe`) |
| `jjvs.revision.duplicate` | 7 | Duplicate a revision (`jj duplicate`) |
| `jjvs.revision.split` | 7 | Split a revision (`jj split`) |
| `jjvs.revision.squash` | 7 | Squash into parent (`jj squash`) |
| `jjvs.rebase` | 9 | Rebase with source/target picker (`jj rebase`) |
| `jjvs.git.push` | 10 | Push to remote (`jj git push`) |
| `jjvs.git.fetch` | 10 | Fetch from remote (`jj git fetch`) |
| `jjvs.oplog.undo` | 11 | Undo the last operation (`jj undo`) |
| `jjvs.oplog.redo` | 11 | Redo the last undone operation |
