<script lang="ts">
  import type { PublicRoomState } from "@yawbg/protocol";
  import HouseBoard from "../room/HouseBoard.svelte";
  import Starburst from "../Starburst.svelte";

  /**
   * The plain reveal, mirroring the phone (docs/05 says the display mirrors the
   * phone sequence stage-by-stage). The host-paced sequence — `results.advance`
   * driving `revealStage` 0→1→2 — is **M4**, and the payload already carries
   * everything it needs. Deliberately not built here.
   */
  let { roomState }: { roomState: PublicRoomState } = $props();

  const results = $derived(roomState.results);
  const house = $derived(roomState.house);
  const winners = $derived(
    roomState.players.filter((p) => results?.winners.includes(p.id)),
  );
  const ranked = $derived([...roomState.players].sort((a, b) => b.linesCompleted - a.linesCompleted));
</script>

{#if results}
  <div class="grid h-dvh grid-cols-[minmax(0,1fr)_auto] gap-[3vw] overflow-hidden p-[3vw]">
    <div class="flex min-w-0 flex-col gap-[2vh]">
      <div class="flex items-center gap-[2vw]">
        <Starburst
          label={winners.length > 0 ? "BINGO" : "HOUSE WINS"}
          size="22vh"
          fill={winners.length > 0 ? "yellow" : "coral"}
          rotate={-8}
        />
        <div class="min-w-0">
          <h1 class="font-game text-d-verdict font-bold leading-[1.1] text-ink-black">
            {#if winners.length === 0}
              Nobody made it
            {:else if winners.length === 1}
              {winners[0]!.name} wins
            {:else}
              {winners.length} winners
            {/if}
          </h1>
          <p class="mt-[1vh] font-ui text-d-body text-slate-gray">
            {roomState.settings.playerLinesToWin}
            {roomState.settings.playerLinesToWin === 1 ? "line" : "lines"} to win · check your phone
            for the boards
          </p>
        </div>
      </div>

      <div class="flex min-h-0 flex-col gap-[1vh] overflow-hidden">
        {#each ranked as p (p.id)}
          <div
            class="flex items-center gap-[1vw] rounded-[var(--radius-tag)] border-2 border-near-black px-[1vw] py-[0.6vh]"
            class:bg-sunburst-yellow={p.hasWon}
            class:bg-paper-white={!p.hasWon}
          >
            <span class="min-w-0 truncate font-ui text-d-body font-semibold text-ink-black">
              {p.name}
            </span>
            <span class="tabular ml-auto shrink-0 font-ui text-d-body font-semibold text-ink-black">
              {p.linesCompleted}
              {p.linesCompleted === 1 ? "line" : "lines"}
            </span>
          </div>
        {/each}
      </div>
    </div>

    <!-- The doomsday clock, revealed whatever the visibility setting was. -->
    {#if house && house.mode === "full"}
      <div class="flex min-h-0 flex-col items-center gap-[1.5vh]">
        <h2 class="font-ui text-d-heading font-bold text-ink-black">The House</h2>
        <div class="aspect-square max-h-full">
          <HouseBoard {house} variant="display" />
        </div>
      </div>
    {/if}
  </div>
{/if}
