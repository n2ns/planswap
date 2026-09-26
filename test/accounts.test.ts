import { after, afterEach, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AccountStore } from '../src/accounts';
import { LabelStore } from '../src/labels';
import { makeTempHome, MemoryMemento, type TempHome } from './helpers';

let tmp: TempHome;
let home: string;
before(() => {
  tmp = makeTempHome('accounts');
  home = tmp.home;
});
after(() => tmp.restore());
afterEach(() => {
  delete process.env.CLAUDE_CONFIG_DIR;
  for (const e of fs.readdirSync(home)) fs.rmSync(path.join(home, e), { recursive: true, force: true });
});

const make = (): { memento: MemoryMemento; store: AccountStore } => {
  const memento = new MemoryMemento();
  return { memento, store: new AccountStore(memento) };
};

describe('AccountStore list', () => {
  test('all() prepends the default account; named() is sorted and never contains a stored default entry', async () => {
    const { memento, store } = make();
    await memento.update('accounts', [
      { name: 'b', dir: path.join(home, '.claude-b') },
      { name: 'default', dir: '/elsewhere' },
      { name: 'a', dir: path.join(home, '.claude-a') },
    ]);
    assert.deepEqual(store.named().map((a) => a.name), ['a', 'b']);
    assert.deepEqual(store.all()[0], { name: 'default', dir: path.join(home, '.claude') });
    assert.equal(store.all().length, 3);
  });

  test('the default account follows CLAUDE_CONFIG_DIR', () => {
    const { store } = make();
    process.env.CLAUDE_CONFIG_DIR = path.join(home, 'custom') + '/';
    assert.deepEqual(store.all(), [{ name: 'default', dir: path.join(home, 'custom') }]);
  });

  test('find by name; findByDir ignores a trailing slash', async () => {
    const { store } = make();
    const dir = path.join(home, '.claude-a');
    await store.add({ name: 'a', dir });
    assert.deepEqual(store.find('a'), { name: 'a', dir });
    assert.equal(store.find('x'), undefined);
    assert.deepEqual(store.findByDir(dir + '/'), { name: 'a', dir });
    assert.equal(store.findByDir(path.join(home, '.claude'))?.name, 'default');
    assert.equal(store.findByDir(path.join(home, '.claude-x')), undefined);
  });
});

describe('AccountStore add / remove / unignore', () => {
  test('add replaces an entry with the same name and clears the directory from the ignore list', async () => {
    const { memento, store } = make();
    const dir = path.join(home, '.claude-a');
    await memento.update('ignoredDirs', [dir, '/other']);
    await store.add({ name: 'a', dir: '/old' });
    await store.add({ name: 'a', dir: dir + '/' });
    assert.deepEqual(store.named(), [{ name: 'a', dir: dir + '/' }]);
    assert.deepEqual(memento.get('ignoredDirs'), ['/other']);
  });

  test('remove records the directory once; removing an unknown name changes nothing', async () => {
    const { memento, store } = make();
    const dir = path.join(home, '.claude-a');
    await store.add({ name: 'a', dir });
    await store.remove('a');
    await store.add({ name: 'a', dir });
    await memento.update('ignoredDirs', [dir + '/']);
    await store.remove('a');
    assert.deepEqual(memento.get('ignoredDirs'), [dir + '/']);
    await store.remove('missing');
    assert.deepEqual(store.named(), []);
    assert.deepEqual(memento.get('ignoredDirs'), [dir + '/']);
  });

  test('unignore removes the directory (trailing slash ignored) and keeps others', async () => {
    const { memento, store } = make();
    await memento.update('ignoredDirs', ['/a', '/b']);
    await store.unignore('/a/');
    assert.deepEqual(memento.get('ignoredDirs'), ['/b']);
  });
});

describe('AccountStore syncWithDisk', () => {
  test('registers new ~/.claude-* directories and skips ignored or already registered ones', async () => {
    for (const n of ['a', 'b', 'c', 'd']) fs.mkdirSync(path.join(home, `.claude-${n}`));
    const { memento, store } = make();
    await memento.update('ignoredDirs', [path.join(home, '.claude-b')]);
    // Same name registered under another directory, and same directory registered under another name
    await store.add({ name: 'c', dir: '/elsewhere' });
    await store.add({ name: 'renamed', dir: path.join(home, '.claude-d') });
    await store.syncWithDisk();
    assert.deepEqual(store.named(), [
      { name: 'a', dir: path.join(home, '.claude-a') },
      { name: 'c', dir: '/elsewhere' },
      { name: 'renamed', dir: path.join(home, '.claude-d') },
    ]);
  });

  test('does not write when nothing is missing', async () => {
    const { memento, store } = make();
    await store.syncWithDisk();
    assert.equal(memento.get('accounts'), undefined);
  });

  test('skips a scanned name equal to an existing display name until that alias changes', async () => {
    const dir = path.join(home, '.claude-work');
    fs.mkdirSync(dir);
    const { memento, store } = make();
    const labels = new LabelStore(memento, 'claude.labels');
    const a = { name: 'a', dir: path.join(home, 'elsewhere-a') };
    await store.add(a);
    await labels.set('a', 'work');
    await store.syncWithDisk(labels);
    assert.deepEqual(store.named(), [a]);
    await labels.set('a', undefined);
    await store.syncWithDisk(labels);
    assert.deepEqual(store.named(), [a, { name: 'work', dir }]);
  });
});
