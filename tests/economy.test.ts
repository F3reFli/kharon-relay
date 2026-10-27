import { describe, expect, it } from 'vitest';
import { describeCondition, evaluate } from '../src/core/conditions';
import {
  energyForFragments,
  maxAffordable,
  moduleCost,
  patchCost,
  rebootFragments,
} from '../src/core/costs';
import { MODULES, getModule, isModuleId, resolveModule } from '../src/core/data/modules';
import { PERKS, UPGRADES, getPerk, getUpgrade, perkCost } from '../src/core/data/upgrades';
import {
  asciiBar,
  formatClock,
  formatCost,
  formatDuration,
  formatNumber,
  formatRate,
  padLeft,
  padRight,
} from '../src/core/format';
import { clickValue, computeModifiers, moduleRates, productionRates } from '../src/core/modifiers';
import { add, canAfford, isEmptyCost, scale, subtract, timeToAfford } from '../src/core/resources';
import {
  createRandomStream,
  nextExponential,
  nextInt,
  nextRandom,
  nextWeighted,
} from '../src/core/rng';
import { newState, owning, rich } from './helpers';

const capacitor = getModule('capacitor');
if (!capacitor) throw new Error('capacitor missing');

describe('format', () => {
  it.each([
    [0, '0'],
    [5, '5'],
    [1.5, '1.50'],
    [42.42, '42.4'],
    [999, '999'],
    [1234, '1.23K'],
    [12_345, '12.3K'],
    [123_456, '123K'],
    [1.5e9, '1.50B'],
    [-2500, '-2.50K'],
  ])('formatNumber(%d) = %s', (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });

  it('switches to scientific notation', () => {
    expect(formatNumber(1.5e40)).toBe('1.50e40');
    expect(formatNumber(12_000, 'scientific')).toBe('1.20e4');
    expect(formatNumber(Infinity)).toBe('∞');
    expect(formatNumber(-Infinity)).toBe('-∞');
  });

  it('formats rates, costs and durations', () => {
    expect(formatRate(12)).toBe('+12/s');
    expect(formatCost({ energy: 1500, alloy: 0, data: 3 })).toBe('⚡1.50K ◈3');
    expect(formatClock(3725)).toBe('01:02:05');
    expect(formatClock(90_000)).toBe('1j 01:00:00');
    expect(formatDuration(42)).toBe('42 s');
    expect(formatDuration(125)).toBe('2 min 05 s');
    expect(formatDuration(7500)).toBe('2 h 05 min');
    expect(formatDuration(200_000)).toBe('2 j 7 h');
    expect(asciiBar(0.5, 4)).toBe('██░░');
    expect(asciiBar(Number.NaN, 2)).toBe('░░');
    expect(padRight('abc', 5)).toBe('abc  ');
    expect(padRight('abcdef', 3)).toBe('abc');
    expect(padLeft('7', 3)).toBe('  7');
    expect(padLeft('1234', 2)).toBe('12');
  });
});

describe('rng', () => {
  it('is deterministic and in range', () => {
    const a = nextRandom(1);
    expect(nextRandom(1)).toEqual(a);
    expect(a.value).toBeGreaterThanOrEqual(0);
    expect(a.value).toBeLessThan(1);
    const i = nextInt(9, 3, 5);
    expect(i.value).toBeGreaterThanOrEqual(3);
    expect(i.value).toBeLessThanOrEqual(5);
    expect(nextExponential(4, 10).value).toBeGreaterThan(0);
  });

  it('picks weighted indices', () => {
    expect(nextWeighted(1, [0, 0, 5]).value).toBe(2);
    expect(nextWeighted(1, [0, 0]).value).toBe(-1);
    const stream = createRandomStream(3);
    expect(stream()).not.toBe(stream());
  });
});

describe('resources', () => {
  const r = { energy: 10, alloy: 5, data: 0, cores: 0 };
  it('adds, subtracts, scales immutably', () => {
    expect(add(r, { energy: 5 }).energy).toBe(15);
    expect(subtract(r, { alloy: 10 }).alloy).toBe(0);
    expect(scale({ energy: 2 }, 3)).toEqual({ energy: 6 });
    expect(r.energy).toBe(10);
    expect(canAfford(r, { energy: 10 })).toBe(true);
    expect(canAfford(r, { data: 1 })).toBe(false);
    expect(isEmptyCost({ energy: 0 })).toBe(true);
  });

  it('computes time to afford', () => {
    const rates = { energy: 2, alloy: 0, data: 0, cores: 0 };
    expect(timeToAfford(r, rates, { energy: 20 })).toBe(5);
    expect(timeToAfford(r, rates, { alloy: 6 })).toBe(Infinity);
    expect(timeToAfford(r, rates, { energy: 1 })).toBe(0);
  });
});

describe('data integrity', () => {
  it('has unique ids', () => {
    const ids = [
      ...MODULES.map((m) => m.id),
      ...UPGRADES.map((u) => u.id),
      ...PERKS.map((p) => p.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves modules by id, code and prefix', () => {
    expect(resolveModule('SOLR')?.id).toBe('solar');
    expect(resolveModule('fus')?.id).toBe('fusion');
    expect(resolveModule('')).toBeUndefined();
    expect(isModuleId('drone')).toBe(true);
    expect(isModuleId('nope')).toBe(false);
    expect(getUpgrade('click-1')?.name).toBeTruthy();
    expect(getPerk('harmonic')).toBeTruthy();
    expect(perkCost(PERKS[0] ?? (null as never), 2)).toBe(4);
  });
});

describe('costs', () => {
  it('grows geometrically', () => {
    expect(moduleCost(capacitor, 0, 1).energy).toBe(15);
    expect(moduleCost(capacitor, 1, 1).energy).toBe(Math.ceil(15 * 1.15));
    const ten = moduleCost(capacitor, 0, 10).energy ?? 0;
    const sum = Array.from({ length: 10 }, (_, i) => 15 * 1.15 ** i).reduce((a, b) => a + b, 0);
    expect(ten).toBe(Math.ceil(sum));
  });

  it('computes max affordable consistently', () => {
    const s = { ...newState(), resources: { energy: 1000, alloy: 0, data: 0, cores: 0 } };
    const n = maxAffordable(s, capacitor);
    expect(canAfford(s.resources, moduleCost(capacitor, 0, n))).toBe(true);
    expect(canAfford(s.resources, moduleCost(capacitor, 0, n + 1))).toBe(false);
    expect(maxAffordable(newState(), capacitor)).toBe(0);
  });

  it('patch cost is half of a unit and reduced by upgrades', () => {
    const s = owning(newState(), { capacitor: 1 });
    const base = patchCost(s, 'capacitor', computeModifiers(s));
    expect(base.energy).toBe(8);
    const welded = { ...s, upgrades: ['cold-weld'] };
    expect(patchCost(welded, 'capacitor', computeModifiers(welded)).energy).toBe(4);
  });

  it('computes reboot fragments', () => {
    const s = newState();
    expect(rebootFragments(s)).toBe(0);
    expect(rebootFragments({ ...s, run: { ...s.run, energy: energyForFragments(3) } })).toBe(3);
  });
});

describe('modifiers & production', () => {
  it('produces from owned modules', () => {
    const s = owning(newState(), { capacitor: 10, solar: 2 });
    const rates = productionRates(s);
    expect(rates.energy).toBeCloseTo(10 * 0.4 + 2 * 3);
  });

  it('applies upgrades, achievements, cores, buffs and incidents', () => {
    let s = owning(newState(), { capacitor: 10 });
    const base = productionRates(s).energy;
    s = { ...s, upgrades: ['capacitor-t1', 'bus-opt'] };
    expect(productionRates(s).energy).toBeCloseTo(base * 2 * 1.5);
    s = { ...s, achievements: ['a', 'b'], resources: { ...s.resources, cores: 5 } };
    expect(productionRates(s).energy).toBeCloseTo(base * 3 * 1.04 * 1.2);
    const buffed = { ...s, buffs: [{ id: 'x', label: 'x', mult: 2, until: 100 }] };
    expect(productionRates(buffed).energy).toBeCloseTo(productionRates(s).energy * 2);
    const broken = {
      ...s,
      modules: {
        ...s.modules,
        capacitor: {
          ...s.modules.capacitor,
          incident: {
            ticket: 1,
            module: 'capacitor' as const,
            puzzleId: 'echo-bus',
            severity: 1,
            startedAt: 0,
            testSeed: 1,
            summary: '',
            autoTried: false,
          },
        },
      },
    };
    expect(productionRates(broken).energy).toBe(0);
  });

  it('aggregates every effect kind', () => {
    const s = {
      ...newState(),
      upgrades: [
        'click-1',
        'click-3',
        'click-crit',
        'stab-1',
        'daemon',
        'swarm-1',
        'swarm-2',
        'deep-sleep',
        'fractal',
        'procurement',
        'echo-decoder',
      ],
      perks: { vigil: 1, patience: 2, ghost: 3 },
    };
    const m = computeModifiers(s);
    expect(m.clickMult).toBe(2);
    expect(m.clickFromRate).toBeCloseTo(0.03);
    expect(m.critChance).toBeCloseTo(0.08);
    expect(m.stability).toBeCloseTo(1.25 * 1.15 * 1.15);
    expect(m.autoDeploy).toBe(true);
    expect(m.autoRepair).toBe(40);
    expect(m.offlineHours).toBe(16);
    expect(m.offlineRate).toBeCloseTo(0.8);
    expect(m.resourceMult.data).toBe(2);
    expect(m.costMult).toBeCloseTo(0.9);
  });

  it('click value includes share of energy rate', () => {
    const s = { ...owning(newState(), { solar: 10 }), upgrades: ['click-3'] };
    const mods = computeModifiers(s);
    expect(clickValue(s, mods)).toBeCloseTo(1 + 30 * 0.03);
  });

  it('module rates are empty when none owned', () => {
    const s = newState();
    expect(moduleRates(s, computeModifiers(s), 'fusion').energy).toBe(0);
  });
});

describe('conditions', () => {
  it('evaluates all kinds', () => {
    const s = { ...rich(owning(newState(), { solar: 3 })), flags: ['f'], upgrades: ['u'] };
    expect(evaluate(s, { kind: 'always' })).toBe(true);
    expect(evaluate(s, { kind: 'owned', module: 'solar', count: 3 })).toBe(true);
    expect(evaluate(s, { kind: 'clicks', count: 1 })).toBe(false);
    expect(evaluate(s, { kind: 'solved', count: 1 })).toBe(false);
    expect(evaluate(s, { kind: 'flag', flag: 'f' })).toBe(true);
    expect(evaluate(s, { kind: 'upgrade', id: 'u' })).toBe(true);
    expect(
      evaluate(s, { kind: 'all', conditions: [{ kind: 'always' }, { kind: 'flag', flag: 'x' }] }),
    ).toBe(false);
  });

  it('describes conditions', () => {
    expect(
      describeCondition({
        kind: 'all',
        conditions: [{ kind: 'clicks', count: 5 }, { kind: 'always' }],
      }),
    ).toContain('5 impulsions');
    expect(describeCondition({ kind: 'lifetime', resource: 'energy', amount: 10 })).toContain('10');
    expect(describeCondition({ kind: 'owned', module: 'drone', count: 2 })).toContain('drones');
    expect(describeCondition({ kind: 'solved', count: 1 })).toContain('firmware');
    expect(describeCondition({ kind: 'flag', flag: 'x' })).toContain('narratif');
    expect(describeCondition({ kind: 'upgrade', id: 'x' })).toContain('x');
  });
});
