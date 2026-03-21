/**
 * Tests for src/core/deserializers/bookmark.ts
 *
 * The bookmark deserializer uses a log-based approach: bookmarks are extracted
 * from Revision objects returned by `jj log`.
 */

import { describe, it, expect } from 'vitest';
import {
  extractBookmarksFromRevisions,
  extractLocalBookmarkNames,
} from '../../../src/core/deserializers/bookmark';
import type { Revision, LocalBookmark, RemoteBookmark } from '../../../src/core/types';

// ── Test helpers ───────────────────────────────────────────────────────────────

function makeRevision(
  changeId: string,
  localBookmarks: readonly LocalBookmark[] = [],
  remoteBookmarks: readonly RemoteBookmark[] = [],
): Revision {
  return {
    changeId,
    commitId: changeId + '-commit',
    description: '',
    isWorkingCopy: false,
    isEmpty: false,
    isImmutable: false,
    hasConflict: false,
    isDivergent: false,
    parentChangeIds: [],
    parentCommitIds: [],
    author: { name: 'A', email: 'a@a.com', timestamp: new Date('2026-01-01') },
    committer: { name: 'A', email: 'a@a.com', timestamp: new Date('2026-01-01') },
    localBookmarks,
    remoteBookmarks,
    tags: [],
  };
}

function makeLocalBookmark(name: string): LocalBookmark {
  return { name, targets: [name + '-commit'] };
}

function makeRemoteBookmark(name: string, remote: string): RemoteBookmark {
  return { name, remote, targets: [name + '-commit'], trackingTargets: [name + '-commit'] };
}

// ── extractBookmarksFromRevisions ─────────────────────────────────────────────

describe('extractBookmarksFromRevisions', () => {
  it('returns empty arrays for revisions with no bookmarks', () => {
    const revisions = [makeRevision('abc'), makeRevision('def')];
    const result = extractBookmarksFromRevisions(revisions);
    expect(result.localBookmarks).toEqual([]);
    expect(result.remoteBookmarks).toEqual([]);
  });

  it('collects local bookmarks from a single revision', () => {
    const revisions = [makeRevision('abc', [makeLocalBookmark('main')])];
    const result = extractBookmarksFromRevisions(revisions);
    expect(result.localBookmarks).toHaveLength(1);
    expect(result.localBookmarks[0]?.name).toBe('main');
  });

  it('collects remote bookmarks from a single revision', () => {
    const revisions = [makeRevision('abc', [], [makeRemoteBookmark('main', 'origin')])];
    const result = extractBookmarksFromRevisions(revisions);
    expect(result.remoteBookmarks).toHaveLength(1);
    expect(result.remoteBookmarks[0]?.name).toBe('main');
    expect(result.remoteBookmarks[0]?.remote).toBe('origin');
  });

  it('collects bookmarks across multiple revisions', () => {
    const revisions = [
      makeRevision(
        'abc',
        [makeLocalBookmark('feature')],
        [makeRemoteBookmark('feature', 'origin')],
      ),
      makeRevision('def', [makeLocalBookmark('main')], []),
    ];
    const result = extractBookmarksFromRevisions(revisions);
    expect(result.localBookmarks).toHaveLength(2);
    expect(result.remoteBookmarks).toHaveLength(1);
    expect(result.localBookmarks.map((b) => b.name)).toEqual(['feature', 'main']);
  });

  it('returns empty arrays for empty input', () => {
    const result = extractBookmarksFromRevisions([]);
    expect(result.localBookmarks).toEqual([]);
    expect(result.remoteBookmarks).toEqual([]);
  });

  it('does not deduplicate bookmarks — caller is responsible', () => {
    // Two revisions with the same bookmark name (divergent scenario)
    const revisions = [
      makeRevision('abc', [makeLocalBookmark('main')]),
      makeRevision('def', [makeLocalBookmark('main')]),
    ];
    const result = extractBookmarksFromRevisions(revisions);
    // Both entries are returned unchanged
    expect(result.localBookmarks).toHaveLength(2);
  });

  it('handles revisions with multiple bookmarks each', () => {
    const revisions = [
      makeRevision(
        'abc',
        [makeLocalBookmark('feat-a'), makeLocalBookmark('feat-b')],
        [makeRemoteBookmark('feat-a', 'origin'), makeRemoteBookmark('feat-a', 'upstream')],
      ),
    ];
    const result = extractBookmarksFromRevisions(revisions);
    expect(result.localBookmarks).toHaveLength(2);
    expect(result.remoteBookmarks).toHaveLength(2);
  });
});

// ── extractBookmarksFromRevisions — snapshots ─────────────────────────────────

describe('extractBookmarksFromRevisions snapshots', () => {
  it('single revision with local and remote bookmarks matches snapshot', () => {
    const revisions = [
      makeRevision(
        'abc',
        [makeLocalBookmark('main'), makeLocalBookmark('feature')],
        [makeRemoteBookmark('main', 'origin'), makeRemoteBookmark('feature', 'upstream')],
      ),
    ];
    expect(extractBookmarksFromRevisions(revisions)).toMatchSnapshot();
  });
});

// ── extractLocalBookmarkNames ─────────────────────────────────────────────────

describe('extractLocalBookmarkNames', () => {
  it('returns empty array when no revisions have bookmarks', () => {
    expect(extractLocalBookmarkNames([makeRevision('abc')])).toEqual([]);
  });

  it('returns bookmark names across all revisions', () => {
    const revisions = [
      makeRevision('abc', [makeLocalBookmark('main'), makeLocalBookmark('release')]),
      makeRevision('def', [makeLocalBookmark('feature')]),
    ];
    expect(extractLocalBookmarkNames(revisions)).toEqual(['main', 'release', 'feature']);
  });

  it('returns empty array for empty input', () => {
    expect(extractLocalBookmarkNames([])).toEqual([]);
  });

  it('includes only local bookmark names, not remote bookmark names', () => {
    const revisions = [
      makeRevision('abc', [makeLocalBookmark('main')], [makeRemoteBookmark('main', 'origin')]),
    ];
    const names = extractLocalBookmarkNames(revisions);
    // Remote bookmarks are not included in the name list
    expect(names).toEqual(['main']);
    expect(names).toHaveLength(1);
  });
});
