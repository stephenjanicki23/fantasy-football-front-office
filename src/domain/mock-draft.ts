import { recommendDraftPick } from './draft-engine';
import { pickCoordinates } from './league-config';
import { teamOnClock } from './opponent-model';
import { explained, type Explained } from './explain';
import type { DraftPick, LeagueState } from './types';

/**
 * Mock draft simulation.
 *
 * Every team but yours is picked by the same engine that advises you, running for that
 * team: its roster, its needs, its turn. That is the honest way to do it — an opponent
 * model that drafts by a different and better rule than the one we recommend to you would
 * make your own board look good for no reason.
 *
 * Simulated picks are opinion compounded on opinion, and are labelled as such everywhere
 * they surface. They are not a prediction of what your leaguemates will do.
 */

export type StopReason =
  | 'ON_THE_CLOCK'
  | 'MAX_PICKS'
  | 'DRAFT_COMPLETE'
  | 'NO_PLAYERS'
  | 'NO_DRAFT_ORDER';

export interface SimulatedPick {
  overall: number;
  round: number;
  pickInRound: number;
  teamId: string;
  teamName: string;
  playerId: string;
  playerName: string;
  position: string;
  /** Where in the shortlist this pick came from — 1 means the engine's top choice. */
  choiceIndex: number;
  rationale: string;
}

export interface SimulationResult {
  picks: SimulatedPick[];
  stoppedBecause: StopReason;
  /** Overall pick number the board now sits on. */
  currentOverall: number;
  explain: Explained<number>;
}

export interface SimulationOptions {
  /** Stop as soon as this team is on the clock. Usually your team. */
  stopBeforeTeamId?: string;
  /** Never simulate more than this many picks in one call. */
  maxPicks?: number;
  /**
   * How far down the shortlist an opponent will reach, 0 meaning always the top choice.
   *
   * A mock where every team always takes the consensus best player is the least useful
   * kind: it never shows you the run that actually costs you a player. Spread is applied
   * from a seeded generator so a given mock replays identically.
   */
  spread?: number;
  seed?: number;
}

export const DEFAULT_SPREAD = 3;
export const DEFAULT_MAX_PICKS = 200;

/** Deterministic small PRNG (mulberry32), so a seeded mock is reproducible. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick an index into the shortlist, biased hard towards the top.
 *
 * Weight halves with each step down, so the engine's top choice is taken about half the
 * time, the second about a quarter, and the tail is rare — roughly how a drafted board
 * actually behaves, without ever reaching for someone absurd.
 */
export function weightedChoice(rng: () => number, count: number, spread: number): number {
  const usable = Math.max(1, Math.min(count, spread + 1));
  const weights: number[] = [];
  let total = 0;
  for (let i = 0; i < usable; i++) {
    const weight = 1 / 2 ** i;
    weights.push(weight);
    total += weight;
  }
  let roll = rng() * total;
  for (let i = 0; i < usable; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return i;
  }
  return 0;
}

export function simulateDraft(
  state: LeagueState,
  options: SimulationOptions = {},
): SimulationResult {
  const {
    stopBeforeTeamId,
    maxPicks = DEFAULT_MAX_PICKS,
    spread = DEFAULT_SPREAD,
    seed = 1,
  } = options;

  const config = state.config;
  const draftOrder = state.draft?.draftOrder?.length
    ? state.draft.draftOrder
    : state.teams.map((team) => team.id);
  const teamName = new Map(state.teams.map((team) => [team.id, team.name]));
  const totalPicks = config.teamCount * config.draftRounds;
  const rng = makeRng(seed);

  const picks: DraftPick[] = [...(state.draft?.picks ?? [])];
  const taken = new Set(picks.map((pick) => pick.playerId).filter(Boolean) as string[]);
  const made: SimulatedPick[] = [];

  let overall = state.draft?.currentOverall ?? picks.length + 1;
  let stoppedBecause: StopReason = 'MAX_PICKS';

  if (draftOrder.length === 0) {
    return {
      picks: [],
      stoppedBecause: 'NO_DRAFT_ORDER',
      currentOverall: overall,
      explain: explained(0, { overall }, 'No draft order is known, so there is nobody to pick for.', [
        'league-config',
      ]),
    };
  }

  for (let step = 0; step < maxPicks; step++) {
    if (overall > totalPicks) {
      stoppedBecause = 'DRAFT_COMPLETE';
      break;
    }
    const onClock = teamOnClock(config, draftOrder, overall);
    if (!onClock) {
      stoppedBecause = 'NO_DRAFT_ORDER';
      break;
    }
    if (stopBeforeTeamId && onClock === stopBeforeTeamId) {
      stoppedBecause = 'ON_THE_CLOCK';
      break;
    }

    const { round, pickInRound } = pickCoordinates(config, overall);
    const stepState = buildStateAt(state, picks, overall, draftOrder);
    const recommendation = recommendDraftPick(stepState, { teamId: onClock, limit: 8 });
    const shortlist = recommendation.candidates.filter(
      (candidate) => !taken.has(candidate.player.player.id),
    );

    if (shortlist.length === 0) {
      stoppedBecause = 'NO_PLAYERS';
      break;
    }

    /**
     * Simulated teams draft with this room's taste, not the strategy's.
     *
     * The shortlist comes from the same engine that advises you, which ranks by the
     * strategy. If the league reliably lets a position slide, its teams have to be
     * modelled doing that or the mock hands you a draft you will never actually sit in.
     * Only the ordering of an opponent's shortlist moves; no player's value changes.
     */
    const biased = [...shortlist].sort(
      (a, b) =>
        b.draftScore * (config.positionMarketBias?.[b.player.player.position] ?? 1) -
        a.draftScore * (config.positionMarketBias?.[a.player.player.position] ?? 1),
    );

    const index = weightedChoice(rng, biased.length, spread);
    const chosen = biased[index]!;
    const player = chosen.player.player;

    const pick: SimulatedPick = {
      overall,
      round,
      pickInRound,
      teamId: onClock,
      teamName: teamName.get(onClock) ?? onClock,
      playerId: player.id,
      playerName: player.name,
      position: player.position,
      choiceIndex: index + 1,
      rationale: chosen.expert
        ? `${player.position}${chosen.expert.rank}, his tier ${chosen.expert.tier}` +
          // Worth seeing when a simulated team takes someone he marks as a Fade: the
          // label is displayed, never scored (see the note in the README), so it turning
          // up here is information rather than a contradiction.
          `${chosen.expert.designation ? ` (his ${chosen.expert.designation})` : ''}` +
          `${index === 0 ? '' : ` — ${ordinal(index + 1)} on this team's shortlist`}`
        : `Outside the ranking lists${index === 0 ? '' : `, ${ordinal(index + 1)} on the shortlist`}`,
    };

    made.push(pick);
    picks.push({
      overall,
      round,
      pickInRound,
      teamId: onClock,
      playerId: player.id,
    });
    taken.add(player.id);
    overall += 1;
  }

  return {
    picks: made,
    stoppedBecause,
    currentOverall: overall,
    explain: explained(
      made.length,
      {
        simulated: made.length,
        stoppedBecause,
        spread,
        seed,
        currentOverall: overall,
        draftOrderSource: state.draft?.draftOrderSource ?? 'FALLBACK',
      },
      `Simulated ${made.length} pick${made.length === 1 ? '' : 's'} and stopped because ` +
        `${describeStop(stoppedBecause)}. Each was made by running the same recommendation ` +
        `engine for the team on the clock, then taking from its top ${spread + 1} with a ` +
        `seeded bias towards the top choice (seed ${seed}). Draft order came from ` +
        `${state.draft?.draftOrderSource ?? 'FALLBACK'}.`,
      ['expert-rankings', 'rosters', 'league-config'],
    ),
  };
}

/** 1st, 2nd, 3rd, 4th — the teens are the reason this is not just a suffix table. */
export function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function describeStop(reason: StopReason): string {
  switch (reason) {
    case 'ON_THE_CLOCK':
      return 'your team is on the clock';
    case 'DRAFT_COMPLETE':
      return 'the draft is over';
    case 'NO_PLAYERS':
      return 'there was nobody left to pick';
    case 'NO_DRAFT_ORDER':
      return 'the draft order is unknown';
    case 'MAX_PICKS':
    default:
      return 'it reached the limit for one run';
  }
}

/** The league as it stands immediately before `overall`, with rosters from picks alone. */
function buildStateAt(
  state: LeagueState,
  picks: DraftPick[],
  overall: number,
  draftOrder: string[],
): LeagueState {
  const rosterByTeam = new Map<string, string[]>();
  for (const pick of picks) {
    if (!pick.playerId) continue;
    rosterByTeam.set(pick.teamId, [...(rosterByTeam.get(pick.teamId) ?? []), pick.playerId]);
  }

  return {
    ...state,
    teams: state.teams.map((team) => ({
      ...team,
      roster: (rosterByTeam.get(team.id) ?? []).map((playerId) => ({
        playerId,
        slot: 'BENCH' as const,
        acquisitionType: 'DRAFT' as const,
      })),
    })),
    draft: {
      picks,
      currentOverall: overall,
      draftOrder,
      draftOrderSource: state.draft?.draftOrderSource ?? 'FALLBACK',
      complete: false,
    },
  };
}
