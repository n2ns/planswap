import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { codexDefaultDir } from './codexPaths';
import { t } from '../i18n';

export const STATE_FILE = () => path.join(os.homedir(), '.config', 'ai-switcher', 'codex-home');

export function readSelectedDir(): string | undefined {
  let raw: string;
  try {
    raw = fs.readFileSync(STATE_FILE(), 'utf8');
  } catch {
    return undefined;
  }
  const s = raw.trim();
  return s ? path.resolve(s) : undefined;
}

export function writeSelectedDir(dir: string | undefined): void {
  const file = STATE_FILE();
  const dirName = path.dirname(file);
  fs.mkdirSync(dirName, { recursive: true, mode: 0o700 });
  const tmp = path.join(dirName, `.codex-home.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
  const fd = fs.openSync(tmp, 'w', 0o600);
  try {
    fs.writeFileSync(fd, dir === undefined ? '' : path.resolve(dir));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw e;
  }
  const dfd = fs.openSync(dirName, 'r');
  try {
    fs.fsyncSync(dfd);
  } finally {
    fs.closeSync(dfd);
  }
}

export function effectiveDir(): string {
  const env = process.env.CODEX_HOME;
  return env ? path.resolve(env) : codexDefaultDir();
}

export const RC_BEGIN = '# >>> ai-switcher codex >>>';
export const RC_END = '# <<< ai-switcher codex <<<';

export function rcBlock(): string {
  return [
    RC_BEGIN,
    'if [ -r "$HOME/.config/ai-switcher/codex-home" ]; then',
    '  _ai_switcher_codex_home="$(cat "$HOME/.config/ai-switcher/codex-home" 2>/dev/null)"',
    '  if [ -n "$_ai_switcher_codex_home" ] && [ -d "$_ai_switcher_codex_home" ]; then',
    '    export CODEX_HOME="$_ai_switcher_codex_home"',
    '  else',
    '    unset CODEX_HOME',
    '  fi',
    '  unset _ai_switcher_codex_home',
    'fi',
    RC_END,
    '',
  ].join('\n');
}

/** broken: a BEGIN marker exists without a matching END marker */
export interface RcFileStatus { file: string; hasBlock: boolean; broken: boolean; hasUserExport: boolean }

const USER_EXPORT_RE = /^\s*export\s+CODEX_HOME=/;
const GUARD_RE = /^\s*case\s+\$-\s+in/;

function profilePath(): string { return path.join(os.homedir(), '.profile'); }
function bashrcPath(): string { return path.join(os.homedir(), '.bashrc'); }

/** Returns undefined when the file does not exist; other errors (e.g. permission denied) are thrown. */
function readText(file: string): string | undefined {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw e;
  }
}

/** Returns lines outside marker blocks; if the last BEGIN has no END, lines from that BEGIN count as outside and broken is set. */
function scanBlocks(text: string): { outside: string[]; broken: boolean } {
  const lines = text.split('\n');
  const outside: string[] = [];
  let blockStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (blockStart < 0 && line.trim() === RC_BEGIN) { blockStart = i; continue; }
    if (blockStart >= 0) {
      if (line.trim() === RC_END) blockStart = -1;
      continue;
    }
    outside.push(line);
  }
  if (blockStart >= 0) {
    outside.push(...lines.slice(blockStart));
    return { outside, broken: true };
  }
  return { outside, broken: false };
}

function statusOf(file: string): RcFileStatus {
  const text = readText(file);
  if (text === undefined) return { file, hasBlock: false, broken: false, hasUserExport: false };
  const hasBlock = text.split('\n').some((l) => l.trim() === RC_BEGIN);
  const { outside, broken } = scanBlocks(text);
  const hasUserExport = outside.some((l) => USER_EXPORT_RE.test(l));
  return { file, hasBlock, broken, hasUserExport };
}

export function rcStatus(): RcFileStatus[] {
  return [statusOf(profilePath()), statusOf(bashrcPath())];
}

export interface PreCheck { ok: boolean; reasons: string[] }

export function preCheck(): PreCheck {
  const reasons: string[] = [];
  const shell = process.env.SHELL ?? '';
  if (path.basename(shell) !== 'bash') {
    reasons.push(t('codex.pre.notBash', { shell: shell || t('codex.pre.shellUnset') }));
  }
  for (const name of ['.bash_profile', '.bash_login']) {
    const file = path.join(os.homedir(), name);
    const text = readText(file);
    if (text !== undefined && !text.includes('.bashrc')) {
      reasons.push(t('codex.pre.bashProfile', { file }));
    }
  }
  for (const st of rcStatus()) {
    if (st.broken) {
      reasons.push(t('codex.pre.broken', { file: st.file }));
    }
    if (st.hasUserExport) {
      reasons.push(t('codex.pre.userExport', { file: st.file }));
    }
  }
  return { ok: reasons.length === 0, reasons };
}

function statMode(file: string): number | undefined {
  try {
    return fs.statSync(file).mode & 0o777;
  } catch {
    return undefined;
  }
}

/** Atomic write: resolve symlinks to the real target, temp file in the same dir + fsync + chmod + rename. */
function writeRc(file: string, content: string, mode: number | undefined): void {
  let target = file;
  try {
    target = fs.realpathSync(file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const dirName = path.dirname(target);
  const tmp = path.join(dirName, `.${path.basename(target)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
  const fd = fs.openSync(tmp, 'w', 0o600);
  try {
    fs.writeFileSync(fd, content);
    fs.fsyncSync(fd);
    fs.fchmodSync(fd, mode ?? 0o644);
  } catch (e) {
    fs.closeSync(fd);
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw e;
  }
  fs.closeSync(fd);
  try {
    fs.renameSync(tmp, target);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw e;
  }
}

function installInto(file: string, beforeGuard: boolean): void {
  const text = readText(file);
  const mode = text === undefined ? undefined : statMode(file);
  if (text !== undefined && text.split('\n').some((l) => l.trim() === RC_BEGIN)) return;
  const block = rcBlock();
  if (text === undefined) {
    writeRc(file, block, undefined);
    return;
  }
  if (beforeGuard) {
    const lines = text.split('\n');
    const idx = lines.findIndex((l) => GUARD_RE.test(l));
    if (idx >= 0) {
      const before = lines.slice(0, idx).join('\n');
      const after = lines.slice(idx).join('\n');
      // Always add one blank line before the block (removeRcBlocks removes it too, restoring exactly); the block has a trailing newline so the guard stays on its own line
      const prefix = idx === 0 ? '' : before + '\n\n';
      writeRc(file, prefix + block + after, mode);
      return;
    }
  }
  const sep = text === '' ? '' : text.endsWith('\n') ? '\n' : '\n\n';
  writeRc(file, text + sep + block, mode);
}

export function installRcBlocks(): void {
  installInto(bashrcPath(), true);
  installInto(profilePath(), false);
}

/** Removes all marker blocks; if a BEGIN lacks an END, leaves the file untouched and throws. */
function removeFrom(file: string): void {
  const text = readText(file);
  if (text === undefined) return;
  const lines = text.split('\n');
  let removed = false;
  for (;;) {
    const begin = lines.findIndex((l) => l.trim() === RC_BEGIN);
    if (begin < 0) break;
    const end = lines.findIndex((l, i) => i > begin && l.trim() === RC_END);
    if (end < 0) throw new Error(t('codex.rc.missingEnd', { file }));
    lines.splice(begin, end - begin + 1);
    // Also remove the blank line added before the block at install time
    if (begin > 0 && lines[begin - 1] === '') lines.splice(begin - 1, 1);
    removed = true;
  }
  if (!removed) return;
  const mode = statMode(file);
  writeRc(file, lines.join('\n'), mode);
}

export function removeRcBlocks(): void {
  const errors: Error[] = [];
  for (const file of [bashrcPath(), profilePath()]) {
    try {
      removeFrom(file);
    } catch (e) {
      errors.push(e instanceof Error ? e : new Error(String(e)));
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new Error(errors.map((e) => e.message).join(t('common.listSep')));
}

const STDERR_NOISE = ['cannot set terminal process group', 'no job control in this shell'];

export function selfCheck(): { ok: boolean; detail: string } {
  const file = STATE_FILE();
  const backup = readText(file);
  let tmpDir: string | undefined;
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-switcher-codex-'));
    writeSelectedDir(tmpDir);
    const r = spawnSync('bash', ['-i', '-l', '-c', 'printf %s "$CODEX_HOME"'], {
      timeout: 10000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (r.error) return { ok: false, detail: t('codex.self.bashFailed', { error: r.error.message }) };
    // /etc/profile.d may print a motd etc. to stdout in a login shell; only take the last line
    const lines = (r.stdout ?? '').trimEnd().split('\n');
    const out = (lines[lines.length - 1] ?? '').trim();
    let real = tmpDir;
    try { real = fs.realpathSync(tmpDir); } catch { /* ignore */ }
    if (out === tmpDir || out === real) return { ok: true, detail: `CODEX_HOME=${out}` };
    const stderr = (r.stderr ?? '')
      .split('\n')
      .filter((l) => !STDERR_NOISE.some((noise) => l.includes(noise)))
      .join('\n')
      .trim();
    return {
      ok: false,
      detail: t('codex.self.mismatch', { actual: out, expected: tmpDir, stderr: stderr ? t('codex.self.stderr', { stderr }) : '' }),
    };
  } catch (e) {
    return { ok: false, detail: t('codex.self.error', { error: e instanceof Error ? e.message : String(e) }) };
  } finally {
    try {
      if (backup === undefined) {
        try { fs.unlinkSync(file); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
      } else {
        const s = backup.trim();
        writeSelectedDir(s ? s : undefined);
      }
    } catch { /* ignore */ }
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}
