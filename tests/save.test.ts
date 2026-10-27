import { describe, expect, it } from 'vitest';
import {
  applyOffline,
  deserialize,
  exportSave,
  freshState,
  importSave,
  serialize,
} from '../src/core/save';
import type { GameState } from '../src/core/types';
import { newState, owning } from './helpers';

describe('save', () => {
  it('round-trips through JSON', () => {
    const s: GameState = {
      ...owning(newState(), { capacitor: 4 }),
      flags: ['x'],
      drafts: { 'echo-bus': 'NOP' },
    };
    const res = deserialize(serialize(s, 5_000_000));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.modules.capacitor.count).toBe(4);
      expect(res.state.lastSavedAt).toBe(5_000_000);
      expect(res.state.drafts['echo-bus']).toBe('NOP');
    }
  });

  it('fills defaults for missing optional fields (migration)', () => {
    const s = newState();
    const partial = {
      version: 1,
      time: 3,
      createdAt: 1,
      lastSavedAt: 1,
      resources: s.resources,
      lifetime: s.lifetime,
      run: s.run,
      modules: {},
      rng: 7,
    };
    const res = deserialize(JSON.stringify(partial));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.modules.fusion.count).toBe(0);
      expect(res.state.stats.clicks).toBe(0);
      expect(res.state.discovered).toEqual(['capacitor']);
    }
  });

  it.each([
    ['not json', '{oops'],
    [
      'negative resources',
      JSON.stringify({ ...newState(), resources: { energy: -1, alloy: 0, data: 0, cores: 0 } }),
    ],
    ['future version', JSON.stringify({ ...newState(), version: 99 })],
    [
      'bad module id in incident',
      JSON.stringify({
        ...newState(),
        modules: { capacitor: { count: 1, incident: { module: 'evil' } } },
      }),
    ],
    ['huge code', JSON.stringify({ ...newState(), drafts: { a: 'x'.repeat(30_000) } })],
    ['wrong type', JSON.stringify([1, 2, 3])],
  ])('rejects %s', (_label, text) => {
    const res = deserialize(text);
    expect(res.ok).toBe(false);
  });

  it('exports and imports a portable code', () => {
    const s = {
      ...newState(),
      flags: ['été-ünicode'.normalize('NFC').replace(/[^a-z0-9-]/g, 'x')],
    };
    const code = exportSave(s, 42);
    expect(code.startsWith('KHARON1:')).toBe(true);
    const res = importSave(`  ${code}  `);
    expect(res.ok).toBe(true);
  });

  it('rejects bad import codes', () => {
    expect(importSave('hello').ok).toBe(false);
    expect(importSave('KHARON1:@@@@').ok).toBe(false);
    expect(importSave(`KHARON1:${'A'.repeat(2_000_001)}`).ok).toBe(false);
  });

  it('creates a fresh state', () => {
    expect(freshState(10).createdAt).toBe(10);
  });
});

describe('offline progress', () => {
  it('ignores short absences', () => {
    const s = owning(newState(), { capacitor: 10 });
    expect(applyOffline(s, s.lastSavedAt + 5000).report).toBeNull();
  });

  it('grants production at the offline rate, capped', () => {
    const s = owning(newState(), { capacitor: 10 });
    const oneHour = applyOffline(s, s.lastSavedAt + 3600_000);
    expect(oneHour.report?.gains.energy).toBeCloseTo(4 * 3600 * 0.5);
    expect(oneHour.state.time).toBeCloseTo(3600);
    expect(oneHour.state.nextIncidentAt).toBeGreaterThan(oneHour.state.time);
    const week = applyOffline(s, s.lastSavedAt + 7 * 86400_000);
    expect(week.report?.simulated).toBe(8 * 3600);
  });
});
