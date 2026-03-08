# Settings reference

All `jjvs.*` settings and their defaults. Settings can be configured in
**File → Preferences → Settings** (search for `jjvs`) or directly in `settings.json`.

## jjvs.jjPath

**Type**: `string`  
**Default**: `"jj"`  
**Scope**: Machine-overridable

Path to the jj binary. By default, jjvs resolves `jj` from your `PATH`. Set this if jj
is installed in a non-standard location.

```json
{ "jjvs.jjPath": "/home/user/.nix-profile/bin/jj" }
```

After changing this setting, jjvs picks up the new path on the next command invocation.
Repositories already open will refresh automatically.

---

## jjvs.logLevel

**Type**: `string` (enum)  
**Default**: `"info"`  
**Scope**: Window  
**Values**: `"off"` | `"error"` | `"warn"` | `"info"` | `"debug"` | `"trace"`

Verbosity level for the **Jujutsu** output channel (`View → Output → Jujutsu`).

| Level | What is logged |
|-------|---------------|
| `off` | Nothing |
| `error` | Errors only |
| `warn` | Errors and warnings (e.g., version mismatch, jj not found) |
| `info` | Standard operational messages (detected jj version, repository paths, slow commands) |
| `debug` | All jj command invocations with arguments |
| `trace` | Verbose internal state |

Use `"debug"` when troubleshooting unexpected behavior. File contents and sensitive data
are never logged at any level.

---

## jjvs.revset

**Type**: `string`  
**Default**: `""`  
**Scope**: Resource (per-workspace-folder)

Default revset expression for the revision log. When set, the Revisions view uses this
expression as its initial filter. Leave empty to use jj's default log output.

```json
{ "jjvs.revset": "trunk().. | ancestors(@, 5)" }
```

This setting can be overridden per-session using the **Filter by Revset...** command in
the Revisions view toolbar. The session filter takes precedence over this setting while
the window is open.

For revset syntax, see the [Revsets guide](../guides/revsets.md) and the
[Revset functions reference](revset-functions.md).

---

## jjvs.logTemplate

**Type**: `string`  
**Default**: `""`  
**Scope**: Resource (per-workspace-folder)

Custom jj log template. When set, overrides the built-in JSON template that jjvs uses
to fetch revision data. **For advanced use only.**

Setting this incorrectly will break the revision log display. Only set this if you
understand jj's template language and the JSON shape that jjvs expects.

---

## jjvs.logLimit

**Type**: `number`  
**Default**: `50`  
**Minimum**: `1`  
**Maximum**: `10000`  
**Scope**: Resource (per-workspace-folder)

Maximum number of revisions to load per batch in the revision log. When the log contains
more revisions than this limit, a **Load more** item appears at the bottom of the tree.

Increase this value if you frequently need to scroll through many revisions and prefer
fewer explicit "load more" clicks. Decrease it for better performance on large repositories.

---

## jjvs.oplogLimit

**Type**: `number`  
**Default**: `200`  
**Minimum**: `1`  
**Maximum**: `10000`  
**Scope**: Resource (per-workspace-folder)

Maximum number of operations to show in the Operation Log view. Each jj command that
modifies the repository creates one operation entry.

---

## jjvs.git.defaultRemote

**Type**: `string`  
**Default**: `"origin"`  
**Scope**: Resource (per-workspace-folder)

Default remote name used as the pre-selected option in the remote picker for
`jjvs.git.push` and `jjvs.git.fetch`. Only relevant for colocated jj+git repositories.

```json
{ "jjvs.git.defaultRemote": "upstream" }
```

The remote picker always lists this remote first and pre-selects it so pressing
Enter immediately pushes or fetches from the default. You can still select a
different remote or type one not in the list.

Common values: `"origin"` (GitHub/GitLab clone default), `"upstream"` (fork
workflow where `origin` is your fork and `upstream` is the canonical repo).

See [Git integration guide](../guides/git-integration.md) for a full workflow.

---

## jjvs.preview.position

**Type**: `string` (enum)  
**Default**: `"auto"`  
**Scope**: Window  
**Values**: `"auto"` | `"beside"` | `"below"`

Position of the preview panel that shows `jj show` / `jj diff` output.

| Value | Behavior |
|-------|---------|
| `"auto"` | jjvs chooses a position based on your editor layout |
| `"beside"` | Opens the panel to the right of the active editor |
| `"below"` | Opens the panel below the active editor |

The preview panel is available in Phase 13.

---

## jjvs.preview.showOnStart

**Type**: `boolean`  
**Default**: `false`  
**Scope**: Window

When `true`, the preview panel opens automatically when the extension activates. When
`false`, you open it manually via a command.

The preview panel is available in Phase 13.

---

## jjvs.autoRefresh

**Type**: `boolean`  
**Default**: `true`  
**Scope**: Resource (per-workspace-folder)

When `true`, jjvs watches `.jj/repo/op_heads/` and automatically refreshes all views
when the repository state changes (e.g., after running jj commands in the terminal).

Disable this if auto-refresh causes performance issues. You can trigger a manual refresh
with the **Jujutsu: Refresh** command or the refresh icon in the Revisions view toolbar.

---

## jjvs.autoRefreshInterval

**Type**: `number`  
**Default**: `3000`  
**Minimum**: `500`  
**Scope**: Resource (per-workspace-folder)

Polling fallback interval in milliseconds. Used when file system watching is unavailable
(e.g., on some remote filesystems). Has no effect when `jjvs.autoRefresh` is `false`.

---

## jjvs.graphStyle

**Type**: `string` (enum)  
**Default**: `"text"`  
**Scope**: Window  
**Values**: `"text"` | `"webview"`

Rendering style for the revision graph.

| Value | Description |
|-------|-------------|
| `"text"` | Graph shown as Unicode box-drawing characters in the tree view (fast, always available) |
| `"webview"` | Interactive graphical webview with full DAG layout (richer UI, higher resource use) |

The `"webview"` option is available in Phase 14. Use `"text"` until then.
