/**
 * Tests for the `jj log` JSON deserializer.
 *
 * Fixture data: test/unit/fixtures/log.fixture.ndjson
 * Captured from: jj 0.38.0 on 2026-03-07
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  parseRevisions,
  rawRevisionToRevision,
  rawIdentityToIdentity,
  REVISION_TEMPLATE,
  type RawRevision,
  type RawIdentity,
} from '../../../src/core/deserializers/log';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FIXTURE_PATH = resolve(__dirname, '../fixtures/log.fixture.ndjson');
const FIXTURE_NDJSON = readFileSync(FIXTURE_PATH, 'utf-8');

/** Parse the fixture file into individual raw JSON objects (for direct testing). */
function loadFixtureLines(): string[] {
  return FIXTURE_NDJSON.split('\n').filter((l) => l.trim() !== '');
}

// ─── rawIdentityToIdentity ────────────────────────────────────────────────────

describe('rawIdentityToIdentity', () => {
  it('converts a raw identity with a valid timestamp', () => {
    const raw: RawIdentity = {
      name: 'Alice',
      email: 'alice@example.com',
      timestamp: '2026-03-07T12:50:29-08:00',
    };
    const identity = rawIdentityToIdentity(raw);
    expect(identity.name).toBe('Alice');
    expect(identity.email).toBe('alice@example.com');
    expect(identity.timestamp).toBeInstanceOf(Date);
    expect(identity.timestamp.getFullYear()).toBe(2026);
    expect(identity.timestamp.getMonth()).toBe(2); // 0-indexed: March = 2
    expect(identity.timestamp.getDate()).toBe(7);
  });

  it('handles the empty identity (root commit sentinel)', () => {
    const raw: RawIdentity = { name: '', email: '', timestamp: '1970-01-01T00:00:00Z' };
    const identity = rawIdentityToIdentity(raw);
    expect(identity.name).toBe('');
    expect(identity.email).toBe('');
    expect(identity.timestamp.getTime()).toBe(0);
  });
});

// ─── rawRevisionToRevision ─────────────────────────────────────────────────────

describe('rawRevisionToRevision', () => {
  it('maps all fields of a working-copy revision correctly', () => {
    const raw = JSON.parse(loadFixtureLines()[0]!) as RawRevision;
    const revision = rawRevisionToRevision(raw);

    expect(revision.changeId).toBe('kqxqutopsoptvlrmpmuurzkkpkwuzomw');
    expect(revision.commitId).toBe('a68175449fd1c7762ae03df7a93d84ee88d1d8bd');
    expect(revision.description).toBe(''); // empty string, not '\n'
    expect(revision.isWorkingCopy).toBe(true);
    expect(revision.isEmpty).toBe(false);
    expect(revision.isImmutable).toBe(false);
    expect(revision.hasConflict).toBe(false);
    expect(revision.isDivergent).toBe(false);
    expect(revision.author.name).toBe('Ross MacLeod');
    expect(revision.author.email).toBe('rmm+github@z.odi.ac');
    expect(revision.author.timestamp).toBeInstanceOf(Date);
    expect(revision.committer.timestamp).toBeInstanceOf(Date);
  });

  it('extracts parent change IDs and commit IDs', () => {
    const raw = JSON.parse(loadFixtureLines()[0]!) as RawRevision;
    const revision = rawRevisionToRevision(raw);

    expect(revision.parentChangeIds).toEqual(['ytzyotyoxopqnowsxnqqpyysrmmmnrqx']);
    expect(revision.parentCommitIds).toEqual(['1111e484af0843a4db7c6d6b849b1b22044b40cc']);
  });

  it('trims trailing newline from description', () => {
    const raw = JSON.parse(loadFixtureLines()[1]!) as RawRevision;
    expect(raw.description).toBe('phase 1\n'); // raw has trailing newline
    const revision = rawRevisionToRevision(raw);
    expect(revision.description).toBe('phase 1'); // trimmed
  });

  it('maps empty bookmarks and tags arrays', () => {
    const raw = JSON.parse(loadFixtureLines()[0]!) as RawRevision;
    const revision = rawRevisionToRevision(raw);
    expect(revision.localBookmarks).toHaveLength(0);
    expect(revision.remoteBookmarks).toHaveLength(0);
    expect(revision.tags).toHaveLength(0);
  });

  it('maps local bookmarks to domain type with renamed field (target → targets)', () => {
    const rawWithBookmark: RawRevision = {
      ...(JSON.parse(loadFixtureLines()[0]!) as RawRevision),
      localBookmarks: [{ name: 'main', target: ['abc123def456'] }],
    };
    const revision = rawRevisionToRevision(rawWithBookmark);
    expect(revision.localBookmarks[0]?.name).toBe('main');
    expect(revision.localBookmarks[0]?.targets).toEqual(['abc123def456']);
  });

  it('maps remote bookmarks with tracking_target → trackingTargets rename', () => {
    const rawWithRemote: RawRevision = {
      ...(JSON.parse(loadFixtureLines()[0]!) as RawRevision),
      remoteBookmarks: [
        {
          name: 'main',
          remote: 'origin',
          target: ['abc123'],
          tracking_target: ['abc123'],
        },
      ],
    };
    const revision = rawRevisionToRevision(rawWithRemote);
    expect(revision.remoteBookmarks[0]?.remote).toBe('origin');
    expect(revision.remoteBookmarks[0]?.trackingTargets).toEqual(['abc123']);
  });

  it('maps tags correctly', () => {
    const rawWithTag: RawRevision = {
      ...(JSON.parse(loadFixtureLines()[0]!) as RawRevision),
      tags: [{ name: 'v1.0', target: ['commitabc'] }],
    };
    const revision = rawRevisionToRevision(rawWithTag);
    expect(revision.tags[0]?.name).toBe('v1.0');
    expect(revision.tags[0]?.targets).toEqual(['commitabc']);
  });

  it('handles the root commit sentinel (empty parent with all-zero commit ID)', () => {
    const raw = JSON.parse(loadFixtureLines()[1]!) as RawRevision;
    const revision = rawRevisionToRevision(raw);
    // Parent of the second revision is the root commit
    expect(revision.parentCommitIds[0]).toBe('0000000000000000000000000000000000000000');
  });
});

// ─── parseRevisions ───────────────────────────────────────────────────────────

describe('parseRevisions', () => {
  it('parses two revisions from the fixture file', () => {
    const revisions = parseRevisions(FIXTURE_NDJSON);
    expect(revisions).toHaveLength(2);
  });

  it('first revision is the working copy', () => {
    const revisions = parseRevisions(FIXTURE_NDJSON);
    expect(revisions[0]!.isWorkingCopy).toBe(true);
  });

  it('second revision is not the working copy', () => {
    const revisions = parseRevisions(FIXTURE_NDJSON);
    expect(revisions[1]!.isWorkingCopy).toBe(false);
  });

  it('returns empty array for empty input', () => {
    expect(parseRevisions('')).toHaveLength(0);
    expect(parseRevisions('\n\n')).toHaveLength(0);
  });

  it('skips malformed JSON lines (graceful degradation)', () => {
    const withGarbage = FIXTURE_NDJSON + '\nnot valid json\n';
    const revisions = parseRevisions(withGarbage);
    expect(revisions).toHaveLength(2); // only the 2 valid lines
  });

  it('skips lines with valid JSON but wrong schema shape (graceful degradation)', () => {
    const withBadSchema = FIXTURE_NDJSON + '\n{"changeId":123,"commitId":true}\n';
    const revisions = parseRevisions(withBadSchema);
    expect(revisions).toHaveLength(2); // schema validation rejects the malformed entry
  });

  it('matches snapshot', () => {
    const revisions = parseRevisions(FIXTURE_NDJSON);
    // Snapshot ensures we detect any unintended changes to the deserializer output.
    // If jj output format changes, re-capture the fixture and update this snapshot.
    expect(revisions).toMatchSnapshot();
  });
});

// ─── REVISION_TEMPLATE ────────────────────────────────────────────────────────

describe('REVISION_TEMPLATE', () => {
  it('is a non-empty string', () => {
    expect(typeof REVISION_TEMPLATE).toBe('string');
    expect(REVISION_TEMPLATE.length).toBeGreaterThan(0);
  });

  it('contains json() calls for key fields', () => {
    expect(REVISION_TEMPLATE).toContain('json(change_id)');
    expect(REVISION_TEMPLATE).toContain('json(commit_id)');
    expect(REVISION_TEMPLATE).toContain('json(author)');
    expect(REVISION_TEMPLATE).toContain('json(parents)');
    expect(REVISION_TEMPLATE).toContain('json(local_bookmarks)');
  });

  it('uses ++ concatenation to build JSON', () => {
    expect(REVISION_TEMPLATE).toContain('++');
  });

  it('ends with a newline template expression', () => {
    expect(REVISION_TEMPLATE.endsWith('"\\n"')).toBe(true);
  });
});
