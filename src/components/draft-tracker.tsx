'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { PositionBadge } from '@/components/ui';
import { formatPercent } from '@/lib/format';
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
  /**
   * The ranker's view, on every player rather than only on the shortlist.
   *
   * Our own projected points, league value and VOR used to live here and drive the board.
   * They are gone: this league drafts off the supplied tiers, and a projection column
   * sitting next to them only invited the board to be read on our numbers instead of his.
   */
  expert: ExpertView | null;
}

export interface ExpertView {
  tier: number;
  rank: number;
  designation: 'TARGET' | 'FADE' | null;
  note: string | null;
  disagreement: number;
  formatShift: number | null;
  formatShiftExplain: string | null;
  bigTierBreakAfter: boolean;
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
  upside: number;
  upsideExplain: string;
  expert: {
    tier: number;
    rank: number;
    designation: 'TARGET' | 'FADE' | null;
    note: string | null;
    disagreement: number;
    formatShift: number | null;
    formatShiftExplain: string | null;
    bigTierBreakAfter: boolean;
  } | null;
  explain: string;
}

interface ExpertPanel {
  source: string | null;
  guidance: string[];
  unmatched: string[];
  formatSummaries: string[];
  objectives: Array<{
    position: string;
    needed: number;
    owned: number;
    throughTier: number;
    remainingInWindow: number;
    status: 'NO_DATA' | 'DONE' | 'ON_TRACK' | 'TIGHT' | 'MISSED';
    message: string;
  }>;
}

interface StrategyPanel {
  quarter: 1 | 2 | 3 | 4;
  label: string;
  objective: string;
  guidance: string[];
  firstRound: number;
  lastRound: number;
  picksLeftInQuarter: number;
  q1ProducersOwned: number;
  q1ProducerTarget: number;
  openObjectives: string[];
  congestionWarning: string | null;
  notes: string[];
  explain: string;
}

interface Quarters {
  q1End: number;
  q2End: number;
  q3End: number;
  totalRounds: number;
  plans: Array<{ quarter: number; label: string; firstRound: number; lastRound: number }>;
  explain: string;
  frameworkEquivalentRound: number;
  frameworkTeamCount: number;
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
  strategy: StrategyPanel | null;
  quarters: Quarters;
  expert: ExpertPanel;
  board?: { rankedAvailable: number; unrankedAvailable: number };
  draftOrder?: {
    teamIds: string[];
    source: 'PICKS' | 'SETTINGS' | 'MANUAL' | 'FALLBACK';
    teams: Array<{ id: string; name: string }>;
  };
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

type SortKey = 'expertRank' | 'draftScore' | 'upside' | 'name' | 'position';

/** One pick the mock draft made for another team. Mirrors the simulate endpoint. */
interface SimulatedPick {
  overall: number;
  round: number;
  pickInRound: number;
  teamId: string;
  teamName: string;
  playerId: string;
  playerName: string;
  position: string;
  choiceIndex: number;
  rationale: string;
}

const DRAFT_ORDER_SOURCE_LABEL: Record<string, string> = {
  PICKS: 'from the picks already made in your ESPN draft room',
  SETTINGS: "from your league's draft settings on ESPN",
  MANUAL: 'set by you',
  FALLBACK: 'a guess — ESPN did not report one, so this is just the league team order',
};

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
  const customOrder = board.order;

  const [analysis, setAnalysis] = useState<DraftResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [simulating, setSimulating] = useState(false);
  const [simLog, setSimLog] = useState<SimulatedPick[]>([]);
  const [mockMode, setMockMode] = useState(false);
  const [spread, setSpread] = useState(3);
  const [seed, setSeed] = useState(1);
  const [showOrderEditor, setShowOrderEditor] = useState(false);

  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('expertRank');

  const searchRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(
    async (nextPicks: string[], slot: number, order: string[] | null = customOrder) => {
      // Yield first: setting state synchronously inside an effect cascades renders.
      await Promise.resolve();
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pickedPlayerIds: nextPicks,
            myDraftSlot: slot,
            ...(order ? { draftOrder: order } : {}),
          }),
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
    [customOrder],
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

  /**
   * Built from the whole pool, not from the shortlist.
   *
   * Reading it off `analysis.candidates` meant only the twelve players the engine had
   * shortlisted carried a tier; every other row showed a dash, which looks exactly like
   * "the ranker has no opinion on him" for players he had in fact ranked.
   */
  const expertById = useMemo(() => {
    const map = new Map<string, ExpertView>();
    for (const player of pool) {
      if (player.expert) map.set(player.id, player.expert);
    }
    return map;
  }, [pool]);

  const upsideById = useMemo(() => {
    const map = new Map<string, number>();
    for (const candidate of analysis?.candidates ?? []) map.set(candidate.id, Math.round(candidate.upside));
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

    /**
     * Every tiebreak falls back to his tiers.
     *
     * There is nothing else left to fall back to, and that is deliberate: the projected
     * points and league value that used to break ties were the numbers this board is no
     * longer read on.
     */
    const byExpert = (a: PoolPlayer, b: PoolPlayer) => {
      const ea = expertById.get(a.id);
      const eb = expertById.get(b.id);
      if (ea && !eb) return -1;
      if (!ea && eb) return 1;
      if (ea && eb) {
        if (ea.tier !== eb.tier) return ea.tier - eb.tier;
        return ea.rank - eb.rank;
      }
      return a.name.localeCompare(b.name);
    };

    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'position':
          return a.position.localeCompare(b.position) || byExpert(a, b);
        case 'upside': {
          const ua = upsideById.get(a.id);
          const ub = upsideById.get(b.id);
          if (ua !== undefined && ub !== undefined) return ub - ua;
          if (ua !== undefined) return -1;
          if (ub !== undefined) return 1;
          return byExpert(a, b);
        }
        case 'draftScore': {
          const sa = scoreById.get(a.id);
          const sb = scoreById.get(b.id);
          if (sa !== undefined && sb !== undefined) return sb - sa;
          if (sa !== undefined) return -1;
          if (sb !== undefined) return 1;
          return byExpert(a, b);
        }
        case 'expertRank':
        default:
          return byExpert(a, b);
      }
    });

    return sorted.slice(0, 150);
  }, [pool, query, position, sortKey, scoreById, upsideById, expertById]);

  const totalPicks = teamCount * draftRounds;
  const onClock = analysis?.onTheClock;

  /** Apply a change to the board and re-analyse from the new state. */
  const applyPicks = useCallback(
    (next: string[], slot: number = mySlot, order: string[] | null = customOrder) => {
      store.update({ picks: next, mySlot: slot, order });
      void refresh(next, slot, order);
    },
    [store, refresh, mySlot, customOrder],
  );

  const draftPlayer = (playerId: string) => {
    if (pickedIds.has(playerId) || picks.length >= totalPicks) return;
    const next = [...picks, playerId];
    applyPicks(next);
    setQuery('');
    searchRef.current?.focus();
    // In mock mode your pick hands the clock straight back to the other teams, which is
    // what "everyone but me is automated" has to mean in practice. Driven from the pick
    // itself rather than from an effect watching the analysis, so it fires exactly once.
    if (mockMode) void simulate('TO_MY_PICK', next);
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

  /**
   * Run the other teams.
   *
   * The simulation returns picks rather than a new board, so they are appended here to
   * the same list a manual pick goes into. That keeps undo, the pick log and the analysis
   * identical for simulated and real picks — there is no second kind of pick to reason
   * about, and no way for the two to drift apart.
   */
  const simulate = useCallback(
    async (mode: 'TO_MY_PICK' | 'ONE', fromPicks: string[] = picks) => {
      setSimulating(true);
      setError(null);
      try {
        const response = await fetch('/api/draft/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pickedPlayerIds: fromPicks,
            myDraftSlot: mySlot,
            mode,
            spread,
            seed,
            ...(customOrder ? { draftOrder: customOrder } : {}),
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'Simulation failed.');

        const simulated: SimulatedPick[] = payload.picks ?? [];
        if (simulated.length > 0) {
          setSimLog((previous) => [...simulated, ...previous].slice(0, 40));
          applyPicks([...fromPicks, ...simulated.map((pick) => pick.playerId)]);
        } else {
          // Nothing to do is a real answer, not a failure — usually it is already your turn.
          void refresh(fromPicks, mySlot);
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Simulation failed.');
      } finally {
        setSimulating(false);
      }
    },
    [picks, mySlot, spread, seed, customOrder, applyPicks, refresh],
  );

  const setOrder = (order: string[] | null) => applyPicks(picks, mySlot, order);

  const orderTeams = analysis?.draftOrder?.teams ?? [];
  const orderSource = analysis?.draftOrder?.source ?? null;
  const orderIsGuessed = orderSource === 'FALLBACK';
  const busy = loading || simulating;

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
                {Array.from({ length: teamCount }, (_, i) => i + 1).map((slot) => {
                  // Label from the live draft order, not the league's team order — after
                  // the order is corrected, slot 3 is a different team than it was.
                  const name = orderTeams[slot - 1]?.name ?? teamNames[slot - 1];
                  return (
                    <option key={slot} value={slot}>
                      {slot}
                      {name ? ` · ${name}` : ''}
                    </option>
                  );
                })}
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

        {/* Mock draft */}
        <div className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={mockMode}
                onChange={(event) => setMockMode(event.target.checked)}
                className="h-4 w-4"
              />
              Mock draft — every team but yours picks itself
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => simulate('TO_MY_PICK')}
                disabled={busy || onClock?.isMe || picks.length >= totalPicks}
                title={onClock?.isMe ? 'You are on the clock — make your pick' : undefined}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
              >
                {simulating ? 'Simulating…' : 'Run up to my pick'}
              </button>
              <button
                type="button"
                onClick={() => simulate('ONE')}
                disabled={busy || onClock?.isMe || picks.length >= totalPicks}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                One pick
              </button>
            </div>
          </div>

          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Simulated teams are drafted by the same engine that advises you, running for
            them: their roster, their needs, their turn. That makes them a reasonable
            sparring partner and <strong>not</strong> a prediction of what your leaguemates
            will actually do. Your own picks are always yours — no mode drafts for you.
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              Variety
              <input
                type="range"
                min={0}
                max={6}
                value={spread}
                onChange={(event) => setSpread(Number(event.target.value))}
                className="w-28"
              />
              <span className="tabular">
                {spread === 0 ? 'always the top pick' : `top ${spread + 1}`}
              </span>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              Seed
              <input
                type="number"
                min={0}
                value={seed}
                onChange={(event) => setSeed(Number(event.target.value) || 0)}
                className="w-20 rounded border border-slate-300 px-1.5 py-0.5 tabular dark:border-slate-700 dark:bg-slate-950"
              />
              <span>same seed replays the same mock</span>
            </label>
          </div>

          {simLog.length > 0 && (
            <ol className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs">
              {simLog.map((pick) => (
                <li key={pick.overall} className="flex flex-wrap gap-2 text-slate-600 dark:text-slate-300">
                  <span className="tabular text-slate-400">
                    {pick.round}.{String(pick.pickInRound).padStart(2, '0')}
                  </span>
                  <span className="font-medium">{pick.teamName}</span>
                  <span>
                    {pick.playerName}{' '}
                    <span className="text-slate-400">({pick.rationale})</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Draft order */}
        <div
          className={`mt-3 rounded-lg border p-3 ${
            orderIsGuessed
              ? 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40'
              : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              Draft order{' '}
              <span className="font-normal text-slate-500 dark:text-slate-400">
                — {orderSource ? DRAFT_ORDER_SOURCE_LABEL[orderSource] : 'loading'}
              </span>
            </p>
            <button
              type="button"
              onClick={() => setShowOrderEditor((open) => !open)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {showOrderEditor ? 'Done' : 'Set order'}
            </button>
          </div>

          {orderIsGuessed && (
            <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
              ESPN has not published an order for this draft, so this is simply the league
              team order. If it is wrong then every &ldquo;on the clock&rdquo;, every
              simulated pick and every count of picks until your turn is wrong with it —
              worth setting before you rely on any of this.
            </p>
          )}

          <ol className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {orderTeams.map((team, index) => (
              <li
                key={team.id}
                className={`rounded px-2 py-1 ${
                  index + 1 === mySlot
                    ? 'bg-emerald-500/15 font-semibold text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-100 dark:bg-slate-800'
                }`}
              >
                <span className="tabular text-slate-400">{index + 1}.</span> {team.name}
              </li>
            ))}
          </ol>

          {showOrderEditor && orderTeams.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {orderTeams.map((_, slotIndex) => (
                <label key={slotIndex} className="flex items-center gap-2 text-sm">
                  <span className="tabular w-8 text-slate-400">{slotIndex + 1}.</span>
                  <select
                    value={(customOrder ?? orderTeams.map((t) => t.id))[slotIndex] ?? ''}
                    onChange={(event) => {
                      // Swap rather than overwrite, so the order stays a permutation and
                      // no team can be dropped or duplicated by editing one row.
                      const current = [...(customOrder ?? orderTeams.map((t) => t.id))];
                      const chosen = event.target.value;
                      const from = current.indexOf(chosen);
                      if (from === -1) return;
                      [current[slotIndex], current[from]] = [current[from]!, current[slotIndex]!];
                      setOrder(current);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    {orderTeams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {customOrder && (
                <button
                  type="button"
                  onClick={() => setOrder(null)}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  Reset to what the provider reported
                </button>
              )}
            </div>
          )}
        </div>

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

      {/* Draft-quarters strategy */}
      {analysis?.strategy && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold tracking-wide uppercase">
                Q{analysis.strategy.quarter} · {analysis.strategy.label}
              </h2>
              <p className="mt-1 text-sm font-medium">{analysis.strategy.objective}</p>
            </div>
            <div className="text-right text-xs text-slate-500 dark:text-slate-400">
              <p>
                Rounds {analysis.strategy.firstRound}–{analysis.strategy.lastRound} ·{' '}
                {analysis.strategy.picksLeftInQuarter} of your picks left in this phase
              </p>
              <p className="mt-0.5">
                Elite producers: {analysis.strategy.q1ProducersOwned} of ~
                {analysis.strategy.q1ProducerTarget}
              </p>
            </div>
          </div>

          {/* Phase strip */}
          <ol className="mt-3 flex gap-1">
            {analysis.quarters.plans.map((plan) => (
              <li
                key={plan.quarter}
                title={`${plan.label}: rounds ${plan.firstRound}-${plan.lastRound}`}
                className={`flex-1 rounded px-2 py-1 text-center text-xs font-medium ${
                  plan.quarter === analysis.strategy!.quarter
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                Q{plan.quarter} · {plan.firstRound}–{plan.lastRound}
              </li>
            ))}
          </ol>

          {analysis.strategy.congestionWarning && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              ⚠️ {analysis.strategy.congestionWarning}
            </p>
          )}

          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
            {analysis.strategy.guidance.map((line) => (
              <li key={line}>{line}</li>
            ))}
            {analysis.strategy.notes.map((line) => (
              <li key={line} className="font-medium text-slate-800 dark:text-slate-100">
                {line}
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Your round {onClock?.round ?? 1} is round{' '}
            <strong>{analysis.quarters.frameworkEquivalentRound}</strong> of a{' '}
            {analysis.quarters.frameworkTeamCount}-team draft by players gone — this framework
            is written for {analysis.quarters.frameworkTeamCount}-team leagues, so better
            players are still on the board than its round numbers imply.
          </p>

          <details className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            <summary className="cursor-pointer select-none">How the phases were set</summary>
            <p className="mt-2 rounded-lg bg-slate-50 p-3 leading-relaxed dark:bg-slate-950/60">
              {analysis.quarters.explain}
            </p>
          </details>
        </div>
      )}

      {/* Expert tiers */}
      {analysis?.expert?.source && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-wide uppercase">Expert tiers</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {analysis.expert.source} · this board is ranked on his tiers
            </p>
          </div>

          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            His lists are positional — QB, RB, WR and TE ranked separately — so he never
            ranked his RB6 against his WR9. Ordering the board across positions applies his
            tier numbers and Big Tier Breaks; that part is this app&rsquo;s reading of his
            structure, not a ranking he published.
            {analysis.board && analysis.board.unrankedAvailable > 0 && (
              <>
                {' '}
                {analysis.board.rankedAvailable} available players carry his ranking;{' '}
                {analysis.board.unrankedAvailable} sit outside his lists (kickers, defences
                and the deep pool) and are shown as <em>unranked</em> rather than scored on
                numbers of ours.
              </>
            )}
          </p>

          {analysis.expert.objectives.map((objective) => (
            <p
              key={objective.position}
              className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                objective.status === 'NO_DATA'
                  ? 'bg-slate-50 text-slate-600 dark:bg-slate-950/60 dark:text-slate-400'
                  : objective.status === 'MISSED'
                    ? 'bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
                    : objective.status === 'TIGHT'
                      ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                      : objective.status === 'DONE'
                        ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                        : 'bg-slate-50 text-slate-700 dark:bg-slate-950/60 dark:text-slate-300'
              }`}
            >
              <strong>
                {objective.needed} {objective.position} by end of tier {objective.throughTier}:
              </strong>{' '}
              {objective.message}
            </p>
          ))}

          {analysis.expert.formatSummaries.map((summary) => (
            <p
              key={summary}
              className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:bg-sky-950/40 dark:text-sky-200"
            >
              <strong>Scoring translation:</strong> {summary}
            </p>
          ))}

          {analysis.expert.guidance.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
              {analysis.expert.guidance.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}

          {analysis.expert.unmatched.length > 0 && (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Not matched to your player pool ({analysis.expert.unmatched.length}):{' '}
              {analysis.expert.unmatched.join(', ')}. These are ranked but could not be
              found by name, so no tier is shown for them.
            </p>
          )}
        </div>
      )}

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
              <option value="expertRank">Expert tier / rank</option>
              <option value="draftScore">Draft score</option>
              <option value="upside">Upside (Q1 ceiling at this price)</option>
              <option value="position">Position</option>
              <option value="name">Name (A–Z)</option>
            </select>
          </label>
        </div>

        {analysis?.board?.rankedAvailable === 0 && (
          <p className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            None of the supplied rankings could be matched to this player pool, so this
            board carries no ranking information and is listed alphabetically. That is
            expected on sample data, whose players are synthetic; against a real ESPN pool
            it means the names are not lining up, which is worth fixing before you draft.
          </p>
        )}

        <div className="max-h-[32rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-slate-900">
              <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 pr-2 pl-4">Player</th>
                <th className="py-2 pr-2">Team</th>
                <th className="py-2 pr-2">Expert tier</th>
                <th className="tabular py-2 pr-2 text-right">Score</th>
                <th className="tabular py-2 pr-2 text-right">Upside</th>
                <th className="py-2 pr-4 text-right">Draft</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
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
                    <td className="py-2 pr-2 whitespace-nowrap">
                      {(() => {
                        const expert = expertById.get(player.id);
                        if (!expert)
                          return (
                            <span
                              className="text-xs text-slate-400"
                              title="Outside the supplied tier lists — no ranking to show, and nothing of ours substituted for one"
                            >
                              unranked
                            </span>
                          );
                        return (
                          <span title={expert.note ?? undefined}>
                            <span className="tabular">
                              T{expert.tier} · {player.position}
                              {expert.rank}
                            </span>
                            {expert.formatShift !== null && expert.formatShift !== 0 && (
                              <span
                                title={expert.formatShiftExplain ?? undefined}
                                className={`ml-1 text-xs font-medium ${
                                  expert.formatShift > 0
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-amber-600 dark:text-amber-400'
                                }`}
                              >
                                {expert.formatShift > 0 ? '▲' : '▼'}
                                {Math.abs(expert.formatShift)}
                              </span>
                            )}
                            {expert.bigTierBreakAfter && (
                              <span
                                title="The ranker marks a genuine cliff immediately after this player"
                                className="ml-1 rounded bg-slate-900 px-1 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
                              >
                                CLIFF
                              </span>
                            )}
                            {expert.designation === 'FADE' && (
                              <span className="ml-1 rounded bg-rose-500/15 px-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
                                FADE
                              </span>
                            )}
                            {expert.designation === 'TARGET' && (
                              <span className="ml-1 rounded bg-emerald-500/15 px-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                TARGET
                              </span>
                            )}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="tabular py-2 pr-2 text-right font-semibold">
                      {score === undefined ? '—' : score}
                    </td>
                    <td className="tabular py-2 pr-2 text-right">
                      {upsideById.get(player.id) ?? '—'}
                    </td>
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
