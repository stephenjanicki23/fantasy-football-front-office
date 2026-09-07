import type { ExpertRankingSet } from '@/domain/expert-rankings';

/**
 * WR tiers, 2026 — Ben Gretch (Stealing Signals).
 *
 * Built for FULL PPR, while this league is 0.5. Receiver is where that gap bites hardest:
 * reception volume varies more across receivers than any other position, so a full-PPR
 * ordering misprices them here more than it does backs. As with the RB set, his ranks are
 * left untouched and the difference is computed from projections instead.
 *
 * He places two Big Tier Breaks: after Tier 3 (his first, at WR12) and before Tier 6
 * (at WR48), which he describes as roughly where real receiver upside fades out.
 *
 * `designationBasis` separates labels he applied to individuals from those read off a
 * statement covering a group — his late-round Target list was described as "starting with
 * Denzel Boston, a bunch of rookies and second-year guys", so those are marked inferred.
 */
export const WR_TIERS_2026: ExpertRankingSet = {
  source: 'Ben Gretch — Stealing Signals',
  sourceUrl: 'https://bengretch.substack.com',
  season: 2026,
  asOf: '2026-09-07',
  scoringNote:
    'Built for FULL PPR. This league is 0.5 PPR, which compresses the gap between high-volume possession receivers and lower-volume deep threats; the app computes the shift rather than editing his ranks.',
  sourceScoring: { receptionPoints: 1 },
  bigTierBreakAfterRanks: [12, 48],
  guidance: [
    'The first Big Tier Break comes after WR12, and the receiver ranges just past it mirror the RB Dead Zone — weigh ADP and the profiles actually available to you.',
    'When taking receivers in the middle rounds, prioritise players who can command a massive share of their own offense.',
    'Real receiver upside starts to fade out around WR48, especially in managed leagues; the late-round Targets after that are your upside-swing short list.',
    'Do not overpay for a market-agreed breakout arc that is not clearly in the profile, even when that arc might be right.',
  ],
  players: [

    // Tier 1
    { name: 'Puka Nacua', position: 'WR', rank: 1, tier: 1, subTier: '1', designation: 'TARGET', designationBasis: 'stated', note: 'Liked above his ADP; his target-per-route-run rate creates a ceiling few at the position can reach.' },
    { name: 'Ja\'Marr Chase', position: 'WR', rank: 2, tier: 1, subTier: '1', designation: 'TARGET', designationBasis: 'stated', note: 'Liked above his ADP; profile called even stronger than the year he was the 1.01.' },
    { name: 'Jaxon Smith-Njigba', position: 'WR', rank: 3, tier: 1, subTier: '1', note: 'No Target tag only because he is interesting nearer ADP; one year of unicorn production against a possibly limiting offense.' },

    // Tier 2
    { name: 'Amon-Ra St. Brown', position: 'WR', rank: 4, tier: 2, subTier: '2', note: 'Top-three PPR finish three straight years in a highly concentrated offense.' },
    { name: 'CeeDee Lamb', position: 'WR', rank: 5, tier: 2, subTier: '2', note: 'Played hurt each of the past two years; his down year still compared well to his new teammate on a per-route basis.' },
    { name: 'Justin Jefferson', position: 'WR', rank: 6, tier: 2, subTier: '2', note: 'Possibly still the best WR in football, priced down on Minnesota concerns.' },
    { name: 'A.J. Brown', position: 'WR', rank: 7, tier: 2, subTier: '2', note: 'Older and on a new team, but he is in at the cost.' },
    { name: 'Malik Nabers', position: 'WR', rank: 8, tier: 2, subTier: '2', note: 'Coming off a major injury, but he is in at the cost.' },

    // Tier 3
    { name: 'Drake London', position: 'WR', rank: 9, tier: 3, subTier: '3', note: 'Exceptional talent with real ceiling; mildly less excited than a year ago on a similar thesis.' },
    { name: 'Nico Collins', position: 'WR', rank: 10, tier: 3, subTier: '3', note: 'Team pass-volume concerns paired with minor cracks in an elite per-route profile at this ADP.' },
    { name: 'Rashee Rice', position: 'WR', rank: 11, tier: 3, subTier: '3', note: 'A set-up bet rather than a profile bet; he thinks the Chiefs pass-catchers are collectively underpriced.' },
    { name: 'George Pickens', position: 'WR', rank: 12, tier: 3, subTier: '3', note: 'Showed last year he is clearly ahead of the rest of that receiver room, in an offense worth drafting into.' },

    // Tier 4
    { name: 'Zay Flowers', position: 'WR', rank: 13, tier: 4, subTier: '4', note: 'The Ravens skill group is in transition and he is the one who has to hit in a good Baltimore season.' },
    { name: 'Garrett Wilson', position: 'WR', rank: 14, tier: 4, subTier: '4', note: 'He says he will be really heavy on Wilson again and would put him a tier higher but for ADP.' },
    { name: 'Tetairoa McMillan', position: 'WR', rank: 15, tier: 4, subTier: '4', note: 'A clean Year 2 profile worth being in on, though the offense may hold him back.' },

    // Tier 5a
    { name: 'Chris Olave', position: 'WR', rank: 16, tier: 5, subTier: '5a', note: 'Not expressly a Fade; a good-not-elite profile at a tricky price, helped by the tempo of the offense.' },
    { name: 'Emeka Egbuka', position: 'WR', rank: 17, tier: 5, subTier: '5a', note: 'Not a Fade, but priced with a lot of confidence in one specific Year 2 outcome.' },
    { name: 'DeVonta Smith', position: 'WR', rank: 18, tier: 5, subTier: '5a', note: 'Not expressly a Fade; a good-not-elite profile at a tricky price.' },
    { name: 'Luther Burden', position: 'WR', rank: 19, tier: 5, subTier: '5a', designation: 'TARGET', designationBasis: 'stated', note: 'Called another great Target; open to the crowd being right that he is a better play than Jameson Williams.' },
    { name: 'Jameson Williams', position: 'WR', rank: 20, tier: 5, subTier: '5a', designation: 'TARGET', designationBasis: 'inferred', note: 'Gun to his head he would draft Williams ahead of everyone in this tier; ranked lower only because of ADP.' },
    { name: 'Terry McLaurin', position: 'WR', rank: 21, tier: 5, subTier: '5a' },
    { name: 'Tee Higgins', position: 'WR', rank: 22, tier: 5, subTier: '5a', note: 'His issues do not make Higgins a Fade, but he is being selective on routes with so many Targets in this range.' },

    // Tier 5b
    { name: 'Ladd McConkey', position: 'WR', rank: 23, tier: 5, subTier: '5b', note: 'Behind ADP; not explicitly a Fade profile, but a steep price to find out if he takes the step.' },
    { name: 'Jaylen Waddle', position: 'WR', rank: 24, tier: 5, subTier: '5b', note: 'Behind ADP and more worried about missing here; already hobbling in camp.' },
    { name: 'D.J. Moore', position: 'WR', rank: 25, tier: 5, subTier: '5b', note: 'One he is comfortable with in this range.' },
    { name: 'Rome Odunze', position: 'WR', rank: 26, tier: 5, subTier: '5b', note: 'One he is comfortable with in this range.' },
    { name: 'Parker Washington', position: 'WR', rank: 27, tier: 5, subTier: '5b', note: 'Taking the bait a little on heavy camp noise.' },
    { name: 'Mike Evans', position: 'WR', rank: 28, tier: 5, subTier: '5b', note: 'Close to a Fade on age, but he would much rather make the old-man bet here than on Davante Adams.' },
    { name: 'Christian Watson', position: 'WR', rank: 29, tier: 5, subTier: '5b', note: 'He would rather play the Packers through the other receivers.' },
    { name: 'Davante Adams', position: 'WR', rank: 30, tier: 5, subTier: '5b', note: 'He does not understand Adams going ahead of Mike Evans.' },
    { name: 'Jordyn Tyson', position: 'WR', rank: 31, tier: 5, subTier: '5b', note: 'Cheap rookie; a better offense than Makai Lemon, hence the pricing gap.' },
    { name: 'DK Metcalf', position: 'WR', rank: 32, tier: 5, subTier: '5b', note: 'Called an easy value.' },
    { name: 'Makai Lemon', position: 'WR', rank: 33, tier: 5, subTier: '5b', note: 'Optimistic on the player despite the weaker offense.' },
    { name: 'Carnell Tate', position: 'WR', rank: 34, tier: 5, subTier: '5b', note: 'Not out on him, but not really in either.' },
    { name: 'Josh Downs', position: 'WR', rank: 35, tier: 5, subTier: '5b', note: 'Projected closely to McConkey, Egbuka and Watson; could go where McConkey goes and that would be fine.' },

    // Tier 5c
    { name: 'Brian Thomas', position: 'WR', rank: 36, tier: 5, subTier: '5c', note: 'A tough play, but not a Fade profile at this cost; watching camp news.' },
    { name: 'Marvin Harrison', position: 'WR', rank: 37, tier: 5, subTier: '5c', note: 'A tough play, but not a Fade profile at this cost; watching camp news.' },
    { name: 'Jayden Reed', position: 'WR', rank: 38, tier: 5, subTier: '5c', note: 'A fun Packers play.' },
    { name: 'Michael Wilson', position: 'WR', rank: 39, tier: 5, subTier: '5c', note: 'Probably deserves better given his scepticism on Harrison, though the offense has other mouths.' },
    { name: 'Jordan Addison', position: 'WR', rank: 40, tier: 5, subTier: '5c', note: 'Still good at football, and very cheap.' },
    { name: 'Xavier Worthy', position: 'WR', rank: 41, tier: 5, subTier: '5c', note: 'If Rice does not pay off his price, this is probably where the Chiefs value lands instead.' },
    { name: 'Chris Godwin', position: 'WR', rank: 42, tier: 5, subTier: '5c', note: 'A solid veteran value; reports are he is looking great after a compromised season.' },
    { name: 'Alec Pierce', position: 'WR', rank: 43, tier: 5, subTier: '5c' },
    { name: 'Michael Pittman', position: 'WR', rank: 44, tier: 5, subTier: '5c', note: 'A solid veteran value with multiple 140-plus target seasons behind him.' },
    { name: 'Wan\'Dale Robinson', position: 'WR', rank: 45, tier: 5, subTier: '5c', note: 'A solid veteran value with multiple 140-plus target seasons behind him.' },
    { name: 'KC Concepcion', position: 'WR', rank: 46, tier: 5, subTier: '5c', note: 'A great profile; if Cleveland find anything at QB he is this year’s underdrafted first-round rookie.' },
    { name: 'Jayden Higgins', position: 'WR', rank: 47, tier: 5, subTier: '5c', note: 'Betting on a fun prospect profile and a Year 2 step forward.' },
    { name: 'Matthew Golden', position: 'WR', rank: 48, tier: 5, subTier: '5c', note: 'A fun Packers play.' },

    // Tier 6
    { name: 'Khalil Shakir', position: 'WR', rank: 49, tier: 6, subTier: '6', note: 'Fine, and maybe belongs above, but hard to see how the additions help him.' },
    { name: 'Courtland Sutton', position: 'WR', rank: 50, tier: 6, subTier: '6', note: 'Looks less interesting with the additions, plus Pat Bryant behind him.' },
    { name: 'Stefon Diggs', position: 'WR', rank: 51, tier: 6, subTier: '6', note: 'Among the veterans in this range he sees as lacking upside.' },
    { name: 'Quentin Johnston', position: 'WR', rank: 52, tier: 6, subTier: '6', note: 'The one he would most fear being wrong on, but he has zero desire to draft the profile.' },
    { name: 'Jalen Coker', position: 'WR', rank: 53, tier: 6, subTier: '6' },
    { name: 'Jakobi Meyers', position: 'WR', rank: 54, tier: 6, subTier: '6' },
    { name: 'Romeo Doubs', position: 'WR', rank: 55, tier: 6, subTier: '6' },
    { name: 'Denzel Boston', position: 'WR', rank: 56, tier: 6, subTier: '6', designation: 'TARGET', designationBasis: 'inferred', note: 'Start of the late-round rookie and second-year Target group he describes as the upside-swing short list.' },
    { name: 'Travis Hunter', position: 'WR', rank: 57, tier: 6, subTier: '6', designation: 'TARGET', designationBasis: 'inferred', note: 'Part of the late-round rookie and second-year Target group.' },
    { name: 'Omar Cooper', position: 'WR', rank: 58, tier: 6, subTier: '6', designation: 'TARGET', designationBasis: 'inferred', note: 'Part of the late-round rookie and second-year Target group.' },
    { name: 'De\'Zhaun Stribling', position: 'WR', rank: 59, tier: 6, subTier: '6', designation: 'TARGET', designationBasis: 'inferred', note: 'Part of the late-round rookie and second-year Target group.' },
    { name: 'Pat Bryant', position: 'WR', rank: 60, tier: 6, subTier: '6', designation: 'TARGET', designationBasis: 'inferred', note: 'Part of the late-round rookie and second-year Target group.' },
    { name: 'Zachariah Branch', position: 'WR', rank: 61, tier: 6, subTier: '6', designation: 'TARGET', designationBasis: 'inferred', note: 'Part of the late-round rookie and second-year Target group.' },
    { name: 'Tre Harris', position: 'WR', rank: 62, tier: 6, subTier: '6', designation: 'TARGET', designationBasis: 'inferred', note: 'Part of the late-round rookie and second-year Target group.' },
    { name: 'Jerry Jeudy', position: 'WR', rank: 63, tier: 6, subTier: '6', note: 'A cheap veteran who may get boxed out, but there is a path to real target share.' },
    { name: 'Rashid Shaheed', position: 'WR', rank: 64, tier: 6, subTier: '6', note: 'A cheap veteran, reasonable in certain formats.' },
    { name: 'Deebo Samuel', position: 'WR', rank: 65, tier: 6, subTier: '6', note: 'A cheap veteran, reasonable in certain formats.' },
    { name: 'Calvin Ridley', position: 'WR', rank: 66, tier: 6, subTier: '6', note: 'A cheap veteran who may get boxed out, but there is a path to real target share.' },
    { name: 'Tre Tucker', position: 'WR', rank: 67, tier: 6, subTier: '6', note: 'A cheap veteran, reasonable in certain formats.' },
    { name: 'Cyrus Allen', position: 'WR', rank: 68, tier: 6, subTier: '6', designation: 'TARGET', designationBasis: 'stated', note: 'Included in the late-round Target list because he is making a lot of camp noise.' },

    // Tier 7
    { name: 'Jalen McMillan', position: 'WR', rank: 69, tier: 7, subTier: '7' },
    { name: 'Adonai Mitchell', position: 'WR', rank: 70, tier: 7, subTier: '7' },
    { name: 'Rashod Bateman', position: 'WR', rank: 71, tier: 7, subTier: '7' },
    { name: 'Ryan Flournoy', position: 'WR', rank: 72, tier: 7, subTier: '7' },
    { name: 'Ja\'Kobi Lane', position: 'WR', rank: 73, tier: 7, subTier: '7' },
    { name: 'Caleb Douglas', position: 'WR', rank: 74, tier: 7, subTier: '7' },
    { name: 'Germie Bernard', position: 'WR', rank: 75, tier: 7, subTier: '7' },
    { name: 'Malik Washington', position: 'WR', rank: 76, tier: 7, subTier: '7' },
    { name: 'Elijah Sarratt', position: 'WR', rank: 77, tier: 7, subTier: '7' },
    { name: 'Jauan Jennings', position: 'WR', rank: 78, tier: 7, subTier: '7' },
    { name: 'Kayshon Boutte', position: 'WR', rank: 79, tier: 7, subTier: '7' },
    { name: 'Antonio Williams', position: 'WR', rank: 80, tier: 7, subTier: '7' },
    { name: 'Malachi Fields', position: 'WR', rank: 81, tier: 7, subTier: '7' },
    { name: 'Tory Horton', position: 'WR', rank: 82, tier: 7, subTier: '7' },
    { name: 'Troy Franklin', position: 'WR', rank: 83, tier: 7, subTier: '7' },
    { name: 'Ted Hurst', position: 'WR', rank: 84, tier: 7, subTier: '7' },
    { name: 'Brenen Thompson', position: 'WR', rank: 85, tier: 7, subTier: '7' },
    { name: 'Jaylin Noel', position: 'WR', rank: 86, tier: 7, subTier: '7' },
    { name: 'Chris Bell', position: 'WR', rank: 87, tier: 7, subTier: '7' },
    { name: 'Zavion Thomas', position: 'WR', rank: 88, tier: 7, subTier: '7' },
    { name: 'Jack Bech', position: 'WR', rank: 89, tier: 7, subTier: '7' },
    { name: 'Dontayvion Wicks', position: 'WR', rank: 90, tier: 7, subTier: '7' },
    { name: 'Keenan Allen', position: 'WR', rank: 91, tier: 7, subTier: '7' },
    { name: 'Jalen Royals', position: 'WR', rank: 92, tier: 7, subTier: '7' },
    { name: 'Jalen Nailor', position: 'WR', rank: 93, tier: 7, subTier: '7' },
    { name: 'Isaac TeSlaa', position: 'WR', rank: 94, tier: 7, subTier: '7' },
  ],
};
