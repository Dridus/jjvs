/**
 * JjRunner — low-level process execution layer for jj commands.
 *
 * Provides:
 * - Cancellation via `AbortSignal`
 * - Configurable per-instance timeout
 * - Typed error variants (`JjError`)
 * - `Result<T, E>` return type (no thrown exceptions)
 *
 * `JjRunner` is an interface so tests can inject mock implementations without
 * spawning real processes. The concrete `JjRunnerImpl` is used in production.
 *
 * The suppression guard that silences file watcher events during
 * extension-initiated commands lives in `FileWatcher` (VSCode layer), keeping
 * this interface clean of that concern.
 */

import { spawn } from 'child_process';
import { ok, err, type Result } from './result';

/** Raw stdout/stderr from a completed jj process. */
export interface JjOutput {
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Typed error variants from jj process execution.
 * Use the `kind` discriminant to handle each case.
 */
export type JjError =
  | {
      /** The jj binary was not found at the configured path. */
      readonly kind: 'not-found';
      readonly message: string;
    }
  | {
      /** The process did not complete within the configured timeout. */
      readonly kind: 'timeout';
      readonly message: string;
      readonly timeoutMs: number;
    }
  | {
      /** The command was cancelled via an `AbortSignal`. */
      readonly kind: 'cancelled';
      readonly message: string;
    }
  | {
      /** The process exited with a non-zero status code. */
      readonly kind: 'non-zero-exit';
      readonly exitCode: number;
      /** Stdout captured before the non-zero exit (may be partial). */
      readonly stdout: string;
      /** Stderr captured before the non-zero exit (often contains jj's error message). */
      readonly stderr: string;
      readonly message: string;
    }
  | {
      /** An unexpected error occurred during process management. */
      readonly kind: 'unknown';
      readonly message: string;
      readonly cause?: unknown;
    };

/** Configuration for a `JjRunnerImpl` instance. */
export interface JjRunnerConfig {
  /** Absolute path to the jj binary. Defaults to `"jj"` (resolved via PATH). */
  readonly jjPath: string;
  /** Absolute path to the working directory (repository root). */
  readonly workingDirectory: string;
  /**
   * Default command timeout in milliseconds.
   * Long-running commands (log on large repos, diff of large changesets) may
   * need a higher value; callers can pass a per-call `AbortSignal` to cancel
   * independently. Default: 30000 (30 seconds).
   */
  readonly defaultTimeoutMs?: number;
}

/**
 * Interface for running raw jj CLI commands.
 *
 * The interface exists to allow test doubles (mocks/stubs) without spawning
 * real processes. `JjCli` depends on this interface, not the concrete class.
 */
export interface JjRunner {
  /** The working directory this runner is associated with (repository root). */
  readonly workingDirectory: string;

  /**
   * Run a jj command with the given arguments.
   *
   * The runner adds `NO_COLOR=1` to the subprocess environment so that jj
   * does not emit ANSI escape codes in its output (simplifying parsing).
   *
   * @param args Command arguments (e.g., `['log', '--no-graph', '-T', '...']`).
   *   Do not include the `jj` binary name itself.
   * @param signal Optional `AbortSignal` for external cancellation. A cancelled
   *   command is not an error in the user-action sense, but does return
   *   `Err({ kind: 'cancelled' })`.
   * @returns `Ok<JjOutput>` on success (exit code 0), or `Err<JjError>` on
   *   failure (non-zero exit, timeout, cancellation, binary not found, etc.).
   */
  run(args: readonly string[], signal?: AbortSignal): Promise<Result<JjOutput, JjError>>;
}

/**
 * Production implementation of `JjRunner` that spawns real jj processes.
 */
export class JjRunnerImpl implements JjRunner {
  readonly workingDirectory: string;
  private readonly jjPath: string;
  private readonly defaultTimeoutMs: number;

  constructor(config: JjRunnerConfig) {
    this.jjPath = config.jjPath;
    this.workingDirectory = config.workingDirectory;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 30_000;
  }

  async run(args: readonly string[], signal?: AbortSignal): Promise<Result<JjOutput, JjError>> {
    // Reject immediately if the caller's signal is already aborted.
    if (signal?.aborted === true) {
      return err({ kind: 'cancelled', message: 'Command was cancelled before starting' });
    }

    const timeoutMs = this.defaultTimeoutMs;

    // Single controller that aggregates both our timeout and the caller's signal.
    const controller = new AbortController();
    let wasCancelled = false;

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    const onCallerAbort = (): void => {
      wasCancelled = true;
      controller.abort();
    };

    signal?.addEventListener('abort', onCallerAbort, { once: true });

    try {
      return await this.spawnAndCollect(args, controller.signal, timeoutMs, {
        wasCancelled: () => wasCancelled,
      });
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onCallerAbort);
    }
  }

  private spawnAndCollect(
    args: readonly string[],
    signal: AbortSignal,
    timeoutMs: number,
    state: { wasCancelled: () => boolean },
  ): Promise<Result<JjOutput, JjError>> {
    return new Promise<Result<JjOutput, JjError>>((resolve) => {
      // settled prevents double-resolution when both 'error' and 'close' fire.
      let settled = false;
      const settle = (result: Result<JjOutput, JjError>): void => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };

      const { wasCancelled } = state;
      const command = args[0] ?? '(unknown)';

      let childProcess: ReturnType<typeof spawn>;
      try {
        childProcess = spawn(this.jjPath, [...args], {
          cwd: this.workingDirectory,
          signal,
          // Disable ANSI colour codes for machine-readable output.
          // Inherit the rest of the environment (PATH, HOME, JJ_CONFIG, etc.).
          env: { ...process.env, NO_COLOR: '1' },
        });
      } catch (spawnError) {
        // spawn() can throw synchronously for invalid arguments.
        const message = spawnError instanceof Error ? spawnError.message : String(spawnError);
        settle(err({ kind: 'unknown', message, cause: spawnError }));
        return;
      }

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      childProcess.stdout?.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });

      childProcess.stderr?.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      // The 'close' event fires after the process exits and all stdio streams
      // have been flushed. signalName is non-null when the OS killed the process.
      childProcess.on('close', (code, signalName) => {
        const stdout = Buffer.concat(stdoutChunks).toString('utf8');
        const stderr = Buffer.concat(stderrChunks).toString('utf8');

        if (signalName !== null) {
          if (wasCancelled()) {
            settle(err({ kind: 'cancelled', message: 'Command was cancelled' }));
          } else {
            settle(
              err({
                kind: 'timeout',
                message: `jj ${command} timed out after ${timeoutMs}ms`,
                timeoutMs,
              }),
            );
          }
          return;
        }

        const exitCode = code ?? 1;
        if (exitCode !== 0) {
          settle(
            err({
              kind: 'non-zero-exit',
              exitCode,
              stdout,
              stderr,
              message: `jj ${command} exited with code ${exitCode}`,
            }),
          );
          return;
        }

        settle(ok({ stdout, stderr }));
      });

      // The 'error' event fires when the process cannot be spawned, or when
      // the AbortController kills the process (emits AbortError).
      childProcess.on('error', (error: NodeJS.ErrnoException) => {
        if (error.name === 'AbortError') {
          if (wasCancelled()) {
            settle(err({ kind: 'cancelled', message: 'Command was cancelled' }));
          } else {
            settle(
              err({
                kind: 'timeout',
                message: `jj ${command} timed out after ${timeoutMs}ms`,
                timeoutMs,
              }),
            );
          }
          return;
        }

        if (error.code === 'ENOENT') {
          settle(
            err({
              kind: 'not-found',
              message: `jj binary not found at '${this.jjPath}'. Check the jjvs.jjPath setting.`,
            }),
          );
          return;
        }

        settle(err({ kind: 'unknown', message: error.message, cause: error }));
      });
    });
  }
}

/**
 * Convenience factory for creating a `JjRunnerImpl`.
 * Prefer this over constructing `JjRunnerImpl` directly.
 */
export function createJjRunner(config: JjRunnerConfig): JjRunner {
  return new JjRunnerImpl(config);
}
