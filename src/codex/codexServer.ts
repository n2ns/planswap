import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { t } from '../i18n';

export interface ServerPlan { serverPid: number; children: number[]; commit: string }

const COMMIT_RE = /bin\/[^/\0]+-([0-9a-f]{40})\//;

/** Parses field 4 (parent pid) of /proc/<pid>/stat. comm may contain spaces and parentheses, so split after the last ')'. */
export function parseStatParentPid(statText: string): number {
  const end = statText.lastIndexOf(')');
  if (end < 0) throw new Error(t('server.statUnparseable'));
  const fields = statText.slice(end + 1).trim().split(/\s+/);
  // fields[0] = state (field 3), fields[1] = ppid (field 4)
  const ppid = Number(fields[1]);
  if (!Number.isInteger(ppid)) throw new Error(t('server.statUnparseable'));
  return ppid;
}

/** Parses the 40-hex-digit commit from the bin/<version>-<commit>/ path segment in cmdline. */
export function parseCommitFromCmdline(cmdline: string): string | undefined {
  return COMMIT_RE.exec(cmdline)?.[1];
}

/** Reads /proc/<pid>/cmdline with \0 replaced by spaces. */
export function readCmdline(pid: number): string {
  return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ');
}

/** Walks numeric dirs under /proc and collects processes with ppid === parentPid (excluding process.pid). */
export function listChildren(parentPid: number): number[] {
  const children: number[] = [];
  for (const name of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    const pid = Number(name);
    if (pid === process.pid) continue;
    let stat: string;
    try {
      stat = fs.readFileSync(`/proc/${name}/stat`, 'utf8');
    } catch {
      continue; // process has exited
    }
    try {
      if (parseStatParentPid(stat) === parentPid) children.push(pid);
    } catch {
      continue;
    }
  }
  return children;
}

export function planRestart(): ServerPlan {
  const ppid = process.ppid;
  if (ppid <= 1) throw new Error(t('server.notFound'));

  const cmdline = readCmdline(ppid);
  if (!cmdline.includes('out/server-main.js') || !cmdline.includes('--start-server')) {
    throw new Error(t('server.notAntigravity', { cmdline: cmdline.slice(0, 120) }));
  }

  const commit = parseCommitFromCmdline(cmdline);
  if (!commit) throw new Error(t('server.noCommit'));

  const pidFile = path.join(os.homedir(), '.antigravity-ide-server', `.${commit}.pid`);
  let pidText: string;
  try {
    pidText = fs.readFileSync(pidFile, 'utf8');
  } catch {
    throw new Error(t('server.pidReadFailed', { file: pidFile }));
  }
  const filePid = Number(pidText.trim());
  const wrapperPid = parseStatParentPid(fs.readFileSync(`/proc/${ppid}/stat`, 'utf8'));
  if (!Number.isInteger(filePid) || filePid !== wrapperPid) {
    throw new Error(t('server.pidMismatch'));
  }

  return { serverPid: ppid, children: listChildren(ppid), commit };
}

export function executeRestart(plan: ServerPlan): void {
  process.kill(plan.serverPid, 'SIGTERM');
  for (const pid of plan.children) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'ESRCH' && code !== 'EPERM') throw e;
    }
  }
}
