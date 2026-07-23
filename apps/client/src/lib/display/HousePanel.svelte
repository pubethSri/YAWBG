<script lang="ts">
  import type { HousePublic } from "@yawbg/protocol";
  import HouseBoard from "../room/HouseBoard.svelte";

  // The doomsday clock, in all three visibility modes (docs/01). The server
  // already emits each of them; this is the rendering.
  //
  // The point of the panel is that its *shape* never changes between modes or
  // between phases — same heading, same square board slot, same dread line in
  // the same place — so the room learns where to look once. `progress` and
  // `hidden` simply have less to show, they don't get a different screen.
  //
  // Layout contract with the Stage (docs/09 decisions 1 and 2): the heading and
  // the dread row are pinned to --stage-house-head / --stage-house-dread, which
  // is what lets `.stage-columns` compute this column's width as "row height
  // minus chrome" and land the board exactly. Changing either height here
  // without changing the token there re-introduces dead space.
  let {
    house,
    bingoTarget,
  }: {
    house: HousePublic;
    bingoTarget: number;
  } = $props();

  const hasBingo = $derived(house.mode !== "hidden" && house.linesCompleted >= bingoTarget);
</script>

<section class="flex min-h-0 min-w-0 flex-col gap-[var(--stage-house-gap)]">
  <h2
    class="flex h-[var(--stage-house-head)] shrink-0 items-center font-ui text-d-heading font-bold text-ink-black"
  >
    The House
  </h2>

  <div class="flex min-h-0 flex-1 items-center justify-center">
    <!-- Board and dread chip are one centred unit (docs/09 decision 2). The
         chip used to be pushed to the bottom of the column by a flex-1 above
         it, which read as an orphan in the corner rather than as a caption on
         the House. -->
    <div class="flex w-full flex-col items-center gap-[var(--stage-house-gap)]">
      <!-- Width-bound, not height-bound: the column width is already the
           smaller of the two constraints, so a square that fills it always
           fits vertically too. -->
      <div class="w-full aspect-square">
        {#if house.mode === "full"}
          <HouseBoard {house} variant="display" />
        {:else if house.mode === "progress"}
          <!-- No board, so the number itself becomes the object: same dread,
               less information. Ink on cream, 17.8:1. -->
          <div class="flex h-full flex-col items-center justify-center text-center">
            <span class="tabular font-shout text-d-number font-extrabold leading-none text-ink-black">
              {hasBingo ? "!" : house.bestLineNeeds}
            </span>
            <span class="font-ui text-d-heading font-bold uppercase tracking-[0.03em] text-ink-black">
              {hasBingo ? "House bingo" : "away from a line"}
            </span>
          </div>
        {:else}
          <div class="flex h-full flex-col items-center justify-center text-center">
            <span class="font-shout text-d-number font-extrabold leading-none text-ink-black">
              ???
            </span>
            <span class="font-ui text-d-heading font-bold text-ink-black">
              The House keeps its board
            </span>
          </div>
        {/if}
      </div>

      <!-- The dread line: always in the same place, whatever the mode. Its
           height is pinned so the mode never changes the panel's geometry. -->
      <div
        class="flex h-[var(--stage-house-dread)] shrink-0 items-center justify-center gap-[0.8vw]"
      >
        {#if house.mode === "hidden"}
          <span
            class="rounded-[var(--radius-tag)] border-2 border-near-black bg-paper-white px-[0.8vw] py-[0.4vh] font-ui text-d-body-sm font-semibold text-ink-black"
          >
            Hidden
          </span>
        {:else if hasBingo}
          <span
            class="-rotate-2 rounded-[var(--radius-button)] bg-coral-blaze px-[1vw] py-[0.5vh] font-shout text-d-heading font-extrabold tracking-[0.03em] text-ink-black"
          >
            HOUSE BINGO
          </span>
        {:else}
          <span
            class="tabular rounded-[var(--radius-tag)] border-2 border-near-black bg-paper-white px-[0.8vw] py-[0.4vh] font-ui text-d-body-sm font-semibold text-coral-blaze"
          >
            {house.bestLineNeeds} away
          </span>
        {/if}
        {#if house.mode !== "hidden" && house.linesCompleted > 0}
          <span
            class="tabular rounded-[var(--radius-tag)] bg-electric-violet px-[0.8vw] py-[0.4vh] font-ui text-d-body-sm font-semibold text-paper-white"
          >
            {house.linesCompleted} / {bingoTarget} lines
          </span>
        {/if}
      </div>
    </div>
  </div>
</section>
