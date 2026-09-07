import { NextResponse } from 'next/server';
import { z } from 'zod';
import { recommendDraftPick } from '@/domain/draft-engine';
import { teamOnClock } from '@/domain/opponent-model';
import { valuePlayers } from '@/domain/valuation';
import { frameworkEquivalentRound } from '@/domain/draft-strategy';
import type { DraftPick, DraftState, LeagueState } from '@/domain/types';
import { loadLeagueState } from '@/services/league-state';
import { buildBoard, validateBoard } from '@/services/draft-board';

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
  /** Round-1 team order, when the user has set it by hand. */
  draftOrder: z.array(z.string().min(1)).max(32).optional(),
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

  const invalid = validateBoard(state, pickedPlayerIds);
  if (invalid) {
    return NextResponse.json(
      {
        error:
          invalid.kind === 'UNKNOWN_PLAYERS'
            ? `Unknown player ids: ${invalid.ids.join(', ')}`
            : `Player drafted more than once: ${invalid.ids.join(', ')}`,
      },
      { status: 409 },
    );
  }

  const board = buildBoard(state, {
    pickedPlayerIds,
    myDraftSlot,
    draftOrder: parsed.data.draftOrder,
  });
  const { state: draftState, draft, draftOrder, draftOrderSource } = board;
  const teams = draftState.teams;

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

  /**
   * Board order is his, not ours.
   *
   * He publishes positional lists and no overall board, so the cross-positional order
   * here is his tier structure applied by the app (see expertBoardValue) — not a ranking
   * he made. Players he has not ranked keep a stable order behind those he has, rather
   * than being dropped: they are still draftable, we just have nothing of his to say
   * about them.
   */
  const boardOrder = [...availableValuation.players].sort((a, b) => {
    const ra = recommendation.expertByPlayerId.get(a.player.id);
    const rb = recommendation.expertByPlayerId.get(b.player.id);
    if (ra && !rb) return -1;
    if (!ra && rb) return 1;
    if (ra && rb) {
      if (ra.tier !== rb.tier) return ra.tier - rb.tier;
      return ra.rank - rb.rank;
    }
    return a.player.name.localeCompare(b.player.name);
  });

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
      formatSummaries: recommendation.formatSummaries,
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
    /**
     * The big board.
     *
     * Ordered by the ranker's tiers rather than by our projections, and carrying his view
     * for every player rather than only for the twelve on the shortlist. Our own
     * projected points, league value and VOR are deliberately not sent: they were the
     * numbers the board was being read on, and they are not the evidence this league
     * wants to draft from.
     */
    availablePlayers: boardOrder.map((valued) => ({
      id: valued.player.id,
      name: valued.player.name,
      position: valued.player.position,
      nflTeam: valued.player.nflTeam ?? null,
      byeWeek: valued.player.byeWeek ?? null,
      status: valued.player.status,
      expert: recommendation.expertByPlayerId.get(valued.player.id) ?? null,
    })),
    board: {
      rankedAvailable: boardOrder.length - recommendation.unrankedAvailable,
      unrankedAvailable: recommendation.unrankedAvailable,
    },
    draftOrder: {
      teamIds: draftOrder,
      source: draftOrderSource,
      teams: draftOrder.map((teamId) => ({
        id: teamId,
        name: state.teams.find((team) => team.id === teamId)?.name ?? teamId,
      })),
    },
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
