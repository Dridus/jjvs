import { describe, it, expect } from 'vitest';
import {
  getRevsetCompletions,
  type RevsetCompletionContext,
} from '../../../src/core/revset/completion-provider';

const emptyContext: RevsetCompletionContext = {
  history: [],
  localBookmarkNames: [],
  remoteBookmarkNames: [],
  tagNames: [],
  aliasNames: [],
};

const richContext: RevsetCompletionContext = {
  history: ['ancestors(@)', 'trunk()..@'],
  localBookmarkNames: ['main', 'feature-xyz'],
  remoteBookmarkNames: ['main@origin', 'feature-xyz@origin'],
  tagNames: ['v1.0', 'v2.0'],
  aliasNames: ['my-alias'],
};

describe('getRevsetCompletions', () => {
  it('returns an empty array when context is empty and input has no matches', () => {
    const results = getRevsetCompletions('zzz_no_match', emptyContext);
    expect(results).toHaveLength(0);
  });

  it('returns all built-in functions when the last token is empty', () => {
    const results = getRevsetCompletions('', emptyContext);
    const functionItems = results.filter((r) => r.kind === 'function');
    expect(functionItems.length).toBeGreaterThan(0);
  });

  it('filters functions by prefix of the last token', () => {
    const results = getRevsetCompletions('anc', emptyContext);
    const names = results.map((r) => r.completion);
    expect(names).toContain('ancestors(');
    // Should not include 'all(' since 'all' does not start with 'anc'
    expect(names).not.toContain('all(');
  });

  it('returns history items when the input matches a history entry', () => {
    const results = getRevsetCompletions('ancestors', richContext);
    const historyItems = results.filter((r) => r.kind === 'history');
    expect(historyItems.length).toBeGreaterThanOrEqual(1);
    expect(historyItems.some((h) => h.completion === 'ancestors(@)')).toBe(true);
  });

  it('returns bookmark items matching the last token prefix', () => {
    const results = getRevsetCompletions('feat', richContext);
    const bookmarkItems = results.filter((r) => r.kind === 'bookmark');
    expect(bookmarkItems.length).toBe(1);
    expect(bookmarkItems[0]?.completion).toBe('feature-xyz');
  });

  it('returns remote bookmark items matching the last token', () => {
    const results = getRevsetCompletions('main', richContext);
    const remoteItems = results.filter((r) => r.kind === 'remote-bookmark');
    expect(remoteItems.length).toBe(1);
    expect(remoteItems[0]?.completion).toBe('main@origin');
  });

  it('returns tag items matching the last token', () => {
    const results = getRevsetCompletions('v', richContext);
    const tagItems = results.filter((r) => r.kind === 'tag');
    expect(tagItems.length).toBe(2);
  });

  it('extracts the last token from a complex expression for filtering', () => {
    // The last token after '|' with a space is 'desc'
    const results = getRevsetCompletions('ancestors(@) | desc', emptyContext);
    const names = results.map((r) => r.completion);
    // 'description(' and 'descendants(' both start with 'desc'
    expect(names.some((n) => n.startsWith('desc'))).toBe(true);
    // 'all(' does not start with 'desc'
    expect(names).not.toContain('all(');
  });

  it('returns all items when the last token is empty (trailing delimiter)', () => {
    const results = getRevsetCompletions('trunk() | ', richContext);
    const functionItems = results.filter((r) => r.kind === 'function');
    expect(functionItems.length).toBeGreaterThan(0);
    const bookmarkItems = results.filter((r) => r.kind === 'bookmark');
    expect(bookmarkItems.length).toBeGreaterThan(0);
  });

  it('completion items for functions open the parameter list with a paren', () => {
    const results = getRevsetCompletions('all', emptyContext);
    const allItem = results.find((r) => r.kind === 'function' && r.completion === 'all(');
    expect(allItem).toBeDefined();
  });

  it('completion items for bookmarks do not add a paren', () => {
    const results = getRevsetCompletions('main', richContext);
    const bookmarkItem = results.find((r) => r.kind === 'bookmark');
    expect(bookmarkItem?.completion).toBe('main');
    expect(bookmarkItem?.completion).not.toContain('(');
  });

  it('is case-insensitive when filtering by last token', () => {
    const results = getRevsetCompletions('ANC', emptyContext);
    const names = results.map((r) => r.completion);
    expect(names).toContain('ancestors(');
  });
});
