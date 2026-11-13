/**
 * Snapshot save on tab hide / app close, resume on next load (GDD §10).
 * Uses localStorage for the vertical slice; swap to IndexedDB (idb-keyval) later
 * without changing callers. All storage access is wrapped: it can throw or be empty.
 */

import { deserialize, serialize, type GameState } from './state';

const KEY = 'riftrubbish:run';

export function saveRun(state: GameState): void {
  try {
    localStorage.setItem(KEY, serialize(state));
  } catch {
    // Storage full or blocked (private mode). The run continues; it just can't resume.
  }
}

export function loadRun(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? deserialize(raw) : null;
  } catch {
    return null;
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** Saves whenever the page is hidden or closed. Returns an unsubscribe function. */
export function autoSaveOnHide(getState: () => GameState, onHide?: () => void): () => void {
  const handler = () => {
    if (document.visibilityState === 'hidden') {
      onHide?.();
      saveRun(getState());
    }
  };
  const pagehide = () => saveRun(getState());
  document.addEventListener('visibilitychange', handler);
  window.addEventListener('pagehide', pagehide);
  // Ask the browser not to evict our storage (Safari can otherwise wipe it).
  navigator.storage?.persist?.().catch(() => undefined);
  return () => {
    document.removeEventListener('visibilitychange', handler);
    window.removeEventListener('pagehide', pagehide);
  };
}
