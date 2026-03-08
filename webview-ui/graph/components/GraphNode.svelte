<script lang="ts">
  import type { LayoutNode } from '../dag-layout.js';
  import { ROW_HEIGHT, shortId, firstLine, formatTimestamp } from '../graph-utils.js';

  const {
    node,
    selected,
    isDropTarget,
    isDragSource,
    onclick,
    oncontextmenu,
    onselect,
  }: {
    node: LayoutNode;
    selected: boolean;
    isDropTarget: boolean;
    isDragSource: boolean;
    onclick: (event: MouseEvent) => void;
    oncontextmenu: (event: MouseEvent) => void;
    onselect: () => void;
  } = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="revision-row"
  class:selected
  class:drop-target={isDropTarget}
  class:drag-source={isDragSource}
  style="height: {ROW_HEIGHT}px"
  role="option"
  aria-selected={selected}
  tabindex="0"
  data-changeid={node.revision.changeId}
  {onclick}
  {oncontextmenu}
  onkeydown={(e) => {
    if (e.key === 'Enter') onselect();
  }}
>
  <span class="rev-refs">
    {#each node.revision.localBookmarks as bookmark}
      <span class="badge badge-bookmark" title="local bookmark: {bookmark}">{bookmark}</span>
    {/each}
    {#each node.revision.remoteBookmarks as remote}
      <span class="badge badge-remote" title="remote bookmark: {remote}">{remote}</span>
    {/each}
    {#each node.revision.tags as tag}
      <span class="badge badge-tag" title="tag: {tag}">{tag}</span>
    {/each}
  </span>

  <span class="rev-id">{shortId(node.revision.changeId)}</span>

  <span class="rev-description" title={node.revision.description.trim()}>
    {firstLine(node.revision.description)}
  </span>

  <span class="rev-meta">
    {node.revision.authorName} · {formatTimestamp(node.revision.authorTimestamp)}
  </span>
</div>

<style>
  .revision-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px 0 4px;
    overflow: hidden;
    white-space: nowrap;
    border-left: 2px solid transparent;
    user-select: none;
    outline: none;
  }

  .revision-row:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .revision-row:focus {
    background: var(--vscode-list-hoverBackground);
    border-left-color: var(--vscode-focusBorder, #007fd4);
  }

  .revision-row.selected {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
    border-left-color: var(--vscode-focusBorder, #007fd4);
  }

  .revision-row.drag-source {
    opacity: 0.5;
    border-left-color: var(--vscode-descriptionForeground, #8b8b8b);
    border-left-style: dashed;
  }

  .revision-row.drop-target {
    background: color-mix(
      in srgb,
      var(--vscode-terminal-ansiYellow, #c5ac00) 15%,
      transparent
    );
    border-left-color: var(--vscode-terminal-ansiYellow, #c5ac00);
    border-left-width: 3px;
  }

  /* ── Row content ──────────────────────────────────────────────────────────── */

  .rev-refs {
    display: flex;
    gap: 3px;
    flex-shrink: 0;
    align-items: center;
  }

  .rev-refs:empty {
    display: none;
  }

  .badge {
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 0.75em;
    font-weight: 500;
    white-space: nowrap;
    line-height: 1.4;
    pointer-events: none;
  }

  .badge-bookmark {
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #ffffff);
  }

  .badge-remote {
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #ffffff);
    opacity: 0.75;
  }

  .badge-tag {
    background: var(--vscode-terminal-ansiYellow, #c5ac00);
    color: var(--vscode-editor-background);
  }

  .rev-id {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.85em;
    color: var(--vscode-terminal-ansiCyan, #00bcd4);
    flex-shrink: 0;
  }

  .revision-row.selected .rev-id {
    color: var(--vscode-list-activeSelectionForeground);
  }

  .rev-description {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--vscode-foreground);
  }

  .revision-row.selected .rev-description {
    color: var(--vscode-list-activeSelectionForeground);
  }

  .rev-meta {
    font-size: 0.82em;
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
  }

  .revision-row.selected .rev-meta {
    color: var(--vscode-list-activeSelectionForeground);
    opacity: 0.85;
  }
</style>
