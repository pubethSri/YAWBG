<script lang="ts">
  import { onMount } from "svelte";
  import { socket } from "../lib/socket.svelte";

  let { code }: { code: string } = $props();

  onMount(() => socket.joinDisplay(code));
</script>

<h1>room {code} — display view (read-only)</h1>
<p>connection: {socket.status}</p>

<pre>{JSON.stringify(socket.roomState, null, 2)}</pre>

{#if socket.lastError}
  <p>error: {socket.lastError.code} — {socket.lastError.message}</p>
{/if}
