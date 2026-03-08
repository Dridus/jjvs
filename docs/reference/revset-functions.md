# Revset functions reference

All built-in jj revset functions recognized by jjvs autocomplete, with their signatures
and descriptions. Derived from `src/core/revset/function-source.ts`, which was verified
against jj 0.38.0 revsets documentation.

For how to use these functions in the jjvs revset input, see the [Revsets guide](../guides/revsets.md).

---

## Whole-repository predicates

These functions take no arguments and select a fixed set of revisions.

| Signature | Description |
|-----------|-------------|
| `all()` | All visible revisions in the repository |
| `root()` | The virtual root revision (has no parents) |
| `working_copies()` | All working-copy revisions across all workspaces |
| `visible_heads()` | All visible head revisions (no visible children) |
| `trunk()` | The trunk revision (typically `main@origin`) |
| `merges()` | Revisions with two or more parents |
| `conflicts()` | Revisions with unresolved merge conflicts |
| `divergent()` | Revisions whose change ID is shared by multiple commits |
| `mine()` | Revisions authored by the current user |
| `mutable()` | Revisions that are not immutable (can be rewritten) |
| `immutable()` | Revisions that cannot be rewritten |
| `is_empty()` | Revisions with no changes relative to their parents |
| `git_refs()` | All revisions pointed to by git refs |
| `git_head()` | The revision pointed to by git HEAD |

---

## Graph traversal

These functions navigate the revision DAG.

| Signature | Description |
|-----------|-------------|
| `parents(x)` | Direct parents of `x` |
| `children(x)` | Direct children of `x` |
| `ancestors(x[, depth])` | All ancestors of `x`, optionally limited to a depth |
| `descendants(x[, depth])` | All descendants of `x`, optionally limited to a depth |
| `connected(x)` | All revisions reachable from any revision in `x` (including `x`) |
| `range(roots, heads)` | Revisions reachable from `heads` but not from `roots` (exclusive roots) |
| `reachable(srcs, domain)` | Revisions reachable from `srcs` through edges in `domain` |
| `heads(x)` | Revisions in `x` that have no children also in `x` |
| `roots(x)` | Revisions in `x` that have no parents also in `x` |
| `latest(x[, count])` | The latest `count` revisions in `x` (default `count` = 1) |
| `fork_point(x)` | The nearest common ancestor of all revisions in `x` |
| `at_operation(op, x)` | Evaluate `x` in the context of a past operation |

### Shorthand operators

These operators are equivalent to the corresponding functions:

| Operator | Equivalent | Example |
|----------|------------|---------|
| `x-` | `parents(x)` | `@-` |
| `x+` | `children(x)` | `trunk()+` |
| `::x` | `ancestors(x)` (inclusive) | `::@` |
| `x::` | `descendants(x)` (inclusive) | `trunk()::` |
| `x::y` | Connected range from `x` to `y` | `trunk()::@` |
| `x..y` | `range(x, y)` | `trunk()..@` |

---

## Content filters

These functions filter by the content or metadata of a revision.

| Signature | Description |
|-----------|-------------|
| `description(pattern)` | Revisions whose description matches the given pattern |
| `author(pattern)` | Revisions authored by a user matching the pattern |
| `author_date(pattern)` | Revisions authored within a matching date range |
| `committer_date(pattern)` | Revisions committed within a matching date range |
| `diff_contains(text[, files])` | Revisions whose diff contains the given text, optionally scoped to files |

### Pattern syntax

String patterns accept either a literal string or a pattern prefix:

| Prefix | Behavior |
|--------|---------|
| `"substring"` | Case-insensitive substring match (default) |
| `"exact:value"` | Exact match |
| `"glob:pat*"` | Glob pattern |
| `"regex:pat"` | Regular expression |

Example: `description("fix: exact:bug-123")` — descriptions containing the literal string
`fix:` followed anywhere by `bug-123` is more clearly expressed as:
`description("fix:") & description("exact:bug-123")`.

---

## Reference filters

These functions filter by bookmarks, remote bookmarks, and tags.

| Signature | Description |
|-----------|-------------|
| `bookmarks([pattern])` | Revisions with local bookmarks matching an optional pattern |
| `remote_bookmarks([bookmark][, remote])` | Revisions with remote bookmarks, optionally filtered by bookmark name and remote |
| `tags([pattern])` | Revisions with tags matching an optional pattern |

---

## Set operations

These functions operate on revset values as sets.

| Signature | Description |
|-----------|-------------|
| `present(x)` | `x` if it evaluates to a non-empty set, otherwise empty (never errors) |
| `coalesce(revsets...)` | The first non-empty revset among the arguments |

`present()` is useful when a revset references a bookmark or tag that may not exist in all
repositories. Without `present()`, referencing a non-existent name is an error:

```
# Errors if "my-branch" doesn't exist:
my-branch

# Safe — returns empty if "my-branch" doesn't exist:
present(my-branch)
```

`coalesce()` provides a fallback chain:

```
# Use "main" if it exists, else "master", else the working copy:
coalesce(present(main), present(master), @)
```

---

## Set operators

Revset expressions can be combined with boolean operators:

| Operator | Precedence | Description |
|----------|------------|-------------|
| `~x` | Highest | All revisions not in `x` |
| `x & y` | | Intersection of `x` and `y` |
| `x \| y` | | Union of `x` and `y` |
| `x ~ y` | Lowest | `x` minus `y` (difference) |

---

## Further reading

- [jj revsets documentation](https://martinvonz.github.io/jj/latest/revsets/) — official reference (primary source)
- [Revsets guide](../guides/revsets.md) — how to use revsets in jjvs
