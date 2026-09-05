import { explained, type Explained } from './explain';
import { isTwoQbLeague, startersPerTeam } from './league-config';
import { round2 } from './scoring';
import { replacementRank } from './replacement';
import type { AdpEntry, LeagueConfig, Position } from './types';
import type { ExpertRankedPlayer } from './expert-rankings';
import type { ValuedPlayer } from './valuation';

/**
 * Draft-quarters strategy layer.
 *
 * Implements the "cut your draft into quarters" framework: the draft is not a uniform
 * sequence of best-player-available decisions, it is four phases with different jobs.
 *
 *   Q1  Pre-dead-zone. The genuinely elite assets. Any position is defensible; what you
 *       take here constrains everything after it.
 *   Q2  The meat of the build. Highest opportunity cost per pick. Hunt Q1-calibre
 *       production at Q2 prices — this is the last realistic shot at league-winning
 *       production, because Q2-calibre production can still be found in Q3, Q4 and on
 *       waivers.
 *   Q3  Positions start drying up, especially receiver upside. Arrive with few objectives
 *       left, because there are not enough picks here to fix everything at once.
 *   Q4  Flyers. Market price is a loose construct; opportunity cost is low, so reach for
 *       upside rather than floor.
 *
 * Two league-specific adaptations, both of which matter a great deal here:
 *
 *   Two-QB / superflex stretches every quarter. A whole extra premium position is in
 *   play, so the elite pool is deeper and Q1 runs longer — roughly through round 4 rather
 *   than round 2. It also moves QB out of its usual Q3 window: with two starting QB slots
 *   per team there are not enough startable arms to wait that long.
 *
 *   A deep bench lengthens Q4 and raises the value of speculative picks, because there
 *   are more places to stash upside and a longer runway for it to pay off.
 *
 * Everything here is a model over projections, not a projection itself, and every number
 * carries its derivation.
 */

/** The framework is written for 12-team leagues; its round numbers assume that size. */
export const FRAMEWORK_TEAM_COUNT = 12;

/** Minimum widths, so a phase boundary is advice rather than trivia. */
export const MIN_Q3_ROUNDS = 2;
export const MIN_Q4_ROUNDS = 2;

export type Quarter = 1 | 2 | 3 | 4;

/**
 * What round of a 12-team draft this league's round is equivalent to, by players gone.
 *
 * The framework's advice is indexed to 12-team rounds, so this is what makes it portable:
 * in an 8-team league round 8 is pick 64, which a 12-team drafter reaches in round 5.3 —
 * so the talent still on the board is better than "round 8" advice would suggest.
 */
export function frameworkEquivalentRound(config: LeagueConfig, round: number): number {
  return round2((round * config.teamCount) / FRAMEWORK_TEAM_COUNT);
}

export interface QuarterPlan {
  quarter: Quarter;
  firstRound: number;
  lastRound: number;
  label: string;
  /** What this phase is for, in this league's terms. */
  objective: string;
  /** Concrete things to do while here. */
  guidance: string[];
}

export interface QuarterBoundaries {
  q1End: number;
  q2End: number;
  q3End: number;
  totalRounds: number;
  plans: QuarterPlan[];
  explain: Explained<number>;
}

/**
 * Where the quarters fall in this league.
 *
 * Q1 is found in the data rather than assumed: the elite pool ends where the board's
 * value curve first falls off a cliff, which is exactly what "the dead zone starts here"
 * means. Q2 and Q3 are structural, scaled by how many starters and bench spots the league
 * requires, because those determine how many picks are obligations rather than flyers.
 */
export function quarterBoundaries(
  config: LeagueConfig,
  board: ValuedPlayer[],
): QuarterBoundaries {
  const totalRounds = config.draftRounds;
  const twoQb = isTwoQbLeague(config);
  const starters = startersPerTeam(config);

  /**
   * Q1 scales with PICKS, not rounds.
   *
   * The framework is written for 12-team leagues, and its round numbers are a 12-team
   * translation of something absolute: the elite pool is a fixed set of players, not a
   * fixed number of rounds. Twenty-four picks exhausts it in a one-QB league whether
   * those picks take two rounds or three. So in an 8-team league Q1 runs *longer* in
   * round terms — round 8 here is pick 64, which a 12-team drafter reaches in round 5.
   *
   * The observed value cliff is computed and reported for comparison, but does not move
   * the boundary: read off a normalised curve it proved unstable, shifting with the
   * normalisation, the format and the depth of the pool.
   */
  const frameworkQ1Rounds = twoQb ? 4 : 2;
  const elitePoolPicks = frameworkQ1Rounds * FRAMEWORK_TEAM_COUNT;
  const observedCliff = findBoardCliff(config, board);
  const q1End = clampInt(
    Math.ceil(elitePoolPicks / config.teamCount),
    2,
    Math.max(2, totalRounds - 3),
  );

  /**
   * Q2 and Q3 do NOT scale with picks.
   *
   * Their job is roster construction against positional supply, and that is close to
   * league-size invariant: an 8-team league has fewer startable running backs but also
   * fewer teams competing for them, so the position lasts about the same number of
   * *rounds* at any size. These boundaries therefore track starting slots and bench
   * depth, which is what actually determines how many picks are obligations.
   */
  const q2Length = Math.max(3, Math.round(starters * 0.55));
  let q2End = clampInt(q1End + q2Length, q1End + 3, Math.max(q1End + 3, totalRounds - 2));

  // Q3 ends once a competent roster has its starters plus meaningful depth; a deeper
  // bench pushes this later and leaves a longer Q4.
  let q3End = clampInt(
    starters + Math.ceil(config.lineup.BENCH * 0.4),
    q2End + 1,
    Math.max(q2End + 1, totalRounds - MIN_Q4_ROUNDS),
  );

  /**
   * Keep every phase wide enough to mean something.
   *
   * In a small league a long Q1 can squeeze the later phases to a single round, which is
   * arithmetically fine but useless as advice — "you are in Q3" is not actionable if Q3
   * is one pick. Q3 is widened first by pulling Q2 back, since Q2's boundary is the
   * softer of the two: it marks a shift of emphasis, while Q3's marks positions actually
   * running out.
   */
  if (q3End - q2End < MIN_Q3_ROUNDS) {
    q2End = Math.max(q1End + 3, q3End - MIN_Q3_ROUNDS);
  }
  if (q3End <= q2End) q3End = q2End + MIN_Q3_ROUNDS;
  q3End = Math.min(q3End, Math.max(q2End + 1, totalRounds - MIN_Q4_ROUNDS));

  const plans = buildPlans(config, { q1End, q2End, q3End, totalRounds });

  return {
    q1End,
    q2End,
    q3End,
    totalRounds,
    plans,
    explain: explained(
      q1End,
      {
        twoQbLeague: twoQb,
        startingSlotsPerTeam: starters,
        benchSlots: config.lineup.BENCH,
        observedValueCliffRound: observedCliff ?? -1,
        elitePoolPicks: elitePoolPicks,
        frameworkTeamCount: FRAMEWORK_TEAM_COUNT,
        q1End,
        q2End,
        q3End,
        totalRounds,
      },
      `Q1 ends round ${q1End}: the elite pool is about ${elitePoolPicks} players (the framework's round ${frameworkQ1Rounds} in a ${FRAMEWORK_TEAM_COUNT}-team ${twoQb ? 'superflex' : 'one-QB'} league), which ${config.teamCount} teams consume in ${q1End} rounds` +
        `${observedCliff !== null ? `; this board's value curve flattens after round ${observedCliff}, shown for comparison only` : ''}. ` +
        `Q2 runs to round ${q2End} (${starters} starting slots to fill); ` +
        `Q3 runs to round ${q3End} (starters plus ${Math.ceil(config.lineup.BENCH * 0.4)} depth picks from a ${config.lineup.BENCH}-man bench); ` +
        `Q4 is rounds ${q3End + 1}-${totalRounds}`,
      ['projections', 'league-config'],
    ),
  };
}

/**
 * Share of the early board's total decay after which the elite pool is considered spent.
 *
 * The dead zone is where the value curve *flattens*, not where its single steepest drop
 * is: on a top-heavy board the steepest drop is always between the first and second
 * picks, which says nothing about where elite assets run out.
 *
 * The threshold is measured against the decay actually observed across the scan window
 * rather than a fixed fraction of round one, because how compressed league values look
 * depends on the normalisation, the format and the size of the pool.
 */
export const ELITE_DECAY_THRESHOLD = 0.5;

/**
 * The last round whose players still average elite value.
 *
 * Averages league value per round-sized block and returns the last round before that
 * average falls below `ELITE_DECAY_THRESHOLD` of the opening round. Null when the pool is
 * too shallow to judge, or when the curve never decays that far inside the scan window.
 */
export function findBoardCliff(
  config: LeagueConfig,
  board: ValuedPlayer[],
): number | null {
  const perRound = config.teamCount;
  const roundsToScan = 8;
  if (board.length < perRound * 3) return null;

  const sorted = [...board].sort((a, b) => b.leagueValue - a.leagueValue);
  const roundAverages: number[] = [];
  for (let round = 0; round < roundsToScan; round++) {
    const slice = sorted.slice(round * perRound, (round + 1) * perRound);
    if (slice.length === 0) break;
    roundAverages.push(slice.reduce((sum, p) => sum + p.leagueValue, 0) / slice.length);
  }
  if (roundAverages.length < 3) return null;

  const opening = roundAverages[0]!;
  const closing = roundAverages[roundAverages.length - 1]!;
  const totalDecay = opening - closing;
  if (totalDecay <= 0) return null;

  const threshold = opening - ELITE_DECAY_THRESHOLD * totalDecay;

  for (let i = 1; i < roundAverages.length; i++) {
    // Block i is round i+1. If it has given up half the window's decay, round i was the
    // last elite round.
    if (roundAverages[i]! < threshold) return i;
  }
  return null;
}

export function quarterForRound(boundaries: QuarterBoundaries, round: number): Quarter {
  if (round <= boundaries.q1End) return 1;
  if (round <= boundaries.q2End) return 2;
  if (round <= boundaries.q3End) return 3;
  return 4;
}

function buildPlans(
  config: LeagueConfig,
  bounds: { q1End: number; q2End: number; q3End: number; totalRounds: number },
): QuarterPlan[] {
  const twoQb = isTwoQbLeague(config);
  const qbSlots = config.lineup.QB + config.lineup.SUPERFLEX;
  const deepBench = config.lineup.BENCH >= 7;

  const q1Guidance = [
    'Take the best asset available. Every position is defensible here; there is no wrong position, only a wrong player.',
    'What you take now constrains the rest of the draft — note which positions you are choosing to solve later.',
  ];
  if (twoQb) {
    q1Guidance.push(
      `This is a ${qbSlots}-QB league, so elite QBs belong in this conversation. ${config.teamCount * qbSlots} QB slots start every week against a much shallower supply of startable arms.`,
    );
  }

  const q2Guidance = [
    'Hunt Q1-calibre production at Q2 prices. This is the last realistic window for a league-winning pick — Q2-calibre production can still be found in Q3, Q4 and on waivers.',
    'Weigh ceiling over floor. A safe player here costs you the upside slot you cannot buy back later.',
    'Every pick has real opportunity cost. Know what you are choosing not to do.',
  ];
  if (twoQb) {
    q2Guidance.push(
      'In this format QB cannot wait for its usual Q3 window. If you left Q1 without a QB, a second startable arm is a Q2 objective.',
    );
  }

  const q3Guidance = [
    'Receiver upside dries up through here. If you want a high-ceiling WR, this is the last of it.',
    'Arrive with few objectives left. There are not enough picks in this stretch to fix three positions at once.',
    'Discounted profiles with genuine ceiling beat safe production now.',
  ];
  if (!twoQb) {
    q3Guidance.push('This is the classic QB window in a one-QB league.');
  } else {
    q3Guidance.push(
      'Unlike a one-QB league, QB should already be handled. If it is not, it is now urgent rather than opportunistic.',
    );
  }

  const q4Guidance = [
    'Pure flyers. Market price is a loose construct back here — reach for the profile you want.',
    'Opportunity cost is low, so take ceiling over floor every time.',
  ];
  if (deepBench) {
    q4Guidance.push(
      `A ${config.lineup.BENCH}-man bench gives you room to stash upside and wait. Speculative picks are worth more here than in a shallow league.`,
    );
  }

  return [
    {
      quarter: 1,
      firstRound: 1,
      lastRound: bounds.q1End,
      label: 'Elite assets',
      objective: 'Take the best player on the board and set up the rest of the draft.',
      guidance: q1Guidance,
    },
    {
      quarter: 2,
      firstRound: bounds.q1End + 1,
      lastRound: bounds.q2End,
      label: 'The build',
      objective: 'Find Q1 production at Q2 prices. Seek upside, not safety.',
      guidance: q2Guidance,
    },
    {
      quarter: 3,
      firstRound: bounds.q2End + 1,
      lastRound: bounds.q3End,
      label: 'The squeeze',
      objective: 'Close out objectives before the positions dry up.',
      guidance: q3Guidance,
    },
    {
      quarter: 4,
      firstRound: bounds.q3End + 1,
      lastRound: bounds.totalRounds,
      label: 'Flyers',
      objective: 'Swing for ceiling. Opportunity cost is low.',
      guidance: q4Guidance,
    },
  ];
}

// ---------------------------------------------------------------------------
// Upside: "Q1 production at a Q2 price"
// ---------------------------------------------------------------------------

/**
 * How much league-winning production each position can actually deliver, 0-1.
 *
 * Proximity to elite is meaningless on its own: the best kicker is 100% of the way to
 * elite kicker, and elite kicker is worth a couple of points a week. Scaling by the
 * position's own elite-to-replacement gap, relative to the largest gap in the league,
 * stops a positional ceiling being mistaken for a league-winning one — and does it from
 * the league's own data rather than by hard-coding anything about kickers.
 */
export function positionSignificances(
  config: LeagueConfig,
  board: ValuedPlayer[],
): Map<Position, number> {
  const gaps = new Map<Position, number>();

  for (const position of new Set(board.map((p) => p.player.position))) {
    const pool = board
      .filter((p) => p.player.position === position)
      .sort((a, b) => b.projectedPoints - a.projectedPoints);
    const rank = replacementRank(config, position);
    const replacement =
      pool[Math.min(rank, pool.length) - 1]?.projectedPoints ??
      pool[pool.length - 1]?.projectedPoints ??
      0;
    gaps.set(position, Math.max(0, (pool[0]?.projectedPoints ?? 0) - replacement));
  }

  const max = Math.max(1, ...gaps.values());
  return new Map([...gaps].map(([position, gap]) => [position, gap / max]));
}

export interface UpsideScore {
  /** 0-100. */
  score: number;
  /** How close this player projects to elite production at his position, 0-1. */
  tierProximity: number;
  /** How far the market is discounting him against this league's value, 0-1. */
  marketDiscount: number | null;
  explain: Explained<number>;
}

/**
 * Upside, honestly bounded.
 *
 * Projections cannot tell you who breaks out — nothing here pretends otherwise. What is
 * computable is the two halves of the framework's actual claim:
 *
 *   tierProximity   how close a player already projects to elite production at his
 *                   position, so the gap he must close is small
 *   marketDiscount  how much later the market is letting him fall than this league's own
 *                   valuation says he is worth
 *
 * A player who is near-elite AND cheap is the "Q1 producer at a Q2 price". Without ADP
 * loaded the second half is unavailable and is reported as such rather than assumed.
 *
 * `positionPool` must be the FULL preseason pool at the position, not what is still
 * available. Measured against the remaining pool the best player left is elite by
 * definition, so every top recommendation would score 100 and the metric would say
 * nothing. Dynamic supply is already handled by the separate scarcity term; keeping the
 * two orthogonal stops the draft's progress being counted twice.
 */
export function upsideFor(
  player: ValuedPlayer,
  positionPool: ValuedPlayer[],
  config: LeagueConfig,
  adp: Map<string, AdpEntry>,
  options: { positionSignificance?: number } = {},
): UpsideScore {
  const sorted = [...positionPool].sort((a, b) => b.projectedPoints - a.projectedPoints);
  const elite = sorted[0]?.projectedPoints ?? player.projectedPoints;
  const floor = sorted[sorted.length - 1]?.projectedPoints ?? 0;

  /**
   * Measured across the position's whole range, not elite-to-replacement.
   *
   * Against replacement every late-round player clamps to zero, which erases exactly the
   * discrimination Q4 needs — and Q4 is where upside carries the most weight. The full
   * range keeps the ordering meaningful all the way down the board.
   */
  const span = elite - floor;
  const rawProximity = span > 0 ? clamp01((player.projectedPoints - floor) / span) : 0;
  const significance = clamp01(options.positionSignificance ?? 1);
  const tierProximity = rawProximity * significance;

  const entry = adp.get(player.player.id);
  const marketDiscount =
    entry === undefined
      ? null
      : clamp01((entry.adp - player.overallRank) / (config.teamCount * 2));

  const score = round2(
    100 * (marketDiscount === null ? tierProximity : 0.5 * tierProximity + 0.5 * marketDiscount),
  );

  return {
    score,
    tierProximity: round2(tierProximity),
    marketDiscount: marketDiscount === null ? null : round2(marketDiscount),
    explain: explained(
      score,
      {
        projectedPoints: player.projectedPoints,
        positionElitePoints: round2(elite),
        positionFloorPoints: round2(floor),
        positionSignificance: round2(significance),
        rawProximity: round2(rawProximity),
        tierProximity: round2(tierProximity),
        marketDiscount: marketDiscount ?? -1,
        leagueValueRank: player.overallRank,
        consensusAdp: entry?.adp ?? -1,
      },
      marketDiscount === null
        ? `upside = proximity only (${round2(tierProximity)}) = range position ${round2(rawProximity)} × ${player.player.position} significance ${round2(significance)}; projects ${player.projectedPoints} across a ${round2(floor)}-${round2(elite)} range. No ADP loaded, so market discount is unavailable.`
        : `upside = 0.5×proximity(${round2(tierProximity)}) + 0.5×discount(${round2(marketDiscount)}); ADP ${entry?.adp} vs league value rank ${player.overallRank}`,
      ['projections', 'league-config', ...(entry ? [`adp:${entry.source}`] : [])],
    ),
  };
}

// ---------------------------------------------------------------------------
// Roster construction against the framework
// ---------------------------------------------------------------------------

export interface StrategyStatus {
  currentQuarter: Quarter;
  plan: QuarterPlan;
  round: number;
  /** Picks you still hold inside the current quarter. */
  picksLeftInQuarter: number;
  /** Elite-calibre players already on your roster. */
  q1ProducersOwned: number;
  /** How many a winning roster typically needs. */
  q1ProducerTarget: number;
  /** Starting slots still unfilled. */
  openObjectives: string[];
  /** Fires when Q3 has more objectives than picks to solve them. */
  congestionWarning: string | null;
  notes: string[];
  explain: Explained<string>;
}

/**
 * Roughly how many elite-calibre producers a winning roster needs.
 *
 * The framework puts this at three to five, having come down from five as league-winning
 * seasons became scarcer. It scales with the number of starting slots, so a two-QB league
 * needs one more than a one-QB league.
 */
export function q1ProducerTarget(config: LeagueConfig): number {
  return clampInt(Math.round(startersPerTeam(config) * 0.4), 3, 6);
}

export function strategyStatus(
  config: LeagueConfig,
  boundaries: QuarterBoundaries,
  round: number,
  input: {
    /** My remaining pick numbers, overall. */
    myRemainingPicks: number[];
    /** League value of each player already on my roster. */
    myRosterValues: ValuedPlayer[];
    /** Starting slots I cannot currently fill. */
    unfilledSlots: string[];
    /** Positions where supply is about to run out. */
    dryingUpPositions: string[];
    /** The board, to define what "elite" means. */
    board: ValuedPlayer[];
  },
): StrategyStatus {
  const quarter = quarterForRound(boundaries, round);
  const plan = boundaries.plans.find((p) => p.quarter === quarter)!;

  const quarterLastOverall = plan.lastRound * config.teamCount;
  const picksLeftInQuarter = input.myRemainingPicks.filter(
    (overall) => overall <= quarterLastOverall,
  ).length;

  // "Elite" is defined by the board itself: the players who were Q1 assets.
  const eliteCutoff = boundaries.q1End * config.teamCount;
  const eliteIds = new Set(
    [...input.board]
      .sort((a, b) => b.leagueValue - a.leagueValue)
      .slice(0, eliteCutoff)
      .map((p) => p.player.id),
  );
  const q1ProducersOwned = input.myRosterValues.filter((p) => eliteIds.has(p.player.id)).length;
  const target = q1ProducerTarget(config);

  const openObjectives = [
    ...input.unfilledSlots,
    ...input.dryingUpPositions.filter((position) => !input.unfilledSlots.includes(position)),
  ];

  // The framework's central Q3 warning: you arrive believing there is room for everything
  // and discover there is not.
  const congestionWarning =
    quarter >= 3 && openObjectives.length > picksLeftInQuarter
      ? `${openObjectives.length} objectives left (${openObjectives.join(', ')}) but only ${picksLeftInQuarter} pick${picksLeftInQuarter === 1 ? '' : 's'} remaining in Q${quarter}. Something will have to wait — decide now which, rather than discovering it in two rounds.`
      : null;

  const notes: string[] = [];
  if (quarter === 2 && q1ProducersOwned < target) {
    notes.push(
      `${q1ProducersOwned} of roughly ${target} elite-calibre producers so far. Q2 is the last window to add one, so weigh ceiling over floor.`,
    );
  }
  if (quarter === 1 && isTwoQbLeague(config)) {
    notes.push(
      `Two starting QB slots means ${config.teamCount * (config.lineup.QB + config.lineup.SUPERFLEX)} QBs start weekly. An elite QB is a legitimate Q1 asset here in a way it never is in a one-QB league.`,
    );
  }
  if (quarter === 4 && config.lineup.BENCH >= 7) {
    notes.push(
      `With a ${config.lineup.BENCH}-man bench you can afford pure ceiling swings — a flyer that misses costs you a bench spot you have to spare.`,
    );
  }

  return {
    currentQuarter: quarter,
    plan,
    round,
    picksLeftInQuarter,
    q1ProducersOwned,
    q1ProducerTarget: target,
    openObjectives,
    congestionWarning,
    notes,
    explain: explained(
      `Q${quarter}`,
      {
        round,
        quarter,
        picksLeftInQuarter,
        q1ProducersOwned,
        q1ProducerTarget: target,
        openObjectives: openObjectives.join(',') || 'none',
        eliteCutoffPick: eliteCutoff,
      },
      `Round ${round} sits in Q${quarter} (${plan.label}, rounds ${plan.firstRound}-${plan.lastRound}). ` +
        `Elite is defined as the top ${eliteCutoff} of the board, being Q1's ${boundaries.q1End} rounds × ${config.teamCount} teams.`,
      ['projections', 'rosters', 'league-config'],
    ),
  };
}

// ---------------------------------------------------------------------------
// Quarter-aware scoring weights
// ---------------------------------------------------------------------------

export interface StrategyWeights {
  value: number;
  scarcity: number;
  rosterFit: number;
  urgency: number;
  opponentDemand: number;
  /** Weight on the upside model above. */
  upside: number;
}

/**
 * What each phase optimises for.
 *
 * Q1 rewards raw value because the elite pool is where talent gaps are largest and the
 * board is least predictable. Q2 shifts hard onto upside, per the framework's core claim
 * that this is the last window for league-winning production. Q3 shifts onto roster fit
 * and scarcity, because the job becomes closing out objectives before supply is gone. Q4
 * is almost entirely upside, because floor is worthless on a bench spot.
 */
export function weightsForQuarter(quarter: Quarter): StrategyWeights {
  switch (quarter) {
    case 1:
      return { value: 0.52, scarcity: 0.18, rosterFit: 0.10, urgency: 0.10, opponentDemand: 0.05, upside: 0.05 };
    case 2:
      return { value: 0.28, scarcity: 0.18, rosterFit: 0.14, urgency: 0.10, opponentDemand: 0.05, upside: 0.25 };
    case 3:
      return { value: 0.22, scarcity: 0.24, rosterFit: 0.28, urgency: 0.11, opponentDemand: 0.05, upside: 0.10 };
    case 4:
      return { value: 0.18, scarcity: 0.07, rosterFit: 0.15, urgency: 0.05, opponentDemand: 0.05, upside: 0.50 };
  }
}

/** Positions whose startable supply is close to exhausted. */
export function dryingUpPositions(
  config: LeagueConfig,
  available: ValuedPlayer[],
): Position[] {
  const positions: Position[] = ['QB', 'RB', 'WR', 'TE'];
  const drying: Position[] = [];

  for (const position of positions) {
    const pool = available
      .filter((p) => p.player.position === position)
      .sort((a, b) => b.projectedPoints - a.projectedPoints);
    if (pool.length === 0) continue;

    const rank = replacementRank(config, position);
    const replacement =
      pool[Math.min(rank, pool.length) - 1]?.projectedPoints ??
      pool[pool.length - 1]?.projectedPoints ??
      0;
    const startable = pool.filter((p) => p.projectedPoints > replacement).length;

    // Fewer startable players left than teams means most managers will miss out.
    if (startable <= config.teamCount) drying.push(position);
  }

  return drying;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function clampInt(n: number, min: number, max: number): number {
  return Math.round(Math.min(Math.max(n, min), Math.max(min, max)));
}

// ---------------------------------------------------------------------------
// Expert tier objectives
// ---------------------------------------------------------------------------

export interface TierWindowObjective {
  position: Position;
  /** How many starters this league requires at the position. */
  needed: number;
  owned: number;
  /** The tier by which the ranker says you should have them. */
  throughTier: number;
  /** Ranked players at or above that tier still on the board. */
  remainingInWindow: number;
  status: 'NO_DATA' | 'DONE' | 'ON_TRACK' | 'TIGHT' | 'MISSED';
  message: string;
  explain: Explained<string>;
}

/**
 * Track a "have N of this position by the end of tier T" objective.
 *
 * This is the shape of the most actionable advice a tiers piece gives: not a ranking but
 * a deadline. In a two-QB league the ranker's version is to come away with two QBs by the
 * end of his Tier 3, while still taking elite players at other positions — so what
 * matters during the draft is how many qualifying arms are left, not merely how many QBs
 * exist.
 *
 * Supply is counted against the whole league's remaining demand, because a window closes
 * when rivals take the players, not when you do.
 */
export function tierWindowObjective(
  config: LeagueConfig,
  position: Position,
  throughTier: number,
  input: {
    /** Expert rankings for players still available, keyed by player id. */
    availableRankings: ExpertRankedPlayer[];
    /** Expert rankings for players already on my roster. */
    myRankings: ExpertRankedPlayer[];
    /** How many teams still need one, for supply pressure. */
    teamsStillNeeding: number;
    /** Ranked players at this position matched to the pool at all, drafted or not. */
    matchedAtPosition: number;
  },
): TierWindowObjective {
  const needed = (config.lineup[position as keyof typeof config.lineup] ?? 0) as number;
  const owned = input.myRankings.filter(
    (ranking) => ranking.position === position && ranking.tier <= throughTier,
  ).length;
  const remainingInWindow = input.availableRankings.filter(
    (ranking) => ranking.position === position && ranking.tier <= throughTier,
  ).length;

  const shortfall = Math.max(0, needed - owned);

  let status: TierWindowObjective['status'];
  let message: string;

  /**
   * "No rankings matched" is not "the window closed".
   *
   * Without this the objective reports MISSED whenever the ranking set cannot be matched
   * to the pool — placeholder sample names, a position the ranker has not published yet —
   * which reads as an urgent roster problem when it is in fact an absence of data.
   */
  if (input.matchedAtPosition === 0) {
    status = 'NO_DATA';
    message = `No ${position} rankings could be matched to your player pool, so this objective cannot be tracked. It is not a roster problem.`;
  } else if (shortfall === 0) {
    status = 'DONE';
    message = `You have ${owned} ${position}${owned === 1 ? '' : 's'} inside tier ${throughTier} — objective met.`;
  } else if (remainingInWindow === 0) {
    status = 'MISSED';
    message = `No tier ${throughTier}-or-better ${position}s remain, and you are ${shortfall} short. Reset expectations at the position rather than reaching for the next tier at a tier-${throughTier} price.`;
  } else if (remainingInWindow <= shortfall) {
    status = 'MISSED';
    message = `Only ${remainingInWindow} tier ${throughTier}-or-better ${position}${remainingInWindow === 1 ? '' : 's'} left and you need ${shortfall}. With ${input.teamsStillNeeding} rivals also short, expect to miss the window.`;
  } else if (remainingInWindow <= shortfall + input.teamsStillNeeding) {
    status = 'TIGHT';
    message = `${remainingInWindow} tier ${throughTier}-or-better ${position}s left, you need ${shortfall}, and ${input.teamsStillNeeding} rivals are also short. The window is closing — take one before it does.`;
  } else {
    status = 'ON_TRACK';
    message = `${remainingInWindow} tier ${throughTier}-or-better ${position}s remain for the ${shortfall} you still need. No need to reach yet.`;
  }

  return {
    position,
    needed,
    owned,
    throughTier,
    remainingInWindow,
    status,
    message,
    explain: explained(
      status,
      {
        position,
        needed,
        owned,
        shortfall,
        throughTier,
        remainingInWindow,
        teamsStillNeeding: input.teamsStillNeeding,
        matchedAtPosition: input.matchedAtPosition,
      },
      `Objective: ${needed} ${position}s by the end of tier ${throughTier}. Hold ${owned}, need ${shortfall} more, ` +
        `${remainingInWindow} qualifying players left, ${input.teamsStillNeeding} rivals also short.`,
      ['expert-rankings', 'rosters', 'league-config'],
    ),
  };
}
