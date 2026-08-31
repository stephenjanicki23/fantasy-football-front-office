/**
 * Draft board persistence.
 *
 * A draft in progress must survive an accidental refresh — losing the board mid-draft is
 * unrecoverable, and there is no database wired up yet (PROJECT_PLAN.md, phase 7).
 *
 * localStorage is genuinely an external store, so it is exposed as one and consumed with
 * useSyncExternalStore rather than mirrored into React state through effects. That avoids
 * both the render cascade of setState-in-effect and the hydration mismatch you get from
 * reading storage during the first render: the server snapshot is simply empty.
 */

export interface DraftBoardState {
  /** Player ids in overall pick order. Index 0 is pick #1. */
  picks: string[];
  /** My seat in round 1, 1-indexed. */
  mySlot: number | null;
}

const EMPTY: DraftBoardState = { picks: [], mySlot: null };

interface DraftStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => DraftBoardState;
  getServerSnapshot: () => DraftBoardState;
  update: (patch: Partial<DraftBoardState>) => void;
}

const stores = new Map<string, DraftStore>();

export function getDraftStore(leagueId: string): DraftStore {
  const existing = stores.get(leagueId);
  if (existing) return existing;

  const key = `ffo-draft-${leagueId}`;
  const listeners = new Set<() => void>();

  // The snapshot must be reference-stable between changes, or useSyncExternalStore
  // re-renders forever.
  let snapshot: DraftBoardState = read(key);

  const store: DraftStore = {
    subscribe(listener) {
      listeners.add(listener);
      // Another tab drafting into the same league should be reflected here.
      const onStorage = (event: StorageEvent) => {
        if (event.key !== key) return;
        snapshot = read(key);
        listeners.forEach((l) => l());
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
      };
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => EMPTY,
    update(patch) {
      snapshot = { ...snapshot, ...patch };
      try {
        localStorage.setItem(key, JSON.stringify(snapshot));
      } catch {
        // Private browsing can refuse writes; the draft still works for this session,
        // it just will not survive a refresh.
      }
      listeners.forEach((listener) => listener());
    },
  };

  stores.set(leagueId, store);
  return store;
}

function read(key: string): DraftBoardState {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<DraftBoardState>;
    return {
      picks: Array.isArray(parsed.picks) ? parsed.picks.filter((id) => typeof id === 'string') : [],
      mySlot: typeof parsed.mySlot === 'number' ? parsed.mySlot : null,
    };
  } catch {
    // A corrupt entry should not brick the page — start clean.
    return EMPTY;
  }
}
