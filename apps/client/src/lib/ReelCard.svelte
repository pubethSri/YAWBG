<script lang="ts">
  import type { ReelCard } from "@yawbg/protocol";
  import Starburst from "./Starburst.svelte";

  /**
   * One card of the highlight reel: **one name, by one person, for one topic.**
   * The topic is the setup, the name is the punchline, and the proposer is who
   * said it out loud (docs/10 decision 3).
   *
   * Built from `07`'s existing sticker vocabulary, and the speech bubble is the
   * load-bearing one: `07` assigns it to "proposal on stage — *Nok proposes
   * Gordon Ramsay*", which is precisely what a card is. The bubble's tail
   * points down at the proposer's badge, so the card reads as that person
   * saying that name without needing a word of connective copy.
   *
   * Shared by the phone's swipe stack and the display's auto-rotation so the
   * joke reads as the same object on both — the same reason `HouseBoard` is one
   * component with a `variant`.
   */
  let {
    card,
    variant = "phone",
    crowned = false,
    tilt = 0,
  }: {
    card: ReelCard;
    variant?: "phone" | "display";
    /** The crowd favourite; computed once in `lib/reel.ts`, never here. */
    crowned?: boolean;
    tilt?: number;
  } = $props();

  const display = $derived(variant === "display");

  /**
   * The display card runs its own type unit instead of the global `--text-d-*`
   * ramp, and that is a deliberate exception with a narrow reason.
   *
   * The ramp is vw-driven so the whole display scales with width — right for
   * every other display surface, because they are bounded by width. This card
   * is a *vertical stack* in a screen that never scrolls, so it is bounded by
   * height, and a vw-only ramp hands it the same 72 px topic at 1920×900 that
   * it uses at 1920×1080 with 180 px less room to put it in.
   *
   * `--reel-u` is 1vw at the 16:9 design target (1.78 = 1920/1080) and falls
   * back to the height on anything shorter, so every size below stays in the
   * ramp's proportions and simply scales. Same both-axes rule `Starburst` and
   * the stage-② boards follow — arrived at from a third direction.
   */
  const REEL_UNIT = "min(1vw,1.78vh)";

  // One name per card means it can be the biggest thing on the screen, which is
  // the whole reason this format replaced the twelve-name list.
  const nameSize = $derived(
    display ? "text-[max(28px,calc(var(--reel-u)*4.2))]" : "text-verdict",
  );
</script>

<div
  class="flex w-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-card)] border-2 border-ink-black bg-paper-white
         {display ? 'max-h-full gap-[1.6vh] p-[2vw]' : 'gap-3 p-4'}"
  style="{display ? `--reel-u: ${REEL_UNIT};` : ''}{tilt ? `transform: rotate(${tilt}deg);` : ''}"
>
  <!-- Header: round badge + the numbers that bought this topic. Repeated on
       every card of the same round on purpose — each one is a fresh punchline
       to the same setup, and a card has to stand alone when it comes round
       again in a loop. -->
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
    class="shrink-0 break-words font-game font-semibold leading-[1.2] text-slate-gray
           {display ? 'text-[max(20px,calc(var(--reel-u)*2.6))]' : 'text-topic'}"
  >
    “{card.topicText}”
  </p>

  <!-- The punchline, in the bubble `07` reserves for a proposal. -->
  <div class="flex min-h-0 flex-1 flex-col justify-center {display ? 'gap-[1.2vh]' : 'gap-2'}">
    <div class="flex items-center {display ? 'gap-[1.5vw]' : 'gap-3'}">
      <div
        class="relative min-w-0 flex-1 rounded-[var(--radius-card)] border-2 border-ink-black bg-paper-white
               {display ? 'px-[1.6vw] py-[1.4vh]' : 'px-3 py-2'}"
      >
        <p class="break-words font-ui font-bold leading-[1.3] text-ink-black {nameSize}">
          {card.name}
        </p>
        <!-- Tail: an ink triangle with a white one just inside it, so the
             outline reads as continuous without a shadow or a mask. It points
             down-left at the proposer's badge. -->
        <div
          class="absolute left-[7%] top-full h-0 w-0 border-l-transparent border-r-transparent border-t-ink-black
                 {display
            ? 'border-l-[1.1vw] border-r-[1.1vw] border-t-[1.7vh]'
            : 'border-l-[9px] border-r-[9px] border-t-[13px]'}"
        ></div>
        <div
          class="absolute left-[7%] top-full h-0 w-0 border-l-transparent border-r-transparent border-t-paper-white
                 {display
            ? 'ml-[0.2vw] border-l-[0.9vw] border-r-[0.9vw] border-t-[1.35vh]'
            : 'ml-[1.5px] border-l-[7.5px] border-r-[7.5px] border-t-[10px]'}"
        ></div>
      </div>

      <!-- The tally, revealed here and nowhere else in the game. Crowned only
           when it is a strict maximum across the reel. -->
      {#if crowned}
        <span class="shrink-0">
          <Starburst
            label={String(card.cheers)}
            size={display ? "min(16vh,13vw)" : "72px"}
            fill="yellow"
            rotate={-10}
          />
        </span>
      {:else if card.cheers > 0}
        <span
          class="tabular shrink-0 rounded-[var(--radius-pill)] border-2 border-near-black bg-paper-white font-shout font-extrabold text-ink-black
                 {display
            ? 'px-[0.9vw] py-[0.2vh] text-[max(16px,calc(var(--reel-u)*1.8))]'
            : 'px-2.5 py-1 text-body'}"
        >
          ★ {card.cheers}
        </span>
      {/if}
    </div>

    <!-- Who said it, and what became of it. Aqua is `07`'s small-badge accent
         and keeps the proposer distinct from the violet lock tag beside it. -->
    <div class="flex flex-wrap items-center {display ? 'gap-[0.8vw] pl-[3vw]' : 'gap-2 pl-6'}">
      <span
        class="rounded-[var(--radius-pill)] bg-aqua-pop font-ui font-bold text-ink-black
               {display ? 'px-[1vw] py-[0.2vh] text-[max(15px,calc(var(--reel-u)*1.8))]' : 'px-2.5 py-0.5 text-body-sm'}"
      >
        {card.playerName}
      </span>

      {#if card.outcome === "locked"}
        <span
          class="rounded-[var(--radius-tag)] bg-electric-violet font-ui font-semibold text-paper-white
                 {display ? 'px-[0.7vw] py-[0.2vh] text-[max(13px,calc(var(--reel-u)*1.35))]' : 'px-1.5 py-0.5 text-caption'}"
        >
          LOCKED IT
        </span>
      {:else}
        <!-- "WITHDRAWN", never "REJECTED": it states what happened, and the app
             does not get to characterise the table's reasoning. -->
        <span
          class="-rotate-[12deg] rounded-[var(--radius-button)] bg-coral-blaze font-shout font-extrabold tracking-[0.03em] text-ink-black
                 {display ? 'px-[0.7vw] py-[0.2vh] text-[max(13px,calc(var(--reel-u)*1.35))]' : 'px-1.5 py-0.5 text-caption'}"
        >
          WITHDRAWN
        </span>
      {/if}
    </div>
  </div>
</div>
