/**
 * Minimal typed event emitter for `src/core/`.
 *
 * This is a pure TypeScript implementation that does not depend on Node.js's
 * built-in `events` module or on VSCode's `EventEmitter`. It is intentionally
 * minimal: one emitter per event type, no wildcard listeners, no error events.
 *
 * The listener registration API matches the VSCode event pattern:
 * `emitter.event(listener)` returns a `Disposable` that unregisters the listener.
 * This allows listeners to be added to a `DisposableStore` for automatic cleanup.
 *
 * Usage:
 * ```typescript
 * const emitter = new TypedEventEmitter<string>();
 * const subscription = emitter.event((msg) => console.log(msg));
 * emitter.fire('hello');
 * subscription.dispose(); // unregisters the listener
 * ```
 */

/** Minimal disposable interface — compatible with `vscode.Disposable`. */
export interface Disposable {
  dispose(): void;
}

/** A typed event listener function. */
export type Listener<T> = (event: T) => void;

/**
 * Typed single-event emitter.
 *
 * Emit events with `fire(event)`. Subscribe with `event(listener)`.
 * Implements `Disposable` for cleanup in a `DisposableStore`.
 */
export class TypedEventEmitter<T> implements Disposable {
  private readonly listeners = new Set<Listener<T>>();

  /**
   * Subscribe to events.
   *
   * @param listener Function called with each emitted value.
   * @returns A disposable that removes the subscription when disposed.
   */
  readonly event: (listener: Listener<T>) => Disposable = (listener) => {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  };

  /**
   * Fire an event, synchronously calling all registered listeners.
   *
   * Exceptions thrown by listeners are caught and re-thrown after all listeners
   * have been called, to prevent one bad listener from blocking others.
   */
  fire(event: T): void {
    let firstError: unknown = undefined;
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        if (firstError === undefined) {
          firstError = error;
        }
      }
    }
    if (firstError !== undefined) {
      throw firstError;
    }
  }

  /** Remove all listeners. */
  dispose(): void {
    this.listeners.clear();
  }
}
