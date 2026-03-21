/**
 * Revset input UI for the revision log tree view.
 *
 * Provides a QuickPick-based input that:
 *   - Shows categorised completion items (history, functions, aliases, bookmarks, tags)
 *   - Filters completions based on the last typed token
 *   - Inserts completions into the current expression without closing the picker
 *   - Applies the final revset expression to the revision log on confirmation
 *
 * ## Session history
 *
 * The last `MAX_HISTORY_ENTRIES` revset expressions entered by the user are
 * stored in `ExtensionContext.globalState` under the `HISTORY_STATE_KEY` key.
 * History persists across VSCode sessions.
 *
 * ## Completion UX
 *
 * The QuickPick always shows an "Apply" item at the top reflecting the current
 * input. Selecting it (or pressing Enter with no completion highlighted) applies
 * the revset. Selecting any other completion item inserts it into the expression
 * and keeps the picker open.
 */

import * as vscode from 'vscode';
import type { JjCli } from '../../../core/jj-cli';
import type { RepositoryState } from '../../../core/repository';
import {
  getRevsetCompletions,
  type RevsetCompletionItem,
  type RevsetCompletionKind,
} from '../../../core/revset/completion-provider';
import { replaceLastToken, extractFunctionContext } from '../../../core/revset/token-parser';
import {
  BUILTIN_REVSET_FUNCTIONS,
  formatRevsetSignature,
} from '../../../core/revset/function-source';

// ─── History ──────────────────────────────────────────────────────────────────

const HISTORY_STATE_KEY = 'jjvs.revset.history';
const MAX_HISTORY_ENTRIES = 15;

/**
 * Manages a bounded list of recently used revset expressions.
 *
 * Persists entries in `ExtensionContext.globalState` so history survives
 * across VSCode sessions.
 */
export class RevsetSessionHistory {
  constructor(private readonly globalState: vscode.Memento) {}

  /** All history entries, most-recent first. */
  getAll(): readonly string[] {
    return this.globalState.get<readonly string[]>(HISTORY_STATE_KEY) ?? [];
  }

  /**
   * Add a revset expression to the front of the history list.
   *
   * Deduplicates — if the expression is already in history it is moved to
   * the front. Trims the list to `MAX_HISTORY_ENTRIES` after insertion.
   */
  async push(revset: string): Promise<void> {
    const trimmed = revset.trim();
    if (trimmed === '') return;

    const existing = this.getAll().filter((e) => e !== trimmed);
    const updated = [trimmed, ...existing].slice(0, MAX_HISTORY_ENTRIES);
    await this.globalState.update(HISTORY_STATE_KEY, updated);
  }
}

// ─── QuickPick item types ─────────────────────────────────────────────────────

/** Marker on QuickPick items to indicate how they should behave when selected. */
type QuickPickItemBehaviour = 'apply' | 'insert-completion';

interface RevsetQuickPickItem extends vscode.QuickPickItem {
  readonly behaviour: QuickPickItemBehaviour;
  /** The text to insert/apply when this item is selected. */
  readonly value: string;
  /** The completion kind (for non-apply items). */
  readonly completionKind?: RevsetCompletionKind;
}

// ─── Icon helpers ─────────────────────────────────────────────────────────────

const KIND_ICONS: Readonly<Record<RevsetCompletionKind, string>> = {
  history: 'history',
  function: 'symbol-function',
  alias: 'symbol-variable',
  bookmark: 'bookmark',
  'remote-bookmark': 'cloud',
  tag: 'tag',
};

function iconForKind(kind: RevsetCompletionKind): vscode.ThemeIcon {
  return new vscode.ThemeIcon(KIND_ICONS[kind]);
}

// ─── Alias loading ────────────────────────────────────────────────────────────

/**
 * Load user-defined revset alias names from `jj config get revset-aliases`.
 *
 * Returns an empty array if the config key does not exist or the command fails.
 * The raw output is a TOML table; we extract keys by looking for lines that
 * contain `=` before the first `#`.
 */
async function loadAliasNames(cli: JjCli, signal: AbortSignal): Promise<readonly string[]> {
  const result = await cli.configGet('revset-aliases', signal);
  if (!result.ok) {
    return [];
  }

  // The output is formatted as TOML: key = "value" pairs, one per line.
  // We just want the keys.
  const aliasNames: string[] = [];
  for (const line of result.value.split('\n')) {
    const eqIndex = line.indexOf('=');
    if (eqIndex > 0) {
      const key = line.substring(0, eqIndex).trim();
      if (key.length > 0) {
        aliasNames.push(key);
      }
    }
  }
  return aliasNames;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

// ─── Signature help ───────────────────────────────────────────────────────────

const DEFAULT_TITLE = 'Filter Revisions by Revset';

/**
 * Build a title string that shows the active function signature with the
 * current parameter highlighted using Unicode bold characters.
 *
 * Returns `DEFAULT_TITLE` when the cursor is not inside a function call or
 * the function name is not recognised.
 *
 * Example output: `ancestors(𝐱[, depth]) — All ancestors of x, optionally limited to a depth`
 */
function buildSignatureTitle(input: string): string {
  const context = extractFunctionContext(input);
  if (context === null) return DEFAULT_TITLE;

  const func = BUILTIN_REVSET_FUNCTIONS.find((f) => f.name === context.functionName);
  if (func === undefined) return DEFAULT_TITLE;

  const signature = formatRevsetSignature(func);
  return `${signature} — ${func.description}`;
}

/** Button shown in the QuickPick title bar to clear the active revset filter. */
const CLEAR_BUTTON: vscode.QuickInputButton = {
  iconPath: new vscode.ThemeIcon('clear-all'),
  tooltip: 'Clear revset filter',
};

/**
 * Open the revset filter input for the given repository.
 *
 * Shows a QuickPick with categorised completion items. When the user confirms
 * a revset expression, it is applied to the repository's revision log and
 * persisted in the session history.
 *
 * @returns The applied revset expression, `null` if the user cancelled, or
 *          `undefined` if the filter was cleared.
 */
export async function openRevsetInput(
  repository: RepositoryState,
  history: RevsetSessionHistory,
  cli: JjCli,
): Promise<string | null | undefined> {
  const abortController = new AbortController();

  const quickPick = vscode.window.createQuickPick<RevsetQuickPickItem>();
  quickPick.title = buildSignatureTitle(repository.activeRevset);
  quickPick.placeholder = 'Enter a revset expression (e.g. @ | trunk()..@)';
  quickPick.value = repository.activeRevset;
  quickPick.buttons = [CLEAR_BUTTON];
  quickPick.keepScrollPosition = true;

  // Load context data asynchronously. Completions degrade gracefully if
  // the async loads haven't finished yet (they'll be empty on first render
  // and fill in once the promises resolve).
  let aliasNames: readonly string[] = [];
  let isUpdatingValue = false;

  const aliasLoadPromise = loadAliasNames(cli, abortController.signal).then((names) => {
    aliasNames = names;
    // Refresh items now that aliases are loaded, unless the picker is gone.
    if (!abortController.signal.aborted) {
      refreshItems(quickPick.value);
    }
  });
  void aliasLoadPromise;

  // ── Item builders ─────────────────────────────────────────────────────────

  const buildApplyItem = (value: string): RevsetQuickPickItem => ({
    label: value.trim() === '' ? '$(search) Show all revisions' : `$(search) Apply: ${value}`,
    alwaysShow: true,
    behaviour: 'apply',
    value,
  });

  const buildCompletionItem = (item: RevsetCompletionItem): RevsetQuickPickItem => ({
    label: `$(${KIND_ICONS[item.kind]}) ${item.label ?? item.completion}`,
    // exactOptionalPropertyTypes: only include description when defined to
    // avoid assigning `undefined` to the optional `string` property.
    ...(item.description !== undefined ? { description: item.description } : {}),
    iconPath: iconForKind(item.kind),
    alwaysShow: false,
    // History items replace the full expression (they are complete revsets), but
    // still use insert-completion so the user can continue editing before applying.
    behaviour: 'insert-completion',
    value: item.completion,
    completionKind: item.kind,
  });

  const refreshItems = (currentValue: string): void => {
    const revisions = repository.revisions;

    // Collect bookmark/tag names from currently loaded revisions.
    const localBookmarkNames = [
      ...new Set(revisions.flatMap((r) => r.localBookmarks.map((b) => b.name))),
    ];
    const remoteBookmarkNames = [
      ...new Set(revisions.flatMap((r) => r.remoteBookmarks.map((b) => `${b.name}@${b.remote}`))),
    ];
    const tagNames = [...new Set(revisions.flatMap((r) => r.tags.map((t) => t.name)))];

    const completions = getRevsetCompletions(currentValue, {
      history: history.getAll(),
      localBookmarkNames,
      remoteBookmarkNames,
      tagNames,
      aliasNames,
    });

    quickPick.items = [buildApplyItem(currentValue), ...completions.map(buildCompletionItem)];

    // Update the title to show signature help when the cursor is inside
    // a function call, or restore the default title when it is not.
    quickPick.title = buildSignatureTitle(currentValue);
  };

  // ── Event wiring ──────────────────────────────────────────────────────────

  refreshItems(quickPick.value);

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  quickPick.onDidChangeValue((newValue) => {
    // Guard against re-entrant updates triggered by programmatic value changes.
    if (isUpdatingValue) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      refreshItems(newValue);
    }, 300);
  });

  // ── Resolve the promise when the user makes a decision ────────────────────

  const result = await new Promise<string | null | undefined>((resolve) => {
    quickPick.onDidAccept(() => {
      const active = quickPick.activeItems[0];
      if (active === undefined) {
        // No item focused: apply the current typed value.
        resolve(quickPick.value);
        quickPick.hide();
        return;
      }

      if (active.behaviour === 'apply') {
        resolve(active.value);
        quickPick.hide();
        return;
      }

      // Insert the completion into the current expression (keep picker open).
      isUpdatingValue = true;
      const newValue = replaceLastToken(quickPick.value, active.value);
      quickPick.value = newValue;
      isUpdatingValue = false;

      // Deselect the active item so the next Enter either applies or picks
      // the newly updated apply-item at the top.
      quickPick.activeItems = [];
      refreshItems(newValue);
    });

    quickPick.onDidTriggerButton((button) => {
      if (button === CLEAR_BUTTON) {
        resolve(undefined);
        quickPick.hide();
      }
    });

    quickPick.onDidHide(() => {
      clearTimeout(debounceTimer);
      resolve(null);
    });

    quickPick.show();
  });

  abortController.abort();
  quickPick.dispose();

  return result;
}
