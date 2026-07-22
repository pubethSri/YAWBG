import { z } from "zod";
import { TopicSchema } from "./state";

// Shape of decks/*.json on disk, and of the deck editor's API (M5). Decks are
// seeded by the `id` inside the file, never by filename.
export const DeckFileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  language: z.string().default("en"),
  description: z.string().default(""),
  topics: z.array(TopicSchema).min(1),
});
export type DeckFile = z.infer<typeof DeckFileSchema>;

// GET /api/decks — the lobby picker never needs the topic bodies.
export const DeckSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  language: z.string(),
  description: z.string(),
  topicCount: z.number().int(),
});
export type DeckSummary = z.infer<typeof DeckSummarySchema>;

export const DeckListSchema = z.array(DeckSummarySchema);
export type DeckList = z.infer<typeof DeckListSchema>;
