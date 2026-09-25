// Tests for the host i18n tables (src/i18n.ts), the webview tables (src/webview/i18n.ts) and package.nls*.json parity.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { en as hostEn, getLocale, setLocale, t, translationsOf, zhCn as hostZh } from '../src/i18n';
import { en as webEn, zhCn as webZh } from '../src/webview/i18n';

const root = path.join(__dirname, '..');

/** Placeholder names (`{name}`) used in a message, sorted. */
const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

/** Asserts two translation tables have the same keys, non-empty values and the same placeholders per key. */
function assertParity(en: Record<string, string>, zh: Record<string, string>): void {
  const enKeys = Object.keys(en);
  const zhKeys = Object.keys(zh);
  assert.ok(enKeys.length > 0, 'empty en table');
  assert.deepEqual(zhKeys.filter((k) => !(k in en)), [], 'keys only in zh-cn');
  assert.deepEqual(enKeys.filter((k) => !(k in zh)), [], 'keys only in en');
  for (const key of enKeys) {
    assert.ok(en[key].trim() !== '', `empty en value for ${key}`);
    assert.ok(zh[key].trim() !== '', `empty zh-cn value for ${key}`);
    assert.deepEqual(placeholders(zh[key]), placeholders(en[key]), `placeholder mismatch for ${key}`);
  }
}

describe('host i18n: setLocale / getLocale', () => {
  after(() => setLocale('en'));
  test('default locale is en', () => {
    assert.equal(getLocale(), 'en');
    assert.equal(t('common.delete'), 'Delete');
  });
  test('setLocale switches the table used by t()', () => {
    setLocale('zh-cn');
    assert.equal(getLocale(), 'zh-cn');
    assert.equal(t('common.delete'), '删除');
    setLocale('en');
    assert.equal(getLocale(), 'en');
    assert.equal(t('common.delete'), 'Delete');
  });
});

describe('host i18n: t() interpolation', () => {
  test('fills {name} placeholders with string and number params', () => {
    assert.equal(t('account.alreadyCurrent', { label: 'work' }), 'work is already the current account.');
    assert.equal(t('label.tooLong', { max: 32 }), 'Display name can be at most 32 characters');
  });
  test('fills several placeholders in one message', () => {
    assert.equal(
      t('account.removeDirPrompt', { label: 'test1', dir: '/h/.claude-test1' }),
      'Account test1 was removed from the list. Also delete directory /h/.claude-test1?',
    );
  });
  test('without params the text is returned as-is, placeholders included', () => {
    assert.equal(t('account.alreadyCurrent'), '{label} is already the current account.');
  });
  test('placeholders missing from params are left intact; extra params are ignored', () => {
    assert.equal(t('account.removeDirPrompt', { label: 'a', other: 'x' }), 'Account a was removed from the list. Also delete directory {dir}?');
  });
  test('substituted values are not interpolated again', () => {
    assert.equal(t('account.removeDirPrompt', { label: '{dir}', dir: '/x' }), 'Account {dir} was removed from the list. Also delete directory /x?');
  });
});

describe('host i18n: table parity', () => {
  test('en and zh-cn have the same keys, non-empty values and matching placeholders', () => {
    assertParity(hostEn, hostZh);
  });
  test('translationsOf returns en and zh-cn values', () => {
    assert.deepEqual(translationsOf('account.external'), ['External directory', '外部目录']);
  });
});

describe('webview i18n: table parity', () => {
  test('en and zh-cn have the same keys, non-empty values and matching placeholders', () => {
    assertParity(webEn, webZh);
  });
});

describe('package.nls parity', () => {
  const readJson = (f: string): Record<string, unknown> => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')) as Record<string, unknown>;
  const nlsEn = readJson('package.nls.json');
  const nlsZh = readJson('package.nls.zh-cn.json');
  test('package.nls.json and package.nls.zh-cn.json have the same keys with non-empty string values', () => {
    assert.deepEqual(Object.keys(nlsZh).filter((k) => !(k in nlsEn)), [], 'keys only in zh-cn');
    assert.deepEqual(Object.keys(nlsEn).filter((k) => !(k in nlsZh)), [], 'keys only in en');
    for (const [k, v] of [...Object.entries(nlsEn), ...Object.entries(nlsZh)]) {
      assert.ok(typeof v === 'string' && v.trim() !== '', `empty value for ${k}`);
    }
  });
  test('every %key% placeholder in package.json exists in both nls files', () => {
    const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
    const used = [...new Set([...pkg.matchAll(/"%([^%"]+)%"/g)].map((m) => m[1]))];
    assert.ok(used.length > 0, 'no %key% placeholders found in package.json');
    assert.deepEqual(used.filter((k) => !(k in nlsEn)), [], 'missing in package.nls.json');
    assert.deepEqual(used.filter((k) => !(k in nlsZh)), [], 'missing in package.nls.zh-cn.json');
  });
});
