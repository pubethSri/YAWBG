import type { ReelCard } from "@yawbg/protocol";

/**
 * The crowd favourite, or `null` when there isn't one.
 *
 * A card is crowned only when it has at least one cheer **and** is a strict
 * maximum across the whole reel. A three-way tie at one cheer is noise rather
 * than a verdict, and the app does not get to invent one (docs/10 decision 3).
 *
 * The reel arrives sorted by cheers descending, so this is a look at the first
 * two cards — but it lives here, shared, rather than in each surface: the phone
 * and the display must crown the same card, and that is the same reasoning that
 * put the *ordering* on the server. Two implementations agreeing by luck is
 * exactly the failure mode being avoided.
 */
export function crownedProposalId(reel: ReelCard[]): string | null {
  const top = reel[0];
  if (!top || top.cheers < 1) return null;
  if (reel[1] && reel[1].cheers === top.cheers) return null;
  return top.proposalId;
}
