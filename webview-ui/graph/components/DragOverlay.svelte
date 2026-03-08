<script lang="ts">
  import type { DragState } from '../graph-utils.js';
  import { shortId } from '../graph-utils.js';

  const { drag }: { drag: DragState } = $props();
</script>

<div
  class="drag-ghost"
  style="left: {drag.ghostX + 14}px; top: {drag.ghostY - 28}px"
  aria-hidden="true"
>
  {#if drag.targetChangeId !== null}
    <span class="drag-label drag-label-valid">
      ↷ Rebase {shortId(drag.sourceChangeId)} onto {shortId(drag.targetChangeId)}
    </span>
  {:else}
    <span class="drag-label">
      ↷ {shortId(drag.sourceChangeId)}…
    </span>
  {/if}
</div>

<style>
  .drag-ghost {
    position: fixed;
    pointer-events: none;
    z-index: 200;
  }

  .drag-label {
    display: inline-block;
    padding: 3px 8px;
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border, #454545));
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.85em;
    color: var(--vscode-foreground);
    white-space: nowrap;
    opacity: 0.9;
  }

  .drag-label-valid {
    border-color: var(--vscode-terminal-ansiGreen, #14a84b);
    color: var(--vscode-terminal-ansiGreen, #14a84b);
  }
</style>
