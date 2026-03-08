# Context keys reference

<!-- TODO(phase-15): Expand this page with full context key documentation, examples of using them in custom keybindings, and any keys added in Phases 7–14. -->

jjvs sets VSCode when-clause context keys to drive menu visibility and command enablement.
You can reference these keys in your own `keybindings.json` to scope custom keybindings
to jjvs views and states.

## Available context keys

| Key | Type | When set |
|-----|------|----------|
| `jjvs:hasRepository` | `boolean` | At least one jj repository is detected in the workspace |
| `jjvs:isColocated` | `boolean` | At least one active repository is a colocated jj+git repo |
| `jjvs:hasConflicts` | `boolean` | At least one repository has revisions with unresolved conflicts |
| `jjvs:revisionSelected` | `boolean` | A revision is selected in the Revisions tree view |
| `jjvs:fileSelected` | `boolean` | A file is selected in the Details view *(Phase 12)* |

## Using context keys in keybindings

To bind a key that only activates when a revision is selected:

```json
{
  "key": "ctrl+shift+c",
  "command": "jjvs.revision.copyChangeId",
  "when": "jjvs:revisionSelected"
}
```

**Related**: [Keyboard shortcuts](keyboard-shortcuts.md) | [Commands reference](commands.md)
