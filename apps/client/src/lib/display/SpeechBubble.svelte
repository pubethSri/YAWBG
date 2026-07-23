<script lang="ts">
  import type { Snippet } from "svelte";

  // docs/07's speech bubble: white fill, 15px radius, a small triangular tail.
  // Used for the proposal on stage — the display's job is to make the thing the
  // table is arguing about impossible to misread from the back of the room.
  let { rotate = -1.5, children }: { rotate?: number; children: Snippet } = $props();
</script>

<div
  class="relative rounded-[var(--radius-card)] border-2 border-ink-black bg-paper-white p-[2vw]"
  style="transform: rotate({rotate}deg);"
>
  {@render children()}
  <!-- Tail: an ink triangle with a white one sitting just inside it, so the
       outline reads as continuous without a shadow or a mask. -->
  <div
    class="absolute left-[8%] top-full h-0 w-0 border-l-[1.6vw] border-r-[1.6vw] border-t-[2.2vh] border-l-transparent border-r-transparent border-t-ink-black"
  ></div>
  <div
    class="absolute left-[8%] top-full ml-[0.28vw] h-0 w-0 border-l-[1.32vw] border-r-[1.32vw] border-t-[1.8vh] border-l-transparent border-r-transparent border-t-paper-white"
  ></div>
</div>
