import type { ExpertRankingSet } from '@/domain/expert-rankings';

/**
 * QB tiers, 2026 — Ben Gretch (Stealing Signals).
 *
 * Transcribed from the ranker's published QB tiers piece. These are one analyst's
 * opinions, not projections and not this app's own valuation: they are stored attributed
 * and dated, displayed as his, and never silently override the league-derived maths.
 *
 * Notes are short paraphrases of his stated reasoning, not reproductions of his article.
 * Only designations he stated explicitly are recorded — he wrote that he deliberately put
 * no Target labels at the top of the position, so favourable prose is not treated as a
 * Target.
 *
 * He reports ZERO Big Tier Breaks at QB this year, which he notes is the first time since
 * he began using the concept that standard tier breaks held all the way down a position.
 * That is meaningful for a two-QB league: it means there is no single cliff to race to.
 */
export const QB_TIERS_2026: ExpertRankingSet = {
  source: 'Ben Gretch — Stealing Signals',
  sourceUrl: 'https://bengretch.substack.com',
  season: 2026,
  asOf: '2026-09-05',
  scoringNote:
    'Built for 4-point passing TDs, with ties broken toward pocket passers; he suggests thinking of them as roughly 5-point-passing-TD rankings.',
  guidance: [
    'Zero Big Tier Breaks at QB this year — standard tier breaks hold all the way down, so there is no single cliff to race to.',
    'ADP at QB is sharp. Let your needs at other positions dictate when you take one.',
    'Do not forgo a real tier break or upside at another position to chase a QB.',
    'In superflex, the aim is elite non-QB players while still landing two QBs by the end of Tier 3.',
    'In superflex, taking a QB in round 1 is the only way to be certain of not losing the game of chicken — the value gap between QBs and non-QBs is smallest there.',
    'In superflex, wait longer on TE than you would in a one-QB league; the early-TE detour is hard to justify when early capital is needed for QBs.',
    'In superflex, the worst outcome is taking a mediocre QB over a genuine upside play at another position.',
    'In superflex, a bust hurts far more than in a one-QB league — prefer a stable QB1 and take the risk on your QB2.',
    'In a one-QB league, prefer an early-TE detour to an early-QB one if you must choose.',
  ],
  players: [
    // Tier 1
    { name: 'Lamar Jackson', position: 'QB', rank: 1, tier: 1, note: 'Ranked QB1 largely on his 2024 scoring; worth chasing up the board if paying up at the position.' },
    { name: 'Josh Allen', position: 'QB', rank: 2, tier: 1, note: 'Might be his QB1 in superflex; offense seen as more limiting to his ceiling than Jackson or Daniels.' },
    { name: 'Jayden Daniels', position: 'QB', rank: 3, tier: 1, note: 'One of the two early-round QBs he would chase up the board.' },

    // Tier 2
    { name: 'Joe Burrow', position: 'QB', rank: 4, tier: 2, note: 'Leads a fantasy-friendly offense; better still in 6-point passing TD formats.' },
    { name: 'Jalen Hurts', position: 'QB', rank: 5, tier: 2, note: 'Projected better than expected; rushing and team scoring both candidates to regress upward.' },
    { name: 'Drake Maye', position: 'QB', rank: 6, tier: 2, designation: 'FADE', note: 'Patriots expected to score fewer team TDs; was already a regression candidate before the receiver upgrades.' },
    { name: 'Justin Herbert', position: 'QB', rank: 7, tier: 2, note: 'One of his favourite upside bets, on an offense he expects to keep ascending.' },
    { name: 'Caleb Williams', position: 'QB', rank: 8, tier: 2, note: 'One of his favourite upside bets, on an offense he expects to keep ascending.' },
    { name: 'Dak Prescott', position: 'QB', rank: 9, tier: 2, note: 'Fantasy-friendly offense with strong weapons; better in 6-point passing TD formats.' },

    // Tier 3 — the tier he says most fantasy players should live in for 2026
    { name: 'Trevor Lawrence', position: 'QB', rank: 10, tier: 3, note: 'Ranked on late-2025 finish and ADP deference rather than conviction.' },
    { name: 'Brock Purdy', position: 'QB', rank: 11, tier: 3, note: 'Ranked on late-2025 finish and ADP deference rather than conviction.' },
    { name: 'Matthew Stafford', position: 'QB', rank: 12, tier: 3, note: 'A discount pocket passer who should compile passing stats.' },
    { name: 'Patrick Mahomes', position: 'QB', rank: 13, tier: 3 },
    { name: 'Bo Nix', position: 'QB', rank: 14, tier: 3, note: 'Priced behind his last two finishes; a way into an underrated Broncos offense.' },
    { name: 'Kyler Murray', position: 'QB', rank: 15, tier: 3, note: 'Real upside but poor camp reports; riskier in superflex, where busts hurt more.' },
    { name: 'Jared Goff', position: 'QB', rank: 16, tier: 3, note: 'A discount pocket passer who should compile passing stats.' },
    { name: 'Jaxson Dart', position: 'QB', rank: 17, tier: 3, designation: 'FADE', note: 'Health and play-style concerns; running less to protect himself would cut against his ceiling.' },
    { name: 'Jordan Love', position: 'QB', rank: 18, tier: 3, note: 'A last-chance upside play; needs a pass-rate spike to become interesting.' },
    { name: 'Baker Mayfield', position: 'QB', rank: 19, tier: 3, note: 'A last-chance upside play; his 2024 QB3 finish was a pass-TD-rate spike.' },

    // Tier 4 — his "transition tier"
    { name: 'Tyler Shough', position: 'QB', rank: 20, tier: 4, note: 'Strong situation, but he is not a believer; could be moved up a tier.' },
    { name: 'Malik Willis', position: 'QB', rank: 21, tier: 4, note: 'Undeniable rushing upside; a gamble on the floor of his passing.' },
    { name: 'Daniel Jones', position: 'QB', rank: 22, tier: 4, note: 'The first name here he is actually interested in, tempered by an Achilles injury.' },
    { name: 'C.J. Stroud', position: 'QB', rank: 23, tier: 4, note: 'Big arm and good weapons, capped by a run-and-defense team identity.' },
    { name: 'Cam Ward', position: 'QB', rank: 24, tier: 4, note: 'Year 2 upside bet he suspects he may be ranking too low.' },

    // Tier 5
    { name: 'Sam Darnold', position: 'QB', rank: 25, tier: 5, note: 'Likely 17-game starter; he is sceptical of the ceiling.' },
    { name: 'Fernando Mendoza', position: 'QB', rank: 26, tier: 5, note: 'Youthful upside undercut by a very weak receiving corps.' },
    { name: 'Bryce Young', position: 'QB', rank: 27, tier: 5, note: 'Likely 17-game starter; he is sceptical of the ceiling.' },
    { name: 'Aaron Rodgers', position: 'QB', rank: 28, tier: 5, note: 'Likely 17-game starter; he is sceptical of the ceiling.' },
    { name: 'Geno Smith', position: 'QB', rank: 29, tier: 5, note: 'Rookie behind him, but likely to play plenty; a viable bridge QB in deeper superflex formats.' },
    { name: 'Jacoby Brissett', position: 'QB', rank: 30, tier: 5, note: 'Rookie behind him, but likely to play plenty; a viable bridge QB in deeper superflex formats.' },

    // Tier 6
    { name: 'Shedeur Sanders', position: 'QB', rank: 31, tier: 6, note: 'Might start, with some young weapons around him.' },
    { name: 'Michael Penix', position: 'QB', rank: 32, tier: 6, note: 'His pick for the better Atlanta option, but not yet healthy.' },
    { name: 'Tua Tagovailoa', position: 'QB', rank: 33, tier: 6, note: 'Likely to get early work in Atlanta; not expected to hold the job long.' },
    { name: 'Carson Beck', position: 'QB', rank: 34, tier: 6, note: 'Not a favourite; Arizona do get a soft fantasy playoff schedule.' },
    { name: 'Kirk Cousins', position: 'QB', rank: 35, tier: 6, note: 'Possible Week 1 starter, not expected to score well or hold the job long.' },
    { name: 'Deshaun Watson', position: 'QB', rank: 36, tier: 6, note: 'Reportedly had the inside track in Cleveland, but reports on both options have been poor.' },
  ],
};
