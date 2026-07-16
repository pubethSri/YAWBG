<script lang="ts">
  import type { PublicRoomState } from "@yawbg/protocol";
  import { socket } from "../socket.svelte";
  import StatusGrid from "./StatusGrid.svelte";

  let { roomState }: { roomState: PublicRoomState } = $props();

  const me = $derived(roomState.players.find((p) => p.id === socket.session?.playerId));
  const isHost = $derived(me?.isHost ?? false);
  const board = $derived(socket.privateBoard);
  const others = $derived(roomState.players.filter((p) => p.id !== socket.session?.playerId));

  const K = $derived(roomState.settings.sabotageCells);
  const middleRow = $derived(roomState.settings.sabotagePlacement === "middleRow");
  const reserved = $derived(middleRow ? new Set([10, 11, 12, 13, 14]) : new Set<number>());
  const requiredOwn = $derived(25 - K);

  const ownFilledCount = $derived(
    board ? board.cells.filter((c, i) => !reserved.has(i) && c.name !== null).length : 0,
  );
  const poolFilledCount = $derived(board ? board.poolSlots.filter((s) => s !== null).length : 0);
  const isComplete = $derived(ownFilledCount === requiredOwn && poolFilledCount === K);

  const readyCount = $derived(roomState.players.filter((p) => p.fillDone).length);
  const totalCount = $derived(roomState.players.length);

  let mode = $state<"dump" | "arrange">("dump");
  let dumpTarget = $state<"own" | "pool">("own");
  let dumpText = $state("");
  let dumpInput: HTMLInputElement | undefined = $state();
  let nudged = $state(false);

  // Dump mode is "one big autofocused text input" per docs/06-key-screens.md;
  // done via an effect rather than the autofocus attribute (a11y lint, and it
  // needs to refocus whenever the own/pool toggle flips too).
  $effect(() => {
    if (mode === "dump") dumpInput?.focus();
  });

  function nextOpenOwnIndex(): number | null {
    if (!board) return null;
    for (let i = 0; i < 25; i++) {
      if (reserved.has(i)) continue;
      if (board.cells[i]!.name === null) return i;
    }
    return null;
  }

  function nextOpenPoolSlot(): number | null {
    if (!board) return null;
    for (let i = 0; i < board.poolSlots.length; i++) {
      if (board.poolSlots[i] === null) return i;
    }
    return null;
  }

  function submitDump(e: Event) {
    e.preventDefault();
    const name = dumpText.trim();
    if (!name || me?.fillDone) return;
    if (dumpTarget === "own") {
      const idx = nextOpenOwnIndex();
      if (idx === null) {
        if (K > 0) {
          dumpTarget = "pool";
          nudged = true;
        }
        return;
      }
      socket.writeCell(idx, name);
      if (K > 0 && ownFilledCount + 1 >= requiredOwn) {
        dumpTarget = "pool";
        nudged = true;
      }
    } else {
      const slot = nextOpenPoolSlot();
      if (slot === null) return;
      socket.writePool(slot, name);
    }
    dumpText = "";
    dumpInput?.focus();
  }

  let selected = $state<number | null>(null);
  let editing = $state<{ kind: "cell" | "pool"; index: number; value: string } | null>(null);

  function tapCell(index: number) {
    if (me?.fillDone || reserved.has(index)) return;
    if (selected === null) {
      selected = index;
      return;
    }
    if (selected === index) {
      selected = null;
      return;
    }
    swap(selected, index);
    selected = null;
  }

  function swap(a: number, b: number) {
    if (!board) return;
    const nameA = board.cells[a]!.name;
    const nameB = board.cells[b]!.name;
    if (nameB !== null) socket.writeCell(a, nameB);
    else socket.clearCell(a);
    if (nameA !== null) socket.writeCell(b, nameA);
    else socket.clearCell(b);
  }

  function openEdit(kind: "cell" | "pool", index: number) {
    if (me?.fillDone) return;
    const value = kind === "cell" ? (board?.cells[index]?.name ?? "") : (board?.poolSlots[index] ?? "");
    editing = { kind, index, value: value ?? "" };
    selected = null;
  }

  function saveEdit() {
    if (!editing) return;
    const trimmed = editing.value.trim();
    if (editing.kind === "cell") {
      if (trimmed) socket.writeCell(editing.index, trimmed);
      else socket.clearCell(editing.index);
    } else if (trimmed) {
      socket.writePool(editing.index, trimmed);
    }
    editing = null;
  }

  function clearEdit() {
    if (!editing) return;
    if (editing.kind === "cell") socket.clearCell(editing.index);
    editing = null;
  }

  function toggleReady() {
    if (!me) return;
    socket.setDone(!me.fillDone);
  }
</script>

{#if board && me}
  <div class="mx-auto flex max-w-md flex-col gap-4 p-4 pb-28">
    <div class="flex items-center justify-between">
      <h1 class="font-game text-topic font-semibold">Fill your board</h1>
      {#if K > 0}
        <span class="rounded-[var(--radius-tag)] bg-electric-violet px-2 py-1 text-caption font-semibold text-paper-white">
          K = {K}
        </span>
      {/if}
    </div>

    {#if me.fillDone}
      <div class="rounded-[var(--radius-card)] border-2 border-lime-spark bg-paper-white p-4 text-center font-ui">
        <p class="font-semibold">Ready — waiting for the table</p>
        <p class="text-body-sm text-slate-gray">{readyCount}/{totalCount} ready</p>
        <button
          class="mt-3 rounded-[var(--radius-button)] border-2 border-ink-black bg-paper-white px-4 py-2 font-semibold"
          onclick={toggleReady}
        >
          Un-ready
        </button>
      </div>
    {:else}
      <div class="flex gap-2">
        <button
          class="flex-1 rounded-[var(--radius-button)] py-2 font-ui font-semibold"
          class:bg-ink-black={mode === "dump"}
          class:text-paper-white={mode === "dump"}
          class:border-2={mode !== "dump"}
          class:border-near-black={mode !== "dump"}
          onclick={() => (mode = "dump")}
        >
          Dump
        </button>
        <button
          class="flex-1 rounded-[var(--radius-button)] py-2 font-ui font-semibold"
          class:bg-ink-black={mode === "arrange"}
          class:text-paper-white={mode === "arrange"}
          class:border-2={mode !== "arrange"}
          class:border-near-black={mode !== "arrange"}
          onclick={() => (mode = "arrange")}
        >
          Arrange
        </button>
      </div>
    {/if}

    {#if !me.fillDone && mode === "dump"}
      <div class="flex flex-col gap-2">
        {#if K > 0}
          <div class="flex gap-2">
            <button
              class="flex-1 rounded-[var(--radius-button)] border-2 border-near-black py-1.5 font-ui text-body-sm font-semibold"
              class:bg-ink-black={dumpTarget === "own"}
              class:text-paper-white={dumpTarget === "own"}
              onclick={() => (dumpTarget = "own")}
            >
              Own board
            </button>
            <button
              class="flex-1 rounded-[var(--radius-button)] border-2 border-near-black py-1.5 font-ui text-body-sm font-semibold"
              class:bg-ink-black={dumpTarget === "pool"}
              class:text-paper-white={dumpTarget === "pool"}
              onclick={() => (dumpTarget = "pool")}
            >
              Pool
            </button>
          </div>
          {#if nudged && dumpTarget === "pool"}
            <p class="text-center text-caption text-slate-gray">Own board full — now filling the pool</p>
          {/if}
        {/if}
        <form class="flex gap-2" onsubmit={submitDump}>
          <input
            bind:this={dumpInput}
            bind:value={dumpText}
            maxlength="60"
            placeholder={dumpTarget === "own" ? "Type a name…" : "Type a pool name…"}
            class="flex-1 rounded-[var(--radius-button)] border border-near-black px-3 py-2 font-ui text-body"
          />
          <button
            type="submit"
            class="rounded-[var(--radius-button)] bg-ink-black px-4 py-2 font-ui font-semibold text-paper-white"
          >
            Add
          </button>
        </form>
        <p class="text-center font-ui text-body-sm text-slate-gray">
          {dumpTarget === "own" ? `${ownFilledCount}/${requiredOwn} own` : `${poolFilledCount}/${K} pool`}
        </p>
      </div>
    {/if}

    <div class="grid grid-cols-5 gap-1.5">
      {#each board.cells as cell, i (i)}
        {#if reserved.has(i)}
          <div
            class="flex aspect-square items-center justify-center rounded-[var(--radius-tag)] border border-dashed border-pale-gray bg-cream-blush text-caption text-slate-gray"
          >
            pool
          </div>
        {:else}
          <div
            role="button"
            tabindex="0"
            class="relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-[var(--radius-tag)] border border-near-black p-1 text-center font-ui text-[11px] leading-tight"
            class:bg-paper-white={cell.name !== null}
            class:bg-cream-blush={cell.name === null}
            class:border-dashed={cell.name === null}
            style={selected === i ? "box-shadow: var(--shadow-ring); transform: scale(1.05);" : ""}
            onclick={() => (mode === "arrange" ? tapCell(i) : undefined)}
            onkeydown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && mode === "arrange") {
                e.preventDefault();
                tapCell(i);
              }
            }}
          >
            <span class="line-clamp-3 break-words">{cell.name ?? ""}</span>
            {#if mode === "arrange" && selected === i}
              <button
                type="button"
                class="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-sunburst-yellow text-[10px]"
                onclick={(e) => {
                  e.stopPropagation();
                  openEdit("cell", i);
                }}
              >
                ✎
              </button>
            {/if}
          </div>
        {/if}
      {/each}
    </div>

    {#if K > 0 && (mode === "arrange" || me.fillDone)}
      <div>
        <p class="mb-1 font-ui text-body-sm font-semibold text-slate-gray">Pool contributions</p>
        <div class="flex flex-wrap gap-1.5">
          {#each board.poolSlots as slot, i (i)}
            <button
              class="rounded-[var(--radius-tag)] border border-near-black bg-lime-spark/20 px-2 py-1.5 font-ui text-[11px]"
              onclick={() => (mode === "arrange" ? openEdit("pool", i) : undefined)}
            >
              {slot ?? "empty"}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    {#if !me.fillDone}
      <button
        class="rounded-[var(--radius-button)] px-4 py-3 font-ui text-body font-bold text-paper-white disabled:bg-mist-gray disabled:text-slate-gray"
        class:bg-lime-spark={isComplete}
        class:bg-mist-gray={!isComplete}
        disabled={!isComplete}
        onclick={toggleReady}
      >
        {isComplete ? "Ready" : `${ownFilledCount}/${requiredOwn} own · ${poolFilledCount}/${K} pool`}
      </button>
    {/if}

    {#if isHost && readyCount < totalCount}
      <button
        class="rounded-[var(--radius-button)] border-2 border-coral-blaze px-4 py-2 font-ui text-body-sm font-semibold text-coral-blaze"
        onclick={() => socket.forceStart()}
      >
        Force start ({readyCount}/{totalCount} ready)
      </button>
    {/if}

    {#if others.length > 0}
      <h2 class="mt-2 font-ui text-heading font-bold">Other players</h2>
      <div class="flex flex-col gap-3">
        {#each others as p (p.id)}
          <StatusGrid player={p} />
        {/each}
      </div>
    {/if}
  </div>

  {#if editing}
    <div
      class="fixed inset-0 z-10 flex items-end bg-ink-black/40"
      role="button"
      tabindex="0"
      onclick={(e) => { if (e.target === e.currentTarget) editing = null; }}
      onkeydown={(e) => { if (e.key === "Escape") editing = null; }}
    >
      <div class="w-full rounded-t-[var(--radius-card)] bg-paper-white p-4">
        <p class="mb-2 font-ui text-body-sm font-semibold text-slate-gray">
          {editing.kind === "cell" ? "Edit cell" : "Edit pool name"}
        </p>
        <input
          bind:value={editing.value}
          maxlength="60"
          class="mb-3 w-full rounded-[var(--radius-button)] border border-near-black px-3 py-2 font-ui text-body"
        />
        <div class="flex gap-2">
          <button
            class="flex-1 rounded-[var(--radius-button)] bg-ink-black py-2 font-ui font-semibold text-paper-white"
            onclick={saveEdit}
          >
            Save
          </button>
          {#if editing.kind === "cell"}
            <button
              class="flex-1 rounded-[var(--radius-button)] border-2 border-near-black py-2 font-ui font-semibold"
              onclick={clearEdit}
            >
              Clear
            </button>
          {/if}
        </div>
      </div>
    </div>
  {/if}
{/if}
