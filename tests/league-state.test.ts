import { describe, expect, it } from 'vitest';
import { poolWarnings, inferCurrentWeek } from '@/services/league-state';
import { DEFAULT_LEAGUE_CONFIG } from '@/domain/league-config';

const config = DEFAULT_LEAGUE_CONFIG; // 8 teams

describe('poolWarnings', () => {
  it('says so loudly when no players came back at all', () => {
    const warnings = poolWarnings(config, 0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/no players were returned/i);
    // The reason matters: before a draft the pool is not "rosters plus free agents".
    expect(warnings[0]).toMatch(/rosters are\s+empty before a draft/i);
  });

  it('warns when the pool cannot cover the draft', () => {
    const picks = config.teamCount * config.draftRounds;
    const warnings = poolWarnings(config, picks - 1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(`${picks} picks`);
  });

  it('stays quiet for a pool that covers the draft', () => {
    expect(poolWarnings(config, config.teamCount * config.draftRounds)).toEqual([]);
    expect(poolWarnings(config, 400)).toEqual([]);
  });
});

describe('inferCurrentWeek', () => {
  it('is one past the last completed week, and zero before any', () => {
    expect(inferCurrentWeek([])).toBe(0);
    expect(
      inferCurrentWeek([
        { week: 1, homeTeamId: 'a', awayTeamId: 'b', completed: true, isPlayoff: false },
        { week: 2, homeTeamId: 'a', awayTeamId: 'b', completed: false, isPlayoff: false },
      ]),
    ).toBe(1);
  });
});
