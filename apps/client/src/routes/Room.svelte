<script lang="ts">
  import { navigate } from "../lib/router.svelte";
  import { socket } from "../lib/socket.svelte";

  let { code }: { code: string } = $props();

  function leave() {
    socket.leave();
    navigate("/");
  }
</script>

<h1>room {code} — player view</h1>
<p>connection: {socket.status}</p>

{#if socket.session?.code !== code}
  <p>No session for this room. <a href="/" onclick={(e) => { e.preventDefault(); navigate("/"); }}>Go home</a> to join.</p>
{:else}
  <button onclick={leave}>Leave room</button>
  <pre>{JSON.stringify(socket.roomState, null, 2)}</pre>
{/if}

{#if socket.lastError}
  <p>error: {socket.lastError.code} — {socket.lastError.message}</p>
{/if}
