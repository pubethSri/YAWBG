<script lang="ts">
  // The sticker vocabulary's starburst (docs/07): a jagged star behind Shout
  // text, always rotated a few degrees. Coral or yellow fill, ink text — both
  // are measured Body pairs, and the outline is the ink band that carries the
  // contrast against cream.
  //
  // The star is a SQUARE at a caller-given size, and the label is drawn as SVG
  // text inside it. Both parts matter:
  //
  //  - Square, sized by the caller: an earlier version sized itself to its HTML
  //    text box, so "8" produced a tiny star and "48" a bigger one. A sticker's
  //    size shouldn't depend on how many digits the draw happened to produce.
  //  - SVG text: it scales with the viewBox, so the label always lands inside
  //    the star's inner radius no matter how large the sticker is rendered, and
  //    a 3-digit number (pool size 100) can't overflow the points.
  let {
    label,
    size,
    fill = "coral",
    points = 16,
    rotate = -6,
  }: {
    label: string;
    /** Any CSS length. The star is always square. */
    size: string;
    fill?: "coral" | "yellow";
    points?: number;
    rotate?: number;
  } = $props();

  // Alternating outer/inner radii around a circle: the classic die-cut burst.
  const path = $derived.by(() => {
    const steps = points * 2;
    const coords: string[] = [];
    for (let i = 0; i < steps; i++) {
      const r = i % 2 === 0 ? 50 : 39;
      const a = (i / steps) * Math.PI * 2 - Math.PI / 2;
      coords.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`);
    }
    return coords.join(" ");
  });

  // Multi-word stamps ("HOUSE WINS") wrap rather than shrinking to nothing.
  const lines = $derived(label.trim().split(/\s+/));

  // Fit to the star's inner radius (39 of 100 → a ~74-unit safe box). Baloo 800
  // runs about 0.64em per glyph, plus the 0.03em tracking docs/07 specifies for
  // uppercase Shout text; the height limit keeps stacked lines inside.
  const fontSize = $derived.by(() => {
    const longest = Math.max(...lines.map((l) => l.length));
    const byWidth = 74 / (0.67 * longest);
    const byHeight = 74 / (1.05 * lines.length);
    return Math.min(46, byWidth, byHeight);
  });

  const color = $derived(
    fill === "coral" ? "var(--color-coral-blaze)" : "var(--color-sunburst-yellow)",
  );
</script>

<svg
  viewBox="0 0 100 100"
  style="width: {size}; height: {size}; transform: rotate({rotate}deg);"
  class="shrink-0"
  role="img"
  aria-label={label}
>
  <polygon
    points={path}
    fill={color}
    stroke="var(--color-ink-black)"
    stroke-width="1.5"
    stroke-linejoin="round"
  />
  <text
    x="50"
    y="50"
    text-anchor="middle"
    dominant-baseline="central"
    class="tabular font-shout"
    font-size={fontSize}
    font-weight="800"
    letter-spacing="0.03em"
    fill="var(--color-ink-black)"
  >
    {#each lines as line, i (i)}
      <tspan x="50" dy={i === 0 ? `${-((lines.length - 1) * fontSize * 1.05) / 2}` : `${fontSize * 1.05}`}>
        {line}
      </tspan>
    {/each}
  </text>
</svg>
