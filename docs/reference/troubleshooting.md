# Troubleshooting

## jj binary not found

**Symptom**: The Jujutsu output channel shows `jj binary not found` and a warning
notification appears asking to configure `jjvs.jjPath`.

**Solutions**:

1. Verify jj is installed: open a terminal and run `jj --version`. If the command is not
   found, [install jj](https://martinvonz.github.io/jj/latest/install-and-setup/).
2. If jj is installed but not on `PATH` (common with Nix, Homebrew in non-standard prefixes,
   or Windows custom installs), set `jjvs.jjPath` to the full path:
   ```json
   { "jjvs.jjPath": "/path/to/jj" }
   ```
3. If running in a dev container or remote SSH session, make sure jj is installed in that
   environment, not just on your local machine.

## jj version too old

**Symptom**: Warning notification: `jj X.Y.Z is below the minimum required 0.25.0`.

**Solution**: Upgrade jj to 0.25.0 or later. jjvs requires the `json()` template function
which was introduced in jj 0.25.0.

## Extension does not activate

**Symptom**: The Jujutsu icon does not appear in the Activity Bar after opening a folder
with a jj repository.

**Checks**:
1. Verify the folder contains a `.jj/` directory (`ls -la` in the terminal).
2. Check the Extensions view to confirm jjvs is installed and enabled.
3. Open the Output panel (`View → Output`) and look for a **Jujutsu** channel. If there is
   no channel, the extension did not activate; check the Developer Tools console
   (`Help → Toggle Developer Tools`) for activation errors.

## Revision log is empty

**Symptom**: The Revisions view shows no revisions even though the repository has commits.

**Checks**:
1. Verify a revset filter is not active — check the Revisions view title bar for
   `filter: <expression>`. If a filter is active, clear it using **Filter by Revset...**.
2. Check `jjvs.logLimit` — if set to a very low value and combined with a revset, some
   revisions may be excluded.
3. Run `jj log` in the terminal to confirm the repository has visible revisions.

## Auto-refresh not working

**Symptom**: Changes made in the terminal (e.g., `jj new`, `jj rebase`) do not update
the jjvs views automatically.

**Checks**:
1. Confirm `jjvs.autoRefresh` is `true`.
2. Some remote filesystems and container environments do not support inotify/FSEvents.
   Lower `jjvs.autoRefreshInterval` to poll more frequently, or trigger refresh manually
   with the **Jujutsu: Refresh** command.

## Inline gutter diffs not showing

**Symptom**: No diff gutter indicators appear when editing files in a jj working copy.

**Checks**:
1. The file must be modified relative to the parent revision — an unchanged file shows
   no diff indicators.
2. jjvs provides gutter diffs against the parent revision of the working-copy revision.
   If the parent has no version of this file, there is nothing to diff against.
3. Check the Jujutsu output channel for errors during the original content fetch.

---

## Bookmarks view is empty

**Symptom**: The Bookmarks view shows nothing even though the repository has local bookmarks.

**Checks**:
1. Make sure the Jujutsu panel is open (click the Jujutsu icon in the Activity Bar).
2. Confirm the repository has bookmarks: run `jj bookmark list` in the terminal.
3. If you only have remote-tracking bookmarks (e.g., `main@origin`) and no local bookmarks,
   the list may appear sparse. Remote bookmarks appear in a separate group.
4. Check the Jujutsu output channel for deserialization errors.

---

## Push or fetch commands are not visible

**Symptom**: The **Push** and **Fetch** commands do not appear in the Bookmarks toolbar or
the Command Palette.

**Explanation**: Push and fetch are only available for *colocated* repositories — repositories
that have both `.jj/` and `.git/` directories. For native jj repos (without git), these
commands are hidden.

**Check**: Run `ls -la` in your workspace root. If there is no `.git/` directory, the repo
is not colocated. See [Git integration guide](../guides/git-integration.md) for more on what
colocated means.

---

## Conflict indicators not appearing

**Symptom**: A revision should have conflicts (visible in `jj log`) but the Revisions view
shows no conflict indicator.

**Checks**:
1. Trigger a manual refresh: click the refresh icon in the Revisions view toolbar.
2. Verify the revision is visible in the current revset filter — conflicted revisions
   outside the filter window will not show in the tree.
3. Increase `jjvs.logLimit` if the conflicted revision may be outside the load window.

---

## Commands fail with "A jj operation is in progress"

**Symptom**: Running a command shows "A jj operation is in progress" and nothing happens.

**Explanation**: jjvs serializes mutating commands per repository. If you triggered a command
and it is still running (e.g., a large rebase), the extension rejects new interactive commands
to prevent lock conflicts.

**Resolution**: Wait for the in-progress operation to complete, then retry. You can check the
Jujutsu output channel to see which command is running.

---

## Split or squash command shows "no files to split/squash"

**Symptom**: Running **Split Revision...** or **Squash Revision...** shows an error that the
revision has no files or only one file.

**Checks**:
1. **Split** requires at least two changed files — a revision with a single changed file
   cannot be split by file. To split a single file by hunk, use `jj split` interactively
   in the terminal.
2. **Squash** requires the target revision to be mutable. If the parent is immutable (shown
   with a 🔒 icon), squash into a specific ancestor instead.

---

## Preview panel not updating

**Symptom**: The Preview panel stays on the same revision even as you navigate the Revisions
view.

**Checks**:
1. Ensure the Preview panel is open (use **Jujutsu: Toggle Preview Panel** if needed).
2. Selecting a revision in the Revisions tree triggers the update — clicking elsewhere
   (e.g., the Details view) does not. Make sure you are clicking a revision row.
3. If the panel shows stale content after a command (e.g., after squash), trigger a manual
   refresh with **Jujutsu: Refresh**.

---

## Graph webview is blank or shows "Loading..."

**Symptom**: The Revision Graph webview panel is open but shows nothing or stays on the
loading indicator indefinitely.

**Checks**:
1. Make sure the extension host is not in a restarting state — check the Output panel for
   activation errors.
2. Open the Developer Tools console (`Help → Toggle Developer Tools`) and look for
   JavaScript errors in the webview frame.
3. Try closing and reopening the graph panel with **Jujutsu: Toggle Revision Graph**.
4. If the issue persists, set `jjvs.graphStyle` to `"text"` as a fallback — the
   text-based tree view always renders and does not require the webview.

---

## Rebase produced unexpected conflicts

**Symptom**: After running **Rebase Revision...**, one or more revisions now show conflict
indicators.

**Explanation**: This is expected jj behaviour. When a revision is moved to a new location
in the DAG, its changes may conflict with changes in the new parent. jj stores conflicts
first-class rather than aborting the rebase.

**Resolution**: See the [Conflicts guide](../guides/conflicts.md) for the full resolution
workflow. The jjvs conflict banner includes a **Resolve Conflicts** shortcut that opens the
configured merge tool directly.

---

## "jj not found" after system update or Nix shell change

**Symptom**: After a system update, Nix package upgrade, or shell env change, jjvs can no
longer find the jj binary.

**Checks**:
1. Open a new terminal and run `which jj` — if the path has changed, update `jjvs.jjPath`.
2. If you use direnv or a Nix shell, make sure the shell session that launched VSCode has
   the correct environment loaded.
3. After changing `jjvs.jjPath`, trigger a reload: run **Developer: Reload Window** from the
   Command Palette to restart the extension host with the new path.

---

## Getting more diagnostic information

Enable verbose logging by setting `jjvs.logLevel` to `"debug"` or `"trace"` in your
`settings.json`:

```json
{ "jjvs.logLevel": "debug" }
```

Then open the Output panel (`View → Output → Jujutsu`) to see every jj command invocation
with its arguments and exit code. This is the first step for diagnosing any unexpected
command failure.

---

**Related**: [Settings reference](settings.md) | [Commands reference](commands.md)
