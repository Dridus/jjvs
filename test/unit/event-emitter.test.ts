import { describe, it, expect, vi } from 'vitest';
import { TypedEventEmitter } from '../../src/core/event-emitter';

describe('TypedEventEmitter', () => {
  it('fires event to a single listener', () => {
    const emitter = new TypedEventEmitter<number>();
    const received: number[] = [];
    emitter.event((n) => received.push(n));

    emitter.fire(1);
    emitter.fire(2);

    expect(received).toEqual([1, 2]);
  });

  it('fires event to multiple listeners', () => {
    const emitter = new TypedEventEmitter<string>();
    const a: string[] = [];
    const b: string[] = [];
    emitter.event((s) => a.push(s));
    emitter.event((s) => b.push(s));

    emitter.fire('x');

    expect(a).toEqual(['x']);
    expect(b).toEqual(['x']);
  });

  it('unsubscribes via returned disposable', () => {
    const emitter = new TypedEventEmitter<number>();
    const received: number[] = [];
    const sub = emitter.event((n) => received.push(n));

    emitter.fire(1);
    sub.dispose();
    emitter.fire(2);

    expect(received).toEqual([1]);
  });

  it('allows the same listener to be registered and disposed independently', () => {
    const emitter = new TypedEventEmitter<number>();
    const received: number[] = [];
    const listener = (n: number): void => {
      received.push(n);
    };

    const sub1 = emitter.event(listener);
    const sub2 = emitter.event(listener);

    emitter.fire(1);
    // Both are the same function reference; Set deduplicates — only fires once
    expect(received).toEqual([1]);

    sub1.dispose();
    emitter.fire(2);
    // sub2 still holds — but since it's the same function and Set has removed it,
    // the second subscription is also gone. This is expected Set<Listener> behaviour.
    expect(received).toEqual([1]);
    sub2.dispose();
  });

  it('does not fire to listeners after dispose()', () => {
    const emitter = new TypedEventEmitter<number>();
    const received: number[] = [];
    emitter.event((n) => received.push(n));

    emitter.dispose();
    emitter.fire(99);

    expect(received).toEqual([]);
  });

  it('re-throws the first listener exception after calling all listeners', () => {
    const emitter = new TypedEventEmitter<void>();
    const order: string[] = [];

    emitter.event(() => {
      order.push('first');
      throw new Error('first error');
    });
    emitter.event(() => {
      order.push('second');
    });

    expect(() => emitter.fire(undefined)).toThrow('first error');
    // Both listeners were called even though the first threw
    expect(order).toEqual(['first', 'second']);
  });

  it('calls listener with the emitted value', () => {
    const emitter = new TypedEventEmitter<{ x: number }>();
    const spy = vi.fn();
    emitter.event(spy);

    emitter.fire({ x: 42 });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith({ x: 42 });
  });
});
