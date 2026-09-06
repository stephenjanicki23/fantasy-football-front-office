import type { ExpertRankingSet } from '@/domain/expert-rankings';

/**
 * RB tiers, 2026 — Ben Gretch (Stealing Signals).
 *
 * IMPORTANT: these were built for FULL PPR, while this league is 0.5 PPR. That is not a
 * cosmetic difference at running back — it is the position where reception volume varies
 * most, so a full-PPR ordering systematically overrates pass-catching backs here. The app
 * does not hand-edit his ranks for that; it computes the shift from projections (see
 * `format-adjustment.ts`) and displays both his rank and where this league's scoring puts
 * the same player.
 *
 * `designationBasis` separates the labels he applied to individuals from those read off a
 * statement covering a range. His Fade call on the mid-round veterans was phrased as
 * covering "the more expensive floor-based plays through to Javonte Williams" rather than
 * naming each, so those four are marked inferred and shown as such.
 *
 * He places one Big Tier Break, after Jahmyr Gibbs alone, while noting he finds a
 * one-player tier break absurd and that it could be argued it belongs after Jonathan
 * Taylor instead.
 */
export const RB_TIERS_2026: ExpertRankingSet = {
  source: 'Ben Gretch — Stealing Signals',
  sourceUrl: 'https://bengretch.substack.com',
  season: 2026,
  asOf: '2026-09-06',
  scoringNote:
    'Built for FULL PPR. This league is 0.5 PPR, so pass-catching backs are overrated by these ranks and rushing-heavy backs underrated; the app computes the shift rather than editing his ranks.',
  sourceScoring: { receptionPoints: 1 },
  guidance: [
    'The RB Dead Zone is a dangerous place to spend draft capital, especially on the expensive veteran floor plays.',
    'Value in the Dead Zone goes very flat — similar bets are available later, so the opportunity cost of waiting is low.',
    'If you are cautious through the Dead Zone, be proactive in Tier 5: it is a last-chance saloon before the bets get far less dependable.',
    'Late-round RB ADP is currently softer than these ranks, so depth can be built cheaply at the end of drafts.',
    'Playing purely for upside is less clear-cut than it used to be; in an easier league, taking some early-season RB floor is defensible when the opportunity cost is low.',
  ],
  players: [

    // Tier 1
    { name: 'Jahmyr Gibbs', position: 'RB', rank: 1, tier: 1, subTier: '1', designation: 'TARGET', designationBasis: 'stated', note: 'Own tier with a Big Tier Break after him; argued as worth paying up for in auctions on the strength of an unusually high floor as well as ceiling.' },

    // Tier 2
    { name: 'Bijan Robinson', position: 'RB', rank: 2, tier: 2, subTier: '2', note: 'Still very high on the floor-plus-ceiling combination; mild concern over the OC change and the QB spot.' },
    { name: 'Christian McCaffrey', position: 'RB', rank: 3, tier: 2, subTier: '2', note: 'If anyone justified a one-man tier on results it would be him; still very much worth the gamble.' },
    { name: 'Jonathan Taylor', position: 'RB', rank: 4, tier: 2, subTier: '2', note: 'Called an optimistic ranking; the routes spike and pre-injury form were promising.' },

    // Tier 3a
    { name: 'Omarion Hampton', position: 'RB', rank: 5, tier: 3, subTier: '3a', note: 'Aggressive relative to his own projections; his favourite way to play Chargers optimism.' },
    { name: 'Ashton Jeanty', position: 'RB', rank: 6, tier: 3, subTier: '3a', note: 'Similar profile to Hampton in a worse offense; not labelled a Target only because he is ranked near ADP.' },
    { name: 'James Cook', position: 'RB', rank: 7, tier: 3, subTier: '3a', note: 'Not a Fade at this price, but sceptical of the receiving-bump narrative under a new OC.' },
    { name: 'Chase Brown', position: 'RB', rank: 8, tier: 3, subTier: '3a', note: 'Projected really well; a locked-in three-down back with little competition in a strong offense.' },
    { name: 'Kenneth Walker', position: 'RB', rank: 9, tier: 3, subTier: '3a', note: 'An unprojectable-efficiency bet leaning on team context rather than his own projections.' },

    // Tier 3b
    { name: 'Breece Hall', position: 'RB', rank: 10, tier: 3, subTier: '3b', designation: 'TARGET', designationBasis: 'stated', note: 'Receiving work should rebound; has been very good despite a lack of TDs.' },
    { name: 'Saquon Barkley', position: 'RB', rank: 11, tier: 3, subTier: '3b', designation: 'FADE', designationBasis: 'stated', note: 'One of three overly rushing-efficiency-dependent fades; age plus a lack of receiving upside.' },
    { name: 'Jeremiyah Love', position: 'RB', rank: 12, tier: 3, subTier: '3b', note: 'A normal pick rather than a Target; RB air yards potential, tempered by a weak offensive environment.' },
    { name: 'Derrick Henry', position: 'RB', rank: 13, tier: 3, subTier: '3b', designation: 'FADE', designationBasis: 'stated', note: 'One of three overly rushing-efficiency-dependent fades; age plus a lack of receiving upside.' },
    { name: 'De\'Von Achane', position: 'RB', rank: 14, tier: 3, subTier: '3b', designation: 'FADE', designationBasis: 'stated', note: 'One of three overly rushing-efficiency-dependent fades; more risk on the tails.' },

    // Tier 4a
    { name: 'Bhayshul Tuten', position: 'RB', rank: 15, tier: 4, subTier: '4a', note: 'Ranked deliberately aggressively; he says this feels super aggressive but likes the upside outcomes.' },
    { name: 'Cam Skattebo', position: 'RB', rank: 16, tier: 4, subTier: '4a', note: 'A viable Year 2 bet.' },
    { name: 'Quinshon Judkins', position: 'RB', rank: 17, tier: 4, subTier: '4a', note: 'A viable Year 2 bet.' },
    { name: 'Kyren Williams', position: 'RB', rank: 18, tier: 4, subTier: '4a', designation: 'FADE', designationBasis: 'inferred', note: 'Covered by his Fade call on the more expensive floor-based plays through to Javonte Williams.' },
    { name: 'Travis Etienne', position: 'RB', rank: 19, tier: 4, subTier: '4a', designation: 'FADE', designationBasis: 'inferred', note: 'Covered by his Fade call on the more expensive floor-based plays through to Javonte Williams.' },
    { name: 'D\'Andre Swift', position: 'RB', rank: 20, tier: 4, subTier: '4a', designation: 'FADE', designationBasis: 'inferred', note: 'Covered by the Fade call on expensive floor plays, though he names Swift as the veteran he would most consider.' },
    { name: 'Javonte Williams', position: 'RB', rank: 21, tier: 4, subTier: '4a', designation: 'FADE', designationBasis: 'inferred', note: 'The named endpoint of his Fade call on the more expensive floor-based plays.' },
    { name: 'TreVeyon Henderson', position: 'RB', rank: 22, tier: 4, subTier: '4a', note: 'He describes himself as all over the place on him.' },
    { name: 'David Montgomery', position: 'RB', rank: 23, tier: 4, subTier: '4a', note: 'A veteran floor play he cannot fully ignore.' },
    { name: 'Bucky Irving', position: 'RB', rank: 24, tier: 4, subTier: '4a', note: 'Last year’s injuries are a real concern.' },
    { name: 'Josh Jacobs', position: 'RB', rank: 25, tier: 4, subTier: '4a', note: 'Nagging injuries after a heavy workload, plus off-field concerns.' },
    { name: 'Jadarian Price', position: 'RB', rank: 26, tier: 4, subTier: '4a', note: 'A tricky one he has spent a lot of time on; a talent-based upside bet.' },
    { name: 'Jaylen Warren', position: 'RB', rank: 27, tier: 4, subTier: '4a', designation: 'TARGET', designationBasis: 'stated', note: 'The only Target in this tier, largely because he goes far later than this rank.' },

    // Tier 4b
    { name: 'Jonathon Brooks', position: 'RB', rank: 28, tier: 4, subTier: '4b', note: 'Potentially generational, or a huge mistake.' },
    { name: 'RJ Harvey', position: 'RB', rank: 29, tier: 4, subTier: '4b', note: 'Described as an enigma.' },
    { name: 'Rico Dowdle', position: 'RB', rank: 30, tier: 4, subTier: '4b', note: 'Could be more involved in the split than expected, which would make him a screaming value.' },

    // Tier 5
    { name: 'J.K. Dobbins', position: 'RB', rank: 31, tier: 5, subTier: '5', note: 'Injury risk, but a nice value for early RB scoring in managed leagues.' },
    { name: 'Tony Pollard', position: 'RB', rank: 32, tier: 5, subTier: '5' },
    { name: 'Rhamondre Stevenson', position: 'RB', rank: 33, tier: 5, subTier: '5' },
    { name: 'Chuba Hubbard', position: 'RB', rank: 34, tier: 5, subTier: '5' },
    { name: 'Kyle Monangai', position: 'RB', rank: 35, tier: 5, subTier: '5', note: 'A nice Year 2 play with some warts.' },
    { name: 'Blake Corum', position: 'RB', rank: 36, tier: 5, subTier: '5', note: 'Viewed mostly as a No. 2 with high-value-touch concerns.' },
    { name: 'Rachaad White', position: 'RB', rank: 37, tier: 5, subTier: '5', note: 'Early snap share should make his ADP look silly by about Week 3.' },
    { name: 'Keaton Mitchell', position: 'RB', rank: 38, tier: 5, subTier: '5', note: 'More of a pure upside bet, with possibly more floor than meets the eye.' },
    { name: 'Jordan Mason', position: 'RB', rank: 39, tier: 5, subTier: '5', note: 'Early snap share should make his ADP look silly by about Week 3.' },
    { name: 'Jacory Croskey-Merritt', position: 'RB', rank: 40, tier: 5, subTier: '5', note: 'A nice Year 2 play with some warts.' },
    { name: 'Kenneth Gainwell', position: 'RB', rank: 41, tier: 5, subTier: '5' },
    { name: 'Chris Rodriguez', position: 'RB', rank: 42, tier: 5, subTier: '5', note: 'Similar early-scoring appeal, but he wants to play him more cheaply given a higher-drafted teammate.' },
    { name: 'Tyrone Tracy', position: 'RB', rank: 43, tier: 5, subTier: '5', note: 'Viewed mostly as a No. 2 with high-value-touch concerns.' },

    // Tier 6a
    { name: 'Aaron Jones', position: 'RB', rank: 44, tier: 6, subTier: '6a', note: 'Ranked a tier below reasonable; likely to play in September but the peripherals are shot.' },
    { name: 'Tank Bigsby', position: 'RB', rank: 45, tier: 6, subTier: '6a' },
    { name: 'Dylan Sampson', position: 'RB', rank: 46, tier: 6, subTier: '6a' },
    { name: 'Tyjae Spears', position: 'RB', rank: 47, tier: 6, subTier: '6a' },
    { name: 'Emmett Johnson', position: 'RB', rank: 48, tier: 6, subTier: '6a' },
    { name: 'Ray Davis', position: 'RB', rank: 49, tier: 6, subTier: '6a' },
    { name: 'Marshawn Lloyd', position: 'RB', rank: 50, tier: 6, subTier: '6a' },
    { name: 'Demond Claiborne', position: 'RB', rank: 51, tier: 6, subTier: '6a' },
    { name: 'Jaydon Blue', position: 'RB', rank: 52, tier: 6, subTier: '6a' },
    { name: 'Isiah Pacheco', position: 'RB', rank: 53, tier: 6, subTier: '6a' },
    { name: 'Jonah Coleman', position: 'RB', rank: 54, tier: 6, subTier: '6a' },
    { name: 'Mike Washington', position: 'RB', rank: 55, tier: 6, subTier: '6a' },

    // Tier 6b
    { name: 'Woody Marks', position: 'RB', rank: 56, tier: 6, subTier: '6b', note: 'Drafted higher than this; he is not confident Marks holds a lead role or is efficient enough to matter.' },
    { name: 'Tyler Allgeier', position: 'RB', rank: 57, tier: 6, subTier: '6b', designation: 'FADE', designationBasis: 'stated', note: 'Fading him doing enough behind an elite back in a tough offense.' },
    { name: 'Zach Charbonnet', position: 'RB', rank: 58, tier: 6, subTier: '6b', designation: 'FADE', designationBasis: 'stated', note: 'Fading him coming off a serious injury.' },
    { name: 'Alvin Kamara', position: 'RB', rank: 59, tier: 6, subTier: '6b', designation: 'FADE', designationBasis: 'stated', note: 'Fading him being good enough to hold a role; the peripherals have cratered.' },
    { name: 'Adam Randall', position: 'RB', rank: 60, tier: 6, subTier: '6b', note: 'He has some optimism here.' },
    { name: 'Kaelon Black', position: 'RB', rank: 61, tier: 6, subTier: '6b' },
    { name: 'Isaiah Davis', position: 'RB', rank: 62, tier: 6, subTier: '6b' },
    { name: 'Braelon Allen', position: 'RB', rank: 63, tier: 6, subTier: '6b' },
    { name: 'Brian Robinson', position: 'RB', rank: 64, tier: 6, subTier: '6b', note: 'Similar role concern to Woody Marks, with a weaker pass-down projection.' },
    { name: 'George Holani', position: 'RB', rank: 65, tier: 6, subTier: '6b' },
    { name: 'Emanuel Wilson', position: 'RB', rank: 66, tier: 6, subTier: '6b' },
    { name: 'Sean Tucker', position: 'RB', rank: 67, tier: 6, subTier: '6b' },
    { name: 'Tahj Brooks', position: 'RB', rank: 68, tier: 6, subTier: '6b', note: 'A shot in the dark, but into perhaps the most open No. 2 role in a very strong offense.' },
    { name: 'Jaylen Wright', position: 'RB', rank: 69, tier: 6, subTier: '6b' },
    { name: 'Justice Hill', position: 'RB', rank: 70, tier: 6, subTier: '6b' },
    { name: 'Emari Demercado', position: 'RB', rank: 71, tier: 6, subTier: '6b' },
    { name: 'Kaytron Allen', position: 'RB', rank: 72, tier: 6, subTier: '6b' },
    { name: 'DJ Giddens', position: 'RB', rank: 73, tier: 6, subTier: '6b' },
    { name: 'Jordan James', position: 'RB', rank: 74, tier: 6, subTier: '6b' },
    { name: 'Trey Benson', position: 'RB', rank: 75, tier: 6, subTier: '6b', designation: 'TARGET', designationBasis: 'stated', note: 'Marked a Target largely because it is early August; looked OK before getting hurt last year.' },
    { name: 'Nicholas Singleton', position: 'RB', rank: 76, tier: 6, subTier: '6b' },
    { name: 'Kimani Vidal', position: 'RB', rank: 77, tier: 6, subTier: '6b' },
    { name: 'Seth McGowan', position: 'RB', rank: 78, tier: 6, subTier: '6b' },
    { name: 'Ollie Gordon', position: 'RB', rank: 79, tier: 6, subTier: '6b' },
    { name: 'Malik Davis', position: 'RB', rank: 80, tier: 6, subTier: '6b', note: 'A decent bet to thrive if the back ahead of him struggles.' },
    { name: 'Jawhar Jordan', position: 'RB', rank: 81, tier: 6, subTier: '6b' },
    { name: 'Trevor Etienne', position: 'RB', rank: 82, tier: 6, subTier: '6b' },
    { name: 'Raheim Sanders', position: 'RB', rank: 83, tier: 6, subTier: '6b' },
    { name: 'Jarquez Hunter', position: 'RB', rank: 84, tier: 6, subTier: '6b' },
    { name: 'Devin Neal', position: 'RB', rank: 85, tier: 6, subTier: '6b' },
    { name: 'Devin Singletary', position: 'RB', rank: 86, tier: 6, subTier: '6b' },
    { name: 'Samaje Perine', position: 'RB', rank: 87, tier: 6, subTier: '6b' },
    { name: 'Kendre Miller', position: 'RB', rank: 88, tier: 6, subTier: '6b', designation: 'TARGET', designationBasis: 'stated', note: 'Marked a Target largely because it is early August; looked OK before getting hurt last year.' },
    { name: 'Will Shipley', position: 'RB', rank: 89, tier: 6, subTier: '6b' },
    { name: 'Roschon Johnson', position: 'RB', rank: 90, tier: 6, subTier: '6b' },
    { name: 'Isaac Guerendo', position: 'RB', rank: 91, tier: 6, subTier: '6b' },
  ],
};
