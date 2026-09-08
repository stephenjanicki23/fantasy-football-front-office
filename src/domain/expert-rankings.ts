import { explained, type Explained } from './explain';
import { round2 } from './scoring';
import type { LeagueConfig, Player, Position, ScoringRules } from './types';
import type { ValuedPlayer } from './valuation';

/**
 * Expert tier rankings.
 *
 * A ranker's tiers are a different kind of evidence from a projection: they encode a
 * human read of where the real cliffs are, which players are being mispriced, and how a
 * position behaves in a given format. They are opinion, and they are treated as such —
 * attributed, dated, kept apart from projections, and never silently overriding the
 * league-derived maths.
 *
 * Rankings are matched to the player pool by name. Anything that fails to match is
 * reported rather than dropped, because a silently unmatched ranking is worse than none:
 * it looks like the ranker had no view on a player he in fact ranked.
 */

export type Designation = 'TARGET' | 'FADE';

export interface ExpertRankedPlayer {
  name: string;
  position: Position;
  /** Rank within the position, 1-indexed. */
  rank: number;
  tier: number;
  /** Sub-tier where the ranker used 1a/1b style mini-breaks. */
  subTier?: string;
  designation?: Designation;
  /**
   * Whether the ranker labelled this player individually, or whether the label was read
   * off a statement covering a range ("Fades on the expensive floor plays through to X").
   * Inferred labels are shown as such rather than presented as his explicit call.
   */
  designationBasis?: 'stated' | 'inferred';
  /** Short paraphrase of the ranker's reasoning. */
  note?: string;
}

export interface ExpertTierGroup {
  position: Position;
  tier: number;
  players: ExpertRankedPlayer[];
  /** The ranker's "Big Tier Break" — a genuine cliff, not just a tier boundary. */
  bigTierBreakAfter: boolean;
}

export interface ExpertRankingSet {
  /** Who produced these. Always displayed alongside the numbers. */
  source: string;
  sourceUrl?: string;
  season: number;
  asOf: string;
  /** Scoring assumptions the ranker was working under, in prose. */
  scoringNote?: string;
  /**
   * The scoring the rankings were actually built for, as rules.
   *
   * Needed to compare like with like: a full-PPR ranking read into a half-PPR league
   * systematically overrates pass-catching backs, and the size of that error is
   * computable from projections rather than guessed at.
   */
  sourceScoring?: Partial<ScoringRules>;
  /**
   * Ranks after which the ranker marks a "Big Tier Break" — a genuine cliff rather than
   * an ordinary tier boundary. Distinct from tiers because he uses both, and the cliffs
   * are the ones that should change a draft decision.
   */
  bigTierBreakAfterRanks?: number[];
  /** Format-specific strategy notes, e.g. how to play the position in superflex. */
  guidance: string[];
  players: ExpertRankedPlayer[];
}

export interface MatchedRanking {
  playerId: string;
  ranking: ExpertRankedPlayer;
}

export interface RankingMatchResult {
  byPlayerId: Map<string, ExpertRankedPlayer>;
  /** Ranked players we could not find in the pool — shown, never hidden. */
  unmatched: ExpertRankedPlayer[];
  matchedCount: number;
  explain: Explained<number>;
}

/**
 * Match a ranking set onto the player pool by name.
 *
 * Normalisation strips case, punctuation and suffixes so "C.J. Stroud" matches
 * "CJ Stroud" and "Michael Penix Jr." matches "Michael Penix". Position must agree, so a
 * name collision across positions cannot silently mis-assign a tier.
 */
export function matchExpertRankings(
  players: Player[],
  rankings: ExpertRankingSet,
): RankingMatchResult {
  const byNameAndPosition = new Map<string, Player>();
  for (const player of players) {
    byNameAndPosition.set(`${normaliseName(player.name)}|${player.position}`, player);
  }

  const byPlayerId = new Map<string, ExpertRankedPlayer>();
  const unmatched: ExpertRankedPlayer[] = [];

  for (const ranking of rankings.players) {
    const match = byNameAndPosition.get(`${normaliseName(ranking.name)}|${ranking.position}`);
    if (match) byPlayerId.set(match.id, ranking);
    else unmatched.push(ranking);
  }

  return {
    byPlayerId,
    unmatched,
    matchedCount: byPlayerId.size,
    explain: explained(
      byPlayerId.size,
      {
        rankedPlayers: rankings.players.length,
        matched: byPlayerId.size,
        unmatched: unmatched.length,
        poolSize: players.length,
        source: rankings.source,
      },
      `Matched ${byPlayerId.size} of ${rankings.players.length} ranked players by name and position against a pool of ${players.length}` +
        `${unmatched.length > 0 ? `; ${unmatched.length} unmatched: ${unmatched.slice(0, 6).map((r) => r.name).join(', ')}${unmatched.length > 6 ? '…' : ''}` : ''}`,
      [`expert-rankings:${rankings.source}`],
    ),
  };
}

/** Group a ranking set into tiers for display. */
export function tierGroups(rankings: ExpertRankingSet, position: Position): ExpertTierGroup[] {
  const inPosition = rankings.players
    .filter((player) => player.position === position)
    .sort((a, b) => a.rank - b.rank);

  const byTier = new Map<number, ExpertRankedPlayer[]>();
  for (const player of inPosition) {
    byTier.set(player.tier, [...(byTier.get(player.tier) ?? []), player]);
  }

  return [...byTier.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tier, group]) => ({
      position,
      tier,
      players: group,
      bigTierBreakAfter: (rankings.bigTierBreakAfterRanks ?? []).some(
        (rank) => rank === Math.max(...group.map((player) => player.rank)),
      ),
    }));
}

/**
 * How far this league's own valuation disagrees with the ranker.
 *
 * Positive means our maths likes the player more than the ranker does. This is
 * deliberately surfaced rather than blended away: where a projection-driven model and a
 * human who watches the tape disagree is exactly where a manager should look, and it is
 * not the app's place to decide which is right.
 */
export function rankingDisagreement(
  valued: ValuedPlayer,
  ranking: ExpertRankedPlayer,
): number {
  return ranking.rank - valued.positionRank;
}

/**
 * Positional guidance drawn from the ranking set, filtered to this league's format.
 *
 * A ranker's superflex advice is noise in a one-QB league and vice versa, so guidance is
 * tagged by the format it applies to and only shown where it is relevant.
 *
 * Which format a line *addresses* is not the same as which formats it *mentions*. Several
 * of his superflex instructions name the one-QB league only as the thing being contrasted
 * against — "in superflex, wait longer on TE than you would in a one-QB league" is advice
 * for this league, not for that one. So a line claimed by both is resolved in favour of
 * the format it opens by naming, and only a line that names one format is treated as
 * belonging solely to it.
 */
export function guidanceForLeague(
  rankings: ExpertRankingSet,
  config: LeagueConfig,
): string[] {
  const superflex = config.lineup.QB >= 2 || config.lineup.SUPERFLEX > 0;
  const superflexPattern = /superflex|two-qb|2-qb/i;
  const singleQbPattern = /single-qb|one-qb/i;

  return rankings.guidance.filter((line) => {
    const superflexAt = line.search(superflexPattern);
    const singleQbAt = line.search(singleQbPattern);
    if (superflexAt < 0 && singleQbAt < 0) return true;

    // Whichever format the line names first is the one it is addressed to.
    const addressesSuperflex =
      superflexAt >= 0 && (singleQbAt < 0 || superflexAt < singleQbAt);
    return addressesSuperflex === superflex;
  });
}

export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Is there a genuine cliff immediately after this player? */
export function isBigTierBreakAfter(
  rankings: ExpertRankingSet,
  ranking: ExpertRankedPlayer,
): boolean {
  return (rankings.bigTierBreakAfterRanks ?? []).includes(ranking.rank);
}

export const TIER_STEP = 12;
export const BIG_TIER_BREAK_PENALTY = 10;

/**
 * A 0-100 board value for a ranked player, built only from the ranker's own structure.
 *
 * This exists because his lists are *positional* — QB1..36, RB1..91 and so on — and he
 * publishes no overall board. Something has to decide whether his RB6 or his WR9 is the
 * better pick, and the only non-fabricated way to do it is to use the structure he did
 * publish: the tier number, and the Big Tier Breaks he places to mark a genuine cliff as
 * opposed to an ordinary tier boundary.
 *
 * So tier is treated as the cross-positional unit, a Big Tier Break costs an extra drop
 * on top of the tier step, and rank orders players inside a tier. That is an app decision
 * and is labelled as one wherever it is shown — he did not rank his RB6 against his WR9,
 * and this must never be presented as though he had.
 */
export function expertBoardValue(
  rankings: ExpertRankingSet,
  ranking: ExpertRankedPlayer,
): Explained<number> {
  const samePosition = rankings.players
    .filter((entry) => entry.position === ranking.position)
    .sort((a, b) => a.rank - b.rank);

  const inTier = samePosition.filter((entry) => entry.tier === ranking.tier);
  const indexInTier = Math.max(0, inTier.findIndex((entry) => entry.rank === ranking.rank));
  const breaksAbove = (rankings.bigTierBreakAfterRanks ?? []).filter(
    (rank) => rank < ranking.rank,
  ).length;

  const tierDrop = (ranking.tier - 1) * TIER_STEP;
  const breakDrop = breaksAbove * BIG_TIER_BREAK_PENALTY;
  // Spread players across half a tier step so rank orders within a tier without ever
  // letting a late tier-2 player overtake an early tier-3 one.
  const withinTierDrop =
    inTier.length > 1 ? (indexInTier / (inTier.length - 1)) * (TIER_STEP / 2) : 0;

  const score = round2(Math.max(0, Math.min(100, 100 - tierDrop - breakDrop - withinTierDrop)));

  return explained(
    score,
    {
      tier: ranking.tier,
      rank: ranking.rank,
      indexInTier,
      tierSize: inTier.length,
      bigTierBreaksAbove: breaksAbove,
      tierDrop,
      breakDrop,
      withinTierDrop: round2(withinTierDrop),
    },
    `${ranking.position}${ranking.rank}, his tier ${ranking.tier}: 100 − ${tierDrop} (tier) ` +
      `− ${breakDrop} (${breaksAbove} Big Tier Break${breaksAbove === 1 ? '' : 's'} above him) ` +
      `− ${round2(withinTierDrop)} (${indexInTier + 1} of ${inTier.length} in the tier) = ${score}. ` +
      `His lists are positional, so comparing him across positions is this app applying his ` +
      `tier structure, not a ranking he published.`,
    [`expert-rankings:${rankings.source}`],
  );
}

/** How far past his own ranking a player has to slip before that counts as a full discount. */
export const SLIP_ROUNDS_FOR_FULL_DISCOUNT = 2;

export interface ExpertUpside {
  score: number;
  /** His tier, normalised across the position's tiers. 1 is his top tier. */
  ceiling: number;
  /** How far he has lasted past his own rank on the live board, 0-1. */
  discount: number;
  /** Ranked players at this position already off the board. */
  goneAtPosition: number;
  explain: Explained<number>;
}

/**
 * Upside from the ranker's own data and the live board — no projections, no ADP.
 *
 * Q4 of his framework is about ceiling at the price you are paying, and it is the quarter
 * where upside carries the most weight. Computing it from projected points made the late
 * rounds turn on exactly the numbers this league does not draft on, and there is no ADP
 * source wired up to supply the price half.
 *
 * Both halves are available from what he published plus what has actually been drafted:
 *
 *  - Ceiling is his tier, normalised. Tier rather than rank on purpose: inside a tier he
 *    is saying these players are close to equivalent, so ceiling should not discriminate
 *    between them — that is what the value term's rank ordering is for.
 *  - Discount is how far the player has lasted past his own rank. If 45 backs are gone and
 *    his RB30 is still there, sixteen better-ranked backs went before him and he is going
 *    cheap; the board supplies the price signal that ADP would have.
 */
export function expertUpsideFor(
  rankings: ExpertRankingSet,
  ranking: ExpertRankedPlayer,
  goneAtPosition: number,
  teamCount: number,
): ExpertUpside {
  const samePosition = rankings.players.filter((entry) => entry.position === ranking.position);
  const maxTier = Math.max(...samePosition.map((entry) => entry.tier), 1);
  const ceiling = maxTier > 1 ? (maxTier - ranking.tier) / (maxTier - 1) : 1;

  const slip = goneAtPosition - (ranking.rank - 1);
  const slipScale = Math.max(1, teamCount * SLIP_ROUNDS_FOR_FULL_DISCOUNT);
  const discount = Math.max(0, Math.min(1, slip / slipScale));

  const score = round2(100 * (0.5 * ceiling + 0.5 * discount));

  return {
    score,
    ceiling: round2(ceiling),
    discount: round2(discount),
    goneAtPosition,
    explain: explained(
      score,
      {
        tier: ranking.tier,
        maxTier,
        ceiling: round2(ceiling),
        rank: ranking.rank,
        goneAtPosition,
        slip,
        slipScale,
        discount: round2(discount),
      },
      `Ceiling ${round2(ceiling)} (his tier ${ranking.tier} of ${maxTier} at ${ranking.position}) ` +
        `and discount ${round2(discount)} (${goneAtPosition} ranked ${ranking.position}s gone, he is ` +
        `${ranking.position}${ranking.rank}, so he has slipped ${slip} past his own rank against a ` +
        `${slipScale}-pick scale) → ${score}. Built from his rankings and the live board; no ` +
        `projections and no ADP are involved.`,
      [`expert-rankings:${rankings.source}`, 'draft-board'],
    ),
  };
}
