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
