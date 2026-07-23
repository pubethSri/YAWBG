import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Per docs/02, SQLite holds persistent things only (decks, admin users, game
// logs) — live game state stays memory-only and a restart dropping in-progress
// games is an accepted trade-off. Decks came first; `games` is M4.
export function openDb(path: string): Database {
  // SQLite creates the file but not its directory, and DB_PATH points at a
  // mounted volume in production. Skip the bare-filename case: dirname() gives
  // "." there, and mkdir(".") throws EEXIST on Windows even with recursive.
  if (path !== ":memory:") {
    const dir = dirname(path);
    if (dir && dir !== "." && dir !== path) mkdirSync(dir, { recursive: true });
  }
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS decks (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      language    TEXT NOT NULL,
      description TEXT NOT NULL
    );
    -- Composite PK: topic ids (gen-001) are only unique within their deck.
    CREATE TABLE IF NOT EXISTS topics (
      id      TEXT NOT NULL,
      deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      text    TEXT NOT NULL,
      PRIMARY KEY (id, deck_id)
    );
    -- Finished games (M4). Written once, at endGame, and never read back by the
    -- game engine: this is a record, not state. No FK to decks — a deck may be
    -- edited or deleted long after a game that used it, and the settings blob
    -- already carries the deckIds as they were.
    CREATE TABLE IF NOT EXISTS games (
      id        TEXT PRIMARY KEY,
      code      TEXT NOT NULL,
      ended_at  INTEGER NOT NULL,
      settings  TEXT NOT NULL,  -- JSON Settings
      players   TEXT NOT NULL,  -- JSON [{id,name,linesCompleted,won}]
      results   TEXT NOT NULL   -- JSON ResultsPayload, unredacted
    );
    CREATE INDEX IF NOT EXISTS games_ended_at ON games (ended_at DESC);
  `);
  return db;
}
