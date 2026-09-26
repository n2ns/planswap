// Only tests the pure parsers, classification, readServerCommit, listChildren and the throwing paths of planRestart; never calls executeRestart and never signals any process not started by this test
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { setLocale } from '../src/i18n';
import {
  canAutoRestart, classifyDataDir, detectServerKind, listChildren, parseServerRoot, parseStatParentPid, planRestart,
  readCmdline, readServerCommit,
} from '../src/codex/codexServer';
import { assertTempHome, makeTempHome, type TempHome } from './helpers';

let tmp: TempHome;

before(() => {
  tmp = makeTempHome('codex-server');
});
after(() => tmp.restore());

describe('parseStatParentPid', () => {
  test('parses after the last ) when comm contains spaces and parentheses', () => {
    assert.equal(parseStatParentPid('1234 (node (x) y) S 99 1490 1490 34816'), 99);
    assert.equal(parseStatParentPid('1805 (node) S 1526 1490 1490 34816 1490'), 1526);
  });
  test('throws a localized error when the format cannot be parsed', () => {
    assert.throws(() => parseStatParentPid('garbage'), { message: 'Cannot parse stat format' });
    assert.throws(() => parseStatParentPid('1 (x) S abc'), { message: 'Cannot parse stat format' });
  });
  test('matches /proc/self/stat', () => {
    assert.equal(parseStatParentPid(fs.readFileSync('/proc/self/stat', 'utf8')), process.ppid);
  });
});

const COMMIT = 'ecfbad74d93962fc8ca485d93ab9b4f3d4cb6cf8';

describe('parseServerRoot', () => {
  test('Antigravity: bin/<version>-<commit>', () => {
    const root = `/home/u/.antigravity-ide-server/bin/2.5.5-${COMMIT}`;
    assert.equal(parseServerRoot(`${root}/node ${root}/out/server-main.js --start-server --host=127.0.0.1 `), root);
  });
  test('VSCodium: bin/<commit>', () => {
    const root = `/home/u/.vscodium-server/bin/${COMMIT}`;
    assert.equal(parseServerRoot(`${root}/node ${root}/out/server-main.js --start-server --enable-remote-auto-shutdown `), root);
  });
  test('VS Code: bin/<commit>', () => {
    const root = `/home/u/.vscode-server/bin/${COMMIT}`;
    assert.equal(parseServerRoot(`${root}/node ${root}/out/server-main.js --host=127.0.0.1 --port=0 `), root);
  });
  test('no server-main token → undefined', () => {
    assert.equal(parseServerRoot('/usr/bin/node foo.js'), undefined);
    assert.equal(parseServerRoot('/usr/bin/node /x/out/server-main.jsx'), undefined);
    assert.equal(parseServerRoot('node /out/server-main.js'), undefined);
  });
});

describe('classifyDataDir', () => {
  const home = '/home/u';
  test('maps every whitelisted name directly under home', () => {
    assert.equal(classifyDataDir('/home/u/.antigravity-ide-server', home), 'antigravity');
    assert.equal(classifyDataDir('/home/u/.vscodium-server', home), 'vscodium');
    assert.equal(classifyDataDir('/home/u/.vscode-server', home), 'vscode');
    assert.equal(classifyDataDir('/home/u/.vscode-server-insiders', home), 'vscode');
  });
  test('unknown name, nested path or a different home → unknown', () => {
    assert.equal(classifyDataDir('/home/u/.cursor-server', home), 'unknown');
    assert.equal(classifyDataDir('/home/u/x/.vscodium-server', home), 'unknown');
    assert.equal(classifyDataDir('/home/v/.antigravity-ide-server', home), 'unknown');
    assert.equal(classifyDataDir('/home/u/constructor', home), 'unknown');
  });
});

describe('canAutoRestart / detectServerKind', () => {
  test('only antigravity and vscodium restart automatically', () => {
    assert.equal(canAutoRestart('antigravity'), true);
    assert.equal(canAutoRestart('vscodium'), true);
    assert.equal(canAutoRestart('vscode'), false);
    assert.equal(canAutoRestart('unknown'), false);
  });
  test('the test runner is not a WSL server → unknown', () => {
    assert.equal(detectServerKind(), 'unknown');
  });
});

describe('readServerCommit', () => {
  const writeProduct = (name: string, content: string): string => {
    assertTempHome(tmp.home);
    const root = path.join(tmp.home, name);
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'product.json'), content);
    return root;
  };
  test('reads the top-level commit', () => {
    assert.equal(readServerCommit(writeProduct('valid', JSON.stringify({ nameShort: 'x', commit: COMMIT }))), COMMIT);
  });
  test('missing product.json, invalid JSON or a bad commit throws a localized error', () => {
    const noCommit = { message: 'Cannot read the server commit from product.json' };
    assert.throws(() => readServerCommit(path.join(tmp.home, 'missing')), noCommit);
    assert.throws(() => readServerCommit(writeProduct('invalid', '{')), noCommit);
    assert.throws(() => readServerCommit(writeProduct('nocommit', JSON.stringify({ nameShort: 'x' }))), noCommit);
    assert.throws(() => readServerCommit(writeProduct('short', JSON.stringify({ commit: 'abcdef' }))), noCommit);
    assert.throws(() => readServerCommit(writeProduct('upper', JSON.stringify({ commit: COMMIT.toUpperCase() }))), noCommit);
  });
});

describe('readCmdline / listChildren', () => {
  test('readCmdline replaces \\0 with spaces', () => {
    const cl = readCmdline(process.pid);
    assert.ok(!cl.includes('\0'));
    assert.ok(cl.includes('node'));
  });
  test('lists the sleep child started by this test', async () => {
    const child = spawn('sleep', ['30'], { stdio: 'ignore' });
    try {
      await new Promise((r) => setTimeout(r, 200));
      const kids = listChildren(process.pid);
      assert.ok(child.pid !== undefined && kids.includes(child.pid), `children=${kids} childPid=${child.pid}`);
      assert.ok(!listChildren(process.pid).includes(process.pid));
    } finally {
      child.kill(); // The only allowed process operation: ending the sleep this test started itself
    }
  });
});

describe('planRestart', () => {
  test('under the test process (parent is not the server) throws a localized error and returns no plan', () => {
    assertTempHome(tmp.home);
    assert.throws(
      () => planRestart(),
      (e: unknown) => e instanceof Error && /^(Cannot find the WSL server process|Parent process is not a WSL server that supports automatic restart|Cannot read the server commit from product.json|Failed to read pid file|The pid file does not match the server process)/.test(e.message),
    );
  });
});

describe('codexServer in zh-cn', () => {
  after(() => setLocale('en'));
  test('parse and planRestart errors follow the locale', () => {
    setLocale('zh-cn');
    assert.throws(() => parseStatParentPid('garbage'), { message: 'stat 格式无法解析' });
    assert.throws(
      () => planRestart(),
      (e: unknown) => e instanceof Error && /^(找不到 WSL 服务端进程|父进程不是支持自动重启的 WSL 服务端|无法从 product.json 读取服务端 commit|读取 pid 文件失败|pid 文件与服务端进程不匹配)/.test(e.message),
    );
  });
});
