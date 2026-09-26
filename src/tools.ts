import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { currentDir } from './claudeSettings';
import { effectiveDir } from './codex/codexState';
import { linkGlobalRules as linkClaudeRules, type RulesLinkResult } from './paths';
import { linkGlobalRules as linkCodexRules } from './codex/codexPaths';
import type { PanelMode, ToolId } from './protocol';
import { t } from './i18n';

export interface ToolDeps {
  // "Restart WSL server" provided by codexCommands (with modal confirmation and planRestart checks); undefined when Codex is not initialized
  codexRestart?: () => Promise<void>;
  // Panel entry: push version info to the sidebar (the editor's quick input position is not under extension control, so no QuickPick)
  postVersions?: (items: Array<{ label: string; value: string }>) => void;
  // Directories of each vendor's registered accounts (for "sync rules"); undefined when not initialized
  claudeDirs?: () => string[];
  codexDirs?: () => string[];
}

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Tool entry shared by the panel toolbar and the Command Palette */
export async function runTool(mode: PanelMode, tool: ToolId, deps: ToolDeps): Promise<void> {
  switch (tool) {
    case 'openHelp':
      await vscode.env.openExternal(vscode.Uri.parse('https://github.com/n2ns/planswap#readme'));
      return;
    case 'openStar':
      await vscode.env.openExternal(vscode.Uri.parse('https://github.com/n2ns/planswap'));
      return;
    case 'openGlobalMd':
      await openGlobalMd(mode);
      return;
    case 'openSettings':
      await vscode.commands.executeCommand('workbench.action.openSettings', mode === 'claude' ? 'claudeCode.' : 'chatgpt.');
      return;
    case 'reloadWindow':
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
      return;
    case 'restartExtHost':
      await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
      return;
    case 'restartServer':
      if (!deps.codexRestart) {
        void vscode.window.showWarningMessage(t('tools.codexNotInit'));
        return;
      }
      await deps.codexRestart();
      return;
    case 'cliVersions':
      if (deps.postVersions) deps.postVersions(await collectVersions());
      else await showCliVersions();
      return;
    case 'syncRules':
      syncRules(mode, deps);
      return;
    case 'updateCli': {
      const vendor = mode === 'claude' ? 'Claude' : 'Codex';
      const terminal = vscode.window.createTerminal({ name: t('tools.updateCli', { vendor }) });
      terminal.sendText(mode === 'claude' ? 'claude update' : 'env -u CODEX_HOME codex update');
      terminal.show();
      return;
    }
  }
}

// Links the default account's global rules file into the vendor's other account dirs and reports in one summary notification
function syncRules(mode: PanelMode, deps: ToolDeps): void {
  const dirs = mode === 'claude' ? deps.claudeDirs : deps.codexDirs;
  if (!dirs) {
    void vscode.window.showWarningMessage(t('tools.syncNotInit', { vendor: mode === 'claude' ? 'Claude' : 'Codex' }));
    return;
  }
  const link = mode === 'claude' ? linkClaudeRules : linkCodexRules;
  const file = mode === 'claude' ? 'CLAUDE.md' : 'AGENTS.md';
  const prefix = mode === 'claude' ? '.claude-' : '.codex-';
  // The account name is derived from the dir name (.claude-work → work)
  const nameOf = (dir: string): string => {
    const base = path.basename(dir);
    return base.startsWith(prefix) ? base.slice(prefix.length) : base;
  };
  const counts: Record<RulesLinkResult, number> = { linked: 0, 'already-linked': 0, 'kept-own-file': 0, 'skipped-default': 0 };
  const kept: string[] = [];
  const failed: string[] = [];
  for (const dir of dirs()) {
    try {
      const r = link(dir);
      counts[r]++;
      if (r === 'kept-own-file') kept.push(nameOf(dir));
    } catch (err) {
      failed.push(t('tools.sync.failedItem', { name: nameOf(dir), error: errText(err) }));
    }
  }
  const parts: string[] = [];
  if (counts.linked) parts.push(t('tools.sync.linked', { count: counts.linked }));
  if (counts['already-linked']) parts.push(t('tools.sync.already', { count: counts['already-linked'] }));
  if (kept.length) parts.push(t('tools.sync.kept', { names: kept.join(t('common.nameSep')), file }));
  if (failed.length) parts.push(t('tools.sync.failed', { list: failed.join(t('common.listSep')) }));
  if (parts.length === 0) {
    void vscode.window.showInformationMessage(t('tools.sync.nothing', { file }));
    return;
  }
  void vscode.window.showInformationMessage(t('tools.sync.summary', { parts: parts.join(t('common.listSep')) }));
}

// claude → <current Claude effective dir>/CLAUDE.md; codex → <current Codex effective dir>/AGENTS.md
async function openGlobalMd(mode: PanelMode): Promise<void> {
  const file = mode === 'claude' ? path.join(currentDir(), 'CLAUDE.md') : path.join(effectiveDir(), 'AGENTS.md');
  if (!fs.existsSync(file)) {
    // A dangling symlink (e.g. to a deleted default rules file): create its target so the link works again
    const target = danglingLinkTarget(file) ?? file;
    const createLabel = t('tools.create');
    const ok = await vscode.window.showInformationMessage(t('tools.fileMissingCreate', { file: target }), { modal: true }, createLabel);
    if (ok !== createLabel) return;
    try {
      fs.writeFileSync(target, '', { mode: 0o600, flag: 'wx' });
    } catch (err) {
      void vscode.window.showErrorMessage(t('tools.createFailed', { error: errText(err) }));
      return;
    }
  }
  try {
    await vscode.window.showTextDocument(vscode.Uri.file(file));
  } catch (err) {
    void vscode.window.showErrorMessage(t('tools.openFailed', { error: errText(err) }));
  }
}

// Target path of file when it is a symlink to a file of the same name (relative targets resolved against the link's
// real directory, as the kernel does); undefined otherwise, so nothing but a rules file is ever created
function danglingLinkTarget(file: string): string | undefined {
  try {
    if (!fs.lstatSync(file).isSymbolicLink()) return undefined;
    const target = path.resolve(fs.realpathSync(path.dirname(file)), fs.readlinkSync(file));
    return path.basename(target) === path.basename(file) ? target : undefined;
  } catch {
    return undefined;
  }
}

// Runs `<cmd> --version` read-only without a shell; shows "not found" when not installed, otherwise an error summary
function cliVersion(cmd: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, ['--version'], { timeout: 8000 }, (err, stdout) => {
      if (err) {
        const e = err as NodeJS.ErrnoException & { killed?: boolean };
        if (e.code === 'ENOENT') return resolve(t('tools.ver.notFound'));
        if (e.killed) return resolve(t('tools.ver.timeout'));
        return resolve(t('tools.ver.failed', { error: errText(err).split('\n')[0] }));
      }
      const line = stdout.trim().split('\n')[0]?.trim();
      resolve(line || t('tools.ver.noOutput'));
    });
  });
}

function extVersion(id: string): string {
  const version = vscode.extensions.getExtension(id)?.packageJSON?.version;
  return typeof version === 'string' ? version : t('tools.ver.notFound');
}

async function collectVersions(): Promise<Array<{ label: string; value: string }>> {
  const [claudeCli, codexCli] = await Promise.all([cliVersion('claude'), cliVersion('codex')]);
  return [
    { label: 'Claude Code CLI', value: claudeCli },
    { label: t('tools.ver.claudeExt'), value: extVersion('anthropic.claude-code') },
    { label: 'Codex CLI', value: codexCli },
    { label: t('tools.ver.codexExt'), value: extVersion('openai.chatgpt') },
  ];
}

async function showCliVersions(): Promise<void> {
  const items: vscode.QuickPickItem[] = (await collectVersions()).map((v) => ({ label: v.label, description: v.value }));
  // Display only; picking an item does nothing
  await vscode.window.showQuickPick(items, { canPickMany: false, placeHolder: t('tools.ver.placeholder') });
}

/** Command Palette entries; restarting the WSL server reuses aiSwitcher.codex.restartServer and is not registered here */
export function registerToolCommands(deps: ToolDeps): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('aiSwitcher.tools.openClaudeMd', () => runTool('claude', 'openGlobalMd', deps)),
    vscode.commands.registerCommand('aiSwitcher.tools.openAgentsMd', () => runTool('codex', 'openGlobalMd', deps)),
    vscode.commands.registerCommand('aiSwitcher.tools.openSettings', async () => {
      const picked = await vscode.window.showQuickPick(
        [
          { label: 'Claude Code', mode: 'claude' as const },
          { label: 'Codex', mode: 'codex' as const },
        ],
        { placeHolder: t('tools.pick.settings') },
      );
      if (picked) await runTool(picked.mode, 'openSettings', deps);
    }),
    vscode.commands.registerCommand('aiSwitcher.tools.reloadWindow', () => runTool('claude', 'reloadWindow', deps)),
    vscode.commands.registerCommand('aiSwitcher.tools.restartExtHost', () => runTool('claude', 'restartExtHost', deps)),
    vscode.commands.registerCommand('aiSwitcher.tools.cliVersions', () => runTool('claude', 'cliVersions', { ...deps, postVersions: undefined })),
    vscode.commands.registerCommand('aiSwitcher.tools.syncRules', async () => {
      const picked = await vscode.window.showQuickPick(
        [
          { label: t('tools.sync.claudeItem'), mode: 'claude' as const },
          { label: t('tools.sync.codexItem'), mode: 'codex' as const },
        ],
        { placeHolder: t('tools.pick.syncRules') },
      );
      if (picked) await runTool(picked.mode, 'syncRules', deps);
    }),
  ];
}
