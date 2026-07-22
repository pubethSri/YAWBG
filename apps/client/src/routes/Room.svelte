<script lang="ts">
  import { navigate } from "../lib/router.svelte";
  import { socket } from "../lib/socket.svelte";
  import BoardEditor from "../lib/room/BoardEditor.svelte";
  import DistributeReveal from "../lib/room/DistributeReveal.svelte";
  import Lobby from "../lib/room/Lobby.svelte";
  import Results from "../lib/room/Results.svelte";
  import RoundScreen from "../lib/room/RoundScreen.svelte";

  let { code }: { code: string } = $props();

  const roundPhase = $derived(
    socket.roomState?.phase === "draw" ||
      socket.roomState?.phase === "open_floor" ||
      socket.roomState?.phase === "last_call",
  );

  function leave() {
    socket.leave();
    navigate("/");
  }
</script>

{#if socket.session?.code !== code}
  <div class="mx-auto max-w-md p-6 font-ui text-body">
    <p>No session for this room. <a class="underline" href="/" onclick={(e) => { e.preventDefault(); navigate("/"); }}>Go home</a> to join.</p>
  </div>
{:else if socket.roomState}
  {#if socket.roomState.phase === "lobby"}
    <Lobby roomState={socket.roomState} />
  {:else if socket.roomState.phase === "board_fill"}
    <BoardEditor roomState={socket.roomState} />
  {:else if socket.roomState.phase === "distribute"}
    <DistributeReveal roomState={socket.roomState} />
  {:else if socket.roomState.phase === "results"}
    <Results roomState={socket.roomState} />
  {:else}
    <!-- draw + open_floor + last_call are one screen (docs/05 decision #1):
         the draw is a moment, so the House and board never jump between phases. -->
    <RoundScreen roomState={socket.roomState} />
  {/if}
  <!-- RoundScreen pins an action bar to the bottom of the viewport, so this
       footer needs clearance to stay reachable when scrolled to the end. -->
  <div class="mx-auto max-w-md p-4" class:pb-40={roundPhase}>
    <button class="font-ui text-body-sm text-slate-gray underline" onclick={leave}>Leave room</button>
  </div>
{:else}
  <p class="p-6 font-ui text-body">connection: {socket.status}</p>
{/if}

{#if socket.lastError}
  <p class="mx-auto max-w-md p-4 font-ui text-body-sm text-coral-blaze">
    error: {socket.lastError.code} — {socket.lastError.message}
  </p>
{/if}
