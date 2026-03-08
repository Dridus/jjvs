import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import {
  RepositoryManager,
  discoverJjRoots,
  detectRepoKind,
  type RepositoryManagerConfig,
  type JjCliFactory,
} from '../../src/core/repository-manager';
import { type JjCli } from '../../src/core/jj-cli';
import { ok } from '../../src/core/result';
import { type Revision, type WorkingCopyStatus } from '../../src/core/types';

vi.mock('fs');

// ── Test helpers ───────────────────────────────────────────────────────────────

const defaultConfig: RepositoryManagerConfig = {
  revset: '',
  logLimit: 50,
  oplogLimit: 50,
  refreshDebounceMs: 0,
};

function makeRevision(): Revision {
  return {
    changeId: 'abc',
    commitId: 'abc-commit',
    description: '',
    isWorkingCopy: true,
    isEmpty: false,
    isImmutable: false,
    hasConflict: false,
    isDivergent: false,
    parentChangeIds: [],
    parentCommitIds: [],
    author: { name: 'A', email: 'a@a.com', timestamp: new Date() },
    committer: { name: 'A', email: 'a@a.com', timestamp: new Date() },
    localBookmarks: [],
    remoteBookmarks: [],
    tags: [],
  };
}

function makeStatus(): WorkingCopyStatus {
  return { parentChangeIds: [], fileChanges: [], hasConflicts: false };
}

function makeCli(): JjCli {
  return {
    log: vi.fn().mockResolvedValue(ok([makeRevision()])),
    status: vi.fn().mockResolvedValue(ok(makeStatus())),
    opLog: vi.fn().mockResolvedValue(ok([])),
  } as unknown as JjCli;
}

function makeCliFactory(): JjCliFactory {
  return vi.fn().mockImplementation(() => makeCli());
}

// ── discoverJjRoots ────────────────────────────────────────────────────────────

describe('discoverJjRoots', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  it('returns empty array when no .jj directories found', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(discoverJjRoots(['/a', '/b'])).toEqual([]);
  });

  it('returns paths that contain .jj', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).endsWith('.jj') ? true : false,
    );
    expect(discoverJjRoots(['/repo', '/other'])).toEqual(['/repo', '/other']);
  });

  it('filters out paths without .jj', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === '/repo/.jj');
    expect(discoverJjRoots(['/repo', '/other'])).toEqual(['/repo']);
  });
});

// ── detectRepoKind ─────────────────────────────────────────────────────────────

describe('detectRepoKind', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  it('returns "native" when only .jj exists', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('.jj'));
    expect(detectRepoKind('/repo')).toBe('native');
  });

  it('returns "colocated" when both .jj and .git exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(detectRepoKind('/repo')).toBe('colocated');
  });

  it('returns "colocated" when only .git exists (no .jj — unusual but detection is purely .git-presence-based)', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('.git'));
    expect(detectRepoKind('/repo')).toBe('colocated');
  });
});

// ── RepositoryManager ──────────────────────────────────────────────────────────

describe('RepositoryManager', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  it('starts with no repositories', () => {
    const manager = new RepositoryManager(makeCliFactory(), defaultConfig);
    expect(manager.repositories).toHaveLength(0);
    manager.dispose();
  });

  it('discovers jj repos in workspace paths', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('.jj'));
    const manager = new RepositoryManager(makeCliFactory(), defaultConfig);

    await manager.updateWorkspacePaths(['/repo1', '/repo2']);

    expect(manager.repositories).toHaveLength(2);
    manager.dispose();
  });

  it('ignores paths that are not jj repos', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === '/repo1/.jj');
    const manager = new RepositoryManager(makeCliFactory(), defaultConfig);

    await manager.updateWorkspacePaths(['/repo1', '/not-a-repo']);

    expect(manager.repositories).toHaveLength(1);
    expect(manager.repositories[0]?.rootPath).toBe('/repo1');
    manager.dispose();
  });

  it('fires onDidChangeRepositories when repos are added', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('.jj'));
    const manager = new RepositoryManager(makeCliFactory(), defaultConfig);
    const fired: number[] = [];
    manager.onDidChangeRepositories(() => fired.push(1));

    await manager.updateWorkspacePaths(['/repo']);

    expect(fired).toHaveLength(1);
    manager.dispose();
  });

  it('removes and disposes repos when workspace paths update', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('.jj'));
    const manager = new RepositoryManager(makeCliFactory(), defaultConfig);

    await manager.updateWorkspacePaths(['/repo1', '/repo2']);
    expect(manager.repositories).toHaveLength(2);

    await manager.updateWorkspacePaths(['/repo1']);
    expect(manager.repositories).toHaveLength(1);
    expect(manager.repositories[0]?.rootPath).toBe('/repo1');
    manager.dispose();
  });

  it('does not duplicate repos on repeated updateWorkspacePaths with same paths', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('.jj'));
    const manager = new RepositoryManager(makeCliFactory(), defaultConfig);

    await manager.updateWorkspacePaths(['/repo']);
    await manager.updateWorkspacePaths(['/repo']);

    expect(manager.repositories).toHaveLength(1);
    manager.dispose();
  });

  describe('getRepositoryForPath()', () => {
    it('returns the repository whose root contains the given path', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('.jj'));
      const manager = new RepositoryManager(makeCliFactory(), defaultConfig);

      await manager.updateWorkspacePaths(['/repo']);
      const result = manager.getRepositoryForPath('/repo/src/foo.ts');

      expect(result?.rootPath).toBe('/repo');
      manager.dispose();
    });

    it('returns undefined for a path outside all repos', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === '/repo/.jj');
      const manager = new RepositoryManager(makeCliFactory(), defaultConfig);

      await manager.updateWorkspacePaths(['/repo']);
      const result = manager.getRepositoryForPath('/other/file.ts');

      expect(result).toBeUndefined();
      manager.dispose();
    });

    it('returns the deepest match for nested repos', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('.jj'));
      const manager = new RepositoryManager(makeCliFactory(), defaultConfig);

      await manager.updateWorkspacePaths(['/repo', '/repo/sub']);
      const result = manager.getRepositoryForPath('/repo/sub/src/foo.ts');

      expect(result?.rootPath).toBe('/repo/sub');
      manager.dispose();
    });

    it('returns the repo when given its exact root path', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('.jj'));
      const manager = new RepositoryManager(makeCliFactory(), defaultConfig);

      await manager.updateWorkspacePaths(['/repo']);
      const result = manager.getRepositoryForPath('/repo');

      expect(result?.rootPath).toBe('/repo');
      manager.dispose();
    });
  });

  describe('dispose()', () => {
    it('disposes all repos on manager dispose', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('.jj'));
      const manager = new RepositoryManager(makeCliFactory(), defaultConfig);

      await manager.updateWorkspacePaths(['/repo1', '/repo2']);
      expect(() => manager.dispose()).not.toThrow();
    });
  });
});
