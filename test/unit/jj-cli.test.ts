/**
 * Unit tests for JjCliImpl.
 *
 * Uses a MockJjRunner to avoid spawning real processes. Test fixture data is
 * real jj output captured from jj 0.38.0 on 2026-03-07.
 *
 * The mock runner records every call so tests can verify that the correct
 * command arguments were passed to jj.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { JjCliImpl } from '../../src/core/jj-cli';
import type { NewRevisionOptions, RebaseOptions, DescribeOptions } from '../../src/core/jj-cli';
import { ok, err } from '../../src/core/result';
import type { JjRunner, JjOutput, JjError } from '../../src/core/jj-runner';
import type { Result } from '../../src/core/result';

// ─── Mock runner ─────────────────────────────────────────────────────────────

/**
 * A JjRunner mock that returns pre-defined responses based on the first
 * command argument, and records every call for assertion.
 */
class MockJjRunner implements JjRunner {
  readonly workingDirectory = '/mock/repo';
  readonly calls: Array<readonly string[]> = [];

  private readonly responses = new Map<
    string,
    (args: readonly string[]) => Result<JjOutput, JjError>
  >();

  /** Register a response handler for commands whose first argument matches `command`. */
  on(command: string, handler: (args: readonly string[]) => Result<JjOutput, JjError>): void {
    this.responses.set(command, handler);
  }

  /** Convenience: register a successful stdout response. */
  succeed(command: string, stdout: string, stderr = ''): void {
    this.on(command, () => ok({ stdout, stderr }));
  }

  /** Convenience: register a void success (empty stdout). */
  succeedVoid(command: string): void {
    this.succeed(command, '');
  }

  /** Convenience: register a failure response. */
  fail(command: string, error: JjError): void {
    this.on(command, () => err(error));
  }

  async run(args: readonly string[]): Promise<Result<JjOutput, JjError>> {
    this.calls.push([...args]);
    const command = args[0] ?? '';
    const handler = this.responses.get(command);
    if (handler !== undefined) {
      return handler(args);
    }
    return err({
      kind: 'unknown',
      message: `MockJjRunner: unexpected command '${args.join(' ')}'`,
    });
  }
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

/**
 * A real jj log revision entry, captured from jj 0.38.0 on 2026-03-07.
 * Represents the working copy revision (empty, no description, @).
 */
const FIXTURE_WORKING_COPY_REVISION = JSON.stringify({
  changeId: 'kqxqutopsoptvlrmpmuurzkkpkwuzomw',
  commitId: 'f10fcb59fa088cf5d2342efd57ea20c467d3b506',
  description: '',
  author: {
    name: 'Ross MacLeod',
    email: 'rmm+github@z.odi.ac',
    timestamp: '2026-03-07T13:44:32-08:00',
  },
  committer: {
    name: 'Ross MacLeod',
    email: 'rmm+github@z.odi.ac',
    timestamp: '2026-03-07T13:46:59-08:00',
  },
  empty: false,
  conflict: false,
  immutable: false,
  workingCopy: true,
  divergent: false,
  parents: [
    {
      commit_id: '1111e484af0843a4db7c6d6b849b1b22044b40cc',
      change_id: 'ytzyotyoxopqnowsxnqqpyysrmmmnrqx',
      parents: ['0000000000000000000000000000000000000000'],
      description: 'phase 1\n',
      author: {
        name: 'Ross MacLeod',
        email: 'rmm+github@z.odi.ac',
        timestamp: '2026-03-07T12:50:29-08:00',
      },
      committer: {
        name: 'Ross MacLeod',
        email: 'rmm+github@z.odi.ac',
        timestamp: '2026-03-07T13:07:23-08:00',
      },
    },
  ],
  localBookmarks: [],
  remoteBookmarks: [],
  tags: [],
});

/**
 * A real jj log revision entry with a bookmark and trailing newline in description.
 * Captured from jj 0.38.0 on 2026-03-07 (synthesised).
 */
const FIXTURE_REVISION_WITH_BOOKMARK = JSON.stringify({
  changeId: 'ytzyotyoxopqnowsxnqqpyysrmmmnrqx',
  commitId: '1111e484af0843a4db7c6d6b849b1b22044b40cc',
  description: 'phase 1\n',
  author: {
    name: 'Ross MacLeod',
    email: 'rmm+github@z.odi.ac',
    timestamp: '2026-03-07T12:50:29-08:00',
  },
  committer: {
    name: 'Ross MacLeod',
    email: 'rmm+github@z.odi.ac',
    timestamp: '2026-03-07T13:07:23-08:00',
  },
  empty: false,
  conflict: false,
  immutable: false,
  workingCopy: false,
  divergent: false,
  parents: [
    {
      commit_id: '0000000000000000000000000000000000000000',
      change_id: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
      parents: [],
      description: '',
      author: { name: '', email: '', timestamp: '1970-01-01T00:00:00Z' },
      committer: { name: '', email: '', timestamp: '1970-01-01T00:00:00Z' },
    },
  ],
  localBookmarks: [{ name: 'main', target: ['1111e484af0843a4db7c6d6b849b1b22044b40cc'] }],
  remoteBookmarks: [
    {
      name: 'main',
      remote: 'origin',
      target: ['1111e484af0843a4db7c6d6b849b1b22044b40cc'],
      tracking_target: ['1111e484af0843a4db7c6d6b849b1b22044b40cc'],
    },
  ],
  tags: [],
});

/**
 * A real jj op log entry, captured from jj 0.38.0 on 2026-03-07.
 */
const FIXTURE_OPERATION = JSON.stringify({
  id: 'db1d3de551092b0bd92280fe209a727f60e8fd1ecbef1ee1e38afc5c0d82f50fb654a6be2f8ba95b5d8567956b58cd9805e3fc98f4ff18134de5a7fbb8c3e3a4',
  description: 'snapshot working copy',
  user: 'ross@Enodia.local',
  time: {
    start: '2026-03-07T13:46:59.746-08:00',
    end: '2026-03-07T13:46:59.758-08:00',
  },
});

/**
 * Real `jj status` output with changes, from jj 0.38.0 on 2026-03-07.
 */
const FIXTURE_STATUS_WITH_CHANGES = [
  'Working copy changes:',
  'A src/core/jj-runner.ts',
  'A src/core/result.ts',
  'M README.md',
  'D old-file.txt',
  'Working copy  (@) : kqxqutop f10fcb59 (no description set)',
  'Parent commit (@-): ytzyotyo 1111e484 phase 1',
  '',
].join('\n');

/**
 * Real `jj status` output with no changes, from jj 0.38.0 on 2026-03-07.
 */
const FIXTURE_STATUS_NO_CHANGES = [
  'The working copy has no changes.',
  'Working copy  (@) : kqxqutop 043a6555 (empty) (no description set)',
  'Parent commit (@-): ytzyotyo 1111e484 phase 1',
  '',
].join('\n');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('JjCliImpl.log', () => {
  let runner: MockJjRunner;
  let cli: JjCliImpl;

  beforeEach(() => {
    runner = new MockJjRunner();
    cli = new JjCliImpl(runner);
  });

  it('parses a working-copy revision correctly', async () => {
    runner.succeed('log', FIXTURE_WORKING_COPY_REVISION + '\n');
    const result = await cli.log();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    const rev = result.value[0]!;
    expect(rev.changeId).toBe('kqxqutopsoptvlrmpmuurzkkpkwuzomw');
    expect(rev.commitId).toBe('f10fcb59fa088cf5d2342efd57ea20c467d3b506');
    expect(rev.description).toBe(''); // empty description
    expect(rev.isWorkingCopy).toBe(true);
    expect(rev.isEmpty).toBe(false);
    expect(rev.isImmutable).toBe(false);
    expect(rev.hasConflict).toBe(false);
    expect(rev.isDivergent).toBe(false);
  });

  it('maps parent change IDs from the parents array', async () => {
    runner.succeed('log', FIXTURE_WORKING_COPY_REVISION + '\n');
    const result = await cli.log();
    if (!result.ok) return;
    const rev = result.value[0]!;
    expect(rev.parentChangeIds).toEqual(['ytzyotyoxopqnowsxnqqpyysrmmmnrqx']);
    expect(rev.parentCommitIds).toEqual(['1111e484af0843a4db7c6d6b849b1b22044b40cc']);
  });

  it('maps author identity with a parsed Date', async () => {
    runner.succeed('log', FIXTURE_WORKING_COPY_REVISION + '\n');
    const result = await cli.log();
    if (!result.ok) return;
    const author = result.value[0]!.author;
    expect(author.name).toBe('Ross MacLeod');
    expect(author.email).toBe('rmm+github@z.odi.ac');
    expect(author.timestamp).toBeInstanceOf(Date);
    expect(author.timestamp.getFullYear()).toBe(2026);
  });

  it('trims trailing newline from description', async () => {
    runner.succeed('log', FIXTURE_REVISION_WITH_BOOKMARK + '\n');
    const result = await cli.log();
    if (!result.ok) return;
    // "phase 1\n" → "phase 1"
    expect(result.value[0]!.description).toBe('phase 1');
  });

  it('maps local bookmarks correctly', async () => {
    runner.succeed('log', FIXTURE_REVISION_WITH_BOOKMARK + '\n');
    const result = await cli.log();
    if (!result.ok) return;
    const rev = result.value[0]!;
    expect(rev.localBookmarks).toHaveLength(1);
    expect(rev.localBookmarks[0]!.name).toBe('main');
    expect(rev.localBookmarks[0]!.targets).toEqual(['1111e484af0843a4db7c6d6b849b1b22044b40cc']);
  });

  it('maps remote bookmarks correctly', async () => {
    runner.succeed('log', FIXTURE_REVISION_WITH_BOOKMARK + '\n');
    const result = await cli.log();
    if (!result.ok) return;
    const rev = result.value[0]!;
    expect(rev.remoteBookmarks).toHaveLength(1);
    expect(rev.remoteBookmarks[0]!.remote).toBe('origin');
    expect(rev.remoteBookmarks[0]!.trackingTargets).toHaveLength(1);
  });

  it('parses multiple revision lines', async () => {
    runner.succeed(
      'log',
      FIXTURE_WORKING_COPY_REVISION + '\n' + FIXTURE_REVISION_WITH_BOOKMARK + '\n',
    );
    const result = await cli.log();
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
    expect(result.value[0]!.isWorkingCopy).toBe(true);
    expect(result.value[1]!.isWorkingCopy).toBe(false);
  });

  it('skips malformed lines and returns partial results', async () => {
    runner.succeed('log', FIXTURE_WORKING_COPY_REVISION + '\nnot valid json\n');
    const result = await cli.log();
    // Graceful degradation: valid line is returned, bad line is skipped
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
  });

  it('passes the revset option as --revisions', async () => {
    runner.succeed('log', '');
    await cli.log({ revset: 'main..@' });
    const args = runner.calls[0]!;
    expect(args).toContain('--revisions');
    expect(args[args.indexOf('--revisions') + 1]).toBe('main..@');
  });

  it('passes the limit option as --limit', async () => {
    runner.succeed('log', '');
    await cli.log({ limit: 25 });
    const args = runner.calls[0]!;
    expect(args).toContain('--limit');
    expect(args[args.indexOf('--limit') + 1]).toBe('25');
  });

  it('propagates runner errors as Err', async () => {
    runner.fail('log', {
      kind: 'non-zero-exit',
      exitCode: 1,
      stdout: '',
      stderr: 'bad revset expression',
      message: 'jj log exited with code 1',
    });
    const result = await cli.log();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('non-zero-exit');
    }
  });

  it('includes --no-graph in log args', async () => {
    runner.succeed('log', '');
    await cli.log();
    expect(runner.calls[0]).toContain('--no-graph');
  });
});

describe('JjCliImpl.opLog', () => {
  let runner: MockJjRunner;
  let cli: JjCliImpl;

  beforeEach(() => {
    runner = new MockJjRunner();
    cli = new JjCliImpl(runner);
  });

  it('parses an operation entry correctly', async () => {
    runner.succeed('op', FIXTURE_OPERATION + '\n');
    const result = await cli.opLog();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    const op = result.value[0]!;
    expect(op.id).toMatch(/^db1d3de/);
    expect(op.description).toBe('snapshot working copy');
    expect(op.user).toBe('ross@Enodia.local');
    expect(op.time.start).toBeInstanceOf(Date);
    expect(op.time.end).toBeInstanceOf(Date);
    expect(op.time.start.getFullYear()).toBe(2026);
  });

  it('passes the limit option', async () => {
    runner.succeed('op', '');
    await cli.opLog({ limit: 100 });
    const args = runner.calls[0]!;
    expect(args).toContain('--limit');
    expect(args[args.indexOf('--limit') + 1]).toBe('100');
  });
});

describe('JjCliImpl.status', () => {
  let runner: MockJjRunner;
  let cli: JjCliImpl;

  beforeEach(() => {
    runner = new MockJjRunner();
    cli = new JjCliImpl(runner);
  });

  it('parses file changes when working copy has changes', async () => {
    runner.succeed('status', FIXTURE_STATUS_WITH_CHANGES);
    const result = await cli.status();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { fileChanges, parentChangeIds, hasConflicts } = result.value;
    expect(fileChanges).toHaveLength(4);
    expect(fileChanges.find((f) => f.path === 'src/core/jj-runner.ts')?.status).toBe('added');
    expect(fileChanges.find((f) => f.path === 'src/core/result.ts')?.status).toBe('added');
    expect(fileChanges.find((f) => f.path === 'README.md')?.status).toBe('modified');
    expect(fileChanges.find((f) => f.path === 'old-file.txt')?.status).toBe('deleted');
    expect(parentChangeIds).toContain('ytzyotyo');
    expect(hasConflicts).toBe(false);
  });

  it('returns empty fileChanges when working copy is clean', async () => {
    runner.succeed('status', FIXTURE_STATUS_NO_CHANGES);
    const result = await cli.status();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fileChanges).toHaveLength(0);
    expect(result.value.parentChangeIds).toContain('ytzyotyo');
  });

  it('detects conflicts in the working copy', async () => {
    const conflictStatus = [
      'Conflicted files:',
      '  src/main.ts',
      'Working copy  (@) : abc123 def456 conflict revision',
      'Parent commit (@-): xyz789 abc123 parent',
      '',
    ].join('\n');
    runner.succeed('status', conflictStatus);
    const result = await cli.status();
    if (!result.ok) return;
    expect(result.value.hasConflicts).toBe(true);
  });
});

describe('JjCliImpl.version', () => {
  let runner: MockJjRunner;
  let cli: JjCliImpl;

  beforeEach(() => {
    runner = new MockJjRunner();
    cli = new JjCliImpl(runner);
  });

  it('parses the jj version from --version output', async () => {
    runner.succeed('--version', 'jj 0.38.0-2508982cde5c7e4db0933e0b6469f9e778e71e28\n');
    const result = await cli.version();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.major).toBe(0);
    expect(result.value.minor).toBe(38);
    expect(result.value.patch).toBe(0);
  });

  it('returns Err for unrecognised version output', async () => {
    runner.succeed('--version', 'not a version string\n');
    const result = await cli.version();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('unknown');
    }
  });
});

describe('JjCliImpl — mutating command argument construction', () => {
  let runner: MockJjRunner;
  let cli: JjCliImpl;

  beforeEach(() => {
    runner = new MockJjRunner();
    cli = new JjCliImpl(runner);
    // Make all commands succeed so we can check args
    for (const cmd of [
      'new',
      'edit',
      'abandon',
      'describe',
      'duplicate',
      'rebase',
      'squash',
      'split',
      'restore',
      'absorb',
      'revert',
      'resolve',
      'bookmark',
      'git',
      'op',
      'undo',
    ]) {
      runner.succeedVoid(cmd);
    }
  });

  it('newRevision — passes description with --message', async () => {
    const options: NewRevisionOptions = { description: 'my commit', revsets: ['@'] };
    await cli.newRevision(options);
    expect(runner.calls[0]).toEqual(['new', '--message', 'my commit', '@']);
  });

  it('newRevision — works with no options', async () => {
    await cli.newRevision();
    expect(runner.calls[0]).toEqual(['new']);
  });

  it('edit — passes the change ID', async () => {
    await cli.edit('abc123');
    expect(runner.calls[0]).toEqual(['edit', 'abc123']);
  });

  it('abandon — passes all change IDs', async () => {
    await cli.abandon(['abc123', 'def456']);
    expect(runner.calls[0]).toEqual(['abandon', 'abc123', 'def456']);
  });

  it('describe — passes changeId and message', async () => {
    const options: DescribeOptions = { changeId: 'abc123', description: 'new description' };
    await cli.describe(options);
    expect(runner.calls[0]).toEqual(['describe', '--message', 'new description', 'abc123']);
  });

  it('describe — defaults to working copy when no changeId', async () => {
    await cli.describe({ description: 'a description' });
    expect(runner.calls[0]).toEqual(['describe', '--message', 'a description']);
  });

  it('rebase -r — uses correct mode flag and destination', async () => {
    const options: RebaseOptions = {
      revset: 'abc123',
      mode: 'revision',
      destination: 'main',
    };
    await cli.rebase(options);
    expect(runner.calls[0]).toEqual(['rebase', '-r', 'abc123', '--destination', 'main']);
  });

  it('rebase -s — uses correct mode flag', async () => {
    const options: RebaseOptions = {
      revset: 'abc123',
      mode: 'source',
      destination: 'main',
    };
    await cli.rebase(options);
    expect(runner.calls[0]).toContain('-s');
  });

  it('rebase -b — uses correct mode flag', async () => {
    const options: RebaseOptions = {
      revset: 'abc123',
      mode: 'branch',
      destination: 'main',
    };
    await cli.rebase(options);
    expect(runner.calls[0]).toContain('-b');
  });

  it('rebase with insert-after placement', async () => {
    const options: RebaseOptions = {
      revset: 'abc123',
      mode: 'revision',
      destination: 'main',
      placement: 'insert-after',
    };
    await cli.rebase(options);
    expect(runner.calls[0]).toContain('--insert-after');
  });

  it('bookmarkCreate — passes name and revset', async () => {
    await cli.bookmarkCreate('feature', 'abc123');
    expect(runner.calls[0]).toEqual(['bookmark', 'create', 'feature', '--revision', 'abc123']);
  });

  it('bookmarkDelete — passes all names', async () => {
    await cli.bookmarkDelete(['feature', 'old-branch']);
    expect(runner.calls[0]).toEqual(['bookmark', 'delete', 'feature', 'old-branch']);
  });

  it('bookmarkTrack — uses name@remote format', async () => {
    await cli.bookmarkTrack('main', 'origin');
    expect(runner.calls[0]).toEqual(['bookmark', 'track', 'main@origin']);
  });

  it('gitPush — passes remote and --all', async () => {
    await cli.gitPush({ remote: 'origin', allBookmarks: true });
    const args = runner.calls[0]!;
    expect(args).toContain('--remote');
    expect(args[args.indexOf('--remote') + 1]).toBe('origin');
    expect(args).toContain('--all');
  });

  it('gitFetch — passes remote', async () => {
    await cli.gitFetch({ remote: 'upstream' });
    const args = runner.calls[0]!;
    expect(args).toContain('--remote');
    expect(args[args.indexOf('--remote') + 1]).toBe('upstream');
  });

  it('opRestore — passes the operation ID', async () => {
    await cli.opRestore('abc123deadbeef');
    expect(runner.calls[0]).toEqual(['op', 'restore', 'abc123deadbeef']);
  });

  it('opUndo — calls jj undo', async () => {
    await cli.opUndo();
    expect(runner.calls[0]).toEqual(['undo']);
  });

  it('absorb — calls jj absorb', async () => {
    await cli.absorb();
    expect(runner.calls[0]).toEqual(['absorb']);
  });

  it('fileShow — passes revset and path with double-dash separator', async () => {
    runner.succeed('file', 'file contents\n');
    const result = await cli.fileShow('src/main.ts', '@-');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('file contents\n');
    expect(runner.calls[0]).toEqual(['file', 'show', '-r', '@-', '--', 'src/main.ts']);
  });

  it('fileShow — returns error result for non-existent file at revision', async () => {
    runner.fail('file', {
      kind: 'non-zero-exit',
      message: 'No such path',
      exitCode: 1,
      stdout: '',
      stderr: '',
    });
    const result = await cli.fileShow('new-file.ts', '@-');
    expect(result.ok).toBe(false);
  });
});

describe('JjCliImpl — error propagation', () => {
  it('propagates not-found error from runner', async () => {
    const runner = new MockJjRunner();
    const cli = new JjCliImpl(runner);
    runner.fail('log', { kind: 'not-found', message: 'binary not found' });
    const result = await cli.log();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not-found');
    }
  });

  it('propagates timeout error from runner', async () => {
    const runner = new MockJjRunner();
    const cli = new JjCliImpl(runner);
    runner.fail('log', { kind: 'timeout', message: 'timed out', timeoutMs: 5000 });
    const result = await cli.log();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('timeout');
    }
  });

  it('propagates cancelled error from runner', async () => {
    const runner = new MockJjRunner();
    const cli = new JjCliImpl(runner);
    runner.fail('--version', { kind: 'cancelled', message: 'cancelled' });
    const result = await cli.version();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('cancelled');
    }
  });
});
