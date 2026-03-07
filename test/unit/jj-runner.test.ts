/**
 * Unit tests for JjRunnerImpl.
 *
 * These tests use Node.js (`node`) as a stand-in binary to exercise the
 * process management logic (cancellation, timeout, non-zero exit, not-found)
 * without requiring jj to be installed or a real repository.
 *
 * Tests that verify jj CLI behaviour (output format, command semantics) live
 * in the integration test suite.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { JjRunnerImpl, type JjRunnerConfig } from '../../src/core/jj-runner';

/** Build a config pointing at `node` as the binary, so we can use Node.js
 * inline scripts to simulate various process outcomes. */
function makeConfig(overrides: Partial<JjRunnerConfig> = {}): JjRunnerConfig {
  return {
    jjPath: process.execPath, // absolute path to the current node binary
    workingDirectory: path.resolve('.'),
    defaultTimeoutMs: 5_000,
    ...overrides,
  };
}

describe('JjRunnerImpl', () => {
  describe('construction', () => {
    it('exposes the workingDirectory from config', () => {
      const runner = new JjRunnerImpl(makeConfig({ workingDirectory: '/tmp' }));
      expect(runner.workingDirectory).toBe('/tmp');
    });
  });

  describe('run — success', () => {
    it('returns Ok with stdout on exit code 0', async () => {
      const runner = new JjRunnerImpl(makeConfig());
      // `node -e "process.stdout.write('hello')"` exits 0 and writes to stdout
      const result = await runner.run(['-e', "process.stdout.write('hello')"]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stdout).toBe('hello');
      }
    });

    it('captures stderr separately from stdout', async () => {
      const runner = new JjRunnerImpl(makeConfig());
      const result = await runner.run([
        '-e',
        "process.stdout.write('out'); process.stderr.write('err')",
      ]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stdout).toBe('out');
        expect(result.value.stderr).toBe('err');
      }
    });

    it('returns Ok with empty stdout for a silent success', async () => {
      const runner = new JjRunnerImpl(makeConfig());
      const result = await runner.run(['-e', 'process.exit(0)']);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stdout).toBe('');
        expect(result.value.stderr).toBe('');
      }
    });
  });

  describe('run — non-zero exit', () => {
    it('returns Err with kind non-zero-exit when process exits non-zero', async () => {
      const runner = new JjRunnerImpl(makeConfig());
      const result = await runner.run(['-e', 'process.exit(2)']);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('non-zero-exit');
        if (result.error.kind === 'non-zero-exit') {
          expect(result.error.exitCode).toBe(2);
        }
      }
    });

    it('includes stderr in non-zero-exit error', async () => {
      const runner = new JjRunnerImpl(makeConfig());
      const result = await runner.run([
        '-e',
        "process.stderr.write('error message'); process.exit(1)",
      ]);
      expect(result.ok).toBe(false);
      if (!result.ok && result.error.kind === 'non-zero-exit') {
        expect(result.error.stderr).toBe('error message');
      }
    });

    it('includes partial stdout in non-zero-exit error', async () => {
      const runner = new JjRunnerImpl(makeConfig());
      const result = await runner.run([
        '-e',
        "process.stdout.write('partial output'); process.exit(1)",
      ]);
      expect(result.ok).toBe(false);
      if (!result.ok && result.error.kind === 'non-zero-exit') {
        expect(result.error.stdout).toBe('partial output');
      }
    });
  });

  describe('run — binary not found', () => {
    it('returns Err with kind not-found when binary does not exist', async () => {
      const runner = new JjRunnerImpl(
        makeConfig({ jjPath: '/definitely/does/not/exist/jjvs-test-binary' }),
      );
      const result = await runner.run(['--version']);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('not-found');
      }
    });
  });

  describe('run — timeout', () => {
    it('returns Err with kind timeout when process exceeds the limit', async () => {
      const runner = new JjRunnerImpl(makeConfig({ defaultTimeoutMs: 100 }));
      // This process sleeps indefinitely; the runner must kill it.
      const result = await runner.run(['-e', 'setTimeout(() => {}, 60_000)']);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('timeout');
        if (result.error.kind === 'timeout') {
          expect(result.error.timeoutMs).toBe(100);
        }
      }
    }, 5_000); // vitest timeout for this test
  });

  describe('run — cancellation', () => {
    it('returns Err with kind cancelled when signal is aborted before run', async () => {
      const runner = new JjRunnerImpl(makeConfig());
      const controller = new AbortController();
      controller.abort();
      const result = await runner.run(['-e', "process.exit(0)"], controller.signal);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('cancelled');
      }
    });

    it('returns Err with kind cancelled when signal is aborted during run', async () => {
      const runner = new JjRunnerImpl(makeConfig({ defaultTimeoutMs: 10_000 }));
      const controller = new AbortController();
      // Abort after a short delay to let the process start.
      setTimeout(() => controller.abort(), 50);
      const result = await runner.run(
        ['-e', 'setTimeout(() => {}, 60_000)'],
        controller.signal,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('cancelled');
      }
    }, 5_000);

    it('distinguishes cancellation from timeout', async () => {
      const runner = new JjRunnerImpl(makeConfig({ defaultTimeoutMs: 200 }));
      const controller = new AbortController();
      // Cancel immediately; the timeout is 200ms so cancellation wins.
      controller.abort();
      const result = await runner.run(
        ['-e', 'setTimeout(() => {}, 60_000)'],
        controller.signal,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Pre-cancelled signal → 'cancelled', not 'timeout'
        expect(result.error.kind).toBe('cancelled');
      }
    });
  });

  describe('run — multiple calls', () => {
    it('can run multiple commands sequentially', async () => {
      const runner = new JjRunnerImpl(makeConfig());
      const r1 = await runner.run(['-e', "process.stdout.write('first')"]);
      const r2 = await runner.run(['-e', "process.stdout.write('second')"]);
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
      if (r1.ok && r2.ok) {
        expect(r1.value.stdout).toBe('first');
        expect(r2.value.stdout).toBe('second');
      }
    });
  });
});
