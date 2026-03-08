# Contributing to jjvs

Thank you for your interest in contributing to **jjvs** — the open-source
Jujutsu extension for VSCode and Cursor. This document explains how to set up
the development environment, run the tests, and submit a pull request.

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| jj | ≥ 0.25.0 | Required for `json()` template support |
| VSCode or Cursor | ≥ 1.105.0 | For running the Extension Development Host |
| Node.js | 22.x | Managed by Nix flake; see below |
| pnpm | 10.x | Managed by Nix flake |
| Nix | Any | Optional but recommended (provides a reproducible env) |

## Setting up the development environment

### Recommended: Nix + direnv

The project ships a `flake.nix` that pins Node.js 22, pnpm, and vsce to
exact versions. If you have Nix and direnv installed:

```bash
# One-time: allow direnv for this directory
direnv allow

# The environment is now active. Install npm dependencies:
pnpm install
```

Subsequent shell sessions in this directory will automatically load the
environment from direnv's cache (no Nix re-evaluation needed).

### Without Nix

Install Node.js 22.x and pnpm 10.x manually, then:

```bash
pnpm install
```

## Building

```bash
# Production build (outputs to dist/)
pnpm build

# Watch mode — rebuilds on file changes
pnpm build:watch
```

The build uses esbuild with the esbuild-svelte plugin. Both the extension
host (`src/vscode/extension.ts`) and the webview apps (`webview-ui/`) are
bundled in a single pass.

## Running the extension

Press **F5** in VSCode (or use **Run → Start Debugging**) to launch the
Extension Development Host. This opens a second VSCode window with jjvs
loaded against a real jj repository.

For the best experience, open a directory that contains a `.jj/` folder so
the extension activates automatically.

## Tests

### Unit tests

Unit tests live in `test/unit/` and use [vitest](https://vitest.dev/). They
cover all `src/core/` logic and run in pure Node.js — no VSCode or jj binary
required.

```bash
pnpm test:unit

# Watch mode
pnpm test:unit:watch
```

Unit tests must stay fast (< 2s total) and must not spawn real processes.
Use the mock `JjRunner` patterns from `test/unit/jj-cli.test.ts` for any test
that exercises CLI code.

### Integration tests

Integration tests live in `test/integration/` and run inside a real VSCode
Extension Development Host via `@vscode/test-electron`. They require VSCode
to be available (it is downloaded automatically by the test runner).

```bash
pnpm test:integration
```

Tests that require a real jj binary skip gracefully if jj is not found on
PATH. To run the full suite locally, ensure `jj` is on your PATH.

**On Linux**, the Extension Development Host requires a display server. Run
with `xvfb-run -a pnpm test:integration` or ensure `$DISPLAY` is set.

### Linting and type checking

```bash
pnpm lint          # ESLint
pnpm lint:fix      # ESLint with auto-fix
pnpm format        # Prettier write
pnpm format:check  # Prettier check (used in CI)
pnpm typecheck     # tsc --noEmit for both src/ and test/
```

### Full verification (same as CI)

```bash
pnpm build && pnpm test:unit && pnpm lint && pnpm typecheck
```

## Exploring jj CLI output

The `scripts/jj-sandbox.sh` script creates an isolated jj repository in a
temporary directory and runs commands against it safely, with guaranteed
cleanup on exit and guards that prevent it from accidentally operating in the
live project tree.

```bash
# Inspect what a fresh jj git init creates:
bash scripts/jj-sandbox.sh -- jj log

# Explore interactively:
bash scripts/jj-sandbox.sh

# Keep the temp directory after exit (for manual inspection):
bash scripts/jj-sandbox.sh --keep -- jj log --no-graph -T 'change_id ++ "\n"'
```

Use this script when adding support for new jj commands or capturing test
fixtures. Always run the real jj command before writing any deserialization
code. See **CLAUDE.md § Verification Principles** for the rationale.

## Project conventions

Please read **CLAUDE.md** before contributing. It is the authoritative
source of project conventions and applies equally to human contributors and
AI agents. Key highlights:

- **`src/core/` has zero VSCode imports** — enforced by ESLint. All core logic
  must be testable with vitest in a pure Node.js environment.
- **No `any`** — use `unknown` and narrow explicitly. No `as` assertions
  without an adjacent comment explaining why the assertion is safe.
- **No abbreviations** — `revision` not `rev`, `bookmark` not `bm`,
  `description` not `desc` (except where jj itself uses the short form).
- **Result pattern** — core functions return `Result<T, E>`, never throw.
- **Ship docs with features** — every PR that adds user-facing functionality
  must include documentation in `docs/`.

## Pull request checklist

Before opening a PR, ensure:

- [ ] `pnpm build` passes (no TypeScript errors, no esbuild errors)
- [ ] `pnpm test:unit` passes (all unit tests green)
- [ ] `pnpm lint` passes (no ESLint violations)
- [ ] `pnpm typecheck` passes (strict mode, no `any` escapes)
- [ ] New `src/core/` code has unit tests in `test/unit/`
- [ ] New user-facing commands are registered in `package.json` and documented
  in `docs/reference/commands.md`
- [ ] New settings are declared in `package.json` and documented in
  `docs/reference/settings.md`
- [ ] The PR description explains *what* changed and *why* (not just *how*)
- [ ] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`

## Filing issues

When reporting a bug, please include:

1. Your jj version (`jj --version`)
2. Your VSCode / Cursor version
3. The contents of the **Jujutsu** output channel (View → Output → Jujutsu)
4. Steps to reproduce

## License

By contributing to jjvs you agree that your contributions will be licensed
under the [MIT License](LICENSE) that covers the project.
