import type { ExpertSignal, ExpertSignalWeek, SignalAction, SignalKind } from '@/domain/expert-signals';

const KIND_STYLE: Record<SignalKind, string> = {
  SIGNAL: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  NOISE: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  NOTE: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
};

const KIND_LABEL: Record<SignalKind, string> = {
  SIGNAL: 'Signal',
  NOISE: 'Noise',
  NOTE: 'Unlabelled',
};

const ACTION_LABEL: Record<SignalAction, string> = {
  SELL_LOW: 'Sell low',
  BUY: 'Buy',
  STASH: 'Stash',
  CUTTABLE: 'Cuttable',
  TRADE_AWAY: 'Trade away',
  HANDCUFF: 'Handcuff',
  BENCH: 'Do not start yet',
};

export function SignalTag({ kind }: { kind: SignalKind }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-semibold ${KIND_STYLE[kind]}`}
      title={
        kind === 'NOTE'
          ? 'He wrote about this player but did not put him in either list'
          : `He put this in the week's ${KIND_LABEL[kind]} list`
      }
    >
      {KIND_LABEL[kind]}
    </span>
  );
}

export function SignalRow({ entry, showSubject = true }: { entry: ExpertSignal; showSubject?: boolean }) {
  return (
    <li className="border-b border-slate-100 py-2 last:border-0 dark:border-slate-800/60">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <SignalTag kind={entry.kind} />
        {showSubject && <span className="font-medium">{entry.subject}</span>}
        {entry.action && (
          <span className="rounded bg-slate-900 px-1.5 py-0.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
            {ACTION_LABEL[entry.action]}
          </span>
        )}
        {entry.stat && (
          <span className="tabular text-xs text-slate-500 dark:text-slate-400">{entry.stat}</span>
        )}
      </p>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{entry.note}</p>
      <p className="mt-0.5 text-xs text-slate-400">{entry.game}</p>
    </li>
  );
}

/**
 * A week of Signal and Noise.
 *
 * The coverage line is not decoration. These pieces publish in parts, so a week's file is
 * usually a handful of games — without saying which, an empty result reads as "he had
 * nothing to say about your player" when it means "he has not been read on that game".
 */
export function SignalWeekPanel({
  week,
  entries,
  emptyMessage,
}: {
  week: ExpertSignalWeek;
  entries: ExpertSignal[];
  emptyMessage: string;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {week.source} · Week {week.week}, published {week.publishedAt}. {week.coverage.caveat}
      </p>

      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{emptyMessage}</p>
      ) : (
        <ul className="mt-2">
          {entries.map((entry, index) => (
            <SignalRow key={`${entry.subject}-${index}`} entry={entry} />
          ))}
        </ul>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-slate-500 dark:text-slate-400">
          How he says these should be read
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-500 dark:text-slate-400">
          {week.framing.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
