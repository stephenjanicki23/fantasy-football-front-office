import { NextResponse } from 'next/server';
import { z } from 'zod';
import { simulateDraft, DEFAULT_SPREAD } from '@/domain/mock-draft';
import { loadLeagueState } from '@/services/league-state';
import { buildBoard, validateBoard } from '@/services/draft-board';

/**
 * Mock draft: run every team but yours.
 *
 * The client owns the board — it sends the picks made so far and gets back the picks the
 * simulation added, which it appends and then re-analyses through /api/draft. Keeping one
 * source of truth means a simulated pick and a manual one are the same kind of thing, and
 * undo works on both without a second code path.
 */

const RequestSchema = z.object({
  pickedPlayerIds: z.array(z.string().min(1)).max(400).default([]),
  myDraftSlot: z.number().int().min(1).max(32).optional(),
  draftOrder: z.array(z.string().min(1)).max(32).optional(),
  /**
   * TO_MY_PICK runs until you are on the clock; ONE advances a single pick so you can
   * watch a run develop.
   *
   * There is deliberately no "simulate the whole draft" mode: you make your own picks, so
   * every run has to stop when you are on the clock. A mode that ran past that would be
   * drafting for you.
   */
  mode: z.enum(['TO_MY_PICK', 'ONE']).default('TO_MY_PICK'),
  /** How far down each team's shortlist the simulation may reach. */
  spread: z.number().int().min(0).max(8).default(DEFAULT_SPREAD),
  /** Same seed, same mock. */
  seed: z.number().int().min(0).max(2 ** 31).default(1),
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
      { error: 'Invalid simulation request', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { state } = await loadLeagueState();
  if (state.seasonProjections.length === 0) {
    return NextResponse.json(
      { error: 'No projections are loaded, so the draft engine cannot rank anybody.' },
      { status: 409 },
    );
  }

  const { pickedPlayerIds, myDraftSlot, mode, spread, seed } = parsed.data;

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

  /**
   * Which team the simulation must not pick for.
   *
   * If we cannot tell which team is yours, simulating would draft *for* you — so stop and
   * say so rather than quietly filling your roster with someone else's picks.
   */
  if (!board.myTeamId) {
    return NextResponse.json(
      {
        error:
          'Cannot tell which team is yours, so a simulation would draft for you. Set your draft slot first.',
      },
      { status: 409 },
    );
  }

  const result = simulateDraft(board.state, {
    stopBeforeTeamId: board.myTeamId,
    maxPicks: mode === 'ONE' ? 1 : undefined,
    spread,
    seed,
  });

  return NextResponse.json({
    picks: result.picks,
    stoppedBecause: result.stoppedBecause,
    currentOverall: result.currentOverall,
    explain: result.explain.formula,
    draftOrder: {
      teamIds: board.draftOrder,
      source: board.draftOrderSource,
    },
    myTeamId: board.myTeamId,
  });
}
