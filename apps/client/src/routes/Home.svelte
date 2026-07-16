<script lang="ts">
  import { navigate } from "../lib/router.svelte";
  import { socket } from "../lib/socket.svelte";

  let playerName = $state("");
  let code = $state(new URLSearchParams(location.search).get("code") ?? "");
  let submitted = $state(false);
  // The session that existed before this submit, if any. We navigate only once a
  // *new* seat replaces it, so a leftover session can't send us to the old room.
  let priorSession = socket.session;

  const ready = $derived(socket.status === "open");

  function create() {
    priorSession = socket.session;
    submitted = true;
    socket.createRoom(playerName);
  }

  function join() {
    priorSession = socket.session;
    submitted = true;
    socket.joinRoom(code, playerName);
  }

  $effect(() => {
    if (submitted && socket.session && socket.session !== priorSession) {
      navigate(`/room/${socket.session.code}`);
    }
  });
</script>

<div class="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
  <h1 class="rotate-[-2deg] self-start rounded-[var(--radius-card)] bg-sunburst-yellow px-4 py-2 font-shout text-hero">
    YAWBG
  </h1>

  {#if socket.session && !submitted}
    <p class="font-ui text-body">
      You have a seat in room {socket.session.code}:
      <a
        class="underline"
        href={`/room/${socket.session.code}`}
        onclick={(e) => { e.preventDefault(); navigate(`/room/${socket.session!.code}`); }}
      >
        rejoin
      </a>
    </p>
  {/if}

  <section class="flex flex-col gap-3 rounded-[var(--radius-card)] border border-near-black bg-paper-white p-4">
    <label class="flex flex-col gap-1 font-ui text-body-sm font-semibold">
      Your name
      <input
        bind:value={playerName}
        maxlength="30"
        placeholder="Nok"
        class="rounded-[var(--radius-button)] border border-near-black px-3 py-2 font-ui text-body font-normal"
      />
    </label>

    <button
      class="rounded-[var(--radius-button)] bg-ink-black px-4 py-3 font-ui text-body font-bold text-paper-white disabled:bg-mist-gray disabled:text-slate-gray"
      disabled={!ready || !playerName.trim()}
      onclick={create}
    >
      Create room
    </button>

    <div class="my-1 flex items-center gap-2 text-caption text-slate-gray">
      <span class="h-px flex-1 bg-pale-gray"></span>
      or join with a code
      <span class="h-px flex-1 bg-pale-gray"></span>
    </div>

    <label class="flex flex-col gap-1 font-ui text-body-sm font-semibold">
      Room code
      <input
        bind:value={code}
        maxlength="4"
        placeholder="ABCD"
        class="rounded-[var(--radius-button)] border border-near-black px-3 py-2 font-ui text-body font-normal uppercase"
      />
    </label>
    <button
      class="rounded-[var(--radius-button)] border-2 border-ink-black bg-paper-white px-4 py-3 font-ui text-body font-bold disabled:border-pale-gray disabled:text-slate-gray"
      disabled={!ready || !playerName.trim() || code.trim().length !== 4}
      onclick={join}
    >
      Join
    </button>
  </section>

  {#if socket.lastError}
    <p class="font-ui text-body-sm text-coral-blaze">error: {socket.lastError.code} — {socket.lastError.message}</p>
  {/if}
</div>
