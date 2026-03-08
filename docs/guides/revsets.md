# Revsets

This guide explains how to use revset expressions in jjvs to filter the revision log,
and how the autocomplete system works.

## Prerequisites

- jjvs installed and a jj repository open (see [First steps](../getting-started/first-steps.md))
- Basic familiarity with jj revsets is helpful but not required

## What is a revset?

A **revset** is a query language for selecting sets of revisions. jj's revset language is
similar in spirit to Mercurial's revset language: you compose functions and operators to
describe exactly which revisions you want.

For example:

- `all()` — every visible revision
- `mine()` — revisions you authored
- `trunk()..@` — revisions between the trunk and the working copy
- `description(wip) | description(fixup)` — revisions mentioning "wip" or "fixup"

Full revset documentation is on the [jj revsets page](https://martinvonz.github.io/jj/latest/revsets/).

## Filtering the revision log

To apply a revset filter to the Revisions view:

1. Click the **Filter by Revset...** icon (funnel) in the Revisions view toolbar, or
   run **Jujutsu: Filter by Revset...** from the command palette (`Ctrl+Shift+P`)
2. Type a revset expression in the input box
3. Press `Enter` to apply

The Revisions view title bar updates to show the active filter: `filter: <expression>`.

To clear the filter, open the input again and use the **Clear filter** button (or delete
the expression text and confirm).

## Autocomplete

The revset input provides autocomplete suggestions as you type. Autocomplete triggers
automatically after you type an opening parenthesis or a delimiter character (space, `,`,
`|`, `&`, `~`, `(`, `.`, `:`).

Suggestions are grouped into four categories:

### Built-in functions

All built-in jj revset functions are available for completion, including zero-argument
predicates like `mine()`, `conflicts()`, and `trunk()`, as well as parameterized functions
like `ancestors(x)`, `description(pattern)`, and `range(roots, heads)`.

When you select a function from the list, the input shows the function name. Type `(` to
open the argument list.

For a complete list of built-in functions with their signatures and descriptions, see the
[Revset functions reference](../reference/revset-functions.md).

### Revset aliases

Any revset aliases defined in your jj user config (under `revset-aliases`) are loaded
dynamically and appear alongside built-in functions. Aliases are distinguished by a tag
in the completion list.

To define an alias, add it to your jj config:

```toml
[revset-aliases]
"my-work" = "mine() & mutable()"
```

After defining an alias, it appears in jjvs completions the next time you open the revset
input.

### Bookmarks

Your repository's local bookmarks appear as completion items. This makes it easy to write
expressions like `my-feature..` without having to remember exact bookmark names.

Bookmarks are fetched from the repository at the time you open the input, so they always
reflect the current state.

### Tags

Tags are listed alongside bookmarks. If your repository has no tags, this category is
omitted from the suggestions.

## Session history

The revset input remembers expressions you have used during the current session. Previous
expressions appear at the top of the suggestion list, making it easy to re-apply a filter
you used earlier.

History is scoped to the current window session and persists across workspace reloads via
VSCode's global state.

## Common patterns

These revset expressions cover the most frequent use cases:

| Expression | Description |
|------------|-------------|
| `mine()` | All revisions you authored |
| `mutable()` | All revisions that can be rewritten (not yet pushed/immutable) |
| `trunk()..` | All revisions between trunk and all heads |
| `trunk()..@` | Revisions between trunk and your working copy |
| `description(keyword)` | Revisions whose description contains "keyword" |
| `author("name")` | Revisions by a specific author |
| `bookmarks()` | Revisions pointed to by local bookmarks |
| `conflicts()` | Revisions with unresolved conflicts |
| `ancestors(@, 10)` | The 10 most recent ancestors of the working copy |
| `mine() & mutable()` | Your work that can still be rewritten |
| `present(my-bookmark)` | Safe version of `my-bookmark` — empty if the bookmark doesn't exist |

## Using the default revset

If you always want the Revisions view to start with a particular filter, set the
`jjvs.revset` setting. This value is used as the initial revset when no session filter
is active:

```json
{
  "jjvs.revset": "trunk().. | ancestors(@, 5)"
}
```

See the [Settings reference](../reference/settings.md) for details.

## Operators

Revset expressions support these operators (highest precedence first):

| Operator | Meaning | Example |
|----------|---------|---------|
| `x-` | Parents of x | `@-` |
| `x+` | Children of x | `trunk()+` |
| `::x` | Ancestors of x (inclusive) | `::@` |
| `x::` | Descendants of x (inclusive) | `trunk()::` |
| `x::y` | Range from x to y (inclusive both ends) | `trunk()::@` |
| `x..y` | Range from x to y (exclusive x) | `trunk()..@` |
| `~x` | All revisions not in x | `~mine()` |
| `x & y` | Intersection | `mine() & mutable()` |
| `x \| y` | Union | `bookmarks() \| tags()` |
| `x ~ y` | Difference (x minus y) | `all() ~ trunk()` |

## What's next

- [Revset functions reference](../reference/revset-functions.md) — complete list of built-in functions
- [Basic workflow](../getting-started/basic-workflow.md) — how revset filtering fits into the overall workflow
