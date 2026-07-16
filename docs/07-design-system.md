# 07 — Design system

The visual language for every YAWBG surface: player view, display view, and the
share-to-PNG board render. Self-contained — this doc is the single source of
truth for styling. Screens and interactions it styles are defined in
`05-ux-flow.md` and `06-key-screens.md`.

## Theme in one sentence

**A sticker-bombed tabletop**: a warm cream canvas, saturated color blocks
behaving like die-cut decals, and exactly one depth cue — the **die-cut ring**,
a yellow band inside a hard ink outline, the edge a real sticker gets when it's
punched out of the sheet. Flat everywhere: no gradients, no drop shadows, no
blur, no opacity layering. The layout energy comes from rotation and overlap
(stickers at -15° to 15°), not from elevation. It should feel like game night
paraphernalia scattered on a table, not a dashboard.

**Light-only for v1.** The cream tabletop *is* the brand; a dark variant is a
deliberate non-goal until after v1 (revisit with real night-play feedback).

## Color tokens

| Name | Value | Token | Role |
|---|---|---|---|
| Cream Blush | `#ffe9ce` | `--color-cream-blush` | Page canvas — the tabletop everything sticks to |
| Paper White | `#ffffff` | `--color-paper-white` | Cards, speech bubbles, board cells, neutral plates inside color blocks |
| Ink Black | `#000000` | `--color-ink-black` | Primary text, wordmark, sticker outlines, the die-cut ring's outer band |
| Slate Gray | `#666666` | `--color-slate-gray` | Secondary text, muted helper copy |
| Near Black | `#101010` | `--color-near-black` | Input text and input borders — the UI control ink |
| Mist Gray | `#dddddd` | `--color-mist-gray` | Disabled fills, low-emphasis surfaces |
| Pale Gray | `#cccccc` | `--color-pale-gray` | Disabled borders/underlines |
| Electric Violet | `#7534e8` | `--color-electric-violet` | The cool anchor: locked cells, section blocks, badges |
| Coral Blaze | `#fd4b38` | `--color-coral-blaze` | Urgency: House hits, on-stage takeover, starbursts |
| Sunburst Yellow | `#ffd80c` | `--color-sunburst-yellow` | The ring's inner band, sticker fills, section blocks |
| Aqua Pop | `#0fd9c0` | `--color-aqua-pop` | Fresh-pop accent: pool-received cells, ready states, small badges |
| Deep Indigo | `#0500a3` | `--color-deep-indigo` | Accent text on light cards — the cool counterweight to coral |

### Color rules

- All five brand colors (violet, coral, yellow, aqua, cream) are used at **full
  saturation only** — no tints, no desaturated variants, no opacity fades. A
  color is either present or it isn't.
- **Text contrast pairs are fixed and measured** (see the table below). White
  text on violet only. **Ink text on coral, yellow, aqua, and cream.** Never
  invert within a block. Deep Indigo is allowed as accent text on cream/white
  only.
- Max **four sticker colors in one composition** — collage, not kaleidoscope.
- Page rhythm on marketing-ish surfaces (landing, results) is alternating
  full-bleed color blocks (violet → yellow → coral → cream), not white/gray
  bands. In-game screens stay calmer: cream canvas + white cells, with color
  reserved for state.

### Measured contrast — the sanctioned pairs

Every pair below is computed, not eyeballed. Body text needs **4.5:1**;
non-text UI (rings, borders, fills that carry meaning) needs **3:1**. Do not
introduce a pair that isn't on this list without measuring it first.

| Pair | Ratio | Verdict |
|---|---|---|
| Ink on Cream | 17.80:1 | Body ✓ |
| Ink on Paper White | 21.00:1 | Body ✓ |
| Ink on Sunburst Yellow | 15.08:1 | Body ✓ |
| Ink on Aqua Pop | 11.71:1 | Body ✓ |
| Ink on Coral Blaze | 6.24:1 | Body ✓ |
| White on Electric Violet | 6.15:1 | Body ✓ |
| Deep Indigo on Cream | 11.59:1 | Body ✓ |
| Slate Gray on Cream | 4.87:1 | Body ✓ (helper copy only) |
| Ink ring vs Cream canvas | 17.80:1 | UI ✓ |
| Ink ring vs Paper White | 21.00:1 | UI ✓ |
| Electric Violet fill vs Cream | 5.22:1 | UI ✓ |

**Banned pairs** (previously in this doc, measured and removed): white on coral
(3.37:1), white on aqua (1.79:1), and a bare yellow ring on cream (1.18:1) or
on white (1.39:1). Yellow never carries contrast on its own — the ink band
does. See "Elevation" below.

### Game-state color mapping

| State | Treatment |
|---|---|
| Locked cell (daubed) | Electric Violet fill, white name, tiny tag line |
| House hit / on-stage proposal | Coral Blaze fill, **ink** text |
| Selected / focused / pending | The die-cut ring |
| Pool-received cell (reveal), ready checkmarks | Aqua Pop fill, ink text |
| Near-complete line highlight | Die-cut ring on the line's remaining cells |
| Disabled | Mist Gray fill, Pale Gray border |

## Typography — three voices

There is no single-family hierarchy; hierarchy comes from **which voice is
speaking**. All families are free (Google Fonts / Fontsource), self-hosted at
build time (required by the PWA shell caching anyway). Latin font leads each
stack; the Thai companion supplies Thai glyphs automatically.

| Voice | Stack | Weights | Speaks for |
|---|---|---|---|
| **Game** | `'Fraunces', 'Taviraj', serif` | 400, 600, 700 | The game itself: topic text, results verdicts, editorial headings. Humanist serif warmth; Taviraj is looped Thai (มีหัว) — the formal register |
| **UI** | `'Inter', 'Kanit', sans-serif` | 400, 500, 600, 700 | Everything interactive: cells, buttons, chips, body copy, settings |
| **Shout** | `'Baloo 2', 'Kanit', sans-serif` | 800 | Stickers: wordmark, starbursts, drawn numbers, "BINGO!" (Kanit 800 covers Thai shouts) |

**Why the UI voice is neutral.** Inter is deliberately the least playful thing
in the system, and that is the point three times over. It reinforces the
product's central pillar — *the app is never the judge, only the
board/randomizer/record-keeper* — by literally speaking in a clerk's voice
while the game shouts around it. It survives the cell-name size floor, where a
rounded geometric smears. And it metrically matches Kanit, its Thai companion,
in a way the previous rounded UI face never did. **Playfulness is carried by
the Shout voice, the color, and the rotation — not by the body text.** If a
screen feels flat, add a sticker, don't soften the UI font.

Voice rules:

- The Game voice is precious — if everything is serif, nothing is. Topics,
  verdicts, and one heading per screen, no more.
- Never use the Shout voice below 16 px or for more than ~3 words.
- No light weights (< 400) anywhere.
- **Tabular numerals are mandatory** for drawn numbers, the House board, room
  codes, round counters, and any timer: `font-variant-numeric: tabular-nums`.
  Proportional digits reflow the layout as values change.
- No other font-specific OpenType features; default rendering everywhere.
- Body line-height 1.4–1.5; Game-voice display lines 1.1–1.15; Shout lines 1.0.
- Letter-spacing: default everywhere except uppercase Shout text (+0.03em).

### Type ramp

Player view is the base; the display view multiplies display-ish roles because
it is read from across a room.

| Role | Voice | Phone | Display | Weight |
|---|---|---|---|---|
| caption / tag / chip | UI | 12px | 20px | 600 |
| body-sm | UI | 14px | 24px | 400–500 |
| body / input / button | UI | 16px | 28px | 400 (buttons 700) |
| cell name | UI | 14px, auto-shrink floor **12px** | 24px | 600 |
| section heading | UI | 18px | 32px | 700 |
| topic text | Game | 28px | 72px | 600 |
| verdict / results headline | Game | 32px | 88px | 700 |
| drawn-number sticker | Shout | 48px | 160px | 800 |
| wordmark / hero | Shout | 64px | 200px | 800 |

**12 px is the floor, everywhere, no exceptions.** If a name doesn't fit at
12 px, it truncates with an ellipsis and the full value is available by tapping
the cell — it does not shrink to 11 px. Inputs stay at 16 px so iOS doesn't
auto-zoom on focus.

## Spacing & shape

- **Base unit 6 px.** Scale: 6 / 12 / 18 / 24 / 30 / 36 / 48 / 60. Phone
  screens run compact (card padding 18–24 px); the display view and landing
  page run spacious (section padding 60 px+).
- **Radii — the entire shape vocabulary is three values:** buttons **5 px**,
  tags **10 px**, cards & sheets **15 px**, pills/circles **999 px**. Nothing
  else.
- **Touch targets are ≥ 44 × 44 px.** Board cells, chips, and sheet handles
  that render smaller get their hit area extended past their visual bounds.
- **Elevation — exactly one, the die-cut ring:**
  `box-shadow: 0 0 0 2px #ffd80c, 0 0 0 4px #000`. The yellow band is the brand
  signal; the ink band carries the contrast (17.80:1 against cream). It means
  *active / selected / focused*, and it doubles as the keyboard focus
  indicator. There is no other shadow in the system. Never ship the yellow band
  alone — it is invisible on both cream and white.
- Sticker rotation: -15° to 15°; energy comes from angle, not extra colors.
  Stickers may overlap and crowd; never separate them with gray dividers.

## Motion

Motion exists to explain cause and effect — a name arriving, a cell locking,
the House landing a hit. Decorative animation is not part of this system.

- **Durations:** 150 ms for micro-interactions (press, hover, ring on/off),
  250 ms for state changes (cell lock, sheet open), 400 ms ceiling for the one
  showpiece per screen. Exits run at ~70% of their entrance.
- **Easing:** `ease-out` entering, `ease-in` exiting. Never `linear`.
- **Animate `transform` and `opacity` only.** Never width, height, top, or
  left — they reflow the board grid.
- **Transitional opacity is allowed; static opacity is not.** A cell may fade
  during a 250 ms transition. A cell may not *rest* at 20% of a brand color —
  that's a tint, and tints are banned. Ship the full-saturation fill or a
  different token.
- **One moving thing per screen.** The draw starburst or the lock, not both.
- **`prefers-reduced-motion: reduce` is honored everywhere**: rotation,
  scale, and the pool-reveal flash all collapse to an instant state change.
  The final state must be identical either way — motion never carries meaning
  alone.

Named moments:

- **Pool-received reveal** — cell flashes Aqua Pop, settles to white over
  400 ms. Stagger siblings by 40 ms; never reveal all 25 at once.
- **Cell select** — die-cut ring appears, `scale(1.05)`, 150 ms.
- **Lock confirm** — cell fills Electric Violet, 250 ms, no bounce.
- **House hit** — coral fill, 250 ms; the starburst is the showpiece.

## Component recipes

Core controls:

- **Button**: Paper White fill, 5 px radius, 2 px Ink Black border, Ink Black
  text UI-voice 700. Hover/active flips to Ink Black fill + white text. Focus
  shows the die-cut ring. Primary irreversible actions (Confirm lock) start
  ink-filled. Disabled: Mist Gray fill, Pale Gray border, no ring, `disabled`
  attribute set — never a look-alike.
- **Text input**: Paper White fill, 1 px Near Black border, 5 px radius, 16 px
  text; border thickens to 2 px on focus **and** the die-cut ring appears.
  Labels are always visible — placeholders are never the label.
- **Chip / tag** (House chip, queue badge, lock tag): 10 px radius or pill,
  UI-voice 600 at 12 px, colored per game-state mapping.
- **Bottom sheet** (cell sheet, queue sheet, House sheet, takeover): Paper
  White, 15 px top radius, drag handle, visible close affordance; sits on a
  plain ink scrim at 50% (solid color at low emphasis is the one sanctioned
  "overlay", no blur). Respects the bottom safe area.
- **Inline link**: ink or slate text with a 1 px slate/pale bottom border — the
  border is the underline.

Sticker vocabulary (decorative, decal-like, always rotated a few degrees):

- **Starburst** — 12/16-point jagged star, coral or yellow fill, Shout voice.
  Used for: draw moment ("B-12!"), House bingo ("BINGO!"), results stamps
  ("WINNER" / "SO CLOSE").
- **Speech bubble** — white fill, 15 px radius, small triangular tail, Game or
  UI voice. Used for: proposal on stage ("Nok proposes Gordon Ramsay"),
  display-screen annotations.
- **Circular badge** — pill-radius circle, violet (white text) or aqua (ink
  text) fill, Shout voice. Used for: drawn numbers on the called board, "NEW!",
  round number.
- **Diagonal label** — coral rectangle, 5 px radius, rotated -12° to -20°, ink
  Shout text. Used for: "FINAL ROUND", "LAST CALL", lobby "JOIN AT
  yawbg.example ↗".

Screen applications (see `06-key-screens.md` for layout):

- **Board cell**: Paper White, 10 px radius, 1 px Near Black border. Empty =
  cream fill + dashed border. Filled = white + ink name. Locked = violet +
  white name + 12 px tag. Selected (arrange/proposal) = die-cut ring + slight
  scale-up. Pool-received (reveal moment) = aqua flash → settles to white.
- **Topic banner**: cream surface, topic in Game voice with quotation marks as
  part of the design, round/number chips beside it.
- **House board (display + sheet)**: white cells, hits flip to coral with ink
  numbers; the "2 away" chip uses coral text on white.
- **Share-to-PNG board**: rendered on the cream canvas with the wordmark, room
  code, date, and a starburst win/lose stamp — the exported image is a design
  artifact of this system, same tokens.

## Icons

SVG only, one family: **Lucide**, 2 px stroke, sized on a 24 px grid
(`icon-sm` 18, `icon-md` 24, `icon-lg` 32). No emoji as structural icons —
they're font-dependent across phones and can't be themed. Icon-only controls
carry an `aria-label`. Icons inherit `currentColor` so they follow the
sanctioned text pairs automatically.

## Do / Don't

**Do**: keep flat surfaces; use the die-cut ring as the only elevation;
alternate full-bleed color blocks on editorial surfaces; let stickers rotate
and overlap; use ink-on-cream, ink-on-coral/yellow/aqua, and white-on-violet
pairs; use tabular numerals for anything that counts; keep the serif rare.

**Don't**: no drop shadows/blur/gradients/static opacity layering; no tints of
brand colors; no bare yellow ring; no white text on coral or aqua; no gray-fill
buttons; no serif body text; no Shout voice in body sizes; no text below 12 px;
no new radii; no dark mode work in v1.

## Quick start (Tailwind v4 `@theme`)

**`static` is required, not optional.** Tailwind v4 tree-shakes any `@theme`
variable no utility happens to reference, and it silently drops tokens outside
its known namespaces — `--duration-*` and `--spacing-unit` are not Tailwind
namespaces and never emit without it. Verified in-browser: without `static`,
every motion token and the spacing base resolve to the empty string.

```css
@theme static {
  /* Colors */
  --color-cream-blush: #ffe9ce;
  --color-paper-white: #ffffff;
  --color-ink-black: #000000;
  --color-slate-gray: #666666;
  --color-near-black: #101010;
  --color-mist-gray: #dddddd;
  --color-pale-gray: #cccccc;
  --color-electric-violet: #7534e8;
  --color-coral-blaze: #fd4b38;
  --color-sunburst-yellow: #ffd80c;
  --color-aqua-pop: #0fd9c0;
  --color-deep-indigo: #0500a3;

  /* Typography — voices */
  --font-game: 'Fraunces', 'Taviraj', serif;
  --font-ui: 'Inter', 'Kanit', sans-serif;
  --font-shout: 'Baloo 2', 'Kanit', sans-serif;

  /* Type ramp (player view; display view scales up per 07 ramp table) */
  --text-caption: 12px;
  --text-body-sm: 14px;
  --text-body: 16px;
  --text-heading: 18px;
  --text-topic: 28px;
  --text-verdict: 32px;
  --text-number: 48px;
  --text-hero: 64px;

  /* Spacing (base unit 6px) */
  --spacing-unit: 6px;

  /* Radii — the whole vocabulary */
  --radius-button: 5px;
  --radius-tag: 10px;
  --radius-card: 15px;
  --radius-pill: 999px;

  /* Elevation — the only shadow in the system.
     Yellow is the brand signal; ink carries the contrast (17.8:1 on cream).
     Never ship the yellow band alone. */
  --shadow-ring: 0 0 0 2px #ffd80c, 0 0 0 4px #000000;

  /* Motion */
  --duration-micro: 150ms;
  --duration-state: 250ms;
  --duration-showpiece: 400ms;
  --ease-enter: cubic-bezier(0, 0, 0.2, 1);
  --ease-exit: cubic-bezier(0.4, 0, 1, 1);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Font self-hosting at implementation time: `@fontsource-variable/fraunces`,
`@fontsource-variable/inter`, `@fontsource-variable/baloo-2`,
`@fontsource/taviraj` (400/600/700), `@fontsource/kanit` (400–800; Thai + Latin
subsets). Ship Thai subsets from day one.
