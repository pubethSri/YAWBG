<script lang="ts">
  import type { Snippet } from "svelte";

  // The bottom sheet from docs/07: paper white, 15px top radius, drag handle,
  // visible close affordance, on a plain ink scrim at 50% (no blur — the one
  // sanctioned overlay).
  let {
    title,
    onClose,
    children,
  }: { title: string; onClose: () => void; children: Snippet } = $props();
</script>

<div
  class="fixed inset-0 z-10 flex items-end bg-ink-black/50"
  role="button"
  tabindex="0"
  onclick={(e) => {
    if (e.target === e.currentTarget) onClose();
  }}
  onkeydown={(e) => {
    if (e.key === "Escape") onClose();
  }}
>
  <div
    class="max-h-[85vh] w-full overflow-y-auto rounded-t-[var(--radius-card)] bg-paper-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
  >
    <div class="mx-auto mb-3 h-1 w-10 rounded-[var(--radius-pill)] bg-mist-gray"></div>
    <div class="mb-3 flex items-center justify-between gap-2">
      <p class="font-ui text-body-sm font-semibold text-slate-gray">{title}</p>
      <button
        class="rounded-[var(--radius-button)] border-2 border-near-black px-2 py-1 font-ui text-caption font-semibold"
        onclick={onClose}
      >
        Close
      </button>
    </div>
    {@render children()}
  </div>
</div>
