import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { setLocale } from '../src/i18n';
import {
  accountDir, checkSafeToDelete, claudeJsonPath, copySettingsStripped, defaultDir, deleteAccountDir,
  ensureAccountDir, formatClaudePlan, linkGlobalRules, readAccountInfo, scanAccountDirs,
} from '../src/paths';
import { assertTempHome, makeTempHome, mode, read, type TempHome } from './helpers';

let tmp: TempHome;
let home: string;
let def: string;

before(() => {
  tmp = makeTempHome('paths');
  home = tmp.home;
  def = path.join(home, '.claude');
  fs.mkdirSync(def, { recursive: true });
});
after(() => tmp.restore());

describe('formatClaudePlan', () => {
  test('combines plan name and multiplier', () => {
    assert.equal(formatClaudePlan('claude_max', 'default_claude_max_20x'), 'Max 20x');
    assert.equal(formatClaudePlan('claude_max', 'default_claude_max_5x'), 'Max 5x');
    assert.equal(formatClaudePlan('bar', 'x_3x'), 'Bar 3x');
  });
  test('maps known plan names', () => {
    assert.equal(formatClaudePlan('claude_pro', undefined), 'Pro');
    assert.equal(formatClaudePlan('claude_team'), 'Team');
    assert.equal(formatClaudePlan('team'), 'Team');
    assert.equal(formatClaudePlan('claude_enterprise'), 'Enterprise');
    assert.equal(formatClaudePlan('enterprise'), 'Enterprise');
  });
  test('unknown type: strips the claude_ prefix and capitalizes', () => {
    assert.equal(formatClaudePlan('claude_foo'), 'Foo');
  });
  test('tier without multiplier → plan name only; multiplier only → multiplier only', () => {
    assert.equal(formatClaudePlan('claude_pro', 'default'), 'Pro');
    assert.equal(formatClaudePlan(undefined, 'default_claude_max_20x'), '20x');
  });
  test('both empty → undefined', () => {
    assert.equal(formatClaudePlan(undefined, undefined), undefined);
    assert.equal(formatClaudePlan('', ''), undefined);
  });
});

describe('defaultDir / accountDir / claudeJsonPath', () => {
  test('defaultDir defaults to ~/.claude; blank CLAUDE_CONFIG_DIR falls back', () => {
    assertTempHome(home);
    assert.equal(defaultDir(), def);
    process.env.CLAUDE_CONFIG_DIR = '   ';
    assert.equal(defaultDir(), def);
    delete process.env.CLAUDE_CONFIG_DIR;
  });
  test('CLAUDE_CONFIG_DIR takes effect with trailing slash removed', () => {
    process.env.CLAUDE_CONFIG_DIR = path.join(home, '.claude-x') + '/';
    assert.equal(defaultDir(), path.join(home, '.claude-x'));
    delete process.env.CLAUDE_CONFIG_DIR;
  });
  test('accountDir', () => {
    assert.equal(accountDir('work'), path.join(home, '.claude-work'));
  });
  test('claudeJsonPath: in the home directory for the default dir without the variable, otherwise inside the dir', () => {
    assert.equal(claudeJsonPath(def), path.join(home, '.claude.json'));
    assert.equal(claudeJsonPath(def + '/'), path.join(home, '.claude.json'));
    assert.equal(claudeJsonPath(path.join(home, '.claude-a')), path.join(home, '.claude-a', '.claude.json'));
    process.env.CLAUDE_CONFIG_DIR = def;
    assert.equal(claudeJsonPath(def), path.join(def, '.claude.json'));
    delete process.env.CLAUDE_CONFIG_DIR;
  });
  test('claudeJsonPath: explicit → always inside the dir, even for the default dir without the variable', () => {
    assert.equal(claudeJsonPath(def, true), path.join(def, '.claude.json'));
    assert.equal(claudeJsonPath(def, false), path.join(home, '.claude.json'));
    assert.equal(claudeJsonPath(path.join(home, '.claude-a'), true), path.join(home, '.claude-a', '.claude.json'));
  });
});

describe('readAccountInfo', () => {
  const mk = (name: string): string => {
    const d = path.join(home, name);
    fs.mkdirSync(d, { recursive: true });
    return d;
  };
  test('no files → not logged in', () => {
    assert.deepEqual(readAccountInfo(mk('.claude-r0')), { email: undefined, plan: undefined, loggedIn: false });
  });
  test('email + plan', () => {
    const d = mk('.claude-r1');
    fs.writeFileSync(path.join(d, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'fake@example.com', organizationType: 'claude_max', organizationRateLimitTier: 'default_claude_max_20x' } }));
    assert.deepEqual(readAccountInfo(d), { email: 'fake@example.com', plan: 'Max 20x', loggedIn: true });
  });
  test('organizationType only', () => {
    const d = mk('.claude-r2');
    fs.writeFileSync(path.join(d, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'p@example.com', organizationType: 'claude_pro' } }));
    assert.deepEqual(readAccountInfo(d), { email: 'p@example.com', plan: 'Pro', loggedIn: true });
  });
  test('email only, no plan fields', () => {
    const d = mk('.claude-r3');
    fs.writeFileSync(path.join(d, '.claude.json'), '{"oauthAccount":{"emailAddress":"a@b.c"}}');
    assert.deepEqual(readAccountInfo(d), { email: 'a@b.c', plan: undefined, loggedIn: true });
  });
  test('truncated JSON / null does not throw', () => {
    const d = mk('.claude-r4');
    fs.writeFileSync(path.join(d, '.claude.json'), '{"oauthAccount":{"emailAddress":"a@b.c"');
    assert.deepEqual(readAccountInfo(d), { email: undefined, plan: undefined, loggedIn: false });
    fs.writeFileSync(path.join(d, '.claude.json'), 'null');
    assert.deepEqual(readAccountInfo(d), { email: undefined, plan: undefined, loggedIn: false });
  });
  test('only the credentials file exists → loggedIn (content not read)', () => {
    const d = mk('.claude-r5');
    fs.writeFileSync(path.join(d, '.credentials.json'), 'not json at all');
    assert.deepEqual(readAccountInfo(d), { email: undefined, plan: undefined, loggedIn: true });
  });
  test('default directory reads ~/.claude.json', () => {
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'd@example.com' } }));
    assert.equal(readAccountInfo(def).email, 'd@example.com');
    fs.rmSync(path.join(home, '.claude.json'));
  });
  test('default directory with explicit → reads ~/.claude/.claude.json instead of ~/.claude.json', () => {
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'home@example.com' } }));
    fs.writeFileSync(path.join(def, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'inner@example.com' } }));
    assert.equal(readAccountInfo(def, true).email, 'inner@example.com');
    assert.equal(readAccountInfo(def).email, 'home@example.com');
    fs.rmSync(path.join(home, '.claude.json'));
    fs.rmSync(path.join(def, '.claude.json'));
  });
});

describe('copySettingsStripped', () => {
  test('strips sensitive keys and writes with 0600', () => {
    fs.writeFileSync(path.join(def, 'settings.json'), JSON.stringify({
      env: { ANTHROPIC_API_KEY: 'x', ANTHROPIC_AUTH_TOKEN: 'x', CLAUDE_CODE_OAUTH_TOKEN: 'x', CLAUDE_CONFIG_DIR: 'x', KEEP: '1' },
      apiKeyHelper: 'x', forceLoginMethod: 'x', forceLoginOrgUUID: 'x', enabledPlugins: {}, extraKnownMarketplaces: {}, additionalMarketplaces: [],
      model: 'opus', permissions: { allow: ['Bash'] },
    }));
    const work = accountDir('work');
    ensureAccountDir(work);
    assert.equal(mode(work), '700');
    assert.equal(copySettingsStripped(def, work), true);
    assert.deepEqual(JSON.parse(read(path.join(work, 'settings.json'))), { env: { KEEP: '1' }, model: 'opus', permissions: { allow: ['Bash'] } });
    assert.equal(mode(path.join(work, 'settings.json')), '600');
  });
  test('does not overwrite an existing target', () => {
    const work = accountDir('work');
    fs.writeFileSync(path.join(work, 'settings.json'), '{"mine":1}');
    assert.equal(copySettingsStripped(def, work), false);
    assert.equal(read(path.join(work, 'settings.json')), '{"mine":1}');
  });
  test('source missing / invalid JSON / not an object → false', () => {
    const w2 = accountDir('w2');
    ensureAccountDir(w2);
    assert.equal(copySettingsStripped(path.join(home, 'nope'), w2), false);
    fs.writeFileSync(path.join(def, 'settings.json'), '{bad');
    assert.equal(copySettingsStripped(def, w2), false);
    fs.writeFileSync(path.join(def, 'settings.json'), '[1]');
    assert.equal(copySettingsStripped(def, w2), false);
    assert.ok(!fs.existsSync(path.join(w2, 'settings.json')));
  });
  test('env stripped empty keeps an empty object', () => {
    const w2 = accountDir('w2');
    fs.writeFileSync(path.join(def, 'settings.json'), JSON.stringify({ env: { ANTHROPIC_API_KEY: 'x' } }));
    assert.equal(copySettingsStripped(def, w2), true);
    assert.deepEqual(JSON.parse(read(path.join(w2, 'settings.json'))), { env: {} });
  });
});

describe('scanAccountDirs', () => {
  before(() => {
    fs.mkdirSync(path.join(home, '.claude-bad name'));
    fs.mkdirSync(path.join(home, '.claude-'));
    fs.writeFileSync(path.join(home, '.claude-file'), '');
    fs.symlinkSync(accountDir('work'), path.join(home, '.claude-link'));
    fs.mkdirSync(path.join(home, 'other'));
  });
  test('filters symlinks, files, invalid names', () => {
    const names = scanAccountDirs().map((a) => a.name);
    assert.ok(names.includes('work') && names.includes('w2'), String(names));
    for (const bad of ['link', 'file', 'bad name', '']) assert.ok(!names.includes(bad), `must not include "${bad}"`);
    assert.equal(scanAccountDirs().find((a) => a.name === 'work')?.dir, accountDir('work'));
  });
  test('excludes the default directory pointed to by CLAUDE_CONFIG_DIR (realpath comparison)', () => {
    process.env.CLAUDE_CONFIG_DIR = accountDir('work') + '/';
    assert.ok(!scanAccountDirs().some((a) => a.name === 'work'));
    assert.ok(scanAccountDirs().some((a) => a.name === 'w2'));
    delete process.env.CLAUDE_CONFIG_DIR;
  });
});

describe('checkSafeToDelete / deleteAccountDir', () => {
  test('refuses the default directory (including one set via CLAUDE_CONFIG_DIR)', () => {
    process.env.CLAUDE_CONFIG_DIR = accountDir('work');
    try {
      assert.equal(checkSafeToDelete(accountDir('work')), `Cannot delete the default account directory: ${accountDir('work')}`);
    } finally {
      delete process.env.CLAUDE_CONFIG_DIR;
    }
    assert.match(checkSafeToDelete(def) ?? '', /format|default account directory/);
  });
  test('refuses symlinks, the home directory itself, outside home, .. escape, invalid names, files, missing', () => {
    assert.equal(checkSafeToDelete(path.join(home, '.claude-link')), `Directory is a symbolic link; refusing to delete: ${path.join(home, '.claude-link')}`);
    assert.match(checkSafeToDelete(home) ?? '', /not a direct child of the home directory/);
    assert.equal(checkSafeToDelete('/tmp/.claude-x'), 'Directory is not a direct child of the home directory: /tmp/.claude-x');
    assert.match(checkSafeToDelete(path.join(home, '..', '.claude-x')) ?? '', /not a direct child of the home directory/);
    assert.equal(checkSafeToDelete(path.join(home, 'other')), `Directory name does not match the .claude-<name> format: ${path.join(home, 'other')}`);
    assert.equal(checkSafeToDelete(path.join(home, '.claude-file')), `Path is not a directory: ${path.join(home, '.claude-file')}`);
    assert.equal(checkSafeToDelete(path.join(home, '.claude-gone')), `Directory does not exist: ${path.join(home, '.claude-gone')}`);
  });
  test('a valid directory passes', () => {
    assert.equal(checkSafeToDelete(accountDir('w2')), undefined);
  });
  test('deleteAccountDir refuses a symlink without touching its target; deletes a valid directory', async () => {
    await assert.rejects(deleteAccountDir(path.join(home, '.claude-link')), /symbolic link/);
    assert.ok(fs.existsSync(accountDir('work')));
    await deleteAccountDir(accountDir('w2'));
    assert.ok(!fs.existsSync(accountDir('w2')));
  });
});

describe('linkGlobalRules', () => {
  const file = 'CLAUDE.md';
  const mk = (n: string): string => {
    const d = accountDir('rules-' + n);
    fs.mkdirSync(d, { recursive: true });
    return d;
  };
  test('default file missing → created with 0600 → linked (absolute link)', () => {
    const defFile = path.join(def, file);
    assert.ok(!fs.existsSync(defFile));
    const a = mk('a');
    assert.equal(linkGlobalRules(a), 'linked');
    assert.equal(mode(defFile), '600');
    assert.ok(fs.lstatSync(path.join(a, file)).isSymbolicLink());
    assert.equal(fs.readlinkSync(path.join(a, file)), defFile);
    fs.writeFileSync(defFile, 'rules');
    assert.equal(read(path.join(a, file)), 'rules');
  });
  test('already a link to the default file → already-linked (including relative links)', () => {
    assert.equal(linkGlobalRules(mk('a')), 'already-linked');
    const d = mk('d');
    fs.symlinkSync(path.join('..', '.claude', file), path.join(d, file));
    assert.equal(linkGlobalRules(d), 'already-linked');
  });
  test('regular file or link elsewhere → kept-own-file, original untouched', () => {
    const b = mk('b');
    fs.writeFileSync(path.join(b, file), 'own');
    assert.equal(linkGlobalRules(b), 'kept-own-file');
    assert.equal(read(path.join(b, file)), 'own');
    const c = mk('c');
    fs.symlinkSync(path.join(b, file), path.join(c, file));
    assert.equal(linkGlobalRules(c), 'kept-own-file');
    assert.equal(fs.readlinkSync(path.join(c, file)), path.join(b, file));
  });
  test('default directory → skipped-default', () => {
    assert.equal(linkGlobalRules(def), 'skipped-default');
  });
});

describe('checkSafeToDelete in zh-cn', () => {
  after(() => setLocale('en'));
  test('reasons follow the locale', () => {
    setLocale('zh-cn');
    assert.equal(checkSafeToDelete('/tmp/.claude-x'), '目录不是用户主目录的直接子目录：/tmp/.claude-x');
    assert.equal(checkSafeToDelete(path.join(home, '.claude-gone')), `目录不存在：${path.join(home, '.claude-gone')}`);
  });
});
