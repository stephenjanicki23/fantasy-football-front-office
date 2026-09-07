import { describe, expect, it } from 'vitest';
import { simulateDraft, makeRng, weightedChoice, ordinal, DEFAULT_SPREAD } from '@/domain/mock-draft';
import { teamOnClock } from '@/domain/opponent-model';
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
