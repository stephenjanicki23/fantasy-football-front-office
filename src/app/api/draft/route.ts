import { NextResponse } from 'next/server';
import { z } from 'zod';
import { recommendDraftPick } from '@/domain/draft-engine';
import { pickCoordinates } from '@/domain/league-config';
import { teamOnClock } from '@/domain/opponent-model';
import { valuePlayers } from '@/domain/valuation';
import { frameworkEquivalentRound } from '@/domain/draft-strategy';
import type { DraftPick, DraftState, LeagueState } from '@/domain/types';
import { loadLeagueState } from '@/services/league-state';

/**
 * Manual draft tracking.
 *
 * The client sends only the ordered list of player ids taken so far — team, round and
 * pick-in-round are all derivable from the draft order and the league's snake/linear
 * setting, so there is nothing for the client to get wrong and nothing to keep in sync.
 *
 * Every recommendation is recomputed from scratch on each call. That matters during a
 * draft: replacement level, tiers and scarcity all move as the board drains, so a cached
 * answer would be quietly stale by the time you used it.
 */

const RequestSchema = z.object({
  /** Player ids in overall pick order. Index 0 is pick #1. */
  pickedPlayerIds: z.array(z.string().min(1)).max(400).default([]),
  /** Your seat in round 1, 1-indexed. Overrides whatever the provider reported. */
  myDraftSlot: z.number().int().min(1).max(32).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid draft request', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const loaded = await loadLeagueState();
  const { state } = loaded;

  if (state.seasonProjections.length === 0) {
    return NextResponse.json(
      { error: 'No projections are loaded, so the draft engine cannot rank anybody.' },
      { status: 409 },
    );
  }

  const { pickedPlayerIds, myDraftSlot } = parsed.data;

  // Reject unknown ids rather than silently ignoring them — a typo'd pick would
  // otherwise leave a player on the board who is actually gone.
  const knownIds = new Set(state.players.map((p) => p.id));
  const unknown = pickedPlayerIds.filter((id) => !knownIds.has(id));
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `Unknown player ids: ${unknown.slice(0, 5).join(', ')}` },
      { status: 409 },
    );
  }

  // A player cannot be drafted twice. Silently de-duplicating would misreport which team
  // holds him and leave the pool wrong.
  const duplicates = pickedPlayerIds.filter((id, index) => pickedPlayerIds.indexOf(id) !== index);
  if (duplicates.length > 0) {
    return NextResponse.json(
      { error: `Player drafted more than once: ${[...new Set(duplicates)].slice(0, 5).join(', ')}` },
      { status: 409 },
    );
  }

  const draftOrder = state.draft?.draftOrder?.length
    ? state.draft.draftOrder
    : state.teams.map((team) => team.id);

  const picks: DraftPick[] = pickedPlayerIds.map((playerId, index) => {
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
    complete: picks.length >= state.config.teamCount * state.config.draftRounds,
  };

  /**
   * Rosters are rebuilt purely from the tracked picks, replacing whatever the provider
   * reported.
   *
   * A draft tracker models a draft from an empty board. Layering picks on top of rosters
   * the provider already returned would double-count anyone taken in a previous draft,
   * shrink the available pool by players who are in fact undrafted, and compute roster
   * fit against teams holding twice their real roster.
   */
  const rosterByTeam = new Map<string, string[]>();
  for (const pick of picks) {
    if (!pick.playerId) continue;
    rosterByTeam.set(pick.teamId, [...(rosterByTeam.get(pick.teamId) ?? []), pick.playerId]);
  }

  const teams = state.teams.map((team, index) => ({
    ...team,
    isMyTeam: myDraftSlot !== undefined ? (team.draftSlot ?? index + 1) === myDraftSlot : team.isMyTeam,
    draftSlot: team.draftSlot ?? index + 1,
    roster: (rosterByTeam.get(team.id) ?? []).map((playerId) => ({
      playerId,
      slot: 'BENCH' as const,
      acquisitionType: 'DRAFT' as const,
    })),
  }));

  const draftState: LeagueState = {
    ...state,
    teams,
    config: { ...state.config, myDraftSlot: myDraftSlot ?? state.config.myDraftSlot },
    draft,
  };

  const recommendation = recommendDraftPick(draftState, { limit: 12 });

  // Re-value the remaining pool so the board shows values that move with the draft. Only
  // tracked picks are unavailable — provider rosters are deliberately ignored here for
  // the same reason the rosters above are rebuilt.
  const takenIds = new Set(pickedPlayerIds);
  const availableValuation = valuePlayers(
    state.config,
    state.players.filter((player) => !takenIds.has(player.id)),
    state.seasonProjections,
    { injuries: state.injuries },
  );

  const onClockTeamId = teamOnClock(state.config, draftOrder, draft.currentOverall);
  const onClockTeam = teams.find((team) => team.id === onClockTeamId);

  return NextResponse.json({
    onTheClock: {
      overall: draft.currentOverall,
      round: recommendation.round,
      pickInRound: recommendation.pickInRound,
      teamId: onClockTeamId ?? null,
      teamName: onClockTeam?.name ?? null,
      isMe: Boolean(onClockTeam?.isMyTeam),
    },
    picksUntilNextTurn: recommendation.picksUntilNextTurn,
    nextPickOverall: recommendation.nextPickOverall,
    confidence: recommendation.confidence,
    reasoning: recommendation.reasoning,
    bestPick: serialiseCandidate(recommendation.bestPick),
    safeAlternative: serialiseCandidate(recommendation.safeAlternative),
    bestValue: serialiseCandidate(recommendation.bestValue),
    candidates: recommendation.candidates.map(serialiseCandidate),
    qbScarcity: {
      isTwoQb: recommendation.qbScarcity.isTwoQb,
      viableStartingQbs: recommendation.qbScarcity.viableStartingQbs,
      startingQbSlots: recommendation.qbScarcity.startingQbSlots,
      teamsNeedingQb2: recommendation.qbScarcity.teamsNeedingQb2,
      survivalOfNextTierQb: recommendation.qbScarcity.survivalOfNextTierQb,
      recommendation: recommendation.qbScarcity.recommendation,
      summary: recommendation.qbScarcity.explain.formula,
    },
    squeezes: recommendation.squeezes.map((squeeze) => ({
      position: squeeze.position,
      severity: squeeze.severity,
      teamsNeedingPosition: squeeze.teamsNeedingPosition,
      playersRemainingInTier: squeeze.playersRemainingInTier,
      tierSurvivalProbability: squeeze.tierSurvivalProbability,
      summary: squeeze.explain.formula,
    })),
    strategy: recommendation.strategy
      ? {
          quarter: recommendation.strategy.currentQuarter,
          label: recommendation.strategy.plan.label,
          objective: recommendation.strategy.plan.objective,
          guidance: recommendation.strategy.plan.guidance,
          firstRound: recommendation.strategy.plan.firstRound,
          lastRound: recommendation.strategy.plan.lastRound,
          picksLeftInQuarter: recommendation.strategy.picksLeftInQuarter,
          q1ProducersOwned: recommendation.strategy.q1ProducersOwned,
          q1ProducerTarget: recommendation.strategy.q1ProducerTarget,
          openObjectives: recommendation.strategy.openObjectives,
          congestionWarning: recommendation.strategy.congestionWarning,
          notes: recommendation.strategy.notes,
          explain: recommendation.strategy.explain.formula,
        }
      : null,
    quarters: {
      q1End: recommendation.quarters.q1End,
      q2End: recommendation.quarters.q2End,
      q3End: recommendation.quarters.q3End,
      totalRounds: recommendation.quarters.totalRounds,
      plans: recommendation.quarters.plans,
      explain: recommendation.quarters.explain.formula,
      /** What this round would be in the 12-team league the framework assumes. */
      frameworkEquivalentRound: frameworkEquivalentRound(state.config, recommendation.round),
      frameworkTeamCount: 12,
    },
    expert: {
      source: recommendation.expertSource,
      guidance: recommendation.expertGuidance,
      unmatched: recommendation.expertUnmatched,
      objectives: recommendation.tierObjectives.map((objective) => ({
        position: objective.position,
        needed: objective.needed,
        owned: objective.owned,
        throughTier: objective.throughTier,
        remainingInWindow: objective.remainingInWindow,
        status: objective.status,
        message: objective.message,
      })),
    },
    myNeeds: recommendation.myNeeds
      ? {
          needOrder: recommendation.myNeeds.needOrder,
          needByPosition: recommendation.myNeeds.needByPosition,
          unfilledSlots: recommendation.myNeeds.unfilledSlots,
        }
      : null,
    availablePlayers: availableValuation.players.map((valued) => ({
      id: valued.player.id,
      name: valued.player.name,
      position: valued.player.position,
      nflTeam: valued.player.nflTeam ?? null,
      byeWeek: valued.player.byeWeek ?? null,
      status: valued.player.status,
      projectedPoints: valued.projectedPoints,
      leagueValue: valued.leagueValue,
      vor: valued.vor,
      positionRank: valued.positionRank,
      overallRank: valued.overallRank,
      tier: valued.tier ?? null,
    })),
    rosters: teams.map((team) => ({
      id: team.id,
      name: team.name,
      isMyTeam: team.isMyTeam,
      draftSlot: team.draftSlot ?? null,
      playerIds: team.roster.map((entry) => entry.playerId),
    })),
  });
}

function serialiseCandidate(candidate: ReturnType<typeof recommendDraftPick>['bestPick']) {
  if (!candidate) return null;
  return {
    id: candidate.player.player.id,
    name: candidate.player.player.name,
    position: candidate.player.player.position,
    draftScore: candidate.draftScore,
    value: candidate.value,
    rosterFit: candidate.rosterFit,
    scarcity: candidate.scarcity,
    expectedAvailability: candidate.expectedAvailability,
    tier: candidate.tier ?? null,
    tierRemaining: candidate.tierRemaining,
    tierCliff: candidate.tierCliff,
    upside: candidate.upside.score,
    upsideExplain: candidate.upside.explain.formula,
    expert: candidate.expert,
    explain: candidate.explain.formula,
  };
}
