<script lang="ts">
  import { tick } from 'svelte';
  import { ansiToHtml } from './ansi-to-html.js';

  /**
   * Messages sent from the extension host to this webview.
   * The discriminated union and changeId semantics are documented in provider.ts.
   */
  type ExtensionMessage =
    | { readonly type: 'loading' }
    | { readonly type: 'update'; readonly content: string; readonly changeId: string }
    | { readonly type: 'error'; readonly message: string };

  type ViewState = 'empty' | 'loading' | 'content' | 'error';

  let viewState = $state<ViewState>('empty');
  let rawContent = $state('');
  let errorText = $state('');

  /**
   * The changeId of the content currently displayed.
   * Compared against incoming update messages to decide whether to preserve
   * scroll position (same revision re-loaded) or reset to top (new revision).
   */
  let displayedChangeId: string | null = $state(null);

  /** Scroll position saved before a content swap. */
  let savedScrollTop = 0;

  /** Reference to the scrollable container element. */
  let container: HTMLElement | null = null;

  /** HTML-rendered version of rawContent, recomputed when content changes. */
  const htmlContent = $derived(viewState === 'content' ? ansiToHtml(rawContent) : '');

  $effect(() => {
    const handler = async (event: MessageEvent<ExtensionMessage>): Promise<void> => {
      const msg = event.data;

      if (msg.type === 'loading') {
        viewState = 'loading';
      } else if (msg.type === 'update') {
        const isSameRevision = msg.changeId === displayedChangeId;

        // Save scroll position before content swap so we can restore it if
        // the same revision is being refreshed (e.g., after an auto-refresh).
        if (isSameRevision && container !== null) {
          savedScrollTop = container.scrollTop;
        }

        rawContent = msg.content;
        displayedChangeId = msg.changeId;
        viewState = rawContent.trim() === '' ? 'empty' : 'content';

        // Wait for Svelte to flush DOM changes, then synchronize scroll:
        // - Same revision: restore the saved position so the view doesn't jump.
        // - New revision: reset to top so the user always sees the beginning.
        await tick();
        if (container !== null) {
          container.scrollTop = isSameRevision ? savedScrollTop : 0;
        }
      } else if (msg.type === 'error') {
        errorText = msg.message;
        displayedChangeId = null;
        viewState = 'error';
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  });

  function onScroll(): void {
    if (container !== null && viewState === 'content') {
      savedScrollTop = container.scrollTop;
    }
  }
</script>

<div
  class="preview-root"
  bind:this={container}
  onscroll={onScroll}
  role="region"
  aria-label="Jujutsu revision preview"
>
  {#if viewState === 'empty'}
    <p class="status">Select a revision to preview its changes.</p>
  {:else if viewState === 'loading'}
    <p class="status loading">Loading…</p>
  {:else if viewState === 'error'}
    <p class="status error">{errorText}</p>
  {:else}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <pre class="content" tabindex="0">{@html htmlContent}</pre>
  {/if}
</div>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    background-color: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    line-height: 1.4;
  }

  .preview-root {
    width: 100%;
    height: 100vh;
    overflow: auto;
  }

  .status {
    padding: 16px;
    margin: 0;
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-font-family, sans-serif);
    font-style: italic;
  }

  .loading {
    opacity: 0.7;
  }

  .error {
    color: var(--vscode-errorForeground);
    font-style: normal;
  }

  .content {
    margin: 0;
    padding: 8px 12px;
    white-space: pre;
    word-break: normal;
    overflow-x: auto;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    line-height: 1.5;
    background: transparent;
    border: none;
    outline: none;
  }
</style>
