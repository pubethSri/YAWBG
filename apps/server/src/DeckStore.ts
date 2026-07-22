import { Glob } from "bun";
import type { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DeckFileSchema, type DeckSummary, type Topic } from "@yawbg/protocol";

// The seam Room depends on, so the game engine never touches SQLite and tests
// can inject a fake deck without a database.
export interface TopicSource {
  /** Merged topics for the selected decks, in deck order. */
  topicsFor(deckIds: string[]): Topic[];
  has(deckId: string): boolean;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null; // unreadable or not JSON — DeckFileSchema rejects it below
  }
}

export class DeckStore implements TopicSource {
  constructor(private db: Database) {}

  /**
   * Idempotent boot seed. Decks are keyed by the `id` inside the file, never by
   * filename, so decks/general.json seeds the `general` that
   * defaultSettings().deckIds already points at. A malformed file is skipped
   * with a warning rather than taking the server down.
   */
  seedFromDir(dir: string): void {
    for (const file of new Glob("*.json").scanSync(dir)) {
      if (file.endsWith(".example.json")) continue; // schema reference, not content
      const parsed = DeckFileSchema.safeParse(readJson(join(dir, file)));
      if (!parsed.success) {
        console.warn(`skipping deck ${file}: ${parsed.error.issues[0]?.message}`);
        continue;
      }
      this.upsert(parsed.data);
    }
  }

  private upsert(deck: { id: string; name: string; language: string; description: string; topics: Topic[] }): void {
    const tx = this.db.transaction(() => {
      this.db
        .query(
          `INSERT INTO decks (id, name, language, description) VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name,
             language = excluded.language, description = excluded.description`,
        )
        .run(deck.id, deck.name, deck.language, deck.description);
      // Drop topics that vanished from the file, then upsert the rest.
      this.db.query(`DELETE FROM topics WHERE deck_id = ?`).run(deck.id);
      const insert = this.db.query(`INSERT INTO topics (id, deck_id, text) VALUES (?, ?, ?)`);
      for (const topic of deck.topics) insert.run(topic.id, deck.id, topic.text);
    });
    tx();
  }

  list(): DeckSummary[] {
    return this.db
      .query(
        `SELECT d.id, d.name, d.language, d.description,
                (SELECT COUNT(*) FROM topics t WHERE t.deck_id = d.id) AS topicCount
         FROM decks d ORDER BY d.id`,
      )
      .all() as DeckSummary[];
  }

  topicsFor(deckIds: string[]): Topic[] {
    const out: Topic[] = [];
    const query = this.db.query(`SELECT id, text FROM topics WHERE deck_id = ? ORDER BY id`);
    for (const deckId of deckIds) out.push(...(query.all(deckId) as Topic[]));
    return out;
  }

  has(deckId: string): boolean {
    // `!= null` on purpose: a missing row is null or undefined depending on the
    // driver version, and `!== null` alone would report every deck as present.
    return this.db.query(`SELECT 1 FROM decks WHERE id = ?`).get(deckId) != null;
  }
}
