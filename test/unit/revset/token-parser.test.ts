import { describe, it, expect } from 'vitest';
import {
  extractLastToken,
  replaceLastToken,
  extractFunctionContext,
} from '../../../src/core/revset/token-parser';

describe('extractLastToken', () => {
  it('returns the full input when there are no delimiters', () => {
    expect(extractLastToken('ancestors')).toBe('ancestors');
  });

  it('returns an empty string when the input ends with a delimiter (space)', () => {
    expect(extractLastToken('ancestors(@) | ')).toBe('');
  });

  it('returns the token after the last space', () => {
    expect(extractLastToken('ancestors(@) | boo')).toBe('boo');
  });

  it('returns an empty string for an empty input', () => {
    expect(extractLastToken('')).toBe('');
  });

  it('returns the token after the last pipe operator', () => {
    expect(extractLastToken('trunk()|foo')).toBe('foo');
  });

  it('returns the token after the last comma', () => {
    expect(extractLastToken('range(foo,bar')).toBe('bar');
  });

  it('returns the token after the last opening paren', () => {
    expect(extractLastToken('ancestors(foo')).toBe('foo');
  });

  it('returns an empty string when input ends with a paren', () => {
    expect(extractLastToken('ancestors(@)')).toBe('');
  });

  it('handles the dot range operator correctly', () => {
    expect(extractLastToken('trunk()..@')).toBe('@');
  });

  it('handles the colon range operator correctly', () => {
    expect(extractLastToken('::main')).toBe('main');
  });

  it('returns the token after the ampersand operator', () => {
    expect(extractLastToken('mine()&con')).toBe('con');
  });

  it('returns the token after the tilde (difference) operator', () => {
    expect(extractLastToken('all()~imm')).toBe('imm');
  });
});

describe('replaceLastToken', () => {
  it('replaces the full input when there are no delimiters', () => {
    expect(replaceLastToken('head', 'heads(')).toBe('heads(');
  });

  it('replaces the token after the last space', () => {
    expect(replaceLastToken('ancestors(@) | boo', 'bookmarks')).toBe('ancestors(@) | bookmarks');
  });

  it('replaces an empty trailing token after a delimiter', () => {
    expect(replaceLastToken('trunk() | ', 'mine()')).toBe('trunk() | mine()');
  });

  it('replaces the token after a pipe operator (no space)', () => {
    expect(replaceLastToken('trunk()|foo', 'bookmarks')).toBe('trunk()|bookmarks');
  });

  it('replaces the token after a dot', () => {
    expect(replaceLastToken('trunk()..@', 'mine()')).toBe('trunk()..mine()');
  });

  it('handles replacement in a complex nested expression', () => {
    expect(replaceLastToken('ancestors(foo', 'bookmarks()')).toBe('ancestors(bookmarks()');
  });

  it('handles an empty input', () => {
    expect(replaceLastToken('', 'all()')).toBe('all()');
  });
});

describe('extractFunctionContext', () => {
  it('returns null for an empty input', () => {
    expect(extractFunctionContext('')).toBeNull();
  });

  it('returns null when the cursor is not inside any function call', () => {
    expect(extractFunctionContext('mine() | ')).toBeNull();
  });

  it('returns null when all parens are closed', () => {
    expect(extractFunctionContext('ancestors(@)')).toBeNull();
  });

  it('detects a single-argument function at the first parameter', () => {
    expect(extractFunctionContext('ancestors(')).toEqual({
      functionName: 'ancestors',
      parameterIndex: 0,
    });
  });

  it('detects the first parameter when cursor is typing the argument', () => {
    expect(extractFunctionContext('ancestors(@')).toEqual({
      functionName: 'ancestors',
      parameterIndex: 0,
    });
  });

  it('detects the second parameter after a comma', () => {
    expect(extractFunctionContext('ancestors(@, ')).toEqual({
      functionName: 'ancestors',
      parameterIndex: 1,
    });
  });

  it('handles a two-argument function at the second parameter', () => {
    expect(extractFunctionContext('range(trunk(), ')).toEqual({
      functionName: 'range',
      parameterIndex: 1,
    });
  });

  it('ignores closed inner parens when counting depth', () => {
    // range(trunk(), @  — trunk() is closed, so we are at depth 0 of range
    expect(extractFunctionContext('range(trunk(), @')).toEqual({
      functionName: 'range',
      parameterIndex: 1,
    });
  });

  it('returns the innermost function when calls are nested', () => {
    // heads(ancestors(  — cursor is inside ancestors, which is innermost
    expect(extractFunctionContext('heads(ancestors(')).toEqual({
      functionName: 'ancestors',
      parameterIndex: 0,
    });
  });

  it('returns null when the paren has no preceding identifier', () => {
    expect(extractFunctionContext('(')).toBeNull();
  });
});
