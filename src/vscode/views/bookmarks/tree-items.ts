/**
 * Tree item classes for the jj bookmarks tree view (jjvs.bookmarks).
 *
 * Tree structure mirrors `jj bookmark list --all`:
 *
 *   LocalBookmarkTreeItem("python")       ← local with remotes: collapsible parent
 *     RemoteBookmarkTreeItem("@git")      ← child label is @remote only
 *     RemoteBookmarkTreeItem("@origin")
 *   LocalBookmarkTreeItem("main")         ← local only: leaf
 *   BookmarkGroupItem("upstream-only")    ← multiple remotes, no local: collapsible
 *     RemoteBookmarkTreeItem("@origin")
 *     RemoteBookmarkTreeItem("@upstream")
 *   RemoteBookmarkTreeItem("solo@origin") ← single remote, no local: leaf
 *
 * `contextValue` drives `view/item/context` menu visibility:
 *   - `bookmarkGroup`               — remote-only group, no context menu actions
 *   - `localBookmark`               — local bookmark (move, delete, forget available)
 *   - `localBookmark|conflicted`    — conflicted local bookmark
 *   - `remoteBookmark|isTracked`    — remote bookmark that is tracked locally
 *   - `remoteBookmark|isUntracked`  — remote bookmark with no local tracking
 *
 * Menu `when` clauses use regex on the context value, e.g.:
 *   `viewItem =~ /localBookmark/`  — matches all local bookmarks
 *   `viewItem =~ /isTracked/`      — matches only tracked remote bookmarks
 *   `viewItem =~ /isUntracked/`    — matches only untracked remote bookmarks
 */

import * as vscode from 'vscode';
import type { LocalBookmark, RemoteBookmark } from '../../../core/types';

/** Union type for all nodes in the bookmarks tree view. */
export type BookmarkTreeItem = BookmarkGroupItem | LocalBookmarkTreeItem | RemoteBookmarkTreeItem;

// ─── Bookmark group item (remote-only, multiple remotes) ───────────────────────

/**
 * A collapsible group for a bookmark name that has multiple remote entries
 * but no local bookmark. Children are RemoteBookmarkTreeItem nodes whose
 * labels show only `@remote` (not the full `name@remote`).
 */
export class BookmarkGroupItem extends vscode.TreeItem {
  /** The bookmark name shared by all remote children. */
  readonly bookmarkName: string;
  /** Remote bookmarks belonging to this group. */
  readonly remoteBookmarks: readonly RemoteBookmark[];

  constructor(bookmarkName: string, remoteBookmarks: readonly RemoteBookmark[]) {
    super(bookmarkName, vscode.TreeItemCollapsibleState.Expanded);
    this.bookmarkName = bookmarkName;
    this.remoteBookmarks = remoteBookmarks;
    this.id = `bookmarkGroup:${bookmarkName}`;
    this.contextValue = 'bookmarkGroup';
    this.iconPath = new vscode.ThemeIcon('tag');
    this.description = remoteBookmarks.map((r) => `@${r.remote}`).join(', ');
    this.tooltip = new vscode.MarkdownString(
      `**Bookmark:** \`${bookmarkName}\`\n\nRemote-only — no local bookmark exists.`,
    );
    this.accessibilityInformation = {
      label: `Bookmark group ${bookmarkName}, ${remoteBookmarks.length} remote entries`,
    };
  }
}

// ─── Local bookmark items ───────────────────────────────────────────────────────

/**
 * A tree item representing a single local jj bookmark.
 *
 * When `remoteBookmarks` is non-empty the item is rendered as a collapsible
 * parent; its children are the associated remote entries.
 */
export class LocalBookmarkTreeItem extends vscode.TreeItem {
  /** The full `LocalBookmark` data, available to command handlers via `treeView.selection`. */
  readonly bookmark: LocalBookmark;
  /** Remote bookmarks associated with this name — populated as children when non-empty. */
  readonly remoteBookmarks: readonly RemoteBookmark[];

  constructor(bookmark: LocalBookmark, remoteBookmarks: readonly RemoteBookmark[]) {
    const collapsibleState =
      remoteBookmarks.length > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None;
    super(bookmark.name, collapsibleState);
    this.bookmark = bookmark;
    this.remoteBookmarks = remoteBookmarks;
    this.id = `localBookmark:${bookmark.name}`;

    const isConflicted = bookmark.targets.length > 1;

    if (isConflicted) {
      this.description = 'conflicted';
      this.iconPath = new vscode.ThemeIcon(
        'warning',
        new vscode.ThemeColor('list.warningForeground'),
      );
      this.contextValue = 'localBookmark|conflicted';
    } else {
      const shortTarget =
        bookmark.targets[0] !== undefined ? bookmark.targets[0].substring(0, 12) : '(empty)';
      this.description = `→ ${shortTarget}`;
      this.iconPath = new vscode.ThemeIcon('tag');
      this.contextValue = 'localBookmark';
    }

    this.tooltip = buildLocalBookmarkTooltip(bookmark);
    this.accessibilityInformation = {
      label: `Local bookmark ${bookmark.name}${isConflicted ? ', conflicted' : ''}`,
    };
  }
}

// ─── Remote bookmark items ──────────────────────────────────────────────────────

/**
 * A tree item representing a remote-tracking jj bookmark entry.
 *
 * When `isChild` is `true` (nested under a local bookmark or group), the label
 * is `@remote` only — mirroring how `jj bookmark list --all` indents remotes.
 * When standalone (no local counterpart, single remote), the full `name@remote`
 * label is used so the bookmark name is visible without expanding anything.
 */
export class RemoteBookmarkTreeItem extends vscode.TreeItem {
  /** The full `RemoteBookmark` data, available to command handlers via `treeView.selection`. */
  readonly bookmark: RemoteBookmark;

  constructor(bookmark: RemoteBookmark, isChild: boolean) {
    const label = isChild ? `@${bookmark.remote}` : `${bookmark.name}@${bookmark.remote}`;
    super(label, vscode.TreeItemCollapsibleState.None);
    this.bookmark = bookmark;
    this.id = `remoteBookmark:${bookmark.name}@${bookmark.remote}`;

    const isTracked = bookmark.trackingTargets.length > 0;
    const isConflicted = bookmark.targets.length > 1;

    const shortTarget =
      bookmark.targets[0] !== undefined ? bookmark.targets[0].substring(0, 12) : '(empty)';

    this.description = isConflicted ? 'conflicted' : `→ ${shortTarget}`;

    if (isTracked) {
      this.iconPath = new vscode.ThemeIcon('cloud');
      this.contextValue = 'remoteBookmark|isTracked';
    } else {
      this.iconPath = new vscode.ThemeIcon(
        'cloud-download',
        new vscode.ThemeColor('gitDecoration.untrackedResourceForeground'),
      );
      this.contextValue = 'remoteBookmark|isUntracked';
    }

    this.tooltip = buildRemoteBookmarkTooltip(bookmark, isTracked);
    this.accessibilityInformation = {
      label: `Remote bookmark ${bookmark.name} on ${bookmark.remote}${isTracked ? ', tracked' : ', untracked'}`,
    };
  }
}

// ─── Tooltip builders ───────────────────────────────────────────────────────────

function buildLocalBookmarkTooltip(bookmark: LocalBookmark): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**Bookmark:** \`${bookmark.name}\`\n\n`);

  if (bookmark.targets.length === 0) {
    md.appendMarkdown('No target commit.');
  } else if (bookmark.targets.length === 1 && bookmark.targets[0] !== undefined) {
    md.appendMarkdown(`**Target:** \`${bookmark.targets[0]}\``);
  } else {
    md.appendMarkdown('**Status:** Conflicted (multiple targets)\n\n');
    md.appendMarkdown('**Targets:**\n');
    for (const target of bookmark.targets) {
      md.appendMarkdown(`- \`${target}\`\n`);
    }
  }
  return md;
}

function buildRemoteBookmarkTooltip(
  bookmark: RemoteBookmark,
  isTracked: boolean,
): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**Bookmark:** \`${bookmark.name}@${bookmark.remote}\`\n\n`);
  md.appendMarkdown(`**Tracking:** ${isTracked ? 'Yes' : 'No'}\n\n`);

  if (bookmark.targets.length === 0) {
    md.appendMarkdown('No target commit.');
  } else if (bookmark.targets.length === 1 && bookmark.targets[0] !== undefined) {
    md.appendMarkdown(`**Remote target:** \`${bookmark.targets[0]}\``);
  } else {
    md.appendMarkdown('**Status:** Conflicted (multiple targets)\n\n');
    for (const target of bookmark.targets) {
      md.appendMarkdown(`- \`${target}\`\n`);
    }
  }

  if (isTracked && bookmark.trackingTargets[0] !== undefined) {
    md.appendMarkdown(`\n\n**Last known local:** \`${bookmark.trackingTargets[0]}\``);
  }

  return md;
}
