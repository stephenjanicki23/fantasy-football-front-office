import { explained, type Explained } from './explain';
import { normaliseName } from './expert-rankings';
import type { Player, Position } from './types';

/**
 * In-season Signal and Noise.
 *
 * A different kind of evidence from the preseason tiers, and deliberately a separate
 * module. A tier is a standing opinion about a player; a Signal is a reading of one week's
 * usage, and its whole point is that it expires — the ranker's own framing is that "the
 * NFL is always chaos", that these are base rates being updated rather than conclusions,
 * and that things can and will change.
 *
 * So every entry carries the week it came from, and nothing here ever overwrites a tier or
 * a valuation. It is shown next to them, dated, as a reason to look again at a player.
 */

/** His own labels, plus one for what he wrote without labelling. */
export type SignalKind =
  /** He put this in the week's Signal list: the usage is telling you something real. */
  | 'SIGNAL'
  /** He put this in the week's Noise list: do not over-react to the box score. */
  | 'NOISE'
  /**
   * He wrote about it in the body but did not put it in either list.
   *
   * Kept distinct because promoting an unlabelled paragraph into "Signal" would be putting
   * a word in his mouth that he pointedly did not use — he leaves players off both lists
   * on purpose when he does not feel strongly.
   */
  | 'NOTE';

/**
 * A roster move he states outright. Only ever set from an explicit instruction in the
 * text, never inferred from the tone of a note.
 */
export type SignalAction =
  | 'SELL_LOW'
  | 'BUY'
  | 'STASH'
  | 'CUTTABLE'
  | 'TRADE_AWAY'
  | 'HANDCUFF'
  | 'BENCH';

export interface ExpertSignal {
  /** Player name as written, or a team name when the entry is about an offense. */
  subject: string;
  subjectType: 'PLAYER' | 'TEAM';
  position?: Position;
  kind: SignalKind;
  /** The usage line he leads with, verbatim where he gave one. */
  stat?: string;
  note: string;
  action?: SignalAction;
  /** The game the entry came from, for context when a name is ambiguous. */
  game: string;
}

export interface ExpertSignalWeek {
  source: string;
  sourceUrl?: string;
  season: number;
  week: number;
  /** When the piece was published, not when it was transcribed. */
  publishedAt: string;
  /** His framing of how these should be read at all. */
  framing: string[];
  /**
   * What this transcription does and does not cover.
   *
   * Non-negotiable for a weekly piece: it is published in parts, so a week's file is
   * almost never the whole week. Saying which games are in it stops the app implying it
   * has looked at a player it has simply never seen.
   */
  coverage: {
    games: string[];
    /** Games he covered whose Signal/Noise lists are not in this transcription. */
    incomplete: string[];
    caveat: string;
  };
  /** One headline usage line per game, as he publishes them. */
  keyStats: Array<{ game: string; stat: string }>;
  entries: ExpertSignal[];
}

export interface SignalMatch {
  byPlayerId: Map<string, ExpertSignal[]>;
  /** Named players we could not find in the pool — shown, never dropped. */
  unmatched: string[];
  matchedCount: number;
  explain: Explained<number>;
}

/**
 * Match a week's entries onto the player pool by name and, where given, position.
 *
 * Team entries are skipped rather than matched: "Rams — 57 plays, -18.2% PROE" is about an
 * offense, and forcing it onto a player would attribute a team's problem to whoever
 * happened to share the name.
 */
export function matchSignals(players: Player[], week: ExpertSignalWeek): SignalMatch {
  const byName = new Map<string, Player[]>();
  for (const player of players) {
    const key = normaliseName(player.name);
    byName.set(key, [...(byName.get(key) ?? []), player]);
  }

  const byPlayerId = new Map<string, ExpertSignal[]>();
  const unmatched: string[] = [];

  for (const entry of week.entries) {
    if (entry.subjectType !== 'PLAYER') continue;
    const candidates = byName.get(normaliseName(entry.subject)) ?? [];
    const match = entry.position
      ? candidates.find((p) => p.position === entry.position)
      : candidates[0];
    if (!match) {
      if (!unmatched.includes(entry.subject)) unmatched.push(entry.subject);
      continue;
    }
    byPlayerId.set(match.id, [...(byPlayerId.get(match.id) ?? []), entry]);
  }

  const playerEntries = week.entries.filter((e) => e.subjectType === 'PLAYER').length;

  return {
    byPlayerId,
    unmatched,
    matchedCount: byPlayerId.size,
    explain: explained(
      byPlayerId.size,
      {
        week: week.week,
        playerEntries,
        matchedPlayers: byPlayerId.size,
        unmatched: unmatched.length,
        poolSize: players.length,
        gamesCovered: week.coverage.games.length,
      },
      `Week ${week.week}: matched ${byPlayerId.size} players from ${playerEntries} entries across ` +
        `${week.coverage.games.length} game${week.coverage.games.length === 1 ? '' : 's'}` +
        `${unmatched.length > 0 ? `; ${unmatched.length} unmatched: ${unmatched.slice(0, 6).join(', ')}${unmatched.length > 6 ? '…' : ''}` : ''}. ` +
        `${week.coverage.caveat}`,
      [`expert-signals:${week.source}`],
    ),
  };
}

/** Entries he labelled as a roster move, for the screens that suggest moves. */
export function actionableSignals(week: ExpertSignalWeek): ExpertSignal[] {
  return week.entries.filter((entry) => entry.action !== undefined);
}

export function teamSignals(week: ExpertSignalWeek): ExpertSignal[] {
  return week.entries.filter((entry) => entry.subjectType === 'TEAM');
}
