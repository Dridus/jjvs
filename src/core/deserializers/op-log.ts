/**
 * Deserializer for `jj op log` JSON output.
 *
 * The `OPERATION_TEMPLATE` constant is the jj `-T` template string that produces
 * one JSON object per line. Pass it to `jj op log --no-graph -T <template>`.
 *
 * Verified against jj 0.38.0 on 2026-03-07.
 * Fixture: test/unit/fixtures/op-log.fixture.ndjson
 */

import * as z from 'zod/mini';
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

// ─── Raw JSON schemas and types ────────────────────────────────────────────────
// Schemas validate actual jj CLI output at the trust boundary. Types are derived
// from the schemas so they stay in sync automatically.

/**
 * Schema and type for `json(time)` in op log templates.
 *
 * Timestamps have millisecond precision:
 * e.g., `"2026-03-07T14:52:29.889-08:00"`.
 */
const RawOperationTimeSchema = z.object({
  start: z.string(),
  end: z.string(),
});
export type RawOperationTime = z.infer<typeof RawOperationTimeSchema>;

/** Schema for the complete shape produced by OPERATION_TEMPLATE for each op log line. */
const RawOperationSchema = z.object({
  id: z.string(),
  description: z.string(),
  /** "user@hostname" format */
  user: z.string(),
  time: RawOperationTimeSchema,
});
/** The complete shape produced by OPERATION_TEMPLATE for each op log line. */
export type RawOperation = z.infer<typeof RawOperationSchema>;

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
 * Graceful degradation: lines that fail JSON.parse or schema validation are
 * skipped.
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
    const parsed = RawOperationSchema.safeParse(raw);
    if (!parsed.success) continue;
    operations.push(rawOperationToOperation(parsed.data));
  }
  return operations;
}
