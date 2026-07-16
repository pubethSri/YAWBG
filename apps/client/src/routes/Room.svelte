<script lang="ts">
  import { navigate } from "../lib/router.svelte";
  import { socket } from "../lib/socket.svelte";
  import BoardEditor from "../lib/room/BoardEditor.svelte";
  import DistributeReveal from "../lib/room/DistributeReveal.svelte";
  import Lobby from "../lib/room/Lobby.svelte";

  let { code }: { code: string } = $props();

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
  {:else}
    <!-- M2+ phases (draw/open_floor/last_call/results) aren't built yet. -->
    <div class="mx-auto max-w-md p-6 font-ui text-body">
      <p>Phase "{socket.roomState.phase}" isn't implemented yet.</p>
      <pre class="mt-2 overflow-auto text-caption">{JSON.stringify(socket.roomState, null, 2)}</pre>
    </div>
  {/if}
  <div class="mx-auto max-w-md p-4">
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
