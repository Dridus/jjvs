# Jujutsu for VSCode (jjvs)

A feature-rich, open-source [Jujutsu (jj)](https://github.com/jj-vcs/jj) extension for VSCode and Cursor.

## Motivation

Jujutsu is a next-generation version control system with powerful features that set it apart from git:
first-class conflicts (conflicts are stored in commits and don't block operations), automatic rebasing,
a comprehensive operation log with undo, and a flexible revset language for querying history.

However, IDE integration lags behind. Existing VSCode extensions are either closed-source, incomplete,
or both. **jjvs** aims to be the definitive open-source jj extension for VSCode and Cursor, matching
the feature depth of [jjui](https://github.com/idursun/jjui) while using VSCode's native UI paradigms.

## Features

> **Note:** jjvs is under active development. Features are implemented incrementally.

- **Revision log** — browse your repository's history as a tree view with graph characters, change IDs,
  authors, descriptions, and bookmarks
- **SCM integration** — working copy changes in the Source Control view with inline diffs
- **Revset completions** — filter the revision log with revset expressions, with autocomplete for
  functions, aliases, bookmarks, and tags
- **Bookmarks** — browse and manage local and remote bookmarks
- **Operation log** — full history of jj operations with undo/redo and restore
- **Conflict handling** — first-class conflict indicators, `jj resolve` integration, and workflow guidance
- **Rebase** — multi-step interactive rebase with source/target/position selection
- **Git integration** — push and fetch for colocated jj+git repositories
- **Preview panel** — live `jj show` and `jj diff` output with ANSI color rendering
- **Revision graph** — interactive graphical DAG with drag-and-drop rebase (coming in Phase 14)

## Requirements

- **VSCode** ≥ 1.105.0 or **Cursor** ≥ 2.6
- **jj** ≥ 0.25.0 (required for `json()` template function)

The `jj` binary must be on your `PATH`, or configure the path explicitly via `jjvs.jjPath`.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `jjvs.jjPath` | `"jj"` | Path to the jj binary |
| `jjvs.logLevel` | `"info"` | Output channel verbosity |
| `jjvs.revset` | `""` | Default revset for the revision log |
| `jjvs.logLimit` | `50` | Revisions loaded per batch |
| `jjvs.oplogLimit` | `200` | Maximum operations shown in op log |
| `jjvs.git.defaultRemote` | `"origin"` | Default remote for push/fetch |
| `jjvs.preview.position` | `"auto"` | Preview panel position (`auto`/`beside`/`below`) |
| `jjvs.autoRefresh` | `true` | Refresh views on repository state changes |
| `jjvs.graphStyle` | `"text"` | Graph rendering (`text`/`webview`) |

## Privacy

jjvs collects **no telemetry, analytics, or usage data** of any kind.

## Installation

> Installation instructions will be added when the first release is published to the marketplace.

For development installation, see [Development](#development) below.

## Development

### Prerequisites

Install [Nix](https://nixos.org/download) with flakes enabled, or have the following available:
- Node.js 22.x
- pnpm
- vsce (`@vscode/vsce`)

### Setup

```bash
# Enter the Nix dev environment (recommended)
nix develop
# or with direnv:
direnv allow

# Install project dependencies
pnpm install

# Build the extension
pnpm build

# Watch mode (rebuilds on save)
pnpm build:watch
```

### Running

Press **F5** in VSCode to open an Extension Development Host with jjvs loaded.

### Testing

```bash
# Unit tests (vitest, no VSCode required)
pnpm test:unit

# Unit tests in watch mode
pnpm test:unit:watch

# Type checking
pnpm typecheck

# Lint
pnpm lint
```

### Building a .vsix package

```bash
pnpm package
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines. *(Coming in Phase 15)*

## Attribution

jjvs is inspired by and partially derived from [jjui](https://github.com/idursun/jjui)
by Ibrahim Dursun, licensed under the MIT License. Specifically:

- The revset completion system (function definitions, token parsing, completion provider pattern)
  is ported from jjui's Go implementation to TypeScript
- The feature scope and user interaction patterns are informed by jjui's design
- jjui's approach to bookmark/tag sourcing and alias loading is adapted for the VSCode context

jjvs is not affiliated with or endorsed by the jj project or jjui.

## License

[MIT](LICENSE)
