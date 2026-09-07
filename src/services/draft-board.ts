import { pickCoordinates } from '@/domain/league-config';
import { teamOnClock } from '@/domain/opponent-model';
import type { DraftPick, DraftState, LeagueState } from '@/domain/types';

/**
 * Turn a list of picked player ids into a league state.
 *
 * Shared by the advice endpoint and the mock-draft endpoint so the two cannot drift: a
 * simulated pick has to land on exactly the board the recommendation was computed
 * against, or the mock quietly advises one draft and simulates another.
 */

export interface BoardInput {
  pickedPlayerIds: string[];
  myDraftSlot?: number;
  /** Round-1 team order the user set by hand, when they have. */
  draftOrder?: string[];
}

export interface BuiltBoard {
  state: LeagueState;
  draft: DraftState;
  draftOrder: string[];
  draftOrderSource: DraftState['draftOrderSource'];
  picks: DraftPick[];
  myTeamId: string | null;
}

export type BoardError =
  | { kind: 'UNKNOWN_PLAYERS'; ids: string[] }
  | { kind: 'DUPLICATE_PICKS'; ids: string[] };

/** Validate the picks the client sent. Silent repair would misreport the board. */
export function validateBoard(state: LeagueState, pickedPlayerIds: string[]): BoardError | null {
  const knownIds = new Set(state.players.map((p) => p.id));
  const unknown = pickedPlayerIds.filter((id) => !knownIds.has(id));
  if (unknown.length > 0) return { kind: 'UNKNOWN_PLAYERS', ids: unknown.slice(0, 5) };

  const duplicates = pickedPlayerIds.filter((id, i) => pickedPlayerIds.indexOf(id) !== i);
  if (duplicates.length > 0) return { kind: 'DUPLICATE_PICKS', ids: [...new Set(duplicates)].slice(0, 5) };

  return null;
}

/**
 * Resolve the round-1 order, best source first.
 *
 * An order the user typed wins: they set it after looking at their actual draft room.
 * Otherwise take the provider's, carrying how much it is worth trusting — `FALLBACK`
 * means nobody ever told us and it is the league's team order, which is a guess.
 */
export function resolveDraftOrder(
  state: LeagueState,
  supplied: string[] | undefined,
): { draftOrder: string[]; draftOrderSource: DraftState['draftOrderSource'] } {
  const validIds = new Set(state.teams.map((team) => team.id));
  const suppliedIsUsable =
    supplied !== undefined &&
    supplied.length === state.teams.length &&
    new Set(supplied).size === state.teams.length &&
    supplied.every((id) => validIds.has(id));

  if (suppliedIsUsable) return { draftOrder: supplied, draftOrderSource: 'MANUAL' };

  const providerOrder = state.draft?.draftOrder?.length
    ? state.draft.draftOrder
    : state.teams.map((team) => team.id);
  return {
    draftOrder: providerOrder,
    draftOrderSource: state.draft?.draftOrderSource ?? 'FALLBACK',
  };
}

export function buildBoard(state: LeagueState, input: BoardInput): BuiltBoard {
  const { draftOrder, draftOrderSource } = resolveDraftOrder(state, input.draftOrder);

  const picks: DraftPick[] = input.pickedPlayerIds.map((playerId, index) => {
    const overall = index + 1;
    const { round, pickInRound } = pickCoordinates(state.config, overall);
    return {
      overall,
      round,
      pickInRound,
      teamId: teamOnClock(state.config, draftOrder, overall) ?? draftOrder[0] ?? '',
      playerId,
    };
  });

  const draft: DraftState = {
    picks,
    currentOverall: picks.length + 1,
    draftOrder,
    draftOrderSource,
    complete: picks.length >= state.config.teamCount * state.config.draftRounds,
  };

  /**
   * Rosters are rebuilt purely from the tracked picks, replacing whatever the provider
   * reported — a draft tracker models a draft from an empty board, and layering picks on
   * top of existing rosters would double-count anyone taken in a previous draft.
   */
  const rosterByTeam = new Map<string, string[]>();
  for (const pick of picks) {
    if (!pick.playerId) continue;
    rosterByTeam.set(pick.teamId, [...(rosterByTeam.get(pick.teamId) ?? []), pick.playerId]);
  }

  const teams = state.teams.map((team, index) => {
    const draftSlot = draftOrder.indexOf(team.id) >= 0
      ? draftOrder.indexOf(team.id) + 1
      : (team.draftSlot ?? index + 1);
    return {
      ...team,
      isMyTeam: input.myDraftSlot !== undefined ? draftSlot === input.myDraftSlot : team.isMyTeam,
      draftSlot,
      roster: (rosterByTeam.get(team.id) ?? []).map((playerId) => ({
        playerId,
        slot: 'BENCH' as const,
        acquisitionType: 'DRAFT' as const,
      })),
    };
  });

  const boardState: LeagueState = {
    ...state,
    teams,
    config: { ...state.config, myDraftSlot: input.myDraftSlot ?? state.config.myDraftSlot },
    draft,
  };

  return {
    state: boardState,
    draft,
    draftOrder,
    draftOrderSource,
    picks,
    myTeamId: teams.find((team) => team.isMyTeam)?.id ?? null,
  };
}
