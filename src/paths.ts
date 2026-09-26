import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { t } from './i18n';

export const DEFAULT_NAME = 'default';
export const NAME_RE = /^[A-Za-z0-9_-]+$/;
export const DIR_BASENAME_RE = /^\.claude-[A-Za-z0-9_-]+$/;

export interface Account { name: string; dir: string }
export interface AccountInfo { email?: string; plan?: string; loggedIn: boolean }

const STRIP_ENV_KEYS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CONFIG_DIR'];
const STRIP_TOP_KEYS = ['apiKeyHelper', 'forceLoginMethod', 'forceLoginOrgUUID', 'enabledPlugins', 'extraKnownMarketplaces', 'additionalMarketplaces'];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function defaultDir(): string {
  return path.resolve(process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(os.homedir(), '.claude'));
}

export function accountDir(name: string): string {
  return path.resolve(os.homedir(), '.claude-' + name);
}

export function samePath(a: string, b: string): boolean {
  return path.resolve(a) === path.resolve(b);
}

// Real path after resolving symlinks; falls back to path.resolve when the path does not exist
function realPath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

// Whether both point to the same location after resolving symlinks; used when comparing with the default dir
export function sameRealPath(a: string, b: string): boolean {
  return realPath(a) === realPath(b);
}

// Account info file location: without CLAUDE_CONFIG_DIR, Claude Code uses ~/.claude.json (in the home dir, not inside ~/.claude).
// explicit: CLAUDE_CONFIG_DIR is set to dir for the processes that use it (e.g. by the setting), so <dir>/.claude.json is used
export function claudeJsonPath(dir: string, explicit = false): string {
  const home = os.homedir();
  if (!explicit && !process.env.CLAUDE_CONFIG_DIR?.trim() && samePath(dir, path.join(home, '.claude'))) return path.join(home, '.claude.json');
  return path.join(dir, '.claude.json');
}

const CLAUDE_PLAN_NAMES: Record<string, string> = {
  claude_max: 'Max',
  claude_pro: 'Pro',
  claude_team: 'Team',
  team: 'Team',
  claude_enterprise: 'Enterprise',
  enterprise: 'Enterprise',
};

// Formats organizationType / organizationRateLimitTier from .claude.json for display, e.g. "Max 20x"; undefined when both are empty
export function formatClaudePlan(orgType?: string, tier?: string): string | undefined {
  let name: string | undefined;
  if (orgType) {
    name = CLAUDE_PLAN_NAMES[orgType];
    if (!name) {
      const raw = orgType.startsWith('claude_') ? orgType.slice('claude_'.length) : orgType;
      name = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : undefined;
    }
  }
  const m = tier ? /_(\d+)x$/.exec(tier) : null;
  const suffix = m ? `${m[1]}x` : undefined;
  if (name && suffix) return `${name} ${suffix}`;
  return name ?? suffix;
}

function optString(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

// explicit: passed through to claudeJsonPath
export function readAccountInfo(dir: string, explicit = false): AccountInfo {
  let email: string | undefined;
  let plan: string | undefined;
  try {
    const data: unknown = JSON.parse(fs.readFileSync(claudeJsonPath(dir, explicit), 'utf8'));
    const oauth = isPlainObject(data) ? data.oauthAccount : undefined;
    if (isPlainObject(oauth)) {
      email = optString(oauth.emailAddress);
      plan = formatClaudePlan(optString(oauth.organizationType), optString(oauth.organizationRateLimitTier));
    }
  } catch {
    // File missing or being written by the CLI (partial JSON): treat as unknown
  }
  return { email, plan, loggedIn: !!email || fs.existsSync(path.join(dir, '.credentials.json')) };
}

export function scanAccountDirs(): Account[] {
  const home = os.homedir();
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(home, { withFileTypes: true });
  } catch {
    return [];
  }
  const def = defaultDir();
  // Dirent.isDirectory() returns false for symlinks, so symlinks are excluded naturally
  return entries
    .filter((e) => e.isDirectory() && DIR_BASENAME_RE.test(e.name))
    .map((e) => ({ name: e.name.slice('.claude-'.length), dir: path.resolve(home, e.name) }))
    .filter((a) => !sameRealPath(a.dir, def));
}

export function copySettingsStripped(fromDir: string, toDir: string): boolean {
  const src = path.join(fromDir, 'settings.json');
  const dst = path.join(toDir, 'settings.json');
  if (!fs.existsSync(src) || fs.existsSync(dst)) return false;
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(src, 'utf8'));
  } catch {
    return false;
  }
  if (!isPlainObject(data)) return false;
  for (const k of STRIP_TOP_KEYS) delete data[k];
  const env = data.env;
  if (isPlainObject(env)) for (const k of STRIP_ENV_KEYS) delete env[k];
  // wx: fail if the target exists; never overwrite
  fs.writeFileSync(dst, JSON.stringify(data, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return true;
}

export function ensureAccountDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

export type RulesLinkResult = 'linked' | 'already-linked' | 'kept-own-file' | 'skipped-default';

/**
 * Shares the default dir's rules file into an account dir via symlink (shared by Claude and Codex).
 * dir is the default dir → skipped-default; default file missing → create an empty file first (0600);
 * <dir>/file missing → create an absolute symlink to the default file → linked;
 * already a link to the default file → already-linked; a regular file or a link elsewhere → untouched → kept-own-file
 */
export function linkRulesFile(dir: string, defDir: string, file: string): RulesLinkResult {
  if (sameRealPath(dir, defDir)) return 'skipped-default';
  const target = path.resolve(defDir, file);
  const link = path.join(path.resolve(dir), file);
  let st: fs.Stats | undefined;
  try {
    st = fs.lstatSync(link);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  if (st) {
    if (!st.isSymbolicLink()) return 'kept-own-file';
    const to = path.resolve(path.dirname(link), fs.readlinkSync(link));
    return to === path.resolve(target) ? 'already-linked' : 'kept-own-file';
  }
  if (!fs.existsSync(target)) fs.writeFileSync(target, '', { mode: 0o600, flag: 'wx' });
  fs.symlinkSync(target, link);
  return 'linked';
}

// Links the default account's CLAUDE.md into the account dir
export function linkGlobalRules(dir: string): RulesLinkResult {
  return linkRulesFile(dir, defaultDir(), 'CLAUDE.md');
}

export function checkSafeToDelete(dir: string): string | undefined {
  const home = path.resolve(os.homedir());
  const target = path.resolve(dir);
  // Only direct children of the home directory, so a symlinked parent cannot escape the home directory
  if (path.dirname(target) !== home) return t('del.notHomeChild', { dir: target });
  if (!DIR_BASENAME_RE.test(path.basename(target))) return t('del.badName', { pattern: '.claude-<name>', dir: target });
  if (sameRealPath(target, defaultDir())) return t('del.isDefault', { dir: target });
  let st: fs.Stats;
  try {
    st = fs.lstatSync(target);
  } catch {
    return t('del.missing', { dir: target });
  }
  if (st.isSymbolicLink()) return t('del.symlink', { dir: target });
  if (!st.isDirectory()) return t('del.notDir', { dir: target });
  return undefined;
}

export async function deleteAccountDir(dir: string): Promise<void> {
  const reason = checkSafeToDelete(dir);
  if (reason) throw new Error(reason);
  await fs.promises.rm(path.resolve(dir), { recursive: true, force: true });
}
