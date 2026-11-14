import { describe, expect, it } from 'vitest';
import { formatExpPercent, hotkeyLabelForSlot, RO_PALETTE } from '../src/ui/roTheme';

describe('roTheme helpers (RO-Rift Classic UI)', () => {
  it('formats EXP percentage clamped between 0% and 100%', () => {
    expect(formatExpPercent(0, 100)).toBe('0%');
    expect(formatExpPercent(45, 100)).toBe('45%');
    expect(formatExpPercent(99.9, 100)).toBe('99%');
    expect(formatExpPercent(150, 100)).toBe('100%');
    expect(formatExpPercent(-20, 100)).toBe('0%');
    expect(formatExpPercent(5, 0)).toBe('100%');
  });

  it('produces classic RO hotkey labels F1..F9 cleanly', () => {
    expect(hotkeyLabelForSlot(0)).toBe('F1');
    expect(hotkeyLabelForSlot(4)).toBe('F5');
    expect(hotkeyLabelForSlot(8)).toBe('F9');
    expect(hotkeyLabelForSlot(-1)).toBe('F1');
  });

  it('exposes the complete RO-Rift steel-blue and brass palette', () => {
    expect(RO_PALETTE.windowBody).toBe(0x182238);
    expect(RO_PALETTE.headerTop).toBe(0x3b5b8c);
    expect(RO_PALETTE.windowGoldAccent).toBe(0xe5c158);
    expect(RO_PALETTE.hpFill).toBe(0x22c55e);
  });
});
