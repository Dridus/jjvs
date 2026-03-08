/**
 * Utilities shared across jjvs integration tests.
 *
 * These helpers create real jj repositories in OS temporary directories so
 * tests never touch the live project workspace. Each helper returns an
 * object with a `cleanup()` method that callers must invoke in `after()`.
 *
 * All operations that spawn jj use `spawnSync` with a strict timeout so CI
 * jobs don't hang if jj is unavailable or broken.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as cp from 'child_process';

/** Result of `createTempJjRepo`. */
export interface TempJjRepo {
  /** Absolute path to the root of the temporary jj repository. */
  readonly rootPath: string;
  /** Run a jj command inside the repo. Returns stdout on success or throws. */
  jj(...args: string[]): string;
  /** Delete the temporary directory. Safe to call multiple times. */
  cleanup(): void;
}

/**
 * Creates a fresh `jj git init` repository in a unique OS temp directory.
 *
 * The caller **must** call `cleanup()` in an `after()` or `afterEach()` hook
 * to prevent temp directory leaks.
 *
 * @param jjPath - Path to the jj binary (default: `"jj"` resolved via PATH).
 * @throws If `jj git init` exits with a non-zero status.
 */
export function createTempJjRepo(jjPath = 'jj'): TempJjRepo {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'jjvs-test-'));

  const jj = (...args: string[]): string => {
    const result = cp.spawnSync(jjPath, args, {
      cwd: rootPath,
      encoding: 'utf8',
      timeout: 15_000,
      env: {
        ...process.env,
        // Suppress interactive prompts and progress output.
        JJ_CONFIG: '',
        NO_COLOR: '1',
      },
    });

    if (result.error !== undefined) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(
        `jj ${args.join(' ')} failed (exit ${result.status}):\n${result.stderr}`,
      );
    }
    return result.stdout;
  };

  try {
    jj('git', 'init');

    // Set a fixed author identity so tests produce deterministic output.
    jj('config', 'set', '--repo', 'user.name', 'Test User');
    jj('config', 'set', '--repo', 'user.email', 'test@example.com');
  } catch (err) {
    fs.rmSync(rootPath, { recursive: true, force: true });
    throw err;
  }

  let cleaned = false;
  const cleanup = (): void => {
    if (!cleaned) {
      cleaned = true;
      fs.rmSync(rootPath, { recursive: true, force: true });
    }
  };

  return { rootPath, jj, cleanup };
}

/**
 * Returns `true` if the `jj` binary is available on PATH (or at `jjPath`).
 *
 * Use this to skip integration tests that require a real jj installation when
 * running in environments where jj is not present.
 */
export function isJjAvailable(jjPath = 'jj'): boolean {
  const result = cp.spawnSync(jjPath, ['--version'], {
    encoding: 'utf8',
    timeout: 5_000,
  });
  return result.status === 0;
}

/**
 * Returns the parsed content of the extension's `package.json`.
 *
 * Reads the file once and caches the result. Safe to call from multiple tests.
 */
let cachedPackageJson: Record<string, unknown> | undefined;
export function getExtensionManifest(): Record<string, unknown> {
  if (cachedPackageJson === undefined) {
    const pkgPath = path.join(__dirname, '..', '..', 'package.json');
    cachedPackageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<
      string,
      unknown
    >;
  }
  return cachedPackageJson;
}
