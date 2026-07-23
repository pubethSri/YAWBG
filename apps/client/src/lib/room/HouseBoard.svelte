<script lang="ts">
  import type { HousePublic } from "@yawbg/protocol";

  // Shared by the phone's House sheet and the display Stage, so the doomsday
  // clock reads as the same object on both surfaces (docs/05's display-optional
  // principle: the display duplicates and dramatizes, it never owns anything).
  let {
    house,
    variant = "phone",
  }: {
    house: Extract<HousePublic, { mode: "full" }>;
    variant?: "phone" | "display";
  } = $props();

  const hits = $derived(new Set(house.hits));
  const display = $derived(variant === "display");
</script>

<div class="grid grid-cols-5" class:gap-1={!display} class:gap-2={display}>
  {#each house.board as number, i (i)}
    <div
      class="tabular fill-transition flex aspect-square items-center justify-center rounded-[var(--radius-tag)]
             border-near-black font-ui font-semibold text-ink-black
             {display ? 'border-2 text-d-cell' : 'border text-body-sm'}"
      class:bg-coral-blaze={hits.has(i)}
      class:bg-paper-white={!hits.has(i)}
    >
      {#if number === null}
        <span class="font-ui font-semibold {display ? 'text-d-caption' : 'text-caption'}">FREE</span>
      {:else}
        {number}
      {/if}
    </div>
  {/each}
</div>
