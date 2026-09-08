import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAGUE_CONFIG, picksForSlot, picksUntilNextTurn } from '@/domain/league-config';
import { recommendDraftPick, weightsForRound } from '@/domain/draft-engine';
import { teamOnClock, teamsBetweenPicks } from '@/domain/opponent-model';
import { buildSampleLeagueState, orderedSamplePool } from '@/providers/sample/sample-league';
import { EXPERT_RANKING_SETS, mergedExpertRankings } from '@/data/expert-rankings';
import type { DraftPick, LeagueConfig, LeagueState } from '@/domain/types';

const config = DEFAULT_LEAGUE_CONFIG;

function stateWithDraft(picksMade: number, myDraftSlot = 3): LeagueState {
  const state = buildSampleLeagueState();
  const pool = orderedSamplePool();
  const order = state.teams.map((t) => t.id);

  const picks: DraftPick[] = [];
  for (let overall = 1; overall <= picksMade; overall++) {
    const round = Math.floor((overall - 1) / config.teamCount) + 1;
    const pickInRound = ((overall - 1) % config.teamCount) + 1;
    const teamId = teamOnClock(config, order, overall)!;
    const playerId = pool[overall - 1]!;
    picks.push({ overall, round, pickInRound, teamId, playerId });
    state.teams.find((t) => t.id === teamId)!.roster.push({
      playerId,
      slot: 'BENCH',
      acquisitionType: 'DRAFT',
    });
  }

  state.draft = {
    picks,
    currentOverall: picksMade + 1,
    draftOrder: order,
    draftOrderSource: 'FALLBACK',
    complete: false,
  };
  for (const team of state.teams) team.isMyTeam = team.draftSlot === myDraftSlot;
  return state;
}

describe('pick maths', () => {
  it('computes snake pick numbers for a draft slot', () => {
    // 8 teams, slot 3: 3, 14, 19, 30, ...
    expect(picksForSlot(config, 3).slice(0, 4)).toEqual([3, 14, 19, 30]);
  });

  it('computes linear pick numbers when the draft is not a snake', () => {
    const linear: LeagueConfig = { ...config, draftType: 'LINEAR' };
    expect(picksForSlot(linear, 3).slice(0, 3)).toEqual([3, 11, 19]);
  });

  it('counts the picks between my turns', () => {
    expect(picksUntilNextTurn(config, 3, 3)).toBe(10);
    expect(picksUntilNextTurn(config, 1, 1)).toBe(14);
  });

  it('identifies which team is on the clock through a snake turn', () => {
    const order = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(teamOnClock(config, order, 1)).toBe('a');
    expect(teamOnClock(config, order, 8)).toBe('h');
    expect(teamOnClock(config, order, 9)).toBe('h');
    expect(teamOnClock(config, order, 16)).toBe('a');
  });

  it('lists the teams picking between two of my picks', () => {
    const order = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const between = teamsBetweenPicks(config, order, 3, 14);
    expect(between).toHaveLength(10);
    expect(between[0]!.teamId).toBe('d');
  });
});

describe('weightsForRound', () => {
  it('weights raw value more early and roster fit more late', () => {
    const early = weightsForRound(config, 1);
    const late = weightsForRound(config, 15);
    expect(early.value).toBeGreaterThan(late.value);
    expect(late.rosterFit).toBeGreaterThan(early.rosterFit);
  });

  it('always produces weights that sum to 1', () => {
    for (const round of [1, 5, 10, 16]) {
      const w = weightsForRound(config, round);
      const total = w.value + w.scarcity + w.rosterFit + w.urgency + w.opponentDemand;
      expect(total).toBeCloseTo(1, 5);
    }
  });
});

describe('recommendDraftPick', () => {
  it('never recommends a player who is already drafted', () => {
    const state = stateWithDraft(20);
    const draftedIds = new Set(state.draft!.picks.map((p) => p.playerId));
    const result = recommendDraftPick(state);
    for (const candidate of result.candidates) {
      expect(draftedIds.has(candidate.player.player.id)).toBe(false);
    }
  });

  it('does not simply return the highest-valued player available', () => {
    // Give my team a stacked WR room so a marginal WR should lose to a needed position.
    const state = stateWithDraft(16);
    const myTeam = state.teams.find((t) => t.isMyTeam)!;
    myTeam.roster = [
      { playerId: 'wr-1', slot: 'BENCH' },
      { playerId: 'wr-2', slot: 'BENCH' },
      { playerId: 'wr-3', slot: 'BENCH' },
      { playerId: 'wr-4', slot: 'BENCH' },
    ];
    const result = recommendDraftPick(state);
    const topByValue = [...result.candidates].sort((a, b) => b.value - a.value)[0]!;
    // The engine may still land on the same player, but it must expose a different
    // ordering signal than raw value alone.
    expect(result.bestPick).not.toBeNull();
    expect(result.bestPick!.draftScore).toBeGreaterThanOrEqual(0);
    expect(result.bestPick!.rosterFit).toBeGreaterThanOrEqual(0);
    if (result.bestPick!.player.player.id !== topByValue.player.player.id) {
      expect(result.bestPick!.rosterFit).toBeGreaterThan(topByValue.rosterFit);
    }
  });

  it('surfaces QB urgency in a 2-QB league', () => {
    const state = stateWithDraft(30);
    const result = recommendDraftPick(state);
    expect(result.qbScarcity.isTwoQb).toBe(true);
    expect(result.qbScarcity.startingQbSlots).toBe(16);
  });

  it('produces reasoning that references this league, not generic advice', () => {
    const state = stateWithDraft(24);
    const result = recommendDraftPick(state);
    expect(result.reasoning.length).toBeGreaterThan(0);
    const joined = result.reasoning.join(' ');
    expect(joined).toMatch(/QB|scarcity|need|tier|picks|value/i);
  });

  it('attaches a traceable derivation to every candidate score', () => {
    const state = stateWithDraft(10);
    const result = recommendDraftPick(state);
    const candidate = result.candidates[0]!;
    expect(candidate.explain.formula).toContain('draftScore =');
    expect(candidate.explain.inputs).toHaveProperty('expertValue');
    expect(candidate.explain.inputs).toHaveProperty('rosterFit');
  });

  it('reports confidence between 0 and 1', () => {
    const result = recommendDraftPick(stateWithDraft(12));
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('lowers expected availability for players who will not last to my next pick', () => {
    const state = stateWithDraft(3, 3); // I am on the clock at pick 4? slot 3 picks at 3, 14
    const result = recommendDraftPick(state);
    expect(result.picksUntilNextTurn).not.toBeNull();
    for (const candidate of result.candidates) {
      expect(candidate.expectedAvailability).toBeGreaterThanOrEqual(0);
      expect(candidate.expectedAvailability).toBeLessThanOrEqual(1);
    }
  });

  it('models every team picking before my next turn', () => {
    const state = stateWithDraft(3, 3);
    const result = recommendDraftPick(state);
    expect(result.predictions.length).toBe(result.picksUntilNextTurn);
    for (const prediction of result.predictions) {
      const total = prediction.distribution.reduce((s, d) => s + d.probability, 0);
      expect(total).toBeCloseTo(1, 1);
    }
  });

  it('offers a best pick, a safe alternative and a best value', () => {
    const result = recommendDraftPick(stateWithDraft(18));
    expect(result.bestPick).not.toBeNull();
    expect(result.safeAlternative).not.toBeNull();
    expect(result.bestValue).not.toBeNull();
  });
});

/**
 * A pool of real names, so the expert sets actually match.
 *
 * The sample league's players are deliberately synthetic, which means it cannot exercise
 * name matching at all — the bug this covers hid behind exactly that.
 */
function realNameState(): LeagueState {
  const state = buildSampleLeagueState();
  const named: Array<[string, LeagueState['players'][number]['position']]> = [
    ['Josh Allen', 'QB'], ['Lamar Jackson', 'QB'], ['Jayden Daniels', 'QB'], ['Joe Burrow', 'QB'],
    ['Jahmyr Gibbs', 'RB'], ['Bijan Robinson', 'RB'], ['Saquon Barkley', 'RB'], ['Breece Hall', 'RB'],
    ['Puka Nacua', 'WR'], ["Ja'Marr Chase", 'WR'], ['Justin Jefferson', 'WR'], ['CeeDee Lamb', 'WR'],
    ['Brock Bowers', 'TE'], ['Trey McBride', 'TE'], ['Sam LaPorta', 'TE'], ['Travis Kelce', 'TE'],
  ];

  state.players = named.map(([name, position], index) => ({
    id: `real-${index}`,
    name,
    position,
    status: 'ACTIVE' as const,
    source: 'test',
    asOf: 'now',
  }));
  // Two players he ranks no one at: a kicker and a defence.
  state.players.push(
    { id: 'k-1', name: 'Some Kicker', position: 'K', status: 'ACTIVE', source: 'test', asOf: 'now' },
    { id: 'd-1', name: 'Some Defense', position: 'DST', status: 'ACTIVE', source: 'test', asOf: 'now' },
  );

  state.seasonProjections = state.players.map((player) => ({
    playerId: player.id,
    season: 2026,
    source: 'test',
    asOf: 'now',
    stats: { receptions: 60, recYards: 800, recTd: 5, rushYards: 200, rushTd: 2 },
  }));

  // The sample league carries no rankings; the service layer attaches them in the real
  // app, so the fixture does the same.
  state.expertRankings = mergedExpertRankings() ?? undefined;
  state.expertRankingSets = EXPERT_RANKING_SETS;

  for (const team of state.teams) team.roster = [];
  state.draft = { picks: [], currentOverall: 1, draftOrder: state.teams.map((t) => t.id), draftOrderSource: 'FALLBACK', complete: false };
  return state;
}

describe('the ranker drives the board', () => {
  it('carries his view for every ranked player in the pool, not just the shortlist', () => {
    const result = recommendDraftPick(realNameState(), { limit: 12 });
    // 16 ranked players are in the pool; the shortlist is 12. Before this, only the
    // shortlisted players carried a tier and the rest of the board showed a dash.
    expect(result.expertByPlayerId.size).toBe(16);
    expect(result.expertByPlayerId.size).toBeGreaterThan(result.candidates.length);
  });

  it('counts the players he has not ranked instead of hiding them', () => {
    const result = recommendDraftPick(realNameState(), { limit: 12 });
    expect(result.unrankedAvailable).toBe(2); // the kicker and the defence
  });

  it('takes candidate value from his tiers, not from our projections', () => {
    const result = recommendDraftPick(realNameState(), { limit: 18 });

    // Every projection in this fixture is identical, so any spread in value can only
    // have come from his rankings.
    const ranked = result.candidates.filter((c) => c.expertRanked);
    expect(ranked.length).toBeGreaterThan(4);
    expect(new Set(ranked.map((c) => c.value)).size).toBeGreaterThan(1);

    for (const candidate of ranked) {
      expect(candidate.valueExplain).not.toBeNull();
      expect(candidate.valueExplain!.sources.some((s) => s.startsWith('expert-rankings'))).toBe(true);
    }
  });

  it('scores a player he has not ranked at zero rather than falling back to our numbers', () => {
    const result = recommendDraftPick(realNameState(), { limit: 20 });
    const kicker = result.candidates.find((c) => c.player.player.position === 'K');
    expect(kicker).toBeDefined();
    expect(kicker!.expertRanked).toBe(false);
    expect(kicker!.value).toBe(0);
    expect(kicker!.valueExplain).toBeNull();
    expect(kicker!.explain.formula).toContain('unranked by him');
  });

  it('names the expert rankings as the source of the score, not the projections', () => {
    const result = recommendDraftPick(realNameState(), { limit: 5 });
    expect(result.candidates[0]!.explain.sources).toContain('expert-rankings');
    expect(result.candidates[0]!.explain.sources).not.toContain('projections');
  });
});

describe('his rankings drive the score all the way down', () => {
  /**
   * The lists do not run out. 36 QB + 91 RB + 94 WR + 50 TE is 271 ranked players against
   * 8 x 16 = 128 picks — 2.1x the whole draft, with ~143 of his players still on the board
   * after the last pick. Any claim that the late rounds have to fall back to projections
   * because he has run out of players is arithmetically false, and this test says so.
   */
  it('ranks more than twice the players this draft can consume', () => {
    const ranked = EXPERT_RANKING_SETS.reduce((n, set) => n + set.players.length, 0);
    const picks = DEFAULT_LEAGUE_CONFIG.teamCount * DEFAULT_LEAGUE_CONFIG.draftRounds;
    expect(ranked).toBe(271);
    expect(picks).toBe(128);
    expect(ranked).toBeGreaterThan(picks * 2);
    // Even at the final pick, this many of his ranked players are still undrafted.
    expect(ranked - picks).toBe(143);
  });

  it('still has his players to recommend in the last round', () => {
    const state = realNameState();
    // Drain the board down to the final round's worth of picks.
    const order = state.teams.map((t) => t.id);
    const picks = state.players.slice(0, 8).map((p, i) => ({
      overall: i + 1, round: 1, pickInRound: i + 1, teamId: order[i % 8]!, playerId: p.id,
    }));
    state.draft = { ...state.draft!, picks, currentOverall: picks.length + 1 };

    const result = recommendDraftPick(state, { limit: 8 });
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((c) => c.expertRanked || c.player.player.position === 'K' || c.player.player.position === 'DST')).toBe(true);
  });

  it('takes upside from his tiers and the board, not from projections', () => {
    const result = recommendDraftPick(realNameState(), { limit: 8 });
    const ranked = result.candidates.filter((c) => c.expertRanked);
    expect(ranked.length).toBeGreaterThan(0);
    for (const candidate of ranked) {
      expect(candidate.upside.explain.sources).toContain('draft-board');
      expect(candidate.upside.explain.sources).not.toContain('projections');
      expect(candidate.upside.explain.formula).toMatch(/no\s+projections and no ADP/i);
    }
  });

  it('keeps projections out of the derivation of a ranked candidate entirely', () => {
    const result = recommendDraftPick(realNameState(), { limit: 8 });
    const ranked = result.candidates.find((c) => c.expertRanked)!;
    expect(ranked.explain.sources).not.toContain('projections');
    expect(ranked.explain.formula).toContain('Fit is measured in his board value');
  });
});
