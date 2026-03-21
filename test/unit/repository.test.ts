import { describe, it, expect, vi } from 'vitest';
import { RepositoryState, type RepositoryStateConfig } from '../../src/core/repository';
import { type JjCli } from '../../src/core/jj-cli';
import { ok, err } from '../../src/core/result';
import { type Revision, type WorkingCopyStatus } from '../../src/core/types';
import { type JjError } from '../../src/core/jj-runner';

// ── Test helpers ───────────────────────────────────────────────────────────────

const defaultConfig: RepositoryStateConfig = {
  revset: '',
  logLimit: 50,
  oplogLimit: 50,
  refreshDebounceMs: 0, // no debounce in tests
};

function makeRevision(changeId: string): Revision {
  return {
    changeId,
    commitId: changeId + '-commit',
    description: 'test',
    isWorkingCopy: false,
    isEmpty: false,
    isImmutable: false,
    hasConflict: false,
    isDivergent: false,
    parentChangeIds: [],
    parentCommitIds: [],
    author: { name: 'Test', email: 'test@test.com', timestamp: new Date() },
    committer: { name: 'Test', email: 'test@test.com', timestamp: new Date() },
    localBookmarks: [],
    remoteBookmarks: [],
    tags: [],
  };
}

function makeStatus(): WorkingCopyStatus {
  return {
    parentChangeIds: [],
    fileChanges: [],
    hasConflicts: false,
  };
}

function makeCli(overrides: Partial<JjCli> = {}): JjCli {
  return {
    log: vi.fn().mockResolvedValue(ok([makeRevision('abc')])),
    status: vi.fn().mockResolvedValue(ok(makeStatus())),
    show: vi.fn(),
    diff: vi.fn(),
    bookmarkList: vi.fn(),
    opLog: vi.fn().mockResolvedValue(ok([])),
    evolog: vi.fn(),
    configGet: vi.fn(),
    version: vi.fn(),
    newRevision: vi.fn(),
    describe: vi.fn(),
    edit: vi.fn(),
    abandon: vi.fn(),
    restore: vi.fn(),
    duplicate: vi.fn(),
    squash: vi.fn(),
    split: vi.fn(),
    revert: vi.fn(),
    absorb: vi.fn(),
    rebase: vi.fn(),
    resolve: vi.fn(),
    opUndo: vi.fn(),
    opRestore: vi.fn(),
    bookmarkCreate: vi.fn(),
    bookmarkMove: vi.fn(),
    bookmarkDelete: vi.fn(),
    bookmarkForget: vi.fn(),
    bookmarkTrack: vi.fn(),
    bookmarkUntrack: vi.fn(),
    gitPush: vi.fn(),
    gitFetch: vi.fn(),
    ...overrides,
  } as unknown as JjCli;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('RepositoryState', () => {
  describe('initial state', () => {
    it('has empty revisions and undefined status before first refresh', () => {
      const state = new RepositoryState('/repo', 'native', makeCli(), defaultConfig);
      expect(state.revisions).toEqual([]);
      expect(state.workingCopyStatus).toBeUndefined();
      expect(state.isRefreshing).toBe(false);
      expect(state.lastError).toBeUndefined();
      state.dispose();
    });
  });

  describe('refresh()', () => {
    it('populates revisions and status after successful refresh', async () => {
      const cli = makeCli();
      const state = new RepositoryState('/repo', 'native', cli, defaultConfig);

      await state.refresh();

      expect(state.revisions).toHaveLength(1);
      expect(state.revisions[0]?.changeId).toBe('abc');
      expect(state.workingCopyStatus?.hasConflicts).toBe(false);
      state.dispose();
    });

    it('fires "refreshing" then "changed" events', async () => {
      const cli = makeCli();
      const state = new RepositoryState('/repo', 'native', cli, defaultConfig);
      const events: string[] = [];

      state.onDidChange((e) => events.push(e.kind));

      await state.refresh();

      expect(events).toEqual(['refreshing', 'changed']);
      state.dispose();
    });

    it('retains previous state and fires error on refresh failure', async () => {
      const jjError: JjError = { kind: 'not-found', message: 'jj not found' };
      const cli = makeCli({
        log: vi.fn().mockResolvedValue(err(jjError)),
        status: vi.fn().mockResolvedValue(ok(makeStatus())),
      });
      const state = new RepositoryState('/repo', 'native', cli, defaultConfig);
      const events: string[] = [];

      state.onDidChange((e) => events.push(e.kind));

      await state.refresh();

      expect(state.revisions).toEqual([]); // never populated
      expect(state.lastError).toBe('jj not found');
      expect(events).toContain('error');
      state.dispose();
    });

    it('does not double-refresh: schedules follow-up if already refreshing', async () => {
      let resolveFirst!: () => void;
      const firstLogPromise = new Promise<void>((res) => {
        resolveFirst = res;
      });

      const cli = makeCli({
        log: vi
          .fn()
          .mockImplementationOnce(
            () =>
              new Promise((res) => firstLogPromise.then(() => res(ok([makeRevision('first')])))),
          )
          .mockResolvedValue(ok([makeRevision('second')])),
        status: vi.fn().mockResolvedValue(ok(makeStatus())),
      });

      const state = new RepositoryState('/repo', 'native', cli, defaultConfig);

      const firstRefresh = state.refresh(); // starts async
      const secondRefresh = state.refresh(); // should schedule follow-up

      resolveFirst();
      await firstRefresh;
      await secondRefresh;

      // The follow-up refresh should have run, giving us 'second'
      expect((cli.log as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
      state.dispose();
    });

    it('passes revset and limit from config', async () => {
      const config: RepositoryStateConfig = {
        revset: 'trunk()..@',
        logLimit: 10,
        oplogLimit: 50,
        refreshDebounceMs: 0,
      };
      const cli = makeCli();
      const state = new RepositoryState('/repo', 'native', cli, config);

      await state.refresh();

      const logCall = (cli.log as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(logCall).toMatchObject({ revset: 'trunk()..@', limit: 10 });
      state.dispose();
    });

    it('does not pass revset key when config.revset is empty', async () => {
      const cli = makeCli();
      const state = new RepositoryState('/repo', 'native', cli, defaultConfig);

      await state.refresh();

      const logCall = (cli.log as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      // revset key should not be present when empty string
      expect(logCall).not.toHaveProperty('revset');
      state.dispose();
    });
  });

  describe('scheduleRefresh()', () => {
    it('debounces rapid requests using refreshDebounceMs', async () => {
      const config: RepositoryStateConfig = { ...defaultConfig, refreshDebounceMs: 50 };
      const cli = makeCli();
      const state = new RepositoryState('/repo', 'native', cli, config);

      state.scheduleRefresh();
      state.scheduleRefresh();
      state.scheduleRefresh();

      // Wait for debounce to expire + async refresh to complete
      await new Promise((res) => setTimeout(res, 100));

      // Only one log call despite three scheduleRefresh() calls
      expect((cli.log as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
      state.dispose();
    });
  });

  describe('dispose()', () => {
    it('clears pending debounce timer on dispose', () => {
      const config: RepositoryStateConfig = { ...defaultConfig, refreshDebounceMs: 5000 };
      const cli = makeCli();
      const state = new RepositoryState('/repo', 'native', cli, config);

      state.scheduleRefresh();
      state.dispose(); // should not throw, timer should be cleared

      // No log call should have been made
      expect((cli.log as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    });

    it('can be disposed without errors even if never refreshed', () => {
      const state = new RepositoryState('/repo', 'native', makeCli(), defaultConfig);
      expect(() => state.dispose()).not.toThrow();
    });
  });
});
