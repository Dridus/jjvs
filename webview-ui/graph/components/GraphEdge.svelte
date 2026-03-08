<script lang="ts">
  import type { LayoutEdge } from '../dag-layout.js';
  import { edgePath } from '../graph-utils.js';

  const { edge }: { edge: LayoutEdge } = $props();
</script>

<path class="edge" d={edgePath(edge)} />

<style>
  .edge {
    fill: none;
    stroke: var(--vscode-foreground);
    stroke-width: 1.5;
    opacity: 0.3;
  }
</style>
