import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateName } from '../src/codex/codexCommands';
import { CodexAccountStore } from '../src/codex/codexStore';
import { t } from '../src/i18n';
import { LabelStore } from '../src/labels';
import { makeTempHome, MemoryMemento, type TempHome } from './helpers';

let tmp: TempHome;
let home: string;
before(() => {
  tmp = makeTempHome('codex-commands');
  home = tmp.home;
});
after(() => tmp.restore());

describe('validateName (Codex)', () => {
  const make = async (): Promise<{ store: CodexAccountStore; labels: LabelStore }> => {
    const memento = new MemoryMemento();
    const store = new CodexAccountStore(memento);
    const labels = new LabelStore(memento, 'codex.labels');
    await store.add({ name: 'a', dir: path.join(home, '.codex-a') });
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

  test('a name whose directory resolves to ~/.codex is rejected', async () => {
    const { store, labels } = await make();
    const def = path.join(home, '.codex');
    fs.mkdirSync(def);
    fs.symlinkSync(def, path.join(home, '.codex-main'));
    try {
      assert.equal(validateName('main', store, labels), t('name.sameAsDefaultDir'));
    } finally {
      fs.rmSync(path.join(home, '.codex-main'));
      fs.rmSync(def, { recursive: true });
    }
  });
});
