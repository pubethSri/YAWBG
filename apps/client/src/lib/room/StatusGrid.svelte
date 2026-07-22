<script lang="ts">
  import type { PublicPlayer } from "@yawbg/protocol";

  // `fill` shows the ready badge; `round` swaps it for resolved-this-round plus
  // a line count, since fillDone stays true for the rest of the game.
  let { player, context = "fill" }: { player: PublicPlayer; context?: "fill" | "round" } = $props();
</script>

<div class="rounded-[var(--radius-card)] border border-near-black bg-paper-white p-3">
  <div class="mb-2 flex items-center gap-2 font-ui text-body-sm">
    <span
      class="h-2 w-2 rounded-full"
      class:bg-aqua-pop={player.connected}
      class:bg-mist-gray={!player.connected}
    ></span>
    <span class="font-semibold">{player.name}</span>
    {#if player.isHost}
      <span class="rounded-[var(--radius-tag)] bg-electric-violet px-1.5 py-0.5 text-caption font-semibold text-paper-white">
        host
      </span>
    {/if}
    {#if context === "round"}
      {#if player.linesCompleted > 0}
        <span class="tabular rounded-[var(--radius-tag)] bg-sunburst-yellow px-1.5 py-0.5 text-caption font-semibold text-ink-black">
          {player.linesCompleted} {player.linesCompleted === 1 ? "line" : "lines"}
        </span>
      {/if}
      {#if player.resolved}
        <span class="ml-auto rounded-[var(--radius-tag)] bg-aqua-pop px-1.5 py-0.5 text-caption font-semibold text-ink-black">
          resolved
        </span>
      {/if}
    {:else if player.fillDone}
      <span class="ml-auto rounded-[var(--radius-tag)] bg-aqua-pop px-1.5 py-0.5 text-caption font-semibold text-ink-black">
        ready
      </span>
    {/if}
  </div>
  <div class="grid grid-cols-5 gap-0.5">
    {#each player.board as cell, i (i)}
      <div
        class="aspect-square rounded-[3px] border border-near-black"
        class:bg-cream-blush={cell.status === "empty"}
        class:border-dashed={cell.status === "empty"}
        class:bg-paper-white={cell.status === "filled"}
        class:bg-electric-violet={cell.status === "locked"}
      ></div>
    {/each}
  </div>
</div>
