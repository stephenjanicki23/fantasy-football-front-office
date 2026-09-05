import { describe, expect, it } from 'vitest';
import { matchExpertRankings } from '@/domain/expert-rankings';
import { QB_TIERS_2026 } from '@/data/expert-rankings';
import type { Player } from '@/domain/types';

// Names spelled as ESPN actually returns them, to prove the matcher survives real data.
const ESPN_STYLE = [
  'Lamar Jackson','Josh Allen','Jayden Daniels','Joe Burrow','Jalen Hurts','Drake Maye',
  'Justin Herbert','Caleb Williams','Dak Prescott','Trevor Lawrence','Brock Purdy',
  'Matthew Stafford','Patrick Mahomes','Bo Nix','Kyler Murray','Jared Goff','Jaxson Dart',
  'Jordan Love','Baker Mayfield','Tyler Shough','Malik Willis','Daniel Jones','C.J. Stroud',
  'Cam Ward','Sam Darnold','Fernando Mendoza','Bryce Young','Aaron Rodgers','Geno Smith',
  'Jacoby Brissett','Shedeur Sanders','Michael Penix Jr.','Tua Tagovailoa','Carson Beck',
  'Kirk Cousins','Deshaun Watson',
];

describe('matching against real ESPN-style names', () => {
  it('matches all 36 ranked QBs', () => {
    const pool: Player[] = ESPN_STYLE.map((name, i) => ({
      id: `espn-${i}`, name, position: 'QB', status: 'ACTIVE', source: 'espn', asOf: 'now',
    }));
    const result = matchExpertRankings(pool, QB_TIERS_2026);
    expect(result.unmatched.map((r) => r.name)).toEqual([]);
    expect(result.matchedCount).toBe(36);
  });
});
