<script lang="ts">
  import { onMount } from "svelte";
  import { socket } from "../lib/socket.svelte";

  let { code }: { code: string } = $props();

  onMount(() => socket.joinDisplay(code));
</script>

<div class="p-6 font-ui">
  <h1 class="font-shout text-hero">room {code}</h1>
  <p class="text-body-sm text-slate-gray">display view (read-only) · connection: {socket.status}</p>

  <!-- The Stage super-state (docs/05, docs/06) is M3 scope; raw state for now. -->
  <pre class="mt-4 overflow-auto text-caption">{JSON.stringify(socket.roomState, null, 2)}</pre>

  {#if socket.lastError}
    <p class="text-coral-blaze">error: {socket.lastError.code} — {socket.lastError.message}</p>
  {/if}
</div>
