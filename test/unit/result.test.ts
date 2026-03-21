import { describe, it, expect } from 'vitest';
import {
  ok,
  err,
  mapResult,
  mapErr,
  flatMapResult,
  matchResult,
  getOrElse,
  unwrapResult,
  trySync,
  tryAsync,
  type Result,
} from '../../src/core/result';

describe('ok', () => {
  it('creates an Ok result with the given value', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(42);
  });

  it('preserves reference identity for objects', () => {
    const obj = { x: 1 };
    const result = ok(obj);
    expect(result.value).toBe(obj);
  });

  it('works with undefined', () => {
    const result = ok(undefined);
    expect(result.ok).toBe(true);
    expect(result.value).toBeUndefined();
  });
});

describe('err', () => {
  it('creates an Err result with the given error', () => {
    const result = err('something went wrong');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('something went wrong');
  });

  it('works with Error instances', () => {
    const error = new Error('test error');
    const result = err(error);
    expect(result.error).toBe(error);
  });
});

describe('mapResult', () => {
  it('transforms the Ok value', () => {
    const result = mapResult(ok(21), (x) => x * 2);
    expect(result).toEqual(ok(42));
  });

  it('passes Err through unchanged', () => {
    const original = err('oops');
    const result = mapResult(original, (x: number) => x * 2);
    expect(result).toBe(original);
  });

  it('allows changing the value type', () => {
    const result: Result<string, string> = mapResult(ok(42), (x) => String(x));
    expect(result).toEqual(ok('42'));
  });
});

describe('mapErr', () => {
  it('transforms the Err value', () => {
    const result = mapErr(err('raw error'), (e) => new Error(e));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe('raw error');
    }
  });

  it('passes Ok through unchanged', () => {
    const original = ok(42);
    const result = mapErr(original, (e: string) => new Error(e));
    expect(result).toBe(original);
  });
});

describe('flatMapResult', () => {
  const safeDivide = (n: number): Result<number, string> =>
    n === 0 ? err('division by zero') : ok(100 / n);

  it('chains Ok results', () => {
    expect(flatMapResult(ok(5), safeDivide)).toEqual(ok(20));
  });

  it('propagates Err from the input without calling fn', () => {
    const original = err('prior error');
    const result = flatMapResult(original, safeDivide);
    expect(result).toBe(original);
  });

  it('propagates Err produced by fn', () => {
    expect(flatMapResult(ok(0), safeDivide)).toEqual(err('division by zero'));
  });

  it('chains multiple operations', () => {
    const parseNumber = (s: string): Result<number, string> => {
      const n = Number(s);
      return isNaN(n) ? err(`not a number: ${s}`) : ok(n);
    };

    const result = flatMapResult(flatMapResult(ok('5'), parseNumber), safeDivide);
    expect(result).toEqual(ok(20));
  });
});

describe('matchResult', () => {
  it('calls onOk for an Ok result', () => {
    const message = matchResult(
      ok(42),
      (value) => `success: ${value}`,
      (error) => `failure: ${error}`,
    );
    expect(message).toBe('success: 42');
  });

  it('calls onErr for an Err result', () => {
    const message = matchResult(
      err('oops'),
      (value: number) => `success: ${value}`,
      (error) => `failure: ${error}`,
    );
    expect(message).toBe('failure: oops');
  });

  it('can return different types from handlers', () => {
    const count: number = matchResult(
      ok('hello'),
      (s) => s.length,
      (_e: string) => -1,
    );
    expect(count).toBe(5);
  });
});

describe('getOrElse', () => {
  it('returns the Ok value', () => {
    expect(getOrElse(ok(42), 0)).toBe(42);
  });

  it('returns the default value for Err', () => {
    expect(getOrElse(err('oops'), 0)).toBe(0);
  });

  it('returns the default for Err when default is undefined', () => {
    expect(getOrElse(err('oops'), undefined)).toBeUndefined();
  });
});

describe('unwrapResult', () => {
  it('returns the Ok value', () => {
    expect(unwrapResult(ok(42))).toBe(42);
  });

  it('throws an Error instance if Err contains an Error', () => {
    const error = new Error('test error');
    expect(() => unwrapResult(err(error))).toThrow(error);
  });

  it('wraps non-Error Err values in a new Error', () => {
    expect(() => unwrapResult(err('string error'))).toThrowError(/Result was Err/);
  });
});

describe('trySync', () => {
  it('wraps a successful function in Ok', () => {
    const result = trySync(() => JSON.parse('{"key": "value"}') as unknown);
    expect(result).toEqual(ok({ key: 'value' }));
  });

  it('wraps a thrown Error in Err', () => {
    const result = trySync(() => JSON.parse('{invalid}') as unknown);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  it('wraps a thrown non-Error in Err as an Error instance', () => {
    const result = trySync(() => {
      throw 'string exception';
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe('string exception');
    }
  });

  it('does not catch if the function succeeds', () => {
    let sideEffect = false;
    trySync(() => {
      sideEffect = true;
      return 42;
    });
    expect(sideEffect).toBe(true);
  });
});

describe('tryAsync', () => {
  it('wraps a resolved promise in Ok', async () => {
    const result = await tryAsync(() => Promise.resolve(42));
    expect(result).toEqual(ok(42));
  });

  it('wraps a rejected promise (Error) in Err', async () => {
    const error = new Error('async failure');
    const result = await tryAsync(() => Promise.reject(error));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(error);
    }
  });

  it('wraps a rejected non-Error value in Err as an Error instance', async () => {
    const result = await tryAsync(() => Promise.reject('string rejection'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe('string rejection');
    }
  });
});
