# Keyboard shortcuts

<!-- TODO(phase-7): Add default keybindings when revision commands are registered with keybinding contributions. -->

jjvs does not currently define default keybindings. Commands are accessible from the
Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and from view toolbars and context menus.

## Adding custom keybindings

You can add keybindings for any jjvs command in your `keybindings.json`
(`File → Preferences → Keyboard Shortcuts → Open Keyboard Shortcuts (JSON)`).

Example: bind `Ctrl+Shift+J R` to open the revset input:

```json
{
  "key": "ctrl+shift+j r",
  "command": "jjvs.revisions.setRevset",
  "when": "jjvs:hasRepository"
}
```

For the list of available commands, see the [Commands reference](commands.md).  
For available `when` conditions, see the [Context keys reference](context-keys.md).
