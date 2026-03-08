import { describe, it, expect } from 'vitest';
import {
  BUILTIN_REVSET_FUNCTIONS,
  formatRevsetSignature,
} from '../../../src/core/revset/function-source';

describe('BUILTIN_REVSET_FUNCTIONS', () => {
  it('contains at least 20 built-in functions', () => {
    expect(BUILTIN_REVSET_FUNCTIONS.length).toBeGreaterThanOrEqual(20);
  });

  it('includes common functions: all, ancestors, parents, mine', () => {
    const names = BUILTIN_REVSET_FUNCTIONS.map((f) => f.name);
    expect(names).toContain('all');
    expect(names).toContain('ancestors');
    expect(names).toContain('parents');
    expect(names).toContain('mine');
  });

  it('has no duplicate function names', () => {
    const names = BUILTIN_REVSET_FUNCTIONS.map((f) => f.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('every function has a non-empty name and description', () => {
    for (const func of BUILTIN_REVSET_FUNCTIONS) {
      expect(func.name.length).toBeGreaterThan(0);
      expect(func.description.length).toBeGreaterThan(0);
    }
  });
});

describe('formatRevsetSignature', () => {
  it('formats a zero-parameter function as name()', () => {
    const func = BUILTIN_REVSET_FUNCTIONS.find((f) => f.name === 'all');
    expect(func).toBeDefined();
    expect(formatRevsetSignature(func!)).toBe('all()');
  });

  it('formats a required single-parameter function correctly', () => {
    const func = BUILTIN_REVSET_FUNCTIONS.find((f) => f.name === 'parents');
    expect(func).toBeDefined();
    expect(formatRevsetSignature(func!)).toBe('parents(x)');
  });

  it('formats optional parameters with brackets', () => {
    const func = BUILTIN_REVSET_FUNCTIONS.find((f) => f.name === 'ancestors');
    expect(func).toBeDefined();
    // ancestors has required x and optional depth
    expect(formatRevsetSignature(func!)).toBe('ancestors(x[, depth])');
  });

  it('formats a function with only an optional parameter without a leading comma', () => {
    const func = BUILTIN_REVSET_FUNCTIONS.find((f) => f.name === 'bookmarks');
    expect(func).toBeDefined();
    // bookmarks([pattern]) — no comma before the first optional param
    const sig = formatRevsetSignature(func!);
    expect(sig).toBe('bookmarks([pattern])');
  });

  it('formats consecutive optional parameters with a leading comma on second+', () => {
    const func = BUILTIN_REVSET_FUNCTIONS.find((f) => f.name === 'remote_bookmarks');
    expect(func).toBeDefined();
    // remote_bookmarks([bookmark][, remote]) — second optional gets ", "
    const sig = formatRevsetSignature(func!);
    expect(sig).toBe('remote_bookmarks([bookmark][, remote])');
  });
});
