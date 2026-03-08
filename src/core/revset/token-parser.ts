// Ported from jjui (MIT License, Ibrahim Dursun): internal/ui/revset/token_parser.go

/**
 * Characters that delimit tokens in a revset expression.
 *
 * Splitting on these lets us extract the symbol the user is currently typing
 * for completion purposes, without needing a full grammar parser.
 *
 * Includes whitespace, logical operators, grouping chars, and path separators.
 */
const REVSET_DELIMITERS = new Set([' ', ',', '|', '&', '~', '(', ')', '.', ':']);

/**
 * Extract the last typed token from a revset expression.
 *
 * Scans backward from the end of `input` until a delimiter is found.
 * Returns the substring after the last delimiter (or the full input if
 * no delimiter is present).
 *
 * Examples:
 *   `"ancestors(@) | "` → `""`   (trailing space → empty last token)
 *   `"ancestors(@) | boo"` → `"boo"`
 *   `"head"` → `"head"`
 *   `"trunk()..@"` → `"@"`
 */
export function extractLastToken(input: string): string {
  for (let i = input.length - 1; i >= 0; i--) {
    if (REVSET_DELIMITERS.has(input[i] ?? '')) {
      return input.substring(i + 1);
    }
  }
  return input;
}

/**
 * The function call context the cursor is currently inside, if any.
 *
 * Used to display signature help while the user is typing function arguments.
 */
export interface FunctionContext {
  /** Name of the function whose argument list contains the cursor. */
  readonly functionName: string;
  /**
   * Zero-based index of the parameter the cursor is currently on.
   * Determined by counting commas between the opening `(` and the cursor.
   */
  readonly parameterIndex: number;
}

/**
 * Extract the innermost function call context the cursor is inside.
 *
 * Scans backward from the end of `input` tracking parenthesis depth.
 * Returns `null` when the cursor is not inside any function call.
 *
 * Examples:
 *   `"ancestors(@"` → `{ functionName: "ancestors", parameterIndex: 0 }`
 *   `"range(trunk(), @"` → `{ functionName: "range", parameterIndex: 1 }`
 *   `"mine() | "` → `null`  (cursor is outside all parens)
 */
export function extractFunctionContext(input: string): FunctionContext | null {
  let depth = 0;
  let paramIndex = 0;

  for (let i = input.length - 1; i >= 0; i--) {
    const ch = input[i];
    if (ch === ')') {
      depth++;
    } else if (ch === '(') {
      if (depth === 0) {
        // This `(` is the opening of the function call we are inside.
        // Extract the function name by scanning backward for the identifier.
        let nameEnd = i;
        // Skip whitespace between the identifier and the paren (uncommon but valid).
        while (nameEnd > 0 && input[nameEnd - 1] === ' ') {
          nameEnd--;
        }
        let nameStart = nameEnd;
        while (nameStart > 0 && /\w/.test(input[nameStart - 1] ?? '')) {
          nameStart--;
        }
        const functionName = input.substring(nameStart, nameEnd);
        if (functionName.length === 0) return null;
        return { functionName, parameterIndex: paramIndex };
      }
      depth--;
    } else if (ch === ',' && depth === 0) {
      paramIndex++;
    }
  }

  return null;
}

/**
 * Replace the last token in a revset expression with `replacement`.
 *
 * Scans backward from the end of `input` until a delimiter is found,
 * then returns everything up to and including the delimiter plus `replacement`.
 * If no delimiter is found, replaces the entire input.
 *
 * Examples:
 *   `replaceLastToken("ancestors(@) | boo", "bookmarks")` → `"ancestors(@) | bookmarks"`
 *   `replaceLastToken("head", "heads(")` → `"heads("`
 */
export function replaceLastToken(input: string, replacement: string): string {
  for (let i = input.length - 1; i >= 0; i--) {
    if (REVSET_DELIMITERS.has(input[i] ?? '')) {
      return input.substring(0, i + 1) + replacement;
    }
  }
  return replacement;
}
