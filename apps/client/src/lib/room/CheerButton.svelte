<script lang="ts">
  import { socket } from "../socket.svelte";

  /**
   * A cheer is applause for a bit that landed — not a like, and not a vote
   * (docs/10 decision 2). It decides nothing: it doesn't gate a lock, doesn't
   * enter a score, and **shows no count to anyone**. This button renders only
   * *your* state, and there is deliberately no number on it: a live tally would
   * let the room read "8 cheers" as the table having spoken, which is exactly
   * the judging the app must never do.
   *
   * The tally surfaces once, at results stage ③, and nowhere else.
   */
  let {
    proposalId,
    cheered,
    mine = false,
    disabled = false,
  }: {
    proposalId: string;
    cheered: boolean;
    /** Your own proposal: the control is disabled, and the server refuses it too. */
    mine?: boolean;
    disabled?: boolean;
  } = $props();

  const off = $derived(mine || disabled);
</script>

<button
  type="button"
  class="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-[var(--radius-tag)] border-2
         disabled:border-pale-gray disabled:bg-mist-gray disabled:text-slate-gray"
  class:border-ink-black={!off}
  class:bg-sunburst-yellow={cheered && !off}
  class:bg-paper-white={!cheered && !off}
  class:text-ink-black={!off}
  aria-pressed={cheered}
  aria-label={mine
    ? "You can't cheer your own name"
    : cheered
      ? "Cheered — tap to take it back"
      : "Cheer this name"}
  disabled={off}
  onclick={() => socket.cheer(proposalId, !cheered)}
>
  <!-- Lucide `star`, 2 px stroke on a 24 px grid, inheriting currentColor so it
       follows the sanctioned text pairs (docs/07's icon rules). Filled when
       given, outline when not — the state is the shape, not just the colour. -->
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill={cheered ? "currentColor" : "none"}
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <polygon
      points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
    />
  </svg>
</button>
