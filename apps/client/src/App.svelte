<script lang="ts">
  import { onMount } from "svelte";
  import { route } from "./lib/router.svelte";
  import { socket } from "./lib/socket.svelte";
  import Display from "./routes/Display.svelte";
  import Home from "./routes/Home.svelte";
  import Room from "./routes/Room.svelte";

  onMount(() => socket.connect());
</script>

{#if route.current.name === "room"}
  <Room code={route.current.code} />
{:else if route.current.name === "display"}
  <Display code={route.current.code} />
{:else}
  <Home />
{/if}
