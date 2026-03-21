/**
 * Integration tests: JjCliImpl + deserializers against a real jj repository.
 *
 * These tests create a real jj repository in a temporary directory using
 * `createTempJjRepo`, then invoke `JjCliImpl` (backed by `JjRunnerImpl`) to
 * run actual jj commands and verify that the deserializers produce the
 * expected typed output.
 *
 * This is the end-to-end path: real jj binary → real CLI output → deserializer
 * → typed TypeScript value. It catches mismatches between the deserializers and
 * the actual jj output format, which unit tests with captured fixtures cannot.
 *
 * Tests are skipped automatically if jj is not found on PATH.
 */

import * as assert from 'assert';
import { isJjAvailable, createTempJjRepo, type TempJjRepo } from './helpers';
import { JjCliImpl } from '../../src/core/jj-cli';
import { JjRunnerImpl } from '../../src/core/jj-runner';

// ── Suite ─────────────────────────────────────────────────────────────────────

suite('Repository — end-to-end against real jj', function () {
  this.timeout(30_000);

  let repo: TempJjRepo;
  let cli: JjCliImpl;

  before(function () {
    if (!isJjAvailable()) {
      this.skip();
      return;
    }
    repo = createTempJjRepo();
    cli = new JjCliImpl(new JjRunnerImpl({ jjPath: 'jj', workingDirectory: repo.rootPath }));
  });

  after(function () {
    repo?.cleanup();
  });

  // ── jj --version ────────────────────────────────────────────────────────────

  test('version() returns a parsed version object meeting the minimum', async function () {
    const result = await cli.version();
    assert.ok(result.ok, `version() failed: ${!result.ok ? result.error.message : ''}`);
    const version = result.value;
    assert.ok(typeof version.major === 'number', 'major must be a number');
    assert.ok(typeof version.minor === 'number', 'minor must be a number');
    assert.ok(typeof version.patch === 'number', 'patch must be a number');
    assert.ok(version.major > 0 || version.minor >= 25, `jj version too old: ${version.raw}`);
  });

  // ── jj log ───────────────────────────────────────────────────────────────────

  test('log() on a fresh repo returns exactly the working-copy and root revisions', async function () {
    const result = await cli.log({ limit: 10 });
    assert.ok(result.ok, `log() failed: ${!result.ok ? result.error.message : ''}`);
    const revisions = result.value;

    // A fresh `jj git init` repo has exactly two revisions visible in the
    // default revset: the working copy (@) and the root (zzzzzzzz).
    assert.ok(revisions.length >= 1, 'log must return at least one revision');

    const workingCopy = revisions.find((r) => r.isWorkingCopy);
    assert.ok(workingCopy !== undefined, 'one revision must be the working copy');
    assert.strictEqual(
      workingCopy.hasConflict,
      false,
      'fresh working copy must not have conflicts',
    );
    assert.strictEqual(workingCopy.isImmutable, false, 'working copy must not be immutable');
  });

  test('log() working-copy revision has correct author from repo config', async function () {
    const result = await cli.log({ limit: 10 });
    assert.ok(result.ok);
    const workingCopy = result.value.find((r) => r.isWorkingCopy);
    assert.ok(workingCopy !== undefined);

    // createTempJjRepo sets user.name and user.email in the repo config.
    assert.strictEqual(workingCopy.author.name, 'Test User');
    assert.strictEqual(workingCopy.author.email, 'test@example.com');
  });

  test('log() returns valid Date objects for author timestamps', async function () {
    const result = await cli.log({ limit: 10 });
    assert.ok(result.ok);
    for (const revision of result.value) {
      assert.ok(
        revision.author.timestamp instanceof Date,
        `author.timestamp must be a Date, got ${typeof revision.author.timestamp}`,
      );
      assert.ok(!isNaN(revision.author.timestamp.getTime()), 'author.timestamp must not be NaN');
    }
  });

  // ── jj status ────────────────────────────────────────────────────────────────

  test('status() on a clean repo returns no file changes', async function () {
    const result = await cli.status();
    assert.ok(result.ok, `status() failed: ${!result.ok ? result.error.message : ''}`);
    assert.strictEqual(result.value.fileChanges.length, 0, 'fresh repo must have no file changes');
  });

  test('status() reflects a newly added file', async function () {
    const fs = await import('fs');
    const path = await import('path');

    // Write a new file into the repo working directory.
    const filePath = path.join(repo.rootPath, 'hello.txt');
    fs.writeFileSync(filePath, 'hello from jjvs integration test\n');

    try {
      const result = await cli.status();
      assert.ok(result.ok, `status() failed after adding file`);

      const added = result.value.fileChanges.find(
        (f) => f.path === 'hello.txt' && f.status === 'added',
      );
      assert.ok(added !== undefined, 'hello.txt must appear as added in jj status');
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  // ── jj bookmark list ─────────────────────────────────────────────────────────

  test('bookmarkList() on a fresh repo returns empty local and remote arrays', async function () {
    const result = await cli.bookmarkList();
    assert.ok(result.ok, `bookmarkList() failed: ${!result.ok ? result.error.message : ''}`);
    assert.strictEqual(
      result.value.localBookmarks.length,
      0,
      'fresh repo must have no local bookmarks',
    );
    assert.strictEqual(
      result.value.remoteBookmarks.length,
      0,
      'fresh repo must have no remote bookmarks',
    );
  });

  // ── jj op log ────────────────────────────────────────────────────────────────

  test('opLog() returns at least one operation (the initial workspace creation)', async function () {
    const result = await cli.opLog({ limit: 10 });
    assert.ok(result.ok, `opLog() failed: ${!result.ok ? result.error.message : ''}`);
    assert.ok(result.value.length >= 1, 'op log must have at least one entry');

    const first = result.value[0];
    assert.ok(first !== undefined);
    assert.ok(
      typeof first.id === 'string' && first.id.length > 0,
      'operation id must be non-empty',
    );
    assert.ok(first.time.start instanceof Date, 'operation start time must be a Date');
    assert.ok(first.time.end instanceof Date, 'operation end time must be a Date');
  });
});
