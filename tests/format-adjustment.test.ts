import { describe, expect, it } from 'vitest';
import { computeFormatAdjustment, scoringDiffers } from '@/domain/format-adjustment';
import { DEFAULT_LEAGUE_CONFIG } from '@/domain/league-config';
import { RB_TIERS_2026, QB_TIERS_2026, WR_TIERS_2026, TE_TIERS_2026 } from '@/data/expert-rankings';
import { isBigTierBreakAfter, guidanceForLeague } from '@/domain/expert-rankings';
import type { ExpertRankedPlayer } from '@/domain/expert-rankings';
import type { Player, Projection } from '@/domain/types';

const config = DEFAULT_LEAGUE_CONFIG; // 0.5 PPR

/**
 * Two backs who are close under full PPR, with production split very differently between
 * rushing and receiving. The reception gap (80 vs 20) is worth 30 points when a catch
 * moves from 1 point to 0.5, which is more than the gap between them — so half-PPR
 * scoring should reorder them.
 */
function twoBacks(): { players: Player[]; projections: Projection[]; matched: Map<string, ExpertRankedPlayer> } {
  const players: Player[] = [
    { id: 'catcher', name: 'Pass Catcher', position: 'RB', status: 'ACTIVE', source: 't', asOf: 'now' },
    { id: 'grinder', name: 'Early Down', position: 'RB', status: 'ACTIVE', source: 't', asOf: 'now' },
  ];
  const projections: Projection[] = [
    // 80 catches, fewer rushing yards.
    { playerId: 'catcher', season: 2026, stats: { rushYards: 700, rushTd: 5, receptions: 80, recYards: 700, recTd: 3 }, source: 't', asOf: 'now' },
    // 20 catches, far more rushing: 260 under full PPR against the catcher's 268.
    { playerId: 'grinder', season: 2026, stats: { rushYards: 1600, rushTd: 9, receptions: 20, recYards: 200, recTd: 1 }, source: 't', asOf: 'now' },
  ];
  const matched = new Map<string, ExpertRankedPlayer>([
    ['catcher', { name: 'Pass Catcher', position: 'RB', rank: 1, tier: 1 }],
    ['grinder', { name: 'Early Down', position: 'RB', rank: 2, tier: 1 }],
  ]);
  return { players, projections, matched };
}

describe('scoringDiffers', () => {
  it('detects a PPR mismatch', () => {
    expect(scoringDiffers({ receptionPoints: 1 }, config.scoring)).toBe(true);
  });

  it('reports no difference when the ranking already matches the league', () => {
    expect(scoringDiffers({ receptionPoints: 0.5 }, config.scoring)).toBe(false);
    expect(scoringDiffers({ passTdPoints: 4 }, config.scoring)).toBe(false);
  });
});

describe('computeFormatAdjustment', () => {
  it('does nothing when the ranking was built for this league already', () => {
    const { players, projections, matched } = twoBacks();
    const result = computeFormatAdjustment(config, [], matched, players, projections, undefined);
    expect(result.applies).toBe(false);
    expect(result.shifts.size).toBe(0);
  });

  it('moves a pass-catching back DOWN when translating full PPR into half PPR', () => {
    const { players, projections, matched } = twoBacks();
    const result = computeFormatAdjustment(config, [], matched, players, projections, {
      receptionPoints: 1,
    });

    expect(result.applies).toBe(true);
    const catcher = result.shifts.get('catcher')!;
    const grinder = result.shifts.get('grinder')!;

    // The catcher leads under full PPR and loses the lead under half PPR.
    expect(catcher.sourceOrder).toBe(1);
    expect(catcher.leagueOrder).toBe(2);
    expect(catcher.shift).toBeLessThan(0);
    expect(grinder.shift).toBeGreaterThan(0);
  });

  it('scales the points lost with reception volume', () => {
    const { players, projections, matched } = twoBacks();
    const result = computeFormatAdjustment(config, [], matched, players, projections, {
      receptionPoints: 1,
    });
    const catcher = result.shifts.get('catcher')!;
    const grinder = result.shifts.get('grinder')!;

    // 0.5 points per reception: 80 catches loses 40, 20 catches loses 10.
    expect(catcher.sourcePoints - catcher.leaguePoints).toBeCloseTo(40, 1);
    expect(grinder.sourcePoints - grinder.leaguePoints).toBeCloseTo(10, 1);
  });

  it('leaves the ranker’s own ranks untouched — it translates, it does not re-rank', () => {
    const { players, projections, matched } = twoBacks();
    computeFormatAdjustment(config, [], matched, players, projections, { receptionPoints: 1 });
    expect(matched.get('catcher')!.rank).toBe(1);
    expect(matched.get('grinder')!.rank).toBe(2);
  });

  it('reports ranked players with no projection instead of silently skipping them', () => {
    const { players, projections, matched } = twoBacks();
    matched.set('ghost', { name: 'No Projection', position: 'RB', rank: 3, tier: 1 });
    const result = computeFormatAdjustment(config, [], matched, players, projections, {
      receptionPoints: 1,
    });
    expect(result.unprojected).toContain('No Projection');
  });

  it('explains each shift with both scores and the reception count', () => {
    const { players, projections, matched } = twoBacks();
    const result = computeFormatAdjustment(config, [], matched, players, projections, {
      receptionPoints: 1,
    });
    const explain = result.shifts.get('catcher')!.explain;
    expect(explain.formula).toContain('80 projected receptions');
    expect(explain.inputs.pointsLost).toBeCloseTo(40, 1);
    expect(explain.sources).toContain('expert-rankings');
  });
});

describe('format summary does not overstate what it found', () => {
  it('says the translation could not be computed when nothing matched a projection', () => {
    const result = computeFormatAdjustment(
      config,
      TE_TIERS_2026.players,
      new Map(),
      [],
      [],
      TE_TIERS_2026.sourceScoring,
    );
    expect(result.applies).toBe(true);
    expect(result.shifts.size).toBe(0);
    expect(result.summary).toMatch(/could not be computed/);
    expect(result.summary).not.toMatch(/moves 0 of 0/);
  });
});

describe('bundled ranking sets declare their scoring', () => {
  it('marks the RB tiers as full PPR, which differs from this league', () => {
    expect(RB_TIERS_2026.sourceScoring?.receptionPoints).toBe(1);
    expect(scoringDiffers(RB_TIERS_2026.sourceScoring!, config.scoring)).toBe(true);
  });

  it('leaves the QB tiers unadjusted, since their passing scoring already matches', () => {
    const source = QB_TIERS_2026.sourceScoring ?? {};
    expect(scoringDiffers(source, config.scoring)).toBe(false);
  });
});

describe('RB_TIERS_2026 integrity', () => {
  it('has 91 players with contiguous ranks', () => {
    const ranks = RB_TIERS_2026.players.map((p) => p.rank).sort((a, b) => a - b);
    expect(ranks).toEqual(Array.from({ length: 91 }, (_, i) => i + 1));
  });

  it('preserves the published sub-tiers', () => {
    const subTiers = [...new Set(RB_TIERS_2026.players.map((p) => p.subTier))];
    expect(subTiers).toEqual(['1', '2', '3a', '3b', '4a', '4b', '5', '6a', '6b']);
  });

  it('separates stated designations from ones read off a range', () => {
    const inferred = RB_TIERS_2026.players.filter((p) => p.designationBasis === 'inferred');
    expect(inferred.map((p) => p.name)).toEqual([
      'Kyren Williams',
      'Travis Etienne',
      "D'Andre Swift",
      'Javonte Williams',
    ]);
    const stated = RB_TIERS_2026.players.filter((p) => p.designationBasis === 'stated');
    expect(stated.some((p) => p.name === 'Jahmyr Gibbs' && p.designation === 'TARGET')).toBe(true);
    expect(stated.some((p) => p.name === 'Derrick Henry' && p.designation === 'FADE')).toBe(true);
  });

  it('puts Gibbs alone in tier 1', () => {
    expect(RB_TIERS_2026.players.filter((p) => p.tier === 1).map((p) => p.name)).toEqual([
      'Jahmyr Gibbs',
    ]);
  });
});

describe('WR_TIERS_2026 integrity', () => {
  it('has 94 players with contiguous ranks', () => {
    const ranks = WR_TIERS_2026.players.map((p) => p.rank).sort((a, b) => a - b);
    expect(ranks).toEqual(Array.from({ length: 94 }, (_, i) => i + 1));
  });

  it('preserves the published sub-tiers in order', () => {
    const seen: string[] = [];
    for (const player of [...WR_TIERS_2026.players].sort((a, b) => a.rank - b.rank)) {
      if (seen[seen.length - 1] !== player.subTier) seen.push(player.subTier!);
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5a', '5b', '5c', '6', '7']);
  });

  it('records both Big Tier Breaks he calls out', () => {
    expect(WR_TIERS_2026.bigTierBreakAfterRanks).toEqual([12, 48]);
  });

  it('is also full PPR, so it needs translating for this league', () => {
    expect(scoringDiffers(WR_TIERS_2026.sourceScoring!, config.scoring)).toBe(true);
  });

  it('separates stated Targets from the group he described as a range', () => {
    const stated = WR_TIERS_2026.players.filter((p) => p.designationBasis === 'stated');
    expect(stated.map((p) => p.name)).toEqual([
      'Puka Nacua',
      "Ja'Marr Chase",
      'Luther Burden',
      'Cyrus Allen',
    ]);
    const inferred = WR_TIERS_2026.players.filter((p) => p.designationBasis === 'inferred');
    // Jameson Williams plus the late-round rookie/second-year block.
    expect(inferred).toHaveLength(8);
    expect(inferred.every((p) => p.designation === 'TARGET')).toBe(true);
  });
});

describe('TE_TIERS_2026 integrity', () => {
  it('has 50 players with contiguous ranks', () => {
    const ranks = TE_TIERS_2026.players.map((p) => p.rank).sort((a, b) => a - b);
    expect(ranks).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it('preserves the published sub-tiers in order', () => {
    const seen: string[] = [];
    for (const player of [...TE_TIERS_2026.players].sort((a, b) => a.rank - b.rank)) {
      if (seen[seen.length - 1] !== player.subTier) seen.push(player.subTier!);
    }
    expect(seen).toEqual(['1a', '1b', '2', '3', '4', '5']);
  });

  it('records the single Big Tier Break after the top four', () => {
    expect(TE_TIERS_2026.bigTierBreakAfterRanks).toEqual([4]);
  });

  it('is full PPR, so it needs translating for this league', () => {
    expect(scoringDiffers(TE_TIERS_2026.sourceScoring!, config.scoring)).toBe(true);
  });

  it('marks all four players ahead of the break as stated Targets, and nobody else', () => {
    const designated = TE_TIERS_2026.players.filter((p) => p.designation);
    expect(designated.map((p) => p.name)).toEqual([
      'Brock Bowers',
      'Trey McBride',
      'Colston Loveland',
      'Tyler Warren',
    ]);
    expect(designated.every((p) => p.designation === 'TARGET')).toBe(true);
    expect(designated.every((p) => p.designationBasis === 'stated')).toBe(true);
  });

  it('records no Fades, since he says explicitly he is not calling tier 3 a Fade tier', () => {
    expect(TE_TIERS_2026.players.some((p) => p.designation === 'FADE')).toBe(false);
  });

  it('surfaces the Great or Late guidance and its superflex caveat in this 2-QB league', () => {
    const guidance = guidanceForLeague(TE_TIERS_2026, config);
    expect(guidance.some((line) => /great or late/i.test(line))).toBe(true);
    expect(guidance.some((line) => /superflex/i.test(line))).toBe(true);
  });
});

describe('big tier breaks', () => {
  it('flags the cliff after the exact player, not the tier generally', () => {
    const nacua = WR_TIERS_2026.players.find((p) => p.rank === 12)!;
    const notCliff = WR_TIERS_2026.players.find((p) => p.rank === 11)!;
    expect(isBigTierBreakAfter(WR_TIERS_2026, nacua)).toBe(true);
    expect(isBigTierBreakAfter(WR_TIERS_2026, notCliff)).toBe(false);
  });

  it('puts the TE cliff after Warren, not after the three above him', () => {
    const warren = TE_TIERS_2026.players.find((p) => p.rank === 4)!;
    const loveland = TE_TIERS_2026.players.find((p) => p.rank === 3)!;
    expect(isBigTierBreakAfter(TE_TIERS_2026, warren)).toBe(true);
    expect(isBigTierBreakAfter(TE_TIERS_2026, loveland)).toBe(false);
  });

  it('records the RB cliff after Gibbs alone', () => {
    expect(RB_TIERS_2026.bigTierBreakAfterRanks).toEqual([1]);
  });

  it('records no cliffs at QB, where he says standard breaks held', () => {
    expect(QB_TIERS_2026.bigTierBreakAfterRanks ?? []).toEqual([]);
  });
});
