<script lang="ts">
  // The called-number board: every number this game has produced, newest first,
  // as circular badges (docs/07's sticker vocabulary). `allDrawn` is the whole
  // game; `current` is this round's batch and stays yellow so the room can see
  // what just landed without re-reading the whole row.
  let {
    allDrawn,
    current,
  }: {
    allDrawn: number[];
    current: number[];
  } = $props();

  const currentSet = $derived(new Set(current));
  // Newest first: the tail is what the table cares about, and a long game
  // shouldn't push it off the end of the row.
  const ordered = $derived([...allDrawn].reverse());
</script>

<section class="flex min-w-0 flex-col gap-[0.8vh]">
  <h2 class="font-ui text-d-heading font-bold text-ink-black">
    Called <span class="tabular font-normal text-slate-gray">({allDrawn.length})</span>
  </h2>
  <!-- Capped so a long game can't grow this row into the stage pane above it.
       Newest-first means the clip drops the oldest numbers, which is the right
       thing to lose: the House board already records every hit that mattered. -->
  <div class="flex max-h-[32vh] flex-wrap content-start gap-[0.5vw] overflow-hidden">
    {#each ordered as n (n)}
      <span
        class="tabular fill-transition inline-flex min-w-[2.6em] items-center justify-center rounded-[var(--radius-pill)] border-2 border-near-black px-[0.5vw] py-[0.2vh] font-shout text-d-body font-extrabold text-ink-black"
        class:bg-sunburst-yellow={currentSet.has(n)}
        class:bg-paper-white={!currentSet.has(n)}
      >
        {n}
      </span>
    {/each}
  </div>
</section>
