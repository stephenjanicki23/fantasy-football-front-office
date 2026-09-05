import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAGUE_CONFIG } from '@/domain/league-config';
import {
  FRAMEWORK_TEAM_COUNT,
  frameworkEquivalentRound,
  dryingUpPositions,
  q1ProducerTarget,
  positionSignificances,
  quarterBoundaries,
  quarterForRound,
  strategyStatus,
  upsideFor,
  weightsForQuarter,
} from '@/domain/draft-strategy';
import { valuePlayers } from '@/domain/valuation';
import {
  buildSamplePlayers,
  buildSampleProjections,
} from '@/providers/sample/sample-league';
import type { AdpEntry, LeagueConfig } from '@/domain/types';

const players = buildSamplePlayers();
const projections = buildSampleProjections();

const twoQb = DEFAULT_LEAGUE_CONFIG; // 8 teams, 2 QB, 6-man bench
const oneQb: LeagueConfig = {
  ...DEFAULT_LEAGUE_CONFIG,
  lineup: { ...DEFAULT_LEAGUE_CONFIG.lineup, QB: 1, BENCH: 7 },
};
const deepBench: LeagueConfig = {
  ...DEFAULT_LEAGUE_CONFIG,
  lineup: { ...DEFAULT_LEAGUE_CONFIG.lineup, BENCH: 12 },
  draftRounds: 22,
};

const board = valuePlayers(twoQb, players, projections).players;
const oneQbBoard = valuePlayers(oneQb, players, projections).players;

describe('quarterBoundaries', () => {
  it('runs Q1 longer in a 2-QB league than in a 1-QB league of the same size', () => {
    const size = (config: LeagueConfig) => ({ ...config, teamCount: 12 });
    const two = quarterBoundaries(size(twoQb), board);
    const one = quarterBoundaries(size(oneQb), oneQbBoard);
    expect(two.q1End).toBeGreaterThan(one.q1End);
  });

  it('reproduces the source framework for the 12-team 1-QB league it was written for', () => {
    const twelve: LeagueConfig = { ...oneQb, teamCount: 12 };
    const b = quarterBoundaries(twelve, oneQbBoard);
    // Framework: Q1 rounds 1-2 (maybe 3), Q2 to about 8, Q3 to about 12-13, Q4 13+.
    expect(b.q1End).toBeLessThanOrEqual(3);
    expect(b.q2End).toBeGreaterThanOrEqual(6);
    expect(b.q2End).toBeLessThanOrEqual(9);
    expect(b.q3End).toBeGreaterThanOrEqual(11);
    expect(b.q3End).toBeLessThanOrEqual(14);
  });

  it('stretches Q1 in round terms for a smaller league, because a round consumes fewer players', () => {
    const eight = quarterBoundaries(twoQb, board);
    const twelve = quarterBoundaries({ ...twoQb, teamCount: 12 }, board);
    // The elite pool is a fixed number of players; 8 teams take more rounds to eat it.
    expect(eight.q1End).toBeGreaterThan(twelve.q1End);
  });

  it('does not stretch Q3 for a smaller league, because positional supply scales with demand', () => {
    const eight = quarterBoundaries(twoQb, board);
    const twelve = quarterBoundaries({ ...twoQb, teamCount: 12 }, board);
    const width = (b: ReturnType<typeof quarterBoundaries>) => b.q3End - b.q2End;
    expect(Math.abs(width(eight) - width(twelve))).toBeLessThanOrEqual(2);
  });

  it('keeps every phase wide enough to be actionable', () => {
    for (const config of [twoQb, oneQb, deepBench, { ...twoQb, teamCount: 12 }]) {
      const b = quarterBoundaries(config, board);
      expect(b.q2End - b.q1End).toBeGreaterThanOrEqual(3);
      expect(b.q3End - b.q2End).toBeGreaterThanOrEqual(2);
      expect(b.totalRounds - b.q3End).toBeGreaterThanOrEqual(2);
    }
  });

  it('produces four quarters that tile the draft without gaps or overlap', () => {
    const { plans, totalRounds } = quarterBoundaries(twoQb, board);
    expect(plans).toHaveLength(4);
    expect(plans[0]!.firstRound).toBe(1);
    expect(plans[3]!.lastRound).toBe(totalRounds);
    for (let i = 1; i < plans.length; i++) {
      expect(plans[i]!.firstRound).toBe(plans[i - 1]!.lastRound + 1);
    }
  });

  it('keeps the boundaries strictly increasing', () => {
    const { q1End, q2End, q3End, totalRounds } = quarterBoundaries(twoQb, board);
    expect(q1End).toBeLessThan(q2End);
    expect(q2End).toBeLessThan(q3End);
    expect(q3End).toBeLessThan(totalRounds);
  });

  it('lengthens Q4 when the bench is deep', () => {
    const normal = quarterBoundaries(twoQb, board);
    const deep = quarterBoundaries(deepBench, board);
    const q4Length = (b: ReturnType<typeof quarterBoundaries>) => b.totalRounds - b.q3End;
    expect(q4Length(deep)).toBeGreaterThan(q4Length(normal));
  });

  it('explains where the boundaries came from', () => {
    const { explain } = quarterBoundaries(twoQb, board);
    expect(explain.formula).toContain('Q1 ends round');
    expect(explain.formula).toContain('starting slots to fill');
    expect(explain.inputs.twoQbLeague).toBe(true);
  });

  it('degrades gracefully on a pool too shallow to find a cliff', () => {
    const tiny = board.slice(0, 5);
    const bounds = quarterBoundaries(twoQb, tiny);
    expect(bounds.q1End).toBeGreaterThanOrEqual(3);
    expect(bounds.plans).toHaveLength(4);
  });
});

describe('quarterForRound', () => {
  it('maps rounds onto the right quarter', () => {
    const b = quarterBoundaries(twoQb, board);
    expect(quarterForRound(b, 1)).toBe(1);
    expect(quarterForRound(b, b.q1End)).toBe(1);
    expect(quarterForRound(b, b.q1End + 1)).toBe(2);
    expect(quarterForRound(b, b.q2End)).toBe(2);
    expect(quarterForRound(b, b.q2End + 1)).toBe(3);
    expect(quarterForRound(b, b.q3End + 1)).toBe(4);
    expect(quarterForRound(b, 99)).toBe(4);
  });
});

describe('weightsForQuarter', () => {
  it('sums to 1 in every quarter', () => {
    for (const quarter of [1, 2, 3, 4] as const) {
      const w = weightsForQuarter(quarter);
      const total = w.value + w.scarcity + w.rosterFit + w.urgency + w.opponentDemand + w.upside;
      expect(total).toBeCloseTo(1, 5);
    }
  });

  it('weights raw value hardest in Q1', () => {
    expect(weightsForQuarter(1).value).toBeGreaterThan(weightsForQuarter(2).value);
    expect(weightsForQuarter(1).value).toBeGreaterThan(weightsForQuarter(4).value);
  });

  it('shifts onto upside in Q2, the last window for league-winning production', () => {
    expect(weightsForQuarter(2).upside).toBeGreaterThan(weightsForQuarter(1).upside);
    expect(weightsForQuarter(2).upside).toBeGreaterThan(weightsForQuarter(3).upside);
  });

  it('shifts onto roster fit and scarcity in Q3, when positions dry up', () => {
    expect(weightsForQuarter(3).rosterFit).toBeGreaterThan(weightsForQuarter(2).rosterFit);
    expect(weightsForQuarter(3).scarcity).toBeGreaterThan(weightsForQuarter(2).scarcity);
  });

  it('makes Q4 almost entirely about ceiling', () => {
    const q4 = weightsForQuarter(4);
    expect(q4.upside).toBeGreaterThan(0.4);
    expect(q4.upside).toBeGreaterThan(q4.value);
  });
});

describe('upsideFor', () => {
  const qbs = board.filter((p) => p.player.position === 'QB');

  it('scores a near-elite player above a replacement-level one', () => {
    const elite = upsideFor(qbs[1]!, qbs, twoQb, new Map());
    const fringe = upsideFor(qbs[qbs.length - 1]!, qbs, twoQb, new Map());
    expect(elite.score).toBeGreaterThan(fringe.score);
  });

  it('reports the market discount as unavailable when no ADP is loaded', () => {
    const result = upsideFor(qbs[3]!, qbs, twoQb, new Map());
    expect(result.marketDiscount).toBeNull();
    expect(result.explain.formula).toContain('No ADP loaded');
  });

  it('rewards a player the market is letting fall past his league value', () => {
    const player = qbs[5]!;
    const cheap = new Map<string, AdpEntry>([
      [player.player.id, { playerId: player.player.id, adp: player.overallRank + 30, format: 'x', source: 'test', asOf: 'now' }],
    ]);
    const expensive = new Map<string, AdpEntry>([
      [player.player.id, { playerId: player.player.id, adp: player.overallRank, format: 'x', source: 'test', asOf: 'now' }],
    ]);
    expect(upsideFor(player, qbs, twoQb, cheap).score).toBeGreaterThan(
      upsideFor(player, qbs, twoQb, expensive).score,
    );
  });

  it('does not call the best remaining player elite once the top of the board is gone', () => {
    // Measured against the *available* pool the leader always scores 100, which says
    // nothing. Measured against the full pool it must fall as the elite tier is drafted.
    const drained = qbs.slice(8);
    const leaderOfDrainedPool = upsideFor(drained[0]!, qbs, twoQb, new Map());
    expect(leaderOfDrainedPool.score).toBeLessThan(100);
    expect(upsideFor(qbs[0]!, qbs, twoQb, new Map()).score).toBeGreaterThan(
      leaderOfDrainedPool.score,
    );
  });

  it('stays within 0-100 and cites its sources', () => {
    for (const player of qbs.slice(0, 10)) {
      const result = upsideFor(player, qbs, twoQb, new Map());
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.explain.sources).toContain('projections');
    }
  });
});

describe('q1ProducerTarget', () => {
  it('asks for more elite producers in a 2-QB league than a 1-QB league', () => {
    expect(q1ProducerTarget(twoQb)).toBeGreaterThanOrEqual(q1ProducerTarget(oneQb));
  });

  it('stays inside the framework range of three to six', () => {
    for (const config of [twoQb, oneQb, deepBench]) {
      expect(q1ProducerTarget(config)).toBeGreaterThanOrEqual(3);
      expect(q1ProducerTarget(config)).toBeLessThanOrEqual(6);
    }
  });
});

describe('strategyStatus', () => {
  const bounds = quarterBoundaries(twoQb, board);

  it('counts elite producers already on the roster', () => {
    const top = [...board].sort((a, b) => b.leagueValue - a.leagueValue).slice(0, 2);
    const status = strategyStatus(twoQb, bounds, 3, {
      myRemainingPicks: [20, 30],
      myRosterValues: top,
      unfilledSlots: [],
      dryingUpPositions: [],
      board,
    });
    expect(status.q1ProducersOwned).toBe(2);
    expect(status.q1ProducerTarget).toBeGreaterThanOrEqual(3);
  });

  it('warns in Q3 when objectives outnumber remaining picks', () => {
    const round = bounds.q2End + 1;
    const status = strategyStatus(twoQb, bounds, round, {
      myRemainingPicks: [round * 8],
      myRosterValues: [],
      unfilledSlots: ['QB', 'TE', 'K'],
      dryingUpPositions: ['RB'],
      board,
    });
    expect(status.currentQuarter).toBe(3);
    expect(status.congestionWarning).toContain('4 objectives');
    expect(status.congestionWarning).toContain('1 pick');
  });

  it('stays quiet when Q3 objectives fit the picks available', () => {
    const round = bounds.q2End + 1;
    const status = strategyStatus(twoQb, bounds, round, {
      myRemainingPicks: [round * 8, round * 8 + 5, round * 8 + 12],
      myRosterValues: [],
      unfilledSlots: ['K'],
      dryingUpPositions: [],
      board,
    });
    expect(status.congestionWarning).toBeNull();
  });

  it('tells you in Q1 that an elite QB is a legitimate first-round asset here', () => {
    const status = strategyStatus(twoQb, bounds, 1, {
      myRemainingPicks: [1],
      myRosterValues: [],
      unfilledSlots: [],
      dryingUpPositions: [],
      board,
    });
    expect(status.notes.join(' ')).toContain('QBs start weekly');
  });

  it('nudges toward ceiling in Q2 while short of elite producers', () => {
    const status = strategyStatus(twoQb, bounds, bounds.q1End + 1, {
      myRemainingPicks: [40],
      myRosterValues: [],
      unfilledSlots: [],
      dryingUpPositions: [],
      board,
    });
    expect(status.currentQuarter).toBe(2);
    expect(status.notes.join(' ')).toContain('last window');
  });

  it('does not deduplicate an objective that is both unfilled and drying up', () => {
    const status = strategyStatus(twoQb, bounds, bounds.q2End + 1, {
      myRemainingPicks: [100],
      myRosterValues: [],
      unfilledSlots: ['TE'],
      dryingUpPositions: ['TE', 'RB'],
      board,
    });
    expect(status.openObjectives).toEqual(['TE', 'RB']);
  });
});

describe('dryingUpPositions', () => {
  it('reports nothing when the pool is full', () => {
    expect(dryingUpPositions(twoQb, board)).toHaveLength(0);
  });

  it('flags a position once startable supply falls to about one per team', () => {
    const withoutQbs = board.filter(
      (p) => p.player.position !== 'QB' || p.positionRank > 26,
    );
    expect(dryingUpPositions(twoQb, withoutQbs)).toContain('QB');
  });
});

describe('frameworkEquivalentRound', () => {
  it('maps a small-league round onto the deeper 12-team round it corresponds to', () => {
    // Round 8 of an 8-team draft is pick 64, which a 12-team drafter reaches in round 5.3.
    expect(frameworkEquivalentRound(twoQb, 8)).toBeCloseTo(5.33, 1);
  });

  it('is the identity for a 12-team league, which the framework was written for', () => {
    const twelve: LeagueConfig = { ...twoQb, teamCount: FRAMEWORK_TEAM_COUNT };
    for (const round of [1, 5, 12]) {
      expect(frameworkEquivalentRound(twelve, round)).toBe(round);
    }
  });

  it('reports a deeper equivalent round for a larger league', () => {
    expect(frameworkEquivalentRound({ ...twoQb, teamCount: 14 }, 6)).toBeGreaterThan(6);
  });
});

describe('positionSignificances', () => {
  it('rates QB the most significant position in a 2-QB league', () => {
    const sig = positionSignificances(twoQb, board);
    expect(sig.get('QB')).toBe(1);
  });

  it('rates kicker near the bottom, from the data rather than a hard-coded rule', () => {
    const sig = positionSignificances(twoQb, board);
    expect(sig.get('K')!).toBeLessThan(0.3);
    expect(sig.get('K')!).toBeLessThan(sig.get('RB')!);
  });

  it('keeps every position on a 0-1 scale', () => {
    for (const value of positionSignificances(twoQb, board).values()) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe('upside with positional significance', () => {
  it('does not let an elite kicker score like an elite QB', () => {
    const sig = positionSignificances(twoQb, board);
    const kickers = board.filter((p) => p.player.position === 'K');
    const qbs = board.filter((p) => p.player.position === 'QB');

    const bestKicker = upsideFor(kickers[0]!, kickers, twoQb, new Map(), {
      positionSignificance: sig.get('K'),
    });
    const bestQb = upsideFor(qbs[0]!, qbs, twoQb, new Map(), {
      positionSignificance: sig.get('QB'),
    });

    expect(bestKicker.score).toBeLessThan(bestQb.score / 3);
  });

  it('still separates players late, where Q4 leans hardest on upside', () => {
    const rbs = board.filter((p) => p.player.position === 'RB');
    const late = rbs.slice(-12);
    const scores = late.map(
      (p) => upsideFor(p, rbs, twoQb, new Map(), { positionSignificance: 0.7 }).score,
    );
    // Measured against replacement these would all clamp to zero and rank identically.
    expect(new Set(scores).size).toBeGreaterThan(1);
    expect(Math.max(...scores)).toBeGreaterThan(0);
  });
});
