import type { ExpertRankingSet } from '@/domain/expert-rankings';
import { QB_TIERS_2026 } from './qb-2026';
import { RB_TIERS_2026 } from './rb-2026';

/**
 * Bundled expert ranking sets, one per position.
 *
 * They are kept separate rather than concatenated because each carries its own scoring
 * assumptions: the QB tiers were built for 4-point passing TDs (matching this league)
 * while the RB tiers were built for full PPR (this league is 0.5). Flattening them would
 * lose exactly the metadata needed to translate one and not the other.
 *
 * The ranker's TE and WR tiers are separate pieces that have not been supplied, so those
 * positions fall back to the app's own projection-derived tiers.
 */
export const EXPERT_RANKING_SETS: ExpertRankingSet[] = [QB_TIERS_2026, RB_TIERS_2026];

export function mergedExpertRankings(): ExpertRankingSet | null {
  if (EXPERT_RANKING_SETS.length === 0) return null;
  const [first, ...rest] = EXPERT_RANKING_SETS;
  if (rest.length === 0) return first!;

  return {
    ...first!,
    scoringNote: EXPERT_RANKING_SETS.map((set) => set.scoringNote)
      .filter(Boolean)
      .join(' '),
    guidance: EXPERT_RANKING_SETS.flatMap((set) => set.guidance),
    players: EXPERT_RANKING_SETS.flatMap((set) => set.players),
  };
}

export { QB_TIERS_2026, RB_TIERS_2026 };
