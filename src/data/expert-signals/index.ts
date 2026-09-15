import type { ExpertSignalWeek } from '@/domain/expert-signals';
import { WEEK_1_SIGNALS_2026 } from './week-1-2026';

/**
 * In-season Signal and Noise, newest week first.
 *
 * Kept as a list rather than merged because the week is the whole point: a Signal from
 * Week 1 is a reading of one game, and it ages. Anything that shows these has to show the
 * week alongside them.
 */
export const EXPERT_SIGNAL_WEEKS: ExpertSignalWeek[] = [WEEK_1_SIGNALS_2026];

export function signalsForWeek(week: number): ExpertSignalWeek | null {
  return EXPERT_SIGNAL_WEEKS.find((entry) => entry.week === week) ?? null;
}

/** The most recent week transcribed, which is what the in-season screens lead with. */
export function latestSignals(): ExpertSignalWeek | null {
  return [...EXPERT_SIGNAL_WEEKS].sort((a, b) => b.week - a.week)[0] ?? null;
}

export { WEEK_1_SIGNALS_2026 };
