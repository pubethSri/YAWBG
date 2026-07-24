<script lang="ts">
  import type { PublicRoomState } from "@yawbg/protocol";
  import HouseBoard from "../room/HouseBoard.svelte";
  import ReelCard from "../ReelCard.svelte";
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

  // ── Stage ③: the reel ────────────────────────────────────────────────────
  const reel = $derived(results?.reel ?? []);

  /** docs/10 decision 7: the TV rotates, the phone swipes. */
  const ROTATE_MS = 10_000;

  /**
   * A lookup table rather than arithmetic, for the reason docs/09 records about
   * the waiting-room chips: a formula reliably lands some index on exactly 0°,
   * and one untilted card in a rotation of tilted ones reads as a bug.
   * Neighbours never share a sign, so every change of card is a visible change
   * of tilt even when the fade is collapsed by reduced motion.
   */
  const TILTS = [-2.5, 2, -1.5, 3, -2, 1.5];

  let cardIndex = $state(0);

  /**
   * Armed on the reel's length, not re-run per snapshot. `results` is a fresh
   * object on every `room.state` frame, so an effect that merely reads it would
   * re-arm the interval on every broadcast — the same trap the round countdown
   * hit, where re-arming per frame meant the clock never reached zero. Here it
   * would mean the card never changed.
   */
  let armedFor = -1;
  let rotateTimer: ReturnType<typeof setInterval> | null = null;

  $effect(() => {
    const n = reel.length;
    if (n === armedFor) return;
    armedFor = n;
    cardIndex = 0;
    if (rotateTimer) clearInterval(rotateTimer);
    rotateTimer = null;
    // One card doesn't rotate, and the dots hide themselves below.
    if (n > 1) rotateTimer = setInterval(() => (cardIndex = (cardIndex + 1) % n), ROTATE_MS);
  });

  // Teardown only — kept out of the effect above so its cleanup can't cancel
  // the interval that effect just armed.
  $effect(() => () => {
    if (rotateTimer) clearInterval(rotateTimer);
  });
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
  {:else if stage === 2}
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
  {:else}
    <!-- ③ The reel. One card at a time, auto-rotating — the room is done
         playing and this is an idle screen it can keep watching, so it holds
         one idea at the size the whole table can read rather than a grid. -->
    <div class="flex h-dvh flex-col gap-[2vh] overflow-hidden p-[3vw]">
      <div class="flex shrink-0 items-baseline gap-[2vw]">
        <h1 class="font-game text-d-verdict font-bold leading-[1.1] text-ink-black">
          The highlight reel
        </h1>
        <p class="font-ui text-d-body text-slate-gray">
          Swipe through it on your phone · the host can start another game
        </p>
      </div>

      {#if reel.length > 0}
        <!-- min-h-0 so the card is bounded by the space left over rather than
             by its own content: a 12-entry card is exactly the shape that has
             pushed this screen past the viewport twice before, and the display
             never scrolls. -->
        <div class="flex min-h-0 flex-1 justify-center px-[4vw]">
          {#key reel[cardIndex]?.round}
            <!-- `h-full`, not `max-h-full`, and the outer row must NOT centre:
                 the card's own `max-h-full` is a percentage, and a percentage
                 max-height against an auto-height parent resolves to `none`.
                 With `items-center` on the row this div shrank to its content,
                 the cap silently stopped applying, and a 12-entry card ran 63 px
                 past the bottom of a 1920×900 screen — invisibly, because the
                 page is `overflow-hidden` and still reported no scroll.
                 Stretching to a definite height here is what gives the cap
                 something to resolve against; `items-center` below is what
                 keeps a short card vertically centred. -->
            <div class="anim-fade flex h-full w-full max-w-[70vw] items-center">
              <ReelCard
                card={reel[cardIndex]!}
                variant="display"
                tilt={TILTS[cardIndex % TILTS.length]}
              />
            </div>
          {/key}
        </div>

        {#if reel.length > 1}
          <div class="flex shrink-0 items-center justify-center gap-[0.6vw]">
            {#each reel as c, i (c.round)}
              <span
                class="fill-transition h-[1.2vh] w-[1.2vh] rounded-[var(--radius-pill)] border-2 border-near-black"
                class:bg-ink-black={i === cardIndex}
                class:bg-paper-white={i !== cardIndex}
              ></span>
            {/each}
          </div>
        {/if}
      {:else}
        <!-- Never skipped, even with nothing to show: stage ③ is also the
             play-again screen (docs/10 decision 1). -->
        <div class="flex min-h-0 flex-1 items-center justify-center">
          <p class="font-ui text-d-topic text-slate-gray">Nobody put a name on the floor.</p>
        </div>
      {/if}
    </div>
  {/if}
{/if}
