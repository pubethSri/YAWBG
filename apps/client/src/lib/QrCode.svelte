<script lang="ts">
  import qrcode from "qrcode-generator";

  // The payload is a short deep link (`/?code=XXXX`), so type 0 (auto-size)
  // with the lowest error correction keeps the module count small — a big,
  // sparse code is what reads from across a room and from a phone camera at
  // arm's length. Byte mode: '?' and '=' aren't in QR's alphanumeric set.
  let { url, size = 240 }: { url: string; size?: number } = $props();

  const matrix = $derived.by(() => {
    const qr = qrcode(0, "L");
    qr.addData(url);
    qr.make();
    const count = qr.getModuleCount();
    const dark: { x: number; y: number }[] = [];
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) dark.push({ x: col, y: row });
      }
    }
    return { count, dark };
  });

  // A quiet zone is part of the spec, not decoration — without it scanners
  // fail against the cream canvas.
  const QUIET = 2;
  const span = $derived(matrix.count + QUIET * 2);
</script>

<!-- Ink on Paper White (21:1) — the sanctioned pair, and the only one a
     scanner is guaranteed to resolve. -->
<svg
  viewBox="0 0 {span} {span}"
  width={size}
  height={size}
  shape-rendering="crispEdges"
  role="img"
  aria-label="QR code to join this room"
  class="rounded-[var(--radius-card)]"
>
  <rect width={span} height={span} fill="var(--color-paper-white)" />
  {#each matrix.dark as m (`${m.x}-${m.y}`)}
    <rect x={m.x + QUIET} y={m.y + QUIET} width="1" height="1" fill="var(--color-ink-black)" />
  {/each}
</svg>
