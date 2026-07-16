<script lang="ts">
  import type { PublicRoomState } from "@yawbg/protocol";
  import { socket } from "../socket.svelte";
  import StatusGrid from "./StatusGrid.svelte";

  let { roomState }: { roomState: PublicRoomState } = $props();

  const board = $derived(socket.privateBoard);
  const others = $derived(roomState.players.filter((p) => p.id !== socket.session?.playerId));
</script>

{#if board}
  <div class="mx-auto flex max-w-md flex-col gap-4 p-4">
    <h1 class="font-game text-topic font-semibold">Your board is set</h1>
    <p class="font-ui text-body-sm text-slate-gray">
      Aqua cells arrived from the communal pool — authorship stays hidden until results.
    </p>

    <div class="grid grid-cols-5 gap-1.5">
      {#each board.cells as cell, i (i)}
        <div
          class="flex aspect-square items-center justify-center overflow-hidden rounded-[var(--radius-tag)] border border-near-black p-1 text-center font-ui text-caption leading-tight"
          class:bg-aqua-pop={cell.fromPool}
          class:bg-paper-white={!cell.fromPool}
        >
          <span class="line-clamp-3 break-words">{cell.name}</span>
        </div>
      {/each}
    </div>

    {#if others.length > 0}
      <h2 class="mt-2 font-ui text-heading font-bold">Other players</h2>
      <div class="flex flex-col gap-3">
        {#each others as p (p.id)}
          <StatusGrid player={p} />
        {/each}
      </div>
    {/if}
  </div>
{/if}
