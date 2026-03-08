# Keyboard shortcuts

jjvs contributes default keybindings scoped to the Revisions view. These
single-key bindings activate only when the Revisions view has keyboard focus
(`focusedView == 'jjvs.revisions'`), so they do not conflict with global
editor keybindings.

## Default keybindings

| Key | Command | When |
|-----|---------|------|
| `N` | `jjvs.revision.new` — New Revision... | Revisions view focused, repository open |
| `E` | `jjvs.revision.edit` — Edit Revision | Revisions view focused, revision selected |
| `D` | `jjvs.revision.describe` — Describe Revision... | Revisions view focused, revision selected |
| `S` | `jjvs.revision.split` — Split Revision... | Revisions view focused, revision selected |
| `Q` | `jjvs.revision.squash` — Squash into Parent | Revisions view focused, revision selected |
| `A` | `jjvs.revision.absorb` — Absorb into Ancestors | Revisions view focused, repository open |
| `R` | `jjvs.conflict.resolve` — Resolve Conflicts... | Revisions view focused, conflicts exist |

All other jjvs commands are available from:
- **Command Palette** (`Ctrl+Shift+P` / `Cmd+Shift+P`) under the **Jujutsu** category
- **Context menus** in the Revisions view (right-click a revision)
- **View toolbar** icons (Refresh, Filter by Revset, New Revision)

---

## Customizing keybindings

Override or disable any jjvs keybinding in `keybindings.json`
(`File → Preferences → Keyboard Shortcuts → Open Keyboard Shortcuts (JSON)`).

### Override a default binding

To change the key for Split Revision from `S` to `Alt+S`:

```json
[
  {
    "key": "alt+s",
    "command": "jjvs.revision.split",
    "when": "focusedView == 'jjvs.revisions' && jjvs:hasRepository && jjvs:revisionSelected"
  },
  {
    "key": "s",
    "command": "-jjvs.revision.split"
  }
]
```

The `-` prefix on a command ID removes the default binding.

### Add global keybindings (chord style)

Using a chord (`Ctrl+Shift+J` followed by a letter) avoids conflicts with
other extensions when the Revisions view is not focused:

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
    "key": "ctrl+shift+j s",
    "command": "jjvs.revision.split",
    "when": "jjvs:hasRepository"
  },
  {
    "key": "ctrl+shift+j q",
    "command": "jjvs.revision.squash",
    "when": "jjvs:hasRepository"
  },
  {
    "key": "ctrl+shift+j a",
    "command": "jjvs.revision.absorb",
    "when": "jjvs:hasRepository"
  },
  {
    "key": "ctrl+shift+j r",
    "command": "jjvs.revisions.setRevset",
    "when": "jjvs:hasRepository"
  },
  {
    "key": "ctrl+shift+j shift+r",
    "command": "jjvs.conflict.resolve",
    "when": "jjvs:hasConflicts"
  }
]
```

---

## When-clause contexts

jjvs sets the following context keys that can be referenced in `when` clauses:

| Context key | Type | Set when |
|---|---|---|
| `jjvs:hasRepository` | boolean | At least one jj repository is open |
| `jjvs:isColocated` | boolean | The active repository is a colocated jj+git repo |
| `jjvs:hasConflicts` | boolean | Any revision in the active repository has conflicts |
| `jjvs:revisionSelected` | boolean | A revision is selected in the Revisions view |
| `jjvs:fileSelected` | boolean | A file is selected in the Details view |

For the full context key reference, see [Context keys](context-keys.md).

---

## All available commands

For the complete list of commands you can bind, see the [Commands reference](commands.md).
