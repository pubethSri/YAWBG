<script lang="ts">
  import type { PublicRoomState } from "@yawbg/protocol";
  import PlayerStrip from "./PlayerStrip.svelte";

  // `board_fill` and `distribute` share this state: ambient, no drama, nothing
  // to look at on the TV while everyone is heads-down on a phone. Its only job
  // is answering "who are we waiting for?" from across the room.
  //
  // Boards are drawn as filled/empty cells only — a filled cell's name never
  // leaves its owner's socket, and PublicCell doesn't carry one.
  let { roomState }: { roomState: PublicRoomState } = $props();

  const distributing = $derived(roomState.phase === "distribute");
  const done = $derived(roomState.players.filter((p) => p.fillDone).length);
</script>

<div class="grid h-dvh grid-rows-[auto_minmax(0,1fr)_auto] gap-[3vh] overflow-hidden p-[3vw]">
  <header class="flex items-baseline gap-[1.5vw]">
    <h1 class="font-game text-d-topic font-semibold leading-[1.1] text-ink-black">
      {distributing ? "Dealing the pool…" : "Filling boards"}
    </h1>
    {#if !distributing}
      <span class="tabular font-ui text-d-heading font-bold text-slate-gray">
        {done}/{roomState.players.length} ready
      </span>
    {/if}
  </header>

  <div class="flex min-h-0 flex-wrap items-start justify-center gap-[2vw]">
    {#each roomState.players as p (p.id)}
      <div
        class="fill-transition flex flex-col items-center gap-[1vh] rounded-[var(--radius-card)] border-2 border-near-black p-[1vw]"
        class:bg-aqua-pop={p.fillDone}
        class:bg-paper-white={!p.fillDone}
      >
        <div class="grid w-[12vw] grid-cols-5 gap-[0.2vw]">
          {#each p.board as cell, i (i)}
            <div
              class="fill-transition aspect-square rounded-[3px] border border-near-black"
              class:bg-cream-blush={cell.status === "empty"}
              class:border-dashed={cell.status === "empty"}
              class:bg-paper-white={cell.status === "filled"}
              class:bg-electric-violet={cell.status === "locked"}
            ></div>
          {/each}
        </div>
        <span class="max-w-[12vw] truncate font-ui text-d-body font-semibold text-ink-black">
          {p.name}
        </span>
      </div>
    {/each}
  </div>

  <PlayerStrip players={roomState.players} context="fill" />
</div>
