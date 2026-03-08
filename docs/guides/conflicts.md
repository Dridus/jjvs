# Working with conflicts

This guide covers how jj represents merge conflicts, how to identify conflicted
revisions in jjvs, and how to resolve them using `jj resolve`.

**Prerequisites**: A jj repository open in VSCode with the Revisions view visible.
Familiarity with jj's working copy model helps — see
[First steps](../getting-started/first-steps.md) if you are new to jjvs.

---

## Understanding jj's conflict model

jj handles merge conflicts differently from git. In git, a conflict blocks the
merge: you must resolve it before the operation can complete. In jj, conflicts
are **stored inside commits**. A conflicted commit is valid jj state — jj can
continue rebasing, creating new revisions, and running other operations even
while conflicts exist. Nothing is blocked.

This means:
- A rebase that would create conflicts **succeeds**. The conflicted revisions
  are committed with conflict markers in their files.
- Descendants of a conflicted revision are rebased automatically. If a
  descendant happens to resolve the conflict (by changing the conflicting lines),
  jj recognises this and the conflict disappears.
- You can have multiple conflicted revisions at once and resolve them in any
  order, or resolve one and move on to the next.

The trade-off: since conflicts are stored in commits rather than blocking
operations, it is possible to accidentally push conflicted code if you are not
careful. Use the **conflict count badge** in the status bar to keep track of
unresolved conflicts.

---

## Identifying conflicts in jjvs

jjvs surfaces conflicts in multiple places:

### Revisions view

Conflicted revisions display a **⚠ (warning) icon** in the Revisions view,
with the icon rendered in the warning foreground color so it stands out from
normal revisions.

The hover tooltip for a conflicted revision includes the line:

> ⚠ **Has unresolved conflicts**

### Status bar

When any revision in the current log view has conflicts, a badge appears in the
left side of the status bar:

```
$(warning) N conflict(s)
```

The badge disappears automatically when all conflicts are resolved and the view
refreshes.

### File explorer and SCM view

When the **working copy** (`@`) has conflicts, the conflicted files are
decorated with a `!` badge and the conflict color (typically orange, matching
the git conflict color theme) in the Explorer, SCM view file list, and
breadcrumbs.

The SCM view shows conflicted files in the **Working copy changes** group with
the same `!` badge.

---

## How conflicts arise

Conflicts typically appear when:

1. **Rebasing over diverged history**: Two branches modified the same region
   of a file. After `jj rebase`, the rebased revisions may conflict with their
   new parents.

2. **Squashing with overlapping changes**: Two revisions both modified the same
   lines. Squashing one into the other surfaces the conflict.

3. **Merging (jj new with multiple parents)**: Creating a new revision that has
   two parents with incompatible changes produces a conflicted merge commit.

After any operation that creates conflicts, jjvs refreshes the Revisions view
and you will see `$(warning)` icons on the newly-conflicted revisions.

---

## Resolving conflicts

### Step 1: Move the working copy to the conflicted revision

If the conflicted revision is not already the working copy, edit it:

1. Right-click the conflicted revision in the Revisions view.
2. Choose **Edit Revision**.

Or use the `E` keybinding with the revision selected. The `→` arrow icon moves
to the conflicted revision.

### Step 2: Run Resolve Conflicts

With a conflicted revision selected (or as the working copy):

**From the Revisions view:**

- Right-click the conflicted revision and choose **Resolve Conflicts...**
- Or press `R` with the revision selected (while the Revisions view has focus)

**From the command palette:**

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Type **Jujutsu: Resolve Conflicts...** and press Enter.
3. If there are multiple conflicted revisions, a picker appears — select the
   revision to resolve.

**What jjvs runs:**

```
jj resolve -r <changeId>
```

A new integrated terminal opens in the repository root and runs this command.
jj launches your configured merge tool (see
[Configuring a merge tool](#configuring-a-merge-tool) below). Resolve the
conflict in the merge tool, then save and close it.

When the terminal session ends, jjvs automatically refreshes the Revisions view.
If the conflict was fully resolved, the `$(warning)` icon disappears.

> **Note**: `jj resolve` resolves one conflicted file at a time when using a
> terminal-based merge tool. If a revision has multiple conflicted files, jj
> will present them in sequence. GUI merge tools (like IntelliJ or VS Code's
> three-way merge editor) may show all conflicted files at once, depending on
> your configuration.

### Step 3: Verify resolution

After the terminal closes and jjvs refreshes:

- The `$(warning)` icon should be gone from the revision in the Revisions view.
- The conflict count badge in the status bar should decrease (or disappear if
  this was the last conflict).
- The conflicted files should no longer show the `!` badge in the Explorer (if
  the working copy was the conflicted revision).

If the conflict is not fully resolved, jj reports the remaining conflicts in
the terminal output before closing. Run **Resolve Conflicts...** again to
continue.

---

## Configuring a merge tool

`jj resolve` uses your jj merge tool configuration. To set a merge tool,
add it to your jj user config (`~/.config/jj/config.toml`):

```toml
[ui]
merge-editor = "vscode"   # or "meld", "vimdiff", "intellij", etc.
```

jj supports several built-in presets (`vscode`, `meld`, `vimdiff`, `kdiff3`,
`intellij`). For a terminal-based tool like `vimdiff`, the integrated terminal
jjvs opens will show the TUI directly. For a GUI tool like VS Code or
IntelliJ, jj launches the GUI application as a subprocess.

> **VS Code merge editor**: Using `merge-editor = "vscode"` opens VSCode's
> built-in three-way merge editor for each conflicted file. This is a natural
> fit for jjvs users since the editor stays within VS Code.

---

## Conflicts from rebase

When a rebase creates conflicts in multiple revisions, jjvs shows warning
icons on all of them. Resolve them from oldest (the rebased revision) to
newest (its descendants), since fixing an ancestor may automatically resolve
conflicts in descendants.

After resolving the first conflict:
1. Refresh the view (`jjvs.refresh`, or wait for auto-refresh).
2. Check whether descendant conflicts have been resolved automatically.
3. If descendants still show conflicts, edit each in turn and run **Resolve
   Conflicts...** again.

For a detailed walkthrough of rebasing, see [Rebasing](rebasing.md).

---

## Abandoning a conflicted revision

If the conflicted revision is no longer needed (for example, you rebased onto
the wrong target), you can abandon it with **Jujutsu: Abandon Revision**
rather than resolving the conflict. This removes the conflicted revision and
rebases its descendants onto the abandoned revision's parents.

> **Warning**: Abandoning a revision is permanent within jjvs. Use
> `jj op log` to undo the operation if needed.

---

**Related**:
[Commands reference — jjvs.conflict.resolve](../reference/commands.md#jjvsconflictresolve) |
[Rebasing](rebasing.md) |
[Revisions guide](revisions.md)
