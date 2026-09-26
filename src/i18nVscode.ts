import * as vscode from 'vscode';
import { type Locale, setLocale } from './i18n';

const SECTION = 'planswap';
const KEY = 'language';

/** Resolves the UI locale from `planswap.language`; `auto` follows the editor display language. */
export function resolveLocale(): Locale {
  const setting = vscode.workspace.getConfiguration(SECTION).get<string>(KEY, 'auto');
  if (setting === 'en' || setting === 'zh-cn') return setting;
  return vscode.env.language.toLowerCase().startsWith('zh') ? 'zh-cn' : 'en';
}

/** Re-resolves the locale when the setting changes, applies it, then calls onChange. */
export function watchLocale(onChange: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (!e.affectsConfiguration(`${SECTION}.${KEY}`)) return;
    setLocale(resolveLocale());
    onChange();
  });
}
