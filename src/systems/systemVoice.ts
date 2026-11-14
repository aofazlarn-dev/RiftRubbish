/**
 * The "System" voice (Gap vs Spec G5; system_lines.md §0, §1, §2.1, §5, §7). Pure, no Phaser.
 *
 * Lines come from src/data/system_lines.json (generated from docs/content/system_lines.md).
 * Triggers are bus events; each one emits `system:say` with the TH and EN text. The scene shows it.
 *
 * Not built yet: the Fusion/evening/event lines (EV*, EVE_*, FUSE_*, GIFT_*), the new-night line,
 * the tutorial gift line, and the `{skill}` / `{n}` token replacement (the scene does that).
 */

import type { EventBus } from '../core/events';
import type { GameState } from '../core/state';
import lines from '../data/system_lines.json';

export interface LineText {
  th: string;
  en: string;
}

const TABLE = lines as Record<string, LineText>;

export function lineText(id: string): LineText {
  const line = TABLE[id];
  if (!line) throw new Error(`Unknown system line: ${id}`);
  return line;
}

/** Lines that may only repeat after this many run seconds (D23: the J04 line at most once per 30 s). */
export const LINE_COOLDOWN_SEC: Record<string, number> = { TRASH_04: 30 };

/** Picks a numbered variant (PREFIX_01 … PREFIX_0count) from a counter, so the lines rotate. */
export function variantId(prefix: string, count: number, n: number): string {
  return `${prefix}_0${(n % count) + 1}`;
}

/** Says a line on the bus, unless it is still cooling down. Returns true if it was said. */
export function say(state: GameState, bus: EventBus | undefined, id: string): boolean {
  const now = state.runTime ?? 0;
  const last = state.lineLastAt ?? {};
  const cooldown = LINE_COOLDOWN_SEC[id];
  if (cooldown !== undefined && last[id] !== undefined && now - last[id] < cooldown) return false;
  state.lineLastAt = { ...last, [id]: now };
  const text = lineText(id);
  bus?.emit('system:say', { id, th: text.th, en: text.en });
  return true;
}

/** Trash skills get their own line (system_lines §2.1). */
const TRASH_LINE_BY_SKILL: Record<string, string> = {
  J01: 'TRASH_02',
  J02: 'TRASH_01',
  J03: 'TRASH_03',
  J04: 'TRASH_04',
};

/**
 * Subscribes the System voice to the run's events. Returns an unsubscribe function.
 * Counters use kills/picks so the lines rotate without a random stream.
 */
export function attachSystemVoice(bus: EventBus, state: GameState): () => void {
  let picks = 0;
  let fuses = 0;
  const offs = [
    bus.on('run:start', () => say(state, bus, 'WELCOME_01')),
    bus.on('draft:pick', ({ card }) => {
      picks += 1;
      const m = /^skill:(J0[1-6])$/.exec(card);
      const trash = m ? TRASH_LINE_BY_SKILL[m[1]] : undefined;
      if (trash) say(state, bus, trash);
    }),
    bus.on('player:down', () => say(state, bus, variantId('DOWN', 4, picks))),
    bus.on('skill:fused', () => {
      fuses += 1;
      say(state, bus, variantId('FUSE', 5, fuses));
    }),
    bus.on('run:end', ({ result }) => {
      if (result === 'win') say(state, bus, variantId('WIN', 4, state.kills));
      else if (result === 'lose') say(state, bus, variantId('LOSE', 4, state.kills));
      else say(state, bus, variantId('QUIT', 3, state.kills));
    }),
  ];
  return () => offs.forEach((off) => off());
}
