import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Memento } from 'vscode';
import { CodexAccountStore } from '../src/codex/codexStore';
import { LabelStore } from '../src/labels';
import { makeTempHome, type TempHome } from './helpers';

let tmp: TempHome;
let home: string;
before(() => {
  tmp = makeTempHome('codex-store');
  home = tmp.home;
});
after(() => tmp.restore());

/** In-memory Memento stub */
class MemoryMemento implements Memento {
  readonly data = new Map<string, unknown>();
  keys(): readonly string[] { return [...this.data.keys()]; }
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    return this.data.has(key) ? (this.data.get(key) as T) : defaultValue;
  }
  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) this.data.delete(key);
    else this.data.set(key, value);
  }
}

describe('CodexAccountStore', () => {
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
    const labels = new LabelStore(memento, 'codex.labels', 'codex.defaultLabel');
    await labels.set('default', 'work');
    await store.syncWithDisk(labels);
    assert.deepEqual(store.named(), []);
    await labels.set('default', undefined);
    await store.syncWithDisk(labels);
    assert.deepEqual(store.named(), [{ name: 'work', dir }]);
    fs.rmSync(dir, { recursive: true });
  });
});
