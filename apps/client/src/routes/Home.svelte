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

<h1>YAWBG</h1>
<p>connection: {socket.status}</p>

{#if socket.session && !submitted}
  <p>
    You have a seat in room {socket.session.code}:
    <a href={`/room/${socket.session.code}`} onclick={(e) => { e.preventDefault(); navigate(`/room/${socket.session!.code}`); }}>
      rejoin
    </a>
  </p>
{/if}

<label>
  name
  <input bind:value={playerName} maxlength="30" />
</label>
<button onclick={create} disabled={!ready || !playerName.trim()}>Create room</button>

<label>
  code
  <input bind:value={code} maxlength="4" style="text-transform: uppercase" />
</label>
<button onclick={join} disabled={!ready || !playerName.trim() || code.trim().length !== 4}>Join</button>

{#if socket.lastError}
  <p>error: {socket.lastError.code} — {socket.lastError.message}</p>
{/if}
