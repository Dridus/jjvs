# Git integration

This guide covers push and fetch for colocated jj+git repositories: how to use
the push and fetch commands, how to select a remote, and how to troubleshoot
authentication failures.

**Prerequisites**: A colocated jj+git repository (one created with
`jj git init --colocate` or cloned with `jj git clone`). For native jj
repositories, git push and fetch are not applicable.

**Related**: [Bookmarks](bookmarks.md) | [Commands reference](../reference/commands.md)
| [Settings reference](../reference/settings.md)

---

## Colocated vs. native repositories

jj supports two repository kinds:

| Kind | How created | Git push/fetch |
|------|-------------|----------------|
| **Colocated** | `jj git init --colocate` or `jj git clone` | Available — `jj git push` / `jj git fetch` |
| **Native** | `jj init` (no git backend) | Not available |

jjvs detects the repository kind at activation. The push and fetch buttons in
the status bar and the `jjvs.git.push` / `jjvs.git.fetch` commands are only
visible when the active repository is colocated.

---

## Fetching from a remote

Fetching downloads new commits and updates remote-tracking bookmarks from a
git remote.

**From the status bar:**

1. Click the `$(cloud-download)` fetch button in the status bar (bottom of
   the window). It appears next to the current change ID for colocated repos.

**From the Command Palette:**

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Type **Jujutsu: Fetch...** and press Enter.

**Either way:**

A remote picker appears listing all known remotes extracted from your
bookmark data. The configured default remote (`jjvs.git.defaultRemote`,
default `"origin"`) is listed first and pre-selected.

- Press Enter to fetch from the default remote, or
- Select a different remote from the list, or
- Type a remote name that is not shown in the list.

After a successful fetch, jjvs refreshes all views automatically. You will
see any newly fetched remote bookmarks in the Bookmarks view.

Equivalent to: `jj git fetch --remote <remote>`

---

## Pushing to a remote

Pushing sends your local tracked bookmarks to a git remote.

**From the status bar:**

1. Click the `$(cloud-upload)` push button in the status bar.

**From the Command Palette:**

1. Open the Command Palette.
2. Type **Jujutsu: Push...** and press Enter.

**Either way:**

The same remote picker appears. Select or type a remote name and press Enter.

jjvs runs `jj git push --remote <remote>`, which pushes all tracked bookmarks
to that remote. Only bookmarks that are tracked (and have moved since the last
push) are sent.

To push a specific bookmark, use `jj bookmark track` first to make it tracked,
then push. See the [Bookmarks guide](bookmarks.md#tracking-a-remote-bookmark)
for details on tracking.

Equivalent to: `jj git push --remote <remote>`

---

## The remote picker

The remote picker lists remote names derived from the remote bookmarks already
cached in jjvs's revision data. If you have just cloned a repository with no
tracked bookmarks, only the configured default remote is shown.

You can type any remote name — the picker accepts free-form input, not just
names in the list. This is useful when you want to push to a remote that has
no bookmarks tracked locally yet (for example, a new fork remote you added via
`git remote add`).

---

## Configuring the default remote

The `jjvs.git.defaultRemote` setting controls which remote is pre-selected in
the picker:

```json
{ "jjvs.git.defaultRemote": "upstream" }
```

**Default**: `"origin"`  
**Scope**: Resource (can differ per workspace folder)

See [Settings reference — jjvs.git.defaultRemote](../reference/settings.md#jjvsgitdefaultremote)
for full documentation.

---

## Authentication and credential errors

When push or fetch fails due to authentication, jjvs shows a targeted
notification:

> **Jujutsu: Authentication failed for remote "origin". Ensure your SSH key is
> loaded or your git credentials are configured.**

The notification provides two action buttons:
- **Open Settings** — Opens jjvs settings so you can inspect `jjvs.jjPath`
  and `jjvs.git.defaultRemote`.
- **Open Git Documentation** — Opens the jj git compatibility page on
  credential helpers.

### Common authentication scenarios

**SSH key not loaded:**
```
$ ssh-add ~/.ssh/id_ed25519
```
On macOS, also ensure the key is in Keychain:
```
$ ssh-add --apple-use-keychain ~/.ssh/id_ed25519
```

**HTTPS with a credential helper (GitHub, GitLab):**

jj uses the git credential helper configured in `~/.gitconfig` or
`~/.config/jj/config.toml`. If you use HTTPS remotes, configure the appropriate
credential helper for your platform (Git Credential Manager, macOS Keychain, etc.)
and authenticate once via `git fetch` or `git push` in the terminal — subsequent
jj operations reuse the stored credentials.

**Personal access token (PAT):**

For hosted git services that require a token, use the service's credential
helper or configure the remote URL to embed the token:
```
$ jj git remote set-url origin https://<token>@github.com/user/repo.git
```

**Checking which credentials jj is using:**

Run in a terminal to test authentication directly:
```
$ jj git fetch --remote origin
```
Any credential error from jj will be shown in full there, which may include
more detail than the jjvs notification.

---

## Status bar items

For colocated repositories, jjvs adds three items to the left side of the
status bar:

| Item | What it shows | Click action |
|------|---------------|--------------|
| `$(git-commit) <changeId> [bookmark]` | Current working-copy change ID and any local bookmarks attached to it | Opens the describe dialog |
| `$(cloud-upload)` | Push button | Runs `jjvs.git.push` |
| `$(cloud-download)` | Fetch button | Runs `jjvs.git.fetch` |

The push and fetch buttons are hidden for native jj repositories.

---

## What next?

- **Track a remote bookmark** before pushing to make it visible to the push
  command: [Tracking a remote bookmark](bookmarks.md#tracking-a-remote-bookmark)
- **After a fetch**, conflicts may appear if remote changes diverge from your
  local revisions: [Conflicts guide](conflicts.md)
- **Undo a push** is not possible via jj (git history is immutable on the
  remote), but you can `jj undo` to roll back local state and push again.
  See [Operation log guide](operation-log.md)
