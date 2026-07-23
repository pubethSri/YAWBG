<script lang="ts">
  import type { PublicRoomState } from "@yawbg/protocol";
  import HouseBoard from "../room/HouseBoard.svelte";
  import Starburst from "../Starburst.svelte";

  /**
   * The display half of the host-paced reveal (docs/05: the display mirrors the
   * phone sequence stage-by-stage). Same `revealStage` off the same snapshot, so
   * the TV can never be a stage ahead of the room — and never a side channel
   * either: the server withholds stage-① data from *this* frame too.
   *
   * The display never scrolls (h-dvh + overflow-hidden). Each stage is its own
   * self-contained layout rather than a long page the room can't reach the
   * bottom of.
   */
  let { roomState }: { roomState: PublicRoomState } = $props();

  const results = $derived(roomState.results);
  const stage = $derived(results?.revealStage ?? 0);
  const house = $derived(roomState.house);
  const winners = $derived(roomState.players.filter((p) => results?.winners.includes(p.id)));
  const ranked = $derived([...roomState.players].sort((a, b) => b.linesCompleted - a.linesCompleted));

  const nameOf = (id: string): string =>
    roomState.players.find((p) => p.id === id)?.name ?? "someone who left";

  /**
   * The whole table's authorship, not one player's: on the TV the roast is
   * "who did what to whom", which is the version the room argues about.
   */
  const roast = $derived(
    (results?.boards ?? []).flatMap((b) =>
      b.cells
        .map((c, i) => ({ ...c, i, victimId: b.playerId }))
        .filter((c) => c.authorId !== null),
    ),
  );
</script>

{#if results}
  {#if stage === 0}
    <!-- ⓪ The verdict. -->
    <div class="grid h-dvh grid-cols-[minmax(0,1fr)_auto] gap-[3vw] overflow-hidden p-[3vw]">
      <div class="flex min-w-0 flex-col gap-[2vh]">
        <div class="flex items-center gap-[2vw]">
          <Starburst
            label={winners.length > 0 ? "BINGO" : "HOUSE WINS"}
            size="min(22vh, 20vw)"
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
              {roomState.settings.playerLinesToWin === 1 ? "line" : "lines"} to win · the host moves
              the room on
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
  {:else if stage === 1}
    <!-- ① The roast. One idea on screen, at the size the room can read. -->
    <div class="flex h-dvh flex-col gap-[2vh] overflow-hidden p-[3vw]">
      <h1 class="font-game text-d-verdict font-bold leading-[1.1] text-ink-black">
        Who did this to whom
      </h1>
      {#if roast.length > 0}
        <div
          class="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(28vw,1fr))] gap-[1.5vh] gap-x-[2vw] overflow-hidden"
        >
          {#each roast as cell (cell.victimId + cell.i)}
            <div
              class="anim-pop rounded-[var(--radius-card)] border-2 border-near-black bg-paper-white px-[1.2vw] py-[1vh]"
            >
              <p class="truncate font-ui text-d-body font-bold text-ink-black">{cell.name}</p>
              <p class="truncate font-ui text-d-body-sm text-slate-gray">
                {nameOf(cell.authorId!)} → {nameOf(cell.victimId)}
              </p>
            </div>
          {/each}
        </div>
      {:else}
        <p class="font-ui text-d-body text-slate-gray">No pool names this game.</p>
      {/if}
    </div>
  {:else}
    <!-- ② Every board at once. Names are readable up close; the violet shape of
         a finished board is what reads from across the room. -->
    <div class="flex h-dvh flex-col gap-[1.5vh] overflow-hidden p-[3vw]">
      <div class="flex items-baseline gap-[2vw]">
        <h1 class="font-game text-d-verdict font-bold leading-[1.1] text-ink-black">The boards</h1>
        <p class="font-ui text-d-body text-slate-gray">Share yours from your phone</p>
      </div>
      <div
        class="grid min-h-0 flex-1 grid-cols-[repeat(auto-fit,minmax(0,1fr))] items-start gap-[2vw] overflow-hidden"
      >
        {#each results.boards as b (b.playerId)}
          {@const player = roomState.players.find((p) => p.id === b.playerId)}
          <div class="flex min-w-0 flex-col gap-[0.8vh]">
            <div class="flex items-baseline gap-[0.6vw]">
              <span class="min-w-0 truncate font-ui text-d-body font-bold text-ink-black">
                {player?.name ?? "—"}
              </span>
              {#if results.winners.includes(b.playerId)}
                <span
                  class="shrink-0 rounded-[var(--radius-tag)] bg-sunburst-yellow px-[0.5vw] font-ui text-d-caption font-semibold text-ink-black"
                >
                  won
                </span>
              {/if}
            </div>
            <!-- Sized by the height left over, not by the column width. With two
                 players a column is ~46vw, and `aspect-square` alone then asks
                 for ~46vw of *height* — more than the stage has, so the bottom
                 row fell off the screen. Constraining both axes is the same rule
                 Starburst follows. -->
            <div
              class="mx-auto grid aspect-square w-[min(100%,64vh)] grid-cols-5 gap-[0.3vw]"
            >
              {#each b.cells as cell, i (i)}
                <div
                  class="flex items-center justify-center overflow-hidden rounded-[3px] border border-near-black p-[2px] text-center font-ui text-d-caption leading-none"
                  class:bg-electric-violet={cell.locked !== null}
                  class:text-paper-white={cell.locked !== null}
                  class:bg-paper-white={cell.locked === null}
                >
                  <span class="line-clamp-2 break-words">{cell.name}</span>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
{/if}
