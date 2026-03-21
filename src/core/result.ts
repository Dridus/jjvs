/**
 * Result<T, E> — a type-safe alternative to thrown exceptions.
 *
 * Used throughout `src/core/` to represent operations that can fail.
 * The VSCode layer (`src/vscode/`) unwraps Results via a centralized adapter
 * (CommandService) that converts errors to notifications, output channel
 * logs, or actionable messages. Never throw exceptions in `src/core/`.
 *
 * Design:
 * - Discriminated union on the `ok` property (not a class)
 * - Standalone combinator functions (not methods) for tree-shaking
 * - Default error type is `Error` for convenience
 */

/** A successful result containing a value of type `T`. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** A failed result containing an error of type `E`. */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * A Result is either `Ok<T>` (success) or `Err<E>` (failure).
 *
 * @example
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) return err('division by zero');
 *   return ok(a / b);
 * }
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/** Create a successful `Ok<T>` result. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Create a failed `Err<E>` result. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/**
 * Transform the `Ok` value of a Result, leaving `Err` unchanged.
 *
 * @example
 * mapResult(ok(42), x => x * 2)      // Ok<84>
 * mapResult(err('oops'), x => x * 2) // Err<'oops'>
 */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/**
 * Transform the `Err` value of a Result, leaving `Ok` unchanged.
 *
 * @example
 * mapErr(err('oops'), e => new Error(e)) // Err<Error>
 * mapErr(ok(42), e => new Error(e))      // Ok<42>
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

/**
 * Chain Results together (monadic bind / flatMap).
 *
 * If the input is `Ok`, passes its value to `fn` and returns the new Result.
 * If the input is `Err`, passes the error through without calling `fn`.
 *
 * @example
 * const parse = (s: string): Result<number, string> =>
 *   isNaN(Number(s)) ? err('not a number') : ok(Number(s));
 *
 * flatMapResult(ok('42'), parse)          // Ok<42>
 * flatMapResult(ok('abc'), parse)         // Err<'not a number'>
 * flatMapResult(err('prior error'), parse) // Err<'prior error'>
 */
export function flatMapResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

/**
 * Consume a Result by providing handlers for both `Ok` and `Err`.
 * Exactly one handler is always called.
 *
 * @example
 * matchResult(
 *   result,
 *   value => `Success: ${value}`,
 *   error => `Failure: ${error.message}`,
 * )
 */
export function matchResult<T, E, R>(
  result: Result<T, E>,
  onOk: (value: T) => R,
  onErr: (error: E) => R,
): R {
  return result.ok ? onOk(result.value) : onErr(result.error);
}

/**
 * Return the `Ok` value, or the provided default if `Err`.
 *
 * @example
 * getOrElse(ok(42), 0)       // 42
 * getOrElse(err('oops'), 0)  // 0
 */
export function getOrElse<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue;
}

/**
 * Return the `Ok` value, or throw the error if `Err`.
 *
 * Use sparingly — prefer `matchResult` or `mapResult` for safe handling.
 * Intended for use at system boundaries where an error is truly unexpected.
 */
export function unwrapResult<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  if (result.error instanceof Error) {
    throw result.error;
  }
  throw new Error(`Result was Err: ${JSON.stringify(result.error)}`);
}

/**
 * Wrap a function that may throw synchronously into a `Result`.
 * The thrown value is normalised to an `Error` instance.
 *
 * @example
 * trySync(() => JSON.parse('{')); // Err<SyntaxError>
 * trySync(() => JSON.parse('{}')); // Ok<{}>
 */
export function trySync<T>(fn: () => T): Result<T, Error> {
  try {
    return ok(fn());
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Wrap an async function that may reject into a `Result`.
 * The rejection value is normalised to an `Error` instance.
 *
 * @example
 * await tryAsync(() => fetch('/api')) // Ok<Response> or Err<Error>
 */
export async function tryAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
