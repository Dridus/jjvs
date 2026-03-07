/**
 * Structured logger wrapping a VSCode `LogOutputChannel`.
 *
 * `OutputChannelLogger` provides a dependency-injectable logging interface
 * usable both in the VSCode layer (where `vscode.LogOutputChannel` is
 * available) and in unit tests (where a no-op or spy implementation can be
 * injected instead).
 *
 * ## Log levels
 *
 * The level order follows VSCode's built-in `LogLevel` enum:
 * `Off < Trace < Debug < Info < Warning < Error`
 *
 * The channel's level is controlled by the `jjvs.logLevel` setting via
 * `ConfigService.onDidChangeConfig`. Changing it takes effect immediately
 * without restarting the extension.
 */

import * as vscode from 'vscode';

// ─── Logger interface ─────────────────────────────────────────────────────────

/**
 * Minimal structured logging interface.
 *
 * All jjvs components accept this interface rather than the concrete class, so
 * they can be tested with a lightweight stub.
 */
export interface Logger {
  trace(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

// ─── Level mapping ────────────────────────────────────────────────────────────

/** Maps the `jjvs.logLevel` string setting to a VSCode `LogLevel`. */
export function logLevelFromString(level: string): vscode.LogLevel {
  switch (level) {
    case 'off':
      return vscode.LogLevel.Off;
    case 'error':
      return vscode.LogLevel.Error;
    case 'warn':
      return vscode.LogLevel.Warning;
    case 'info':
      return vscode.LogLevel.Info;
    case 'debug':
      return vscode.LogLevel.Debug;
    case 'trace':
      return vscode.LogLevel.Trace;
    default:
      return vscode.LogLevel.Info;
  }
}

// ─── OutputChannelLogger ──────────────────────────────────────────────────────

/**
 * VSCode `LogOutputChannel` wrapper that implements `Logger`.
 *
 * Manages a single named output channel ("Jujutsu") with structured log
 * output. Callers can pass additional arguments which are JSON-serialised and
 * appended to the message, useful for structured context (e.g.,
 * `logger.debug('Running command', { args, cwd })`).
 */
export class OutputChannelLogger implements Logger, vscode.Disposable {
  private readonly channel: vscode.LogOutputChannel;

  constructor(channel: vscode.LogOutputChannel) {
    this.channel = channel;
  }

  trace(message: string, ...args: unknown[]): void {
    this.channel.trace(format(message, args));
  }

  debug(message: string, ...args: unknown[]): void {
    this.channel.debug(format(message, args));
  }

  info(message: string, ...args: unknown[]): void {
    this.channel.info(format(message, args));
  }

  warn(message: string, ...args: unknown[]): void {
    this.channel.warn(format(message, args));
  }

  error(message: string, ...args: unknown[]): void {
    this.channel.error(format(message, args));
  }

  /** Expose the underlying channel for `context.subscriptions.push()`. */
  get disposable(): vscode.Disposable {
    return this.channel;
  }

  dispose(): void {
    this.channel.dispose();
  }
}

// ─── No-op logger (for tests / graceful degradation) ─────────────────────────

/** A logger implementation that discards all output. Useful in tests. */
export class NoOpLogger implements Logger {
  trace(_message: string, ..._args: unknown[]): void {}
  debug(_message: string, ..._args: unknown[]): void {}
  info(_message: string, ..._args: unknown[]): void {}
  warn(_message: string, ..._args: unknown[]): void {}
  error(_message: string, ..._args: unknown[]): void {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function format(message: string, args: unknown[]): string {
  if (args.length === 0) {
    return message;
  }
  const parts = args.map((a) => {
    if (typeof a === 'string') return a;
    try {
      return JSON.stringify(a);
    } catch {
      return String(a);
    }
  });
  return `${message} ${parts.join(' ')}`;
}
