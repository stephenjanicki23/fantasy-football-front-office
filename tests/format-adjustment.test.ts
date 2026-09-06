import { describe, expect, it } from 'vitest';
import { computeFormatAdjustment, scoringDiffers } from '@/domain/format-adjustment';
import { DEFAULT_LEAGUE_CONFIG } from '@/domain/league-config';
import { RB_TIERS_2026, QB_TIERS_2026 } from '@/data/expert-rankings';
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
