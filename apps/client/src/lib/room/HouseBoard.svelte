<script lang="ts">
  import type { HousePublic } from "@yawbg/protocol";

  let { house }: { house: Extract<HousePublic, { mode: "full" }> } = $props();

  const hits = $derived(new Set(house.hits));
</script>

<div class="grid grid-cols-5 gap-1">
  {#each house.board as number, i (i)}
    <div
      class="tabular flex aspect-square items-center justify-center rounded-[var(--radius-tag)] border border-near-black font-ui text-body-sm font-semibold text-ink-black"
      class:bg-coral-blaze={hits.has(i)}
      class:bg-paper-white={!hits.has(i)}
    >
      {#if number === null}
        <span class="font-ui text-caption font-semibold">FREE</span>
      {:else}
        {number}
      {/if}
    </div>
  {/each}
</div>
