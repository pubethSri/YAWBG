<script lang="ts">
  import type { PublicRoomState } from "@yawbg/protocol";
  import { socket } from "../socket.svelte";
  import HouseBoard from "./HouseBoard.svelte";

  // The plain reveal. The host-paced sequence (results.advance / revealStage)
  // is M4 — the payload already carries everything it will need.
  let { roomState }: { roomState: PublicRoomState } = $props();

  const results = $derived(roomState.results);
  const house = $derived(roomState.house);
  const me = $derived(roomState.players.find((p) => p.id === socket.session?.playerId));
  const iWon = $derived(!!me && results?.winners.includes(me.id));

  const nameOf = (id: string | null): string => {
    if (id === null) return "you";
    return roomState.players.find((p) => p.id === id)?.name ?? "someone who left";
  };

  // Rank by lines, then by who got there first — bragging rights only.
  const ranked = $derived(
    [...roomState.players].sort((a, b) => b.linesCompleted - a.linesCompleted),
  );

  const poolCells = $derived(
    results?.boards
      .find((b) => b.playerId === me?.id)
      ?.cells.map((c, i) => ({ ...c, i }))
      .filter((c) => c.authorId !== null) ?? [],
  );
</script>

{#if results}
  <div class="mx-auto flex max-w-md flex-col gap-4 p-4">
    <div class="flex flex-col items-start gap-2">
      <span
        class="-rotate-2 rounded-[var(--radius-card)] px-4 py-2 font-shout text-hero font-extrabold leading-none tracking-[0.03em] text-ink-black"
        class:bg-sunburst-yellow={iWon}
        class:bg-coral-blaze={!iWon}
      >
        {iWon ? "WINNER" : "SO CLOSE"}
      </span>
      <p class="font-ui text-body-sm text-slate-gray">
        The House got bingo. {results.winners.length}
        {results.winners.length === 1 ? "player" : "players"} made it.
      </p>
    </div>

    <!-- Winners -->
    <div class="rounded-[var(--radius-card)] border border-near-black bg-paper-white p-4">
      <h2 class="mb-2 font-game text-verdict font-bold leading-[1.15]">Results</h2>
      <ol class="flex flex-col gap-1.5">
        {#each ranked as p (p.id)}
          <li class="flex items-center gap-2 font-ui text-body">
            <span class="font-semibold">{p.name}</span>
            {#if p.hasWon}
              <span
                class="rounded-[var(--radius-tag)] bg-sunburst-yellow px-1.5 py-0.5 text-caption font-semibold text-ink-black"
              >
                won
              </span>
            {/if}
            <span class="tabular ml-auto text-body-sm text-slate-gray">
              {p.linesCompleted}
              {p.linesCompleted === 1 ? "line" : "lines"}
            </span>
          </li>
        {/each}
      </ol>
      <p class="mt-2 font-ui text-caption text-slate-gray">
        Needed {roomState.settings.playerLinesToWin} to win.
      </p>
    </div>

    <!-- Pool authorship roast (only when the pool was in play) -->
    {#if poolCells.length > 0}
      <div class="rounded-[var(--radius-card)] border border-near-black bg-paper-white p-4">
        <h2 class="mb-2 font-ui text-heading font-bold">Who did this to you</h2>
        <ul class="flex flex-col gap-1.5">
          {#each poolCells as cell (cell.i)}
            <li class="font-ui text-body-sm">
              <span class="font-semibold">{cell.name}</span>
              <span class="text-slate-gray"> — from {nameOf(cell.authorId)}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <!-- Every board, fully revealed with its lock tags -->
    <h2 class="mt-2 font-ui text-heading font-bold">The boards</h2>
    {#each results.boards as b (b.playerId)}
      {@const player = roomState.players.find((p) => p.id === b.playerId)}
      <div class="rounded-[var(--radius-card)] border border-near-black bg-paper-white p-3">
        <div class="mb-2 flex items-center gap-2 font-ui text-body-sm">
          <span class="font-semibold">{player?.name ?? "—"}</span>
          {#if results.winners.includes(b.playerId)}
            <span
              class="rounded-[var(--radius-tag)] bg-sunburst-yellow px-1.5 py-0.5 text-caption font-semibold text-ink-black"
            >
              won
            </span>
          {/if}
          <span class="tabular ml-auto text-slate-gray">
            {player?.linesCompleted ?? 0} lines
          </span>
        </div>
        <div class="grid grid-cols-5 gap-1">
          {#each b.cells as cell, i (i)}
            <div
              class="flex aspect-square flex-col items-center justify-center overflow-hidden rounded-[var(--radius-tag)] border border-near-black p-0.5 text-center font-ui text-caption leading-tight"
              class:bg-electric-violet={cell.locked !== null}
              class:text-paper-white={cell.locked !== null}
              class:bg-paper-white={cell.locked === null}
            >
              <span class="line-clamp-2 break-words font-semibold">{cell.name}</span>
              {#if cell.locked}
                <span class="tabular mt-0.5 opacity-90">R{cell.locked.round}</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}

    <!-- The doomsday clock, finally shown whatever the visibility setting was -->
    {#if house && house.mode === "full"}
      <h2 class="mt-2 font-ui text-heading font-bold">The House</h2>
      <div class="rounded-[var(--radius-card)] border border-near-black bg-paper-white p-3">
        <HouseBoard {house} />
      </div>
    {/if}

    <!-- Round history -->
    {#if results.roundHistory.length > 0}
      <h2 class="mt-2 font-ui text-heading font-bold">How it went</h2>
      <div class="flex flex-col gap-2">
        {#each results.roundHistory as r (r.round)}
          <div class="rounded-[var(--radius-tag)] border border-near-black bg-paper-white p-3 font-ui text-body-sm">
            <div class="flex items-baseline gap-2">
              <span class="tabular font-semibold">R{r.round}</span>
              <span class="tabular text-slate-gray">{r.drawnNumbers.join(" · ")}</span>
            </div>
            <p class="font-game text-body">“{r.topicText}”</p>
            {#if r.locks.length > 0}
              <ul class="mt-1 flex flex-col gap-0.5 text-slate-gray">
                {#each r.locks as lock (lock.playerId + lock.cellIndex)}
                  <li>
                    {roomState.players.find((p) => p.id === lock.playerId)?.name ?? "—"} locked
                    <span class="font-semibold text-ink-black">{lock.name}</span>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="mt-1 text-slate-gray">nobody locked</p>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{:else}
  <p class="p-6 font-ui text-body">Counting up…</p>
{/if}
