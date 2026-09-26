import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AccountStore } from '../src/accounts';
import { shQuote, validateName } from '../src/commands';
import { t } from '../src/i18n';
import { LabelStore } from '../src/labels';
import { makeTempHome, MemoryMemento, type TempHome } from './helpers';

let tmp: TempHome;
let home: string;
before(() => {
  tmp = makeTempHome('commands');
  home = tmp.home;
});
after(() => tmp.restore());

describe('validateName', () => {
  const make = async (): Promise<{ store: AccountStore; labels: LabelStore }> => {
    const memento = new MemoryMemento();
    const store = new AccountStore(memento);
    const labels = new LabelStore(memento, 'claude.labels');
    await store.add({ name: 'a', dir: path.join(home, '.claude-a') });
    await labels.set('a', 'work');
    return { store, labels };
  };

  test('a new valid name passes', async () => {
    const { store, labels } = await make();
    assert.equal(validateName('b-2_X', store, labels), undefined);
  });

  test('empty, invalid characters, the default name, an existing name or display name are rejected', async () => {
    const { store, labels } = await make();
    assert.equal(validateName('', store, labels), t('name.empty'));
    for (const n of ['a b', 'a/b', '..', 'ä']) assert.equal(validateName(n, store, labels), t('name.invalid'), n);
    assert.equal(validateName('default', store, labels), t('name.reserved', { name: 'default' }));
    assert.equal(validateName('a', store, labels), t('name.exists'));
    assert.equal(validateName('work', store, labels), t('name.dupLabel'));
  });

  test('the default name, existing names and display names are compared case-insensitively', async () => {
    const { store, labels } = await make();
    assert.equal(validateName('Default', store, labels), t('name.reserved', { name: 'default' }));
    assert.equal(validateName('A', store, labels), t('name.exists'));
    assert.equal(validateName('WORK', store, labels), t('name.dupLabel'));
  });

  test('a name whose directory is the default directory (via CLAUDE_CONFIG_DIR) is rejected', async () => {
    const { store, labels } = await make();
    const dir = path.join(home, '.claude-main');
    fs.mkdirSync(dir);
    process.env.CLAUDE_CONFIG_DIR = dir;
    try {
      assert.equal(validateName('main', store, labels), t('name.sameAsDefaultDir'));
    } finally {
      delete process.env.CLAUDE_CONFIG_DIR;
      fs.rmSync(dir, { recursive: true });
    }
  });
});

describe('shQuote', () => {
  test('wraps in single quotes and escapes embedded single quotes', () => {
    assert.equal(shQuote('/home/u/.claude-a'), `'/home/u/.claude-a'`);
    assert.equal(shQuote(`it's`), `'it'\\''s'`);
    assert.equal(shQuote(''), `''`);
  });

  test('bash reads the quoted value back byte for byte', () => {
    for (const s of [`/tmp/a b`, `it's`, `$HOME`, '`id`', `a"b\\c`, `x;rm -rf y`, `line\nbreak`]) {
      assert.equal(execFileSync('bash', ['-c', `printf %s ${shQuote(s)}`], { encoding: 'utf8' }), s);
    }
  });
});
