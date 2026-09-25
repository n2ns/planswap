import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { setLocale } from '../src/i18n';
import {
  checkCodexSafeToDelete, codexAccountDir, codexDaemonAlive, codexDefaultDir, codexLoggedIn, copyCodexSeed,
  decodeJwtPayload, deleteCodexDir, ensureCodexDir, formatCodexPlan, linkGlobalRules, readCodexAccountInfo, scanCodexDirs,
} from '../src/codex/codexPaths';
import { assertTempHome, makeTempHome, mode, read, type TempHome } from './helpers';

let tmp: TempHome;
let home: string;
let def: string;

before(() => {
  tmp = makeTempHome('codex-paths');
  home = tmp.home;
  def = path.join(home, '.codex');
});
after(() => tmp.restore());

const b64u = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeJwt = (payload: unknown): string => `${b64u({ alg: 'none' })}.${b64u(payload)}.sig`;

describe('decodeJwtPayload', () => {
  test('decodes the second segment as a JSON object', () => {
    assert.deepEqual(decodeJwtPayload(fakeJwt({ email: 'a@b.c', n: 1 })), { email: 'a@b.c', n: 1 });
  });
  test('not a JWT / invalid base64 / not an object / empty string → undefined', () => {
    assert.equal(decodeJwtPayload('not-a-jwt'), undefined);
    assert.equal(decodeJwtPayload('a.!!!!.c'), undefined);
    assert.equal(decodeJwtPayload(`x.${b64u([1, 2])}.y`), undefined);
    assert.equal(decodeJwtPayload(''), undefined);
  });
});

describe('formatCodexPlan', () => {
  test('capitalizes, with the prolite special case', () => {
    for (const [i, o] of [['free', 'Free'], ['go', 'Go'], ['plus', 'Plus'], ['pro', 'Pro'], ['team', 'Team'], ['business', 'Business'], ['enterprise', 'Enterprise'], ['prolite', 'Pro Lite'], ['PLUS', 'Plus']]) {
      assert.equal(formatCodexPlan(i), o);
    }
  });
  test('empty → undefined', () => {
    assert.equal(formatCodexPlan(undefined), undefined);
    assert.equal(formatCodexPlan(''), undefined);
  });
});

describe('codexDefaultDir / codexAccountDir / codexLoggedIn / ensureCodexDir', () => {
  test('default directory is always ~/.codex, ignoring CODEX_HOME', () => {
    assertTempHome(home);
    process.env.CODEX_HOME = '/nonexistent/x';
    assert.equal(codexDefaultDir(), def);
    delete process.env.CODEX_HOME;
    assert.equal(codexAccountDir('foo'), path.join(home, '.codex-foo'));
  });
  test('codexLoggedIn only checks that auth.json exists; ensureCodexDir uses 0700', () => {
    const d = codexAccountDir('login');
    ensureCodexDir(d);
    assert.equal(mode(d), '700');
    assert.equal(codexLoggedIn(d), false);
    fs.writeFileSync(path.join(d, 'auth.json'), '{}');
    assert.equal(codexLoggedIn(d), true);
  });
});

describe('readCodexAccountInfo', () => {
  const mk = (name: string, content?: string): string => {
    const d = path.join(home, name);
    fs.mkdirSync(d, { recursive: true });
    if (content !== undefined) fs.writeFileSync(path.join(d, 'auth.json'), content);
    return d;
  };
  test('chatgpt mode: takes email and plan, never exposes tokens', () => {
    const d = mk('.codex-chat', JSON.stringify({ auth_mode: 'chatgpt', tokens: { id_token: fakeJwt({ email: 'fake@example.com', 'https://api.openai.com/auth': { chatgpt_plan_type: 'plus' } }), access_token: 'FAKE_ACCESS', refresh_token: 'FAKE_REFRESH' } }));
    const r = readCodexAccountInfo(d);
    assert.deepEqual(r, { email: 'fake@example.com', plan: 'Plus', loggedIn: true });
    assert.ok(!JSON.stringify(r).includes('FAKE'));
  });
  test('auth_mode=apikey takes precedence over tokens', () => {
    const d = mk('.codex-key1', JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: 'sk-fake', tokens: { id_token: fakeJwt({ email: 'x@example.com' }) } }));
    assert.deepEqual(readCodexAccountInfo(d), { email: undefined, plan: 'API key', loggedIn: true });
  });
  test('auth_mode missing: API key only when OPENAI_API_KEY is non-empty and there are no tokens', () => {
    assert.deepEqual(readCodexAccountInfo(mk('.codex-key2', JSON.stringify({ OPENAI_API_KEY: 'sk-fake', tokens: null }))), { email: undefined, plan: 'API key', loggedIn: true });
    const withTokens = mk('.codex-key3', JSON.stringify({ OPENAI_API_KEY: 'sk-fake', tokens: { id_token: fakeJwt({ email: 'y@example.com', 'https://api.openai.com/auth': { chatgpt_plan_type: 'pro' } }) } }));
    assert.deepEqual(readCodexAccountInfo(withTokens), { email: 'y@example.com', plan: 'Pro', loggedIn: true });
    assert.deepEqual(readCodexAccountInfo(mk('.codex-key4', JSON.stringify({ OPENAI_API_KEY: '' }))), { email: undefined, plan: undefined, loggedIn: true });
  });
  test('auth_mode=chatgpt never shows API key even with OPENAI_API_KEY', () => {
    const d = mk('.codex-chat2', JSON.stringify({ auth_mode: 'chatgpt', OPENAI_API_KEY: 'sk-fake' }));
    assert.deepEqual(readCodexAccountInfo(d), { email: undefined, plan: undefined, loggedIn: true });
  });
  test('corrupt JSON / missing id_token → logged in without email', () => {
    assert.deepEqual(readCodexAccountInfo(mk('.codex-bad', '{"auth_mode": "chatgpt", "tok')), { email: undefined, plan: undefined, loggedIn: true });
    assert.deepEqual(readCodexAccountInfo(mk('.codex-noid', JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'x' } }))), { email: undefined, plan: undefined, loggedIn: true });
  });
  test('no auth.json → not logged in', () => {
    assert.deepEqual(readCodexAccountInfo(mk('.codex-none')), { loggedIn: false });
  });
});

describe('copyCodexSeed', () => {
  const fresh = (cfg?: string, agents?: string): { src: string; dst: string } => {
    const src = fs.mkdtempSync(path.join(home, 'src-'));
    const dst = fs.mkdtempSync(path.join(home, 'dst-'));
    if (cfg !== undefined) fs.writeFileSync(path.join(src, 'config.toml'), cfg);
    if (agents !== undefined) fs.writeFileSync(path.join(src, 'AGENTS.md'), agents);
    return { src, dst };
  };
  test('copies only config.toml (not AGENTS.md / auth.json) with mode 0600', () => {
    const { src, dst } = fresh('model = "gpt-5"\n[profiles.x]\nmodel_provider = "openai"\n', '# agents\n');
    fs.writeFileSync(path.join(src, 'auth.json'), '{"secret":1}');
    const r = copyCodexSeed(src, dst);
    assert.deepEqual(r, { copied: ['config.toml'], skipped: [] });
    assert.equal(read(path.join(dst, 'config.toml')), 'model = "gpt-5"\n[profiles.x]\nmodel_provider = "openai"\n');
    assert.equal(mode(path.join(dst, 'config.toml')), '600');
    assert.deepEqual(fs.readdirSync(dst), ['config.toml']);
  });
  test('source missing → skipped', () => {
    const { src, dst } = fresh();
    const r = copyCodexSeed(src, dst);
    assert.deepEqual(r.copied, []);
    assert.deepEqual(r.skipped, [{ file: 'config.toml', reason: 'Source file does not exist' }]);
  });
  test('target exists → skipped, not overwritten', () => {
    const { src, dst } = fresh('a = 1\n', 'x');
    fs.writeFileSync(path.join(dst, 'config.toml'), 'ORIG');
    const r = copyCodexSeed(src, dst);
    assert.deepEqual(r.copied, []);
    assert.deepEqual(r.skipped, [{ file: 'config.toml', reason: 'Target already exists' }]);
    assert.equal(read(path.join(dst, 'config.toml')), 'ORIG');
  });
  for (const key of ['forced_login_method', 'forced_chatgpt_workspace_id', 'sqlite_home', 'log_dir', 'model_provider']) {
    test(`blocks top-level key ${key} (with leading whitespace)`, () => {
      const { src, dst } = fresh(`model = "x"\n   ${key} = "v"\n`, 'x');
      const r = copyCodexSeed(src, dst);
      assert.deepEqual(r.copied, []);
      assert.equal(r.skipped.length, 1);
      assert.equal(r.skipped[0].file, 'config.toml');
      assert.equal(r.skipped[0].reason, `Contains top-level key ${key}; not copied`);
      assert.ok(!fs.existsSync(path.join(dst, 'config.toml')));
    });
  }
  test('blocks a [model_providers. section', () => {
    const { src, dst } = fresh('model = "x"\n\n  [model_providers.mine]\nbase_url = "http://x"\n', 'x');
    const r = copyCodexSeed(src, dst);
    assert.equal(r.skipped[0].file, 'config.toml');
    assert.equal(r.skipped[0].reason, 'Contains a [model_providers. section; not copied');
  });
  test('comment lines and key-name prefixes are not false positives', () => {
    const a = fresh('# model_provider = "x"\n  # [model_providers.foo]\n#log_dir = "/x"\nmodel = "y"\n', 'x');
    assert.deepEqual(copyCodexSeed(a.src, a.dst).copied, ['config.toml']);
    const b = fresh('model_provider_x = 1\nlog_dir_extra = 2\n', 'x');
    assert.deepEqual(copyCodexSeed(b.src, b.dst).copied, ['config.toml']);
  });
});

describe('scanCodexDirs / checkCodexSafeToDelete / codexDaemonAlive / deleteCodexDir', () => {
  let dd: string;
  let myTicks: number;
  before(() => {
    fs.mkdirSync(path.join(home, '.codex-a'), { mode: 0o700 });
    fs.mkdirSync(path.join(home, '.codex-b_1'), { mode: 0o700 });
    fs.mkdirSync(path.join(home, '.codex-bad name'));
    fs.symlinkSync(path.join(home, '.codex-a'), path.join(home, '.codex-link'));
    fs.writeFileSync(path.join(home, '.codex-file'), 'x');
    // Make ~/.codex a symlink to ~/.codex-real to verify the realpath exclusion
    fs.mkdirSync(path.join(home, '.codex-real'), { mode: 0o700 });
    fs.symlinkSync(path.join(home, '.codex-real'), def);
    const stat = fs.readFileSync('/proc/self/stat', 'utf8');
    myTicks = Number(stat.slice(stat.lastIndexOf(')') + 1).trim().split(/\s+/)[19]);
    dd = path.join(home, '.codex-b_1', 'app-server-daemon');
    fs.mkdirSync(dd);
  });
  const pidFile = (name: string, obj: unknown): void => { fs.writeFileSync(path.join(dd, name), typeof obj === 'string' ? obj : JSON.stringify(obj)); };
  const clear = (): void => { for (const f of fs.readdirSync(dd)) fs.unlinkSync(path.join(dd, f)); };

  test('scanCodexDirs excludes symlinks, non-directories, invalid names and the default directory realpath', () => {
    const names = scanCodexDirs().map((a) => a.name);
    assert.ok(names.includes('a') && names.includes('b_1'));
    for (const bad of ['link', 'file', 'bad name', 'real']) assert.ok(!names.includes(bad), bad);
    assert.equal(scanCodexDirs().find((a) => a.name === 'a')?.dir, path.join(home, '.codex-a'));
  });
  test('checkCodexSafeToDelete outside home / invalid basename', () => {
    const d = fs.mkdtempSync(path.join(home, 'out-'));
    assert.equal(checkCodexSafeToDelete('/tmp/.codex-x'), 'Directory is not a direct child of the home directory: /tmp/.codex-x');
    assert.match(checkCodexSafeToDelete(path.join(d, '.codex-x')) ?? '', /direct child/);
    assert.equal(checkCodexSafeToDelete(path.join(home, '.codex-bad name')), `Directory name does not match the .codex-<name> format: ${path.join(home, '.codex-bad name')}`);
    assert.match(checkCodexSafeToDelete(path.join(home, 'codex-a')) ?? '', /format/);
  });
  test('checkCodexSafeToDelete default directory (including realpath)', () => {
    assert.match(checkCodexSafeToDelete(def) ?? '', /default account directory|format/);
    assert.equal(checkCodexSafeToDelete(path.join(home, '.codex-real')), `Cannot delete the default account directory: ${path.join(home, '.codex-real')}`);
  });
  test('checkCodexSafeToDelete symlink, missing, non-directory; a normal directory passes', () => {
    assert.match(checkCodexSafeToDelete(path.join(home, '.codex-link')) ?? '', /symbolic link/);
    assert.match(checkCodexSafeToDelete(path.join(home, '.codex-nothere')) ?? '', /does not exist/);
    assert.match(checkCodexSafeToDelete(path.join(home, '.codex-file')) ?? '', /not a directory/);
    assert.equal(checkCodexSafeToDelete(path.join(home, '.codex-b_1')), undefined);
  });
  test('daemon: no directory / no files → not alive', () => {
    assert.equal(codexDaemonAlive(path.join(home, '.codex-a')), false);
    assert.equal(codexDaemonAlive(path.join(home, '.codex-b_1')), false);
  });
  test('daemon: pid is this process with matching startTicks → alive, deletion refused', () => {
    pidFile('daemon.pid', { pid: process.pid, processIdentity: { startTicks: myTicks } });
    assert.equal(codexDaemonAlive(path.join(home, '.codex-b_1')), true);
    assert.match(checkCodexSafeToDelete(path.join(home, '.codex-b_1')) ?? '', /codex daemon is still running/);
    clear();
  });
  test('daemon: a processStartTime string field also works', () => {
    pidFile('app-server-updater.pid', { pid: process.pid, processStartTime: String(myTicks) });
    assert.equal(codexDaemonAlive(path.join(home, '.codex-b_1')), true);
    clear();
  });
  test('daemon: startTicks mismatch / pid missing → not alive', () => {
    pidFile('app-server.pid', { pid: process.pid, processIdentity: { startTicks: myTicks + 1 } });
    assert.equal(codexDaemonAlive(path.join(home, '.codex-b_1')), false);
    clear();
    let pid = 4194303;
    while (fs.existsSync(`/proc/${pid}`)) pid--;
    pidFile('daemon-updater.pid', { pid, processIdentity: { startTicks: myTicks } });
    assert.equal(codexDaemonAlive(path.join(home, '.codex-b_1')), false);
    clear();
  });
  test('daemon: corrupt JSON / missing pid / missing ticks → not alive; any live file among several → true', () => {
    pidFile('daemon.pid', '{not json');
    pidFile('app-server.pid', { processIdentity: { startTicks: myTicks } });
    pidFile('daemon-updater.pid', { pid: process.pid });
    assert.equal(codexDaemonAlive(path.join(home, '.codex-b_1')), false);
    pidFile('app-server-updater.pid', { pid: process.pid, processIdentity: { startTicks: myTicks } });
    assert.equal(codexDaemonAlive(path.join(home, '.codex-b_1')), true);
    clear();
  });
  test('deleteCodexDir refuses unsafe directories and deletes a normal one', async () => {
    await assert.rejects(deleteCodexDir(path.join(home, '.codex-link')), /symbolic link/);
    assert.ok(fs.existsSync(path.join(home, '.codex-a')));
    await deleteCodexDir(path.join(home, '.codex-b_1'));
    assert.ok(!fs.existsSync(path.join(home, '.codex-b_1')));
  });
});

describe('linkGlobalRules (AGENTS.md)', () => {
  const file = 'AGENTS.md';
  let realDef: string;
  before(() => {
    // Above, ~/.codex was made a link to .codex-real; the link target here is ~/.codex/AGENTS.md (inside .codex-real once resolved)
    realDef = def;
  });
  const mk = (n: string): string => {
    const d = codexAccountDir('rules-' + n);
    fs.mkdirSync(d, { recursive: true });
    return d;
  };
  test('default file missing → created with 0600 → linked', () => {
    const defFile = path.join(realDef, file);
    assert.ok(!fs.existsSync(defFile));
    const a = mk('a');
    assert.equal(linkGlobalRules(a), 'linked');
    assert.equal(mode(defFile), '600');
    assert.ok(fs.lstatSync(path.join(a, file)).isSymbolicLink());
    assert.equal(fs.readlinkSync(path.join(a, file)), defFile);
  });
  test('already-linked / kept-own-file / skipped-default', () => {
    assert.equal(linkGlobalRules(mk('a')), 'already-linked');
    const d = mk('d');
    fs.symlinkSync(path.join('..', '.codex', file), path.join(d, file));
    assert.equal(linkGlobalRules(d), 'already-linked');
    const b = mk('b');
    fs.writeFileSync(path.join(b, file), 'own');
    assert.equal(linkGlobalRules(b), 'kept-own-file');
    assert.equal(read(path.join(b, file)), 'own');
    const c = mk('c');
    fs.symlinkSync(path.join(b, file), path.join(c, file));
    assert.equal(linkGlobalRules(c), 'kept-own-file');
    assert.equal(linkGlobalRules(realDef), 'skipped-default');
    assert.equal(linkGlobalRules(path.join(home, '.codex-real')), 'skipped-default');
  });
});

describe('codexPaths in zh-cn', () => {
  after(() => setLocale('en'));
  test('copyCodexSeed and checkCodexSafeToDelete reasons follow the locale', () => {
    setLocale('zh-cn');
    const src = fs.mkdtempSync(path.join(home, 'src-'));
    const dst = fs.mkdtempSync(path.join(home, 'dst-'));
    assert.deepEqual(copyCodexSeed(src, dst).skipped, [{ file: 'config.toml', reason: '源文件不存在' }]);
    fs.writeFileSync(path.join(src, 'config.toml'), 'log_dir = "/x"\n');
    assert.deepEqual(copyCodexSeed(src, dst).skipped, [{ file: 'config.toml', reason: '含顶层键 log_dir，不复制' }]);
    assert.equal(checkCodexSafeToDelete('/tmp/.codex-x'), '目录不是用户主目录的直接子目录：/tmp/.codex-x');
  });
});
