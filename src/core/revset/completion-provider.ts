/**
 * Revset completion provider.
 *
 * Pure TypeScript — no VSCode imports. Returns structured completion items
 * that the VSCode layer (revset-input.ts) renders into QuickPick items.
 *
 * Completion sources (in display order):
 *   1. Session history — previously used revset expressions
 *   2. Built-in revset functions
 *   3. User-defined revset aliases (from `jj config get revset-aliases`)
 *   4. Local bookmarks from the current revision log
 *   5. Remote bookmarks from the current revision log
 *   6. Tags from the current revision log
 *
 * The completions are filtered to items whose names start with the last token
 * extracted from the current input.
 */

import {
  BUILTIN_REVSET_FUNCTIONS,
  formatRevsetSignature,
  type RevsetFunction,
} from './function-source';
import { extractLastToken } from './token-parser';

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * Discriminated union for the source category of a completion item.
 * Used by the VSCode layer to display category separators and icons.
 */
export type RevsetCompletionKind =
  | 'history'
  | 'function'
  | 'alias'
  | 'bookmark'
  | 'remote-bookmark'
  | 'tag';

/**
 * A single completion item returned by `getRevsetCompletions`.
 */
export interface RevsetCompletionItem {
  /**
   * The text to insert at the cursor (replaces the last token).
   * For functions this includes the opening parenthesis, e.g. `"ancestors("`.
   */
  readonly completion: string;
  /** Category for UI grouping and icon selection. */
  readonly kind: RevsetCompletionKind;
  /**
   * Human-readable label for display in the completion UI.
   * Defaults to `completion` when omitted.
   */
  readonly label?: string;
  /** Short description shown alongside the completion item. */
  readonly description?: string;
}

/**
 * Context data required to generate completion items.
 *
 * Passed by the VSCode layer, which has access to the current repository state
 * and session history.
 */
export interface RevsetCompletionContext {
  /** Previously used revset expressions, most-recent first. */
  readonly history: readonly string[];
  /** All local bookmark names visible in the current revision log. */
  readonly localBookmarkNames: readonly string[];
  /** All remote bookmark names (e.g. `"main@origin"`) visible in the log. */
  readonly remoteBookmarkNames: readonly string[];
  /** All tag names visible in the current revision log. */
  readonly tagNames: readonly string[];
  /**
   * User-defined revset alias names (keys from `jj config get revset-aliases`).
   * An empty array if the config fetch failed or returned no aliases.
   */
  readonly aliasNames: readonly string[];
}

// ─── Completion logic ─────────────────────────────────────────────────────────

/**
 * Return completion items for the current revset `input`.
 *
 * The last token of `input` (as defined by `extractLastToken`) is used as a
 * case-insensitive prefix filter. An empty last token returns all items.
 */
export function getRevsetCompletions(
  input: string,
  context: RevsetCompletionContext,
): readonly RevsetCompletionItem[] {
  const lastToken = extractLastToken(input).toLowerCase();

  const items: RevsetCompletionItem[] = [];

  // ── 1. History ──────────────────────────────────────────────────────────
  // History items match if the full expression contains the last token, or
  // if the last token is empty (show all history).
  for (const historyEntry of context.history) {
    if (historyEntry.toLowerCase().includes(lastToken)) {
      items.push({
        completion: historyEntry,
        kind: 'history',
        label: historyEntry,
        description: 'recently used',
      });
    }
  }

  // ── 2. Built-in functions ───────────────────────────────────────────────
  for (const func of BUILTIN_REVSET_FUNCTIONS) {
    if (func.name.toLowerCase().startsWith(lastToken)) {
      items.push(buildFunctionItem(func));
    }
  }

  // ── 3. User-defined aliases ──────────────────────────────────────────────
  for (const alias of context.aliasNames) {
    if (alias.toLowerCase().startsWith(lastToken)) {
      items.push({
        completion: alias,
        kind: 'alias',
        label: alias,
        description: 'alias',
      });
    }
  }

  // ── 4. Local bookmarks ───────────────────────────────────────────────────
  for (const name of context.localBookmarkNames) {
    if (name.toLowerCase().startsWith(lastToken)) {
      items.push({
        completion: name,
        kind: 'bookmark',
        label: name,
        description: 'bookmark',
      });
    }
  }

  // ── 5. Remote bookmarks ──────────────────────────────────────────────────
  for (const name of context.remoteBookmarkNames) {
    if (name.toLowerCase().startsWith(lastToken)) {
      items.push({
        completion: name,
        kind: 'remote-bookmark',
        label: name,
        description: 'remote bookmark',
      });
    }
  }

  // ── 6. Tags ──────────────────────────────────────────────────────────────
  for (const name of context.tagNames) {
    if (name.toLowerCase().startsWith(lastToken)) {
      items.push({
        completion: name,
        kind: 'tag',
        label: name,
        description: 'tag',
      });
    }
  }

  return items;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildFunctionItem(func: RevsetFunction): RevsetCompletionItem {
  return {
    // The completion text opens the parameter list so the user can type the arg.
    completion: `${func.name}(`,
    kind: 'function',
    label: formatRevsetSignature(func),
    description: func.description,
  };
}
