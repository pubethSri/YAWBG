// Bumped to 4 for M5.5 — the highlight reel and cheers (docs/10). One bump for
// both build slices: `round.cheer` ships in the schema during slice 1 and is
// rejected by `Room` until slice 2, because bumping 3 → 4 → 5 would cost two
// client-compat breaks for one feature.
// v4 changes: `Proposal` gains `id`, `RoundState` gains `proposals[]`,
// `PrivateBoard` gains `cheeredProposalIds`, `ResultsPayload` gains `reel[]`
// and a fourth `revealStage`, plus the `round.cheer` intent.
// The gate exists to kill stale tabs after a deploy — an M1 client cannot play
// an M2 game.
// Bumped to 5 the same day: the reel's card became one *name* rather than one
// round (docs/10 decision 3, reversed after seeing a full table's card), so
// `ReelCard` absorbed `ReelEntry` and `ReelEntry` is gone. A second bump was
// affordable only because nothing is deployed yet — M6 is the first public
// build, so there are no live clients for a version break to strand. Once M6
// ships, weigh a bump the way v4's note does.
export const PROTOCOL_VERSION = 5;
