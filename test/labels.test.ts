import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Memento } from 'vscode';
import { setLocale } from '../src/i18n';
import { EXTERNAL_NAME, LabelStore, labelFor } from '../src/labels';
import { makeTempHome, type TempHome } from './helpers';

let tmp: TempHome;
before(() => { tmp = makeTempHome('labels'); });
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

const make = (): { memento: MemoryMemento; store: LabelStore } => {
  const memento = new MemoryMemento();
  return { memento, store: new LabelStore(memento, 'claude.labels', 'claude.defaultLabel') };
};

describe('LabelStore get/set/remove', () => {
  test('returns undefined when not set', () => {
    assert.equal(make().store.get('default'), undefined);
  });
  test('readable after set; stored as a Record keyed by account name', async () => {
    const { memento, store } = make();
    await store.set('default', '工作号');
    await store.set('test1', 'backup');
    assert.equal(store.get('default'), '工作号');
    assert.equal(store.get('test1'), 'backup');
    assert.deepEqual(memento.get('claude.labels'), { default: '工作号', test1: 'backup' });
  });
  test('set undefined / empty string / same as name → removes the entry', async () => {
    const { memento, store } = make();
    await store.set('a', 'x');
    await store.set('b', 'y');
    await store.set('a', undefined);
    assert.equal(store.get('a'), undefined);
    await store.set('b', 'b');
    assert.equal(store.get('b'), undefined);
    await store.set('c', '');
    assert.deepEqual(memento.get('claude.labels'), {});
  });
  test('remove deletes the alias', async () => {
    const { store } = make();
    await store.set('a', 'x');
    await store.remove('a');
    assert.equal(store.get('a'), undefined);
  });
  test('set does not mutate the object stored in the memento', async () => {
    const { memento, store } = make();
    await store.set('a', 'x');
    const stored = memento.get<Record<string, string>>('claude.labels');
    await store.set('b', 'y');
    assert.deepEqual(stored, { a: 'x' });
  });
});

describe('legacy key migration', () => {
  test('first read migrates claude.defaultLabel to { default: <old value> } and deletes the old key', async () => {
    const memento = new MemoryMemento();
    await memento.update('claude.defaultLabel', 'old-name');
    const store = new LabelStore(memento, 'claude.labels', 'claude.defaultLabel');
    assert.equal(store.get('default'), 'old-name');
    await Promise.resolve();
    assert.deepEqual(memento.get('claude.labels'), { default: 'old-name' });
    assert.equal(memento.get('claude.defaultLabel'), undefined);
  });
  test('ignores the legacy key when the new key already exists', async () => {
    const memento = new MemoryMemento();
    await memento.update('codex.defaultLabel', 'old');
    await memento.update('codex.labels', { default: 'new' });
    const store = new LabelStore(memento, 'codex.labels', 'codex.defaultLabel');
    assert.equal(store.get('default'), 'new');
    assert.equal(memento.get('codex.defaultLabel'), 'old');
  });
});

describe('validate', () => {
  const existing = [
    { name: 'default', label: 'work' },
    { name: 'test1', label: 'test1' },
  ];
  const { store } = make();
  test('valid → undefined (after trim)', () => {
    assert.equal(store.validate('  fresh  ', 'default', existing), undefined);
    assert.equal(store.validate('work', 'default', existing), undefined, 'same as its own current alias is allowed');
  });
  test('blank', () => {
    assert.equal(store.validate('   ', 'default', existing), 'Enter a display name');
  });
  test('longer than 32 characters', () => {
    assert.equal(store.validate('a'.repeat(32), 'default', existing), undefined);
    assert.equal(store.validate('a'.repeat(33), 'default', existing), 'Display name can be at most 32 characters');
  });
  test('contains a line break', () => {
    assert.equal(store.validate('a\nb', 'default', existing), 'Display name cannot contain line breaks');
  });
  test('reserved names: the sentinel and every localized external-directory name', () => {
    assert.equal(store.validate(EXTERNAL_NAME, 'default', existing), `Cannot use the reserved name ${EXTERNAL_NAME}`);
    assert.equal(store.validate('External directory', 'default', existing), 'Cannot use the reserved name External directory');
    assert.equal(store.validate('外部目录', 'default', existing), 'Cannot use the reserved name 外部目录');
  });
  test('same as another account name / label', () => {
    assert.equal(store.validate('test1', 'default', existing), 'Same as an existing account name');
    assert.equal(store.validate('work', 'test1', existing), "Same as an existing account's display name");
  });
});

describe('labelFor', () => {
  test('uses the alias if set, otherwise the name', async () => {
    const { store } = make();
    assert.equal(labelFor('default', store), 'default');
    await store.set('default', 'work');
    assert.equal(labelFor('default', store), 'work');
    assert.equal(labelFor('other', store), 'other');
  });
  test('external row gets the localized name, never the sentinel', () => {
    assert.equal(labelFor(EXTERNAL_NAME, make().store), 'External directory');
  });
});

describe('labels in zh-cn', () => {
  after(() => setLocale('en'));
  test('validate messages and the external row name follow the locale', () => {
    setLocale('zh-cn');
    const { store } = make();
    assert.equal(store.validate('   ', 'default', []), '请输入显示名');
    assert.equal(store.validate('a'.repeat(33), 'default', []), '显示名最多 32 个字符');
    assert.equal(store.validate('External directory', 'default', []), '不能使用保留名 External directory');
    assert.equal(labelFor(EXTERNAL_NAME, store), '外部目录');
  });
});
