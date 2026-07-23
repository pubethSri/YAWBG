import type { ResultsBoardCell } from "@yawbg/protocol";

/**
 * The share-to-PNG board (docs/01 "Share feature", docs/07 "Share-to-PNG
 * board"). The exported image is a design artifact of the system, not a
 * screenshot: same tokens, same voices, drawn on the cream canvas with the
 * wordmark, room code, date and a starburst win/lose stamp.
 *
 * Client-side only — server-side image rendering is an explicit v1 non-goal
 * (docs/02). Everything here runs on a detached `<canvas>`.
 */

/** Logical layout units; the bitmap is SCALE times bigger for retina sharpness. */
const W = 1080;
const PAD = 48;
const GAP = 10;
const SCALE = 2;

/**
 * Header baselines, and the board top derived from them. Kept together and
 * derived rather than hand-tuned: the first version hardcoded a header height
 * of 210 while the last baseline sat at 224, so "N lines completed" rendered
 * underneath row 1 of the board. The starburst is centred high enough that its
 * radius also clears BOARD_TOP — assert-by-construction beats re-measuring.
 */
const LINE_WORDMARK = PAD + 40; // 88
const LINE_META = PAD + 76; // 124  room code · date
const LINE_NAME = PAD + 140; // 188  player name, 56px Game voice
const LINE_LINES = PAD + 176; // 224  "N lines completed"
const STAMP_R = 104;
const STAMP_CY = PAD + 84; // 132 -> the stamp reaches STAMP_CY + STAMP_R = 236
const BOARD_TOP = Math.max(LINE_LINES + 26, STAMP_CY + STAMP_R + 12); // 250

export interface ShareBoardInput {
  playerName: string;
  roomCode: string;
  cells: ResultsBoardCell[];
  linesCompleted: number;
  won: boolean;
  /** Rendered as a local date; the artifact says *when we played*. */
  date?: Date;
}

/** Reads a design token off :root, so no hex is duplicated in this file. */
function token(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || "#000000";
}

/**
 * Canvas never triggers a font download by itself — an unloaded family silently
 * falls back to a system face, and `document.fonts.ready` only waits for loads
 * something actually *asked* for. So every (family, weight) pair this render
 * draws with has to be requested here by hand.
 *
 * Getting this list wrong doesn't produce an obvious failure, it produces a
 * *measurement* failure: `measureText` runs against the fallback, reports a name
 * as fitting on one line, and the paint then lands ~3% wider and overflows its
 * cell. Missing Kanit 700 did exactly that to Thai names. The weights below must
 * stay in sync with every `ctx.font` assignment in this file.
 */
async function ensureFonts(): Promise<void> {
  if (!document.fonts) return;
  // Latin and Thai are requested with their own sample text: a family is only
  // asked for the faces covering the characters passed, so probing Inter with a
  // Thai glyph (or Kanit with a Latin one) resolves to nothing useful.
  const faces: [string, string][] = [
    // Game voice — player name (700), lock topic line (400).
    ['400 32px "Fraunces Variable"', "A"],
    ['700 32px "Fraunces Variable"', "A"],
    ['400 32px "Taviraj"', "ก"],
    ['700 32px "Taviraj"', "ก"],
    // UI voice — cell names (700), meta and tags (600).
    ['600 32px "Inter Variable"', "A"],
    ['700 32px "Inter Variable"', "A"],
    ['600 32px "Kanit"', "ก"],
    ['700 32px "Kanit"', "ก"],
    // Shout voice — wordmark (700), starburst label (800).
    ['700 32px "Baloo 2 Variable"', "A"],
    ['800 32px "Baloo 2 Variable"', "A"],
    ['700 32px "Kanit"', "ก"],
    ['800 32px "Kanit"', "ก"],
  ];
  // A face that isn't installed rejects; the render is still correct via
  // fallback, so failures here are never fatal.
  await Promise.all(
    faces.map(([font, sample]) => document.fonts.load(font, sample).catch(() => undefined)),
  );
  await document.fonts.ready;
}

// The three voices, each with its Thai companion behind it (docs/07) — the same
// stacks app.css declares, restated here because canvas takes a font *string*.
const GAME = '"Fraunces Variable", "Taviraj", serif';
const UI = '"Inter Variable", "Kanit", sans-serif';
const SHOUT = '"Baloo 2 Variable", "Kanit", sans-serif';

/**
 * The tabletop texture (docs/07). The export takes the **base 24 px pitch**, not
 * the display's 48 px: the exported board is a phone-sized artifact viewed in a
 * chat app, so it takes the phone-sized tile.
 *
 * Drawn in logical units — `ctx` is already scaled by SCALE, so the dots land at
 * the same physical pitch as `body`'s CSS tile and get SCALE times the
 * resolution. Geometry is the same 1.5 px radius on a 24 px pitch; the ratio is
 * the load-bearing number.
 */
const TEXTURE_PITCH = 24;
const TEXTURE_RADIUS = 1.5;

function tabletopTexture(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  ctx.fillStyle = token("--color-tabletop-mark");
  ctx.beginPath();
  for (let y = TEXTURE_PITCH / 2; y < h; y += TEXTURE_PITCH) {
    for (let x = TEXTURE_PITCH / 2; x < w; x += TEXTURE_PITCH) {
      ctx.moveTo(x + TEXTURE_RADIUS, y);
      ctx.arc(x, y, TEXTURE_RADIUS, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * Splits into grapheme clusters, so a hard break can't strand a Thai tone mark
 * on a line of its own (code-point iteration would: the mark is its own code
 * point sitting on the base character before it).
 */
function graphemes(text: string): string[] {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (!Segmenter) return [...text];
  return [...new Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map(
    (s) => s.segment,
  );
}

/**
 * Greedy wrap. **No line it returns ever exceeds `maxWidth`** — a word too wide
 * on its own is broken inside, which Thai needs anyway since it doesn't space
 * its words. The old version had a "first word passes unconditionally" escape
 * hatch, and a single mis-measured name walked straight through it and out of
 * its cell.
 */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  const fits = (s: string) => ctx.measureText(s).width <= maxWidth;
  let current = "";

  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (lines.length >= maxLines) return lines;
    const candidate = current ? `${current} ${word}` : word;
    if (fits(candidate)) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = "";
      if (lines.length >= maxLines) return lines;
    }
    if (fits(word)) {
      current = word;
      continue;
    }
    // The word alone overflows: break inside it.
    let chunk = "";
    for (const g of graphemes(word)) {
      if (chunk && !fits(chunk + g)) {
        lines.push(chunk);
        if (lines.length >= maxLines) return lines;
        chunk = g;
      } else {
        chunk += g;
      }
    }
    current = chunk;
  }

  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

/** The sticker vocabulary's starburst, same geometry as Starburst.svelte. */
function starburst(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  label: string,
  fill: string,
  rotateDeg: number,
): void {
  const points = 16;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotateDeg * Math.PI) / 180);
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = (i % 2 === 0 ? 1 : 0.78) * radius;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = r * Math.cos(a);
    const y = r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = radius * 0.03;
  ctx.lineJoin = "round";
  ctx.strokeStyle = token("--color-ink-black");
  ctx.stroke();

  // Fit the label to the inner radius, exactly as the SVG sticker does.
  const words = label.trim().split(/\s+/);
  const safe = radius * 0.78 * 1.9;
  const longest = Math.max(...words.map((w) => w.length));
  const size = Math.min(radius * 0.46, safe / (0.67 * longest), safe / (1.05 * words.length));
  ctx.fillStyle = token("--color-ink-black");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${size}px ${SHOUT}`;
  const top = -((words.length - 1) * size * 1.05) / 2;
  words.forEach((word, i) => ctx.fillText(word, 0, top + i * size * 1.05));
  ctx.restore();
}

/**
 * Draws the board and returns the PNG. Exported separately from `shareBoard`
 * so a caller can preview or test the bitmap without invoking the share sheet.
 */
export async function renderBoardPng(input: ShareBoardInput): Promise<Blob> {
  await ensureFonts();

  const cell = (W - PAD * 2 - GAP * 4) / 5;
  const boardTop = BOARD_TOP;
  const footerH = 96;
  const H = Math.round(boardTop + cell * 5 + GAP * 4 + footerH);

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.scale(SCALE, SCALE);

  const cream = token("--color-cream-blush");
  const ink = token("--color-ink-black");
  const white = token("--color-paper-white");
  const slate = token("--color-slate-gray");
  const violet = token("--color-electric-violet");

  ctx.fillStyle = cream;
  ctx.fillRect(0, 0, W, H);
  // The canvas is the tabletop, here as much as in the browser. Every white cell
  // painted below occludes it by being opaque, exactly as on screen.
  tabletopTexture(ctx, W, H);

  // --- Header: wordmark, who, room code + date -----------------------------
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = ink;
  ctx.font = `700 44px ${SHOUT}`;
  ctx.fillText("YAWBG", PAD, LINE_WORDMARK);

  ctx.font = `600 26px ${UI}`;
  ctx.fillStyle = slate;
  const dateText = (input.date ?? new Date()).toLocaleDateString();
  ctx.fillText(`Room ${input.roomCode} · ${dateText}`, PAD, LINE_META);

  ctx.fillStyle = ink;
  ctx.font = `700 56px ${GAME}`;
  const nameMax = W - PAD * 2 - 250; // clear of the stamp
  ctx.fillText(ellipsize(ctx, input.playerName, nameMax), PAD, LINE_NAME);

  ctx.font = `600 26px ${UI}`;
  ctx.fillStyle = slate;
  const lines = `${input.linesCompleted} ${input.linesCompleted === 1 ? "line" : "lines"} completed`;
  ctx.fillText(lines, PAD, LINE_LINES);

  // The win/lose stamp, top-right of the header. BOARD_TOP is derived from its
  // reach, so it crowds the header without landing on the board.
  starburst(
    ctx,
    W - PAD - 92,
    STAMP_CY,
    STAMP_R,
    input.won ? "WINNER" : "SO CLOSE",
    input.won ? token("--color-sunburst-yellow") : token("--color-coral-blaze"),
    input.won ? -8 : 6,
  );

  // --- The board -----------------------------------------------------------
  input.cells.forEach((c, i) => {
    const x = PAD + (i % 5) * (cell + GAP);
    const y = boardTop + Math.floor(i / 5) * (cell + GAP);
    const locked = c.locked !== null;

    roundRect(ctx, x, y, cell, cell, 10);
    ctx.fillStyle = locked ? violet : white;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = token("--color-near-black");
    ctx.stroke();

    const inset = 10;
    const maxWidth = cell - inset * 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // The name shrinks to fit before it wraps to a third line — a two-line name
    // at a readable size beats three cramped ones.
    let nameSize = 21;
    let nameLines: string[] = [];
    for (const size of [21, 19, 17, 15, 13]) {
      ctx.font = `700 ${size}px ${UI}`;
      nameLines = wrap(ctx, c.name, maxWidth, 3);
      nameSize = size;
      if (nameLines.length <= 2) break;
    }
    ctx.font = `700 ${nameSize}px ${UI}`;
    ctx.fillStyle = locked ? white : ink;

    // Locked cells give up the bottom of the box to the tag (docs/07: locked =
    // violet + white name + 12 px tag). Unlocked cells centre the name.
    const tagH = locked ? 40 : 0;
    const blockTop = y + (cell - tagH) / 2 - ((nameLines.length - 1) * nameSize * 1.2) / 2;
    nameLines.forEach((line, n) => {
      ctx.fillText(line, x + cell / 2, blockTop + n * nameSize * 1.2);
    });

    if (c.locked) {
      const tagY = y + cell - 26;
      ctx.font = `600 15px ${UI}`;
      ctx.fillStyle = white;
      ctx.fillText(`R${c.locked.round} · ${c.locked.drawnNumber}`, x + cell / 2, tagY - 16);
      // The topic is what makes the artifact self-documenting: the whole point
      // of a permanent tag is that the board explains its own jokes later.
      ctx.font = `400 14px ${GAME}`;
      ctx.fillText(ellipsize(ctx, `“${c.locked.topicText}”`, maxWidth), x + cell / 2, tagY + 4);
    }
  });

  // --- Footer --------------------------------------------------------------
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `600 24px ${UI}`;
  ctx.fillStyle = slate;
  ctx.fillText("Reverse-trivia bingo, played in one room.", PAD, H - footerH / 2);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas produced no image"))),
      "image/png",
    );
  });
}

export type ShareOutcome = "shared" | "downloaded" | "cancelled";

/**
 * `navigator.share()` on mobile, download everywhere else (docs/01). A user
 * dismissing the share sheet throws AbortError — that is a cancellation, not a
 * failure, and must not fall through to a surprise download.
 */
export async function shareBoard(input: ShareBoardInput): Promise<ShareOutcome> {
  const blob = await renderBoardPng(input);
  const filename = `yawbg-${input.roomCode}-${input.playerName}.png`.replace(/\s+/g, "-");
  const file = new File([blob], filename, { type: "image/png" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `${input.playerName}'s YAWBG board` });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // Anything else (a share target that refuses the file, a policy block) is
      // recoverable: fall through to the download path rather than dead-ending.
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return "downloaded";
}
