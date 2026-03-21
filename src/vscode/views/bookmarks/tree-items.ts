/**
 * Tree item classes for the jj bookmarks tree view (jjvs.bookmarks).
 *
 * Tree structure:
 *   BookmarkSectionItem("Local")
 *     LocalBookmarkTreeItem("main")
 *     LocalBookmarkTreeItem("feature-x")
 *   BookmarkSectionItem("Remote")
 *     RemoteBookmarkTreeItem("main@origin")       ← tracked
 *     RemoteBookmarkTreeItem("feature@upstream")  ← untracked
 *
 * `contextValue` drives `view/item/context` menu visibility:
 *   - `bookmarkSection`         — section header, no context menu actions
 *   - `localBookmark`           — local bookmark (move, delete, forget available)
 *   - `localBookmark|conflicted` — conflicted local bookmark
 *   - `remoteBookmark|isTracked`   — remote bookmark that is tracked locally
 *   - `remoteBookmark|isUntracked` — remote bookmark with no local tracking
 *
 * Menu `when` clauses use regex on the context value, e.g.:
 *   `viewItem =~ /localBookmark/` — matches all local bookmarks
 *   `viewItem =~ /isTracked/`     — matches only tracked remote bookmarks
 *   `viewItem =~ /isUntracked/`   — matches only untracked remote bookmarks
 */

import * as vscode from 'vscode';
import type { LocalBookmark, RemoteBookmark } from '../../../core/types';

/** Union type for all nodes in the bookmarks tree view. */
export type BookmarkTreeItem = BookmarkSectionItem | LocalBookmarkTreeItem | RemoteBookmarkTreeItem;

// ─── Section items ─────────────────────────────────────────────────────────────

/**
 * Collapsible section header — "Local" or "Remote".
 */
export class BookmarkSectionItem extends vscode.TreeItem {
  /** Whether this section contains local or remote bookmarks. */
  readonly sectionKind: 'local' | 'remote';

  constructor(sectionKind: 'local' | 'remote', count: number) {
    super(sectionKind === 'local' ? 'Local' : 'Remote', vscode.TreeItemCollapsibleState.Expanded);
    this.sectionKind = sectionKind;
    this.id = `bookmarkSection:${sectionKind}`;
    this.contextValue = 'bookmarkSection';
    // Show "none" when the section is empty so users know the section loaded.
    this.description = count === 0 ? 'none' : String(count);
    this.tooltip =
      sectionKind === 'local'
        ? `Local bookmarks — tracked in this repository only`
        : `Remote bookmarks — fetched from remote repositories`;
    this.accessibilityInformation = {
      label: `${sectionKind === 'local' ? 'Local' : 'Remote'} bookmarks section, ${count} items`,
    };
  }
}

// ─── Local bookmark items ───────────────────────────────────────────────────────

/**
 * A tree item representing a single local jj bookmark.
 */
export class LocalBookmarkTreeItem extends vscode.TreeItem {
  /** The full `LocalBookmark` data, available to command handlers via `treeView.selection`. */
  readonly bookmark: LocalBookmark;

  constructor(bookmark: LocalBookmark) {
    super(bookmark.name, vscode.TreeItemCollapsibleState.None);
    this.bookmark = bookmark;
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
 */
export class RemoteBookmarkTreeItem extends vscode.TreeItem {
  /** The full `RemoteBookmark` data, available to command handlers via `treeView.selection`. */
  readonly bookmark: RemoteBookmark;

  constructor(bookmark: RemoteBookmark) {
    super(`${bookmark.name}@${bookmark.remote}`, vscode.TreeItemCollapsibleState.None);
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
