<script lang="ts">
  import type { ContextMenuAction, ContextMenuState } from '../graph-utils.js';

  const {
    menu,
    onaction,
  }: {
    menu: ContextMenuState;
    onaction: (action: ContextMenuAction) => void;
  } = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="context-menu"
  style="left: {menu.x}px; top: {menu.y}px"
  role="menu"
  tabindex="-1"
  onclick={(e) => e.stopPropagation()}
>
  {#if !menu.isWorkingCopy}
    <button class="menu-item" role="menuitem" onclick={() => onaction('edit')}>
      Edit Revision
    </button>
  {/if}
  <button class="menu-item" role="menuitem" onclick={() => onaction('newAfter')}>
    New Revision After…
  </button>
  {#if !menu.isImmutable}
    <button class="menu-item" role="menuitem" onclick={() => onaction('describe')}>
      Describe…
    </button>
    <button class="menu-item" role="menuitem" onclick={() => onaction('squash')}>
      Squash into Parent…
    </button>
    <button class="menu-item" role="menuitem" onclick={() => onaction('rebase')}>
      Rebase…
    </button>
    <hr class="menu-separator" />
    <button
      class="menu-item menu-item-destructive"
      role="menuitem"
      onclick={() => onaction('abandon')}
    >
      Abandon
    </button>
    <hr class="menu-separator" />
  {/if}
  <button class="menu-item" role="menuitem" onclick={() => onaction('copyChangeId')}>
    Copy Change ID
  </button>
  <button class="menu-item" role="menuitem" onclick={() => onaction('copyCommitId')}>
    Copy Commit ID
  </button>
</div>

<style>
  .context-menu {
    position: fixed;
    background: var(--vscode-menu-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border, #454545));
    border-radius: 4px;
    padding: 4px 0;
    min-width: 180px;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    cursor: default;
  }

  .menu-item {
    display: block;
    width: 100%;
    padding: 5px 12px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    color: var(--vscode-menu-foreground, var(--vscode-foreground));
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-editor-font-size, 13px);
    white-space: nowrap;
  }

  .menu-item:hover,
  .menu-item:focus {
    background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground));
    color: var(--vscode-menu-selectionForeground, var(--vscode-foreground));
    outline: none;
  }

  .menu-item-destructive {
    color: var(--vscode-terminal-ansiRed, #cd3131);
  }

  .menu-separator {
    border: none;
    border-top: 1px solid
      var(--vscode-menu-separatorBackground, var(--vscode-panel-border, #454545));
    margin: 4px 0;
  }
</style>
