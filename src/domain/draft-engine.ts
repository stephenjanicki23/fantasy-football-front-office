import { explained, type Explained } from './explain';
import { isTwoQbLeague, picksForSlot, picksUntilNextTurn, pickCoordinates } from './league-config';
import { marginalLineupGain, optimalLineup } from './lineup';
import {
  predictNextPick,
  survivalProbability,
  teamOnClock,
  teamsBetweenPicks,
  type NextPickPrediction,
} from './opponent-model';
import { analyzeQbScarcity, computeScarcity, type PositionScarcity, type QbScarcityReport } from './scarcity';
import { round2 } from './scoring';
import { detectSqueezes, type SqueezeAlert } from './squeeze';
import { buildTiers, tierCliff, tierRemaining, type Tier } from './tiers';
import { computeTeamNeeds, type TeamNeedsReport } from './team-needs';
import {
  dryingUpPositions,
  quarterBoundaries,
  quarterForRound,
  strategyStatus,
  positionSignificances,
  tierWindowObjective,
  upsideFor,
  weightsForQuarter,
  type QuarterBoundaries,
  type StrategyStatus,
  type TierWindowObjective,
  type UpsideScore,
} from './draft-strategy';
import {
  guidanceForLeague,
  matchExpertRankings,
  rankingDisagreement,
  type ExpertRankedPlayer,
} from './expert-rankings';
import type { FantasyTeam, LeagueConfig, LeagueState, Position } from './types';
import { indexByPlayer, valuePlayers, type ValuedPlayer } from './valuation';

/**
 * The draft brain.
 *
 * The output is deliberately NOT "the highest-ranked player available". The Dynamic Draft
 * Value Score combines what a player is worth in this league, how scarce his position is,
 * how much he improves *your* lineup specifically, how likely he is to be gone before you
 * pick again, and how badly the teams picking in between want his position.
 */

/**
 * Component weights for the Dynamic Draft Value Score.
 *
 * Early rounds reward raw value (talent gaps are large and the board is unpredictable);
 * later rounds reward scarcity, roster fit and squeeze risk (talent gaps are small, so
 * *where* a player fits and whether he survives matter more than a point of projection).
 */
export interface DraftWeights {
  value: number;
  scarcity: number;
  rosterFit: number;
  urgency: number; // 1 - expected availability
  opponentDemand: number;
}

/**
 * The tier by which the supplied ranker says a superflex manager should hold both QBs.
 * Named rather than inline so it moves with the ranking set instead of being buried.
 */
export const EXPERT_QB_TIER_DEADLINE = 3;

export function weightsForRound(config: LeagueConfig, round: number): DraftWeights {
  const progress = clamp(round / Math.max(1, config.draftRounds), 0, 1);
  return {
    value: lerp(0.5, 0.28, progress),
    scarcity: lerp(0.18, 0.24, progress),
    rosterFit: lerp(0.14, 0.28, progress),
    urgency: lerp(0.12, 0.14, progress),
    opponentDemand: lerp(0.06, 0.06, progress),
  };
}

export interface DraftCandidate {
  player: ValuedPlayer;
  /** 0-100 composite. */
  draftScore: number;
  /** 0-100 league-adjusted value. */
  value: number;
  /** 0-100 how much this player improves your starting lineup. */
  rosterFit: number;
  /** 0-100 positional scarcity. */
  scarcity: number;
  /** 0-1 probability the player is available at your next pick. */
  expectedAvailability: number;
  /** 0-100 how much the teams picking before you want this position. */
  opponentDemand: number;
  tier?: number;
  tierRemaining: number;
  tierCliff: number;
  marginalStarterGain: number;
  /** How close to elite production, and how far the market is discounting him. */
  upside: UpsideScore;
  /** A ranker's view, where one has been supplied. Opinion, kept separate from the maths. */
  expert: {
    tier: number;
    rank: number;
    designation: 'TARGET' | 'FADE' | null;
    note: string | null;
    /** Positive when this league's valuation likes him more than the ranker does. */
    disagreement: number;
  } | null;
  explain: Explained<number>;
}

export interface DraftRecommendation {
  onTheClock: boolean;
  overall: number;
  round: number;
  pickInRound: number;
  picksUntilNextTurn: number | null;
  nextPickOverall: number | null;
  candidates: DraftCandidate[];
  bestPick: DraftCandidate | null;
  safeAlternative: DraftCandidate | null;
  bestValue: DraftCandidate | null;
  qbScarcity: QbScarcityReport;
  squeezes: SqueezeAlert[];
  scarcity: Map<Position, PositionScarcity>;
  tiers: Map<Position, Tier[]>;
  needs: Map<string, TeamNeedsReport>;
  predictions: NextPickPrediction[];
  myNeeds: TeamNeedsReport | null;
  /** Positions with no projection data — rendered as "Data unavailable". */
  playersMissingProjections: number;
  confidence: number;
  reasoning: string[];
  /** Where this pick sits in the draft-quarters framework. */
  quarters: QuarterBoundaries;
  strategy: StrategyStatus | null;
  /** Format-relevant guidance from the supplied ranking set. */
  expertGuidance: string[];
  /** Ranker's positional deadlines, e.g. two QBs by the end of tier 3. */
  tierObjectives: TierWindowObjective[];
  expertSource: string | null;
  /** Ranked players that could not be matched to the pool — reported, never hidden. */
  expertUnmatched: string[];
}

export interface DraftEngineOptions {
  /** How many candidates to return. */
  limit?: number;
  /** Override which team we are recommending for (defaults to `isMyTeam`). */
  teamId?: string;
}

export function recommendDraftPick(
  state: LeagueState,
  options: DraftEngineOptions = {},
): DraftRecommendation {
  const { config, teams, players, seasonProjections, injuries } = state;
  const limit = options.limit ?? 8;

  const myTeam =
    teams.find((t) => (options.teamId ? t.id === options.teamId : t.isMyTeam)) ?? teams[0];

  const draft = state.draft;
  const draftedIds = new Set(
    (draft?.picks ?? []).map((p) => p.playerId).filter((id): id is string => Boolean(id)),
  );
  const rosteredIds = new Set(teams.flatMap((t) => t.roster.map((r) => r.playerId)));
  const unavailable = new Set([...draftedIds, ...rosteredIds]);

  // Value the full pool once (for benchmarks) and the available pool separately (so
  // replacement level rises as the board drains).
  const fullValuation = valuePlayers(config, players, seasonProjections, { injuries });
  const availablePlayers = players.filter((p) => !unavailable.has(p.id));
  const availableValuation = valuePlayers(config, availablePlayers, seasonProjections, {
    injuries,
  });
  const available = availableValuation.players;
  const valuesById = indexByPlayer(fullValuation);

  const rosterPositions = new Map(players.map((p) => [p.id, p.position]));
  const tiers = buildTiers(available);
  const scarcity = computeScarcity(config, available, teams, rosterPositions);

  // Where are we in the draft?
  const overall = draft?.currentOverall ?? 1;
  const { round, pickInRound } = pickCoordinates(config, overall);
  const mySlot = myTeam?.draftSlot ?? config.myDraftSlot ?? 1;
  const myPicks = picksForSlot(config, mySlot);
  const onTheClock = teamOnClock(config, draft?.draftOrder ?? teams.map((t) => t.id), overall) === myTeam?.id;
  const nextPickOverall = myPicks.find((p) => p > overall) ?? null;
  const untilNext = picksUntilNextTurn(config, mySlot, overall);

  // Model every team that picks between now and my next turn.
  const needs = new Map<string, TeamNeedsReport>();
  for (const team of teams) {
    needs.set(
      team.id,
      computeTeamNeeds(config, team, valuesById, fullValuation.players),
    );
  }

  const intervening = nextPickOverall
    ? teamsBetweenPicks(config, draft?.draftOrder ?? teams.map((t) => t.id), overall, nextPickOverall)
    : [];

  const predictions: NextPickPrediction[] = [];
  for (const { teamId, overall: pickOverall } of intervening) {
    const team = teams.find((t) => t.id === teamId);
    const teamNeeds = needs.get(teamId);
    if (!team || !teamNeeds) continue;
    predictions.push(
      predictNextPick(config, team, teamNeeds, available, scarcity, pickOverall),
    );
  }

  const myNeeds = myTeam ? (needs.get(myTeam.id) ?? null) : null;
  const qbScarcity = analyzeQbScarcity(config, available, teams, rosterPositions, {
    picksUntilMyNextTurn: untilNext,
  });

  const squeezes = myNeeds
    ? detectSqueezes(config, predictions, tiers, available, myNeeds.needOrder.slice(0, 4))
    : [];

  // Score every available player, weighted for the phase of the draft we are in rather
  // than by a smooth ramp: the quarters do different jobs and reward different things.
  const quarters = quarterBoundaries(config, fullValuation.players);
  const quarter = quarterForRound(quarters, round);
  const weights = weightsForQuarter(quarter);

  const adpByPlayer = new Map(state.adp.map((entry) => [entry.playerId, entry]));
  // Full preseason pool per position — the upside model needs a stable elite reference,
  // not the shrinking available pool (see upsideFor).
  const poolByPosition = new Map<Position, ValuedPlayer[]>();
  for (const candidate of fullValuation.players) {
    const list = poolByPosition.get(candidate.player.position) ?? [];
    list.push(candidate);
    poolByPosition.set(candidate.player.position, list);
  }
  const significanceByPosition = positionSignificances(config, fullValuation.players);

  // Expert rankings are opinion: matched by name, reported when unmatched, and never
  // allowed to overwrite the league-derived valuation.
  const rankingMatch = state.expertRankings
    ? matchExpertRankings(players, state.expertRankings)
    : null;
  const maxMarginalGain = Math.max(
    1,
    ...available.slice(0, 60).map((p) =>
      myTeam ? marginalLineupGain(config, myTeam.roster, mergeValue(valuesById, p), p) : 0,
    ),
  );

  const candidates: DraftCandidate[] = available.slice(0, 80).map((player) => {
    const positionScarcity = scarcity.get(player.player.position);
    const scarcityScore = positionScarcity?.score ?? 0;

    const marginal = myTeam
      ? marginalLineupGain(config, myTeam.roster, mergeValue(valuesById, player), player)
      : 0;
    const rosterFit = round2(clamp((marginal / maxMarginalGain) * 100, 0, 100));

    const availability = untilNext === null
      ? 1
      : survivalProbability(player, predictions, available);

    const demand = round2(
      clamp(
        predictions.reduce(
          (sum, prediction) =>
            sum +
            (prediction.distribution.find((d) => d.position === player.player.position)
              ?.probability ?? 0),
          0,
        ) * (predictions.length > 0 ? 100 / predictions.length : 0) * 2,
        0,
        100,
      ),
    );

    const urgency = (1 - availability) * 100;

    const upside = upsideFor(
      player,
      poolByPosition.get(player.player.position) ?? [player],
      config,
      adpByPlayer,
      { positionSignificance: significanceByPosition.get(player.player.position) },
    );

    const draftScore = round2(
      weights.value * player.leagueValue +
        weights.scarcity * scarcityScore +
        weights.rosterFit * rosterFit +
        weights.urgency * urgency +
        weights.opponentDemand * demand +
        weights.upside * upside.score,
    );

    return {
      player,
      draftScore,
      value: player.leagueValue,
      rosterFit,
      scarcity: scarcityScore,
      expectedAvailability: availability,
      opponentDemand: demand,
      tier: player.tier,
      tierRemaining: tierRemaining(tiers, player),
      tierCliff: round2(tierCliff(tiers, player)),
      marginalStarterGain: marginal,
      upside,
      expert: expertFor(rankingMatch?.byPlayerId.get(player.player.id), player),
      explain: explained(
        draftScore,
        {
          leagueValue: player.leagueValue,
          scarcity: scarcityScore,
          rosterFit,
          expectedAvailability: availability,
          opponentDemand: demand,
          marginalStarterGain: marginal,
          upside: upside.score,
          round,
          quarter,
        },
        `Q${quarter} weights — draftScore = ${weights.value}×value(${player.leagueValue}) + ${weights.scarcity}×scarcity(${scarcityScore}) + ` +
          `${weights.rosterFit}×fit(${rosterFit}) + ${weights.urgency}×urgency(${round2(urgency)}) + ` +
          `${weights.opponentDemand}×demand(${demand}) + ${weights.upside}×upside(${upside.score}) = ${draftScore}`,
        ['projections', 'rosters', 'opponent-model', 'league-config'],
      ),
    };
  });

  candidates.sort((a, b) => b.draftScore - a.draftScore);
  const top = candidates.slice(0, limit);

  const bestPick = top[0] ?? null;
  // Safe alternative: high value, high availability is irrelevant — safety means low
  // downside, i.e. a healthy player near the top of his tier with strong raw value.
  const safeAlternative =
    top
      .slice(1)
      .filter((c) => c.player.availabilityFactor >= 0.95)
      .sort((a, b) => b.value - a.value)[0] ?? null;
  // Best value: highest value per unit of urgency — the guy you could get later but is
  // priced like a bargain right now.
  const bestValue =
    [...top].sort((a, b) => b.value * b.expectedAvailability - a.value * a.expectedAvailability)[0] ??
    null;

  // Where this pick sits in the framework, and what the phase is asking of us.
  const strategy = myTeam
    ? strategyStatus(config, quarters, round, {
        myRemainingPicks: myPicks.filter((pick) => pick >= overall),
        myRosterValues: myTeam.roster
          .map((entry) => valuesById.get(entry.playerId))
          .filter((v): v is ValuedPlayer => Boolean(v)),
        unfilledSlots: myNeeds?.unfilledSlots ?? [],
        dryingUpPositions: dryingUpPositions(config, available),
        board: fullValuation.players,
      })
    : null;

  /**
   * The ranker's positional deadlines.
   *
   * The most actionable thing a tiers piece gives is not a ranking but a deadline — in a
   * two-QB league, two QBs by the end of his tier 3. Tracked against the supply actually
   * left, since a window closes when rivals take the players.
   */
  const tierObjectives: TierWindowObjective[] = [];
  if (rankingMatch && myTeam) {
    const availableRankings: ExpertRankedPlayer[] = available
      .map((candidate) => rankingMatch.byPlayerId.get(candidate.player.id))
      .filter((r): r is ExpertRankedPlayer => Boolean(r));
    const myRankings: ExpertRankedPlayer[] = myTeam.roster
      .map((entry) => rankingMatch.byPlayerId.get(entry.playerId))
      .filter((r): r is ExpertRankedPlayer => Boolean(r));

    if (isTwoQbLeague(config)) {
      const teamsShort = teams.filter(
        (team) =>
          team.roster.filter((entry) => rosterPositions.get(entry.playerId) === 'QB').length <
          config.lineup.QB,
      ).length;
      tierObjectives.push(
        tierWindowObjective(config, 'QB', EXPERT_QB_TIER_DEADLINE, {
          availableRankings,
          myRankings,
          teamsStillNeeding: teamsShort,
          matchedAtPosition: [...rankingMatch.byPlayerId.values()].filter(
            (ranking) => ranking.position === 'QB',
          ).length,
        }),
      );
    }
  }

  const reasoning = buildReasoning(
    config,
    bestPick,
    myNeeds,
    qbScarcity,
    squeezes,
    untilNext,
    strategy,
  );

  return {
    onTheClock,
    overall,
    round,
    pickInRound,
    picksUntilNextTurn: untilNext,
    nextPickOverall,
    candidates: top,
    bestPick,
    safeAlternative,
    bestValue,
    qbScarcity,
    squeezes,
    scarcity,
    tiers,
    needs,
    predictions,
    myNeeds,
    playersMissingProjections: availableValuation.missingProjections.length,
    confidence: computeConfidence(candidates, availableValuation.missingProjections.length, players.length),
    reasoning,
    quarters,
    strategy,
    expertGuidance: state.expertRankings
      ? guidanceForLeague(state.expertRankings, config)
      : [],
    tierObjectives,
    expertSource: state.expertRankings?.source ?? null,
    expertUnmatched: rankingMatch?.unmatched.map((r) => r.name) ?? [],
  };
}

/**
 * Confidence in the recommendation.
 *
 * High when the top candidate clearly separates from the second, and when projection
 * coverage is good. Low when the top options are within noise of each other or when a
 * large share of the pool has no projections.
 */
export function computeConfidence(
  candidates: DraftCandidate[],
  missingProjections: number,
  poolSize: number,
): number {
  if (candidates.length === 0) return 0;
  const first = candidates[0]!.draftScore;
  const second = candidates[1]?.draftScore ?? first * 0.9;
  const separation = first > 0 ? clamp((first - second) / first, 0, 0.4) / 0.4 : 0;
  const coverage = poolSize > 0 ? 1 - clamp(missingProjections / poolSize, 0, 1) : 0;
  return round2(clamp(0.45 + 0.35 * separation + 0.2 * coverage, 0, 0.99));
}

function buildReasoning(
  config: LeagueConfig,
  best: DraftCandidate | null,
  myNeeds: TeamNeedsReport | null,
  qb: QbScarcityReport,
  squeezes: SqueezeAlert[],
  untilNext: number | null,
  strategy: StrategyStatus | null,
): string[] {
  if (!best) return ['No available players with projections — connect a projection source.'];

  const reasons: string[] = [];
  const position = best.player.player.position;

  // Lead with the phase: it explains why this pick is weighted the way it is.
  if (strategy) {
    reasons.push(`${strategy.plan.label} (Q${strategy.currentQuarter}): ${strategy.plan.objective}`);
    if (strategy.congestionWarning) reasons.push(strategy.congestionWarning);
    if (strategy.currentQuarter === 2 && best.upside.score >= 60) {
      reasons.push(
        `Q2 is the last window for league-winning production, and he scores ${Math.round(best.upside.score)}/100 on upside.`,
      );
    }
    if (strategy.currentQuarter === 4 && best.upside.score >= 50) {
      reasons.push(`Late-round ceiling swing — upside ${Math.round(best.upside.score)}/100.`);
    }
  }

  if (myNeeds && myNeeds.needOrder[0] === position) {
    reasons.push(
      `${position} is your weakest position (${Math.round((myNeeds.needByPosition[position] ?? 0) * 100)}% need).`,
    );
  }

  if (best.scarcity >= 60) {
    reasons.push(
      `${position} scarcity is ${Math.round(best.scarcity)}/100 in this ${config.teamCount}-team league.`,
    );
  }

  if (untilNext !== null && best.expectedAvailability < 0.5) {
    reasons.push(
      `Only a ${Math.round(best.expectedAvailability * 100)}% chance he survives the ${untilNext} picks before your next turn.`,
    );
  }

  if (best.tierRemaining <= 2 && best.tierCliff > 0) {
    reasons.push(
      `Just ${best.tierRemaining} player(s) left in his tier, and the drop to the next tier is ${best.tierCliff} projected points.`,
    );
  }

  const squeeze = squeezes.find((s) => s.position === position);
  if (squeeze) {
    reasons.push(
      `${squeeze.teamsNeedingPosition} teams picking before you also need ${position}.`,
    );
  }

  if (qb.isTwoQb && position === 'QB') {
    reasons.push(
      `This is a ${config.lineup.QB}-QB league: ${qb.viableStartingQbs} viable starters remain for ${qb.startingQbSlots} weekly QB slots.`,
    );
  } else if (qb.isTwoQb && qb.recommendation === 'DRAFT_QB_NOW') {
    reasons.push(
      `Note: the QB engine flags urgency — ${qb.teamsNeedingQb2} teams still need a QB${config.lineup.QB}.`,
    );
  }

  if (reasons.length === 0) {
    reasons.push(
      `Best combination of league-adjusted value (${best.value}) and roster fit (${best.rosterFit}) on the board.`,
    );
  }

  return reasons;
}

/** Value map that definitely contains the candidate (used for marginal-gain maths). */
function mergeValue(
  values: Map<string, ValuedPlayer>,
  player: ValuedPlayer,
): Map<string, ValuedPlayer> {
  if (values.has(player.player.id)) return values;
  const copy = new Map(values);
  copy.set(player.player.id, player);
  return copy;
}

/** Snapshot of your roster's starting strength, used by the dashboard. */
export function starterStrength(
  config: LeagueConfig,
  team: FantasyTeam,
  values: Map<string, ValuedPlayer>,
): number {
  return optimalLineup(config, team.roster, values).startersPoints;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Attach a ranker's view to a candidate, or null when he did not rank the player. */
function expertFor(
  ranking: ExpertRankedPlayer | undefined,
  player: ValuedPlayer,
): DraftCandidate['expert'] {
  if (!ranking) return null;
  return {
    tier: ranking.tier,
    rank: ranking.rank,
    designation: ranking.designation ?? null,
    note: ranking.note ?? null,
    disagreement: rankingDisagreement(player, ranking),
  };
}
