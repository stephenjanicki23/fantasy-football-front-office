import type { ExpertRankingSet } from '@/domain/expert-rankings';
import { QB_TIERS_2026 } from './qb-2026';

/**
 * Bundled expert ranking sets.
 *
 * Only positions actually transcribed appear here. The ranker's RB, TE and WR tiers are
 * separate pieces that have not been supplied, so those positions fall back to the app's
 * own projection-derived tiers rather than being guessed at.
 */
export const EXPERT_RANKING_SETS: ExpertRankingSet[] = [QB_TIERS_2026];

export function mergedExpertRankings(): ExpertRankingSet | null {
  if (EXPERT_RANKING_SETS.length === 0) return null;
  const [first, ...rest] = EXPERT_RANKING_SETS;
  if (rest.length === 0) return first!;

  return {
    ...first!,
    guidance: EXPERT_RANKING_SETS.flatMap((set) => set.guidance),
    players: EXPERT_RANKING_SETS.flatMap((set) => set.players),
  };
}

export { QB_TIERS_2026 };
