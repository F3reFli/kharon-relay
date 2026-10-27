import { describe, expect, it } from 'vitest';
import { buildFs, hexNoise, logIdForFile, lookup, normalizePath } from '../src/core/shell/fs';
import { COMMANDS, complete, execute, prompt, tokenize } from '../src/core/shell/shell';
import type { ShellContext, ShellResult } from '../src/core/shell/types';
import { withModule } from '../src/core/state';
import type { GameState } from '../src/core/types';
import { newState, owning, rich } from './helpers';

function ctx(state: GameState = newState(), cwd = '/home/warden'): ShellContext {
  return {
    state,
    cwd,
    history: ['help', 'ls'],
    now: new Date('2026-10-27T10:00:00Z'),
    notation: 'suffix',
  };
}

const text = (r: ShellResult) => r.lines.map((l) => l.text).join('\n');
const actionTypes = (r: ShellResult) =>
  r.actions.map((a) => (a.type === 'dispatch' ? a.action.type : a.type));

function withIncident(s: GameState): GameState {
  return withModule(owning(s, { capacitor: 3 }), 'capacitor', {
    incident: {
      ticket: 4471,
      module: 'capacitor',
      puzzleId: 'echo-bus',
      severity: 0.75,
      startedAt: 0,
      testSeed: 1,
      summary: 'Bus muet',
      autoTried: false,
    },
  });
}

describe('tokenize & paths', () => {
  it('splits with quotes', () => {
    expect(tokenize('echo "a b" c \'d e\'')).toEqual(['echo', 'a b', 'c', 'd e']);
  });

  it('normalizes paths', () => {
    expect(normalizePath('/home/warden', '../..')).toBe('/');
    expect(normalizePath('/logs', './x/../y')).toBe('/logs/y');
    expect(normalizePath('/', '~/readme.txt')).toBe('/home/warden/readme.txt');
    expect(normalizePath('/a', '/b')).toBe('/b');
  });

  it('builds a filesystem reflecting state', () => {
    const s = {
      ...owning(newState(), { relay: 3 }),
      logsUnlocked: ['log-01', 'log-06'],
      flags: ['echo-unlocked'],
      solutions: { 'echo-bus': { code: 'NOP', cycles: 1, size: 1, solvedAt: 0 } },
    };
    const root = buildFs(s);
    expect(lookup(root, '/logs/01_varga_cycle14.log')?.kind).toBe('file');
    expect(lookup(root, '/signal/fragment_03.dat')?.kind).toBe('file');
    expect(lookup(root, '/signal/echo.tkt')?.kind).toBe('file');
    expect(lookup(root, '/firmware/echo-bus.kx')?.kind).toBe('file');
    expect(lookup(root, '/nope')).toBeNull();
    expect(logIdForFile('06_kerbrat_reves.enc')).toBe('log-06');
    expect(hexNoise('x', 2)).toHaveLength(2);
  });
});

describe('commands', () => {
  it('help lists commands and details', () => {
    expect(text(execute('help', ctx()))).toContain('repair');
    expect(text(execute('help repair', ctx()))).toContain('repair <module>');
    expect(text(execute('help zzz', ctx()))).toContain('inconnue');
  });

  it('unknown command and empty input', () => {
    expect(text(execute('frobnicate', ctx()))).toContain('introuvable');
    expect(execute('   ', ctx()).lines).toEqual([]);
  });

  it('navigates the filesystem', () => {
    expect(execute('cd /logs', ctx()).cwd).toBe('/logs');
    expect(execute('cd', ctx(newState(), '/')).cwd).toBe('/home/warden');
    expect(text(execute('cd nowhere', ctx()))).toContain('aucun fichier');
    expect(text(execute('cd readme.txt', ctx()))).toContain('pas un dossier');
    expect(text(execute('pwd', ctx()))).toBe('/home/warden');
    expect(text(execute('ls /', ctx()))).toContain('logs/');
    expect(text(execute('ls -l', ctx()))).toContain('readme.txt');
    expect(text(execute('ls /firmware', ctx()))).toContain('vide');
    expect(text(execute('ls missing', ctx()))).toContain('aucun fichier');
    expect(text(execute('ls readme.txt', ctx()))).toContain('readme.txt');
    expect(text(execute('tree /home', ctx()))).toContain('readme.txt');
    expect(text(execute('tree /zz', ctx()))).toContain('aucun');
  });

  it('reads files and marks logs as read', () => {
    const s = { ...newState(), logsUnlocked: ['log-01', 'log-06'] };
    const r = execute('cat /logs/01_varga_cycle14.log', ctx(s));
    expect(text(r)).toContain('Relais nominal');
    expect(actionTypes(r)).toContain('readLog');
    const enc = execute('cat /logs/06_kerbrat_reves.enc', ctx(s));
    expect(text(enc)).toContain('CHIFFRÉ');
    expect(actionTypes(enc)).not.toContain('readLog');
    expect(text(execute('cat', ctx()))).toContain('usage');
    expect(text(execute('cat /logs', ctx(s)))).toContain('dossier');
    expect(text(execute('cat zz', ctx()))).toContain('aucun');
    expect(text(execute('grep warden readme.txt', ctx()))).toContain('WARDEN');
    expect(text(execute('grep zzzz readme.txt', ctx()))).toContain('aucune');
    expect(text(execute('grep', ctx()))).toContain('usage');
    expect(text(execute('hexdump readme.txt', ctx()))).toMatch(/00000000/);
    expect(text(execute('hexdump', ctx()))).toContain('usage');
    expect(text(execute('hexdump nope', ctx()))).toContain('aucun');
  });

  it('decrypts logs', () => {
    const s = {
      ...newState(),
      logsUnlocked: ['log-06', 'log-01'],
      resources: { energy: 0, alloy: 0, data: 100, cores: 0 },
    };
    expect(actionTypes(execute('decrypt /logs/06_kerbrat_reves.enc', ctx(s)))).toContain('decrypt');
    expect(text(execute('decrypt /logs/01_varga_cycle14.log', ctx(s)))).toContain('déjà en clair');
    expect(
      text(
        execute(
          'decrypt /logs/06_kerbrat_reves.enc',
          ctx({ ...s, resources: { ...s.resources, data: 0 } }),
        ),
      ),
    ).toContain('requis');
    expect(text(execute('decrypt nope', ctx(s)))).toContain('introuvable');
    expect(text(execute('decrypt', ctx(s)))).toContain('usage');
  });

  it('reports station status, modules and incidents', () => {
    const s = withIncident(newState());
    expect(text(execute('status', ctx(s)))).toContain('incident');
    expect(text(execute('status', ctx(newState())))).toContain('nominaux');
    expect(text(execute('modules', ctx(s)))).toContain('#4471');
    expect(text(execute('incidents', ctx(s)))).toContain('Bus muet');
    expect(text(execute('incidents', ctx()))).toContain('Aucun');
    expect(text(execute('top', ctx(s)))).toContain('ZOMBIE');
    expect(text(execute('scan', ctx(s)))).toContain('Balayage');
    expect(
      text(
        execute('scan', ctx({ ...s, anomaly: { id: 1, spawnedAt: 0, expiresAt: 10, seed: 1 } })),
      ),
    ).toContain('PAQUET');
  });

  it('opens the editor and handles repairs', () => {
    const s = withIncident(rich(newState()));
    expect(execute('repair capacitor', ctx(s)).actions).toEqual(
      expect.arrayContaining([{ type: 'openEditor', puzzleId: 'echo-bus', module: 'capacitor' }]),
    );
    expect(text(execute('repair capacitor', ctx()))).toContain('aucun incident');
    expect(text(execute('repair', ctx()))).toContain('usage');
    expect(text(execute('repair fusion', ctx()))).toContain('inconnu');
    expect(actionTypes(execute('patch capa', ctx(s)))).toContain('patch');
    expect(text(execute('patch capacitor', ctx(withIncident(newState()))))).toContain(
      'insuffisantes',
    );
    expect(text(execute('patch capacitor', ctx()))).toContain('aucun incident');
    expect(text(execute('deploy capacitor', ctx(s)))).toContain('Aucun firmware');
    const saved = {
      ...s,
      solutions: { 'echo-bus': { code: 'x', cycles: 1, size: 1, solvedAt: 0 } },
    };
    expect(actionTypes(execute('deploy capacitor', ctx(saved)))).toContain('deploy');
    expect(text(execute('deploy capacitor', ctx()))).toContain('aucun incident');
    expect(actionTypes(execute('edit echo-bus', ctx()))).toContain('openEditor');
    expect(text(execute('edit echo', ctx()))).toContain('inaccessible');
    expect(text(execute('edit', ctx()))).toContain('usage');
  });

  it('builds modules and installs protocols', () => {
    const s = { ...rich(newState()), stats: { ...newState().stats, clicks: 50 } };
    expect(actionTypes(execute('build capacitor 5', ctx(s)))).toContain('buyModule');
    expect(actionTypes(execute('build capacitor max', ctx(s)))).toContain('buyModule');
    expect(text(execute('build capacitor -2', ctx(s)))).toContain('invalide');
    expect(text(execute('build capacitor 5', ctx()))).toContain('insuffisantes');
    const unlockable = { ...s, discovered: [...s.discovered, 'antimatter'] };
    expect(text(execute('build antimatter', ctx(unlockable)))).toContain('verrouillé');
    expect(text(execute('install', ctx(s)))).toContain('click-1');
    expect(text(execute('install', ctx()))).toContain('Aucun');
    expect(actionTypes(execute('install click-1', ctx(s)))).toContain('buyUpgrade');
    expect(
      text(execute('install click-1', ctx({ ...s, resources: newState().resources }))),
    ).toContain('insuffisantes');
    expect(text(execute('install nope', ctx(s)))).toContain('indisponible');
  });

  it('reboot gates on energy', () => {
    expect(text(execute('reboot', ctx()))).toContain('insuffisante');
    const s = { ...newState(), run: { energy: 1e9, alloy: 0, data: 0, cores: 0 } };
    expect(actionTypes(execute('reboot', ctx(s)))).toContain('openReboot');
  });

  it('misc commands and easter eggs', () => {
    expect(actionTypes(execute('clear', ctx()))).toContain('clear');
    expect(text(execute('echo bonjour   monde', ctx()))).toBe('bonjour monde');
    expect(text(execute('history', ctx()))).toContain('help');
    expect(text(execute('whoami', ctx()))).toContain('warden');
    expect(text(execute('date', ctx()))).toContain('2294');
    expect(text(execute('uptime', ctx()))).toContain('actif');
    expect(text(execute('sysinfo', ctx()))).toContain('KX-OS');
    expect(actionTypes(execute('ping terre', ctx()))).toContain('setFlag');
    expect(text(execute('ping nérée', ctx()))).toContain('41 min');
    expect(text(execute('ping mars', ctx()))).toContain('inconnu');
    expect(text(execute('ping', ctx()))).toContain('usage');
    expect(text(execute('man kxasm', ctx()))).toContain('JEOF');
    expect(text(execute('man', ctx()))).toContain('kxasm');
    expect(actionTypes(execute('sudo rm', ctx()))).toContain('setFlag');
    expect(actionTypes(execute('rm -rf /', ctx()))).toContain('setFlag');
    expect(text(execute('rm x', ctx()))).toContain('lecture seule');
    expect(text(execute('exit', ctx()))).toContain('sortie');
    expect(actionTypes(execute('settings', ctx()))).toContain('openSettings');
  });

  it('every command records a command stat', () => {
    COMMANDS.forEach((c) => {
      expect(actionTypes(execute(c.name, ctx()))[0]).toBe('command');
    });
  });
});

describe('completion', () => {
  it('completes command names', () => {
    expect(complete('hel', ctx()).value).toBe('help ');
    expect(complete('re', ctx()).options).toEqual(expect.arrayContaining(['repair', 'reboot']));
    expect(complete('', ctx()).options.length).toBeGreaterThan(10);
  });

  it('completes paths, modules, puzzles, upgrades and commands', () => {
    expect(complete('cat rea', ctx()).value).toBe('cat readme.txt ');
    expect(complete('cd /ho', ctx()).value).toBe('cd /home/');
    expect(complete('cd /zz/', ctx()).options).toEqual([]);
    expect(complete('repair cap', ctx()).value).toBe('repair capacitor ');
    expect(complete('edit fib', ctx()).value).toBe('edit fibonacci ');
    const s = { ...newState(), discovered: [...newState().discovered, 'click-1'] };
    expect(complete('install cl', ctx(s)).value).toBe('install click-1 ');
    expect(complete('help pa', ctx()).value).toBe('help patch ');
    expect(complete('ls ', ctx()).options.length).toBeGreaterThan(1);
    expect(complete('pwd x', ctx()).options).toEqual([]);
    expect(complete('zzz a', ctx()).value).toBe('zzz a');
  });

  it('formats the prompt', () => {
    expect(prompt('/home/warden/x')).toBe('warden@kharon:~/x$');
    expect(prompt('/logs')).toBe('warden@kharon:/logs$');
  });
});
