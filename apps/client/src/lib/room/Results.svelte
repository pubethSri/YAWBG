<script lang="ts">
  import type { PublicRoomState } from "@yawbg/protocol";
  import { socket } from "../socket.svelte";
  import { shareBoard, type ShareOutcome } from "../share";
  import HouseBoard from "./HouseBoard.svelte";
  import Starburst from "../Starburst.svelte";

  /**
   * The host-paced reveal (docs/05 locked decision 6): ⓪ winners → ① pool
   * authorship roast → ② boards + share. Every phone and every display moves
   * together on the host's tap — the roast is a shared moment, not a private
   * scroll, so there is deliberately no "skip ahead" affordance here.
   *
   * The server withholds `results.boards` until stage ①, so stages ① and ② are
   * genuinely unrenderable early rather than merely hidden.
   */
  let { roomState }: { roomState: PublicRoomState } = $props();

  const results = $derived(roomState.results);
  const stage = $derived(results?.revealStage ?? 0);
  const house = $derived(roomState.house);
  const me = $derived(roomState.players.find((p) => p.id === socket.session?.playerId));
  const iAmHost = $derived(!!me?.isHost);
  const iWon = $derived(!!me && !!results?.winners.includes(me.id));

  const nameOf = (id: string | null): string => {
    if (id === null) return "you";
    return roomState.players.find((p) => p.id === id)?.name ?? "someone who left";
  };

  // Rank by lines, then by who got there first — bragging rights only (docs/01).
  const ranked = $derived([...roomState.players].sort((a, b) => b.linesCompleted - a.linesCompleted));

  const myBoard = $derived(results?.boards.find((b) => b.playerId === me?.id));

  /** What the table did to you. */
  const receivedPool = $derived(
    myBoard?.cells.map((c, i) => ({ ...c, i })).filter((c) => c.authorId !== null) ?? [],
  );

  /** And what you did to them — the roast only lands if it runs both ways. */
  const myVictims = $derived(
    (results?.boards ?? [])
      .filter((b) => b.playerId !== me?.id)
      .flatMap((b) =>
        b.cells
          .map((c, i) => ({ ...c, i, victimId: b.playerId }))
          .filter((c) => c.authorId === me?.id),
      ),
  );

  // K = 0 means the server skips stage ① entirely, so the button has to promise
  // the stage the room will actually land on.
  const poolInPlay = $derived(roomState.settings.sabotageCells > 0);
  const nextLabel = $derived(stage === 0 ? (poolInPlay ? "Who did this to you" : "The boards") : "The boards");

  let sharing = $state(false);
  let shareNote = $state<string | null>(null);

  async function share() {
    if (!myBoard || !me) return;
    sharing = true;
    shareNote = null;
    try {
      const outcome: ShareOutcome = await shareBoard({
        playerName: me.name,
        roomCode: roomState.code,
        cells: myBoard.cells,
        linesCompleted: me.linesCompleted,
        won: iWon,
      });
      if (outcome === "downloaded") shareNote = "Saved to your downloads.";
    } catch (e) {
      shareNote = "Couldn't render the image on this device.";
      console.error(e);
    } finally {
      sharing = false;
    }
  }
</script>

{#if results}
  <div class="mx-auto flex max-w-md flex-col gap-4 p-4 pb-28">
    <!-- Stage ⓪ — the verdict. Stays on screen through every later stage: it is
         the headline, not a slide. -->
    <div class="flex items-start gap-3">
      <Starburst
        label={iWon ? "WINNER" : "SO CLOSE"}
        size="min(28vw, 128px)"
        fill={iWon ? "yellow" : "coral"}
        rotate={iWon ? -8 : 6}
      />
      <p class="mt-2 font-ui text-body-sm text-slate-gray">
        The House got bingo. {results.winners.length}
        {results.winners.length === 1 ? "player" : "players"} made it.
      </p>
    </div>

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

    {#if stage === 0}
      <p class="font-ui text-body-sm text-slate-gray">
        {#if iAmHost}
          Everyone's looking at this screen. Move the room on when the noise dies down.
        {:else}
          Waiting for the host to move the room on…
        {/if}
      </p>
    {/if}

    <!-- Stage ① — the roast. Authorship has been server-side-only all game; this
         is the first frame that carries it. -->
    {#if stage >= 1 && poolInPlay}
      <div class="anim-rise rounded-[var(--radius-card)] border border-near-black bg-paper-white p-4">
        <h2 class="mb-2 font-ui text-heading font-bold">Who did this to you</h2>
        {#if receivedPool.length > 0}
          <ul class="flex flex-col gap-1.5">
            {#each receivedPool as cell (cell.i)}
              <li class="font-ui text-body-sm">
                <span class="font-semibold">{cell.name}</span>
                <span class="text-slate-gray"> — from {nameOf(cell.authorId)}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="font-ui text-body-sm text-slate-gray">Nothing landed on your board.</p>
        {/if}

        {#if myVictims.length > 0}
          <h3 class="mt-4 mb-2 font-ui text-body font-bold">And what you did</h3>
          <ul class="flex flex-col gap-1.5">
            {#each myVictims as cell (cell.victimId + cell.i)}
              <li class="font-ui text-body-sm">
                <span class="font-semibold">{cell.name}</span>
                <span class="text-slate-gray"> — onto {nameOf(cell.victimId)}'s board</span>
                {#if cell.locked}
                  <span
                    class="ml-1 rounded-[var(--radius-tag)] bg-electric-violet px-1.5 py-0.5 text-caption font-semibold text-paper-white"
                  >
                    they locked it
                  </span>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}

    <!-- Stage ② — every board, the House, the replay list, and the share. -->
    {#if stage >= 2}
      <div class="anim-rise flex flex-col gap-4">
        {#if myBoard}
          <button
            class="rounded-[var(--radius-button)] border-2 border-ink-black bg-ink-black px-4 py-3 font-ui text-body font-bold text-paper-white disabled:border-pale-gray disabled:bg-mist-gray disabled:text-slate-gray"
            onclick={share}
            disabled={sharing}
          >
            {sharing ? "Rendering…" : "Share your board"}
          </button>
          {#if shareNote}
            <p class="font-ui text-caption text-slate-gray">{shareNote}</p>
          {/if}
        {/if}

        <h2 class="font-ui text-heading font-bold">The boards</h2>
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
          <h2 class="font-ui text-heading font-bold">The House</h2>
          <div class="rounded-[var(--radius-card)] border border-near-black bg-paper-white p-3">
            <HouseBoard {house} />
          </div>
        {/if}

        {#if results.roundHistory.length > 0}
          <h2 class="font-ui text-heading font-bold">How it went</h2>
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
    {/if}
  </div>

  <!-- Host pacing bar. Pinned, because the reveal is long and the control that
       moves the whole room must never be something the host has to hunt for. -->
  {#if iAmHost}
    <div
      class="fixed inset-x-0 bottom-0 border-t-2 border-ink-black bg-cream-blush p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div class="mx-auto max-w-md">
        {#if stage < 2}
          <button
            class="w-full rounded-[var(--radius-button)] border-2 border-ink-black bg-paper-white px-4 py-3 font-ui text-body font-bold text-ink-black"
            onclick={() => socket.advanceReveal()}
          >
            Next: {nextLabel}
          </button>
        {:else}
          <button
            class="w-full rounded-[var(--radius-button)] border-2 border-ink-black bg-paper-white px-4 py-3 font-ui text-body font-bold text-ink-black"
            onclick={() => socket.playAgain()}
          >
            Play again — same settings
          </button>
        {/if}
      </div>
    </div>
  {/if}
{:else}
  <p class="p-6 font-ui text-body">Counting up…</p>
{/if}
