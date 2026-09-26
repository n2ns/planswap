import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CodexAccountStore } from '../src/codex/codexStore';
import { LabelStore } from '../src/labels';
import { makeTempHome, MemoryMemento, type TempHome } from './helpers';

let tmp: TempHome;
let home: string;
before(() => {
  tmp = makeTempHome('codex-store');
  home = tmp.home;
});
after(() => tmp.restore());

describe('CodexAccountStore', () => {
  test('all() prepends ~/.codex even when CODEX_HOME is set; named() is sorted without a stored default entry', async () => {
    const memento = new MemoryMemento();
    const store = new CodexAccountStore(memento);
    await memento.update('codex.accounts', [
      { name: 'b', dir: path.join(home, '.codex-b') },
      { name: 'default', dir: '/elsewhere' },
      { name: 'a', dir: path.join(home, '.codex-a') },
    ]);
    process.env.CODEX_HOME = path.join(home, '.codex-a');
    try {
      assert.deepEqual(store.all().map((a) => a.name), ['default', 'a', 'b']);
      assert.equal(store.all()[0].dir, path.join(home, '.codex'));
      assert.equal(store.findByDir(path.join(home, '.codex-b') + '/')?.name, 'b');
    } finally {
      delete process.env.CODEX_HOME;
    }
  });

  test('add replaces an entry with the same name and clears the directory from the ignore list', async () => {
    const memento = new MemoryMemento();
    const store = new CodexAccountStore(memento);
    const dir = path.join(home, '.codex-a');
    await memento.update('codex.ignoredDirs', [dir + '/', '/other']);
    await store.add({ name: 'a', dir: '/old' });
    await store.add({ name: 'a', dir });
    assert.deepEqual(store.named(), [{ name: 'a', dir }]);
    assert.deepEqual(memento.get('codex.ignoredDirs'), ['/other']);
  });

  test('remove keeps the directory ignored; unignore lets syncWithDisk register it again', async () => {
    const dir = path.join(home, '.codex-a');
    fs.mkdirSync(dir);
    const memento = new MemoryMemento();
    const store = new CodexAccountStore(memento);
    await store.syncWithDisk();
    assert.deepEqual(store.named(), [{ name: 'a', dir }]);
    await store.remove('a');
    await store.syncWithDisk();
    assert.deepEqual(store.named(), []);
    assert.deepEqual(memento.get('codex.ignoredDirs'), [dir]);
    await store.unignore(dir + '/');
    assert.deepEqual(memento.get('codex.ignoredDirs'), []);
    await store.syncWithDisk();
    assert.deepEqual(store.named(), [{ name: 'a', dir }]);
    fs.rmSync(dir, { recursive: true });
  });

  test('syncWithDisk skips a scanned name equal to an existing display name until that alias changes', async () => {
    const dir = path.join(home, '.codex-work');
    fs.mkdirSync(dir);
    const memento = new MemoryMemento();
    const store = new CodexAccountStore(memento);
    const labels = new LabelStore(memento, 'codex.labels');
    const a = { name: 'a', dir: path.join(home, 'elsewhere-a') };
    await store.add(a);
    await labels.set('a', 'work');
    await store.syncWithDisk(labels);
    assert.deepEqual(store.named(), [a]);
    await labels.set('a', undefined);
    await store.syncWithDisk(labels);
    assert.deepEqual(store.named(), [a, { name: 'work', dir }]);
    fs.rmSync(dir, { recursive: true });
  });});
