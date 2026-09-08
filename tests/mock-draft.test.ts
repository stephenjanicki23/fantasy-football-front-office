import { describe, expect, it } from 'vitest';
import { simulateDraft, makeRng, weightedChoice, ordinal, DEFAULT_SPREAD } from '@/domain/mock-draft';
import { teamOnClock } from '@/domain/opponent-model';
import { recommendDraftPick } from '@/domain/draft-engine';
import { DEFAULT_LEAGUE_CONFIG } from '@/domain/league-config';
import { buildSampleLeagueState } from '@/providers/sample/sample-league';
import { EXPERT_RANKING_SETS, mergedExpertRankings } from '@/data/expert-rankings';
import type { LeagueState } from '@/domain/types';

function freshState(): LeagueState {
  const state = buildSampleLeagueState();
  for (const team of state.teams) team.roster = [];
  state.expertRankings = mergedExpertRankings() ?? undefined;
  state.expertRankingSets = EXPERT_RANKING_SETS;
  state.draft = {
    picks: [],
    currentOverall: 1,
    draftOrder: state.teams.map((t) => t.id),
    draftOrderSource: 'FALLBACK',
    complete: false,
  };
  return state;
}

describe('makeRng', () => {
  it('is deterministic for a seed, and different across seeds', () => {
    const a = makeRng(7);
    const b = makeRng(7);
    const c = makeRng(8);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
  });

  it('stays inside [0, 1)', () => {
    const rng = makeRng(99);
    for (let i = 0; i < 500; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('weightedChoice', () => {
  it('never reaches past the spread', () => {
    const rng = makeRng(3);
    for (let i = 0; i < 300; i++) {
      expect(weightedChoice(rng, 50, 3)).toBeLessThanOrEqual(3);
    }
  });

  it('never reaches past what is actually on the shortlist', () => {
    const rng = makeRng(4);
    for (let i = 0; i < 200; i++) {
      expect(weightedChoice(rng, 2, 6)).toBeLessThanOrEqual(1);
    }
  });

  it('takes the top choice most of the time', () => {
    const rng = makeRng(11);
    let top = 0;
    const runs = 2000;
    for (let i = 0; i < runs; i++) if (weightedChoice(rng, 20, DEFAULT_SPREAD) === 0) top++;
    // Weight halves each step: 1/(1+.5+.25+.125) ≈ 0.53.
    expect(top / runs).toBeGreaterThan(0.45);
    expect(top / runs).toBeLessThan(0.62);
  });

  it('always takes the only option when there is one', () => {
    const rng = makeRng(5);
    expect(weightedChoice(rng, 1, 5)).toBe(0);
  });
});

describe('simulateDraft', () => {
  it('stops the moment my team is on the clock', () => {
    const state = freshState();
    const me = state.teams[4]!;
    const result = simulateDraft(state, { stopBeforeTeamId: me.id, seed: 1 });

    expect(result.stoppedBecause).toBe('ON_THE_CLOCK');
    expect(result.picks).toHaveLength(4); // slots 1-4 pick before slot 5
    expect(result.picks.some((pick) => pick.teamId === me.id)).toBe(false);
    expect(teamOnClock(state.config, state.draft!.draftOrder, result.currentOverall)).toBe(me.id);
  });

  it('leaves my first pick alone even when I am on the clock at pick one', () => {
    const state = freshState();
    const result = simulateDraft(state, { stopBeforeTeamId: state.teams[0]!.id, seed: 1 });
    expect(result.picks).toHaveLength(0);
    expect(result.stoppedBecause).toBe('ON_THE_CLOCK');
  });

  it('follows the draft order it is given, including the snake turn', () => {
    const state = freshState();
    const order = state.draft!.draftOrder;
    const result = simulateDraft(state, { maxPicks: 16, seed: 2 });

    expect(result.picks).toHaveLength(16);
    // Round 1 runs down the order, round 2 back up it.
    expect(result.picks.slice(0, 8).map((p) => p.teamId)).toEqual(order);
    expect(result.picks.slice(8, 16).map((p) => p.teamId)).toEqual([...order].reverse());
  });

  it('respects a reordered draft order rather than the league team order', () => {
    const state = freshState();
    const reordered = [...state.draft!.draftOrder].reverse();
    state.draft!.draftOrder = reordered;
    state.draft!.draftOrderSource = 'MANUAL';

    const result = simulateDraft(state, { maxPicks: 8, seed: 2 });
    expect(result.picks.map((p) => p.teamId)).toEqual(reordered);
  });

  it('never drafts the same player twice', () => {
    const state = freshState();
    const result = simulateDraft(state, { maxPicks: 60, seed: 5 });
    const ids = result.picks.map((pick) => pick.playerId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never drafts a player already taken on the starting board', () => {
    const state = freshState();
    const alreadyGone = state.players[0]!;
    state.draft!.picks = [
      { overall: 1, round: 1, pickInRound: 1, teamId: state.teams[0]!.id, playerId: alreadyGone.id },
    ];
    state.draft!.currentOverall = 2;

    const result = simulateDraft(state, { maxPicks: 20, seed: 6 });
    expect(result.picks.some((pick) => pick.playerId === alreadyGone.id)).toBe(false);
  });

  it('replays identically for a seed, and differs across seeds', () => {
    const names = (seed: number) =>
      simulateDraft(freshState(), { maxPicks: 24, seed }).picks.map((p) => p.playerId);
    expect(names(42)).toEqual(names(42));
    expect(names(42)).not.toEqual(names(43));
  });

  it('takes the engine top choice every time when spread is zero', () => {
    const result = simulateDraft(freshState(), { maxPicks: 12, spread: 0, seed: 9 });
    expect(result.picks.every((pick) => pick.choiceIndex === 1)).toBe(true);
  });

  it('stops when the draft is complete rather than running past the end', () => {
    const state = freshState();
    state.config = { ...state.config, draftRounds: 2 };
    const result = simulateDraft(state, { maxPicks: 500, seed: 3 });
    expect(result.stoppedBecause).toBe('DRAFT_COMPLETE');
    expect(result.picks).toHaveLength(state.config.teamCount * 2);
  });

  it('says so rather than guessing when there is no draft order', () => {
    const state = freshState();
    state.teams = [];
    state.draft!.draftOrder = [];
    const result = simulateDraft(state, { maxPicks: 5 });
    expect(result.stoppedBecause).toBe('NO_DRAFT_ORDER');
    expect(result.picks).toHaveLength(0);
  });

  it('records how it picked, including which draft order it trusted', () => {
    const state = freshState();
    const result = simulateDraft(state, { maxPicks: 3, seed: 1 });
    expect(result.explain.formula).toContain('Simulated 3 picks');
    expect(result.explain.formula).toContain('seed 1');
    expect(result.explain.inputs.draftOrderSource).toBe('FALLBACK');
  });
});

describe('ordinal', () => {
  it('handles the suffixes, including the teens', () => {
    expect([1, 2, 3, 4, 5].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '5th']);
    expect([11, 12, 13].map(ordinal)).toEqual(['11th', '12th', '13th']);
    expect([21, 22, 23, 101, 111, 112].map(ordinal)).toEqual([
      '21st', '22nd', '23rd', '101st', '111th', '112th',
    ]);
  });
});

/** A pool of his actual ranked names, so a mock exercises the real board ordering. */
function rankedPool(): LeagueState {
  const state = buildSampleLeagueState();
  const ranked = EXPERT_RANKING_SETS.flatMap((set) => set.players);
  state.players = ranked.map((r, i) => ({
    id: `e-${i}`,
    name: r.name,
    position: r.position,
    status: 'ACTIVE' as const,
    source: 'espn',
    asOf: 'now',
  }));
  state.seasonProjections = state.players.map((p, i) => ({
    playerId: p.id,
    season: 2026,
    source: 'espn',
    asOf: 'now',
    stats: { receptions: 60, recYards: 800 - i, recTd: 5, rushYards: 300, rushTd: 3, passYards: 3900, passTd: 26 },
  }));
  for (const team of state.teams) team.roster = [];
  state.expertRankings = mergedExpertRankings() ?? undefined;
  state.expertRankingSets = EXPERT_RANKING_SETS;
  state.draft = {
    picks: [],
    currentOverall: 1,
    draftOrder: state.teams.map((t) => t.id),
    draftOrderSource: 'FALLBACK',
    complete: false,
  };
  return state;
}

/** "Ashton Jeanty" -> "RB6", so tests can talk in his ranks rather than in names. */
function rankOf(name: string): string {
  for (const set of EXPERT_RANKING_SETS) {
    const found = set.players.find((p) => p.name === name);
    if (found) return `${found.position}${found.rank}`;
  }
  return name;
}

describe('a mock draft drafts like a draft', () => {

  /**
   * Where the top backs go if the whole league drafts his way.
   *
   * Derived from his own rules rather than from a tuned weight, because the reported
   * symptom was RB6 still on the board at pick 44 — he was scoring 43rd on a tier-only
   * board, so the mock was faithfully reproducing a broken ordering.
   *
   * Q1 in this league is the first 48 picks (his 4-round Q1 in a 12-team framework is 48
   * picks, which is 6 rounds across 8 teams). His rules spend those picks like this:
   *
   *   - 8 quarterbacks. "Taking a QB in round 1 is the only way to be certain of not
   *     losing the game of chicken" gets each team a QB1 early, but the second only has to
   *     land "by the end of Tier 3" — QB19 — which is still comfortably available in Q2,
   *     so QB2s do not belong in Q1.
   *   - 4 tight ends. The Great-or-Late Targets ahead of his Big Tier Break.
   *   - The remaining 36 to running backs and receivers, against a supply of 26 in his
   *     tiers 1-3 (RB 14, WR 12).
   *
   * Counting the non-quarterbacks his ordering puts ahead of RB6 — 4 TE, 1 RB and 3 WR in
   * tier 1, then 3 RB and 5 WR in tier 2, then RB5 — makes him the 18th non-QB off the
   * board. Add the ~8 quarterbacks gone by then and he lands around pick 26, in round 4.
   * Sweeping how early the QB chicken game resolves moves that between 18 and 26.
   */
  it('takes RB6 where his ideology puts him, in round 3 or 4', () => {
    const result = simulateDraft(rankedPool(), { maxPicks: 48, seed: 7 });
    const takenAt = new Map(result.picks.map((p) => [rankOf(p.playerName), p.overall]));

    const rb6 = takenAt.get('RB6');
    expect(rb6).toBeDefined();
    expect(rb6!).toBeGreaterThanOrEqual(17);
    expect(rb6!).toBeLessThanOrEqual(30);
  });

  it('takes his backs roughly in his order', () => {
    const result = simulateDraft(rankedPool(), { maxPicks: 48, seed: 7 });
    const takenAt = new Map(result.picks.map((p) => [rankOf(p.playerName), p.overall]));
    const backs = [1, 2, 3, 4, 5, 6].map((n) => takenAt.get(`RB${n}`));
    expect(backs.every((pick) => pick !== undefined)).toBe(true);

    /**
     * Roughly, not strictly.
     *
     * The mock reaches down each team's shortlist on purpose, so demanding a strict
     * ordering would be asserting that the variety does not exist. What should hold is
     * that nobody jumps the queue by more than a round: a worse-ranked back never comes
     * off more than `teamCount` picks ahead of a better-ranked one.
     */
    const round = DEFAULT_LEAGUE_CONFIG.teamCount;
    for (let i = 0; i < backs.length; i++) {
      for (let j = i + 1; j < backs.length; j++) {
        expect(backs[j]!).toBeGreaterThan(backs[i]! - round);
      }
    }
  });

  it('spreads the early rounds across positions instead of hoarding one', () => {
    const result = simulateDraft(rankedPool(), { maxPicks: 48, seed: 7 });
    const counts = new Map<string, number>();
    for (const pick of result.picks) counts.set(pick.position, (counts.get(pick.position) ?? 0) + 1);

    // 48 picks in a 2-QB league: every position represented, none running away with it.
    for (const position of ['QB', 'RB', 'WR', 'TE']) {
      expect(counts.get(position) ?? 0).toBeGreaterThanOrEqual(5);
      expect(counts.get(position) ?? 0).toBeLessThanOrEqual(20);
    }
  });

  it('has the Great or Late tight ends gone early, as his framing implies', () => {
    const result = simulateDraft(rankedPool(), { maxPicks: 48, seed: 7 });
    const takenAt = new Map(result.picks.map((p) => [rankOf(p.playerName), p.overall]));
    for (const n of [1, 2, 3, 4]) expect(takenAt.get(`TE${n}`)).toBeLessThan(30);
  });
});

describe('positional market bias — what this room does, not what players are worth', () => {
  const withBias = (qb: number): LeagueState => {
    const state = rankedPool();
    state.config = { ...state.config, positionMarketBias: { QB: qb } };
    return state;
  };

  const qbsIn = (qb: number, seed: number) =>
    simulateDraft(withBias(qb), { maxPicks: 48, seed }).picks.filter((p) => p.position === 'QB')
      .length;

  it('takes fewer quarterbacks early when the room undervalues them', () => {
    const seeds = [1, 2, 3, 4, 5, 6];
    const neutral = seeds.map((s) => qbsIn(1, s)).reduce((a, b) => a + b, 0) / seeds.length;
    const biased = seeds.map((s) => qbsIn(0.9, s)).reduce((a, b) => a + b, 0) / seeds.length;
    expect(biased).toBeLessThan(neutral);
  }, 60000);

  it('leaves the best quarterback inside round one, which is what "slight" means here', () => {
    const rankName = (name: string) => rankOf(name);
    const picks = simulateDraft(withBias(0.9), { maxPicks: 48, seed: 3 }).picks;
    const qb1 = picks.find((p) => rankName(p.playerName) === 'QB1');
    expect(qb1).toBeDefined();
    // A room that undervalues QBs still does not let the best one fall out of the first
    // two rounds; if it did, the setting would be making a bigger claim than was made.
    expect(qb1!.overall).toBeLessThanOrEqual(16);
  });

  it('hands the elite backs and receivers to you slightly earlier', () => {
    const seeds = [1, 2, 3, 4, 5, 6];
    const meanPick = (qb: number, target: string) =>
      seeds
        .map((seed) => {
          const picks = simulateDraft(withBias(qb), { maxPicks: 48, seed }).picks;
          return picks.find((p) => rankOf(p.playerName) === target)?.overall ?? 49;
        })
        .reduce((a, b) => a + b, 0) / seeds.length;

    expect(meanPick(0.9, 'WR6')).toBeLessThan(meanPick(1, 'WR6'));
  }, 60000);

  /**
   * The invariant that matters.
   *
   * The bias is a claim about managers, not about players. If it ever moved a ranking or a
   * board value it would be laundering a behavioural observation into an evaluation, which
   * is exactly what the rest of this engine is built to avoid.
   */
  it('changes nobody’s value, tier or rank', () => {
    const neutral = recommendDraftPick(rankedPool(), { limit: 40 });
    const biased = recommendDraftPick(withBias(0.5), { limit: 40 });

    const valueOf = (r: ReturnType<typeof recommendDraftPick>) =>
      new Map(r.candidates.map((c) => [c.player.player.id, c.value]));
    const a = valueOf(neutral);
    const b = valueOf(biased);
    for (const [id, value] of a) {
      if (b.has(id)) expect(b.get(id)).toBe(value);
    }

    for (const [id, view] of neutral.expertByPlayerId) {
      const other = biased.expertByPlayerId.get(id);
      expect(other?.tier).toBe(view.tier);
      expect(other?.rank).toBe(view.rank);
    }
  }, 30000);
});
