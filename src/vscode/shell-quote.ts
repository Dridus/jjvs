/**
 * Shell-quoting utilities for `terminal.sendText()` calls.
 *
 * `terminal.sendText()` sends text to a shell interpreter, unlike `spawn()`
 * which bypasses the shell. Any value interpolated into a `sendText` call
 * must be shell-escaped. Use `shellQuote` for paths and identifiers.
 * Never interpolate user-provided free-form text into `sendText`.
 */

/**
 * Wrap a value in single quotes, escaping any interior single quotes.
 *
 * This produces a POSIX sh / zsh / bash safe single-quoted string.
 * Interior single quotes are encoded as `'\''` (end quote, literal quote, start quote).
 *
 * @example
 * shellQuote('/usr/local/bin/jj')  // => "'/usr/local/bin/jj'"
 * shellQuote("/path/with 'space'") // => "'/path/with '\\''space'\\''"
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
