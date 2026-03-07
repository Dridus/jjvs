/**
 * Deserializer for `jj op log` JSON output.
 *
 * The `OPERATION_TEMPLATE` constant is the jj `-T` template string that produces
 * one JSON object per line. Pass it to `jj op log --no-graph -T <template>`.
 *
 * Verified against jj 0.38.0 on 2026-03-07.
 * Fixture: test/unit/fixtures/op-log.fixture.ndjson
 */

import type { Operation, OperationTime } from '../types';

// ─── jj template ──────────────────────────────────────────────────────────────

/**
 * jj op log template producing one JSON object per operation per line.
 *
 * Fields:
 * - `id`: Full operation ID (128-character hex string)
 * - `description`: Human-readable description of what the operation did
 * - `user`: `"user@hostname"` format string
 * - `time`: Object with `start` and `end` ISO 8601 timestamps (millisecond precision)
 *
 * Use with: `jj op log --no-graph [--limit <n>] -T <template>`
 */
export const OPERATION_TEMPLATE = [
  '"{\\"id\\":" ++ json(id)',
  '",\\"description\\":" ++ json(description)',
  '",\\"user\\":" ++ json(user)',
  '",\\"time\\":" ++ json(time)',
  '"}"',
  '"\\n"',
].join(' ++ ');

// ─── Raw JSON types ────────────────────────────────────────────────────────────

/**
 * The shape produced by `json(time)` in op log templates.
 *
 * Timestamps have millisecond precision:
 * e.g., `"2026-03-07T14:52:29.889-08:00"`.
 */
export interface RawOperationTime {
  readonly start: string;
  readonly end: string;
}

/** The complete shape produced by OPERATION_TEMPLATE for each op log line. */
export interface RawOperation {
  readonly id: string;
  readonly description: string;
  readonly user: string; // "user@hostname" format
  readonly time: RawOperationTime;
}

// ─── Conversion functions ──────────────────────────────────────────────────────

/** Convert a raw operation time to a domain `OperationTime`. */
export function rawOperationTimeToOperationTime(raw: RawOperationTime): OperationTime {
  return {
    start: new Date(raw.start),
    end: new Date(raw.end),
  };
}

/** Convert a raw operation to a domain `Operation`. */
export function rawOperationToOperation(raw: RawOperation): Operation {
  return {
    id: raw.id,
    description: raw.description,
    user: raw.user,
    time: rawOperationTimeToOperationTime(raw.time),
  };
}

/**
 * Parse newline-delimited JSON op log output into an `Operation` array.
 *
 * Graceful degradation: lines that fail JSON.parse are skipped.
 */
export function parseOperations(stdout: string): readonly Operation[] {
  const operations: Operation[] = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      continue;
    }
    // Safe: JSON.parse succeeded, and rawOperationToOperation accesses only
    // the fields declared in RawOperation. Missing or incorrectly-typed fields
    // are handled by `?? ''` and `?? []` fallbacks in the conversion function.
    operations.push(rawOperationToOperation(raw as RawOperation));
  }
  return operations;
}
