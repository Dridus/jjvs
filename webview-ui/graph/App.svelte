<script lang="ts">
  import {
    computeLayout,
    type GraphRevision,
    type LayoutNode,
    type LayoutEdge,
    type DagLayout,
  } from './dag-layout.js';

  // ── Type declarations ───────────────────────────────────────────────────────

  /** Messages sent from the extension host to this webview. */
  type ExtensionMessage =
    | { readonly type: 'loading' }
    | {
        readonly type: 'update';
        readonly revisions: readonly GraphRevision[];
        readonly selectedChangeId: string | null;
      }
    | { readonly type: 'error'; readonly message: string }
    | { readonly type: 'selectRevision'; readonly changeId: string | null };

  /** Actions the user can trigger from the context menu. */
  type ContextMenuAction =
    | 'edit'
    | 'newAfter'
    | 'describe'
    | 'squash'
    | 'rebase'
    | 'abandon'
    | 'copyChangeId'
    | 'copyCommitId';

  type ContextMenuState = {
    readonly x: number;
    readonly y: number;
    readonly changeId: string;
    readonly isImmutable: boolean;
    readonly isWorkingCopy: boolean;
  };

  /**
   * Active drag-rebase state.
   *
   * A drag is initiated by pressing and holding on a mutable revision node or
   * row, then moving more than the drag threshold. Releasing over a valid
   * (non-immutable, non-self) revision sends a `dragRebase` message to the
   * extension host.
   */
  type DragState = {
    readonly sourceChangeId: string;
    /** Current cursor position in viewport coordinates. */
    ghostX: number;
    ghostY: number;
    /**
     * Change ID of the revision currently under the cursor (valid drop target),
     * or null if no valid target is under the cursor.
     */
    targetChangeId: string | null;
  };

  type ViewState = 'empty' | 'loading' | 'content' | 'error';

  // ── VSCode API ──────────────────────────────────────────────────────────────

  // acquireVsCodeApi is injected by the VSCode webview host at runtime.
  // safe: this global is always present in VSCode webview contexts.
  declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
  };

  const vscode = acquireVsCodeApi();

  // ── State ───────────────────────────────────────────────────────────────────

  let viewState: ViewState = $state('empty');
  let revisions: GraphRevision[] = $state([]);
  let selectedChangeId: string | null = $state(null);
  let errorText = $state('');
  let contextMenu: ContextMenuState | null = $state(null);
  let dragState: DragState | null = $state(null);

  // ── Zoom / pan state ─────────────────────────────────────────────────────────

  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 4.0;

  let zoom = $state(1.0);
  let panX = $state(0);
  let panY = $state(0);
  // isPanning drives cursor style changes, so it must be reactive.
  let isPanning = $state(false);

  // Non-reactive tracking for in-progress pan gesture (no re-render needed mid-gesture).
  let panStartX = 0;
  let panStartY = 0;
  let panStartPanX = 0;
  let panStartPanY = 0;

  // Non-reactive tracking for pre-threshold drag detection (distinguish click from drag).
  let potentialDrag: { changeId: string; startX: number; startY: number } | null = null;

  // Set to true when a drag-rebase completes to suppress the synthetic click
  // event that would otherwise fire on the underlying element.
  let isDragComplete = false;

  // ── Layout ──────────────────────────────────────────────────────────────────

  const layout: DagLayout = $derived(computeLayout(revisions));

  // ── Display constants ───────────────────────────────────────────────────────

  /** Horizontal spacing between graph columns, in pixels. */
  const COL_WIDTH = 18;
  /** Vertical spacing between graph rows, in pixels. */
  const ROW_HEIGHT = 32;
  /** Radius of a revision node circle, in pixels. */
  const NODE_RADIUS = 5;
  /** Horizontal padding added on each side of the SVG. */
  const SVG_PADDING = 4;

  const svgWidth = $derived((layout.maxColumn + 1) * COL_WIDTH + SVG_PADDING * 2);
  const svgHeight = $derived(Math.max(layout.nodes.length * ROW_HEIGHT, 1));

  // ── Coordinate helpers ──────────────────────────────────────────────────────

  function nodeX(col: number): number {
    return SVG_PADDING + col * COL_WIDTH + COL_WIDTH / 2;
  }

  function nodeY(row: number): number {
    return row * ROW_HEIGHT + ROW_HEIGHT / 2;
  }

  /**
   * Build an SVG path `d` attribute for a parent-child edge.
   *
   * Edges between the same column are straight vertical lines. Edges between
   * different columns use a symmetric cubic bezier that starts and ends
   * vertically, with the inflection point at the midpoint between the two rows.
   */
  function edgePath(edge: LayoutEdge): string {
    const x1 = nodeX(edge.fromColumn);
    const y1 = nodeY(edge.fromRow);
    const x2 = nodeX(edge.toColumn);
    const y2 = nodeY(edge.toRow);
    if (edge.fromColumn === edge.toColumn) {
      return `M${x1},${y1} L${x2},${y2}`;
    }
    const midY = (y1 + y2) / 2;
    return `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`;
  }

  // ── Message handling ────────────────────────────────────────────────────────

  $effect(() => {
    const handler = (event: MessageEvent<ExtensionMessage>): void => {
      const msg = event.data;
      if (msg.type === 'loading') {
        viewState = 'loading';
      } else if (msg.type === 'update') {
        // Spread into a new array to make it mutable for $state.
        revisions = [...msg.revisions];
        selectedChangeId = msg.selectedChangeId;
        viewState = revisions.length === 0 ? 'empty' : 'content';
      } else if (msg.type === 'error') {
        errorText = msg.message;
        viewState = 'error';
      } else if (msg.type === 'selectRevision') {
        selectedChangeId = msg.changeId;
      }
    };

    window.addEventListener('message', handler);
    // Signal readiness so the extension sends the initial revision data.
    vscode.postMessage({ type: 'ready' });

    return () => window.removeEventListener('message', handler);
  });

  // ── Revision interaction ─────────────────────────────────────────────────────

  function selectRevision(changeId: string): void {
    selectedChangeId = changeId;
    contextMenu = null;
    vscode.postMessage({ type: 'revisionClicked', changeId });
  }

  function openContextMenu(event: MouseEvent, node: LayoutNode): void {
    // Right-click cancels any active drag rather than opening the context menu.
    if (dragState !== null || potentialDrag !== null) {
      dragState = null;
      potentialDrag = null;
      event.preventDefault();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    contextMenu = {
      x: event.clientX,
      y: event.clientY,
      changeId: node.revision.changeId,
      isImmutable: node.revision.isImmutable,
      isWorkingCopy: node.revision.isWorkingCopy,
    };
  }

  function dispatchContextAction(action: ContextMenuAction): void {
    if (contextMenu === null) return;
    const { changeId } = contextMenu;
    contextMenu = null;
    vscode.postMessage({ type: 'contextMenuAction', changeId, action });
  }

  function dismissContextMenu(event: MouseEvent): void {
    // Suppress click events that follow a completed drag gesture.
    if (isDragComplete) {
      isDragComplete = false;
      return;
    }
    contextMenu = null;
    event.stopPropagation();
  }

  // ── Zoom / pan ──────────────────────────────────────────────────────────────

  function clampZoom(value: number): number {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  }

  function zoomIn(): void {
    zoom = clampZoom(zoom * 1.2);
  }

  function zoomOut(): void {
    zoom = clampZoom(zoom / 1.2);
  }

  function resetView(): void {
    zoom = 1.0;
    panX = 0;
    panY = 0;
  }

  /**
   * Handle wheel events for zoom (Ctrl+Wheel) and pan (plain Wheel).
   *
   * Ctrl+Wheel zooms the graph centered on the cursor position, preserving the
   * content point under the cursor. Plain Wheel pans vertically; Shift+Wheel
   * pans horizontally.
   */
  function onWheel(event: WheelEvent): void {
    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
      // Cursor-centered zoom: adjust pan so the content point under the cursor
      // does not move as the zoom level changes.
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = clampZoom(zoom * factor);
      if (newZoom === zoom) return;

      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;
      // The formula: new_pan = cursor - (cursor - old_pan) * (new_zoom / old_zoom)
      panX = cursorX - (cursorX - panX) * (newZoom / zoom);
      panY = cursorY - (cursorY - panY) * (newZoom / zoom);
      zoom = newZoom;
    } else {
      // Plain wheel: scroll vertically (Shift+wheel scrolls horizontally).
      const dx = event.shiftKey ? -event.deltaY : -event.deltaX;
      const dy = event.shiftKey ? 0 : -event.deltaY;
      panX += dx;
      panY += dy;
    }
  }

  // ── Pointer events (unified pan + drag-rebase) ───────────────────────────────

  /**
   * Unified pointer-down handler on the `.graph-root` element.
   *
   * Determines whether the gesture should begin as a drag-rebase (pointer is
   * on a mutable revision node or row) or a pan (pointer is on background).
   * `setPointerCapture` ensures subsequent move/up events are delivered here
   * regardless of where the pointer moves.
   */
  function onPointerDown(event: PointerEvent): void {
    // Middle-click always pans regardless of target.
    if (event.button === 1) {
      startPan(event);
      return;
    }
    // Right-click is handled by oncontextmenu; ignore here.
    if (event.button !== 0) return;

    const target = event.target as Element;
    const isOnRevision =
      target.classList.contains('node') ||
      target.classList.contains('revision-row') ||
      target.closest('.revision-row') !== null;
    const isOnOverlay =
      target.closest('.context-menu') !== null || target.closest('.zoom-toolbar') !== null;

    if (isOnOverlay) {
      // Let overlay elements handle their own events.
      return;
    }

    if (isOnRevision) {
      // Start tracking a potential drag-rebase. Only commit to drag once the
      // pointer moves beyond the drag threshold (6 px).
      const changeId = getChangeIdFromTarget(target);
      if (changeId !== null) {
        const revision = revisions.find((r) => r.changeId === changeId);
        if (revision !== undefined && !revision.isImmutable) {
          potentialDrag = { changeId, startX: event.clientX, startY: event.clientY };
          (event.currentTarget as Element).setPointerCapture(event.pointerId);
        }
      }
    } else {
      startPan(event);
    }
  }

  function startPan(event: PointerEvent): void {
    isPanning = true;
    panStartX = event.clientX;
    panStartY = event.clientY;
    panStartPanX = panX;
    panStartPanY = panY;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    if (isPanning) {
      panX = panStartPanX + (event.clientX - panStartX);
      panY = panStartPanY + (event.clientY - panStartY);
      return;
    }

    if (potentialDrag !== null) {
      const dx = event.clientX - potentialDrag.startX;
      const dy = event.clientY - potentialDrag.startY;
      // Commit to drag mode after 6 px of movement.
      if (Math.sqrt(dx * dx + dy * dy) > 6) {
        dragState = {
          sourceChangeId: potentialDrag.changeId,
          ghostX: event.clientX,
          ghostY: event.clientY,
          targetChangeId: findDropTarget(event.clientX, event.clientY),
        };
        potentialDrag = null;
      }
      return;
    }

    if (dragState !== null) {
      dragState = {
        ...dragState,
        ghostX: event.clientX,
        ghostY: event.clientY,
        targetChangeId: findDropTarget(event.clientX, event.clientY),
      };
    }
  }

  function onPointerUp(event: PointerEvent): void {
    if (isPanning) {
      isPanning = false;
      return;
    }

    // potentialDrag without committed dragState → this was a click, not a drag.
    // Clear the ref so the onClick handler fires normally.
    potentialDrag = null;

    if (dragState !== null) {
      const { sourceChangeId, targetChangeId } = dragState;
      dragState = null;
      // Set the flag so click handlers that follow this pointerup know to skip selection.
      isDragComplete = true;
      // Use requestAnimationFrame to clear the flag after all synchronous click
      // handlers have had a chance to run.
      requestAnimationFrame(() => {
        isDragComplete = false;
      });
      if (targetChangeId !== null) {
        vscode.postMessage({ type: 'dragRebase', sourceChangeId, targetChangeId });
      }
    }
  }

  function onPointerCancel(): void {
    isPanning = false;
    potentialDrag = null;
    dragState = null;
  }

  /**
   * Retrieve the `data-changeid` attribute from `target` or its nearest
   * ancestor that has one. Returns null if no such ancestor exists.
   */
  function getChangeIdFromTarget(target: Element): string | null {
    const found =
      target.getAttribute('data-changeid') !== null
        ? target
        : (target.closest('[data-changeid]') as Element | null);
    return found?.getAttribute('data-changeid') ?? null;
  }

  /**
   * Find the topmost valid drag-rebase drop target at the given viewport
   * coordinates.
   *
   * A valid target is a non-immutable revision other than the drag source.
   * The drag ghost element is excluded via `closest('.drag-ghost')`.
   */
  function findDropTarget(clientX: number, clientY: number): string | null {
    if (dragState === null) return null;
    const elements = document.elementsFromPoint(clientX, clientY);
    for (const el of elements) {
      // Skip the drag ghost and its children.
      if (el.closest('.drag-ghost') !== null) continue;
      const changeId = el.getAttribute('data-changeid');
      if (changeId === null) continue;
      if (changeId === dragState.sourceChangeId) continue;
      const revision = revisions.find((r) => r.changeId === changeId);
      if (revision === undefined || revision.isImmutable) continue;
      return changeId;
    }
    return null;
  }

  // ── Keyboard ────────────────────────────────────────────────────────────────

  function onRootKeyDown(event: KeyboardEvent): void {
    // Escape: cancel drag or dismiss context menu.
    if (event.key === 'Escape') {
      if (dragState !== null || potentialDrag !== null) {
        dragState = null;
        potentialDrag = null;
        event.stopPropagation();
        return;
      }
      if (contextMenu !== null) {
        contextMenu = null;
        event.stopPropagation();
        return;
      }
    }

    if (contextMenu !== null) return;

    // Ctrl+0: reset zoom and pan.
    if (event.key === '0' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      resetView();
      return;
    }

    // Ctrl++ / Ctrl+=: zoom in.
    if ((event.key === '=' || event.key === '+') && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      zoomIn();
      return;
    }

    // Ctrl+-: zoom out.
    if (event.key === '-' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      zoomOut();
      return;
    }

    if (layout.nodes.length === 0) return;

    // Arrow keys: navigate revision list.
    const currentIndex =
      selectedChangeId !== null
        ? layout.nodes.findIndex((n) => n.revision.changeId === selectedChangeId)
        : -1;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = layout.nodes[Math.min(currentIndex + 1, layout.nodes.length - 1)];
      if (next !== undefined) selectRevision(next.revision.changeId);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = layout.nodes[Math.max(currentIndex - 1, 0)];
      if (prev !== undefined) selectRevision(prev.revision.changeId);
    }
  }

  // ── Display helpers ─────────────────────────────────────────────────────────

  function shortId(changeId: string): string {
    return changeId.substring(0, 8);
  }

  function formatTimestamp(isoString: string): string {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      if (diffMs < 60_000) return 'just now';
      if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
      if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
      if (diffMs < 2_592_000_000) return `${Math.floor(diffMs / 86_400_000)}d ago`;
      return new Date(isoString).toLocaleDateString();
    } catch {
      return '';
    }
  }

  function firstLine(description: string): string {
    const trimmed = description.trim();
    if (trimmed === '') return '(no description)';
    const nl = trimmed.indexOf('\n');
    return nl >= 0 ? trimmed.substring(0, nl) : trimmed;
  }

  /** Accessible label for a graph node circle. */
  function nodeAriaLabel(node: LayoutNode): string {
    const prefix = node.revision.isWorkingCopy ? 'Working copy: ' : '';
    const desc = firstLine(node.revision.description);
    return `${prefix}${desc} (${shortId(node.revision.changeId)})`;
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const dropTargetChangeId = $derived(dragState?.targetChangeId ?? null);
  const isDragging = $derived(dragState !== null);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="graph-root"
  class:is-panning={isPanning}
  class:is-dragging={isDragging}
  onclick={dismissContextMenu}
  onkeydown={onRootKeyDown}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerCancel}
  onwheel={onWheel}
  ondragstart={(e) => e.preventDefault()}
  role="presentation"
  tabindex="-1"
>
  {#if viewState === 'empty'}
    <p class="status">No revisions to display. Open a jj repository to view the graph.</p>
  {:else if viewState === 'loading'}
    <p class="status loading">Loading revision graph…</p>
  {:else if viewState === 'error'}
    <p class="status error">{errorText}</p>
  {:else}
    <!--
      .graph-canvas is the pannable / zoomable content layer. CSS transform is
      applied here with transform-origin: 0 0 so that coordinates relative to
      the viewport top-left stay predictable.
    -->
    <div
      class="graph-canvas"
      style="transform: translate({panX}px, {panY}px) scale({zoom}); transform-origin: 0 0;"
    >
      <div class="graph-body">
        <!--
          SVG graph column: edges and node circles drawn at the correct row/column
          positions. Edges are drawn first so they appear behind nodes.
        -->
        <svg
          class="dag-svg"
          width={svgWidth}
          height={svgHeight}
          style="min-width: {svgWidth}px"
          aria-hidden="true"
        >
          <g class="edges">
            {#each layout.edges as edge (`${edge.childChangeId}-${edge.parentChangeId}`)}
              <path class="edge" d={edgePath(edge)} />
            {/each}
          </g>
          <g class="nodes">
            {#each layout.nodes as node (node.revision.changeId)}
              <circle
                class="node node-{node.nodeType}"
                class:node-selected={selectedChangeId === node.revision.changeId}
                class:node-drop-target={dropTargetChangeId === node.revision.changeId}
                class:node-drag-source={dragState?.sourceChangeId === node.revision.changeId}
                data-changeid={node.revision.changeId}
                cx={nodeX(node.column)}
                cy={nodeY(node.row)}
                r={NODE_RADIUS}
                role="button"
                tabindex="0"
                aria-label={nodeAriaLabel(node)}
                onclick={(e) => {
                  e.stopPropagation();
                  if (isDragComplete) { isDragComplete = false; return; }
                  selectRevision(node.revision.changeId);
                }}
                oncontextmenu={(e) => openContextMenu(e, node)}
                onkeydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectRevision(node.revision.changeId);
                  }
                }}
              />
            {/each}
          </g>
        </svg>

        <!--
          Revision info column: one row per revision, aligned with the SVG rows
          above via the fixed ROW_HEIGHT. Each row shows: bookmarks, change ID,
          description, author, and timestamp.

          `data-changeid` attributes enable hit-testing during drag-rebase.
        -->
        <!-- listbox/option roles allow aria-selected and tabindex on selectable rows -->
        <div class="revision-list" role="listbox" aria-label="Revisions">
          {#each layout.nodes as node (node.revision.changeId)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
              class="revision-row"
              class:selected={selectedChangeId === node.revision.changeId}
              class:drop-target={dropTargetChangeId === node.revision.changeId}
              class:drag-source={dragState?.sourceChangeId === node.revision.changeId}
              style="height: {ROW_HEIGHT}px"
              role="option"
              aria-selected={selectedChangeId === node.revision.changeId}
              tabindex="0"
              data-changeid={node.revision.changeId}
              onclick={(e) => {
                e.stopPropagation();
                if (isDragComplete) { isDragComplete = false; return; }
                selectRevision(node.revision.changeId);
              }}
              oncontextmenu={(e) => openContextMenu(e, node)}
              onkeydown={(e) => {
                if (e.key === 'Enter') selectRevision(node.revision.changeId);
              }}
            >
              <!-- Bookmark and tag pills -->
              <span class="rev-refs">
                {#each node.revision.localBookmarks as bookmark}
                  <span class="badge badge-bookmark" title="local bookmark: {bookmark}"
                    >{bookmark}</span
                  >
                {/each}
                {#each node.revision.remoteBookmarks as remote}
                  <span class="badge badge-remote" title="remote bookmark: {remote}"
                    >{remote}</span
                  >
                {/each}
                {#each node.revision.tags as tag}
                  <span class="badge badge-tag" title="tag: {tag}">{tag}</span>
                {/each}
              </span>

              <!-- Short change ID -->
              <span class="rev-id">{shortId(node.revision.changeId)}</span>

              <!-- First line of description -->
              <span class="rev-description" title={node.revision.description.trim()}>
                {firstLine(node.revision.description)}
              </span>

              <!-- Author name and relative timestamp -->
              <span class="rev-meta">
                {node.revision.authorName} · {formatTimestamp(node.revision.authorTimestamp)}
              </span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <!--
    Zoom toolbar overlay — shown in the bottom-right corner when there is
    content to display. Buttons zoom in/out and reset the view. Tooltips
    show the keyboard shortcuts.
  -->
  {#if viewState === 'content'}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="zoom-toolbar" role="toolbar" aria-label="Zoom controls">
      <button
        class="zoom-btn"
        aria-label="Zoom out"
        title="Zoom out (Ctrl+−)"
        onclick={(e) => {
          e.stopPropagation();
          zoomOut();
        }}
      >−</button>
      <button
        class="zoom-btn zoom-level"
        aria-label="Reset zoom to 100%"
        title="Reset zoom (Ctrl+0)"
        onclick={(e) => {
          e.stopPropagation();
          resetView();
        }}
      >{Math.round(zoom * 100)}%</button>
      <button
        class="zoom-btn"
        aria-label="Zoom in"
        title="Zoom in (Ctrl+=)"
        onclick={(e) => {
          e.stopPropagation();
          zoomIn();
        }}
      >+</button>
    </div>
  {/if}

  <!--
    Drag-rebase ghost indicator — follows the cursor during a drag gesture.
    Positioned slightly above-right of the cursor to avoid obscuring the
    element under the pointer. `pointer-events: none` ensures it does not
    interfere with drop-target hit-testing via `document.elementsFromPoint`.
  -->
  {#if dragState !== null}
    <div
      class="drag-ghost"
      style="left: {dragState.ghostX + 14}px; top: {dragState.ghostY - 28}px"
      aria-hidden="true"
    >
      {#if dragState.targetChangeId !== null}
        <span class="drag-label drag-label-valid">
          ↷ Rebase {shortId(dragState.sourceChangeId)} onto {shortId(dragState.targetChangeId)}
        </span>
      {:else}
        <span class="drag-label">
          ↷ {shortId(dragState.sourceChangeId)}…
        </span>
      {/if}
    </div>
  {/if}

  <!-- Custom context menu overlay (shown on right-click of a revision node or row) -->
  {#if contextMenu !== null}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="context-menu"
      style="left: {contextMenu.x}px; top: {contextMenu.y}px"
      role="menu"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
    >
      {#if !contextMenu.isWorkingCopy}
        <button class="menu-item" role="menuitem" onclick={() => dispatchContextAction('edit')}>
          Edit Revision
        </button>
      {/if}
      <button class="menu-item" role="menuitem" onclick={() => dispatchContextAction('newAfter')}>
        New Revision After…
      </button>
      {#if !contextMenu.isImmutable}
        <button
          class="menu-item"
          role="menuitem"
          onclick={() => dispatchContextAction('describe')}
        >
          Describe…
        </button>
        <button class="menu-item" role="menuitem" onclick={() => dispatchContextAction('squash')}>
          Squash into Parent…
        </button>
        <button class="menu-item" role="menuitem" onclick={() => dispatchContextAction('rebase')}>
          Rebase…
        </button>
        <hr class="menu-separator" />
        <button
          class="menu-item menu-item-destructive"
          role="menuitem"
          onclick={() => dispatchContextAction('abandon')}
        >
          Abandon
        </button>
        <hr class="menu-separator" />
      {/if}
      <button
        class="menu-item"
        role="menuitem"
        onclick={() => dispatchContextAction('copyChangeId')}
      >
        Copy Change ID
      </button>
      <button
        class="menu-item"
        role="menuitem"
        onclick={() => dispatchContextAction('copyCommitId')}
      >
        Copy Commit ID
      </button>
    </div>
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
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-editor-font-size, 13px);
    line-height: 1.4;
    overflow: hidden;
  }

  /* ── Root container ──────────────────────────────────────────────────────── */

  .graph-root {
    width: 100%;
    height: 100vh;
    overflow: hidden;
    outline: none;
    position: relative;
    /* Default cursor shows grab affordance on background areas. */
    cursor: grab;
  }

  /* Override cursor for interactive child elements inside the canvas. */
  .graph-root :global(.node),
  .graph-root :global(.revision-row) {
    cursor: pointer;
  }

  /* Grabbing cursor overrides everything while a pan or drag is in progress. */
  .graph-root.is-panning,
  .graph-root.is-panning :global(*),
  .graph-root.is-dragging,
  .graph-root.is-dragging :global(*) {
    cursor: grabbing;
  }

  /* ── Zoomable / pannable canvas ──────────────────────────────────────────── */

  .graph-canvas {
    /* transform applied inline from zoom/panX/panY state */
    transform-origin: 0 0;
    /* Prevent text selection during pan/drag gestures. */
    user-select: none;
    /* Inline-block so the canvas sizes to its content (needed for transform). */
    display: inline-block;
    position: absolute;
    top: 0;
    left: 0;
  }

  /* ── Status messages ─────────────────────────────────────────────────────── */

  .status {
    padding: 16px;
    margin: 0;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
  }

  .loading {
    opacity: 0.7;
  }

  .error {
    color: var(--vscode-errorForeground);
    font-style: normal;
  }

  /* ── Graph layout ────────────────────────────────────────────────────────── */

  .graph-body {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    min-height: 100%;
  }

  .dag-svg {
    flex-shrink: 0;
    display: block;
  }

  /* ── SVG edges ───────────────────────────────────────────────────────────── */

  .edge {
    fill: none;
    stroke: var(--vscode-foreground);
    stroke-width: 1.5;
    opacity: 0.3;
  }

  /* ── SVG node circles ────────────────────────────────────────────────────── */

  .node {
    stroke: var(--vscode-editor-background);
    stroke-width: 1.5;
    outline: none;
  }

  .node:hover,
  .node:focus {
    stroke: var(--vscode-focusBorder, #007fd4);
    stroke-width: 2;
  }

  /* Node type fills — ordered so .node-selected overrides the stroke below */
  .node-workingCopy {
    fill: var(--vscode-terminal-ansiYellow, #c5ac00);
  }
  .node-conflict {
    fill: var(--vscode-terminal-ansiRed, #cd3131);
  }
  .node-immutable {
    fill: var(--vscode-terminal-ansiBrightBlue, #729fcf);
  }
  .node-mutable {
    fill: var(--vscode-terminal-ansiGreen, #14a84b);
  }
  .node-empty {
    fill: none;
    stroke: var(--vscode-descriptionForeground, #8b8b8b);
    stroke-width: 1.5;
  }

  /* Selected state overrides the node-type stroke */
  .node-selected {
    stroke: var(--vscode-focusBorder, #007fd4);
    stroke-width: 2;
  }

  /* Drag source: dimmed to indicate it is being moved. */
  .node-drag-source {
    opacity: 0.5;
  }

  /* Drop target: pulsing ring to indicate a valid rebase destination. */
  .node-drop-target {
    stroke: var(--vscode-terminal-ansiYellow, #c5ac00);
    stroke-width: 3;
    filter: drop-shadow(0 0 3px var(--vscode-terminal-ansiYellow, #c5ac00));
  }

  /* ── Revision info rows ──────────────────────────────────────────────────── */

  .revision-list {
    flex: 1;
    overflow: hidden;
    min-width: 0;
  }

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

  /* Drag source row: dimmed and dashed border to show it's being moved. */
  .revision-row.drag-source {
    opacity: 0.5;
    border-left-color: var(--vscode-descriptionForeground, #8b8b8b);
    border-left-style: dashed;
  }

  /* Drop target row: highlighted border to show it's a valid rebase destination. */
  .revision-row.drop-target {
    background: color-mix(
      in srgb,
      var(--vscode-terminal-ansiYellow, #c5ac00) 15%,
      transparent
    );
    border-left-color: var(--vscode-terminal-ansiYellow, #c5ac00);
    border-left-width: 3px;
  }

  /* ── Revision row content ────────────────────────────────────────────────── */

  .rev-refs {
    display: flex;
    gap: 3px;
    flex-shrink: 0;
    align-items: center;
  }

  /* Hide the refs container entirely when it has no children */
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
    /* Prevent badge text from being clipped during drag/pan. */
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

  /* ── Zoom toolbar ─────────────────────────────────────────────────────────── */

  .zoom-toolbar {
    position: fixed;
    bottom: 12px;
    right: 12px;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0;
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border, #454545));
    border-radius: 4px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    z-index: 100;
    /* Toolbar is not zoomable / pannable — it uses position: fixed. */
    cursor: default;
  }

  .zoom-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 26px;
    padding: 0 6px;
    background: none;
    border: none;
    border-right: 1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border, #454545));
    cursor: pointer;
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-editor-font-size, 13px);
    line-height: 1;
  }

  .zoom-btn:last-child {
    border-right: none;
  }

  .zoom-btn:hover {
    background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
  }

  .zoom-btn:focus {
    outline: 1px solid var(--vscode-focusBorder, #007fd4);
    outline-offset: -1px;
  }

  .zoom-level {
    min-width: 46px;
    font-variant-numeric: tabular-nums;
    font-size: 0.85em;
  }

  /* ── Drag-rebase ghost ───────────────────────────────────────────────────── */

  .drag-ghost {
    position: fixed;
    pointer-events: none;
    z-index: 200;
    /* No background — just the text label with its own styling. */
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

  /* Valid drop target: green border + text to confirm the operation. */
  .drag-label-valid {
    border-color: var(--vscode-terminal-ansiGreen, #14a84b);
    color: var(--vscode-terminal-ansiGreen, #14a84b);
  }

  /* ── Context menu ────────────────────────────────────────────────────────── */

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
