/**
 * JjCli — typed interface for all jj CLI commands.
 *
 * Architecture:
 * - `JjCli` is an interface so tests can inject mocks without spawning processes.
 * - `JjCliImpl` is the concrete implementation that uses a `JjRunner`.
 * - All methods return `Result<T, JjError>` — no thrown exceptions.
 * - Read commands use `json()` templates for structured output (verified on jj 0.38.0).
 * - `jj status` uses text parsing (no `-T` support in jj 0.38.0).
 *
 * Deserialization is delegated to dedicated modules in `src/core/deserializers/`:
 * - `log.ts` — revision log JSON parsing (REVISION_TEMPLATE + parseRevisions)
 * - `op-log.ts` — operation log JSON parsing (OPERATION_TEMPLATE + parseOperations)
 * - `status.ts` — `jj status` text parsing
 * - `diff.ts` — `jj diff --stat` text parsing
 */

import { ok, err, mapResult, type Result } from './result';
import { parseJjVersion, type JjVersion } from './jj-version';
import type { JjRunner, JjError } from './jj-runner';
import type { Revision, Operation, WorkingCopyStatus } from './types';
import { REVISION_TEMPLATE, parseRevisions } from './deserializers/log';
import { OPERATION_TEMPLATE, parseOperations } from './deserializers/op-log';
import { parseStatus } from './deserializers/status';
import {
  extractBookmarksFromRevisions,
  type BookmarkListResult,
} from './deserializers/bookmark';

// ─── Option types ─────────────────────────────────────────────────────────────

/** Options for `jj log`. */
export interface LogOptions {
  /**
   * Revset expression to filter revisions (e.g., `"@"`, `"trunk()..@"`).
   * Defaults to jj's `revsets.log` configuration.
   */
  readonly revset?: string;
  /** Maximum number of revisions to return. Defaults to jj's built-in limit. */
  readonly limit?: number;
  readonly signal?: AbortSignal;
}

/** Options for `jj diff`. */
export interface DiffOptions {
  /** The revision to diff. Defaults to `@`. */
  readonly changeId?: string;
  /**
   * Show diff in a specific format. Default is 'unified'.
   * - `'summary'`: per-file status letters (A/M/D/R/C) — equivalent to `--summary` (`-s`)
   * - `'stat'`: per-file line counts with a visual bar — equivalent to `--stat`
   * - `'git'`: git-compatible unified diff — equivalent to `--git`
   * - `'unified'`: jj's default word-diff format
   */
  readonly format?: 'unified' | 'git' | 'stat' | 'summary';
  readonly signal?: AbortSignal;
}

/** Options for `jj bookmark list`. */
export interface BookmarkListOptions {
  /** Include all remote bookmarks (equivalent to `--all-remotes`). */
  readonly allRemotes?: boolean;
  readonly signal?: AbortSignal;
}

/** Options for `jj op log`. */
export interface OpLogOptions {
  /** Maximum number of operations to return. */
  readonly limit?: number;
  readonly signal?: AbortSignal;
}

/** Options for `jj new`. */
export interface NewRevisionOptions {
  /**
   * Parent revsets. If empty or omitted, defaults to `@` (current working copy).
   * Pass multiple revsets to create a merge commit.
   */
  readonly revsets?: readonly string[];
  /** Initial commit description for the new revision. */
  readonly description?: string;
  readonly signal?: AbortSignal;
}

/** Options for `jj describe`. */
export interface DescribeOptions {
  /** The change ID of the revision to describe. Defaults to `@`. */
  readonly changeId?: string;
  /** The new description text. Pass `""` to clear the description. */
  readonly description: string;
  readonly signal?: AbortSignal;
}

/**
 * Source selection modes for `jj rebase`.
 * - `'revision'`: Rebase a single revision (`-r`).
 * - `'source'`: Rebase a revision and all its descendants (`-s`).
 * - `'branch'`: Rebase the entire branch containing the revision (`-b`).
 */
export type RebaseSourceMode = 'revision' | 'source' | 'branch';

/** Options for `jj rebase`. */
export interface RebaseOptions {
  /** The revset identifying what to rebase. */
  readonly revset: string;
  /** How to interpret the `revset` argument. */
  readonly mode: RebaseSourceMode;
  /** The destination revset (where to rebase onto). */
  readonly destination: string;
  /**
   * Placement relative to `destination`.
   * - `'onto'` (default): Place directly onto destination.
   * - `'after'`: Place after destination (before its children).
   * - `'before'`: Place before destination (after its parents).
   * - `'insert-after'`: Insert into the DAG after destination.
   * - `'insert-before'`: Insert into the DAG before destination.
   */
  readonly placement?: 'onto' | 'after' | 'before' | 'insert-after' | 'insert-before';
  readonly signal?: AbortSignal;
}

/** Options for `jj squash`. */
export interface SquashOptions {
  /**
   * The revision whose changes to squash.
   * Defaults to `@`.
   */
  readonly changeId?: string;
  /**
   * Squash into this specific ancestor revision instead of the direct parent.
   * Equivalent to `--into <revset>`.
   * When omitted, jj squashes into the direct parent.
   *
   * Requires jj >= 0.14.0 (verified in jj 0.38.0).
   */
  readonly into?: string;
  /** Specific file paths to squash (subset of changed files). */
  readonly paths?: readonly string[];
  /** Message for the resulting squashed commit. */
  readonly message?: string;
  readonly signal?: AbortSignal;
}

/** Options for `jj split`. */
export interface SplitOptions {
  /** The revision to split. Defaults to `@`. */
  readonly changeId?: string;
  /**
   * File paths that will go into the FIRST of the two new revisions.
   * The remaining files go into the second revision.
   * If empty or omitted, launches an interactive selection.
   */
  readonly paths?: readonly string[];
  /**
   * Description for the first revision (passed as `--message`).
   * The second revision keeps the original description.
   * jj 0.38.0 does not support setting the second description via CLI.
   */
  readonly firstDescription?: string;
  readonly signal?: AbortSignal;
}

/** Options for `jj restore`. */
export interface RestoreOptions {
  /**
   * The revision to restore files to.
   * Defaults to `@` (restore working copy to its parent state).
   */
  readonly changeId?: string;
  /**
   * Restore from this source revision instead of the parent.
   * Equivalent to `--from <source>`.
   */
  readonly from?: string;
  /** Specific file paths to restore. If omitted, restores all files. */
  readonly paths?: readonly string[];
  readonly signal?: AbortSignal;
}

/** Options for `jj revert`. */
export interface RevertOptions {
  /** The revsets whose reverse to apply. Equivalent to `-r`. */
  readonly revsets: readonly string[];
  /**
   * The destination revset to apply the reverse changes on top of.
   * Equivalent to `--onto`. Required by jj.
   */
  readonly destination: string;
  readonly signal?: AbortSignal;
}

/** Options for `jj resolve`. */
export interface ResolveOptions {
  /**
   * The conflicted file path to resolve.
   * If omitted, launches the merge tool on all conflicted files.
   */
  readonly path?: string;
  /** The revision containing the conflict. Defaults to `@`. */
  readonly changeId?: string;
  /** Override the merge tool. Uses jj's configured merge tool if omitted. */
  readonly tool?: string;
  readonly signal?: AbortSignal;
}

/** Options for `jj bookmark move`. */
export interface BookmarkMoveOptions {
  /** The bookmark to move. */
  readonly name: string;
  /** The revset to move the bookmark to. */
  readonly revset: string;
  /**
   * Allow moving the bookmark backwards or sideways (equivalent to `--allow-backwards`).
   */
  readonly allowBackwards?: boolean;
  readonly signal?: AbortSignal;
}

/** Options for `jj git push`. */
export interface GitPushOptions {
  /** Remote name. Defaults to `jjvs.git.defaultRemote` (typically `"origin"`). */
  readonly remote?: string;
  /** Specific bookmarks to push. If omitted, pushes all tracked bookmarks. */
  readonly bookmarks?: readonly string[];
  /** Push all bookmarks to the remote (`--all`). */
  readonly allBookmarks?: boolean;
  readonly signal?: AbortSignal;
}

/** Options for `jj git fetch`. */
export interface GitFetchOptions {
  /** Remote name. Defaults to all configured remotes if omitted. */
  readonly remote?: string;
  /** Specific bookmarks to fetch. */
  readonly bookmarks?: readonly string[];
  readonly signal?: AbortSignal;
}

// ─── JjCli interface ─────────────────────────────────────────────────────────

/**
 * Typed interface for all jj CLI commands used by jjvs.
 *
 * Implementations:
 * - `JjCliImpl`: Production implementation using `JjRunner`.
 * - Mock implementations in tests: implement this interface to return
 *   pre-defined results without spawning processes.
 *
 * All methods return `Result<T, JjError>`. Callers in `src/vscode/` convert
 * errors to user-facing messages via `CommandService`.
 */
export interface JjCli {
  // ── Read operations ──────────────────────────────────────────────────────

  /**
   * Fetch the revision log.
   * Equivalent to `jj log --no-graph -T <json-template>`.
   */
  log(options?: LogOptions): Promise<Result<readonly Revision[], JjError>>;

  /**
   * Show the diff of a revision as human-readable text.
   * Equivalent to `jj show <changeId>`.
   * Returns raw text output (may include ANSI codes if the terminal supports it).
   */
  show(changeId: string, signal?: AbortSignal): Promise<Result<string, JjError>>;

  /**
   * Show the full contents of a revision with ANSI color output.
   *
   * Uses `--color always` to force color output even though the runner sets
   * `NO_COLOR=1` for machine-readable commands. The explicit CLI flag takes
   * precedence over the environment variable in jj >= 0.25.0.
   *
   * Equivalent to `jj show --color always <changeId>`.
   */
  showWithColor(changeId: string, signal?: AbortSignal): Promise<Result<string, JjError>>;

  /**
   * Show the diff of a revision.
   * Equivalent to `jj diff [-r <changeId>]`.
   */
  diff(options?: DiffOptions): Promise<Result<string, JjError>>;

  /**
   * Get the working copy status.
   * Uses text parsing (no `-T` support in jj 0.38.0).
   * Equivalent to `jj status`.
   */
  status(signal?: AbortSignal): Promise<Result<WorkingCopyStatus, JjError>>;

  /**
   * List all bookmarks (local and remote).
   * Uses `jj log` under the hood for structured output.
   * Phase 3 will migrate to `jj bookmark list -T <json-template>`.
   */
  bookmarkList(options?: BookmarkListOptions): Promise<Result<BookmarkListResult, JjError>>;

  /**
   * Fetch the operation log.
   * Equivalent to `jj op log --no-graph -T <json-template>`.
   */
  opLog(options?: OpLogOptions): Promise<Result<readonly Operation[], JjError>>;

  /**
   * Get the evolution log for a change (all commits that held this change ID).
   * Equivalent to `jj evolog --no-graph -T <json-template> -r <changeId>`.
   */
  evolog(changeId: string, signal?: AbortSignal): Promise<Result<readonly Revision[], JjError>>;

  /**
   * Get a jj configuration value.
   * Equivalent to `jj config get <key>`.
   */
  configGet(key: string, signal?: AbortSignal): Promise<Result<string, JjError>>;

  /**
   * Get the installed jj version.
   * Equivalent to `jj --version`.
   */
  version(signal?: AbortSignal): Promise<Result<JjVersion, JjError>>;

  /**
   * Get the raw content of a file at a specific revision.
   * Equivalent to `jj file show -r <revset> -- <relativePath>`.
   *
   * Returns an error result (non-zero-exit) if the file does not exist at the
   * requested revision (e.g., for newly-added files the path won't exist at
   * the parent revision `@-`). Callers should treat this as "empty original".
   *
   * Requires jj >= 0.25.0.
   */
  fileShow(
    relativePath: string,
    revset: string,
    signal?: AbortSignal,
  ): Promise<Result<string, JjError>>;

  // ── Mutating revision operations ─────────────────────────────────────────

  /**
   * Create a new empty revision.
   * Equivalent to `jj new [revsets...]`.
   * (Named `newRevision` to avoid conflict with the TypeScript `new` keyword
   * in interface positions, where `new()` is a construct signature.)
   */
  newRevision(options?: NewRevisionOptions): Promise<Result<void, JjError>>;

  /** Move the working copy to an existing revision. Equivalent to `jj edit <changeId>`. */
  edit(changeId: string, signal?: AbortSignal): Promise<Result<void, JjError>>;

  /** Abandon one or more revisions. Equivalent to `jj abandon <changeIds...>`. */
  abandon(changeIds: readonly string[], signal?: AbortSignal): Promise<Result<void, JjError>>;

  /** Set the description of a revision. Equivalent to `jj describe`. */
  describe(options: DescribeOptions): Promise<Result<void, JjError>>;

  /** Duplicate one or more revisions. Equivalent to `jj duplicate <changeIds...>`. */
  duplicate(changeIds: readonly string[], signal?: AbortSignal): Promise<Result<void, JjError>>;

  /** Rebase revisions to a different location. Equivalent to `jj rebase`. */
  rebase(options: RebaseOptions): Promise<Result<void, JjError>>;

  /** Squash revisions into their parent. Equivalent to `jj squash`. */
  squash(options?: SquashOptions): Promise<Result<void, JjError>>;

  /** Split a revision into two. Equivalent to `jj split`. */
  split(options?: SplitOptions): Promise<Result<void, JjError>>;

  /** Restore files to a prior state. Equivalent to `jj restore`. */
  restore(options?: RestoreOptions): Promise<Result<void, JjError>>;

  /**
   * Absorb changes from the working copy into appropriate ancestor revisions.
   * Equivalent to `jj absorb`.
   */
  absorb(signal?: AbortSignal): Promise<Result<void, JjError>>;

  /** Create inverse commits that undo the effect of revisions. Equivalent to `jj revert`. */
  revert(options: RevertOptions): Promise<Result<void, JjError>>;

  /** Launch a merge tool to resolve conflicts. Equivalent to `jj resolve`. */
  resolve(options?: ResolveOptions): Promise<Result<void, JjError>>;

  // ── Bookmark operations ───────────────────────────────────────────────────

  /** Create a bookmark. Equivalent to `jj bookmark create <name> -r <revset>`. */
  bookmarkCreate(
    name: string,
    revset: string,
    signal?: AbortSignal,
  ): Promise<Result<void, JjError>>;

  /** Move a bookmark to a different revision. Equivalent to `jj bookmark move`. */
  bookmarkMove(options: BookmarkMoveOptions): Promise<Result<void, JjError>>;

  /** Delete local bookmarks. Equivalent to `jj bookmark delete <names...>`. */
  bookmarkDelete(names: readonly string[], signal?: AbortSignal): Promise<Result<void, JjError>>;

  /** Forget bookmarks (remove without deleting on remote). Equivalent to `jj bookmark forget`. */
  bookmarkForget(names: readonly string[], signal?: AbortSignal): Promise<Result<void, JjError>>;

  /** Track a remote bookmark locally. Equivalent to `jj bookmark track <name>@<remote>`. */
  bookmarkTrack(
    name: string,
    remote: string,
    signal?: AbortSignal,
  ): Promise<Result<void, JjError>>;

  /** Stop tracking a remote bookmark. Equivalent to `jj bookmark untrack <name>@<remote>`. */
  bookmarkUntrack(
    name: string,
    remote: string,
    signal?: AbortSignal,
  ): Promise<Result<void, JjError>>;

  // ── Git operations (colocated repos only) ─────────────────────────────────

  /**
   * Push bookmarks to a remote.
   * Only available for colocated (jj+git) repositories.
   * Equivalent to `jj git push`.
   */
  gitPush(options?: GitPushOptions): Promise<Result<void, JjError>>;

  /**
   * Fetch from a remote.
   * Only available for colocated (jj+git) repositories.
   * Equivalent to `jj git fetch`.
   */
  gitFetch(options?: GitFetchOptions): Promise<Result<void, JjError>>;

  // ── Operation log operations ──────────────────────────────────────────────

  /**
   * Restore the repository to the state at a specific operation.
   * Equivalent to `jj op restore <operationId>`.
   */
  opRestore(operationId: string, signal?: AbortSignal): Promise<Result<void, JjError>>;

  /** Undo the most recent operation. Equivalent to `jj undo`. */
  opUndo(signal?: AbortSignal): Promise<Result<void, JjError>>;
}

// ─── JjCliImpl ────────────────────────────────────────────────────────────────

/**
 * Production implementation of `JjCli` that uses a `JjRunner` to execute
 * jj commands and deserialises the output into typed domain objects.
 */
export class JjCliImpl implements JjCli {
  constructor(private readonly runner: JjRunner) {}

  // ── Read operations ──────────────────────────────────────────────────────

  async log(options?: LogOptions): Promise<Result<readonly Revision[], JjError>> {
    const args = ['log', '--no-graph', '-T', REVISION_TEMPLATE];
    if (options?.revset !== undefined) {
      args.push('--revisions', options.revset);
    }
    if (options?.limit !== undefined) {
      args.push('--limit', String(options.limit));
    }
    const result = await this.runner.run(args, options?.signal);
    return mapResult(result, (output) => parseRevisions(output.stdout));
  }

  async show(changeId: string, signal?: AbortSignal): Promise<Result<string, JjError>> {
    return mapResult(
      await this.runner.run(['show', changeId], signal),
      (output) => output.stdout,
    );
  }

  async showWithColor(changeId: string, signal?: AbortSignal): Promise<Result<string, JjError>> {
    return mapResult(
      await this.runner.run(['show', '--color', 'always', changeId], signal),
      (output) => output.stdout,
    );
  }

  async diff(options?: DiffOptions): Promise<Result<string, JjError>> {
    const args = ['diff'];
    if (options?.changeId !== undefined) {
      args.push('-r', options.changeId);
    }
    if (options?.format === 'git') {
      args.push('--git');
    } else if (options?.format === 'stat') {
      args.push('--stat');
    } else if (options?.format === 'summary') {
      args.push('--summary');
    }
    return mapResult(await this.runner.run(args, options?.signal), (output) => output.stdout);
  }

  async status(signal?: AbortSignal): Promise<Result<WorkingCopyStatus, JjError>> {
    const result = await this.runner.run(['status'], signal);
    return mapResult(result, (output) => parseStatus(output.stdout));
  }

  async bookmarkList(
    options?: BookmarkListOptions,
  ): Promise<Result<BookmarkListResult, JjError>> {
    // Uses jj log to extract bookmark data in structured form (log-based approach).
    // Phase 10 will replace this with direct `jj bookmark list -T` parsing using CommitRef fields.
    const revset = options?.allRemotes
      ? 'bookmarks() | remote_bookmarks()'
      : 'bookmarks()';
    // Conditional spread avoids passing `undefined` for `signal` with exactOptionalPropertyTypes.
    const logResult = await this.log({
      revset,
      ...(options?.signal !== undefined ? { signal: options.signal } : {}),
    });
    return mapResult(logResult, extractBookmarksFromRevisions);
  }

  async opLog(options?: OpLogOptions): Promise<Result<readonly Operation[], JjError>> {
    const args = ['op', 'log', '--no-graph', '-T', OPERATION_TEMPLATE];
    if (options?.limit !== undefined) {
      args.push('--limit', String(options.limit));
    }
    const result = await this.runner.run(args, options?.signal);
    return mapResult(result, (output) => parseOperations(output.stdout));
  }

  async evolog(changeId: string, signal?: AbortSignal): Promise<Result<readonly Revision[], JjError>> {
    const args = ['evolog', '--no-graph', '-T', REVISION_TEMPLATE, '-r', changeId];
    const result = await this.runner.run(args, signal);
    return mapResult(result, (output) => parseRevisions(output.stdout));
  }

  async configGet(key: string, signal?: AbortSignal): Promise<Result<string, JjError>> {
    return mapResult(
      await this.runner.run(['config', 'get', key], signal),
      (output) => output.stdout.trim(),
    );
  }

  async fileShow(
    relativePath: string,
    revset: string,
    signal?: AbortSignal,
  ): Promise<Result<string, JjError>> {
    return mapResult(
      await this.runner.run(['file', 'show', '-r', revset, '--', relativePath], signal),
      (output) => output.stdout,
    );
  }

  async version(signal?: AbortSignal): Promise<Result<JjVersion, JjError>> {
    const result = await this.runner.run(['--version'], signal);
    if (!result.ok) return result;
    const parsed = parseJjVersion(result.value.stdout);
    if (parsed === undefined) {
      return err({
        kind: 'unknown',
        message: `Could not parse jj version from output: ${result.value.stdout.trim()}`,
      });
    }
    return ok(parsed);
  }

  // ── Mutating revision operations ─────────────────────────────────────────

  async newRevision(options?: NewRevisionOptions): Promise<Result<void, JjError>> {
    const args = ['new'];
    if (options?.description !== undefined) {
      args.push('--message', options.description);
    }
    if (options?.revsets !== undefined) {
      args.push(...options.revsets);
    }
    return voidResult(await this.runner.run(args, options?.signal));
  }

  async edit(changeId: string, signal?: AbortSignal): Promise<Result<void, JjError>> {
    return voidResult(await this.runner.run(['edit', changeId], signal));
  }

  async abandon(
    changeIds: readonly string[],
    signal?: AbortSignal,
  ): Promise<Result<void, JjError>> {
    return voidResult(await this.runner.run(['abandon', ...changeIds], signal));
  }

  async describe(options: DescribeOptions): Promise<Result<void, JjError>> {
    const args = ['describe', '--message', options.description];
    if (options.changeId !== undefined) {
      args.push(options.changeId);
    }
    return voidResult(await this.runner.run(args, options.signal));
  }

  async duplicate(
    changeIds: readonly string[],
    signal?: AbortSignal,
  ): Promise<Result<void, JjError>> {
    return voidResult(await this.runner.run(['duplicate', ...changeIds], signal));
  }

  async rebase(options: RebaseOptions): Promise<Result<void, JjError>> {
    const modeFlag =
      options.mode === 'revision' ? '-r' :
      options.mode === 'source'   ? '-s' :
                                    '-b';
    const args = ['rebase', modeFlag, options.revset];

    const placement = options.placement ?? 'onto';
    switch (placement) {
      case 'onto':
        args.push('--destination', options.destination);
        break;
      case 'after':
        args.push('--after', options.destination);
        break;
      case 'before':
        args.push('--before', options.destination);
        break;
      case 'insert-after':
        args.push('--insert-after', options.destination);
        break;
      case 'insert-before':
        args.push('--insert-before', options.destination);
        break;
      default: {
        const _exhaustive: never = placement;
        void _exhaustive;
      }
    }

    return voidResult(await this.runner.run(args, options.signal));
  }

  async squash(options?: SquashOptions): Promise<Result<void, JjError>> {
    const args = ['squash'];
    if (options?.changeId !== undefined) {
      args.push('-r', options.changeId);
    }
    if (options?.into !== undefined) {
      args.push('--into', options.into);
    }
    if (options?.message !== undefined) {
      args.push('--message', options.message);
    }
    if (options?.paths !== undefined && options.paths.length > 0) {
      args.push('--', ...options.paths);
    }
    return voidResult(await this.runner.run(args, options?.signal));
  }

  async split(options?: SplitOptions): Promise<Result<void, JjError>> {
    const args = ['split'];
    if (options?.changeId !== undefined) {
      args.push('-r', options.changeId);
    }
    if (options?.firstDescription !== undefined) {
      args.push('--message', options.firstDescription);
    }
    if (options?.paths !== undefined && options.paths.length > 0) {
      // Paths come after -- to separate them from flags
      args.push('--', ...options.paths);
    }
    return voidResult(await this.runner.run(args, options?.signal));
  }

  async restore(options?: RestoreOptions): Promise<Result<void, JjError>> {
    const args = ['restore'];
    if (options?.changeId !== undefined) {
      // --into specifies the destination revision to restore files into
      args.push('--into', options.changeId);
    }
    if (options?.from !== undefined) {
      args.push('--from', options.from);
    }
    if (options?.paths !== undefined && options.paths.length > 0) {
      args.push('--', ...options.paths);
    }
    return voidResult(await this.runner.run(args, options?.signal));
  }

  async absorb(signal?: AbortSignal): Promise<Result<void, JjError>> {
    return voidResult(await this.runner.run(['absorb'], signal));
  }

  async revert(options: RevertOptions): Promise<Result<void, JjError>> {
    const args = ['revert'];
    for (const revset of options.revsets) {
      args.push('-r', revset);
    }
    args.push('--onto', options.destination);
    return voidResult(await this.runner.run(args, options.signal));
  }

  async resolve(options?: ResolveOptions): Promise<Result<void, JjError>> {
    const args = ['resolve'];
    if (options?.changeId !== undefined) {
      args.push('-r', options.changeId);
    }
    if (options?.tool !== undefined) {
      args.push('--tool', options.tool);
    }
    if (options?.path !== undefined) {
      args.push('--', options.path);
    }
    return voidResult(await this.runner.run(args, options?.signal));
  }

  // ── Bookmark operations ───────────────────────────────────────────────────

  async bookmarkCreate(
    name: string,
    revset: string,
    signal?: AbortSignal,
  ): Promise<Result<void, JjError>> {
    return voidResult(
      await this.runner.run(['bookmark', 'create', name, '--revision', revset], signal),
    );
  }

  async bookmarkMove(options: BookmarkMoveOptions): Promise<Result<void, JjError>> {
    const args = ['bookmark', 'move', options.name, '--revision', options.revset];
    if (options.allowBackwards === true) {
      args.push('--allow-backwards');
    }
    return voidResult(await this.runner.run(args, options.signal));
  }

  async bookmarkDelete(
    names: readonly string[],
    signal?: AbortSignal,
  ): Promise<Result<void, JjError>> {
    return voidResult(await this.runner.run(['bookmark', 'delete', ...names], signal));
  }

  async bookmarkForget(
    names: readonly string[],
    signal?: AbortSignal,
  ): Promise<Result<void, JjError>> {
    return voidResult(await this.runner.run(['bookmark', 'forget', ...names], signal));
  }

  async bookmarkTrack(
    name: string,
    remote: string,
    signal?: AbortSignal,
  ): Promise<Result<void, JjError>> {
    return voidResult(
      await this.runner.run(['bookmark', 'track', `${name}@${remote}`], signal),
    );
  }

  async bookmarkUntrack(
    name: string,
    remote: string,
    signal?: AbortSignal,
  ): Promise<Result<void, JjError>> {
    return voidResult(
      await this.runner.run(['bookmark', 'untrack', `${name}@${remote}`], signal),
    );
  }

  // ── Git operations ────────────────────────────────────────────────────────

  async gitPush(options?: GitPushOptions): Promise<Result<void, JjError>> {
    const args = ['git', 'push'];
    if (options?.remote !== undefined) {
      args.push('--remote', options.remote);
    }
    if (options?.allBookmarks === true) {
      args.push('--all');
    } else if (options?.bookmarks !== undefined && options.bookmarks.length > 0) {
      for (const bookmark of options.bookmarks) {
        args.push('--bookmark', bookmark);
      }
    }
    return voidResult(await this.runner.run(args, options?.signal));
  }

  async gitFetch(options?: GitFetchOptions): Promise<Result<void, JjError>> {
    const args = ['git', 'fetch'];
    if (options?.remote !== undefined) {
      args.push('--remote', options.remote);
    }
    if (options?.bookmarks !== undefined && options.bookmarks.length > 0) {
      for (const bookmark of options.bookmarks) {
        args.push('--branch', bookmark);
      }
    }
    return voidResult(await this.runner.run(args, options?.signal));
  }

  // ── Operation log operations ──────────────────────────────────────────────

  async opRestore(operationId: string, signal?: AbortSignal): Promise<Result<void, JjError>> {
    return voidResult(await this.runner.run(['op', 'restore', operationId], signal));
  }

  async opUndo(signal?: AbortSignal): Promise<Result<void, JjError>> {
    return voidResult(await this.runner.run(['undo'], signal));
  }
}

// ─── Helper functions ─────────────────────────────────────────────────────────

/**
 * Convert a `Result<JjOutput, JjError>` to `Result<void, JjError>` by
 * discarding the output. Used for mutating commands where only success/failure
 * matters.
 */
function voidResult(result: Result<{ stdout: string; stderr: string }, JjError>): Result<void, JjError> {
  return mapResult(result, () => undefined);
}

// parseRevisions, parseOperations, and parseStatus are imported from
// src/core/deserializers/ at the top of this file.


// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a `JjCliImpl` bound to the given runner.
 * Prefer this over constructing `JjCliImpl` directly.
 */
export function createJjCli(runner: JjRunner): JjCli {
  return new JjCliImpl(runner);
}
