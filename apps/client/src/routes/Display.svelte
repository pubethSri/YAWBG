<script lang="ts">
  import { onMount } from "svelte";
  import { socket } from "../lib/socket.svelte";
  import DisplayFill from "../lib/display/DisplayFill.svelte";
  import DisplayLobby from "../lib/display/DisplayLobby.svelte";
  import DisplayResults from "../lib/display/DisplayResults.svelte";
  import Stage from "../lib/display/Stage.svelte";

  /**
   * The display: a projector, not a console (docs/02's anti-Jackbox pillar).
   * Read-only by protocol — this socket never sends an intent, and the server
   * answers any it did receive with BAD_MESSAGE. It has no session: it never
   * enters Room.svelte's session guard and `socket.privateBoard` is always null
   * here, so there is nothing on this route that could leak an unlocked name.
   *
   * Each state below is a pure function of `phase`, exactly like the player
   * view, which is what makes a refresh mid-game free.
   */
  let { code }: { code: string } = $props();

  onMount(() => socket.joinDisplay(code));

  const roomState = $derived(socket.roomState);
</script>

{#if roomState}
  {#if roomState.phase === "lobby"}
    <DisplayLobby {roomState} />
  {:else if roomState.phase === "board_fill" || roomState.phase === "distribute"}
    <DisplayFill {roomState} />
  {:else if roomState.phase === "results"}
    <DisplayResults {roomState} />
  {:else}
    <!-- draw + open_floor + last_call are ONE super-state (docs/05 decision #3):
         stability of the big screen beats per-phase layouts. -->
    <Stage {roomState} />
  {/if}
{:else}
  <!-- Connect state: the room code is in the URL, so there is nothing to type -
       this is purely "the TV is looking for the room". -->
  <div class="flex h-dvh flex-col items-center justify-center gap-[2vh] p-[3vw] text-center">
    <span
      class="tabular -rotate-2 rounded-[var(--radius-card)] border-[3px] border-ink-black bg-sunburst-yellow px-[2.5vw] py-[1.5vh] font-shout text-d-hero font-extrabold leading-none tracking-[0.03em] text-ink-black"
    >
      {code}
    </span>
    {#if socket.lastError}
      <p class="font-ui text-d-body font-semibold text-coral-blaze">
        {socket.lastError.code === "ROOM_NOT_FOUND"
          ? `No room ${code} — check the code on a phone.`
          : socket.lastError.message}
      </p>
    {:else}
      <p class="font-ui text-d-body text-slate-gray">Connecting… ({socket.status})</p>
    {/if}
  </div>
{/if}
