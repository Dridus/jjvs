# Keyboard shortcuts

jjvs does not currently define default keybindings. Commands are accessible
from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and from view
toolbars and context menus.

<!-- TODO(phase-15): Add default keybinding contributions to package.json for
     the most common commands (new, edit, describe, abandon) and document them
     here. -->

## Adding custom keybindings

You can add keybindings for any jjvs command in your `keybindings.json`
(`File → Preferences → Keyboard Shortcuts → Open Keyboard Shortcuts (JSON)`).

### Example: common revision operations

```json
[
  {
    "key": "ctrl+shift+j n",
    "command": "jjvs.revision.new",
    "when": "jjvs:hasRepository"
  },
  {
    "key": "ctrl+shift+j e",
    "command": "jjvs.revision.edit",
    "when": "jjvs:hasRepository"
  },
  {
    "key": "ctrl+shift+j d",
    "command": "jjvs.revision.describe",
    "when": "jjvs:hasRepository"
  },
  {
    "key": "ctrl+shift+j shift+d",
    "command": "jjvs.revision.describeInEditor",
    "when": "jjvs:hasRepository"
  },
  {
    "key": "ctrl+shift+j r",
    "command": "jjvs.revisions.setRevset",
    "when": "jjvs:hasRepository"
  }
]
```

### Example: scoping to the Revisions view

Use `focusedView == 'jjvs.revisions'` to activate a keybinding only when the
Revisions view has focus:

```json
{
  "key": "n",
  "command": "jjvs.revision.new",
  "when": "focusedView == 'jjvs.revisions' && jjvs:hasRepository"
}
```

### When-clause contexts

jjvs sets the following context keys that can be referenced in `when` clauses:

| Context key | Type | Set when |
|---|---|---|
| `jjvs:hasRepository` | boolean | At least one jj repository is open |
| `jjvs:isColocated` | boolean | The active repository is a colocated jj+git repo |
| `jjvs:hasConflicts` | boolean | Any revision in the active repository has conflicts |
| `jjvs:revisionSelected` | boolean | A revision is selected in the Revisions view |
| `jjvs:fileSelected` | boolean | A file is selected in the Details view |

For the full context key reference, see [Context keys](context-keys.md).

## All available commands

For the complete list of commands you can bind, see the [Commands reference](commands.md).
