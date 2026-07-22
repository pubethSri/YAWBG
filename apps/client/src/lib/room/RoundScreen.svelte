<script lang="ts">
  import type { PublicRoomState } from "@yawbg/protocol";
  import { socket } from "../socket.svelte";
  import HouseBoard from "./HouseBoard.svelte";
  import Sheet from "./Sheet.svelte";
  import StatusGrid from "./StatusGrid.svelte";

  // Renders `draw`, `open_floor` and `last_call` as ONE screen (docs/05 decision
  // #1): the draw is a moment, not a destination, so the House and the board
  // never jump between phases. `phase === "draw"` only means the reveal is
  // playing and the floor isn't open yet.
  let { roomState }: { roomState: PublicRoomState } = $props();

  const board = $derived(socket.privateBoard);
  const me = $derived(roomState.players.find((p) => p.id === socket.session?.playerId));
  const others = $derived(roomState.players.filter((p) => p.id !== socket.session?.playerId));
  const round = $derived(roomState.round);
  const house = $derived(roomState.house);

  const isDrawing = $derived(roomState.phase === "draw");
  const isLastCall = $derived(roomState.phase === "last_call");
  const floorOpen = $derived(!isDrawing);

  const queue = $derived(round?.queue ?? []);
  const onStage = $derived(queue[0]);
  const myProposal = $derived(queue.find((q) => q.playerId === me?.id));
  const iAmOnStage = $derived(onStage !== undefined && onStage.playerId === me?.id);
  const stagePlayer = $derived(roomState.players.find((p) => p.id === onStage?.playerId));

  const resolvedCount = $derived(roomState.players.filter((p) => p.resolved).length);
  const totalCount = $derived(roomState.players.length);
  const stalled = $derived(floorOpen && resolvedCount < totalCount);

  let cellSheet = $state<number | null>(null);
  let houseSheet = $state(false);
  let queueSheet = $state(false);
  let passSheet = $state(false);

  // The takeover is not dismissable: when your proposal reaches the front, the
  // table is arguing about it right now and the only ways out are the two
  // buttons (docs/06 — deliberately no board browsing behind it).
  const showTakeover = $derived(iAmOnStage && floorOpen);

  const canPropose = (i: number): boolean => {
    if (!floorOpen || !me || me.resolved || myProposal) return false;
    const cell = board?.cells[i];
    return !!cell && cell.name !== null && cell.locked === null;
  };

  function propose(i: number) {
    socket.propose(i);
    cellSheet = null;
  }

  function pass() {
    socket.pass();
    passSheet = false;
  }

  // docs/06/07: 14px cell names auto-shrink to a 12px floor, then truncate —
  // the tap sheet always has the full value. Length tiers rather than measuring:
  // 12px is the floor everywhere, no exceptions.
  const cellSize = (name: string | null): string => {
    if (!name) return "text-body-sm";
    return name.length > 16 ? "text-caption" : "text-body-sm";
  };
</script>

{#if board && me && round}
  <div class="mx-auto flex max-w-md flex-col gap-3 p-4 pb-40">
    <!-- 1. Topic banner, pinned: the question everyone is answering. -->
    <div class="sticky top-0 z-[5] -mx-4 border-b border-mist-gray bg-cream-blush px-4 pb-3 pt-2">
      <div class="mb-1 flex items-center gap-2">
        <span
          class="tabular rounded-[var(--radius-tag)] bg-electric-violet px-2 py-0.5 font-ui text-caption font-semibold text-paper-white"
        >
          R{round.number}
        </span>
        {#each round.drawnNumbers as n (n)}
          <span
            class="tabular rounded-[var(--radius-pill)] bg-sunburst-yellow px-2.5 py-0.5 font-shout text-body font-extrabold text-ink-black"
          >
            {n}
          </span>
        {/each}

        <!-- House chip: a compact dread indicator; detail on demand, not permanent real estate. -->
        {#if house}
          <button
            class="ml-auto rounded-[var(--radius-tag)] border border-near-black bg-paper-white px-2 py-0.5 font-ui text-caption font-semibold text-coral-blaze"
            disabled={house.mode === "hidden"}
            onclick={() => (houseSheet = true)}
          >
            {#if house.mode === "hidden"}
              House: ???
            {:else if house.linesCompleted > 0}
              House: BINGO
            {:else}
              House: {house.bestLineNeeds} away
            {/if}
          </button>
        {/if}
      </div>

      {#if isLastCall}
        <span
          class="mb-1 inline-block -rotate-[12deg] rounded-[var(--radius-button)] bg-coral-blaze px-2 py-0.5 font-shout text-body font-extrabold tracking-[0.03em] text-ink-black"
        >
          LAST CALL
        </span>
      {/if}

      {#if isDrawing}
        <p class="font-ui text-body text-slate-gray">Drawing…</p>
      {:else}
        <h1 class="font-game text-topic font-semibold leading-[1.15]">
          “{round.topic?.text ?? "—"}”
        </h1>
      {/if}
    </div>

    <!-- 2. Stage strip: one-line ticker, tap for the full queue. -->
    <button
      class="flex items-center gap-2 rounded-[var(--radius-tag)] border border-near-black bg-paper-white px-3 py-2 text-left font-ui text-body-sm"
      onclick={() => (queueSheet = true)}
      disabled={queue.length === 0}
    >
      {#if onStage}
        <span class="truncate">
          <span class="font-semibold">On stage:</span>
          {stagePlayer?.name ?? "?"} — {onStage.name}
        </span>
        {#if queue.length > 1}
          <span
            class="ml-auto shrink-0 rounded-[var(--radius-tag)] bg-aqua-pop px-2 py-0.5 text-caption font-semibold text-ink-black"
          >
            +{queue.length - 1} waiting
          </span>
        {/if}
      {:else}
        <span class="text-slate-gray">floor is open</span>
      {/if}
    </button>

    <!-- 3. Own board, the centerpiece. -->
    <div class="grid grid-cols-5 gap-1.5">
      {#each board.cells as cell, i (i)}
        {@const proposed = myProposal?.cellIndex === i}
        <div
          role="button"
          tabindex="0"
          class="relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-[var(--radius-tag)] border border-near-black p-1 text-center font-ui leading-tight {cellSize(
            cell.name,
          )}"
          class:bg-electric-violet={cell.locked !== null}
          class:text-paper-white={cell.locked !== null}
          class:bg-paper-white={cell.locked === null}
          style={proposed ? "box-shadow: var(--shadow-ring);" : ""}
          onclick={() => (cellSheet = i)}
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              cellSheet = i;
            }
          }}
        >
          <span class="line-clamp-3 break-words font-semibold">{cell.name ?? ""}</span>
          {#if cell.locked}
            <span class="mt-0.5 line-clamp-1 break-all text-caption opacity-90">
              R{cell.locked.round}
            </span>
          {/if}
        </div>
      {/each}
    </div>

    {#if others.length > 0}
      <h2 class="mt-2 font-ui text-heading font-bold">Other players</h2>
      <div class="flex flex-col gap-3">
        {#each others as p (p.id)}
          <StatusGrid player={p} context="round" />
        {/each}
      </div>
    {/if}
  </div>

  <!-- 4. Action bar, pinned bottom. Sits above Room.svelte's leave-room footer. -->
  <div
    class="fixed inset-x-0 bottom-0 z-[6] border-t border-near-black bg-cream-blush px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3"
  >
    <div class="mx-auto flex max-w-md items-center gap-2">
      <button
        class="flex-1 rounded-[var(--radius-button)] border-2 border-ink-black bg-paper-white px-4 py-3 font-ui text-body font-bold disabled:border-pale-gray disabled:bg-mist-gray disabled:text-slate-gray"
        disabled={!floorOpen || me.resolved}
        onclick={() => (passSheet = true)}
      >
        {me.resolved ? "Resolved" : "Pass"}
      </button>
      <span class="tabular shrink-0 font-ui text-body-sm font-semibold text-slate-gray">
        {resolvedCount}/{totalCount} resolved
      </span>
    </div>
    {#if me.isHost && stalled}
      <div class="mx-auto mt-2 flex max-w-md">
        <button
          class="flex-1 rounded-[var(--radius-button)] border-2 border-coral-blaze px-4 py-2 font-ui text-body-sm font-semibold text-coral-blaze"
          onclick={() => socket.forceAdvance()}
        >
          Force advance ({resolvedCount}/{totalCount} resolved)
        </button>
      </div>
    {/if}
  </div>

  <!-- On-stage takeover: the name huge, confirm styled as the irreversible act it is. -->
  {#if showTakeover && myProposal}
    <div class="fixed inset-0 z-20 flex items-end bg-ink-black/50">
      <div
        class="w-full rounded-t-[var(--radius-card)] bg-coral-blaze p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <p class="font-ui text-body-sm font-semibold text-ink-black">
          You're on stage — “{round.topic?.text ?? "—"}”
        </p>
        <p class="my-4 break-words font-game text-verdict font-bold leading-[1.1] text-ink-black">
          {myProposal.name}
        </p>
        <div class="flex flex-col gap-2">
          <button
            class="rounded-[var(--radius-button)] bg-ink-black px-4 py-3 font-ui text-body font-bold text-paper-white"
            onclick={() => socket.confirmLock()}
          >
            Confirm lock — permanent
          </button>
          <button
            class="rounded-[var(--radius-button)] border-2 border-ink-black bg-paper-white px-4 py-2 font-ui text-body font-semibold text-ink-black"
            onclick={() => socket.withdraw()}
          >
            Withdraw
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if cellSheet !== null}
    {@const cell = board.cells[cellSheet]}
    <Sheet title="Cell" onClose={() => (cellSheet = null)}>
      <p class="mb-2 break-words font-ui text-heading font-semibold">{cell?.name ?? "empty"}</p>
      {#if cell?.locked}
        <p class="mb-3 font-ui text-body-sm text-slate-gray">
          Locked round {cell.locked.round} · “{cell.locked.topicText}” · number
          <span class="tabular">{cell.locked.drawnNumber}</span>
        </p>
      {:else if cell?.fromPool}
        <p class="mb-3 font-ui text-body-sm text-slate-gray">From the pool — author revealed at the end.</p>
      {/if}

      {#if canPropose(cellSheet)}
        <button
          class="w-full rounded-[var(--radius-button)] bg-ink-black px-4 py-3 font-ui text-body font-bold text-paper-white"
          onclick={() => propose(cellSheet!)}
        >
          Propose for “{round.topic?.text ?? "—"}”
        </button>
      {:else if cell?.locked}
        <p class="font-ui text-body-sm text-slate-gray">Locked cells are permanent.</p>
      {:else if myProposal}
        <p class="font-ui text-body-sm text-slate-gray">You already have a proposal on the floor.</p>
      {:else if me.resolved}
        <p class="font-ui text-body-sm text-slate-gray">You've already resolved this round.</p>
      {/if}
    </Sheet>
  {/if}

  {#if houseSheet && house && house.mode !== "hidden"}
    <Sheet title="The House" onClose={() => (houseSheet = false)}>
      {#if house.mode === "full"}
        <HouseBoard {house} />
      {/if}
      <p class="mt-3 font-ui text-body-sm text-slate-gray">
        {#if house.linesCompleted > 0}
          The House has bingo.
        {:else}
          {house.bestLineNeeds} more to a line.
        {/if}
      </p>
      {#if round.allDrawn.length > 0}
        <p class="mt-3 mb-1 font-ui text-body-sm font-semibold text-slate-gray">Called so far</p>
        <p class="tabular font-ui text-body-sm">{round.allDrawn.join(" · ")}</p>
      {/if}
    </Sheet>
  {/if}

  {#if queueSheet}
    <Sheet title="Proposal queue" onClose={() => (queueSheet = false)}>
      {#if queue.length === 0}
        <p class="font-ui text-body-sm text-slate-gray">The floor is open — nobody has proposed yet.</p>
      {:else}
        <ol class="flex flex-col gap-2">
          {#each queue as q, i (q.playerId)}
            <li
              class="flex items-center gap-2 rounded-[var(--radius-tag)] border border-near-black px-3 py-2 font-ui text-body-sm"
              class:bg-coral-blaze={i === 0}
              class:bg-paper-white={i !== 0}
            >
              <span class="font-semibold">
                {roomState.players.find((p) => p.id === q.playerId)?.name ?? "?"}
              </span>
              <span class="truncate">{q.name}</span>
              {#if i === 0}
                <span class="ml-auto shrink-0 text-caption font-semibold">on stage</span>
              {/if}
            </li>
          {/each}
        </ol>
      {/if}
    </Sheet>
  {/if}

  {#if passSheet}
    <Sheet title="Pass" onClose={() => (passSheet = false)}>
      <p class="mb-3 font-ui text-body">Pass this round? Passing is final until the next draw.</p>
      <div class="flex gap-2">
        <button
          class="flex-1 rounded-[var(--radius-button)] bg-ink-black px-4 py-3 font-ui text-body font-bold text-paper-white"
          onclick={pass}
        >
          Pass
        </button>
        <button
          class="flex-1 rounded-[var(--radius-button)] border-2 border-ink-black bg-paper-white px-4 py-3 font-ui text-body font-semibold"
          onclick={() => (passSheet = false)}
        >
          Cancel
        </button>
      </div>
    </Sheet>
  {/if}
{:else}
  <p class="p-6 font-ui text-body">Waiting for the round…</p>
{/if}
