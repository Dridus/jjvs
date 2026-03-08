---
name: Comprehensive Code Review
overview: A prioritized review of the jjvs codebase across security, correctness, usability, performance, and code quality dimensions, producing an actionable correction plan organized by severity.
todos:
  - id: fix-deserializer-robustness
    content: Add zod/mini runtime schema validation in log.ts and op-log.ts deserializers; fix misleading comments (Issues 1.1, 4.1)
    status: in_progress
  - id: fix-sendtext-injection
    content: Shell-escape jjPath in conflict-commands.ts sendText call; add CLAUDE.md terminal safety principle (Issues 1.2, A)
    status: pending
  - id: add-claudemd-validation-principle
    content: Add deserialization validation guidance to CLAUDE.md (Issue 1.3)
    status: pending
  - id: add-pnpm-audit-ci
    content: Add pnpm audit to CI pipeline (Issue 1.4)
    status: pending
  - id: fix-scm-describe-commandservice
    content: Route SCM executeDescribe through CommandService (Issue 2.1)
    status: pending
  - id: fix-revset-debounce
    content: Add 300ms debounce to revset input (Issue 2.2)
    status: pending
  - id: fix-graph-subscription-leak
    content: Track and dispose graph repo subscriptions on workspace change (Issue 2.3)
    status: pending
  - id: fix-conflict-listener-dispose
    content: Add conflict terminal listener to context.subscriptions (Issue 2.4)
    status: pending
  - id: fix-as-assertions
    content: Add instanceof guards or safety comments to as assertions in extension.ts (Issue 2.5)
    status: pending
  - id: fix-async-stat
    content: Replace fs.statSync with async stat in file-watcher.ts polling (Issue 3.1)
    status: pending
  - id: implement-rw-serialization
    content: Document or implement read/write command serialization (Issue 3.2)
    status: pending
  - id: decompose-graph-svelte
    content: Extract graph App.svelte into sub-components (Issue 3.3) -- recommend Opus-class model for this item
    status: completed
  - id: fix-packaging-exclusions
    content: Add docs/ and coverage/ to .vscodeignore (Issues 4.3, 4.4)
    status: pending
  - id: fix-readme-stale-text
    content: Remove stale phase references from README.md; update publisher/repo URL in package.json (Issues 4.5, 4.6, D)
    status: pending
  - id: add-snapshot-tests
    content: Add snapshot tests for status and bookmark deserializers (Issue 4.2)
    status: pending
isProject: false
---

# Comprehensive jjvs Code Review -- Correction Plan

## Decisions

- **Deserializer validation:** Use `zod/mini` (from `zod@^4`; already installed as `zod 4.3.6`).
- **Publisher:** `dridus` (registered at marketplace). Repo URL: `https://github.com/Dridus/jjvs`.
- **Scope:** All items included, no deferrals.

## Execution Order

Items are grouped into batches that can be parallelized internally. Batches are sequential because later batches depend on earlier ones (e.g., tests depend on code changes).

---

### Batch 1: Core security and correctness (highest priority)

#### 1. Deserializer robustness with zod/mini (Issues 1.1, 4.1)

**Files:** `[src/core/deserializers/log.ts](src/core/deserializers/log.ts)`, `[src/core/deserializers/op-log.ts](src/core/deserializers/op-log.ts)`

**Approach:**

- `pnpm add zod@^4` (zod was reverted out of `package.json`; needs to be re-installed)
- Define zod/mini schemas for `RawRevision` and `RawOperation` that mirror the existing interfaces
- Replace the `raw as RawRevision` / `raw as RawOperation` casts with `schema.safeParse(raw)`
- On parse failure: skip the line and continue (matching current graceful degradation intent)
- Remove the misleading comments about `?? fallbacks`
- Keep the `RawRevision` / `RawOperation` interfaces as `z.infer<typeof schema>` aliases

**log.ts schema sketch:**

```typescript
import * as z from 'zod/mini';

const RawIdentitySchema = z.object({
  name: z.string(),
  email: z.string(),
  timestamp: z.string(),
});

const RawParentCommitSchema = z.object({
  commit_id: z.string(),
  change_id: z.string(),
  parents: z.array(z.string()),
  description: z.string(),
  author: RawIdentitySchema,
  committer: RawIdentitySchema,
});

const RawLocalBookmarkSchema = z.object({
  name: z.string(),
  target: z.array(z.string()),
});

const RawRemoteBookmarkSchema = z.object({
  name: z.string(),
  remote: z.string(),
  target: z.array(z.string()),
  tracking_target: z.array(z.string()),
});

const RawTagSchema = z.object({
  name: z.string(),
  target: z.array(z.string()),
});

const RawRevisionSchema = z.object({
  changeId: z.string(),
  commitId: z.string(),
  description: z.string(),
  author: RawIdentitySchema,
  committer: RawIdentitySchema,
  empty: z.boolean(),
  conflict: z.boolean(),
  immutable: z.boolean(),
  workingCopy: z.boolean(),
  divergent: z.boolean(),
  parents: z.array(RawParentCommitSchema),
  localBookmarks: z.array(RawLocalBookmarkSchema),
  remoteBookmarks: z.array(RawRemoteBookmarkSchema),
  tags: z.array(RawTagSchema),
});
```

**op-log.ts schema sketch:**

```typescript
const RawOperationTimeSchema = z.object({
  start: z.string(),
  end: z.string(),
});

const RawOperationSchema = z.object({
  id: z.string(),
  description: z.string(),
  user: z.string(),
  time: RawOperationTimeSchema,
});
```

**Parse function change:**

```typescript
// Before:
revisions.push(rawRevisionToRevision(raw as RawRevision));

// After:
const parsed = RawRevisionSchema.safeParse(raw);
if (!parsed.success) continue;  // malformed shape; skip gracefully
revisions.push(rawRevisionToRevision(parsed.data));
```

**Tests:** Existing snapshot tests should pass unchanged (the schemas match current output). Add one test case per deserializer for malformed input to verify graceful skipping.

**Note:** zod is a runtime dependency (not devDependency) since it runs in the extension host. Install with `pnpm add zod@^4` (into `dependencies`). esbuild will bundle it into `dist/extension.js`.

#### 2. Shell-escape jjPath in sendText (Issues 1.2, A)

**File:** `[src/vscode/commands/conflict-commands.ts](src/vscode/commands/conflict-commands.ts)` (line 139)

**Approach:** Write a minimal shell-quoting helper (single-quote wrapping with interior quote escaping) and apply it to `jjPath`:

```typescript
// Before:
terminal.sendText(`${jjPath} resolve -r ${shortId}`);

// After:
terminal.sendText(`${shellQuote(jjPath)} resolve -r ${shortId}`);
```

The `shellQuote` function wraps the value in single quotes and escapes any interior single quotes (`'` -> `'\''`). `shortId` is hex-only by construction (substring of `changeId`) so it doesn't need quoting.

Place the helper in a small utility, e.g., `[src/vscode/shell-quote.ts](src/vscode/shell-quote.ts)`, or inline it if it's only used once.

**CLAUDE.md addition:** Add a principle under "Architecture Rules" after the "Self-command suppression" section:

> **Terminal commands are a shell surface.** `terminal.sendText()` sends text to
> a shell interpreter, unlike `spawn()` which bypasses the shell. Any value
> interpolated into a `sendText` call must be shell-escaped. Use the `shellQuote`
> utility for paths and identifiers. Never interpolate user-provided free-form
> text into `sendText`.

#### 3. CLAUDE.md deserialization validation principle (Issue 1.3)

**File:** `[CLAUDE.md](CLAUDE.md)`

Add under "Error Handling and Resilience," after the "Graceful degradation" bullet:

> **Validate external data at trust boundaries.** Data from external processes
> (jj CLI output, configuration files, webview messages) must be validated before
> use. Use zod/mini schemas to validate JSON-parsed data; do not rely on `as T`
> type assertions alone. When validation fails, degrade gracefully (skip the
> malformed record, log a warning) rather than propagating undefined field accesses.

#### 4. Add pnpm audit to CI (Issue 1.4)

**File:** `[.github/workflows/ci.yml](.github/workflows/ci.yml)`

Add a step after `pnpm install --frozen-lockfile`:

```yaml
- name: Audit dependencies
  run: pnpm audit --audit-level=high
```

Use `continue-on-error: true` initially if there are existing advisories from transitive deps that need triage, or fail hard if clean.

---

### Batch 2: Usability and correctness fixes

#### 5. Route SCM describe through CommandService (Issue 2.1)

**File:** `[src/vscode/scm/provider.ts](src/vscode/scm/provider.ts)` (lines 154-173)

**Approach:**

- Add `CommandService` and `FileWatcher` as constructor parameters to `JjScmProvider`
- Replace the direct `repository.describe()` call with `commandService.run()`:

```typescript
async executeDescribe(): Promise<void> {
  const text = this.sourceControl.inputBox.value.trim();
  if (text === '') return;

  const success = await this.commandService.run(
    { title: 'Describe working copy' },
    async (signal) => this.repository.describe({ description: text }, signal),
  );

  if (success) {
    this._suppressNextInputUpdate = true;
    this.sourceControl.inputBox.value = '';
  }
}
```

- Update the constructor call in `[extension.ts](src/vscode/extension.ts)` to pass the CommandService and FileWatcher
- `repository.describe()` may need to accept an `AbortSignal` if it doesn't already; check and propagate

#### 6. Add 300ms debounce to revset input (Issue 2.2)

**File:** `[src/vscode/views/revisions/revset-input.ts](src/vscode/views/revisions/revset-input.ts)`

**Approach:** Add a debounce timer around the `onDidChangeValue` handler that triggers `refreshItems()`:

```typescript
private _debounceTimer: ReturnType<typeof setTimeout> | undefined;

// In the onDidChangeValue handler:
clearTimeout(this._debounceTimer);
this._debounceTimer = setTimeout(() => {
  this.refreshItems();
}, 300);
```

Clear the timer in `dispose()`.

#### 7. Fix graph subscription leak (Issue 2.3)

**File:** `[src/vscode/extension.ts](src/vscode/extension.ts)` (lines 918-931)

**Approach:** Track graph-related repo subscriptions in a `DisposableStore` and dispose before re-subscribing:

```typescript
const graphRepoSubscriptions = new DisposableStore();
context.subscriptions.push(graphRepoSubscriptions);

function subscribeGraphToRepos(): void {
  graphRepoSubscriptions.dispose();  // clear previous subscriptions
  for (const repo of repositoryManager.repositories) {
    graphRepoSubscriptions.add(repo.onDidChange(() => syncGraph()));
  }
}

subscribeGraphToRepos();

context.subscriptions.push(
  repositoryManager.onDidChangeRepositories(() => {
    syncGraph();
    subscribeGraphToRepos();
  }),
);
```

Note: `DisposableStore.dispose()` must clear its internal array without disposing the store itself. Check if the existing `DisposableStore` implementation supports re-use after dispose, or use a fresh instance each time.

#### 8. Fix conflict terminal listener disposal (Issue 2.4)

**File:** `[src/vscode/commands/conflict-commands.ts](src/vscode/commands/conflict-commands.ts)` (lines 144-149)

**Approach:** The `ConflictCommandContext` needs access to `context.subscriptions` or a `DisposableStore`. Add it to the context type:

```typescript
export interface ConflictCommandContext {
  readonly service: CommandService;
  readonly cli: JjCli;
  readonly repository: RepositoryState;
  readonly disposables: vscode.Disposable[];  // or DisposableStore
}
```

Then push the listener:

```typescript
const closeListener = vscode.window.onDidCloseTerminal((closedTerminal) => {
  if (closedTerminal === terminal) {
    closeListener.dispose();
    void ctx.repository.refresh();
  }
});
ctx.disposables.push(closeListener);
```

Update the context creation in `extension.ts` to pass `context.subscriptions`.

#### 9. Fix `as` assertions in extension.ts (Issue 2.5)

**File:** `[src/vscode/extension.ts](src/vscode/extension.ts)` (lines 550, 580, 595, 883, 939)

**Approach:** Replace `'revision' in selected` + `as RevisionTreeItem` with `instanceof`:

```typescript
// Before:
const isRevisionItem =
  selected !== undefined && 'revision' in selected && selected.revision !== undefined;
const selectedRevision = isRevisionItem ? (selected as RevisionTreeItem).revision : null;

// After:
const selectedRevision =
  selected instanceof RevisionTreeItem ? selected.revision : null;
```

Apply this pattern at all 5 locations. Import `RevisionTreeItem` if not already imported at those points.

---

### Batch 3: Performance fixes

#### 10. Replace fs.statSync with async stat (Issue 3.1)

**File:** `[src/vscode/file-watcher.ts](src/vscode/file-watcher.ts)`

Find the `pollForChanges` method and replace `fs.statSync(opHeadsPath)` with `fs.promises.stat(opHeadsPath)`. Make the method `async` if it isn't already. Ensure the polling interval timer handles the async nature correctly (avoid overlapping polls).

#### 11. Document read/write serialization stance (Issue 3.2)

**File:** `[CLAUDE.md](CLAUDE.md)`

The current `_isRunning` boolean in CommandService only serializes mutating commands. Read-only commands go through `RepositoryState` methods directly. jj has its own workspace lock that prevents corruption from concurrent reads+writes.

**Approach:** Add a clarifying note to the "Concurrency and Command Serialization" section:

> **v1 implementation note:** The current CommandService serializes mutating
> commands only. Read-only queries (log, status, diff) run independently and
> rely on jj's own workspace locking for safety. A future enhancement could
> add read/write awareness to avoid stale reads during mutations, but jj's
> locking makes this a correctness-of-display issue, not a data-integrity issue.

#### 12. Decompose graph App.svelte (Issue 3.3)

**Recommend Opus-class model for this item.**

**File:** `[webview-ui/graph/App.svelte](webview-ui/graph/App.svelte)` (1,210 lines)

**Approach:** Extract into sub-components in `webview-ui/graph/components/`:

- `GraphNode.svelte` -- single node rendering (circle, label, bookmarks)
- `GraphEdge.svelte` -- SVG edge/path rendering
- `ContextMenu.svelte` -- right-click context menu
- `DragOverlay.svelte` -- drag-rebase visual feedback

Keep `App.svelte` as the orchestrator (state, message protocol, zoom/pan). Each sub-component receives props and emits events.

This is the largest single change. Read the full `App.svelte` to identify clean extraction boundaries before starting.

---

### Batch 4: Documentation, testing, and packaging

#### 13. Fix .vscodeignore (Issues 4.3, 4.4)

**File:** `[.vscodeignore](.vscodeignore)`

Add these lines:

```
docs/
coverage/
.nyc_output/
```

#### 14. Fix README stale text and marketplace metadata (Issues 4.5, 4.6, D)

**Files:** `[README.md](README.md)`, `[package.json](package.json)`

README changes:

- Line 30: Remove "(coming in Phase 14)" from the revision graph bullet
- Line 131: Change to `See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.` (remove the Phase 15 note)

package.json changes:

- `"publisher": "dridus"`
- `"repository": { "type": "git", "url": "https://github.com/Dridus/jjvs" }`

#### 15. Add snapshot tests for status and bookmark deserializers (Issue 4.2)

**Files:** `[test/unit/deserializers/status.test.ts](test/unit/deserializers/status.test.ts)`, `[test/unit/deserializers/bookmark.test.ts](test/unit/deserializers/bookmark.test.ts)`

Add `expect(result).toMatchSnapshot()` assertions to existing test cases, matching the pattern used by `log.test.ts` and `op-log.test.ts`. Also add a test for malformed input to each deserializer that was updated with zod validation.

---

### Post-execution verification

After all changes:

```bash
eval $(direnv export zsh) && pnpm build && pnpm test:unit && pnpm lint && pnpm typecheck
```

Update any failing snapshots caused by the zod migration (schema types appearing in error messages, etc.). Verify the extension loads in the Extension Development Host (F5).
