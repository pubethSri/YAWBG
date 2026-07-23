<script lang="ts">
  import type { PublicPlayer } from "@yawbg/protocol";

  // The status strip: who's at the table, who's resolved, who's close. A
  // miniature of the phone's StatusGrid — same objects, read from further away
  // (docs/05: the display duplicates, it never owns).
  let {
    players,
    proposerIds = [],
    context = "round",
  }: {
    players: PublicPlayer[];
    /** Players with a live proposal on the floor — "still thinking out loud". */
    proposerIds?: string[];
    context?: "fill" | "round";
  } = $props();

  const proposing = $derived(new Set(proposerIds));
</script>

<section class="flex shrink-0 flex-wrap items-stretch gap-[0.6vw]">
  {#each players as p (p.id)}
    {@const done = context === "fill" ? p.fillDone === true : p.resolved === true}
    <div
      class="fill-transition flex min-w-0 items-center gap-[0.5vw] rounded-[var(--radius-tag)] border-2 border-near-black px-[0.8vw] py-[0.5vh]"
      class:bg-aqua-pop={done}
      class:bg-paper-white={!done}
    >
      {#if !p.connected}
        <span class="h-[0.9vh] w-[0.9vh] shrink-0 rounded-full bg-mist-gray"></span>
      {/if}
      <span class="truncate font-ui text-d-body font-semibold text-ink-black">{p.name}</span>

      {#if context === "round"}
        {#if p.hasWon}
          <span
            class="shrink-0 rounded-[var(--radius-tag)] bg-sunburst-yellow px-[0.4vw] py-[0.2vh] font-ui text-d-caption font-semibold text-ink-black"
          >
            BINGO
          </span>
        {:else if p.linesCompleted > 0}
          <span
            class="tabular shrink-0 rounded-[var(--radius-tag)] bg-electric-violet px-[0.4vw] py-[0.2vh] font-ui text-d-caption font-semibold text-paper-white"
          >
            {p.linesCompleted}
          </span>
        {/if}
        {#if proposing.has(p.id)}
          <span
            class="shrink-0 rounded-[var(--radius-tag)] bg-coral-blaze px-[0.4vw] py-[0.2vh] font-ui text-d-caption font-semibold text-ink-black"
          >
            on the floor
          </span>
        {/if}
      {/if}

      {#if !p.connected}
        <span class="shrink-0 font-ui text-d-caption text-slate-gray">away</span>
      {/if}
    </div>
  {/each}
</section>
