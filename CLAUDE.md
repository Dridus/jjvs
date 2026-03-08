# jjvs Development Guide

This file is the authoritative source of project conventions, principles, and constraints.
It applies equally to human contributors and AI agents (Cursor, Claude, etc.).
Read it in full before starting any development work.

---

## Priorities

In order of precedence when trade-offs arise:

1. **Correctness over speed** — a slow, correct extension is better than a fast, buggy one
2. **Clarity over cleverness** — code should be readable without deep knowledge of the codebase
3. **Testability over convenience** — design choices that make testing harder are design smells

---

## Verification Principles

These apply especially to AI-assisted development, where hallucination of version numbers,
API shapes, and feature availability is a real risk.

- **Verify claims from primary sources.** Never trust blog posts, forum discussions, or web
  search summaries for version numbers, API availability, or compatibility claims. Check
  actual binaries (`product.json`), official changelogs, or `.d.ts` type definitions.
  When a version or capability claim is added to the codebase (in code, comments, or docs),
  cite the primary source.

- **Understand the wrapped tool before designing abstractions.** Before building any layer
  that wraps jj CLI output, run the actual commands against a real repo and inspect the real
  output. Before using a VSCode API, read the `.d.ts` type definitions, not just tutorials.
  Before adopting a third-party library, read its type signatures or source.

- **Research prior art before building.** Check how jjui, existing jj extensions (jjk, JJ View),
  and VSCode's built-in git extension handle similar problems. Attribute and reuse (with license
  compliance) rather than reinventing.

- **Test deserializers against real jj output.** Capture actual jj command output as test
  fixtures. Document which jj version produced each fixture. When jj releases a new version,
  re-capture fixtures and verify deserializers still work.

---

## Architecture Rules

### The core/vscode boundary is a hard constraint

`src/core/` has **zero** VSCode imports. This is enforced by an ESLint rule that fails the
build on violations. Do not weaken or bypass this rule.

The reason: all logic in `src/core/` must be unit-testable with vitest, which runs in a pure
Node.js environment with no VSCode extension host.

### Result in core, user-facing errors in vscode

Core functions return `Result<T, E>`. The VSCode layer (`src/vscode/`) unwraps Results via a
centralized adapter (`CommandService`) that converts errors into notifications, output channel
logs, or actionable quick-fix messages.

**Never throw exceptions in `src/core/`.** If a function can fail, it returns `Result<T, E>`.

### Multi-repo by default

`RepositoryState` is per-repository. `RepositoryManager` handles discovery and lifecycle.
Never use module-level singletons for repository state. This design ensures multi-root
workspace support without a painful refactor later.

### Structured output first

Use `json()` templates for jj commands that support `-T`. Fallback text parsers only for
commands that don't (e.g., `jj status`). When jj adds `-T` support to a new command,
migrate the corresponding deserializer from text to JSON.

### Commands go through CommandService

All user-facing commands are registered via `CommandService`, which handles:
- Progress indication for long-running operations
- Error display and logging
- Post-command refresh
- Command serialization (see concurrency rules below)

**Never call jj directly from a command handler or tree provider.**

### Self-command suppression for file watching

The file watcher ignores FS events during extension-initiated jj commands to prevent
feedback loops. This is **not optional** — every code path that invokes jj must use
the suppression guard.

### Terminal commands are a shell surface

`terminal.sendText()` sends text to a shell interpreter, unlike `spawn()` which bypasses
the shell. Any value interpolated into a `sendText` call must be shell-escaped. Use the
`shellQuote` utility (`src/vscode/shell-quote.ts`) for paths and identifiers. Never
interpolate user-provided free-form text into `sendText`.

---

## TypeScript Rules

- `strict: true` in tsconfig. No exceptions.
- No `any`. If you truly cannot type something, use `unknown` and narrow it explicitly.
- No type assertions (`as`) unless accompanied by an adjacent comment explaining why the
  assertion is safe (e.g., `// safe: the JSON schema guarantees this shape`).
- Prefer `readonly` on properties and parameters wherever practical.
- Exhaustive `switch` statements: add a `default` branch that assigns to `never` to get
  a compile error when a new enum variant is not handled.
- No abbreviations in identifiers. Use `revision` not `rev`, `bookmark` not `bm`,
  `description` not `desc`, `repository` not `repo` — **except** where jj itself uses
  the short form (e.g., `revset`, `oplog`, `changeId`).
- Prefer named exports over default exports.
- All public-facing types, interfaces, and functions must have JSDoc comments.

---

## Error Handling and Resilience

- **Graceful degradation.** If jj returns unexpected output, degrade gracefully (show partial
  data, log a warning to the output channel) rather than crashing or showing empty UI. If a
  feature requires a jj version newer than the user's installed version, disable that feature
  with an explanatory message rather than erroring.

- **Validate external data at trust boundaries.** Data from external processes
  (jj CLI output, configuration files, webview messages) must be validated before
  use. Use zod/mini schemas to validate JSON-parsed data; do not rely on `as T`
  type assertions alone. When validation fails, degrade gracefully (skip the
  malformed record, log a warning) rather than propagating undefined field accesses.

- **Cancellation is first-class.** Long-running jj commands must support cancellation via
  `AbortController`. The runner, CLI layer, and CommandService all propagate cancellation.
  A cancelled command is not an error — it must produce no side effects and no user-visible
  error message.

- **Version-gated capabilities.** Use the capability flags in `src/core/jj-version.ts` to
  conditionally enable features. When adding a new jj command usage, document the minimum jj
  version that supports it in a comment next to the capability flag.

---

## Concurrency and Command Serialization

jj uses workspace-level locking. The extension must **serialize jj command execution per
repository** via a command queue owned by `CommandService`.

- Read-only commands (`jj log`, `jj status`, `jj show`) may run concurrently with each other,
  but must wait for any in-flight mutating command to complete.
- Mutating commands (`jj new`, `jj rebase`, `jj squash`, etc.) are fully serialized with
  respect to each other and to in-flight read commands.
- If a user triggers an interactive command while another is running, show
  "A jj operation is in progress" rather than queuing it.
- Never fire-and-forget multiple commands concurrently against the same repository.

**v1 implementation note:** The current `CommandService` serializes mutating commands only.
Read-only queries (`jj log`, `jj status`, `jj diff`) run independently and rely on jj's own
workspace locking for safety. A future enhancement could add read/write awareness to avoid
stale reads during mutations, but jj's locking makes this a correctness-of-display issue,
not a data-integrity issue.

---

## Disposable Discipline

Every event listener, file watcher, webview panel, status bar item, tree view registration,
and command registration must be tracked as a `vscode.Disposable` and cleaned up on deactivation.

Use a `DisposableStore` utility class (an array of disposables with a single `dispose()` method)
rather than tracking individual disposables. Each service class owns a `DisposableStore` and
registers it with the extension context.

Forgetting to dispose a resource is a memory/CPU leak. The `DisposableStore` pattern makes
leaks structurally hard to introduce.

---

## Debounced Refresh

Multiple rapid file system events or sequential user commands must not trigger N separate
refreshes. `RepositoryState` implements a debounce/coalesce layer that batches changes into
a single refresh cycle (100ms debounce window).

After a mutating jj command completes, trigger one explicit refresh rather than relying on
the file watcher (which may fire multiple times as `op_heads/` is updated).

Debounce revset input field changes (300ms) to avoid running `jj log` on every keystroke.

---

## When-Clause Context Keys

Context keys drive menu visibility and command enablement. They are set via
`vscode.commands.executeCommand('setContext', key, value)`. All context keys used by
jjvs are documented here:

| Key | Type | Description |
|-----|------|-------------|
| `jjvs:hasRepository` | boolean | At least one jj repository is detected in the workspace |
| `jjvs:isColocated` | boolean | The active repository is a colocated jj+git repo |
| `jjvs:hasConflicts` | boolean | The active repository has conflicted revisions |
| `jjvs:revisionSelected` | boolean | A revision is selected in the revision tree |
| `jjvs:fileSelected` | boolean | A file is selected in the details view |

Rules:
- Never use context keys for state that changes rapidly (e.g., "is refreshing").
- Only set context keys for stable UI state that drives menu/command visibility.

---

## Webview Rules

### Security

All webviews must:
- Set a Content Security Policy restricting scripts to nonce-based inline scripts and the
  webview's own resource URI. No external resource loading.
- Communicate exclusively via `postMessage` / `onDidReceiveMessage`.
- Define a typed message protocol (discriminated union) shared between extension host and
  webview code. Both sides use the same type definitions.
- Never use `eval()` or inline event handlers.

### Theming

Svelte webview components must use VSCode CSS custom properties for all colors and fonts:
```css
background: var(--vscode-editor-background);
color: var(--vscode-editor-foreground);
border-color: var(--vscode-panel-border);
```

Never hardcode colors. VSCode injects these variables automatically, giving correct
behavior across all themes (light, dark, high contrast) with zero extra code.

Test webviews in at least three themes: a light theme, a dark theme, and high contrast.

---

## Performance Boundaries

- Lazy-load revisions in batches (`jjvs.logLimit`, default 50). The tree view uses
  "Load more..." nodes rather than loading everything at once.
- Show progress indicators for any jj command taking > 500ms.
- The webview graph should support virtual scrolling for DAGs with > 500 nodes.
- Debounce revset input (300ms) to avoid unnecessary `jj log` invocations.

---

## Accessibility

- Webview interactive elements must have ARIA labels and roles.
- Keyboard navigation (Tab, Enter, Escape, arrow keys) must work for all interactive
  webview elements.
- Tree items must have meaningful `accessibilityInformation` for screen readers.
- All icon-only buttons must have `tooltip` set.
- Color must never be the only indicator of state (e.g., conflict state requires both
  an icon and a color).

---

## Testing Rules

- Every deserializer and core utility must have unit tests in `test/unit/`.
- Test files mirror the `src/core/` structure (e.g., `src/core/parsers/log.ts` →
  `test/unit/parsers/log.test.ts`).
- Use vitest `describe`/`it` blocks with names that read as specifications:
  `it('returns an error result when the process exits with a non-zero code')`.
- Integration tests use real jj repos created in temp directories; they do not use mocks.
- Test fixtures are real jj output captured from actual commands, with the jj version
  annotated in a comment at the top of the fixture file.
- Use vitest snapshot tests for deserializer output to catch format regressions.

---

## Code Style

- ESLint 9+ flat config (`eslint.config.mjs`) + Prettier enforced. CI fails on violations.
- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- No comments that narrate what code does. Comments explain **why** or document
  non-obvious constraints or trade-offs.
- When porting code from jjui, add an attribution comment at the top of the file:
  ```
  // Ported from jjui (MIT License, Ibrahim Dursun): internal/ui/revset/function_source.go
  ```

---

## Logging Strategy

- Log all jj command invocations with arguments at `debug` level.
- Log slow commands (> 1s) at `info` level with their duration.
- Log the detected jj version, repository path(s), and colocated/native status at
  `info` level on activation.
- Never log file contents or any data that could be sensitive.
- The output channel is controlled by `jjvs.logLevel` (default: `info`).

---

## User Documentation

User-facing documentation lives in `docs/` and follows the [Diataxis framework](https://diataxis.fr/).
The four documentation types — tutorials, how-to guides, reference, and troubleshooting — serve
different reader needs and must not be mixed within a single document.

### Structure

| Directory | Type | Purpose |
|-----------|------|---------|
| `docs/getting-started/` | Tutorial | Walk new users from installation to first workflow |
| `docs/guides/` | How-to | Task-oriented guides for specific workflows |
| `docs/reference/` | Reference | Exhaustive lookup tables for commands, settings, keybindings |

### Rules

- **Ship docs with features.** Every implementation phase that adds user-facing functionality
  must include documentation. Never merge a feature without its corresponding docs.
- **Accuracy over completeness.** A short, accurate document beats a long one that describes
  behavior the extension doesn't have. Never document features from future phases.
- **Reference pages stay in sync with `package.json`.** When commands or settings are added
  or changed, update both `package.json` and the corresponding reference page in the same phase.
  The commands reference (`docs/reference/commands.md`) and settings reference
  (`docs/reference/settings.md`) must be verifiable against the extension manifest.
- **Screenshots use real repos.** All screenshots come from running the extension against a
  real jj repository in the Extension Development Host. Annotate each screenshot with the
  jj version and repository state that produced it.
- **Cross-link between types.** Guides should link to reference pages for exhaustive details.
  Getting-started pages should link to guides for deeper dives. Reference pages should link
  back to the guide that explains the feature in context.
- **Plain Markdown, no build step.** Documentation is plain `.md` files. No static site
  generator is required. The structure supports adding one later without reorganizing content.
- **No future tense for unshipped features.** If a page references a feature not yet
  implemented, omit that section entirely (use `<!-- TODO(phase-N): add section on X -->`
  as a placeholder that won't render for readers).

---

## No Telemetry

jjvs collects no telemetry, analytics, usage data, crash reports, or any other information.
This is a project principle. Do not add any form of tracking, even optional.

---

## Incremental Delivery

Each phase must leave the extension in a shippable (if incomplete) state. Never leave
the extension broken between phases. Features not yet implemented must be absent from
the UI, not present but non-functional. Use when-clause context keys and version-gated
capability flags to hide incomplete features.

---

## Minimum Supported Versions

| Component | Minimum | Rationale |
|-----------|---------|-----------|
| VSCode | 1.105.0 | Targets Cursor 2.6.x compatibility; verify from `product.json` |
| jj | 0.25.0 | Required for `json()` template function |
| Node.js | 22.x | Matches Nix flake devShell |

---

## Running Commands

The project uses a Nix flake for the dev environment. The fastest way to run project commands
is via direnv, which caches the environment after the first `nix develop`:

```bash
# Load the environment once (subsequent invocations use direnv's cache)
eval $(direnv export zsh)

# Then run any project command directly
pnpm build
pnpm test:unit
pnpm lint
pnpm typecheck
```

Always prefix shell commands with `eval $(direnv export zsh) &&` when invoking them from
outside an already-loaded environment (e.g., from a script or CI step):

```bash
eval $(direnv export zsh) && pnpm build && pnpm test:unit && pnpm lint && pnpm typecheck
```

Avoid `nix develop --command ...` for repeated invocations — it re-evaluates the flake each
time and is significantly slower.

---

## Development Processes

### Before starting any phase

1. Read this file (`CLAUDE.md`) in full.
2. Read the implementation plan to understand the current phase's scope and dependencies.
3. Verify prerequisite phases are complete:
   ```bash
   eval $(direnv export zsh) && pnpm build && pnpm test:unit
   ```
4. If the phase introduces a new jj command, run that command against a real jj repo and
   inspect the actual output before writing any code.

### During implementation

1. Write types and interfaces first, then implementations, then tests.
2. Run `eval $(direnv export zsh) && pnpm build` after creating each new file to catch
   import and type errors early.
3. When adding a new jj command: add to the `JjCli` interface first → implement in the
   concrete class → write a deserializer → write tests.
4. When adding a new VSCode contribution (command, view, menu item): update `package.json`
   contribution points → implement the handler → register in extension activation.
   All three steps must happen together.
5. Never leave `// TODO` without a phase reference (e.g., `// TODO(phase-7b): implement split`).

### After completing a phase

1. Run the full verification suite:
   ```bash
   eval $(direnv export zsh) && pnpm build && pnpm test:unit && pnpm lint && pnpm typecheck
   ```
2. Manually test the extension in the Extension Development Host (F5) against a real jj repo.
3. Review all new files against this document's rules.
4. Update this file if new patterns or conventions were established.
5. Write or update user documentation in `docs/` for any new user-facing functionality.
   Verify that `docs/reference/commands.md` and `docs/reference/settings.md` are in sync
   with `package.json` contribution points.

### When resolving design ambiguity

1. Check how jjui handles it first. If sound, port it (with attribution).
2. Check how VSCode's built-in git extension handles similar UX. Users have git muscle memory.
3. If neither provides guidance, prefer the simpler design.
4. Document non-obvious decisions in the plan's "Key Design Decisions" section.

---

## Tools Reference

| Tool | Purpose |
|------|---------|
| pnpm | Package management |
| esbuild + esbuild-svelte | Bundling (extension host + webviews) |
| vitest | Unit tests (`src/core/`) |
| @vscode/test-electron + mocha | Integration tests |
| Nix flake | Reproducible dev environment |
| vsce | Extension packaging and publishing |
