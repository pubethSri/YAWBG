<script lang="ts">
  import type { PublicRoomState } from "@yawbg/protocol";
  import QrCode from "../QrCode.svelte";

  // The lobby splash is the one screen whose whole job is getting phones into
  // the room: code huge, QR deep link beside it (docs/05). Nothing here is
  // required — the phone lobby carries the same join link — but this is the
  // path that skips typing entirely.
  let { roomState }: { roomState: PublicRoomState } = $props();

  const joinUrl = $derived(`${location.origin}/?code=${roomState.code}`);
  const connected = $derived(roomState.players.filter((p) => p.connected));
</script>

<div class="grid h-dvh grid-rows-[minmax(0,1fr)_auto] gap-[3vh] overflow-hidden p-[3vw]">
  <div class="grid min-h-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-[4vw]">
    <div class="flex min-w-0 flex-col gap-[2vh]">
      <span class="font-ui text-d-heading font-bold uppercase tracking-[0.03em] text-slate-gray">
        Join the room
      </span>
      <!-- The code is the whole point of this screen. Yellow sticker, ink text
           (15.08:1), rotated like the decal it is. -->
      <span
        class="tabular inline-block -rotate-2 self-start rounded-[var(--radius-card)] border-[3px] border-ink-black bg-sunburst-yellow px-[2.5vw] py-[1.5vh] font-shout text-d-hero font-extrabold leading-none tracking-[0.03em] text-ink-black"
      >
        {roomState.code}
      </span>
      <p class="break-all font-ui text-d-body text-ink-black">
        {joinUrl}
      </p>
    </div>

    <div class="flex shrink-0 flex-col items-center gap-[1.5vh]">
      <div class="rotate-2 rounded-[var(--radius-card)] border-[3px] border-ink-black bg-paper-white p-[1vw]">
        <QrCode url={joinUrl} size={280} />
      </div>
      <span class="font-ui text-d-body-sm font-semibold text-slate-gray">Point a camera here</span>
    </div>
  </div>

  <div class="flex shrink-0 flex-col gap-[1.5vh]">
    <h2 class="font-ui text-d-heading font-bold text-ink-black">
      At the table <span class="tabular font-normal text-slate-gray">({connected.length})</span>
    </h2>
    {#if roomState.players.length === 0}
      <p class="font-ui text-d-body text-slate-gray">Nobody yet.</p>
    {:else}
      <div class="flex flex-wrap gap-[0.8vw]">
        {#each roomState.players as p (p.id)}
          <span
            class="anim-pop flex items-center gap-[0.5vw] rounded-[var(--radius-tag)] border-2 border-near-black bg-paper-white px-[1vw] py-[0.6vh] font-ui text-d-body font-semibold text-ink-black"
          >
            {#if !p.connected}
              <span class="h-[0.9vh] w-[0.9vh] rounded-full bg-mist-gray"></span>
            {/if}
            {p.name}
            {#if p.isHost}
              <span
                class="rounded-[var(--radius-tag)] bg-electric-violet px-[0.5vw] py-[0.2vh] font-ui text-d-caption font-semibold text-paper-white"
              >
                host
              </span>
            {/if}
          </span>
        {/each}
      </div>
    {/if}
  </div>
</div>
