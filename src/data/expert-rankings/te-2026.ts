import type { ExpertRankingSet } from '@/domain/expert-rankings';

/**
 * TE tiers, 2026 — Ben Gretch (Stealing Signals).
 *
 * Built for FULL PPR, like the RB and WR sets, so the same translation applies: his ranks
 * are left exactly as published and the 0.5-PPR difference is computed from projections.
 * The effect is smaller here than at receiver — tight end reception volume is compressed
 * across the position — but it is not zero at the top, where the receiving backs of the
 * position (Bowers, McBride) carry receiver-like target counts.
 *
 * He places a single Big Tier Break after TE4, and describes his approach this year as
 * "Great or Late": take one of the top four, or wait a long time. That interacts directly
 * with this league being 2-QB — the QB piece already said early capital has to go to
 * quarterbacks in superflex — so the two pieces of guidance are surfaced together, and the
 * app resolves the conflict from what is actually on the board rather than by picking one.
 *
 * `designationBasis` again separates individual labels from group statements: the four
 * Targets come from one sentence covering the whole top tier ("I do have all four as
 * Targets"), and are marked stated because that sentence names the set explicitly.
 */
export const TE_TIERS_2026: ExpertRankingSet = {
  source: 'Ben Gretch — Stealing Signals',
  sourceUrl: 'https://bengretch.substack.com',
  season: 2026,
  asOf: '2026-09-07',
  scoringNote:
    'Built for FULL PPR. This league is 0.5 PPR, which slightly flattens the edge the high-target tight ends hold over the touchdown-dependent ones; the app computes the shift rather than editing his ranks.',
  sourceScoring: { receptionPoints: 1 },
  bigTierBreakAfterRanks: [4],
  guidance: [
    'His approach at tight end this year is "Great or Late": come away with one of the top four, or wait a long time and take the position cheaply.',
    'The Big Tier Break lands after TE4 — everything from Tier 2 down is held behind it deliberately, not merely ranked below it.',
    'All four players ahead of the Big Tier Break are Targets, and he expects more likely than not to leave a draft with one of them.',
    'Tier 3 is not a Fade tier despite the prices; he says explicitly he is not denoting these players as Fades.',
    'In superflex, "Great or Late" collides with needing early capital for two QBs — both cannot be honoured in the same round, so weigh a top-four tight end against how far the QB tier you need has already emptied.',
  ],
  players: [
    // Tier 1a — the three he wants
    { name: 'Brock Bowers', position: 'TE', rank: 1, tier: 1, subTier: '1a', designation: 'TARGET', designationBasis: 'stated' },
    { name: 'Trey McBride', position: 'TE', rank: 2, tier: 1, subTier: '1a', designation: 'TARGET', designationBasis: 'stated' },
    { name: 'Colston Loveland', position: 'TE', rank: 3, tier: 1, subTier: '1a', designation: 'TARGET', designationBasis: 'stated' },

    // Tier 1b — still ahead of the Big Tier Break, and there for a reason
    { name: 'Tyler Warren', position: 'TE', rank: 4, tier: 1, subTier: '1b', designation: 'TARGET', designationBasis: 'stated', note: 'Placed ahead of the Big Tier Break deliberately rather than as the last name in the tier.' },

    // Tier 2 — held behind the Big Tier Break
    { name: 'Harold Fannin', position: 'TE', rank: 5, tier: 2, subTier: '2', note: 'Held behind the Big Tier Break; a tier of his own between the top four and the veteran group.' },

    // Tier 3 — priced awkwardly, but explicitly not Fades
    { name: 'Sam LaPorta', position: 'TE', rank: 6, tier: 3, subTier: '3' },
    { name: 'Tucker Kraft', position: 'TE', rank: 7, tier: 3, subTier: '3', note: 'Says he should probably be calling Kraft a Fade, but is not.' },
    { name: 'Kyle Pitts', position: 'TE', rank: 8, tier: 3, subTier: '3' },
    { name: 'Travis Kelce', position: 'TE', rank: 9, tier: 3, subTier: '3' },
    { name: 'George Kittle', position: 'TE', rank: 10, tier: 3, subTier: '3' },

    // Tier 4 — the "late" half of Great or Late
    { name: 'Jake Ferguson', position: 'TE', rank: 11, tier: 4, subTier: '4' },
    { name: 'Isaiah Likely', position: 'TE', rank: 12, tier: 4, subTier: '4' },
    { name: 'Mark Andrews', position: 'TE', rank: 13, tier: 4, subTier: '4' },
    { name: 'Dalton Kincaid', position: 'TE', rank: 14, tier: 4, subTier: '4' },
    { name: 'Oronde Gadsden', position: 'TE', rank: 15, tier: 4, subTier: '4' },
    { name: 'Kenyon Sadiq', position: 'TE', rank: 16, tier: 4, subTier: '4' },
    { name: 'Chig Okonkwo', position: 'TE', rank: 17, tier: 4, subTier: '4' },
    { name: 'Juwan Johnson', position: 'TE', rank: 18, tier: 4, subTier: '4' },
    { name: 'T.J. Hockenson', position: 'TE', rank: 19, tier: 4, subTier: '4' },
    { name: 'Hunter Henry', position: 'TE', rank: 20, tier: 4, subTier: '4' },
    { name: 'Brenton Strange', position: 'TE', rank: 21, tier: 4, subTier: '4' },
    { name: 'Dallas Goedert', position: 'TE', rank: 22, tier: 4, subTier: '4' },
    { name: 'Pat Freiermuth', position: 'TE', rank: 23, tier: 4, subTier: '4' },
    { name: 'Terrance Ferguson', position: 'TE', rank: 24, tier: 4, subTier: '4' },
    { name: 'Dalton Schultz', position: 'TE', rank: 25, tier: 4, subTier: '4' },
    { name: 'Cade Otton', position: 'TE', rank: 26, tier: 4, subTier: '4' },
    { name: 'Gunnar Helm', position: 'TE', rank: 27, tier: 4, subTier: '4' },
    { name: 'Eli Stowers', position: 'TE', rank: 28, tier: 4, subTier: '4' },
    { name: 'Greg Dulcich', position: 'TE', rank: 29, tier: 4, subTier: '4' },
    { name: 'AJ Barner', position: 'TE', rank: 30, tier: 4, subTier: '4' },

    // Tier 5
    { name: 'Evan Engram', position: 'TE', rank: 31, tier: 5, subTier: '5' },
    { name: 'Mike Gesicki', position: 'TE', rank: 32, tier: 5, subTier: '5' },
    { name: 'Darnell Washington', position: 'TE', rank: 33, tier: 5, subTier: '5' },
    { name: 'Theo Johnson', position: 'TE', rank: 34, tier: 5, subTier: '5' },
    { name: 'Eli Raridon', position: 'TE', rank: 35, tier: 5, subTier: '5' },
    { name: 'Colby Parkinson', position: 'TE', rank: 36, tier: 5, subTier: '5' },
    { name: 'Ja\'Tavion Sanders', position: 'TE', rank: 37, tier: 5, subTier: '5' },
    { name: 'Mason Taylor', position: 'TE', rank: 38, tier: 5, subTier: '5' },
    { name: 'Cole Kmet', position: 'TE', rank: 39, tier: 5, subTier: '5' },
    { name: 'Justin Joly', position: 'TE', rank: 40, tier: 5, subTier: '5' },
    { name: 'David Njoku', position: 'TE', rank: 41, tier: 5, subTier: '5' },
    { name: 'Erick All', position: 'TE', rank: 42, tier: 5, subTier: '5' },
    { name: 'Tanner Koziol', position: 'TE', rank: 43, tier: 5, subTier: '5' },
    { name: 'Jake Tonges', position: 'TE', rank: 44, tier: 5, subTier: '5' },
    { name: 'Elijah Arroyo', position: 'TE', rank: 45, tier: 5, subTier: '5' },
    { name: 'Michael Mayer', position: 'TE', rank: 46, tier: 5, subTier: '5' },
    { name: 'Dawson Knox', position: 'TE', rank: 47, tier: 5, subTier: '5' },
    { name: 'Charlie Kolar', position: 'TE', rank: 48, tier: 5, subTier: '5' },
    { name: 'Seydou Traore', position: 'TE', rank: 49, tier: 5, subTier: '5' },
    { name: 'Matthew Hibner', position: 'TE', rank: 50, tier: 5, subTier: '5' },
  ],
};
