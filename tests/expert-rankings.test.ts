import { describe, expect, it } from 'vitest';
import {
  guidanceForLeague,
  matchExpertRankings,
  normaliseName,
  expertBoardValue,
  expertUpsideFor,
  TIER_STEP,
  BIG_TIER_BREAK_PENALTY,
  rankingDisagreement,
  tierGroups,
} from '@/domain/expert-rankings';
import { tierWindowObjective } from '@/domain/draft-strategy';
import { QB_TIERS_2026, TE_TIERS_2026, WR_TIERS_2026 } from '@/data/expert-rankings';
import { DEFAULT_LEAGUE_CONFIG } from '@/domain/league-config';
import type { LeagueConfig, Player } from '@/domain/types';
import type { ValuedPlayer } from '@/domain/valuation';

function player(name: string, position: Player['position'] = 'QB'): Player {
  return { id: `p-${name}`, name, position, status: 'ACTIVE', source: 'test', asOf: 'now' };
}

const oneQb: LeagueConfig = {
  ...DEFAULT_LEAGUE_CONFIG,
  lineup: { ...DEFAULT_LEAGUE_CONFIG.lineup, QB: 1 },
};

describe('QB_TIERS_2026 integrity', () => {
  it('has contiguous ranks with no gaps or duplicates', () => {
    const ranks = QB_TIERS_2026.players.map((p) => p.rank).sort((a, b) => a - b);
    expect(ranks).toEqual(Array.from({ length: ranks.length }, (_, i) => i + 1));
  });

  it('has monotonically non-decreasing tiers as rank worsens', () => {
    const byRank = [...QB_TIERS_2026.players].sort((a, b) => a.rank - b.rank);
    for (let i = 1; i < byRank.length; i++) {
      expect(byRank[i]!.tier).toBeGreaterThanOrEqual(byRank[i - 1]!.tier);
    }
  });

  it('records only the designations the ranker stated explicitly', () => {
    const fades = QB_TIERS_2026.players.filter((p) => p.designation === 'FADE');
    expect(fades.map((p) => p.name).sort()).toEqual(['Drake Maye', 'Jaxson Dart']);
    // He wrote that he put no Target labels at the top of the position.
    expect(QB_TIERS_2026.players.filter((p) => p.designation === 'TARGET')).toHaveLength(0);
  });

  it('is attributed and dated', () => {
    expect(QB_TIERS_2026.source).toContain('Ben Gretch');
    expect(QB_TIERS_2026.season).toBe(2026);
    expect(QB_TIERS_2026.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(QB_TIERS_2026.scoringNote).toContain('4-point');
  });

  it('covers only QB, since the other positions were not supplied', () => {
    expect(new Set(QB_TIERS_2026.players.map((p) => p.position))).toEqual(new Set(['QB']));
  });
});

describe('tierGroups', () => {
  it('reproduces the published tier boundaries', () => {
    const groups = tierGroups(QB_TIERS_2026, 'QB');
    expect(groups.map((g) => g.players.length)).toEqual([3, 6, 10, 5, 6, 6]);
    expect(groups[0]!.players.map((p) => p.name)).toEqual([
      'Lamar Jackson',
      'Josh Allen',
      'Jayden Daniels',
    ]);
  });
});

describe('normaliseName', () => {
  it('matches across punctuation and suffixes', () => {
    expect(normaliseName('C.J. Stroud')).toBe(normaliseName('CJ Stroud'));
    expect(normaliseName('Michael Penix Jr.')).toBe(normaliseName('Michael Penix'));
    expect(normaliseName("Ja'Marr Chase")).toBe(normaliseName('JaMarr Chase'));
  });

  it('does not collapse genuinely different names', () => {
    expect(normaliseName('Josh Allen')).not.toBe(normaliseName('Keenan Allen'));
  });

  it('reconciles the TE transcriptions with ESPN spelling', () => {
    // ESPN spelling on the left, the form transcribed from the tiers on the right.
    const pairs: Array<[string, string]> = [
      ['Harold Fannin Jr.', 'Harold Fannin'],
      ['Oronde Gadsden II', 'Oronde Gadsden'],
      ['A.J. Barner', 'AJ Barner'],
      ['Ja\u2019Tavion Sanders', "Ja'Tavion Sanders"],
    ];
    for (const [espn, ours] of pairs) {
      expect([espn, normaliseName(espn)]).toEqual([espn, normaliseName(ours)]);
    }
  });
});

describe('matchExpertRankings', () => {
  it('matches real ESPN-style names including punctuation variants', () => {
    const pool = [
      player('Lamar Jackson'),
      player('C.J. Stroud'),
      player('Michael Penix Jr.'),
      player('Josh Allen'),
    ];
    const result = matchExpertRankings(pool, QB_TIERS_2026);
    expect(result.matchedCount).toBe(4);
    expect(result.byPlayerId.get('p-Lamar Jackson')!.tier).toBe(1);
    expect(result.byPlayerId.get('p-C.J. Stroud')!.tier).toBe(4);
    expect(result.byPlayerId.get('p-Michael Penix Jr.')!.tier).toBe(6);
  });

  it('never assigns a tier across positions on a name collision', () => {
    const result = matchExpertRankings([player('Josh Allen', 'WR')], QB_TIERS_2026);
    expect(result.matchedCount).toBe(0);
  });

  it('reports unmatched rankings rather than dropping them', () => {
    const result = matchExpertRankings([player('Lamar Jackson')], QB_TIERS_2026);
    expect(result.unmatched).toHaveLength(QB_TIERS_2026.players.length - 1);
    expect(result.explain.formula).toContain('unmatched');
  });
});

describe('rankingDisagreement', () => {
  it('is positive when our valuation likes a player more than the ranker', () => {
    const valued = { positionRank: 2 } as ValuedPlayer;
    const ranking = QB_TIERS_2026.players.find((p) => p.rank === 15)!;
    expect(rankingDisagreement(valued, ranking)).toBe(13);
  });
});

describe('guidanceForLeague', () => {
  it('shows superflex guidance in a 2-QB league and hides one-QB guidance', () => {
    const lines = guidanceForLeague(QB_TIERS_2026, DEFAULT_LEAGUE_CONFIG);
    expect(lines.some((l) => /superflex/i.test(l))).toBe(true);
    expect(lines.some((l) => l.startsWith('In a one-QB league'))).toBe(false);
  });

  it('keeps superflex advice that names the one-QB league only as a contrast', () => {
    // "In superflex, wait longer on TE than you would in a one-QB league" is advice for
    // this league. Dropping it because it mentions the other format loses two of his
    // superflex instructions in exactly the league they were written for.
    const lines = guidanceForLeague(QB_TIERS_2026, DEFAULT_LEAGUE_CONFIG);
    expect(lines.some((l) => /wait longer on TE/i.test(l))).toBe(true);
    expect(lines.some((l) => /a bust hurts far more/i.test(l))).toBe(true);

    const oneQbLines = guidanceForLeague(QB_TIERS_2026, oneQb);
    expect(oneQbLines.some((l) => /wait longer on TE/i.test(l))).toBe(false);
  });

  it('hides superflex guidance in a 1-QB league', () => {
    const lines = guidanceForLeague(QB_TIERS_2026, oneQb);
    expect(lines.some((l) => /superflex/i.test(l))).toBe(false);
    expect(lines.some((l) => /one-QB league/i.test(l))).toBe(true);
  });

  it('always keeps format-neutral guidance', () => {
    for (const config of [DEFAULT_LEAGUE_CONFIG, oneQb]) {
      expect(guidanceForLeague(QB_TIERS_2026, config).some((l) => /Big Tier Break/i.test(l))).toBe(
        true,
      );
    }
  });
});

describe('tierWindowObjective — two QBs by end of tier 3', () => {
  const inTier = (tier: number, count: number) =>
    QB_TIERS_2026.players.filter((p) => p.tier <= tier).slice(0, count);

  it('reports NO_DATA rather than MISSED when no rankings matched the pool', () => {
    // Sample data uses placeholder names, so nothing matches. That is an absence of data,
    // not a closed window, and must not read as an urgent roster problem.
    const objective = tierWindowObjective(DEFAULT_LEAGUE_CONFIG, 'QB', 3, {
      availableRankings: [],
      myRankings: [],
      teamsStillNeeding: 8,
      matchedAtPosition: 0,
    });
    expect(objective.status).toBe('NO_DATA');
    expect(objective.message).toContain('not a roster problem');
  });

  it('reports DONE once both QBs are inside the window', () => {
    const objective = tierWindowObjective(DEFAULT_LEAGUE_CONFIG, 'QB', 3, {
      availableRankings: [],
      myRankings: inTier(3, 2),
      teamsStillNeeding: 4,
      matchedAtPosition: 36,
    });
    expect(objective.status).toBe('DONE');
    expect(objective.owned).toBe(2);
  });

  it('reports ON_TRACK when supply comfortably exceeds demand', () => {
    const objective = tierWindowObjective(DEFAULT_LEAGUE_CONFIG, 'QB', 3, {
      availableRankings: inTier(3, 19),
      myRankings: [],
      teamsStillNeeding: 2,
      matchedAtPosition: 36,
    });
    expect(objective.status).toBe('ON_TRACK');
  });

  it('reports TIGHT when rivals could take the remaining window', () => {
    const objective = tierWindowObjective(DEFAULT_LEAGUE_CONFIG, 'QB', 3, {
      availableRankings: inTier(3, 5),
      myRankings: [],
      teamsStillNeeding: 4,
      matchedAtPosition: 36,
    });
    expect(objective.status).toBe('TIGHT');
    expect(objective.message).toContain('window is closing');
  });

  it('reports MISSED when the window cannot cover the shortfall', () => {
    const objective = tierWindowObjective(DEFAULT_LEAGUE_CONFIG, 'QB', 3, {
      availableRankings: inTier(3, 1),
      myRankings: [],
      teamsStillNeeding: 6,
      matchedAtPosition: 36,
    });
    expect(objective.status).toBe('MISSED');
  });

  it('advises against reaching once the window is gone entirely', () => {
    const objective = tierWindowObjective(DEFAULT_LEAGUE_CONFIG, 'QB', 3, {
      availableRankings: [],
      myRankings: [],
      teamsStillNeeding: 3,
      matchedAtPosition: 36,
    });
    expect(objective.status).toBe('MISSED');
    expect(objective.message).toContain('rather than reaching');
  });

  it('counts only players inside the tier window, not all QBs held', () => {
    const objective = tierWindowObjective(DEFAULT_LEAGUE_CONFIG, 'QB', 3, {
      availableRankings: inTier(3, 8),
      myRankings: QB_TIERS_2026.players.filter((p) => p.tier === 6).slice(0, 2),
      teamsStillNeeding: 2,
      matchedAtPosition: 36,
    });
    expect(objective.owned).toBe(0);
    expect(objective.status).not.toBe('DONE');
  });
});

describe('expertBoardValue', () => {
  it('scores his number one at the top of the scale', () => {
    const bowers = TE_TIERS_2026.players.find((p) => p.rank === 1)!;
    expect(expertBoardValue(TE_TIERS_2026, bowers).value).toBe(100);
  });

  it('orders players inside a tier without letting one overtake the tier above', () => {
    const [first, second, third] = [1, 2, 3].map(
      (rank) => expertBoardValue(TE_TIERS_2026, TE_TIERS_2026.players.find((p) => p.rank === rank)!).value,
    );
    expect(first).toBeGreaterThan(second!);
    expect(second).toBeGreaterThan(third!);

    // Warren is tier 1b — still tier 1, so still ahead of everyone in tier 2 and below.
    const warren = expertBoardValue(TE_TIERS_2026, TE_TIERS_2026.players.find((p) => p.rank === 4)!).value;
    const fannin = expertBoardValue(TE_TIERS_2026, TE_TIERS_2026.players.find((p) => p.rank === 5)!).value;
    expect(warren).toBeGreaterThan(fannin);
  });

  it('charges an extra drop to everyone below a Big Tier Break', () => {
    // Fannin is tier 2 and sits below the break; LaPorta is tier 3 and below it too.
    // The break costs Fannin a drop that a plain tier step would not.
    const warren = expertBoardValue(TE_TIERS_2026, TE_TIERS_2026.players.find((p) => p.rank === 4)!).value;
    const fannin = expertBoardValue(TE_TIERS_2026, TE_TIERS_2026.players.find((p) => p.rank === 5)!).value;
    expect(warren - fannin).toBeGreaterThan(TIER_STEP);

    const explain = expertBoardValue(TE_TIERS_2026, TE_TIERS_2026.players.find((p) => p.rank === 5)!);
    expect(explain.inputs.bigTierBreaksAbove).toBe(1);
    expect(explain.inputs.breakDrop).toBe(BIG_TIER_BREAK_PENALTY);
  });

  it('says in its derivation that the cross-positional comparison is ours, not his', () => {
    const chase = WR_TIERS_2026.players.find((p) => p.rank === 2)!;
    expect(expertBoardValue(WR_TIERS_2026, chase).formula).toMatch(
      /positional, so comparing him across positions is this app/i,
    );
  });

  it('never goes negative for the deepest player in the longest list', () => {
    const last = WR_TIERS_2026.players.find((p) => p.rank === 94)!;
    const score = expertBoardValue(WR_TIERS_2026, last).value;
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(50);
  });
});

describe('expertUpsideFor', () => {
  const wr = (rank: number) => WR_TIERS_2026.players.find((p) => p.rank === rank)!;

  it('gives his top tier the full ceiling and his last tier none', () => {
    const top = expertUpsideFor(WR_TIERS_2026, wr(1), 0, 8);
    const bottom = expertUpsideFor(WR_TIERS_2026, wr(94), 0, 8);
    expect(top.ceiling).toBe(1);
    expect(bottom.ceiling).toBe(0);
  });

  it('does not discriminate inside a tier, because he says they are equivalent', () => {
    // WR4 and WR8 are both tier 2 — same ceiling, whatever their ranks.
    expect(expertUpsideFor(WR_TIERS_2026, wr(4), 0, 8).ceiling).toBe(
      expertUpsideFor(WR_TIERS_2026, wr(8), 0, 8).ceiling,
    );
  });

  it('pays no discount to a player going right where he is ranked', () => {
    // WR30 with 29 receivers gone has slipped nowhere.
    expect(expertUpsideFor(WR_TIERS_2026, wr(30), 29, 8).discount).toBe(0);
    // Nor to one going early.
    expect(expertUpsideFor(WR_TIERS_2026, wr(30), 10, 8).discount).toBe(0);
  });

  it('pays a discount to a player the room has let slide past his rank', () => {
    const slipped = expertUpsideFor(WR_TIERS_2026, wr(30), 45, 8);
    expect(slipped.discount).toBeGreaterThan(0);
    // 16 past his rank on a 16-pick scale is the full discount.
    expect(expertUpsideFor(WR_TIERS_2026, wr(30), 45, 8).discount).toBe(1);
    expect(slipped.score).toBeGreaterThan(expertUpsideFor(WR_TIERS_2026, wr(30), 29, 8).score);
  });

  it('caps the discount rather than rewarding an absurd slide without limit', () => {
    expect(expertUpsideFor(WR_TIERS_2026, wr(30), 200, 8).discount).toBe(1);
  });

  it('says in its derivation that no projections or ADP were involved', () => {
    const explain = expertUpsideFor(WR_TIERS_2026, wr(30), 45, 8).explain;
    expect(explain.formula).toMatch(/no\s+projections and no ADP/i);
    expect(explain.sources).toContain('draft-board');
    expect(explain.sources.some((s) => s.startsWith('expert-rankings'))).toBe(true);
  });
});
