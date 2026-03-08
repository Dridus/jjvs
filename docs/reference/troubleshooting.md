# Troubleshooting

<!-- TODO(phase-15): Expand with problems encountered during integration testing and real-world use across Phases 7–14. -->

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
