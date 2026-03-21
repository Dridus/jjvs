/**
 * Git command implementations.
 *
 * Commands: git.push, git.fetch.
 *
 * Both commands are gated on `jjvs:isColocated` — they only apply to
 * colocated jj+git repositories and are hidden (via package.json enablement)
 * for native-jj repos.
 *
 * ## Credential error handling
 *
 * `jj git push` and `jj git fetch` can fail due to authentication problems
 * (expired tokens, missing SSH keys, wrong credentials). When the error output
 * contains recognisable credential-failure keywords, jjvs shows a specific
 * guidance message with an "Open Settings" action instead of the generic
 * "jj command failed" notification that `CommandService` would otherwise display.
 *
 * To prevent CommandService from also showing its own generic error for the
 * same failure, the action returns a synthetic `cancelled` Result after the
 * custom notification is shown — `cancelled` errors are silently swallowed by
 * CommandService.
 */

import * as vscode from 'vscode';
import { err } from '../../core/result';
import type { JjError } from '../../core/jj-runner';
import type { RevisionCommandContext } from './revision-commands';
import { pickRemote } from '../pickers/remote-picker';

// ─── Credential error detection ───────────────────────────────────────────────

/**
 * Credential/authentication keywords found in `jj git push` / `jj git fetch`
 * error output on various git backends and operating systems.
 *
 * The list is intentionally broad — false positives are harmless (the user
 * sees a "check your credentials" message for any error that mentions these
 * words, which is always relevant context).
 */
const CREDENTIAL_ERROR_PATTERNS = [
  'authentication failed',
  'authentication required',
  'could not authenticate',
  'invalid credentials',
  'credential',
  'permission denied',
  'access denied',
  'access token',
  'unauthorized',
  '403',
  '401',
  'ssh: connect to host',
  'could not read username',
  'could not read password',
  'repository not found',
  'remote: repository not found',
] as const;

/**
 * Returns `true` when a `non-zero-exit` JjError looks like a credential or
 * authentication failure.
 */
function isCredentialError(error: JjError): boolean {
  if (error.kind !== 'non-zero-exit') return false;
  const text = `${error.stderr} ${error.stdout} ${error.message}`.toLowerCase();
  return CREDENTIAL_ERROR_PATTERNS.some((pattern) => text.includes(pattern));
}

/**
 * Show a targeted credential-error notification with actionable items.
 *
 * The caller is responsible for showing this notification only when
 * `isCredentialError` returns `true`.
 */
async function showCredentialErrorNotification(remote: string): Promise<void> {
  const choice = await vscode.window.showErrorMessage(
    `Jujutsu: Authentication failed for remote "${remote}". ` +
      `Ensure your SSH key is loaded or your git credentials are configured.`,
    'Open Settings',
    'Open Git Documentation',
  );

  if (choice === 'Open Settings') {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'jjvs.git.defaultRemote');
  } else if (choice === 'Open Git Documentation') {
    await vscode.env.openExternal(
      vscode.Uri.parse('https://jj-vcs.github.io/jj/latest/git-compatibility/#authentication'),
    );
  }
}

// ─── Commands ─────────────────────────────────────────────────────────────────

/**
 * Register the `jjvs.git.push` command.
 *
 * Flow:
 * 1. Verify the repository is colocated (guard).
 * 2. Show a remote picker (defaults to `jjvs.git.defaultRemote`).
 * 3. Run `jj git push --remote <remote>` via CommandService.
 * 4. On credential errors, show targeted guidance instead of generic error.
 *
 * @param getContext - Lazy factory that returns the current command context.
 * @param getDefaultRemote - Returns the current `jjvs.git.defaultRemote` value.
 */
export function registerGitPushCommand(
  getContext: () => RevisionCommandContext | undefined,
  getDefaultRemote: () => string,
): vscode.Disposable {
  return vscode.commands.registerCommand('jjvs.git.push', async () => {
    const ctx = getContext();
    if (ctx === undefined) return;

    if (ctx.repository.kind !== 'colocated') {
      void vscode.window.showWarningMessage(
        'Jujutsu: Git push is only available for colocated jj+git repositories.',
      );
      return;
    }

    const remote = await pickRemote(ctx.repository, {
      title: 'Push to Remote',
      placeholder: 'Select a remote to push tracked bookmarks to',
      defaultRemote: getDefaultRemote(),
    });
    if (remote === undefined) return;

    await ctx.service.run({ title: `git push → ${remote}`, showProgress: true }, async (signal) => {
      const result = await ctx.cli.gitPush({ remote, signal });

      if (!result.ok && isCredentialError(result.error)) {
        await showCredentialErrorNotification(remote);
        // Return a synthetic cancelled result so CommandService does not display
        // a second generic error message on top of our custom notification.
        const cancelledError: JjError = { kind: 'cancelled', message: 'credential error shown' };
        return err(cancelledError);
      }

      return result;
    });
  });
}

/**
 * Register the `jjvs.git.fetch` command.
 *
 * Flow:
 * 1. Verify the repository is colocated (guard).
 * 2. Show a remote picker (defaults to `jjvs.git.defaultRemote`).
 * 3. Run `jj git fetch --remote <remote>` via CommandService.
 * 4. On credential errors, show targeted guidance instead of generic error.
 *
 * @param getContext - Lazy factory that returns the current command context.
 * @param getDefaultRemote - Returns the current `jjvs.git.defaultRemote` value.
 */
export function registerGitFetchCommand(
  getContext: () => RevisionCommandContext | undefined,
  getDefaultRemote: () => string,
): vscode.Disposable {
  return vscode.commands.registerCommand('jjvs.git.fetch', async () => {
    const ctx = getContext();
    if (ctx === undefined) return;

    if (ctx.repository.kind !== 'colocated') {
      void vscode.window.showWarningMessage(
        'Jujutsu: Git fetch is only available for colocated jj+git repositories.',
      );
      return;
    }

    const remote = await pickRemote(ctx.repository, {
      title: 'Fetch from Remote',
      placeholder: 'Select a remote to fetch from',
      defaultRemote: getDefaultRemote(),
    });
    if (remote === undefined) return;

    await ctx.service.run(
      { title: `git fetch ← ${remote}`, showProgress: true },
      async (signal) => {
        const result = await ctx.cli.gitFetch({ remote, signal });

        if (!result.ok && isCredentialError(result.error)) {
          await showCredentialErrorNotification(remote);
          const cancelledError: JjError = { kind: 'cancelled', message: 'credential error shown' };
          return err(cancelledError);
        }

        return result;
      },
    );
  });
}
