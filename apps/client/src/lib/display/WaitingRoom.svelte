<script lang="ts">
  import type { Proposal, PublicPlayer } from "@yawbg/protocol";

  /**
   * The waiting room (docs/09 decision 3): one chip per player, filling the
   * right pane. It replaces both the bottom `PlayerStrip` and the
   * "+{n} waiting to speak" string — the chips say the same thing per-player and
   * from across the room, which is the whole reason the pane exists.
   *
   * Same data and same semantics as `PlayerStrip`, scaled up and rotated. It is
   * the sticker energy the Stage was missing, applied to something load-bearing
   * rather than to decoration.
   */
  let { players, queue }: { players: PublicPlayer[]; queue: Proposal[] } = $props();

  /**
   * Queue members sort to the front, in queue order: position in the queue is
   * carried by *placement*, not by a badge or a colour. Reading left to right is
   * reading the speaking order, which is what lets the chip fill stay at three
   * values (docs/09's four-sticker-colour budget has no room for a fifth).
   */
  const ordered = $derived.by(() => {
    const rank = new Map(queue.map((q, i) => [q.playerId, i]));
    return players
      .map((player, index) => ({ player, index }))
      .sort((a, b) => {
        const ra = rank.get(a.player.id) ?? Number.POSITIVE_INFINITY;
        const rb = rank.get(b.player.id) ?? Number.POSITIVE_INFINITY;
        return ra === rb ? a.index - b.index : ra - rb;
      });
  });

  const onStageId = $derived(queue[0]?.playerId);

  /**
   * Deterministic from the player's index in `players` — *not* from the sorted
   * position, which changes the moment someone joins the queue and would make
   * every chip twitch on a broadcast that has nothing to do with it.
   *
   * -7deg to 7deg is a deliberate subset of docs/07's -15/15 sticker range:
   * these chips are dense and adjacent and must stay scannable at 3m, and at
   * full tilt a wrapped grid of them stops being readable.
   *
   * A table rather than an arithmetic sequence for two reasons: no entry is 0
   * (an untilted chip in a row of tilted ones reads as a mistake, and a
   * two-player game shows only the first two entries), and neighbours never
   * share a sign, so no pair ever looks deliberately parallel. 12 entries is
   * the max lobby size.
   */
  const ROTATIONS = [-6, 5, -3, 7, -5, 3, -7, 4, -4, 6, -2, 5];
  const rotation = (index: number) => ROTATIONS[index % ROTATIONS.length];
</script>

<!-- Lines stretch to fill the pane, so two players make large stickers and
     twelve wrap into a readable grid. The box grows; the label does not — past
     ~40px a longer name buys nothing in legibility and costs wrapping, so the
     pane is filled by padding and box size, not by type. -->
<!-- The vertical padding is for the rotation, not for rhythm: a tilted chip's
     corners reach past its layout box (~14px on a full-width chip at 7deg), and
     at 12 players in a 1366x768 window the bottom row was clearing the "Called"
     heading by 4px. The padding buys that back on both edges. Worst measured
     case is 12 players at 1920x900, where the chips are widest and so bleed
     most. -->
<section class="flex min-h-0 flex-1 flex-wrap items-stretch gap-[1vw] py-[1.5vh]">
  {#each ordered as { player, index } (player.id)}
    {@const resolved = player.resolved === true}
    <div
      class="fill-transition flex min-w-0 grow basis-[30%] items-center justify-center gap-[0.6vw] rounded-[var(--radius-card)] border-2 border-ink-black px-[1vw] py-[1vh]"
      class:bg-aqua-pop={resolved}
      class:bg-paper-white={!resolved}
      style="transform: rotate({rotation(index)}deg);{player.id === onStageId
        ? ' box-shadow: var(--shadow-ring);'
        : ''}"
    >
      {#if !player.connected}
        <span class="h-[1.2vh] w-[1.2vh] shrink-0 rounded-full bg-mist-gray"></span>
      {/if}
      <span class="min-w-0 truncate font-ui text-d-chip font-semibold text-ink-black">
        {player.name}
      </span>

      {#if player.hasWon}
        <span
          class="shrink-0 rounded-[var(--radius-tag)] bg-sunburst-yellow px-[0.5vw] py-[0.3vh] font-ui text-d-caption font-semibold text-ink-black"
        >
          BINGO
        </span>
      {:else if player.linesCompleted > 0}
        <span
          class="tabular shrink-0 rounded-[var(--radius-tag)] bg-electric-violet px-[0.5vw] py-[0.3vh] font-ui text-d-caption font-semibold text-paper-white"
        >
          {player.linesCompleted}
        </span>
      {/if}

      {#if !player.connected}
        <span class="shrink-0 font-ui text-d-caption text-slate-gray">away</span>
      {/if}
    </div>
  {/each}
</section>
