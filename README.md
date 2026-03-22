# Preamble

Hello! This project is, as described below, intended to become a full featured and useful Jujutsu extension for VSCode or Cursor. My hope is that it becomes as useful as `jjui` and the VSCode `git` extension combined. It is certainly not there yet.

The majority of the code was created by agent, specifically Opus 4.6 for planning and larger more complicated tasks and Sonnet 4.6 for the bulk of the work. The plan files used for this are preserved in `.cursor/plans` for posterity and reference, and the persistent agent guidance is in `CLAUDE.md` per usual.

As of this writing, most of the repository has not been reviewed or vetted by a human, though as I exercise the extension and improve things I go through and do that. I'm publishing it as open source in the hopes that it's interesting at the least and eventually useful.

If you'd like to participate in its evolution and development please feel invited, but I felt it's important that everyone be aware of its provenance. If you are looking for a good UI for jj beyond the built-in CLI, [`jjui`](https://github.com/idursun/jjui) is very good, and I'm grateful for it as both a tool I use regularly and as inspiration. As far as VSCode extensions go, there is also [`jjk`](https://github.com/keanemind/jjk) which is functional albeit with a much smaller featureset than `jjui` or the standard VSCode `git` extension.

Other thank this introductory section of the README, the rest of the README and documentation was written by Claude. I tried to guide it to produce good content, but keep in mind that sometimes the machine ghost can get pretty imaginative.

-Ross

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
- **Revision graph** — interactive graphical DAG with drag-and-drop rebase

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

## Documentation

Comprehensive user documentation is available in the [`docs/`](docs/) directory:

- **[Getting Started](docs/getting-started/)** — Installation, first steps, and a guided basic workflow
- **[Guides](docs/guides/)** — Task-oriented how-to articles for specific workflows (revisions, revsets,
  bookmarks, rebasing, conflicts, git integration, operation log, multi-root workspaces)
- **[Reference](docs/reference/)** — Exhaustive lookup for all commands, settings, keyboard shortcuts,
  revset functions, and troubleshooting

If you're new to jjvs, start with [Installation](docs/getting-started/installation.md) and then
work through the [Basic Workflow](docs/getting-started/basic-workflow.md) tutorial.

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

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

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
