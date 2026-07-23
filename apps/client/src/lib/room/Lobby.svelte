<script lang="ts">
  import { DeckListSchema, type DeckSummary, type PublicRoomState, type Settings } from "@yawbg/protocol";
  import { socket } from "../socket.svelte";
  import QrCode from "../QrCode.svelte";

  let { roomState }: { roomState: PublicRoomState } = $props();

  let decks = $state<DeckSummary[]>([]);
  $effect(() => {
    fetch("/api/decks")
      .then((r) => r.json())
      .then((raw) => {
        const parsed = DeckListSchema.safeParse(raw);
        if (parsed.success) decks = parsed.data;
      })
      .catch(() => {
        /* picker just stays empty; the server's default deck still plays */
      });
  });

  // docs/01: warn when the deck is thinner than the game is likely to be long.
  // The House bingos around 55-60% of the pool, so that's the rounds estimate.
  const expectedRounds = $derived(
    Math.ceil((roomState.settings.numberPoolSize * 0.6) / roomState.settings.drawsPerRound),
  );
  const selectedDeck = $derived(decks.find((d) => d.id === roomState.settings.deckIds[0]));
  const deckWarning = $derived(
    selectedDeck && selectedDeck.topicCount < expectedRounds
      ? `Only ${selectedDeck.topicCount} topics for roughly ${expectedRounds} rounds — topics will repeat.`
      : null,
  );

  const isHost = $derived(roomState.players.find((p) => p.id === socket.session?.playerId)?.isHost ?? false);
  const connectedCount = $derived(roomState.players.filter((p) => p.connected).length);
  const canStart = $derived(isHost && connectedCount >= 2);

  // The zero-display join path (docs/05): with no TV in the room, the phone
  // lobby has to do the display splash's whole job — hand someone else a link,
  // or let them point a camera at this screen.
  const joinUrl = $derived(`${location.origin}/?code=${roomState.code}`);
  let copied = $state(false);
  let showQr = $state(false);
  /** Set when neither share nor clipboard is available — show the raw URL instead. */
  let manualCopy = $state(false);

  async function shareLink() {
    // Native share where it exists (that's the one that reaches the group chat
    // in one tap); clipboard everywhere else.
    if (navigator.share) {
      try {
        await navigator.share({ title: "YAWBG", text: `Join room ${roomState.code}`, url: joinUrl });
        return;
      } catch (err) {
        // Dismissing the sheet is a decision, not a failure — don't silently
        // reinterpret it as "copy instead".
        if ((err as DOMException)?.name === "AbortError") return;
        /* the browser refused the share — fall through to the clipboard */
      }
    }
    // Both APIs need a secure context. Over plain HTTP — which is exactly how
    // this is played on a LAN before deployment — `navigator.clipboard` is
    // undefined, so this must never claim success it didn't get.
    try {
      await navigator.clipboard.writeText(joinUrl);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      manualCopy = true; // reveal the URL so it can be read out or long-pressed
    }
  }

  function update(patch: Partial<Settings>) {
    if (!isHost) return;
    socket.updateSettings(patch);
  }

  function onPlacementChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value as Settings["sabotagePlacement"];
    if (value === "middleRow") update({ sabotagePlacement: value, sabotageCells: 5 });
    else update({ sabotagePlacement: value });
  }

  function onRoundTimerChange(e: Event) {
    const raw = (e.target as HTMLSelectElement).value;
    update({ roundTimerSec: raw === "off" ? null : Number(raw) });
  }
</script>

<div class="mx-auto flex max-w-md flex-col gap-6 p-6">
  <div class="rotate-[-2deg] self-start rounded-[var(--radius-tag)] bg-sunburst-yellow px-4 py-2 font-shout text-[28px]">
    {roomState.code}
  </div>
  <div class="flex flex-wrap items-center gap-2">
    <button
      class="rounded-[var(--radius-button)] border-2 border-ink-black bg-paper-white px-3 py-1.5 font-ui text-body-sm font-semibold"
      onclick={shareLink}
    >
      {copied ? "Copied!" : "Share join link"}
    </button>
    <button
      class="rounded-[var(--radius-button)] border-2 border-ink-black bg-paper-white px-3 py-1.5 font-ui text-body-sm font-semibold"
      aria-expanded={showQr}
      onclick={() => (showQr = !showQr)}
    >
      {showQr ? "Hide QR" : "Show QR"}
    </button>
    <a
      class="rounded-[var(--radius-button)] border-2 border-ink-black bg-paper-white px-3 py-1.5 font-ui text-body-sm font-semibold"
      href="/display/{roomState.code}"
      target="_blank"
      rel="noopener"
    >
      Open display ↗
    </a>
  </div>
  {#if manualCopy}
    <div class="self-start rounded-[var(--radius-tag)] border-2 border-ink-black bg-paper-white p-2">
      <p class="mb-1 font-ui text-caption font-semibold text-slate-gray">
        Copying needs HTTPS — here's the link:
      </p>
      <p class="font-ui text-body-sm break-all select-all">{joinUrl}</p>
    </div>
  {/if}
  {#if showQr}
    <div class="anim-pop self-start rounded-[var(--radius-card)] border-2 border-ink-black bg-paper-white p-2">
      <QrCode url={joinUrl} size={200} />
    </div>
  {/if}

  <section class="rounded-[var(--radius-card)] border border-near-black bg-paper-white p-4">
    <h2 class="mb-3 font-ui text-heading font-bold">
      Players ({connectedCount} connected)
    </h2>
    <ul class="flex flex-col gap-2">
      {#each roomState.players as p (p.id)}
        <li class="flex items-center gap-2 font-ui text-body">
          <span
            class="h-2.5 w-2.5 rounded-full"
            class:bg-aqua-pop={p.connected}
            class:bg-mist-gray={!p.connected}
          ></span>
          <span>{p.name}</span>
          {#if p.isHost}
            <span class="rounded-[var(--radius-tag)] bg-electric-violet px-2 py-0.5 text-caption font-semibold text-paper-white">
              host
            </span>
          {/if}
          {#if !p.connected}
            <span class="text-caption text-slate-gray">disconnected</span>
          {/if}
        </li>
      {/each}
    </ul>
  </section>

  <section class="rounded-[var(--radius-card)] border border-near-black bg-paper-white p-4">
    <h2 class="mb-3 font-ui text-heading font-bold">Settings</h2>
    <div class="flex flex-col gap-3 font-ui text-body">
      <label class="flex items-center justify-between gap-2">
        <span>Topic deck</span>
        <select
          class="rounded-[var(--radius-button)] border border-near-black px-2 py-1"
          disabled={!isHost || decks.length === 0}
          value={roomState.settings.deckIds[0] ?? ""}
          onchange={(e) => update({ deckIds: [(e.target as HTMLSelectElement).value] })}
        >
          {#each decks as deck (deck.id)}
            <option value={deck.id}>{deck.name} ({deck.topicCount})</option>
          {/each}
        </select>
      </label>
      {#if deckWarning}
        <p class="-mt-2 font-ui text-caption text-coral-blaze">{deckWarning}</p>
      {/if}

      <label class="flex items-center justify-between gap-2">
        <span>Number pool</span>
        <select
          class="rounded-[var(--radius-button)] border border-near-black px-2 py-1"
          disabled={!isHost}
          value={roomState.settings.numberPoolSize}
          onchange={(e) => update({ numberPoolSize: Number((e.target as HTMLSelectElement).value) as 75 | 100 })}
        >
          <option value={75}>75</option>
          <option value={100}>100</option>
        </select>
      </label>

      <label class="flex items-center justify-between gap-2">
        <span>Draws per round</span>
        <select
          class="rounded-[var(--radius-button)] border border-near-black px-2 py-1"
          disabled={!isHost}
          value={roomState.settings.drawsPerRound}
          onchange={(e) =>
            update({ drawsPerRound: Number((e.target as HTMLSelectElement).value) as 1 | 2 | 3 })}
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </label>

      <label class="flex items-center justify-between gap-2">
        <span>House free center</span>
        <input
          type="checkbox"
          checked={roomState.settings.houseFreeCenter}
          disabled={!isHost}
          onchange={(e) => update({ houseFreeCenter: (e.target as HTMLInputElement).checked })}
        />
      </label>

      <label class="flex items-center justify-between gap-2">
        <span>House bingo target</span>
        <select
          class="rounded-[var(--radius-button)] border border-near-black px-2 py-1"
          disabled={!isHost}
          value={roomState.settings.houseBingoTarget}
          onchange={(e) =>
            update({ houseBingoTarget: Number((e.target as HTMLSelectElement).value) as 1 | 2 })}
        >
          <option value={1}>1 line</option>
          <option value={2}>2 lines</option>
        </select>
      </label>

      <label class="flex items-center justify-between gap-2">
        <span>House board visibility</span>
        <select
          class="rounded-[var(--radius-button)] border border-near-black px-2 py-1"
          disabled={!isHost}
          value={roomState.settings.houseBoardVisibility}
          onchange={(e) =>
            update({
              houseBoardVisibility: (e.target as HTMLSelectElement)
                .value as Settings["houseBoardVisibility"],
            })}
        >
          <option value="full">Full</option>
          <option value="progress">Progress</option>
          <option value="hidden">Hidden</option>
        </select>
      </label>

      <label class="flex items-center justify-between gap-2">
        <span>Pool placement</span>
        <select
          class="rounded-[var(--radius-button)] border border-near-black px-2 py-1"
          disabled={!isHost}
          value={roomState.settings.sabotagePlacement}
          onchange={onPlacementChange}
        >
          <option value="random">Random</option>
          <option value="middleRow">Middle row</option>
        </select>
      </label>

      <label class="flex items-center justify-between gap-2">
        <span>Pool cells (K)</span>
        <select
          class="rounded-[var(--radius-button)] border border-near-black px-2 py-1"
          disabled={!isHost || roomState.settings.sabotagePlacement === "middleRow"}
          value={roomState.settings.sabotageCells}
          onchange={(e) => update({ sabotageCells: Number((e.target as HTMLSelectElement).value) })}
        >
          {#each [0, 1, 2, 3, 4, 5, 6, 7, 8] as k (k)}
            <option value={k}>{k}</option>
          {/each}
        </select>
      </label>

      <label class="flex items-center justify-between gap-2">
        <span>Lines to win</span>
        <select
          class="rounded-[var(--radius-button)] border border-near-black px-2 py-1"
          disabled={!isHost}
          value={roomState.settings.playerLinesToWin}
          onchange={(e) =>
            update({ playerLinesToWin: Number((e.target as HTMLSelectElement).value) as 1 | 2 | 3 })}
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </label>

      <label class="flex items-center justify-between gap-2">
        <span>Round timer</span>
        <select
          class="rounded-[var(--radius-button)] border border-near-black px-2 py-1"
          disabled={!isHost}
          value={roomState.settings.roundTimerSec ?? "off"}
          onchange={onRoundTimerChange}
        >
          <option value="off">Off</option>
          <option value={30}>30s</option>
          <option value={60}>60s</option>
          <option value={90}>90s</option>
          <option value={120}>120s</option>
        </select>
      </label>

      <label class="flex items-center justify-between gap-2">
        <span>Last call</span>
        <input
          type="checkbox"
          checked={roomState.settings.lastCall}
          disabled={!isHost}
          onchange={(e) => update({ lastCall: (e.target as HTMLInputElement).checked })}
        />
      </label>
    </div>
  </section>

  {#if isHost}
    <button
      class="rounded-[var(--radius-button)] px-4 py-3 font-ui text-body font-bold text-paper-white disabled:bg-mist-gray disabled:text-slate-gray"
      class:bg-ink-black={canStart}
      disabled={!canStart}
      onclick={() => socket.startGame()}
    >
      {canStart ? "Start game" : "Need at least 2 players"}
    </button>
  {:else}
    <p class="text-center font-ui text-body-sm text-slate-gray">Waiting for the host to start…</p>
  {/if}
</div>
