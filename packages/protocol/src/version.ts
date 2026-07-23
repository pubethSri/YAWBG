// Bumped to 3 for M4: the results.advance and game.playAgain intents. The
// `results` payload itself was already complete at v2 — only the intent union
// grew, and a v2 client that cannot send results.advance would sit on a reveal
// nobody can pace.
// The gate exists to kill stale tabs after a deploy — an M1 client cannot play
// an M2 game.
export const PROTOCOL_VERSION = 3;
