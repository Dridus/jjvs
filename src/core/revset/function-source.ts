// Ported from jjui (MIT License, Ibrahim Dursun): internal/ui/revset/function_source.go

/**
 * Describes a single parameter of a built-in revset function.
 */
export interface RevsetParameter {
  /** The parameter name as used in jj's documentation. */
  readonly name: string;
  /** Whether this parameter may be omitted. */
  readonly optional: boolean;
}

/**
 * A built-in jj revset function with its signature and description.
 *
 * Used for completion and signature help in the revset input UI.
 * Function definitions verified against jj 0.38.0 revsets documentation.
 */
export interface RevsetFunction {
  /** The function name (without parentheses). */
  readonly name: string;
  /** Ordered parameter list. Empty for zero-argument functions. */
  readonly parameters: readonly RevsetParameter[];
  /** Human-readable description for the completion UI. */
  readonly description: string;
}

/** Build a required parameter descriptor. */
const required = (name: string): RevsetParameter => ({ name, optional: false });

/** Build an optional parameter descriptor. */
const optional = (name: string): RevsetParameter => ({ name, optional: true });

/**
 * All built-in jj revset functions.
 *
 * Verified against jj 0.38.0 revsets documentation.
 * See: https://martinvonz.github.io/jj/latest/revsets/
 */
export const BUILTIN_REVSET_FUNCTIONS: readonly RevsetFunction[] = [
  // ── Whole-repository predicates ──────────────────────────────────────────
  {
    name: 'all',
    parameters: [],
    description: 'All visible revisions in the repository',
  },
  {
    name: 'root',
    parameters: [],
    description: 'The virtual root revision (has no parents)',
  },
  {
    name: 'working_copies',
    parameters: [],
    description: 'All working-copy revisions across all workspaces',
  },
  {
    name: 'visible_heads',
    parameters: [],
    description: 'All visible head revisions (no visible children)',
  },
  {
    name: 'trunk',
    parameters: [],
    description: 'The trunk revision (typically main@origin)',
  },
  {
    name: 'merges',
    parameters: [],
    description: 'Revisions with two or more parents',
  },
  {
    name: 'conflicts',
    parameters: [],
    description: 'Revisions with unresolved merge conflicts',
  },
  {
    name: 'divergent',
    parameters: [],
    description: 'Revisions whose change ID is shared by multiple commits',
  },
  {
    name: 'mine',
    parameters: [],
    description: 'Revisions authored by the current user',
  },
  {
    name: 'mutable',
    parameters: [],
    description: 'Revisions that are not immutable (can be rewritten)',
  },
  {
    name: 'immutable',
    parameters: [],
    description: 'Revisions that cannot be rewritten',
  },
  {
    name: 'is_empty',
    parameters: [],
    description: 'Revisions with no changes relative to their parents',
  },
  {
    name: 'git_refs',
    parameters: [],
    description: 'All revisions pointed to by git refs',
  },
  {
    name: 'git_head',
    parameters: [],
    description: 'The revision pointed to by git HEAD',
  },

  // ── Graph traversal ───────────────────────────────────────────────────────
  {
    name: 'parents',
    parameters: [required('x')],
    description: 'Direct parents of x',
  },
  {
    name: 'children',
    parameters: [required('x')],
    description: 'Direct children of x',
  },
  {
    name: 'ancestors',
    parameters: [required('x'), optional('depth')],
    description: 'All ancestors of x, optionally limited to a depth',
  },
  {
    name: 'descendants',
    parameters: [required('x'), optional('depth')],
    description: 'All descendants of x, optionally limited to a depth',
  },
  {
    name: 'connected',
    parameters: [required('x')],
    description: 'All revisions reachable from any revision in x (including x)',
  },
  {
    name: 'range',
    parameters: [required('roots'), required('heads')],
    description: 'Revisions reachable from heads but not from roots (exclusive roots)',
  },
  {
    name: 'reachable',
    parameters: [required('srcs'), required('domain')],
    description: 'Revisions reachable from srcs through edges in domain',
  },
  {
    name: 'heads',
    parameters: [required('x')],
    description: 'Revisions in x that have no children also in x',
  },
  {
    name: 'roots',
    parameters: [required('x')],
    description: 'Revisions in x that have no parents also in x',
  },
  {
    name: 'latest',
    parameters: [required('x'), optional('count')],
    description: 'The latest count revisions in x (default count = 1)',
  },
  {
    name: 'fork_point',
    parameters: [required('x')],
    description: 'The nearest common ancestor of all revisions in x',
  },
  {
    name: 'at_operation',
    parameters: [required('op'), required('x')],
    description: 'Evaluate x in the context of a past operation',
  },

  // ── Content filters ───────────────────────────────────────────────────────
  {
    name: 'description',
    parameters: [required('pattern')],
    description: 'Revisions whose description matches the given pattern',
  },
  {
    name: 'author',
    parameters: [required('pattern')],
    description: 'Revisions authored by a user matching the pattern',
  },
  {
    name: 'author_date',
    parameters: [required('pattern')],
    description: 'Revisions authored within a matching date range',
  },
  {
    name: 'committer_date',
    parameters: [required('pattern')],
    description: 'Revisions committed within a matching date range',
  },
  {
    name: 'diff_contains',
    parameters: [required('text'), optional('files')],
    description: 'Revisions whose diff contains the given text',
  },

  // ── Reference filters ──────────────────────────────────────────────────────
  {
    name: 'bookmarks',
    parameters: [optional('pattern')],
    description: 'Revisions with local bookmarks matching an optional pattern',
  },
  {
    name: 'remote_bookmarks',
    parameters: [optional('bookmark'), optional('remote')],
    description: 'Revisions with remote bookmarks, optionally filtered by name and remote',
  },
  {
    name: 'tags',
    parameters: [optional('pattern')],
    description: 'Revisions with tags matching an optional pattern',
  },

  // ── Set operations ────────────────────────────────────────────────────────
  {
    name: 'present',
    parameters: [required('x')],
    description: 'x if it evaluates to a non-empty set, otherwise empty (never errors)',
  },
  {
    name: 'coalesce',
    parameters: [required('revsets...')],
    description: 'The first non-empty revset among the arguments',
  },
];

/**
 * Format a revset function's signature as a human-readable string.
 *
 * Matches jj's own documentation conventions:
 *   - `all()`                         zero params
 *   - `parents(x)`                    single required param
 *   - `bookmarks([pattern])`          single optional param — no leading comma
 *   - `ancestors(x[, depth])`         required then optional
 *   - `remote_bookmarks([b][, r])`    consecutive optional params
 */
export function formatRevsetSignature(func: RevsetFunction): string {
  let result = '';
  let isFirst = true;

  for (const param of func.parameters) {
    if (param.optional) {
      // The leading ", " inside the brackets only appears when there is at
      // least one preceding parameter (required or optional).
      result += isFirst ? `[${param.name}]` : `[, ${param.name}]`;
    } else {
      if (!isFirst) {
        result += ', ';
      }
      result += param.name;
    }
    isFirst = false;
  }

  return `${func.name}(${result})`;
}
