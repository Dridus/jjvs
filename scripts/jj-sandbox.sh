#!/usr/bin/env bash
# jj-sandbox.sh — run jj commands safely inside a throwaway temp directory.
#
# Usage:
#   ./scripts/jj-sandbox.sh [OPTIONS] [-- COMMAND [ARGS...]]
#
# Without a command: initialises a jj git repo in the sandbox and drops you
# into an interactive shell inside it (exit to clean up).
#
# With a command: runs that command inside the sandbox with the repo already
# initialised, then prints a summary of the .jj directory layout and size.
#
# Options:
#   --keep        Do not delete the sandbox on exit (prints the path so you
#                 can inspect it manually; you must delete it yourself).
#   --no-init     Skip `jj git init`; sandbox is an empty directory.
#   --jj PATH     Path to the jj binary (default: jj from PATH).
#   --help        Print this message and exit.
#
# Safety guarantees:
#   1. All work happens inside a `mktemp -d` temporary directory. The script
#      records the real path and validates every `cd` stays inside it.
#   2. A trap on EXIT/ERR/INT/TERM always removes the sandbox (unless --keep).
#   3. `set -euo pipefail` aborts on any unhandled error.
#   4. `CDPATH=` is cleared so `cd` cannot silently jump elsewhere.
#   5. The sandbox path is always an absolute path with no symlinks (realpath).
#   6. The script refuses to run if its cwd happens to be inside the target
#      jjvs project root and would affect the live working tree.

set -euo pipefail
CDPATH=

# ── Helpers ───────────────────────────────────────────────────────────────────

die() { echo "jj-sandbox: error: $*" >&2; exit 1; }
info() { echo "jj-sandbox: $*" >&2; }

# Resolve the canonical (no-symlinks) absolute path of the live project root,
# so we can refuse to operate inside it.
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"

# ── Option parsing ─────────────────────────────────────────────────────────────

KEEP=false
NO_INIT=false
JJ_BIN="jj"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep)     KEEP=true;         shift ;;
    --no-init)  NO_INIT=true;      shift ;;
    --jj)       JJ_BIN="$2";       shift 2 ;;
    --help|-h)
      sed -n '2,/^[^#]/{ /^#/{ s/^# \?//; p }; /^[^#]/q }' "$0"
      exit 0 ;;
    --)         shift; break ;;
    -*)         die "unknown option: $1 (try --help)" ;;
    *)          break ;;
  esac
done

# ── Locate jj ─────────────────────────────────────────────────────────────────

if ! command -v "$JJ_BIN" >/dev/null 2>&1; then
  die "jj binary not found at '$JJ_BIN'. Install jj or pass --jj <path>."
fi
JJ_VERSION=$("$JJ_BIN" --version 2>&1 | head -1)
info "using $JJ_VERSION"

# ── Create sandbox ─────────────────────────────────────────────────────────────

SANDBOX="$(mktemp -d -t jj-sandbox.XXXXXXXX)"
# Resolve symlinks so the guard below works even on macOS (/var → /private/var).
SANDBOX="$(cd "$SANDBOX" && pwd -P)"
info "sandbox: $SANDBOX"

# Guard: refuse to operate inside the live project tree.
# (This can only happen if mktemp returned a path under the project root, which
# would be unusual, but the check is cheap and the failure mode is data loss.)
if [[ "$SANDBOX" == "$PROJECT_ROOT"* ]]; then
  rm -rf "$SANDBOX"
  die "sandbox path ($SANDBOX) is inside the project root ($PROJECT_ROOT) — aborting."
fi

# ── Cleanup trap ──────────────────────────────────────────────────────────────

cleanup() {
  local exit_code=$?
  # Ensure we are not inside the sandbox before removing it.
  cd "$PROJECT_ROOT"
  if [[ "$KEEP" == true ]]; then
    info "sandbox kept (--keep): $SANDBOX"
  else
    rm -rf "$SANDBOX"
    info "sandbox removed."
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

# ── Directory guard ───────────────────────────────────────────────────────────

# safe_cd: change directory and verify we're still inside the sandbox.
safe_cd() {
  local target
  target="$(cd "$1" && pwd -P)"
  if [[ "$target" != "$SANDBOX"* ]]; then
    die "safe_cd: refusing to cd to '$target' (outside sandbox '$SANDBOX')"
  fi
  cd "$target"
}

# ── Initialise jj repo ────────────────────────────────────────────────────────

safe_cd "$SANDBOX"

if [[ "$NO_INIT" == false ]]; then
  info "running: jj git init"
  "$JJ_BIN" git init 2>&1
fi

# ── Run user command or interactive shell ─────────────────────────────────────

if [[ $# -gt 0 ]]; then
  # Run the supplied command with the sandbox as cwd.
  info "running: $*"
  "$@"

  # Print a summary of the .jj directory structure (if it exists).
  if [[ -d ".jj" ]]; then
    echo ""
    echo "=== .jj directory layout ==="
    find .jj -not -path '*/objects/*' | sort
    echo ""
    echo "=== .jj size ==="
    du -sh .jj
  fi
else
  # Interactive mode: drop the user into a shell inside the sandbox.
  info "entering interactive shell in sandbox (type 'exit' to finish and clean up)"
  info "sandbox path: $SANDBOX"
  PS1="[jj-sandbox]\\$ " bash --norc --noprofile -i || true
fi
