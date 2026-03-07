/**
 * Tests for the `jj op log` JSON deserializer.
 *
 * Fixture data: test/unit/fixtures/op-log.fixture.ndjson
 * Captured from: jj 0.38.0 on 2026-03-07
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  parseOperations,
  rawOperationToOperation,
  rawOperationTimeToOperationTime,
  OPERATION_TEMPLATE,
  type RawOperation,
  type RawOperationTime,
} from '../../../src/core/deserializers/op-log';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FIXTURE_PATH = resolve(__dirname, '../fixtures/op-log.fixture.ndjson');
const FIXTURE_NDJSON = readFileSync(FIXTURE_PATH, 'utf-8');

function loadFixtureLines(): RawOperation[] {
  return FIXTURE_NDJSON.split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as RawOperation);
}

// ─── rawOperationTimeToOperationTime ─────────────────────────────────────────

describe('rawOperationTimeToOperationTime', () => {
  it('converts start and end to Date objects', () => {
    const raw: RawOperationTime = {
      start: '2026-03-07T14:52:29.889-08:00',
      end: '2026-03-07T14:52:29.902-08:00',
    };
    const time = rawOperationTimeToOperationTime(raw);
    expect(time.start).toBeInstanceOf(Date);
    expect(time.end).toBeInstanceOf(Date);
    expect(time.start.getFullYear()).toBe(2026);
    expect(time.end.getTime()).toBeGreaterThan(time.start.getTime());
  });
});

// ─── rawOperationToOperation ───────────────────────────────────────────────────

describe('rawOperationToOperation', () => {
  it('maps all fields of an operation entry correctly', () => {
    const raw = loadFixtureLines()[0]!;
    const op = rawOperationToOperation(raw);

    expect(op.id).toBe(raw.id);
    expect(op.description).toBe('snapshot working copy');
    expect(op.user).toBe('ross@Enodia.local');
    expect(op.time.start).toBeInstanceOf(Date);
    expect(op.time.end).toBeInstanceOf(Date);
  });

  it('end time is after start time', () => {
    const raw = loadFixtureLines()[0]!;
    const op = rawOperationToOperation(raw);
    expect(op.time.end.getTime()).toBeGreaterThanOrEqual(op.time.start.getTime());
  });

  it('preserves the full operation ID', () => {
    const raw = loadFixtureLines()[0]!;
    const op = rawOperationToOperation(raw);
    // Operation IDs are 128-character hex strings
    expect(op.id.length).toBe(128);
    expect(/^[0-9a-f]+$/.test(op.id)).toBe(true);
  });
});

// ─── parseOperations ──────────────────────────────────────────────────────────

describe('parseOperations', () => {
  it('parses two operations from the fixture file', () => {
    const ops = parseOperations(FIXTURE_NDJSON);
    expect(ops).toHaveLength(2);
  });

  it('operations are in reverse chronological order (most recent first)', () => {
    const ops = parseOperations(FIXTURE_NDJSON);
    expect(ops[0]!.time.start.getTime()).toBeGreaterThan(ops[1]!.time.start.getTime());
  });

  it('returns empty array for empty input', () => {
    expect(parseOperations('')).toHaveLength(0);
    expect(parseOperations('\n\n')).toHaveLength(0);
  });

  it('skips malformed lines (graceful degradation)', () => {
    const withGarbage = FIXTURE_NDJSON + '\nnot valid json\n';
    const ops = parseOperations(withGarbage);
    expect(ops).toHaveLength(2);
  });

  it('matches snapshot', () => {
    const ops = parseOperations(FIXTURE_NDJSON);
    expect(ops).toMatchSnapshot();
  });
});

// ─── OPERATION_TEMPLATE ────────────────────────────────────────────────────────

describe('OPERATION_TEMPLATE', () => {
  it('is a non-empty string', () => {
    expect(typeof OPERATION_TEMPLATE).toBe('string');
    expect(OPERATION_TEMPLATE.length).toBeGreaterThan(0);
  });

  it('contains json() calls for all required fields', () => {
    expect(OPERATION_TEMPLATE).toContain('json(id)');
    expect(OPERATION_TEMPLATE).toContain('json(description)');
    expect(OPERATION_TEMPLATE).toContain('json(user)');
    expect(OPERATION_TEMPLATE).toContain('json(time)');
  });

  it('ends with a newline template expression', () => {
    expect(OPERATION_TEMPLATE.endsWith('"\\n"')).toBe(true);
  });
});
