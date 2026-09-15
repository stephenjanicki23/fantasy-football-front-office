import { describe, expect, it } from 'vitest';
import {
  matchSignals,
  actionableSignals,
  teamSignals,
} from '@/domain/expert-signals';
import { WEEK_1_SIGNALS_2026 } from '@/data/expert-signals';
import { normaliseName } from '@/domain/expert-rankings';
import type { Player, Position } from '@/domain/types';

function player(name: string, position: Position = 'WR'): Player {
  return { id: `p-${name}`, name, position, status: 'ACTIVE', source: 'espn', asOf: 'now' };
}

describe('WEEK_1_SIGNALS_2026 integrity', () => {
  it('is attributed, dated and scoped to the week it came from', () => {
    expect(WEEK_1_SIGNALS_2026.source).toContain('Ben Gretch');
    expect(WEEK_1_SIGNALS_2026.week).toBe(1);
    expect(WEEK_1_SIGNALS_2026.season).toBe(2026);
    expect(WEEK_1_SIGNALS_2026.publishedAt).toBe('2026-09-14');
  });

  it('records that it is part one, and which game is missing its lists', () => {
    expect(WEEK_1_SIGNALS_2026.coverage.games).toHaveLength(4);
    expect(WEEK_1_SIGNALS_2026.coverage.incomplete).toEqual(['Lions 31, Saints 30']);
    expect(WEEK_1_SIGNALS_2026.coverage.caveat).toMatch(/part 1 of week 1/i);
  });

  /**
   * The line that must not be crossed.
   *
   * The Lions-Saints writeup breaks off before its Signal and Noise lists, so nothing from
   * that game may carry either label. Promoting a paragraph he had not yet categorised
   * into "Signal" would put his name to a call he did not make.
   */
  it('labels nothing from the game whose lists were never published', () => {
    const lions = WEEK_1_SIGNALS_2026.entries.filter((e) => e.game === 'Lions 31, Saints 30');
    expect(lions.length).toBeGreaterThan(0);
    expect(lions.every((e) => e.kind === 'NOTE')).toBe(true);
  });

  it('keeps the games that do have lists labelled', () => {
    const labelled = WEEK_1_SIGNALS_2026.entries.filter(
      (e) => e.game !== 'Lions 31, Saints 30' && e.kind !== 'NOTE',
    );
    expect(labelled.some((e) => e.kind === 'SIGNAL')).toBe(true);
    expect(labelled.some((e) => e.kind === 'NOISE')).toBe(true);
  });

  it('leaves a player he deliberately left off both lists unlabelled', () => {
    // "On Davante Adams, I left him off both the Signal and the Noise."
    const adams = WEEK_1_SIGNALS_2026.entries.find((e) => e.subject === 'Davante Adams')!;
    expect(adams.kind).toBe('NOTE');
  });

  it('only marks a roster move where he states one outright', () => {
    const actions = actionableSignals(WEEK_1_SIGNALS_2026);
    const byName = new Map(actions.map((a) => [a.subject, a.action]));
    expect(byName.get('A.J. Brown')).toBe('SELL_LOW');
    expect(byName.get('Terrance Ferguson')).toBe('CUTTABLE');
    expect(byName.get('Ted Hurst')).toBe('STASH');
    expect(byName.get('Kaelon Black')).toBe('HANDCUFF');
    expect(byName.get('Juwan Johnson')).toBe('TRADE_AWAY');
    // He said nothing actionable about these, so neither do we.
    expect(byName.has('Jaxon Smith-Njigba')).toBe(false);
    expect(byName.has('Ja’Marr Chase')).toBe(false);
  });

  it('keeps offenses as teams rather than matching them onto a player', () => {
    const teams = teamSignals(WEEK_1_SIGNALS_2026).map((e) => e.subject);
    expect(teams).toEqual(['Seahawks', 'Rams', 'Bengals']);
  });

  it('carries his framing, so the entries cannot be read as conclusions', () => {
    expect(WEEK_1_SIGNALS_2026.framing.join(' ')).toMatch(/base rates|chaos/i);
  });
});

describe('matchSignals', () => {
  const pool = [
    player('Jaxon Smith-Njigba', 'WR'),
    player("Ja'Marr Chase", 'WR'),
    player('Chase Brown', 'RB'),
    player('Christian McCaffrey', 'RB'),
    player('George Kittle', 'TE'),
    player('Amon-Ra St. Brown', 'WR'),
  ];

  it('attaches his entries to the players in the pool', () => {
    const match = matchSignals(pool, WEEK_1_SIGNALS_2026);
    expect(match.matchedCount).toBe(6);
    const kittle = match.byPlayerId.get('p-George Kittle')!;
    expect(kittle[0]!.kind).toBe('NOISE');
    expect(kittle[0]!.stat).toContain('36% routes');
  });

  it('matches the curly apostrophe he publishes against ESPN’s spelling', () => {
    const match = matchSignals(pool, WEEK_1_SIGNALS_2026);
    expect(match.byPlayerId.has("p-Ja'Marr Chase")).toBe(true);
    expect(normaliseName('Ja’Marr Chase')).toBe(normaliseName("Ja'Marr Chase"));
  });

  it('never matches a team entry onto a player who shares the name', () => {
    const withRams = [...pool, player('Rams', 'WR')];
    const match = matchSignals(withRams, WEEK_1_SIGNALS_2026);
    expect(match.byPlayerId.has('p-Rams')).toBe(false);
  });

  it('will not put a running back’s note on a receiver of the same name', () => {
    const wrongPosition = [player('Chase Brown', 'WR')];
    const match = matchSignals(wrongPosition, WEEK_1_SIGNALS_2026);
    expect(match.byPlayerId.has('p-Chase Brown')).toBe(false);
    expect(match.unmatched).toContain('Chase Brown');
  });

  it('reports the players it could not find rather than dropping them', () => {
    const match = matchSignals(pool, WEEK_1_SIGNALS_2026);
    expect(match.unmatched.length).toBeGreaterThan(0);
    expect(match.unmatched).toContain('A.J. Brown');
  });

  it('says in its derivation that this is part of a week, not all of it', () => {
    const match = matchSignals(pool, WEEK_1_SIGNALS_2026);
    expect(match.explain.formula).toMatch(/Week 1/);
    expect(match.explain.formula).toMatch(/Part 1 of Week 1/i);
    expect(match.explain.sources[0]).toContain('expert-signals');
  });
});
