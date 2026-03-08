# Context keys reference

jjvs sets VSCode when-clause context keys to drive menu visibility and command enablement.
You can reference these keys in your own `keybindings.json` to scope custom keybindings
to jjvs views and states.

## Available context keys

| Key | Type | When set | Cleared when |
|-----|------|----------|--------------|
| `jjvs:hasRepository` | `boolean` | At least one jj repository is detected in the workspace | No jj repository is open |
| `jjvs:isColocated` | `boolean` | At least one active repository is a colocated jj+git repo | The active repository is native jj (no `.git/`) |
| `jjvs:hasConflicts` | `boolean` | At least one revision in the active repository has unresolved conflicts | All conflicts are resolved |
| `jjvs:revisionSelected` | `boolean` | A revision item is selected in the Revisions tree view | Selection moves away from a revision (e.g., to a "Load more" item) |
| `jjvs:fileSelected` | `boolean` | A file change item is selected in the Details view | Selection moves away from a file item |

### Key behaviours and notes

**`jjvs:hasRepository`** — This is the primary guard for nearly all jjvs commands. It is set
during the activation cycle once at least one `.jj/` directory is confirmed reachable. Closing
or removing all jj repositories from the workspace clears it.

**`jjvs:isColocated`** — Controls visibility of git-specific commands (`jjvs.git.push`,
`jjvs.git.fetch`) and the push/fetch status bar items. A colocated repo has both `.jj/` and
`.git/` present in the same root.

**`jjvs:hasConflicts`** — Drives the `jjvs.conflict.resolve` command enablement and the `R`
keybinding in the Revisions view. Refreshed after every repository state update.

**`jjvs:revisionSelected`** — Set when the focused item in the Revisions view is a revision
tree item (not the "Load more" sentinel). Commands that require a specific revision (edit,
describe, split, squash, rebase, etc.) use this key in their `enablement` condition.

**`jjvs:fileSelected`** — Set when the focused item in the Jujutsu Details view is a file
change tree item. Commands like `jjvs.details.openDiff` and `jjvs.details.restoreFile` use
this as their `enablement` condition.

## Using context keys in keybindings

### Bind a key globally when a revision is selected

```json
{
  "key": "ctrl+shift+c",
  "command": "jjvs.revision.copyChangeId",
  "when": "jjvs:revisionSelected"
}
```

### Bind a key only in colocated repos

```json
{
  "key": "ctrl+shift+p",
  "command": "jjvs.git.push",
  "when": "jjvs:hasRepository && jjvs:isColocated"
}
```

### Combine with view focus for view-scoped bindings

The built-in jjvs keybindings combine `focusedView` with jjvs context keys:

```json
{
  "key": "e",
  "command": "jjvs.revision.edit",
  "when": "focusedView == 'jjvs.revisions' && jjvs:revisionSelected"
}
```

This prevents `E` from triggering when you are typing in an editor but the Revisions view
has a selection.

### Show a quick-pick only when conflicts exist

```json
{
  "key": "ctrl+shift+j r",
  "command": "jjvs.conflict.resolve",
  "when": "jjvs:hasConflicts"
}
```

## Context keys in menu contributions

jjvs also uses context keys in `package.json` `when` clauses for menus. For example, the
**Push** and **Fetch** toolbar items in the Bookmarks view are only shown when:

```
view == jjvs.bookmarks && jjvs:hasRepository && jjvs:isColocated
```

This prevents the git-specific toolbar buttons from cluttering the UI for users working with
native jj repositories.

---

**Related**: [Keyboard shortcuts](keyboard-shortcuts.md) | [Commands reference](commands.md)
