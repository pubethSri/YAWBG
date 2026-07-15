# 07 — Design system

The visual language for every YAWBG surface: player view, display view, and the
share-to-PNG board render. Self-contained — this doc is the single source of
truth for styling. Screens and interactions it styles are defined in
`05-ux-flow.md` and `06-key-screens.md`.

## Theme in one sentence

**A sticker-bombed tabletop**: a warm cream canvas, saturated color blocks
behaving like die-cut decals, chunky rounded type, and exactly one depth cue —
a 2 px solid yellow ring. Flat everywhere: no gradients, no drop shadows, no
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
| Ink Black | `#000000` | `--color-ink-black` | Primary text, wordmark, sticker outlines |
| Slate Gray | `#666666` | `--color-slate-gray` | Secondary text, muted helper copy |
| Near Black | `#101010` | `--color-near-black` | Input text and input borders — the UI control ink |
| Mist Gray | `#dddddd` | `--color-mist-gray` | Disabled fills, low-emphasis surfaces |
| Pale Gray | `#cccccc` | `--color-pale-gray` | Disabled borders/underlines |
| Electric Violet | `#8a53ff` | `--color-electric-violet` | The cool anchor: locked cells, section blocks, badges |
| Coral Blaze | `#fd4b38` | `--color-coral-blaze` | Urgency: House hits, on-stage takeover, starbursts |
| Sunburst Yellow | `#ffd80c` | `--color-sunburst-yellow` | The ring (focus/selection/elevation), sticker fills, section blocks |
| Lime Spark | `#3ccb09` | `--color-lime-spark` | Fresh-pop accent: pool-received cells, ready states, small badges |
| Deep Indigo | `#0500a3` | `--color-deep-indigo` | Accent text on light cards — the cool counterweight to coral |

### Color rules

- All five brand colors (violet, coral, yellow, lime, cream) are used at **full
  saturation only** — no tints, no desaturated variants, no opacity fades.
- Text contrast pairs are fixed: **white text on violet and coral; ink text on
  yellow, lime, and cream.** Never invert within a block. Deep Indigo is
  allowed as accent text on cream/white only.
- Max **four sticker colors in one composition** — collage, not kaleidoscope.
- Page rhythm on marketing-ish surfaces (landing, results) is alternating
  full-bleed color blocks (violet → yellow → coral → cream), not white/gray
  bands. In-game screens stay calmer: cream canvas + white cells, with color
  reserved for state.

### Game-state color mapping

| State | Treatment |
|---|---|
| Locked cell (daubed) | Electric Violet fill, white name, tiny tag line |
| House hit / on-stage proposal | Coral Blaze |
| Selected / focused / pending | Sunburst Yellow 2 px ring |
| Pool-received cell (reveal), ready checkmarks | Lime Spark |
| Near-complete line highlight | Yellow ring on the line's remaining cells |
| Disabled | Mist Gray fill, Pale Gray border |

## Typography — three voices

There is no single-family hierarchy; hierarchy comes from **which voice is
speaking**. All families are free (Google Fonts / Fontsource), self-hosted at
build time (required by the PWA shell caching anyway). Latin font leads each
stack; the Thai companion supplies Thai glyphs automatically.

| Voice | Stack | Weights | Speaks for |
|---|---|---|---|
| **Game** | `'Fraunces', 'Taviraj', serif` | 400, 600, 700 | The game itself: topic text, results verdicts, editorial headings. Humanist serif warmth; Taviraj is looped Thai (มีหัว) — the formal register |
| **UI** | `'Quicksand', 'Kanit', sans-serif` | 400, 500, 600, 700 | Everything interactive: cells, buttons, chips, body copy, settings |
| **Shout** | `'Baloo 2', 'Kanit', sans-serif` | 800 | Stickers: wordmark, starbursts, drawn numbers, "BINGO!" (Kanit 800 covers Thai shouts) |

Voice rules:

- The Game voice is precious — if everything is serif, nothing is. Topics,
  verdicts, and one heading per screen, no more.
- Never use the Shout voice below 16 px or for more than ~3 words.
- No light weights (< 400) anywhere.
- No font-specific OpenType features; default rendering everywhere.
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
| cell name | UI | 14px, auto-shrink floor 11px | 24px | 600 |
| section heading | UI | 18px | 32px | 700 |
| topic text | Game | 28px | 72px | 600 |
| verdict / results headline | Game | 32px | 88px | 700 |
| drawn-number sticker | Shout | 48px | 160px | 800 |
| wordmark / hero | Shout | 64px | 200px | 800 |

## Spacing & shape

- **Base unit 6 px.** Scale: 6 / 12 / 18 / 24 / 30 / 36 / 48 / 60. Phone
  screens run compact (card padding 18–24 px); the display view and landing
  page run spacious (section padding 60 px+).
- **Radii — the entire shape vocabulary is three values:** buttons **5 px**,
  tags **10 px**, cards & sheets **15 px**, pills/circles **999 px**. Nothing
  else.
- **Elevation — exactly one:** `box-shadow: 0 0 0 2px #ffd80c` (the yellow
  ring). It means *active / selected / focused*. There is no other shadow in
  the system.
- Sticker rotation: -15° to 15°; energy comes from angle, not extra colors.
  Stickers may overlap and crowd; never separate them with gray dividers.

## Component recipes

Core controls:

- **Button**: Paper White fill, 5 px radius, 2 px Sunburst Yellow ring, Ink
  Black text UI-voice 700. Hover/active flips to Ink Black fill + white text.
  Primary irreversible actions (Confirm lock) start ink-filled. Disabled:
  Mist Gray fill, no ring.
- **Text input**: Paper White fill, 1 px Near Black border, 5 px radius; border
  thickens to 2 px on focus (no extra focus color).
- **Chip / tag** (House chip, queue badge, lock tag): 10 px radius or pill,
  UI-voice 600 at 12 px, colored per game-state mapping.
- **Bottom sheet** (cell sheet, queue sheet, House sheet, takeover): Paper
  White, 15 px top radius, drag handle; sits on a plain ink scrim (solid color
  at low emphasis is the one sanctioned "overlay", no blur).
- **Inline link**: ink or slate text with a 1 px slate/pale bottom border — the
  border is the underline.

Sticker vocabulary (decorative, decal-like, always rotated a few degrees):

- **Starburst** — 12/16-point jagged star, coral or yellow fill, Shout voice.
  Used for: draw moment ("B-12!"), House bingo ("BINGO!"), results stamps
  ("WINNER" / "SO CLOSE").
- **Speech bubble** — white fill, 15 px radius, small triangular tail, Game or
  UI voice. Used for: proposal on stage ("Nok proposes Gordon Ramsay"),
  display-screen annotations.
- **Circular badge** — pill-radius circle, violet or lime fill, white Shout
  text. Used for: drawn numbers on the called board, "NEW!", round number.
- **Diagonal label** — coral rectangle, 5 px radius, rotated -12° to -20°, ink
  or white Shout text. Used for: "FINAL ROUND", "LAST CALL", lobby "JOIN AT
  yawbg.example ↗".

Screen applications (see `06-key-screens.md` for layout):

- **Board cell**: Paper White, 10 px radius, 1 px Near Black border. Empty =
  cream fill + dashed border. Filled = white + ink name. Locked = violet +
  white name + 11 px tag. Selected (arrange/proposal) = yellow ring + slight
  scale-up. Pool-received (reveal moment) = lime flash → settles to white.
- **Topic banner**: cream surface, topic in Game voice with quotation marks as
  part of the design, round/number chips beside it.
- **House board (display + sheet)**: white cells, hits flip to coral with white
  numbers; the "2 away" chip uses coral text on white.
- **Share-to-PNG board**: rendered on the cream canvas with the wordmark, room
  code, date, and a starburst win/lose stamp — the exported image is a design
  artifact of this system, same tokens.

## Do / Don't

**Do**: keep flat surfaces; use the yellow ring as the only elevation; alternate
full-bleed color blocks on editorial surfaces; let stickers rotate and overlap;
use ink-on-cream and white-on-violet/coral pairs; keep the serif rare.

**Don't**: no drop shadows/blur/gradients/opacity layering; no tints of brand
colors; no gray-fill buttons; no serif body text; no Shout voice in body sizes;
no new radii; no dark mode work in v1.

## Quick start (Tailwind v4 `@theme`)

```css
@theme {
  /* Colors */
  --color-cream-blush: #ffe9ce;
  --color-paper-white: #ffffff;
  --color-ink-black: #000000;
  --color-slate-gray: #666666;
  --color-near-black: #101010;
  --color-mist-gray: #dddddd;
  --color-pale-gray: #cccccc;
  --color-electric-violet: #8a53ff;
  --color-coral-blaze: #fd4b38;
  --color-sunburst-yellow: #ffd80c;
  --color-lime-spark: #3ccb09;
  --color-deep-indigo: #0500a3;

  /* Typography — voices */
  --font-game: 'Fraunces', 'Taviraj', serif;
  --font-ui: 'Quicksand', 'Kanit', sans-serif;
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

  /* Elevation — the only shadow in the system */
  --shadow-ring: 0 0 0 2px #ffd80c;
}
```

Font self-hosting at implementation time: `@fontsource-variable/fraunces`,
`@fontsource-variable/quicksand`, `@fontsource-variable/baloo-2`,
`@fontsource/taviraj` (400/600/700), `@fontsource/kanit` (400–800; Thai + Latin
subsets). Ship Thai subsets from day one.
