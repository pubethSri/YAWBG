<script lang="ts">
  import type { PublicRoomState } from "@yawbg/protocol";
  import { createCountdown } from "../countdown.svelte";
  import CalledNumbers from "./CalledNumbers.svelte";
  import HousePanel from "./HousePanel.svelte";
  import SpeechBubble from "./SpeechBubble.svelte";
  import WaitingRoom from "./WaitingRoom.svelte";
  import Starburst from "../Starburst.svelte";

  /**
   * The Stage: ONE persistent layout across `draw`, `open_floor` and
   * `last_call` (docs/05 decision #3). Stability of the big screen beats
   * per-phase layouts — the House board sits in the same place all game, so
   * the room learns where to look once and a hit lands where they're already
   * looking. The draw plays as theatre *within* this layout: only the right
   * pane changes, and it changes into the thing everyone is waiting for.
   */
  let { roomState }: { roomState: PublicRoomState } = $props();

  const round = $derived(roomState.round);
  const house = $derived(roomState.house);
  const isDrawing = $derived(roomState.phase === "draw");
  const isLastCall = $derived(roomState.phase === "last_call");
  const floorOpen = $derived(!isDrawing);

  const queue = $derived(round?.queue ?? []);
  const onStage = $derived(queue[0]);
  const stagePlayer = $derived(roomState.players.find((p) => p.id === onStage?.playerId));

  // Client-local countdown: the server owns the real timer (see countdown.svelte.ts).
  // Keyed on the round, so the every-broadcast re-run doesn't re-arm it.
  const clock = createCountdown(() => ({
    key: floorOpen && round ? `r${round.number}` : null,
    seconds: roomState.settings.roundTimerSec,
  }));
</script>

{#if round}
  <!-- One screen, never scrolls: a projector has no scrollbar. -->
  <div class="grid h-dvh grid-rows-[auto_minmax(0,1fr)] gap-[2vh] overflow-hidden p-[2.5vw]">
    <!-- Header: the question everyone is answering, at 72px. -->
    <header class="flex min-w-0 items-start gap-[1.5vw]">
      <div class="flex shrink-0 flex-col items-start gap-[0.8vh]">
        <span
          class="tabular rounded-[var(--radius-tag)] bg-electric-violet px-[0.8vw] py-[0.4vh] font-ui text-d-body font-semibold text-paper-white"
        >
          Round {round.number}
        </span>
        {#if isLastCall}
          <!-- Diagonal label, per the sticker vocabulary. -->
          <span
            class="-rotate-[14deg] rounded-[var(--radius-button)] bg-coral-blaze px-[0.8vw] py-[0.4vh] font-shout text-d-heading font-extrabold tracking-[0.03em] text-ink-black"
          >
            LAST CALL
          </span>
        {/if}
      </div>

      <div class="min-w-0 flex-1">
        {#key round.number}
          <!-- The topic slams down as part of the draw (docs/05). -->
          <h1
            class="anim-slam origin-left break-words font-game text-d-topic font-semibold leading-[1.1] text-ink-black"
          >
            {#if round.topic}“{round.topic.text}”{:else}…{/if}
          </h1>
        {/key}
      </div>

      <div class="flex shrink-0 flex-col items-end gap-[0.6vh]">
        <span class="tabular font-shout text-d-heading font-extrabold text-ink-black">
          {roomState.code}
        </span>
        {#if clock.secondsLeft !== null}
          <span
            class="tabular rounded-[var(--radius-tag)] border-2 border-near-black px-[0.8vw] py-[0.2vh] font-ui text-d-body font-semibold"
            class:bg-coral-blaze={clock.secondsLeft <= 10}
            class:bg-paper-white={clock.secondsLeft > 10}
          >
            {clock.secondsLeft}s
          </span>
        {/if}
      </div>
    </header>

    <!-- Body: the House on the left, all game. Never moves.

         The House column is `auto`, not a percentage (docs/09 decision 1) — see
         `.stage-columns` in app.css for why a percentage cannot be right on two
         differently-shaped viewports. `.stage-body` exists only to be the size
         container that column width is expressed against. -->
    <div class="stage-body min-h-0">
      <div class="stage-columns gap-[2.5vw]">
        {#if house}
          <HousePanel {house} bingoTarget={roomState.settings.houseBingoTarget} />
        {:else}
          <div></div>
        {/if}

        <!-- The right pane: [stage object] over [waiting room] over [called
             numbers] (docs/09 decision 3). "The floor is open." and
             "+N waiting to speak" were deleted rather than restyled — once the
             pane shows who we are waiting for, both are narration of something
             already visible. -->
        <div class="flex min-h-0 flex-col gap-[2vh]">
          {#if isDrawing}
            <!-- The waiting room is hidden for the draw: the queue is empty and
                 everyone is unresolved, so the chips would be a wall of
                 identical "deciding". Hiding them also keeps docs/07's
                 one-moving-thing-per-screen rule honest during the showpiece.
                 A content change *within* the layout — the House does not
                 move, so docs/05 decision #3 holds. -->
            {#key round.drawnNumbers.join("-")}
              <!-- Square stickers, one size regardless of digit count. At the
                   1920px design target this puts the digits at roughly the
                   ramp's 160px; it scales down with the viewport from there. -->
              <div
                class="anim-slam flex min-h-0 flex-1 flex-wrap items-center justify-center gap-[2vw]"
              >
                {#each round.drawnNumbers as n (n)}
                  <Starburst label={String(n)} size="min(30vh, 22vw)" fill="coral" rotate={-5} />
                {/each}
              </div>
            {/key}
          {:else}
            {#if onStage}
              {#key onStage.playerId + onStage.cellIndex}
                <div class="anim-pop shrink-0">
                  <SpeechBubble>
                    <p class="font-ui text-d-body-sm font-semibold uppercase tracking-[0.03em] text-ink-black">
                      On stage
                    </p>
                    <p class="mt-[0.5vh] font-ui text-d-body font-semibold text-ink-black">
                      {stagePlayer?.name ?? "—"} proposes
                    </p>
                    <p class="mt-[1vh] break-words font-game text-d-verdict font-bold leading-[1.1] text-ink-black">
                      {onStage.name}
                    </p>
                  </SpeechBubble>
                </div>
              {/key}
            {/if}

            <WaitingRoom players={roomState.players} {queue} />
          {/if}

          <CalledNumbers allDrawn={round.allDrawn} current={round.drawnNumbers} />
        </div>
      </div>
    </div>
  </div>
{/if}
