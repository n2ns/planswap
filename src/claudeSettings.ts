import * as path from 'node:path';
import * as vscode from 'vscode';
import { defaultDir, samePath } from './paths';

const SECTION = 'claudeCode';
const KEY = 'environmentVariables';
const ENV_NAME = 'CLAUDE_CONFIG_DIR';

type EnvEntry = { name: string; value: unknown };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Normalize to an entry array (also accepts the object form {K: v}); returns a new array, never mutates get()'s result
function readEntries(): EnvEntry[] {
  const raw = vscode.workspace.getConfiguration(SECTION).get<unknown>(KEY);
  if (Array.isArray(raw)) {
    return raw.filter((e): e is EnvEntry => isPlainObject(e) && typeof e.name === 'string')
      .map((e) => ({ name: e.name, value: e.value }));
  }
  if (isPlainObject(raw)) return Object.entries(raw).map(([name, value]) => ({ name, value }));
  return [];
}

function getConfiguredConfigDir(): string | undefined {
  let found: string | undefined;
  for (const e of readEntries()) {
    if (e.name !== ENV_NAME || e.value === undefined || e.value === null) continue;
    const v = String(e.value);
    // The official extension skips empty-string entries; a later non-empty entry overrides earlier ones
    if (v) found = v;
  }
  return found === undefined ? undefined : path.resolve(found);
}

export function currentDir(): string {
  return getConfiguredConfigDir() ?? defaultDir();
}

export async function setConfigDir(dir: string | undefined): Promise<void> {
  const config = vscode.workspace.getConfiguration(SECTION);
  const raw = config.get<unknown>(KEY);
  // Other entries are kept as-is (shallow-copied, not filtered, values unchanged); the object form is converted to {name, value} per official semantics
  const next: unknown[] = Array.isArray(raw)
    ? raw.filter((e) => !(isPlainObject(e) && e.name === ENV_NAME)).map((e) => (isPlainObject(e) ? { ...e } : e))
    : isPlainObject(raw)
      ? Object.entries(raw).filter(([name]) => name !== ENV_NAME).map(([name, value]) => ({ name, value: String(value) }))
      : [];
  if (dir !== undefined && !samePath(dir, defaultDir())) next.push({ name: ENV_NAME, value: path.resolve(dir) });
  await config.update(KEY, next, vscode.ConfigurationTarget.Global);
}

export function affectsSetting(e: vscode.ConfigurationChangeEvent): boolean {
  return e.affectsConfiguration(`${SECTION}.${KEY}`);
}
