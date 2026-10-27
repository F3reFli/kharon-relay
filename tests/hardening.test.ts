import { describe, expect, it } from 'vitest';
import { buildTests, judge } from '../src/core/asm/judge';
import { parse, MAX_CODE_LENGTH } from '../src/core/asm/parser';
import { PRACTICE_SEED } from '../src/core/constants';
import { getPuzzle } from '../src/core/data/puzzles';
import { reduce } from '../src/core/reducer';
import { applyOffline, deserialize, serialize } from '../src/core/save';
import { formatNumber } from '../src/core/format';
import { withModule } from '../src/core/state';
import { execute } from '../src/core/shell/shell';
import { isGlb } from '../scripts/meshy/lib.mjs';
import { newState, owning } from './helpers';
import { REFERENCE_SOLUTIONS } from './solutions';

describe('hardening', () => {
  it('labels named like Object.prototype members are ordinary labels', () => {
    const { program, errors } = parse('constructor: NOP\nJMP constructor\n__proto__: HLT');
    expect(errors).toEqual([]);
    expect(program?.labels.constructor).toBe(0);
    expect(parse('JMP toString').errors[0]?.message).toContain('introuvable');
  });

  it('the virtual filesystem ignores inherited properties', () => {
    const ctx = {
      state: newState(),
      cwd: '/',
      history: [],
      now: new Date(0),
      notation: 'suffix' as const,
    };
    expect(execute('cat constructor', ctx).lines[0]?.text).toContain('aucun fichier');
    expect(execute('ls __proto__', ctx).lines[0]?.text).toContain('aucun fichier');
  });

  it('refuses oversized firmware so the save stays loadable', () => {
    const huge = `${REFERENCE_SOLUTIONS['echo-bus']}\n; ${'x'.repeat(MAX_CODE_LENGTH)}`;
    const out = reduce(newState(), {
      type: 'submitSolution',
      puzzleId: 'echo-bus',
      code: huge,
      module: null,
    });
    expect(out.events[0]).toMatchObject({ type: 'error' });
    expect(out.state.solutions['echo-bus']).toBeUndefined();
  });

  it('rejects forged saves with too many record keys or overflowing values', () => {
    const perks = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`p${i}`, 1]));
    expect(deserialize(JSON.stringify({ ...newState(), perks })).ok).toBe(false);
    const big = { ...newState(), resources: { energy: 1e305, alloy: 0, data: 0, cores: 0 } };
    expect(deserialize(JSON.stringify(big)).ok).toBe(false);
    expect(deserialize(serialize(newState(), 1)).ok).toBe(true);
  });

  it('validates GLB headers strictly', () => {
    const glb = Buffer.alloc(12);
    glb.write('glTF', 0, 'ascii');
    glb.writeUInt32LE(2, 4);
    glb.writeUInt32LE(12, 8);
    expect(isGlb(glb)).toBe(true);
    const v1 = Buffer.from(glb);
    v1.writeUInt32LE(1, 4);
    expect(isGlb(v1)).toBe(false);
    const truncated = Buffer.from(glb);
    truncated.writeUInt32LE(99, 8);
    expect(isGlb(truncated)).toBe(false);
    expect(isGlb(Buffer.from('<html>'))).toBe(false);
  });
});

describe('review fixes', () => {
  it('formats numbers at tier boundaries after rounding', () => {
    expect(formatNumber(999_999)).toBe('1.00M');
    expect(formatNumber(999_500)).toBe('1.00M');
    expect(formatNumber(999.7)).toBe('1.00K');
    expect(formatNumber(9.999)).toBe('10.0');
    expect(formatNumber(99.96)).toBe('100');
    expect(formatNumber(1234)).toBe('1.23K');
    expect(formatNumber(9.9999e9, 'scientific')).toBe('1.00e10');
  });

  it('offline progress only applies temporary bonuses for their remaining duration', () => {
    const base = owning(newState(), { capacitor: 100 });
    const plain = applyOffline(base, base.lastSavedAt + 8 * 3600_000).report?.gains.energy ?? 0;
    const surged = {
      ...base,
      buffs: [{ id: 'surge', label: 's', mult: 3, until: base.time + 30 }],
    };
    const withSurge = applyOffline(surged, base.lastSavedAt + 8 * 3600_000);
    const extra = (withSurge.report?.gains.energy ?? 0) - plain;
    expect(extra).toBeCloseTo(100 * 0.4 * 2 * 30 * 0.5, 3);
    expect(withSurge.state.buffs).toEqual([]);
  });

  it('offline: open incidents keep costing unless the repair swarm is installed', () => {
    const incident = {
      ticket: 1,
      module: 'capacitor' as const,
      puzzleId: 'echo-bus',
      severity: 1,
      startedAt: 0,
      testSeed: 1,
      summary: '',
      autoTried: false,
    };
    const broken = withModule(owning(newState(), { capacitor: 10 }), 'capacitor', { incident });
    const later = broken.lastSavedAt + 3600_000;
    expect(applyOffline(broken, later).report?.gains.energy).toBe(0);
    expect(applyOffline(broken, later).state.modules.capacitor.incident).not.toBeNull();
    const swarm = { ...broken, upgrades: ['swarm-1'] };
    const repaired = applyOffline(swarm, later);
    expect(repaired.report?.gains.energy).toBeGreaterThan(0);
    expect(repaired.state.modules.capacitor.incident).toBeNull();
    expect(repaired.state.stats.incidentsResolved).toBe(1);
  });

  it('a faster but overfitted firmware does not replace a general one', () => {
    const puzzle = getPuzzle('checksum');
    if (!puzzle) throw new Error('missing');
    const general = REFERENCE_SOLUTIONS['checksum'] ?? '';
    let s = reduce(newState(), {
      type: 'submitSolution',
      puzzleId: 'checksum',
      code: general,
      module: null,
    }).state;
    // Déroulé pour exactement la longueur maximale des tests d'entraînement : plus rapide,
    // valide sur la graine d'entraînement, mais faux dès qu'un flux est plus long.
    const maxLen = Math.max(...buildTests(puzzle, PRACTICE_SEED).map((t) => t.input.length));
    const overfit = `${Array.from({ length: maxLen }, () => 'ADD A, IN\nJEOF f').join('\n')}\nf:\nMOV OUT, A`;
    expect(judge(puzzle, overfit, PRACTICE_SEED).passed).toBe(true);
    expect(judge(puzzle, overfit, PRACTICE_SEED).exampleCycles).toBeLessThan(
      s.solutions.checksum?.cycles ?? 0,
    );
    s = reduce(s, {
      type: 'submitSolution',
      puzzleId: 'checksum',
      code: overfit,
      module: null,
    }).state;
    expect(s.solutions.checksum?.code).toBe(general);
  });
});
