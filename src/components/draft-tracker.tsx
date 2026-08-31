'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { PositionBadge } from '@/components/ui';
import { formatPercent, formatPoints } from '@/lib/format';
import { getDraftStore } from '@/lib/draft-store';

/**
 * Manual draft tracker.
 *
 * Picks are entered here rather than read from ESPN, because ESPN's draft room uses an
 * undocumented websocket and polling its results lags the room by seconds you do not have
 * on the clock. See ESPN_INTEGRATION.md.
 *
 * The pick list is the single source of truth: team, round and pick-in-round are derived
 * from it server-side, so there is no duplicated state to drift. It is persisted to
 * localStorage on every change, because losing a draft board to an accidental refresh
 * mid-draft would be unrecoverable.
 *
 * Search, position filter and sorting run client-side against the pool already in memory,
 * so typing is instant; only the analysis round-trips to the server.
 */

export interface PoolPlayer {
  id: string;
  name: string;
  position: string;
  nflTeam: string | null;
  byeWeek: number | null;
  status: string;
  projectedPoints: number;
  leagueValue: number;
  vor: number;
  positionRank: number;
  overallRank: number;
  tier: number | null;
}

interface Candidate {
  id: string;
  name: string;
  position: string;
  draftScore: number;
  value: number;
  rosterFit: number;
  scarcity: number;
  expectedAvailability: number;
  tier: number | null;
  tierRemaining: number;
  tierCliff: number;
  explain: string;
}

interface DraftResponse {
  onTheClock: {
    overall: number;
    round: number;
    pickInRound: number;
    teamId: string | null;
    teamName: string | null;
    isMe: boolean;
  };
  picksUntilNextTurn: number | null;
  nextPickOverall: number | null;
  confidence: number;
  reasoning: string[];
  bestPick: Candidate | null;
  safeAlternative: Candidate | null;
  bestValue: Candidate | null;
  candidates: Candidate[];
  qbScarcity: {
    isTwoQb: boolean;
    viableStartingQbs: number;
    startingQbSlots: number;
    teamsNeedingQb2: number;
    survivalOfNextTierQb: number | null;
    recommendation: string;
    summary: string;
  };
  squeezes: Array<{
    position: string;
    severity: string;
    teamsNeedingPosition: number;
    playersRemainingInTier: number;
    tierSurvivalProbability: number;
    summary: string;
  }>;
  myNeeds: {
    needOrder: string[];
    needByPosition: Record<string, number>;
    unfilledSlots: string[];
  } | null;
  availablePlayers: PoolPlayer[];
  rosters: Array<{
    id: string;
    name: string;
    isMyTeam: boolean;
    draftSlot: number | null;
    playerIds: string[];
  }>;
}

type SortKey = 'draftScore' | 'projectedPoints' | 'leagueValue' | 'name' | 'position';

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST'] as const;

function storageKey(leagueId: string) {
  return `ffo-draft-${leagueId}`;
}

export function DraftTracker({
  leagueId,
  teamCount,
  draftRounds,
  initialPool,
  initialMyDraftSlot,
  teamNames,
}: {
  leagueId: string;
  teamCount: number;
  draftRounds: number;
  initialPool: PoolPlayer[];
  initialMyDraftSlot: number | null;
  teamNames: string[];
}) {
  // The board lives in localStorage, which is an external store — read it as one rather
  // than mirroring it into state via effects.
  const store = useMemo(() => getDraftStore(leagueId), [leagueId]);
  const board = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const picks = board.picks;
  const mySlot = board.mySlot ?? initialMyDraftSlot ?? 1;

  const [analysis, setAnalysis] = useState<DraftResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('draftScore');

  const searchRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(
    async (nextPicks: string[], slot: number) => {
      // Yield first: setting state synchronously inside an effect cascades renders.
      await Promise.resolve();
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pickedPlayerIds: nextPicks, myDraftSlot: slot }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'Draft analysis failed.');
        setAnalysis(payload);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Draft analysis failed.');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Analysis is fetched by the actions that change the board (below), not synchronised
  // from an effect. The one thing an effect is needed for is the very first load, and
  // only when localStorage restored a draft already in progress — otherwise the empty
  // board needs no server round-trip to be correct.
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    const snapshot = store.getSnapshot();
    const timer = setTimeout(
      () => void refresh(snapshot.picks, snapshot.mySlot ?? initialMyDraftSlot ?? 1),
      0,
    );
    return () => clearTimeout(timer);
  }, [refresh, store, initialMyDraftSlot]);

  const pickedIds = useMemo(() => new Set(picks), [picks]);
  const pool = analysis?.availablePlayers ?? initialPool.filter((p) => !pickedIds.has(p.id));

  const scoreById = useMemo(() => {
    const map = new Map<string, number>();
    for (const candidate of analysis?.candidates ?? []) map.set(candidate.id, candidate.draftScore);
    return map;
  }, [analysis]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = pool.filter((player) => {
      if (position !== 'ALL' && player.position !== position) return false;
      if (needle.length === 0) return true;
      return (
        player.name.toLowerCase().includes(needle) ||
        (player.nflTeam ?? '').toLowerCase().includes(needle)
      );
    });

    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'position':
          return a.position.localeCompare(b.position) || b.projectedPoints - a.projectedPoints;
        case 'projectedPoints':
          return b.projectedPoints - a.projectedPoints;
        case 'leagueValue':
          return b.leagueValue - a.leagueValue;
        case 'draftScore':
        default: {
          // Engine-scored players first, in score order; everyone else by league value.
          const sa = scoreById.get(a.id);
          const sb = scoreById.get(b.id);
          if (sa !== undefined && sb !== undefined) return sb - sa;
          if (sa !== undefined) return -1;
          if (sb !== undefined) return 1;
          return b.leagueValue - a.leagueValue;
        }
      }
    });

    return sorted.slice(0, 150);
  }, [pool, query, position, sortKey, scoreById]);

  const totalPicks = teamCount * draftRounds;
  const onClock = analysis?.onTheClock;

  /** Apply a change to the board and re-analyse from the new state. */
  const applyPicks = useCallback(
    (next: string[], slot: number = mySlot) => {
      store.update({ picks: next, mySlot: slot });
      void refresh(next, slot);
    },
    [store, refresh, mySlot],
  );

  const draftPlayer = (playerId: string) => {
    if (pickedIds.has(playerId) || picks.length >= totalPicks) return;
    applyPicks([...picks, playerId]);
    setQuery('');
    searchRef.current?.focus();
  };

  const undo = () => {
    if (picks.length === 0) return;
    applyPicks(picks.slice(0, -1));
  };

  const reset = () => {
    if (picks.length > 0 && !confirm(`Clear all ${picks.length} recorded picks?`)) return;
    applyPicks([]);
  };

  const changeSlot = (slot: number) => applyPicks(picks, slot);

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const player of initialPool) map.set(player.id, player.name);
    for (const player of analysis?.availablePlayers ?? []) map.set(player.id, player.name);
    return map;
  }, [initialPool, analysis]);

  const myRoster = analysis?.rosters.find((team) => team.isMyTeam);

  return (
    <section className="space-y-4">
      {/* Draft status */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-wide uppercase">Draft tracker</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {onClock ? (
                <>
                  Pick <strong>#{onClock.overall}</strong> of {totalPicks} · round{' '}
                  {onClock.round}, pick {onClock.pickInRound} ·{' '}
                  {onClock.isMe ? (
                    <strong className="text-emerald-600 dark:text-emerald-400">
                      you are on the clock
                    </strong>
                  ) : (
                    <>on the clock: {onClock.teamName ?? 'unknown'}</>
                  )}
                </>
              ) : (
                `${picks.length} of ${totalPicks} picks recorded`
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-slate-500 dark:text-slate-400">My slot</span>
              <select
                value={mySlot}
                onChange={(event) => changeSlot(Number(event.target.value))}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                {Array.from({ length: teamCount }, (_, i) => i + 1).map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                    {teamNames[slot - 1] ? ` · ${teamNames[slot - 1]}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={undo}
              disabled={picks.length === 0}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={picks.length === 0}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Reset
            </button>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

        {analysis?.bestPick && onClock?.isMe && (
          <div className="mt-3 rounded-lg bg-slate-900 p-3 text-white dark:bg-slate-100 dark:text-slate-900">
            <p className="text-xs uppercase opacity-70">Recommended</p>
            <p className="mt-0.5 flex items-center gap-2 text-lg font-bold">
              {analysis.bestPick.name}
              <PositionBadge position={analysis.bestPick.position} />
              <span className="text-sm font-normal opacity-80">
                {formatPercent(analysis.confidence)} confidence
              </span>
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm opacity-90">
              {analysis.reasoning.slice(0, 3).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Player board */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search player or NFL team…"
            className="min-w-48 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />

          <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by position">
            {POSITIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setPosition(option)}
                aria-pressed={position === option}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                  position === option
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Sort</span>
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="draftScore">Draft score</option>
              <option value="leagueValue">League value</option>
              <option value="projectedPoints">Projected points</option>
              <option value="position">Position</option>
              <option value="name">Name (A–Z)</option>
            </select>
          </label>
        </div>

        <div className="max-h-[32rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-slate-900">
              <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 pr-2 pl-4">Player</th>
                <th className="py-2 pr-2">Team</th>
                <th className="tabular py-2 pr-2 text-right">Proj</th>
                <th className="tabular py-2 pr-2 text-right">Value</th>
                <th className="tabular py-2 pr-2 text-right">Score</th>
                <th className="tabular py-2 pr-2 text-right">Tier</th>
                <th className="py-2 pr-4 text-right">Draft</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                    {query ? `No available player matches “${query}”.` : 'No players available.'}
                  </td>
                </tr>
              )}
              {visible.map((player) => {
                const score = scoreById.get(player.id);
                return (
                  <tr
                    key={player.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-2 pr-2 pl-4">
                      <span className="flex items-center gap-2">
                        <PositionBadge position={player.position} />
                        <span className="font-medium">{player.name}</span>
                        <span className="text-xs text-slate-400">
                          {player.position}
                          {player.positionRank}
                        </span>
                        {player.status !== 'ACTIVE' && (
                          <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-xs text-rose-600 dark:text-rose-400">
                            {player.status}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-slate-500 dark:text-slate-400">
                      {player.nflTeam ?? '—'}
                      {player.byeWeek ? (
                        <span className="text-xs text-slate-400"> (bye {player.byeWeek})</span>
                      ) : null}
                    </td>
                    <td className="tabular py-2 pr-2 text-right">
                      {formatPoints(player.projectedPoints)}
                    </td>
                    <td className="tabular py-2 pr-2 text-right">{player.leagueValue}</td>
                    <td className="tabular py-2 pr-2 text-right font-semibold">
                      {score === undefined ? '—' : score}
                    </td>
                    <td className="tabular py-2 pr-2 text-right">{player.tier ?? '—'}</td>
                    <td className="py-2 pr-4 text-right">
                      <button
                        type="button"
                        onClick={() => draftPlayer(player.id)}
                        disabled={loading}
                        className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
                      >
                        Draft
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Showing {visible.length} of {pool.length} available
          {position !== 'ALL' ? ` at ${position}` : ''}
          {visible.length === 150 ? ' (capped at 150 — narrow the search)' : ''}.
          {loading ? ' Recalculating…' : ''}
        </p>
      </div>

      {/* Pick log */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            Pick log ({picks.length})
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Saved in this browser, so a refresh mid-draft resumes where you left off.
          </p>
        </div>
        <div className="max-h-64 overflow-y-auto px-4 py-3">
          {picks.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No picks recorded yet. Use the Draft button on any player above as picks happen.
            </p>
          ) : (
            <ol className="space-y-1 text-sm">
              {[...picks].reverse().map((playerId, reverseIndex) => {
                const overall = picks.length - reverseIndex;
                const team = analysis?.rosters.find((roster) =>
                  roster.playerIds.includes(playerId),
                );
                return (
                  <li key={`${playerId}-${overall}`} className="flex items-center gap-2">
                    <span className="tabular w-10 text-slate-400">#{overall}</span>
                    <span className="font-medium">{nameById.get(playerId) ?? playerId}</span>
                    {team && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        → {team.name}
                        {team.isMyTeam ? ' (you)' : ''}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>

      {myRoster && myRoster.playerIds.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            Your roster ({myRoster.playerIds.length})
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {myRoster.playerIds.map((playerId) => (
              <li key={playerId} className="rounded bg-slate-100 px-2 py-1 dark:bg-slate-800">
                {nameById.get(playerId) ?? playerId}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
