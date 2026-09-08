import { getProviders, resolveProviderMode, type ProviderMode } from '@/providers/registry';
import type { LeagueState } from '@/domain/types';
import type { ConnectionStatus } from '@/providers/types';
import { EXPERT_RANKING_SETS, mergedExpertRankings } from '@/data/expert-rankings';

/**
 * League state assembly.
 *
 * Every page gets its data from here, so there is exactly one place that knows how to
 * turn providers into a `LeagueState`. Failures are carried alongside the data rather
 * than thrown, so a page can render "ESPN unreachable" next to whatever it does have.
 */

export interface LoadedLeagueState {
  state: LeagueState;
  mode: ProviderMode;
  /** True when the data is synthetic sample data. */
  isSample: boolean;
  status: ConnectionStatus;
  /** Non-fatal problems worth showing the user. */
  warnings: string[];
  asOf: string;
}

export async function loadLeagueState(
  options: { mode?: ProviderMode; week?: number } = {},
): Promise<LoadedLeagueState> {
  const mode = options.mode ?? resolveProviderMode();
  const providers = await getProviders(mode);
  const warnings: string[] = [];

  if (providers.fellBack) {
    warnings.push(
      'ESPN is selected but not configured, so the app is showing synthetic sample data. Add your league id and cookies on the ESPN Connection page.',
    );
  }

  const snapshot = await providers.league.getSnapshot();

  if (!snapshot.ok || !snapshot.data) {
    // Fall back to the sample so the UI can still render, but say so loudly.
    const sample = await getProviders('sample');
    const sampleSnapshot = await sample.league.getSnapshot();
    const sampleProjections = await sample.projections.getSeasonProjections(
      sampleSnapshot.data?.config.season ?? new Date().getFullYear(),
    );

    return {
      state: {
        config: sampleSnapshot.data!.config,
        teams: sampleSnapshot.data!.teams,
        players: sampleSnapshot.data!.players,
        seasonProjections: sampleProjections.data ?? [],
        weeklyProjections: [],
        injuries: [],
        adp: [],
        matchups: sampleSnapshot.data!.matchups,
        expertRankings: mergedExpertRankings() ?? undefined,
        expertRankingSets: EXPERT_RANKING_SETS,
        draft: sampleSnapshot.data!.draft,
        currentWeek: options.week ?? 0,
      },
      mode: 'sample',
      isSample: true,
      status: snapshot.status,
      warnings: [
        ...warnings,
        snapshot.message ?? 'The league provider returned no data; showing sample data instead.',
      ],
      asOf: snapshot.asOf,
    };
  }

  const { config, teams, players, draft, matchups } = snapshot.data;

  const [projections, playerPool, injuries, adp] = await Promise.all([
    providers.projections.getSeasonProjections(config.season),
    providers.league.getPlayerPool(),
    providers.injuries.getInjuries(),
    providers.adp.getAdp(config.season, `${config.scoring.receptionPoints}ppr-${config.lineup.QB}qb-${config.teamCount}team`),
  ]);

  if (!projections.ok) {
    warnings.push(
      projections.message ??
        'No projections are available. Screens that depend on projections will show "Data unavailable".',
    );
  }
  if (!playerPool.ok) {
    warnings.push(playerPool.message ?? 'The player pool could not be loaded.');
  }

  // Merge rostered players with the full draftable pool, de-duplicated by id.
  const allPlayers = [...players];
  const seen = new Set(players.map((p) => p.id));
  for (const player of playerPool.data ?? []) {
    if (seen.has(player.id)) continue;
    seen.add(player.id);
    allPlayers.push(player);
  }

  warnings.push(...poolWarnings(config, allPlayers.length));

  const isSample = providers.mode === 'sample' || snapshot.source === 'synthetic-sample';

  // Getting "my team" wrong is not cosmetic: every grade, need and recommendation would
  // be computed for someone else's roster. Say so loudly rather than defaulting silently.
  if (teams.length > 0 && !teams.some((team) => team.isMyTeam)) {
    const configured = process.env.ESPN_TEAM_ID || process.env.ESPN_TEAM_NAME;
    warnings.push(
      configured
        ? `No team matched ESPN_TEAM_ID/ESPN_TEAM_NAME ("${configured}"), so the app is showing ${teams[0]?.name ?? 'the first team'} instead. Teams in this league: ${teams.map((t) => t.name).join(', ')}.`
        : `Neither ESPN_TEAM_ID nor ESPN_TEAM_NAME is set, so the app cannot tell which team is yours and is showing ${teams[0]?.name ?? 'the first team'}. Teams in this league: ${teams.map((t) => t.name).join(', ')}.`,
    );
  }

  return {
    state: {
      config,
      teams,
      players: allPlayers,
      seasonProjections: projections.data ?? [],
      weeklyProjections: [],
      injuries: injuries.data ?? [],
      adp: adp.data ?? [],
      matchups,
      expertRankings: mergedExpertRankings() ?? undefined,
      expertRankingSets: EXPERT_RANKING_SETS,
      draft,
      currentWeek: options.week ?? inferCurrentWeek(matchups),
    },
    mode: providers.mode,
    isSample,
    status: snapshot.status,
    warnings,
    asOf: snapshot.asOf,
  };
}

/** Current week = one past the last completed matchup week. */
export function inferCurrentWeek(matchups: LeagueState['matchups']): number {
  const completed = matchups.filter((m) => m.completed).map((m) => m.week);
  return completed.length > 0 ? Math.max(...completed) : 0;
}

/**
 * An empty pool is the failure that looks like everything working.
 *
 * With projections loaded but no players, every module on the draft page renders with
 * nothing in it and not one of them says why — no candidates, no tiers, no scarcity, all
 * silently blank. Before a draft this is the likely shape of a misconfiguration rather
 * than an edge case: every roster is empty, so the whole pool comes from one request.
 */
export function poolWarnings(config: LeagueState['config'], playerCount: number): string[] {
  if (playerCount === 0) {
    return [
      'No players were returned, so every player-driven screen will be empty. Rosters are ' +
        'empty before a draft, which means the whole pool comes from the player-pool request ' +
        'and that request came back with nothing.',
    ];
  }

  const picks = config.teamCount * config.draftRounds;
  if (playerCount < picks) {
    return [
      `Only ${playerCount} players were returned, which is fewer than the ${picks} picks in ` +
        'this draft. Recommendations will run out of players before the draft does.',
    ];
  }

  return [];
}
