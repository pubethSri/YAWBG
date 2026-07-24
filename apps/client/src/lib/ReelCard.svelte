<script lang="ts">
  import type { ReelCard } from "@yawbg/protocol";
  import Starburst from "./Starburst.svelte";

  /**
   * One round of the highlight reel: the topic is the setup, the names are the
   * payoff (docs/10 decision 3). Shared by the phone's swipe stack and the
   * display's auto-rotation so the joke reads as the same object on both — the
   * same reason `HouseBoard` is one component with a `variant`.
   *
   * Everything here is built from `07`'s existing sticker vocabulary: a
   * circular badge for the round and the numbers, Game voice for the topic, a
   * violet chip for a locked name, a rotated coral diagonal label for a
   * withdrawn one, and a starburst for the crowd favourite.
   */
  let {
    card,
    variant = "phone",
    tilt = 0,
  }: {
    card: ReelCard;
    variant?: "phone" | "display";
    tilt?: number;
  } = $props();

  const display = $derived(variant === "display");

  /**
   * Entries arrive sorted by cheers descending (the server owns the order), so
   * the leader is entry 0 — but a leader is only *crowned* when it is a strict
   * maximum with at least one cheer. A three-way tie at one cheer is noise, not
   * a verdict, and the app does not get to invent one (docs/10 decision 3).
   */
  const topCheers = $derived(card.entries[0]?.cheers ?? 0);
  const crownedId = $derived(
    topCheers >= 1 && card.entries.filter((e) => e.cheers === topCheers).length === 1
      ? card.entries[0]!.proposalId
      : null,
  );

  /**
   * Twelve players can all propose on one round. Scale the entry type down to a
   * floor first, then cap with "+N more" — the same rule settled for the
   * display's stage-① roast grid, and the reverse of clipping, which would
   * silently drop the funniest thing on the card.
   *
   * The caps differ because the constraint does. The phone card sits in a page
   * that scrolls, so it only has to stay readable. The display card is bounded
   * by the height the stage has left and the screen never scrolls, so anything
   * past the cap is *invisibly* clipped — nine entries overflowed the card by
   * ~140 px at 1920×900 while the page still reported no scroll, which is the
   * worst kind of wrong.
   */
  const maxEntries = $derived(display ? 6 : 9);
  const shown = $derived(card.entries.slice(0, maxEntries));
  const overflow = $derived(card.entries.length - shown.length);

  /**
   * The display card runs its own type unit instead of the global `--text-d-*`
   * ramp, and that is a deliberate exception with a narrow reason.
   *
   * The ramp is vw-driven so the whole display scales with width — right for
   * every other display surface, because they are bounded by width. This card
   * is a *vertical stack* in a screen that never scrolls, so it is bounded by
   * height, and a vw-only ramp hands it the same 72 px topic at 1920×900 that
   * it uses at 1920×1080 with 180 px less room to put it in. Measured: the
   * sparse card overflowed at 900 while still reporting no page scroll.
   *
   * `--reel-u` is 1vw at the 16:9 design target (1.78 = 1920/1080) and falls
   * back to the height on anything shorter, so every size below stays in the
   * ramp's proportions and simply scales. Same both-axes rule `Starburst` and
   * the stage-② boards follow — arrived at from a third direction.
   */
  const REEL_UNIT = "min(1vw,1.78vh)";

  const nameSize = $derived(
    display
      ? card.entries.length <= 4
        ? "text-[max(20px,calc(var(--reel-u)*2.6))]"
        : card.entries.length <= 6
          ? "text-[max(18px,calc(var(--reel-u)*1.9))]"
          : "text-[max(14px,calc(var(--reel-u)*1.25))]"
      : card.entries.length <= 6
        ? "text-body"
        : "text-body-sm",
  );
</script>

<div
  class="flex w-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-card)] border-2 border-ink-black bg-paper-white
         {display ? 'max-h-full gap-[1.5vh] p-[2vw]' : 'gap-3 p-4'}"
  style="{display ? `--reel-u: ${REEL_UNIT};` : ''}{tilt ? `transform: rotate(${tilt}deg);` : ''}"
>
  <!-- Header: round badge + the numbers that bought this topic. -->
  <div class="flex shrink-0 flex-wrap items-center {display ? 'gap-[0.8vw]' : 'gap-2'}">
    <span
      class="tabular rounded-[var(--radius-pill)] bg-electric-violet font-shout font-extrabold text-paper-white
             {display ? 'px-[1vw] py-[0.2vh] text-[max(16px,calc(var(--reel-u)*2.08))]' : 'px-3 py-0.5 text-body'}"
    >
      ROUND {card.round}
    </span>
    {#each card.drawnNumbers as n (n)}
      <span
        class="tabular rounded-[var(--radius-pill)] bg-sunburst-yellow font-shout font-extrabold text-ink-black
               {display ? 'px-[1vw] py-[0.2vh] text-[max(16px,calc(var(--reel-u)*2.08))]' : 'px-2.5 py-0.5 text-body'}"
      >
        {n}
      </span>
    {/each}
  </div>

  <!-- The setup. Quotation marks are part of the design, per the topic banner. -->
  <p
    class="shrink-0 break-words font-game font-semibold leading-[1.2] text-ink-black
           {display ? 'text-[max(24px,calc(var(--reel-u)*3.4))]' : 'text-topic'}"
  >
    “{card.topicText}”
  </p>

  <!-- The payoff. -->
  <!-- `min-h-0` + `overflow-hidden`: on the display the card is capped at the
       height the stage has left, so a card with more entries than fit clips
       here rather than pushing the screen past the viewport. The type shrinks
       and the "+N more" cap runs first, so clipping is the last line of
       defence, not the plan. -->
  <ul class="flex min-h-0 flex-col overflow-hidden {display ? 'gap-[1vh]' : 'gap-2'}">
    {#each shown as entry (entry.proposalId)}
      <li class="flex min-w-0 items-center {display ? 'gap-[1vw]' : 'gap-2'}">
        <span
          class="min-w-0 break-words font-ui font-bold leading-[1.35] text-ink-black {nameSize}"
        >
          {entry.name}
        </span>
        <span
          class="shrink-0 font-ui text-slate-gray {display ? 'text-d-body-sm' : 'text-caption'}"
        >
          {entry.playerName}
        </span>

        {#if entry.outcome === "locked"}
          <span
            class="shrink-0 rounded-[var(--radius-tag)] bg-electric-violet font-ui font-semibold text-paper-white
                   {display ? 'px-[0.6vw] py-[0.2vh] text-d-caption' : 'px-1.5 py-0.5 text-caption'}"
          >
            LOCKED
          </span>
        {:else}
          <!-- "WITHDRAWN", never "REJECTED": it states what happened, and the
               app does not get to characterise the table's reasoning. -->
          <span
            class="shrink-0 -rotate-[12deg] rounded-[var(--radius-button)] bg-coral-blaze font-shout font-extrabold tracking-[0.03em] text-ink-black
                   {display ? 'px-[0.6vw] py-[0.2vh] text-d-caption' : 'px-1.5 py-0.5 text-caption'}"
          >
            WITHDRAWN
          </span>
        {/if}

        {#if entry.proposalId === crownedId}
          <span class="ml-auto shrink-0">
            <Starburst
              label={String(entry.cheers)}
              size={display ? "min(9vh, 7vw)" : "56px"}
              fill="yellow"
              rotate={-10}
            />
          </span>
        {:else if entry.cheers > 0}
          <span
            class="tabular ml-auto shrink-0 rounded-[var(--radius-pill)] border-2 border-near-black bg-paper-white font-shout font-extrabold text-ink-black
                   {display ? 'px-[0.7vw] py-[0.1vh] text-d-body-sm' : 'px-2 py-0.5 text-caption'}"
          >
            ★ {entry.cheers}
          </span>
        {/if}
      </li>
    {/each}
    {#if overflow > 0}
      <li class="font-ui text-slate-gray {display ? 'text-d-body-sm' : 'text-caption'}">
        +{overflow} more
      </li>
    {/if}
  </ul>
</div>
