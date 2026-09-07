import { explained, type Explained } from './explain';
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
 */
export function guidanceForLeague(
  rankings: ExpertRankingSet,
  config: LeagueConfig,
): string[] {
  const superflex = config.lineup.QB >= 2 || config.lineup.SUPERFLEX > 0;
  return rankings.guidance.filter((line) => {
    const isSuperflexNote = /superflex|two-qb|2-qb/i.test(line);
    const isSingleQbNote = /single-qb|one-qb/i.test(line);
    if (isSuperflexNote && !superflex) return false;
    if (isSingleQbNote && superflex) return false;
    return true;
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
