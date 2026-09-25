// Only tests the pure parsers, listChildren and the throwing paths of planRestart; never calls executeRestart and never signals any process not started by this test
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { setLocale } from '../src/i18n';
import { listChildren, parseCommitFromCmdline, parseStatParentPid, planRestart, readCmdline } from '../src/codex/codexServer';
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

describe('parseCommitFromCmdline', () => {
  test('parses the 40-hex commit from bin/<version>-<commit>/', () => {
    const cmd = '/home/u/.antigravity-ide-server/bin/2.5.5-ecfbad74d93962fc8ca485d93ab9b4f3d4cb6cf8/node /home/u/.antigravity-ide-server/bin/2.5.5-ecfbad74d93962fc8ca485d93ab9b4f3d4cb6cf8/out/server-main.js --start-server';
    assert.equal(parseCommitFromCmdline(cmd), 'ecfbad74d93962fc8ca485d93ab9b4f3d4cb6cf8');
  });
  test('no match / too short → undefined', () => {
    assert.equal(parseCommitFromCmdline('/usr/bin/node foo.js'), undefined);
    assert.equal(parseCommitFromCmdline('/x/bin/1.0-abcdef/out/server-main.js'), undefined);
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
      (e: unknown) => e instanceof Error && /^(Cannot find the WSL server process|Parent process is not Antigravity's WSL server|Cannot parse the commit from the server command line|Failed to read pid file|The pid file does not match the server process)/.test(e.message),
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
      (e: unknown) => e instanceof Error && /^(找不到 WSL 服务端进程|父进程不是 Antigravity 的 WSL 服务端|无法从服务端命令行解析 commit|读取 pid 文件失败|pid 文件与服务端进程不匹配)/.test(e.message),
    );
  });
});
