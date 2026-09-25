// 'vscode' is aliased by esbuild to ./stubs/vscode.ts; the stub is imported directly here to control the configuration
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { currentDir, setConfigDir } from '../src/claudeSettings';
import { ConfigurationTarget, resetConfig, setConfig, updates } from './stubs/vscode';
import { assertTempHome, makeTempHome, type TempHome } from './helpers';

let tmp: TempHome;
let home: string;
let def: string;

before(() => {
  tmp = makeTempHome('claude-settings');
  home = tmp.home;
  def = path.join(home, '.claude');
});
after(() => tmp.restore());
beforeEach(() => resetConfig());

const KEY = 'environmentVariables';
const set = (raw: unknown): void => setConfig('claudeCode', KEY, raw);
const last = (): unknown => updates[updates.length - 1]?.value;

describe('currentDir (getConfiguredConfigDir)', () => {
  test('missing → default directory', () => {
    assertTempHome(home);
    assert.equal(currentDir(), def);
  });
  test('array form', () => {
    set([{ name: 'OTHER', value: '1' }, { name: 'CLAUDE_CONFIG_DIR', value: home + '/.claude-a/' }]);
    assert.equal(currentDir(), path.join(home, '.claude-a'));
  });
  test('object form', () => {
    set({ CLAUDE_CONFIG_DIR: home + '/x/../.claude-b' });
    assert.equal(currentDir(), path.join(home, '.claude-b'));
  });
  test('empty entries are skipped; a later non-empty entry overrides earlier ones', () => {
    set([{ name: 'CLAUDE_CONFIG_DIR', value: '' }]);
    assert.equal(currentDir(), def);
    set([{ name: 'CLAUDE_CONFIG_DIR', value: home + '/.claude-1' }, { name: 'CLAUDE_CONFIG_DIR', value: '' }]);
    assert.equal(currentDir(), path.join(home, '.claude-1'));
    set([{ name: 'CLAUDE_CONFIG_DIR', value: home + '/.claude-1' }, { name: 'CLAUDE_CONFIG_DIR', value: home + '/.claude-2' }]);
    assert.equal(currentDir(), path.join(home, '.claude-2'));
  });
  test('non-string value is stringified; null / undefined skipped; invalid elements ignored', () => {
    set([{ name: 'CLAUDE_CONFIG_DIR', value: null }, 'junk', 42, { value: 'no-name' }]);
    assert.equal(currentDir(), def);
    set([{ name: 'CLAUDE_CONFIG_DIR', value: 123 }]);
    assert.equal(currentDir(), path.resolve('123'));
  });
  test('neither array nor object (e.g. a string) → default directory', () => {
    set('garbage');
    assert.equal(currentDir(), def);
  });
});

describe('setConfigDir', () => {
  test('keeps other entries, removes every CLAUDE_CONFIG_DIR entry, appends the new one, writes to Global', async () => {
    set([{ name: 'A', value: '1' }, { name: 'CLAUDE_CONFIG_DIR', value: '/old' }, { name: 'B', value: 2 }, { name: 'CLAUDE_CONFIG_DIR', value: '' }]);
    await setConfigDir(home + '/.claude-a/');
    assert.deepEqual(last(), [{ name: 'A', value: '1' }, { name: 'B', value: 2 }, { name: 'CLAUDE_CONFIG_DIR', value: path.join(home, '.claude-a') }]);
    assert.equal(updates[0].target, ConfigurationTarget.Global);
    assert.equal(updates[0].section, 'claudeCode');
    assert.equal(updates[0].key, KEY);
  });
  test('does not mutate the array returned by get()', async () => {
    const raw = [{ name: 'A', value: '1' }, { name: 'CLAUDE_CONFIG_DIR', value: '/old' }];
    set(raw);
    await setConfigDir(home + '/.claude-a');
    assert.deepEqual(raw, [{ name: 'A', value: '1' }, { name: 'CLAUDE_CONFIG_DIR', value: '/old' }]);
    assert.notEqual((last() as unknown[])[0], raw[0]);
  });
  test('object form is converted to a {name, value} array with stringified values', async () => {
    set({ A: 1, CLAUDE_CONFIG_DIR: '/old', B: 'x' });
    await setConfigDir(home + '/.claude-b');
    assert.deepEqual(last(), [{ name: 'A', value: '1' }, { name: 'B', value: 'x' }, { name: 'CLAUDE_CONFIG_DIR', value: path.join(home, '.claude-b') }]);
  });
  test('default directory or undefined → only removes entries, appends nothing', async () => {
    set([{ name: 'A', value: '1' }, { name: 'CLAUDE_CONFIG_DIR', value: '/old' }]);
    await setConfigDir(def + '/');
    assert.deepEqual(last(), [{ name: 'A', value: '1' }]);
    await setConfigDir(undefined);
    assert.deepEqual(last(), [{ name: 'A', value: '1' }]);
  });
  test('setting missing → writes an array with only the new entry', async () => {
    await setConfigDir(home + '/.claude-c');
    assert.deepEqual(last(), [{ name: 'CLAUDE_CONFIG_DIR', value: path.join(home, '.claude-c') }]);
  });
});
