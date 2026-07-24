// Bumped to 4 for M5.5 — the highlight reel and cheers (docs/10). One bump for
// both build slices: `round.cheer` ships in the schema during slice 1 and is
// rejected by `Room` until slice 2, because bumping 3 → 4 → 5 would cost two
// client-compat breaks for one feature.
// v4 changes: `Proposal` gains `id`, `RoundState` gains `proposals[]`,
// `PrivateBoard` gains `cheeredProposalIds`, `ResultsPayload` gains `reel[]`
// and a fourth `revealStage`, plus the `round.cheer` intent.
// The gate exists to kill stale tabs after a deploy — an M1 client cannot play
// an M2 game.
export const PROTOCOL_VERSION = 4;
