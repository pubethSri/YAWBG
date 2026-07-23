/**
 * The `roundTimerSec` countdown, client-side.
 *
 * The server owns the real timer and auto-advances the round identically to
 * host force-advance (docs/03) — this is only the display of it. There is
 * deliberately no deadline on the wire: `RoundState` carries no `endsAt`, and
 * adding one would be a protocol change for a *soft* timer. So each client
 * starts its own countdown when it first sees this round's floor open.
 *
 * The cost is that a client which joins or reconnects mid-round shows a
 * generous countdown, and two phones can be a beat apart. Both are acceptable
 * for a timer whose entire job is to stop a table from stalling; the server
 * remains the only thing that actually ends the round.
 *
 * `key` is what makes this correct. Every `room.state` frame replaces the whole
 * snapshot object, so any effect reading it re-runs on every broadcast — a
 * propose, a pass, someone reconnecting. Re-arming on each of those would push
 * the deadline forward all round and the countdown would never reach zero.
 * Arming is therefore keyed on the round's identity, and re-running with an
 * unchanged key is a no-op.
 *
 * Call this during component initialization: it owns its own effects.
 */
export function createCountdown(
  source: () => { key: string | null; seconds: number | null },
) {
  let deadline = $state<number | null>(null);
  let now = $state(Date.now());
  // Plain `let`, not `$state`: this is the arming effect's own memory of what
  // it last armed. Making it reactive would re-trigger the effect that writes it.
  let armedKey: string | null = null;

  $effect(() => {
    const { key, seconds } = source();
    if (key === armedKey) return; // same round, just another snapshot
    armedKey = key;
    now = Date.now();
    deadline = key === null || seconds === null ? null : now + seconds * 1000;
  });

  // Only ticks while a countdown is actually running, and stops itself at zero
  // rather than waking the phone 4× a second for the rest of the game.
  $effect(() => {
    if (deadline === null) return;
    const stopAt = deadline;
    const id = setInterval(() => {
      now = Date.now();
      if (now >= stopAt) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  });

  return {
    /** Whole seconds remaining, or null when no timer is running. */
    get secondsLeft(): number | null {
      if (deadline === null) return null;
      return Math.max(0, Math.ceil((deadline - now) / 1000));
    },
  };
}
