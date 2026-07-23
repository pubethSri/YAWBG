import type { Database } from "bun:sqlite";
import type { ResultsPayload, Settings } from "@yawbg/protocol";

/**
 * What a finished game leaves behind. Not a wire type — nothing here is ever
 * broadcast, so it is free to live outside `packages/protocol` (it reuses two
 * protocol types by value; the log is a snapshot *of* the wire shapes, not a
 * new one).
 */
export interface GameLogEntry {
  code: string;
  endedAt: number; // epoch ms
  settings: Settings;
  players: { id: string; name: string; linesCompleted: number; won: boolean }[];
  /** The unredacted payload, including pool authorship. */
  results: ResultsPayload;
}

/**
 * The seam `Room` depends on, mirroring `TopicSource`: the game engine never
 * touches SQLite, and a room built without a sink simply doesn't log. That
 * keeps the test path (fake decks, no database) honest — see the M4 landmine in
 * the handoff about not making the log a hard dependency of `Room`.
 */
export interface GameLogSink {
  record(entry: GameLogEntry): void;
}

/**
 * The second concern to enter the decks database. Deliberately one flat row
 * with JSON columns rather than a normalized players/cells/rounds schema: the
 * only consumers planned are an admin browser (M7) and a possible replay page
 * (deferred), both of which want the whole game at once. Normalizing now would
 * be schema work in service of no query.
 */
export class GameLogStore implements GameLogSink {
  constructor(private db: Database) {}

  record(entry: GameLogEntry): void {
    this.db
      .query(
        `INSERT INTO games (id, code, ended_at, settings, players, results)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        entry.code,
        entry.endedAt,
        JSON.stringify(entry.settings),
        JSON.stringify(entry.players),
        JSON.stringify(entry.results),
      );
  }

  /** Newest first. No HTTP route yet — M7 owns the admin browser. */
  count(): number {
    const row = this.db.query(`SELECT COUNT(*) AS n FROM games`).get() as { n: number };
    return row.n;
  }
}
