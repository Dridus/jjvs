# Operation log

This guide covers browsing the jj operation log, undoing the most recent
operation, and restoring the repository to an earlier state.

**Prerequisites**: A jj repository is open in VSCode. The **Operation Log**
view is visible in the jjvs sidebar panel.

**Related**: [Commands reference — op log commands](../reference/commands.md#jjvsoplogundo),
[Revisions guide](revisions.md)

---

## What is the operation log?

jj records every mutation to the repository — creating revisions, rebasing,
describing, abandoning, pushing — as an **operation**. The operation log is a
chronological history of all these mutations, newest first.

Unlike git's reflog (which tracks individual ref movements), jj's operation log
captures the entire repository state at each point, including working-copy
changes, bookmark positions, and conflict state. This makes it possible to
restore the repository to any previous state precisely.

---

## Browsing the operation log

The **Operation Log** view in the jjvs sidebar lists operations newest first.
Each item shows:

- **Label** — the first line of the operation's description (e.g., `new empty
  commit`, `rebase revision`, `describe commit abc1234`)
- **Time** — how long ago the operation completed (e.g., `5 minutes ago`,
  `just now`)
- **Tooltip** — hover over an item to see the full description, operation ID,
  user, and exact timestamp range

The view refreshes automatically after every jj operation triggered by jjvs.

---

## Undoing the most recent operation

**Command palette**: `Jujutsu: Undo Last Operation`
**View toolbar**: `$(discard)` icon in the Operation Log view toolbar

This runs `jj undo`, which reverses the most recent operation. A confirmation
dialog appears before any change is made.

> **Note**: Undo is itself an operation. If you undo an undo, the net effect is
> a redo — the original operation is re-applied.

After the undo completes, all jjvs views refresh to reflect the restored state.

---

## Restoring to a previous operation

Right-click any operation in the **Operation Log** view and select
**Restore to Operation** to restore the repository to the state captured at
that point. This runs `jj op restore <operation-id>`.

You can also invoke this from the **Command Palette** as
`Jujutsu: Restore to Operation`, which shows a QuickPick of all available
operations.

A confirmation dialog appears before any change is made. The description of the
target operation is shown in the dialog so you can verify the correct operation
was selected.

> **When to use restore instead of undo**: `jj undo` only undoes the *most
> recent* operation. If you want to jump back several operations at once (for
> example, to recover from a series of mistakes), use **Restore to Operation**.
> After restoring, operations that were "in the future" relative to the restored
> state are still in the operation log and can be restored to as well.

---

## Equivalent jj CLI commands

| jjvs action | jj command |
|-------------|------------|
| Undo Last Operation | `jj undo` |
| Restore to Operation | `jj op restore <operation-id>` |

To inspect the operation log from the terminal:

```sh
jj op log
```

To undo the last operation from the terminal:

```sh
jj undo
```

To restore to a specific operation:

```sh
jj op restore <operation-id>
```

Operation IDs are 128-character hex strings. You only need to type a unique
prefix when using the CLI directly. jjvs always uses the full ID internally.

---

## What next?

- [Revisions guide](revisions.md) — creating, describing, and managing
  individual revisions
- [Conflicts guide](conflicts.md) — resolving conflicts that arise after rebase
  or restore operations
- [Commands reference](../reference/commands.md) — full list of jjvs commands
