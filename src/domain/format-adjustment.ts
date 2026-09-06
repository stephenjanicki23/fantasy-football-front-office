import { explained, type Explained } from './explain';
import { round2, scoreStatLine } from './scoring';
import type { LeagueConfig, Player, Projection, ScoringRules } from './types';
import type { ExpertRankedPlayer } from './expert-rankings';

/**
 * Reading a ranking built for one scoring system in a league that uses another.
 *
 * A full-PPR running back list read into a 0.5-PPR league systematically overrates
 * pass-catching backs: a 70-catch back loses 35 points relative to full PPR while a
 * 20-catch back loses 10, so their ordering relative to each other changes even though
 * neither player has changed.
 *
 * The size of that error is computable, so it is computed rather than corrected by hand.
 * The same projected stat lines are scored under both rule sets and the ranked cohort is
 * ordered under each; the difference in position isolates the scoring effect. The
 * ranker's own ranks are left exactly as published — his opinion is not being edited,
 * only translated.
 */

export interface FormatShift {
  playerId: string;
  name: string;
  /** Points under the scoring the ranking was built for. */
  sourcePoints: number;
  /** Points under this league's scoring. */
  leaguePoints: number;
  /** Position among the ranked cohort under source scoring. */
  sourceOrder: number;
  /** Position among the ranked cohort under this league's scoring. */
  leagueOrder: number;
  /** Positive = this league's scoring moves him UP relative to the others ranked. */
  shift: number;
  receptions: number | null;
  explain: Explained<number>;
}

export interface FormatAdjustment {
  /** Empty when the ranking set was built for this league's scoring already. */
  shifts: Map<string, FormatShift>;
  /** True when source and league scoring differ in a way that moves players. */
  applies: boolean;
  summary: string;
  /** Ranked players with no projection, so no shift could be computed. */
  unprojected: string[];
}

/**
 * Which rules actually change the ordering.
 *
 * Only per-event rules matter: a rule that scales everyone identically shifts every
 * total by the same factor and cannot reorder anybody.
 */
export function scoringDiffers(
  source: Partial<ScoringRules>,
  league: ScoringRules,
): boolean {
  return (Object.keys(source) as Array<keyof ScoringRules>).some(
    (key) => source[key] !== undefined && source[key] !== league[key],
  );
}

export function computeFormatAdjustment(
  config: LeagueConfig,
  rankedPlayers: ExpertRankedPlayer[],
  matchedIds: Map<string, ExpertRankedPlayer>,
  players: Player[],
  projections: Projection[],
  sourceScoring: Partial<ScoringRules> | undefined,
): FormatAdjustment {
  if (!sourceScoring || !scoringDiffers(sourceScoring, config.scoring)) {
    return {
      shifts: new Map(),
      applies: false,
      summary: 'These rankings were built for this league’s scoring, so no translation is needed.',
      unprojected: [],
    };
  }

  const sourceRules: ScoringRules = { ...config.scoring, ...sourceScoring };
  const seasonProjection = new Map<string, Projection>();
  for (const projection of projections) {
    if (projection.week === undefined) seasonProjection.set(projection.playerId, projection);
  }
  const playerById = new Map(players.map((player) => [player.id, player]));

  interface Scored {
    playerId: string;
    name: string;
    sourcePoints: number;
    leaguePoints: number;
    receptions: number | null;
  }

  const scored: Scored[] = [];
  const unprojected: string[] = [];

  for (const [playerId, ranking] of matchedIds) {
    const projection = seasonProjection.get(playerId);
    if (!projection) {
      unprojected.push(ranking.name);
      continue;
    }
    scored.push({
      playerId,
      name: playerById.get(playerId)?.name ?? ranking.name,
      sourcePoints: scoreStatLine(projection.stats, sourceRules),
      leaguePoints: scoreStatLine(projection.stats, config.scoring),
      receptions: projection.stats.receptions ?? null,
    });
  }

  // Rank the same cohort under each rule set; the difference is the format effect alone.
  const sourceOrder = new Map(
    [...scored]
      .sort((a, b) => b.sourcePoints - a.sourcePoints)
      .map((entry, index) => [entry.playerId, index + 1] as const),
  );
  const leagueOrder = new Map(
    [...scored]
      .sort((a, b) => b.leaguePoints - a.leaguePoints)
      .map((entry, index) => [entry.playerId, index + 1] as const),
  );

  const shifts = new Map<string, FormatShift>();
  for (const entry of scored) {
    const from = sourceOrder.get(entry.playerId)!;
    const to = leagueOrder.get(entry.playerId)!;
    const shift = from - to;

    shifts.set(entry.playerId, {
      playerId: entry.playerId,
      name: entry.name,
      sourcePoints: round2(entry.sourcePoints),
      leaguePoints: round2(entry.leaguePoints),
      sourceOrder: from,
      leagueOrder: to,
      shift,
      receptions: entry.receptions,
      explain: explained(
        shift,
        {
          sourcePoints: round2(entry.sourcePoints),
          leaguePoints: round2(entry.leaguePoints),
          pointsLost: round2(entry.sourcePoints - entry.leaguePoints),
          receptions: entry.receptions ?? -1,
          sourceOrder: from,
          leagueOrder: to,
          shift,
        },
        `Same projection scored both ways: ${round2(entry.sourcePoints)} pts under the ranking’s scoring, ` +
          `${round2(entry.leaguePoints)} under this league’s` +
          `${entry.receptions !== null ? ` (${entry.receptions} projected receptions)` : ''}. ` +
          `Among the ranked players that moves him from ${from} to ${to}` +
          `${shift === 0 ? ' — no change' : shift > 0 ? `, i.e. ${shift} spot${shift === 1 ? '' : 's'} better here` : `, i.e. ${-shift} spot${shift === -1 ? '' : 's'} worse here`}.`,
        ['projections', 'league-config', 'expert-rankings'],
      ),
    });
  }

  const moved = [...shifts.values()].filter((entry) => entry.shift !== 0);
  const biggestFallers = [...shifts.values()].sort((a, b) => a.shift - b.shift).slice(0, 3);
  const biggestRisers = [...shifts.values()].sort((a, b) => b.shift - a.shift).slice(0, 3);

  return {
    shifts,
    applies: true,
    summary:
      `These rankings were built for different scoring. Re-scoring the same projections under this league moves ` +
      `${moved.length} of ${shifts.size} ranked players. Most overrated here: ` +
      `${biggestFallers.map((entry) => `${entry.name} (${entry.shift})`).join(', ')}. Most underrated here: ` +
      `${biggestRisers.map((entry) => `${entry.name} (+${entry.shift})`).join(', ')}.`,
    unprojected,
  };
}
